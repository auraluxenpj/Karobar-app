<?php

namespace App\Services;

use App\Models\Batch;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\Product;
use App\Models\StockAdjustment;
use App\Models\StockAdjustmentItem;
use App\Models\StocktakeItem;
use App\Models\StocktakeSession;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class StocktakeService
{
    // ===== Reference Number =====

    /**
     * Generate next reference number like "ST-202610-001".
     */
    public function generateReferenceNo(): string
    {
        $prefix = 'ST-' . now()->format('Ym') . '-';

        $last = StocktakeSession::where('reference_no', 'like', $prefix . '%')
            ->orderByDesc('id')
            ->value('reference_no');

        $next = 1;
        if ($last && preg_match('/^' . preg_quote($prefix, '/') . '(\d+)$/', $last, $m)) {
            $next = ((int) $m[1]) + 1;
        }

        return $prefix . sprintf('%03d', $next);
    }

    // ===== Session Lifecycle =====

    /**
     * Create a new stocktake session (stays in draft).
     */
    public function createSession(array $data, User $user): StocktakeSession
    {
        return StocktakeSession::create([
            'reference_no' => $data['reference_no'] ?? $this->generateReferenceNo(),
            'session_type' => $data['session_type'],
            'is_blind'     => $data['is_blind'] ?? true,
            'status'       => 'draft',
            'scope_type'   => $data['scope_type'] ?? null,
            'scope_id'     => $data['scope_id'] ?? null,
            'notes'        => $data['notes'] ?? null,
            'user_id'      => $user->id,
        ]);
    }

    /**
     * Snapshot current stock quantities into stocktake_items.
     * Called when transitioning draft → in_progress.
     */
    public function snapshotItems(StocktakeSession $session): void
    {
        // Delete any previous snapshot (allow re-snapshotting)
        $session->items()->delete();

        $products = $this->resolveProducts($session);
        $productIds = $products->pluck('id')->all();
        $batchesCollection = collect();
        foreach (array_chunk($productIds, 500) as $chunkIds) {
            $batchesCollection = $batchesCollection->concat(
                Batch::whereIn('product_id', $chunkIds)->get()
            );
        }
        $batchesByProduct = $batchesCollection->groupBy('product_id');

        $rows = [];
        $now  = now();

        foreach ($products as $product) {
            $batches = $batchesByProduct->get($product->id, collect());

            if ($batches->isNotEmpty()) {
                // One item per batch
                foreach ($batches as $batch) {
                    $rows[] = [
                        'stocktake_session_id' => $session->id,
                        'product_id'           => $product->id,
                        'batch_number'         => $batch->batch_number,
                        'expiry_date'          => $batch->expiry_date,
                        'system_qty'           => (float) ($batch->quantity ?? 0),
                        'counted_qty'          => null,
                        'variance_qty'         => 0,
                        'variance_value'       => 0,
                        'unit_purchase_price'  => (float) ($product->unit_purchase_price ?? 0),
                        'status'               => 'pending',
                        'discrepancy_reason'   => null,
                        'counted_by'           => null,
                        'counted_at'           => null,
                        'created_at'           => $now,
                        'updated_at'           => $now,
                    ];
                }

                // Unbatched pool: product-level qty minus sum of batch qtys
                $batchSum   = $batches->sum('quantity');
                $unbatched  = (float) ($product->quantity ?? 0) - (float) $batchSum;
                if ($unbatched > 0) {
                    $rows[] = [
                        'stocktake_session_id' => $session->id,
                        'product_id'           => $product->id,
                        'batch_number'         => null,
                        'expiry_date'          => null,
                        'system_qty'           => $unbatched,
                        'counted_qty'          => null,
                        'variance_qty'         => 0,
                        'variance_value'       => 0,
                        'unit_purchase_price'  => (float) ($product->unit_purchase_price ?? 0),
                        'status'               => 'pending',
                        'discrepancy_reason'   => null,
                        'counted_by'           => null,
                        'counted_at'           => null,
                        'created_at'           => $now,
                        'updated_at'           => $now,
                    ];
                }
            } else {
                // No batches — single item at product level
                $rows[] = [
                    'stocktake_session_id' => $session->id,
                    'product_id'           => $product->id,
                    'batch_number'         => null,
                    'expiry_date'          => null,
                    'system_qty'           => (float) ($product->quantity ?? 0),
                    'counted_qty'          => null,
                    'variance_qty'         => 0,
                    'variance_value'       => 0,
                    'unit_purchase_price'  => (float) ($product->unit_purchase_price ?? 0),
                    'status'               => 'pending',
                    'discrepancy_reason'   => null,
                    'counted_by'           => null,
                    'counted_at'           => null,
                    'created_at'           => $now,
                    'updated_at'           => $now,
                ];
            }
        }

        // Bulk insert in SQLite-safe chunks (50 rows * 16 columns = 800 variables < 999 limit)
        foreach (array_chunk($rows, 50) as $chunk) {
            StocktakeItem::insert($chunk);
        }
    }

    /**
     * Start the session: draft → in_progress, take snapshot, record started_at.
     */
    public function startSession(StocktakeSession $session): StocktakeSession
    {
        if ($session->status !== 'draft') {
            throw new \RuntimeException("Only draft sessions can be started. Current status: {$session->status}");
        }

        $this->snapshotItems($session);

        $session->update([
            'status'     => 'in_progress',
            'started_at' => now(),
        ]);

        return $session->fresh();
    }

    /**
     * Add an unexpected product / batch discovered on the shelf during an in-progress stocktake.
     */
    public function addItem(
        StocktakeSession $session,
        array $data,
        ?int $userId = null
    ): StocktakeItem {
        if ($session->status !== 'in_progress') {
            throw new \RuntimeException("Items can only be added to in-progress stocktake sessions.");
        }

        $product = Product::findOrFail((int) $data['product_id']);
        $batchNumber = isset($data['batch_number']) && trim((string) $data['batch_number']) !== ''
            ? trim((string) $data['batch_number'])
            : null;
        $expiryDate = !empty($data['expiry_date']) ? $data['expiry_date'] : null;

        // Check if this product + batch already exists in the session
        $existingQuery = $session->items()->where('product_id', $product->id);
        if ($batchNumber !== null) {
            $existingQuery->where('batch_number', $batchNumber);
        } else {
            $existingQuery->whereNull('batch_number');
        }
        $existing = $existingQuery->first();

        if ($existing) {
            if (array_key_exists('counted_qty', $data) && $data['counted_qty'] !== null && $data['counted_qty'] !== '') {
                return $this->recordCount(
                    $existing,
                    (float) $data['counted_qty'],
                    $data['discrepancy_reason'] ?? $existing->discrepancy_reason,
                    $userId
                );
            }
            return $existing->fresh();
        }

        $systemQty = 0.0;
        if ($batchNumber !== null) {
            $batch = Batch::where('product_id', $product->id)
                ->where('batch_number', $batchNumber)
                ->first();
            $systemQty = $batch ? (float) ($batch->quantity ?? 0) : 0.0;
            if (!$expiryDate && $batch) {
                $expiryDate = $batch->expiry_date;
            }
        } else {
            $systemQty = (float) ($product->quantity ?? 0);
        }

        $item = StocktakeItem::create([
            'stocktake_session_id' => $session->id,
            'product_id'           => $product->id,
            'batch_number'         => $batchNumber,
            'expiry_date'          => $expiryDate,
            'system_qty'           => $systemQty,
            'counted_qty'          => null,
            'variance_qty'         => 0,
            'variance_value'       => 0,
            'unit_purchase_price'  => (float) ($product->unit_purchase_price ?? 0),
            'status'               => 'pending',
            'discrepancy_reason'   => $data['discrepancy_reason'] ?? null,
            'counted_by'           => null,
            'counted_at'           => null,
        ]);

        if (array_key_exists('counted_qty', $data) && $data['counted_qty'] !== null && $data['counted_qty'] !== '') {
            return $this->recordCount(
                $item,
                (float) $data['counted_qty'],
                $data['discrepancy_reason'] ?? 'Unexpected stock found during count',
                $userId
            );
        }

        return $item->fresh();
    }

    /**
     * Record a physical count for one item.
     */
    public function recordCount(
        StocktakeItem $item,
        float $countedQty,
        ?string $reason,
        ?int $userId
    ): StocktakeItem {
        $session = $item->session;
        if ($session && !in_array($session->status, ['in_progress', 'pending_review'], true)) {
            throw new \RuntimeException("Counts cannot be recorded for a session with status: {$session->status}");
        }

        $varianceQty   = $countedQty - $item->system_qty;
        $varianceValue = abs($varianceQty) * $item->unit_purchase_price;

        $item->update([
            'counted_qty'        => $countedQty,
            'variance_qty'       => $varianceQty,
            'variance_value'     => $varianceValue,
            'status'             => 'counted',
            'discrepancy_reason' => $reason,
            'counted_by'         => $userId,
            'counted_at'         => now(),
        ]);

        return $item->fresh();
    }

    /**
     * Move session to pending_review. All items must be counted first.
     */
    public function submitForReview(StocktakeSession $session): StocktakeSession
    {
        if ($session->status !== 'in_progress') {
            throw new \RuntimeException("Only in-progress sessions can be submitted for review.");
        }

        $pendingCount = $session->items()->where('status', 'pending')->count();
        if ($pendingCount > 0) {
            throw new \RuntimeException("All items must be counted before submitting for review. {$pendingCount} item(s) still pending.");
        }

        $session->update(['status' => 'pending_review']);

        return $session->fresh();
    }

    /**
     * Finalize the session: apply stock adjustments and mark as finalized.
     */
    public function finalizeSession(StocktakeSession $session, User $user): StocktakeSession
    {
        if ($session->status !== 'pending_review') {
            throw new \RuntimeException("Only sessions in pending_review can be finalized.");
        }

        $pendingCount = $session->items()->where('status', 'pending')->count();
        if ($pendingCount > 0) {
            throw new \RuntimeException("All items must be counted before finalizing. {$pendingCount} item(s) still pending.");
        }

        return DB::transaction(function () use ($session, $user) {
            // 1. Create the StockAdjustment header
            $adj = StockAdjustment::create([
                'posted_number' => 'STOCKTAKE-' . $session->reference_no,
                'posted_date'   => now()->toDateString(),
                'note'          => "Stocktake finalization for session {$session->reference_no}",
                'total_worth'   => 0,
                'user_id'       => $user->id,
            ]);

            $totalWorth      = 0.0;
            $touchedProducts = [];

            $items = $session->items()->with('product')->get();

            foreach ($items as $item) {
                /** @var Product $product */
                $product = Product::lockForUpdate()->findOrFail($item->product_id);

                $batch = null;
                if ($item->batch_number) {
                    $batch = Batch::lockForUpdate()
                        ->where('product_id', $item->product_id)
                        ->where('batch_number', $item->batch_number)
                        ->first();
                    $liveSystemQty = $batch ? (float) ($batch->quantity ?? 0) : 0.0;
                } else {
                    $batchSum = (float) Batch::where('product_id', $item->product_id)->sum(DB::raw('COALESCE(quantity, 0)'));
                    $hasBatchedSessionItem = $items->contains(fn ($it) => (int) $it->product_id === (int) $item->product_id && !empty($it->batch_number));
                    $liveSystemQty = $hasBatchedSessionItem
                        ? max(0.0, (float) ($product->quantity ?? 0) - $batchSum)
                        : (float) ($product->quantity ?? 0);
                }

                $countedQty = (float) ($item->counted_qty ?? $liveSystemQty);
                $liveVarianceQty = $countedQty - $liveSystemQty;

                // Refresh item's system_qty and variance_qty if live stock changed since snapshot
                if (abs($liveSystemQty - (float) $item->system_qty) > 0.0001 || abs($liveVarianceQty - (float) $item->variance_qty) > 0.0001) {
                    $unitCostForItem = $item->unit_purchase_price ?: (float) ($product->unit_purchase_price ?? 0);
                    $item->update([
                        'system_qty'     => $liveSystemQty,
                        'variance_qty'   => $liveVarianceQty,
                        'variance_value' => abs($liveVarianceQty) * $unitCostForItem,
                    ]);
                }

                // Only process items with a non-zero variance
                if ($liveVarianceQty == 0) {
                    continue;
                }

                $unitCost = $item->unit_purchase_price ?: (float) ($product->unit_purchase_price ?? 0);
                $worth    = abs($liveVarianceQty) * $unitCost;

                // Create StockAdjustmentItem record
                StockAdjustmentItem::create([
                    'stock_adjustment_id' => $adj->id,
                    'product_id'          => $item->product_id,
                    'batch_number'        => $item->batch_number,
                    'expiry'              => $item->expiry_date,
                    'pack_size'           => null,
                    'previous_qty'        => $liveSystemQty,
                    'actual_qty'          => $countedQty,
                    'diff_qty'            => $liveVarianceQty,
                    'unit_purchase_price' => $unitCost,
                    'worth_adjusted'      => $worth,
                ]);

                $totalWorth += $worth;

                // Apply stock change
                if ($item->batch_number) {
                    if ($batch) {
                        $batch->quantity = max(0, $countedQty);
                        if (!$batch->expiry_date && $item->expiry_date) {
                            $batch->expiry_date = $item->expiry_date;
                        }
                        $batch->save();
                    } elseif ($countedQty > 0) {
                        Batch::create([
                            'product_id'   => $item->product_id,
                            'batch_number' => $item->batch_number,
                            'expiry_date'  => $item->expiry_date,
                            'quantity'     => max(0, $countedQty),
                        ]);
                    }
                    $product->quantity = max(0, (float) ($product->quantity ?? 0) + $liveVarianceQty);
                    $product->save();
                } else {
                    $product->quantity = max(0, (float) ($product->quantity ?? 0) + $liveVarianceQty);
                    // If qty hits zero, reset avg_price and margins
                    if ($product->quantity <= 0) {
                        $product->avg_price         = 0;
                        $product->margin            = 0;
                        $product->whole_sale_margin = 0;
                    }
                    $product->save();
                }

                $touchedProducts[$product->id] = true;
            }

            // Sync product-level qty from batch sums for touched pure-batched products
            foreach (array_keys($touchedProducts) as $pid) {
                /** @var Product $p */
                $p          = Product::lockForUpdate()->findOrFail($pid);
                $batchCount = Batch::where('product_id', $pid)->count();
                $hasUnbatchedSessionItem = $items->contains(fn ($it) => (int) $it->product_id === (int) $pid && empty($it->batch_number));
                if ($batchCount > 0 && !$hasUnbatchedSessionItem) {
                    $this->setProductQty($p, $this->sumBatches($p));
                }
            }

            // Update StockAdjustment total
            $adj->update(['total_worth' => $totalWorth]);
            $adj->load('items.product');

            // Record audit trail for generated stock adjustment
            app(DocumentAuditService::class)->recordCreate(
                $adj,
                $user,
                "Stocktake finalization for session {$session->reference_no}"
            );

            // Post non-cash P&L Shrinkage Write-Off expense if net variance value is negative (shortage)
            if (Schema::hasTable('expenses') && Schema::hasTable('expense_categories')) {
                $netSignedValue = 0.0;
                foreach ($adj->items as $adjItem) {
                    $netSignedValue += ((float) $adjItem->diff_qty * (float) $adjItem->unit_purchase_price);
                }
                if ($netSignedValue < -0.005) {
                    $lossAmount = round(abs($netSignedValue), 2);
                    $category = ExpenseCategory::firstOrCreate(
                        ['code' => 'stock_shrinkage_writeoff'],
                        [
                            'name'        => 'Inventory Shrinkage & Count Variance Write-Off',
                            'description' => 'Non-cash P&L write-off for inventory count shortages and stock adjustments',
                            'is_active'   => true,
                        ]
                    );
                    $dateStr = now()->toDateString();
                    Expense::create([
                        'expense_number'         => Expense::generateExpenseNumber($dateStr),
                        'expense_category_id'    => $category->id,
                        'account_id'             => null,
                        'user_id'                => $user->id,
                        'cash_drawer_session_id' => null,
                        'amount'                 => $lossAmount,
                        'date'                   => $dateStr,
                        'payment_method'         => 'other',
                        'reference_number'       => $adj->posted_number,
                        'payee'                  => 'Stocktake Variance Write-Off',
                        'description'            => "Stocktake {$session->reference_no} Shrinkage Write-Off ({$adj->posted_number})",
                        'is_recurring'           => false,
                    ]);
                }
            }

            // Mark session as finalized
            $session->update([
                'status'              => 'finalized',
                'completed_at'        => now(),
                'stock_adjustment_id' => $adj->id,
            ]);

            return $session->fresh(['stockAdjustment:id,posted_number']);
        });
    }

    /**
     * Cancel a session (draft or in_progress only).
     */
    public function cancelSession(StocktakeSession $session): StocktakeSession
    {
        if (!in_array($session->status, ['draft', 'in_progress'])) {
            throw new \RuntimeException("Only draft or in-progress sessions can be cancelled. Current status: {$session->status}");
        }

        $session->update(['status' => 'cancelled']);

        return $session->fresh();
    }

    // ===== Private Helpers =====

    /**
     * Resolve the set of products to snapshot based on session scope.
     *
     * @return \Illuminate\Database\Eloquent\Collection<Product>
     */
    private function resolveProducts(StocktakeSession $session)
    {
        $query = Product::query();

        if ($session->session_type !== 'full') {
            // Cycle count — filter by scope
            switch ($session->scope_type) {
                case 'category':
                    $query->where('category_id', $session->scope_id);
                    break;
                case 'brand':
                    $query->where('brand_id', $session->scope_id);
                    break;
                case 'supplier':
                    $query->where('supplier_id', $session->scope_id);
                    break;
            }
        }

        return $query->get();
    }

    /**
     * Read the authoritative stock qty for a product.
     */
    private function getProductQty(Product $p): float
    {
        return (float) ($p->available_units ?? $p->quantity_on_hand ?? $p->quantity ?? 0);
    }

    /**
     * Set the authoritative stock qty for a product and save.
     */
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

    /**
     * Sum all batch quantities for a product.
     */
    private function sumBatches(Product $p): float
    {
        return (float) Batch::where('product_id', $p->id)
            ->sum(DB::raw('COALESCE(quantity, 0)'));
    }
}
