<?php

namespace App\Services;

use App\Models\Batch;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\Product;
use App\Models\StockAdjustment;
use App\Models\StockAdjustmentItem;
use App\Models\StockDisposal;
use App\Models\StockDisposalItem;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class StockDisposalService
{
    /**
     * Generate sequential disposal voucher number (e.g. DSP-202610-0001).
     */
    public function generateDisposalNumber(?string $dateStr = null): string
    {
        $d = $dateStr ? Carbon::parse($dateStr) : now();
        $prefix = 'DSP-' . $d->format('Ym') . '-';

        $last = StockDisposal::where('disposal_number', 'like', $prefix . '%')
            ->orderByDesc('id')
            ->value('disposal_number');

        $next = 1;
        if ($last && preg_match('/^' . preg_quote($prefix, '/') . '(\d+)$/', $last, $m)) {
            $next = ((int) $m[1]) + 1;
        }

        return $prefix . sprintf('%04d', $next);
    }

    /**
     * Create a new Quarantine or Direct Disposal voucher.
     */
    public function createDisposal(array $data, User $user): StockDisposal
    {
        return DB::transaction(function () use ($data, $user) {
            $status = in_array($data['status'] ?? '', ['quarantined', 'disposed'], true)
                ? $data['status']
                : StockDisposal::STATUS_QUARANTINED;

            $disposalDate = $data['disposal_date'] ?? now()->toDateString();
            $disposalNumber = !empty($data['disposal_number'])
                ? trim($data['disposal_number'])
                : $this->generateDisposalNumber($disposalDate);

            if (StockDisposal::where('disposal_number', $disposalNumber)->exists()) {
                $disposalNumber = $this->generateDisposalNumber($disposalDate);
            }

            $cause = $data['cause'] ?? 'shelf_expiry';
            $disposalMethod = $data['disposal_method'] ?? ($status === 'quarantined' ? 'quarantine_holding' : 'incineration');
            $recordExpense = array_key_exists('record_expense', $data) ? (bool) $data['record_expense'] : true;

            $preparedItems = [];
            $hasNarcotics = false;
            $totalQty = 0.0;
            $totalCostValue = 0.0;
            $totalRetailValue = 0.0;
            $touchedProducts = [];

            foreach ($data['items'] as $idx => $row) {
                $disposeQty = (float) ($row['dispose_qty'] ?? 0);
                if ($disposeQty <= 0) {
                    throw ValidationException::withMessages([
                        "items.{$idx}.dispose_qty" => 'Disposal quantity must be greater than zero.',
                    ]);
                }

                /** @var Product $product */
                $product = Product::query()->lockForUpdate()->findOrFail($row['product_id']);

                if ($this->isProductNarcotic($product)) {
                    $hasNarcotics = true;
                }

                $batch = null;
                $batchNumber = isset($row['batch_number']) && trim((string) $row['batch_number']) !== ''
                    ? trim((string) $row['batch_number'])
                    : null;

                if (!empty($row['batch_id'])) {
                    $batch = Batch::query()->lockForUpdate()
                        ->where('product_id', $product->id)
                        ->find($row['batch_id']);
                } elseif ($batchNumber !== null) {
                    $batch = Batch::query()->lockForUpdate()
                        ->where('product_id', $product->id)
                        ->where('batch_number', $batchNumber)
                        ->first();
                }

                if ($batch) {
                    $previousQty = (float) ($batch->quantity ?? 0);
                    if ($disposeQty > $previousQty) {
                        throw ValidationException::withMessages([
                            "items.{$idx}.dispose_qty" => "Insufficient stock in batch '{$batch->batch_number}' for '{$product->name}'. Available: {$previousQty}, requested: {$disposeQty}.",
                        ]);
                    }
                    $remainingQty = max(0.0, $previousQty - $disposeQty);
                    $batchNumber = $batch->batch_number;
                    $expiryDate = $batch->expiry_date;
                } else {
                    $previousQty = $this->getProductQty($product);
                    $totalBatchQty = $this->sumBatches($product);
                    $unbatchedAvailable = $totalBatchQty > 0 ? max(0.0, $previousQty - $totalBatchQty) : $previousQty;
                    if ($disposeQty > $unbatchedAvailable) {
                        throw ValidationException::withMessages([
                            "items.{$idx}.dispose_qty" => $totalBatchQty > 0
                                ? "Insufficient unbatched stock for '{$product->name}' (unbatched available: {$unbatchedAvailable}, batched stock: {$totalBatchQty}). Please select a specific batch to dispose."
                                : "Insufficient stock for '{$product->name}'. Available: {$previousQty}, requested: {$disposeQty}.",
                        ]);
                    }
                    $remainingQty = max(0.0, $previousQty - $disposeQty);
                    $expiryDate = $row['expiry_date'] ?? null;
                }

                $packSize = max(1, (int) ($row['pack_size'] ?? $product->pack_size ?? 1));
                $unitCost = isset($row['unit_purchase_price']) && $row['unit_purchase_price'] !== ''
                    ? (float) $row['unit_purchase_price']
                    : $this->resolveProductUnitCost($product);
                $unitSale = (float) ($product->unit_sale_price ?? 0);

                $costValue = round($disposeQty * $unitCost, 2);
                $retailValue = round($disposeQty * $unitSale, 2);

                $totalQty += $disposeQty;
                $totalCostValue += $costValue;
                $totalRetailValue += $retailValue;

                $preparedItems[] = [
                    'product'             => $product,
                    'batch'               => $batch,
                    'batch_id'            => $batch?->id,
                    'batch_number'        => $batchNumber,
                    'expiry_date'         => $expiryDate,
                    'pack_size'           => $packSize,
                    'previous_qty'        => $previousQty,
                    'dispose_qty'         => $disposeQty,
                    'remaining_qty'       => $remainingQty,
                    'unit_purchase_price' => round($unitCost, 2),
                    'unit_sale_price'     => round($unitSale, 2),
                    'cost_value'          => $costValue,
                    'retail_value'        => $retailValue,
                    'item_note'           => $row['item_note'] ?? null,
                ];
            }

            // Enforce witness requirement when directly disposing narcotic products
            if ($status === StockDisposal::STATUS_DISPOSED && $hasNarcotics && empty(trim((string) ($data['witness_name'] ?? '')))) {
                throw ValidationException::withMessages([
                    'witness_name' => 'A witness name (Pharmacist / Supervisor) is mandatory when disposing controlled or narcotic products.',
                ]);
            }

            $causeLabel = StockDisposal::CAUSES[$cause] ?? $cause;
            $methodLabel = StockDisposal::METHODS[$disposalMethod] ?? $disposalMethod;
            $adjNotePrefix = $status === StockDisposal::STATUS_DISPOSED
                ? "[Stock Disposal {$disposalNumber} - {$causeLabel} via {$methodLabel}]"
                : "[Quarantine Hold {$disposalNumber} - {$causeLabel}]";

            // 1. Create linked StockAdjustment header so product movement reports reflect the deduction
            $adj = StockAdjustment::create([
                'posted_number' => $disposalNumber,
                'posted_date'   => $disposalDate,
                'note'          => trim($adjNotePrefix . (!empty($data['notes']) ? ' ' . $data['notes'] : '')),
                'total_worth'   => round($totalCostValue, 2),
                'user_id'       => $user->id,
            ]);

            // 2. Create StockDisposal header
            $disposal = StockDisposal::create([
                'disposal_number'     => $disposalNumber,
                'disposal_date'       => $disposalDate,
                'status'              => $status,
                'cause'               => $cause,
                'disposal_method'     => $disposalMethod,
                'reference_no'        => $data['reference_no'] ?? null,
                'witness_name'        => $data['witness_name'] ?? null,
                'witness_designation' => $data['witness_designation'] ?? null,
                'notes'               => $data['notes'] ?? null,
                'total_qty'           => round($totalQty, 2),
                'total_cost_value'    => round($totalCostValue, 2),
                'total_retail_value'  => round($totalRetailValue, 2),
                'has_narcotics'       => $hasNarcotics,
                'record_expense'      => $recordExpense,
                'stock_adjustment_id' => $adj->id,
                'expense_id'          => null,
                'created_by'          => $user->id,
                'disposed_by'         => $status === StockDisposal::STATUS_DISPOSED ? $user->id : null,
                'disposed_at'         => $status === StockDisposal::STATUS_DISPOSED ? now() : null,
            ]);

            // 3. Apply stock deductions and create items
            foreach ($preparedItems as $pItem) {
                /** @var Product $product */
                $product = $pItem['product'];
                /** @var Batch|null $batch */
                $batch = $pItem['batch'];

                StockDisposalItem::create([
                    'stock_disposal_id'   => $disposal->id,
                    'product_id'          => $product->id,
                    'batch_id'            => $pItem['batch_id'],
                    'batch_number'        => $pItem['batch_number'],
                    'expiry_date'         => $pItem['expiry_date'],
                    'pack_size'           => $pItem['pack_size'],
                    'previous_qty'        => $pItem['previous_qty'],
                    'dispose_qty'         => $pItem['dispose_qty'],
                    'remaining_qty'       => $pItem['remaining_qty'],
                    'unit_purchase_price' => $pItem['unit_purchase_price'],
                    'unit_sale_price'     => $pItem['unit_sale_price'],
                    'cost_value'          => $pItem['cost_value'],
                    'retail_value'        => $pItem['retail_value'],
                    'item_note'           => $pItem['item_note'],
                ]);

                StockAdjustmentItem::create([
                    'stock_adjustment_id' => $adj->id,
                    'product_id'          => $product->id,
                    'batch_number'        => $pItem['batch_number'],
                    'expiry'              => $pItem['expiry_date'],
                    'pack_size'           => $pItem['pack_size'],
                    'previous_qty'        => $pItem['previous_qty'],
                    'actual_qty'          => $pItem['remaining_qty'],
                    'diff_qty'            => -$pItem['dispose_qty'],
                    'unit_purchase_price' => $pItem['unit_purchase_price'],
                    'worth_adjusted'      => $pItem['cost_value'],
                ]);

                if ($batch) {
                    $batch->quantity = $pItem['remaining_qty'];
                    $batch->save();
                } else {
                    $this->setProductQty($product, $pItem['remaining_qty']);
                }

                $touchedProducts[$product->id] = true;
            }

            // Sync product-level stock from batch sums where all disposed items for that product were batch-tracked
            foreach (array_keys($touchedProducts) as $pid) {
                /** @var Product $p */
                $p = Product::query()->lockForUpdate()->findOrFail($pid);
                $batchCount = Batch::where('product_id', $pid)->count();
                $hasUnbatchedItem = collect($preparedItems)->contains(fn ($it) => (int) $it['product']->id === (int) $pid && $it['batch'] === null);
                if ($batchCount > 0 && !$hasUnbatchedItem) {
                    $this->setProductQty($p, $this->sumBatches($p));
                }
            }

            // 4. If created directly as 'disposed' and record_expense is true, post non-cash P&L write-off
            if ($status === StockDisposal::STATUS_DISPOSED && $recordExpense && $disposal->total_cost_value > 0) {
                $expense = $this->createNonCashWriteOffExpense($disposal, $user);
                $disposal->update(['expense_id' => $expense->id]);
            }

            return $disposal->load([
                'items.product',
                'creator:id,name',
                'disposer:id,name',
                'restorer:id,name',
                'expense',
                'stockAdjustment',
            ]);
        });
    }

    /**
     * Finalize a Quarantined voucher into Disposed status and record P&L write-off.
     */
    public function finalizeDisposal(StockDisposal $disposal, array $data, User $user): StockDisposal
    {
        if ($disposal->status !== StockDisposal::STATUS_QUARANTINED) {
            throw ValidationException::withMessages([
                'status' => "Only quarantined vouchers can be finalized for disposal. Current status: {$disposal->status}.",
            ]);
        }

        return DB::transaction(function () use ($disposal, $data, $user) {
            $disposalMethod = $data['disposal_method'] ?? $disposal->disposal_method;
            if ($disposalMethod === 'quarantine_holding') {
                $disposalMethod = 'incineration';
            }

            $witnessName = array_key_exists('witness_name', $data)
                ? trim((string) $data['witness_name'])
                : $disposal->witness_name;
            $witnessDesignation = array_key_exists('witness_designation', $data)
                ? trim((string) $data['witness_designation'])
                : $disposal->witness_designation;
            $recordExpense = array_key_exists('record_expense', $data)
                ? (bool) $data['record_expense']
                : $disposal->record_expense;

            if ($disposal->has_narcotics && empty($witnessName)) {
                throw ValidationException::withMessages([
                    'witness_name' => 'A witness name (Pharmacist / Supervisor) is mandatory when disposing controlled or narcotic products.',
                ]);
            }

            $notes = array_key_exists('notes', $data) && $data['notes'] !== null
                ? $data['notes']
                : $disposal->notes;

            $disposal->update([
                'status'              => StockDisposal::STATUS_DISPOSED,
                'disposal_method'     => $disposalMethod,
                'witness_name'        => $witnessName ?: null,
                'witness_designation' => $witnessDesignation ?: null,
                'notes'               => $notes,
                'record_expense'      => $recordExpense,
                'disposed_by'         => $user->id,
                'disposed_at'         => now(),
            ]);

            // Update linked StockAdjustment note
            if ($disposal->stock_adjustment_id) {
                $adj = StockAdjustment::find($disposal->stock_adjustment_id);
                if ($adj) {
                    $causeLabel = $disposal->cause_label;
                    $methodLabel = $disposal->disposal_method_label;
                    $adj->update([
                        'note' => trim("[Stock Disposal {$disposal->disposal_number} - {$causeLabel} via {$methodLabel}] " . ($notes ?? '')),
                    ]);
                }
            }

            // Create P&L non-cash write-off expense if enabled
            if ($recordExpense && $disposal->total_cost_value > 0 && !$disposal->expense_id) {
                $expense = $this->createNonCashWriteOffExpense($disposal, $user);
                $disposal->update(['expense_id' => $expense->id]);
            }

            return $disposal->fresh([
                'items.product',
                'creator:id,name',
                'disposer:id,name',
                'restorer:id,name',
                'expense',
                'stockAdjustment',
            ]);
        });
    }

    /**
     * Restore a Quarantined voucher back to sellable stock.
     */
    public function restoreFromQuarantine(StockDisposal $disposal, ?string $reason, User $user): StockDisposal
    {
        if ($disposal->status !== StockDisposal::STATUS_QUARANTINED) {
            throw ValidationException::withMessages([
                'status' => "Only quarantined vouchers can be restored to stock. Current status: {$disposal->status}.",
            ]);
        }

        return DB::transaction(function () use ($disposal, $reason, $user) {
            $disposal->load('items');
            $touchedProducts = [];

            foreach ($disposal->items as $item) {
                /** @var Product $product */
                $product = Product::query()->lockForUpdate()->findOrFail($item->product_id);

                $batch = null;
                if ($item->batch_id) {
                    $batch = Batch::query()->lockForUpdate()
                        ->where('product_id', $product->id)
                        ->find($item->batch_id);
                } elseif ($item->batch_number) {
                    $batch = Batch::query()->lockForUpdate()
                        ->where('product_id', $product->id)
                        ->where('batch_number', $item->batch_number)
                        ->first();
                }

                if ($batch) {
                    $batch->quantity = (float) ($batch->quantity ?? 0) + (float) $item->dispose_qty;
                    $batch->save();
                } else {
                    $this->setProductQty($product, $this->getProductQty($product) + (float) $item->dispose_qty);
                }

                $touchedProducts[$product->id] = true;
            }

            foreach (array_keys($touchedProducts) as $pid) {
                /** @var Product $p */
                $p = Product::query()->lockForUpdate()->findOrFail($pid);
                $batchCount = Batch::where('product_id', $pid)->count();
                $hasUnbatchedRestore = $disposal->items->contains(fn ($it) => (int) $it->product_id === (int) $pid && empty($it->batch_id) && empty($it->batch_number));
                if ($batchCount > 0 && !$hasUnbatchedRestore) {
                    $this->setProductQty($p, $this->sumBatches($p));
                }
            }

            // Remove the linked StockAdjustment so stock adjustment reports reflect restoration
            if ($disposal->stock_adjustment_id) {
                $adj = StockAdjustment::find($disposal->stock_adjustment_id);
                if ($adj) {
                    $adj->items()->delete();
                    $adj->delete();
                }
            }

            $updatedNotes = $disposal->notes;
            if (!empty($reason)) {
                $updatedNotes = trim(($updatedNotes ? $updatedNotes . "\n" : '') . "[Restored to Shelf: {$reason}]");
            }

            $disposal->update([
                'status'              => StockDisposal::STATUS_RESTORED,
                'stock_adjustment_id' => null,
                'restored_by'         => $user->id,
                'restored_at'         => now(),
                'notes'               => $updatedNotes,
            ]);

            return $disposal->fresh([
                'items.product',
                'creator:id,name',
                'disposer:id,name',
                'restorer:id,name',
                'expense',
                'stockAdjustment',
            ]);
        });
    }

    /**
     * Create a non-cash P&L Expense under "Stock Expiry, Damage & Scrap Write-Off".
     * Uses payment_method = 'other' and account_id = null so Cash Drawer and Bank Accounts are untouched.
     */
    private function createNonCashWriteOffExpense(StockDisposal $disposal, User $user): Expense
    {
        $category = ExpenseCategory::firstOrCreate(
            ['code' => 'stock_disposal_writeoff'],
            [
                'name'        => 'Stock Expiry, Damage & Scrap Write-Off',
                'description' => 'Non-cash P&L write-off for expired, broken, spoiled, or recalled inventory disposed from stock',
                'is_active'   => true,
            ]
        );

        $dateStr = $disposal->disposal_date instanceof Carbon
            ? $disposal->disposal_date->toDateString()
            : Carbon::parse($disposal->disposal_date)->toDateString();

        $expenseNumber = Expense::generateExpenseNumber($dateStr);
        $causeLabel = $disposal->cause_label;
        $methodLabel = $disposal->disposal_method_label;

        return Expense::create([
            'expense_number'         => $expenseNumber,
            'expense_category_id'    => $category->id,
            'account_id'             => null,
            'user_id'                => $user->id,
            'cash_drawer_session_id' => null,
            'amount'                 => round((float) $disposal->total_cost_value, 2),
            'date'                   => $dateStr,
            'payment_method'         => 'other',
            'reference_number'       => $disposal->disposal_number,
            'payee'                  => $disposal->witness_name ?: 'Inventory Write-Off',
            'description'            => "Stock Disposal {$disposal->disposal_number} ({$causeLabel} via {$methodLabel})" . ($disposal->notes ? " — {$disposal->notes}" : ''),
            'is_recurring'           => false,
        ]);
    }

    private function isProductNarcotic(Product $product): bool
    {
        return in_array(strtolower((string) ($product->narcotic ?? 'no')), ['yes', '1', 'true'], true);
    }

    private function resolveProductUnitCost(Product $product): float
    {
        $unitCost = (float) ($product->unit_purchase_price ?? 0);
        if ($unitCost <= 0 && !empty($product->avg_price)) {
            $unitCost = (float) $product->avg_price;
        }
        if ($unitCost <= 0 && !empty($product->pack_purchase_price)) {
            $packSize = max(1, (int) ($product->pack_size ?? 1));
            $unitCost = (float) $product->pack_purchase_price / $packSize;
        }
        return round(max(0.0, $unitCost), 2);
    }

    private function getProductQty(Product $p): float
    {
        return (float) ($p->available_units ?? $p->quantity_on_hand ?? $p->quantity ?? 0);
    }

    private function setProductQty(Product $p, float $qty): void
    {
        if ($p->offsetExists('available_units')) {
            $p->available_units = $qty;
        } elseif ($p->offsetExists('quantity_on_hand')) {
            $p->quantity_on_hand = $qty;
        } else {
            $p->quantity = $qty;
        }

        if ($qty <= 0) {
            $p->avg_price         = 0;
            $p->margin            = 0;
            $p->whole_sale_margin = 0;
        }

        $p->save();
    }

    private function sumBatches(Product $p): float
    {
        return (float) Batch::where('product_id', $p->id)
            ->sum(DB::raw('COALESCE(quantity, 0)'));
    }
}

