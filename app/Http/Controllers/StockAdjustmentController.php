<?php

namespace App\Http\Controllers;

use App\Models\Batch;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\Product;
use App\Models\StockAdjustment;
use App\Models\StockAdjustmentItem;
use App\Services\DocumentAuditService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;

class StockAdjustmentController extends Controller
{
    // ===== Helpers to read/set product stock column consistently =====
    protected function getProductQty(Product $p): float
    {
        return (float) ($p->available_units ?? $p->quantity_on_hand ?? $p->quantity ?? 0);
    }

    protected function setProductQty(Product $p, float $qty): void
    {
        if ($p->offsetExists('available_units')) {
            $p->available_units = $qty;
        } elseif ($p->offsetExists('quantity_on_hand')) {
            $p->quantity_on_hand = $qty;
        } else {
            $p->quantity = $qty;
        }

        // If stock becomes zero, reset average price and margins
        // This ensures moving average resets when all stock is removed
        if ($qty <= 0) {
            $p->avg_price = 0;
            $p->margin = 0;
            $p->whole_sale_margin = 0;
        }

        $p->save();
    }

    protected function addProductQty(Product $p, float $delta): void
    {
        $current = $this->getProductQty($p);
        $this->setProductQty($p, $current + $delta);
    }

    protected function sumBatches(Product $p): float
    {
        // Sum all batches for product to keep product-level stock in sync
        return (float) Batch::where('product_id', $p->id)->sum(DB::raw('COALESCE(quantity, 0)'));
    }

    protected function addBatchQty(Batch $batch, float $delta): void
    {
        $batch->quantity = (float)($batch->quantity ?? 0) + $delta;
        $batch->save();
    }

    // ===== Endpoints =====

    public function index(Request $request)
    {
        // list
        $this->authorize('viewAny', StockAdjustment::class);

        $q = trim((string)$request->get('q'));
        $per = (int)($request->get('per_page', 50));

        $with = ['user:id,name'];
        if (Schema::hasTable('stocktake_sessions')) {
            $with[] = 'stocktakeSession:id,reference_no,session_type,status,stock_adjustment_id';
        }
        if (Schema::hasTable('stock_disposals')) {
            $with[] = 'stockDisposal:id,disposal_number,status,cause,stock_adjustment_id';
        }
        if (Schema::hasTable('expenses')) {
            $with[] = 'expense:id,expense_number,reference_number,amount,date';
        }

        $query = StockAdjustment::query()
            ->with($with)
            ->withCount('items')
            ->when($q !== '', fn($qq) =>
                $qq->where('posted_number','like',"%{$q}%")
                   ->orWhere('note','like',"%{$q}%")
            )
            ->orderByDesc('id');

        return $query->paginate($per);
    }

    public function show($id)
    {
        $with = ['items.product', 'user:id,name,email'];
        if (Schema::hasTable('stocktake_sessions')) {
            $with[] = 'stocktakeSession:id,reference_no,session_type,status,completed_at,stock_adjustment_id';
        }
        if (Schema::hasTable('stock_disposals')) {
            $with[] = 'stockDisposal:id,disposal_number,status,cause,disposal_method,stock_adjustment_id';
        }
        if (Schema::hasTable('expenses')) {
            $with[] = 'expense:id,expense_number,reference_number,amount,date';
        }

        $adj = StockAdjustment::with($with)->findOrFail($id);
        // view instance
        $this->authorize('view', $adj);
        return $adj;
    }

    public function newCode()
    {
        // require create (same pattern as SaleInvoice::generateNewCode)
        $this->authorize('create', StockAdjustment::class);

        $prefix = 'STADJ-';
        $last = StockAdjustment::where('posted_number','like',$prefix.'%')
            ->orderByDesc('id')
            ->value('posted_number');

        $next = 1;
        if ($last && preg_match('/^'.preg_quote($prefix,'/').'([0-9]+)$/',$last,$m)) {
            $next = ((int)$m[1]) + 1;
        }
        return response()->json(['posted_number' => sprintf($prefix.'%05d', $next)]);
    }

    public function store(Request $request)
    {
        // create
        $this->authorize('create', StockAdjustment::class);

        $data = $this->validatePayload($request);

        return DB::transaction(function () use ($data, $request) {
            $adj = StockAdjustment::create([
                'posted_number' => $data['posted_number'],
                'posted_date'   => $data['posted_date'],
                'note'          => $data['note'],
                'total_worth'   => 0,
                'user_id'       => optional($request->user())->id,
            ]);

            $totalWorth = 0.0;
            $touchedProducts = [];

            foreach ($data['items'] as $row) {
                /** @var Product $product */
                $product = Product::query()->lockForUpdate()->findOrFail($row['product_id']);

                $useBatch = isset($row['batch_number']) && $row['batch_number'] !== null && $row['batch_number'] !== '';

                if ($useBatch) {
                    /** @var Batch $batch */
                    $batch = Batch::query()->lockForUpdate()
                        ->where('product_id', $product->id)
                        ->where('batch_number', $row['batch_number'])
                        ->first();

                    if (!$batch) {
                        // create batch if adjusting a new batch code
                        $batch = new Batch();
                        $batch->product_id = $product->id;
                        $batch->batch_number = $row['batch_number'];
                        $batch->expiry_date = $row['expiry'] ?? null;
                        $batch->quantity = 0;
                    }

                    $previous = (float)($batch->quantity ?? 0);
                    $actual   = (float)$row['actual_qty'];
                    $diff     = $actual - $previous;

                    $unitCost = (float)($row['unit_purchase_price'] ?? $product->unit_purchase_price ?? 0);
                    $worth    = abs($diff) * $unitCost;

                    StockAdjustmentItem::create([
                        'stock_adjustment_id' => $adj->id,
                        'product_id'          => $product->id,
                        'batch_number'        => $row['batch_number'],
                        'expiry'              => $row['expiry'] ?? null,
                        'pack_size'           => $row['pack_size'] ?? null,
                        'previous_qty'        => $previous,
                        'actual_qty'          => $actual,
                        'diff_qty'            => $diff,
                        'unit_purchase_price' => $unitCost,
                        'worth_adjusted'      => $worth,
                    ]);

                    $totalWorth += $worth;

                    // Apply to batch
                    $batch->quantity = $actual;
                    $batch->save();

                } else {
                    // Product-level adjustment
                    $previous = $this->getProductQty($product);
                    $actual   = (float)$row['actual_qty'];
                    $diff     = $actual - $previous;
                    $unitCost = (float)($row['unit_purchase_price'] ?? $product->unit_purchase_price ?? 0);
                    $worth    = abs($diff) * $unitCost;

                    StockAdjustmentItem::create([
                        'stock_adjustment_id' => $adj->id,
                        'product_id'          => $product->id,
                        'previous_qty'        => $previous,
                        'actual_qty'          => $actual,
                        'diff_qty'            => $diff,
                        'unit_purchase_price' => $unitCost,
                        'worth_adjusted'      => $worth,
                    ]);

                    $totalWorth += $worth;

                    // Apply to product-level qty
                    $this->setProductQty($product, $actual);
                }

                $touchedProducts[$product->id] = true;
            }

            // Sync product-level totals with batch sums (for products where all adjustment items were batch-level)
            foreach (array_keys($touchedProducts) as $pid) {
                /** @var Product $p */
                $p = Product::query()->lockForUpdate()->findOrFail($pid);
                $batchCount = Batch::where('product_id', $pid)->count();
                $hasUnbatchedRow = collect($data['items'])->contains(fn ($r) => (int) ($r['product_id'] ?? 0) === (int) $pid && empty(trim((string) ($r['batch_number'] ?? ''))));
                if ($batchCount > 0 && !$hasUnbatchedRow) {
                    $this->setProductQty($p, $this->sumBatches($p));
                }
            }

            $adj->update(['total_worth' => $totalWorth]);
            $adj->load('items.product');
            $this->syncShrinkageExpense($adj);
            app(DocumentAuditService::class)->recordCreate($adj, $request->user(), $data['note'] ?? null);

            // return created (and authorized view)
            $this->authorize('view', $adj);
            return $this->show($adj->id);
        });
    }

    public function update(Request $request, $id)
    {
        abort(405, 'Stock adjustments are immutable audit records and cannot be edited.');
    }

    public function destroy($id)
    {
        $adj = StockAdjustment::with('items.product')->findOrFail($id);
        // delete instance
        $this->authorize('delete', $adj);

        if (Schema::hasTable('stock_disposals') && DB::table('stock_disposals')->where('stock_adjustment_id', $adj->id)->exists()) {
            return response()->json([
                'message' => 'Cannot delete a stock adjustment that is linked to a stock disposal voucher.',
            ], 422);
        }
        if (Schema::hasTable('stocktake_sessions') && DB::table('stocktake_sessions')->where('stock_adjustment_id', $adj->id)->exists()) {
            return response()->json([
                'message' => 'Cannot delete a stock adjustment that is linked to a finalized stocktake session.',
            ], 422);
        }

        return DB::transaction(function () use ($adj) {
            app(DocumentAuditService::class)->recordReversal($adj, auth()->user(), 'Stock adjustment deleted');
            $this->deleteShrinkageExpense($adj->posted_number);
            $touchedProducts = [];

            foreach ($adj->items as $item) {
                /** @var Product $product */
                $product = Product::query()->lockForUpdate()->findOrFail($item->product_id);
                $inverseDiff = (float)($item->diff_qty ?? ((float)$item->actual_qty - (float)$item->previous_qty));
                if ($item->batch_number) {
                    /** @var Batch $batch */
                    $batch = Batch::query()->lockForUpdate()
                        ->where('product_id', $product->id)
                        ->where('batch_number', $item->batch_number)
                        ->first();
                    if ($batch) {
                        $this->addBatchQty($batch, -$inverseDiff);
                    }
                } else {
                    $this->addProductQty($product, -$inverseDiff);
                }
                $touchedProducts[$product->id] = true;
            }

            $adj->items()->delete();
            $adj->delete();

            foreach (array_keys($touchedProducts) as $pid) {
                /** @var Product $p */
                $p = Product::query()->lockForUpdate()->findOrFail($pid);
                $batchCount = Batch::where('product_id', $pid)->count();
                if ($batchCount > 0) {
                    $this->setProductQty($p, $this->sumBatches($p));
                }
            }

            return response()->noContent();
        });
    }

    // ===== Validation =====

    protected function validatePayload(Request $request, $id = null): array
    {
        return $request->validate([
            'posted_number' => ['required', 'string', Rule::unique('stock_adjustments','posted_number')->ignore($id)],
            'posted_date'   => ['required', 'date'],
            'note'          => ['required', 'string', 'max:2000'],

            'items'                          => ['required', 'array', 'min:1'],
            'items.*.product_id'            => ['required','integer','exists:products,id'],
            'items.*.actual_qty'            => ['required','numeric','min:0'],
            'items.*.unit_purchase_price'   => ['nullable','numeric','min:0'],
            'items.*.batch_number'          => ['nullable','string','max:191'],
            'items.*.expiry'                => ['nullable','date'],
            'items.*.pack_size'             => ['nullable','numeric','min:0'],
        ]);
    }

    protected function stockAdjustmentItemKey(array|object $row): string
    {
        $data = is_object($row) ? (array) $row : $row;

        return implode('|', [
            (int)($data['product_id'] ?? 0),
            trim((string)($data['batch_number'] ?? '')),
            trim((string)($data['expiry'] ?? '')),
            trim((string)($data['pack_size'] ?? '')),
        ]);
    }

    protected function syncShrinkageExpense(StockAdjustment $adj, ?string $previousPostedNumber = null): void
    {
        if (!Schema::hasTable('expenses') || !Schema::hasTable('expense_categories')) {
            return;
        }
        // Disposal and stocktake adjustments manage their own P&L write-off via their respective services
        $postedNo = (string) $adj->posted_number;
        if (str_starts_with($postedNo, 'DISP-') || str_starts_with($postedNo, 'DSP-') || str_starts_with($postedNo, 'STOCKTAKE-')) {
            return;
        }

        $netSignedValue = 0.0;
        foreach ($adj->items as $item) {
            $diff = (float) ($item->diff_qty ?? ((float) $item->actual_qty - (float) $item->previous_qty));
            $unitCost = (float) ($item->unit_purchase_price ?? 0);
            $netSignedValue += ($diff * $unitCost);
        }

        $lookupRef = $previousPostedNumber ?: $adj->posted_number;
        $existing = Expense::withTrashed()
            ->where('reference_number', $lookupRef)
            ->first();

        // Only record a write-off expense when there is a net inventory shrinkage (netSignedValue < 0)
        if ($netSignedValue >= -0.005) {
            if ($existing && !$existing->trashed()) {
                $existing->delete();
            }
            return;
        }

        $lossAmount = round(abs($netSignedValue), 2);
        $userId = $adj->user_id ?: auth()->id() ?: DB::table('users')->value('id');
        if (!$userId) {
            return;
        }

        $category = ExpenseCategory::firstOrCreate(
            ['code' => 'stock_shrinkage_writeoff'],
            [
                'name'        => 'Inventory Shrinkage & Count Variance Write-Off',
                'description' => 'Non-cash P&L write-off for inventory count shortages and stock adjustments',
                'is_active'   => true,
            ]
        );

        $dateStr = $adj->posted_date instanceof Carbon
            ? $adj->posted_date->toDateString()
            : Carbon::parse($adj->posted_date ?: now())->toDateString();

        $description = "Stock Adjustment {$adj->posted_number}" . ($adj->note ? " — {$adj->note}" : '');

        if ($existing) {
            if ($existing->trashed()) {
                $existing->restore();
            }
            $existing->update([
                'expense_category_id' => $category->id,
                'amount'              => $lossAmount,
                'date'                => $dateStr,
                'reference_number'    => $adj->posted_number,
                'description'         => $description,
            ]);
        } else {
            Expense::create([
                'expense_number'         => Expense::generateExpenseNumber($dateStr),
                'expense_category_id'    => $category->id,
                'account_id'             => null,
                'user_id'                => $userId,
                'cash_drawer_session_id' => null,
                'amount'                 => $lossAmount,
                'date'                   => $dateStr,
                'payment_method'         => 'other',
                'reference_number'       => $adj->posted_number,
                'payee'                  => 'Inventory Shrinkage Write-Off',
                'description'            => $description,
                'is_recurring'           => false,
            ]);
        }
    }

    protected function deleteShrinkageExpense(?string $postedNumber): void
    {
        if (!$postedNumber || !Schema::hasTable('expenses')) {
            return;
        }
        Expense::where('reference_number', $postedNumber)->delete();
    }
}
