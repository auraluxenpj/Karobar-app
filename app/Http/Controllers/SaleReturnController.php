<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\Batch;
use App\Models\SaleReturn;
use App\Models\SaleReturnItem;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Auth;

class SaleReturnController extends Controller
{
    // ===== Helpers =====
    private function i($v): int { return (int)($v ?? 0); }
    private function f($v): float { return (float)($v ?? 0.0); }

    private function unitsFromArray(array $item): int
    {
        return $this->i($item['unit_return_quantity'] ?? 0);
    }

    private function unitsFromModel(SaleReturnItem $item): int
    {
        return $this->i($item->unit_return_quantity ?? 0);
    }

    /**
     * Smart stock delta: try to apply to Batch first, then mirror the actual applied delta to Product.
     * $deltaUnits: positive = increase (on create), negative = decrease (on update revert / delete).
     */
    private function applyStockDeltaSmart(int $productId, ?string $batchNo, ?string $expiry, int $deltaUnits): void
    {
        $batchNo = trim((string)($batchNo ?? ''));
        $expiry  = trim((string)($expiry ?? ''));

        $actualApplied = $deltaUnits; // default if batch not found

        $batch = null;
        if ($batchNo !== '') {
            $batchQuery = Batch::lockForUpdate()->where('product_id', $productId)
                ->where('batch_number', $batchNo);
            if ($expiry !== '') {
                $cleanExpiry = substr($expiry, 0, 10);
                $batchQuery->where(function ($q) use ($expiry, $cleanExpiry) {
                    $q->where('expiry_date', $cleanExpiry)
                      ->orWhere('expiry_date', $expiry);
                });
            }
            $batch = $batchQuery->first();
            if (!$batch) {
                $batch = Batch::lockForUpdate()->where('product_id', $productId)
                    ->where('batch_number', $batchNo)
                    ->first();
            }
        }

        if ($batch) {
            $before = $this->i($batch->quantity);
            $after  = $before + $deltaUnits;
            if ($after < 0) {
                throw \Illuminate\Validation\ValidationException::withMessages([
                    'items' => ["Cannot revert or delete sale return because returned stock in batch {$batch->batch_number} has already been sold or consumed."],
                ]);
            }
            $actualApplied = $after - $before;          // what really changed
            $batch->quantity = $after;
            $batch->save();
        }

        if ($product = Product::lockForUpdate()->find($productId)) {
            $pBefore = $this->i($product->quantity);
            $pAfter  = $pBefore + $actualApplied;
            if ($pAfter < 0) {
                throw \Illuminate\Validation\ValidationException::withMessages([
                    'items' => ["Cannot revert or delete sale return because returned stock for {$product->name} has already been sold or consumed."],
                ]);
            }
            $product->quantity = $pAfter;
            
            // If stock becomes zero, reset average price and margins
            // This ensures moving average resets when all stock is removed
            if ($pAfter <= 0) {
                $product->avg_price = 0;
                $product->margin = 0;
                $product->whole_sale_margin = 0;
            }
            
            $product->save();
        }
    }

    // Create items and INCREASE stock (sale return adds back to inventory)
    private function createItemsAndIncrease(SaleReturn $sr, array $items, ?\Illuminate\Support\Collection $originalItems = null): void
    {
        $snapshots = app(\App\Services\SaleCostSnapshot::class);
        $source = \App\Models\SaleInvoice::whereKey($sr->sale_invoice_id)->where('customer_id', $sr->customer_id)->first();
        $sourceItems = $source ? $source->items()->get() : collect();
        foreach ($items as $raw) {
            $matches = $sourceItems->where('product_id', $raw['product_id']);
            if (!empty($raw['batch_number']) || !empty($raw['expiry'])) {
                $matches = $snapshots->matchingRows($matches, $raw);
            }
            $cost = $originalItems !== null
                ? $snapshots->originalCost($originalItems, $raw)
                : $snapshots->unambiguousCost($matches);
            $payload = [
                'cost_price_snapshot' => $cost,
                'product_id'               => $raw['product_id'],
                'batch_number'             => $raw['batch_number'] ?? ($raw['batch'] ?? null),
                'expiry'                   => $raw['expiry'] ?? null,
                'unit_sale_quantity'       => $this->i($raw['unit_sale_quantity'] ?? 0),
                'unit_sale_price'          => $this->f($raw['unit_sale_price'] ?? 0),
                'item_discount_percentage' => $this->f($raw['item_discount_percentage'] ?? 0),
                'unit_return_quantity'     => $this->i($raw['unit_return_quantity'] ?? 0),
                'sub_total'                => $this->f($raw['sub_total'] ?? 0),
            ];

            $it = new SaleReturnItem($payload);
            $it->sale_return_id = $sr->id;
            $it->save();

            // Apply +units to stock
            $this->applyStockDeltaSmart(
                $this->i($payload['product_id']),
                $payload['batch_number'] ?? null,
                $payload['expiry'] ?? null,
                +$this->i($payload['unit_return_quantity'])
            );
        }
    }

    // Revert items: DECREASE stock by the previously returned quantity
    private function revertItems(SaleReturn $sr): void
    {
        foreach ($sr->items as $it) {
            $this->applyStockDeltaSmart(
                $this->i($it->product_id),
                $it->batch_number,
                $it->expiry,
                -$this->unitsFromModel($it)
            );
        }
    }

    // ===== CRUD =====

    // 🔒 SaleReturnController@index
    public function index(Request $request)
    {
        $this->authorize('viewAny', SaleReturn::class);

        $qPosted   = trim((string) $request->query('posted'));
        $qCustomer = trim((string) $request->query('customer'));

        $query = \App\Models\SaleReturn::with(['customer', 'saleInvoice'])->latest();

        if ($qPosted !== '') {
            $query->where('posted_number', 'like', '%' . $qPosted . '%');
        }
        if ($qCustomer !== '') {
            $query->whereHas('customer', function ($q) use ($qCustomer) {
                $q->where('name', 'like', '%' . $qCustomer . '%');
            });
        }

        if ($request->filled('per_page')) {
            $perPage = max(1, min((int) $request->query('per_page', 25), 200));
            return $query->paginate($perPage);
        }

        return $query->get();
    }

    public function show(SaleReturn $saleReturn)
    {
        // 🔒 view
        $this->authorize('view', $saleReturn);

        return $saleReturn->load(['customer', 'saleInvoice', 'items.product', 'account']);
    }

    public function store(Request $request)
    {
        // 🔒 create
        $this->authorize('create', SaleReturn::class);

        $data = $request->validate([
            'customer_id'         => 'required|exists:customers,id',
            'date'                => 'required|date',
            'sale_invoice_id'     => 'nullable|exists:sale_invoices,id',
            'remarks'             => 'nullable|string',

            'gross_total'         => 'nullable|numeric',
            'discount_percentage' => 'nullable|numeric',
            'discount_amount'     => 'nullable|numeric',
            'tax_percentage'      => 'nullable|numeric',
            'tax_amount'          => 'nullable|numeric',
            'total'               => 'required|numeric',
            'settlement_mode'     => 'nullable|string|in:cash_refund,credit_note,invoice_offset',
            'payment_method'      => 'nullable|string|in:cash,bank_transfer,card,mobile_wallet',
            'account_id'          => 'nullable|integer|exists:accounts,id',

            'items'                             => 'required|array|min:1',
            'items.*.product_id'                => 'required|exists:products,id',
            'items.*.batch_number'              => 'nullable|string',
            'items.*.expiry'                    => 'nullable|string',
            'items.*.unit_sale_quantity'        => 'nullable|integer|min:0',
            'items.*.unit_return_quantity'      => 'required|integer|min:0',
            'items.*.unit_sale_price'           => 'nullable|numeric',
            'items.*.item_discount_percentage'  => 'nullable|numeric',
            'items.*.sub_total'                 => 'nullable|numeric',
        ]);

        $userId = Auth::id();
        if (!$userId) {
            abort(401, 'Unauthenticated: user_id is required');
        }

        // 🛡️ Server-Authoritative Sale Return Totals
        $calculated = app(\App\Services\InvoiceCalculationService::class)->calculateAndValidateSaleReturn($data, Auth::user());
        $data['items']               = $calculated['items'];
        $data['gross_total']         = $calculated['gross_total'];
        $data['discount_percentage'] = $calculated['discount_percentage'];
        $data['discount_amount']     = $calculated['discount_amount'];
        $data['tax_percentage']      = $calculated['tax_percentage'];
        $data['tax_amount']          = $calculated['tax_amount'];
        $data['total']               = $calculated['total'];

        return DB::transaction(function () use ($data, $userId, $request) {
            app(\App\Services\ReturnEntitlement::class)->validate('sale', $data);
            // Generate posted_number server-side (concurrency-safe)
            $last = SaleReturn::lockForUpdate()->orderByDesc('id')->first();
            $next = $last ? ($last->id + 1) : 1;
            $posted = 'SLRET-' . str_pad((string)$next, 4, '0', STR_PAD_LEFT);

            $createPayload = [
                'user_id'            => $userId,
                'customer_id'        => $data['customer_id'],
                'sale_invoice_id'    => $data['sale_invoice_id'] ?? null,
                'posted_number'      => $posted, // assigned on save
                'date'               => $data['date'],
                'gross_total'        => $this->f($data['gross_total'] ?? 0),
                'discount_percentage'=> $this->f($data['discount_percentage'] ?? 0),
                'discount_amount'    => $this->f($data['discount_amount'] ?? 0),
                'tax_percentage'     => $this->f($data['tax_percentage'] ?? 0),
                'tax_amount'         => $this->f($data['tax_amount'] ?? 0),
                'total'              => $this->f($data['total'] ?? 0),
            ];
            if (\Illuminate\Support\Facades\Schema::hasColumn('sale_returns', 'remarks')) {
                $createPayload['remarks'] = $data['remarks'] ?? null;
            }
            $sr = SaleReturn::create($createPayload);

            $this->createItemsAndIncrease($sr, $data['items']);

            $settlementService = app(\App\Services\ReturnSettlementService::class);
            $sr->settlement_mode = $settlementService->resolveSaleSettlementMode(
                $data['settlement_mode'] ?? null,
                isset($data['sale_invoice_id']) ? (int) $data['sale_invoice_id'] : null
            );
            $sr->payment_method = $data['payment_method'] ?? 'cash';
            $sr->account_id = $data['account_id'] ?? null;

            $settlementService->applySaleReturnSettlement($sr, Auth::user());

            return $sr->load(['customer', 'saleInvoice', 'items.product']);
        });
    }

    public function update(Request $request, SaleReturn $saleReturn)
    {
        // 🔒 update
        $this->authorize('update', $saleReturn);

        $data = $request->validate([
            'customer_id'         => 'required|exists:customers,id',
            'posted_number'       => 'required|string',
            'date'                => 'required|date',
            'sale_invoice_id'     => 'nullable|exists:sale_invoices,id',
            'remarks'             => 'nullable|string',

            'gross_total'         => 'nullable|numeric',
            'discount_percentage' => 'nullable|numeric',
            'discount_amount'     => 'nullable|numeric',
            'tax_percentage'      => 'nullable|numeric',
            'tax_amount'          => 'nullable|numeric',
            'total'               => 'required|numeric',
            'settlement_mode'     => 'nullable|string|in:cash_refund,credit_note,invoice_offset',
            'payment_method'      => 'nullable|string|in:cash,bank_transfer,card,mobile_wallet',
            'account_id'          => 'nullable|integer|exists:accounts,id',

            'items'                             => 'required|array|min:1',
            'items.*.product_id'                => 'required|exists:products,id',
            'items.*.batch_number'              => 'nullable|string',
            'items.*.expiry'                    => 'nullable|string',
            'items.*.unit_sale_quantity'        => 'nullable|integer|min:0',
            'items.*.unit_return_quantity'      => 'required|integer|min:0',
            'items.*.unit_sale_price'           => 'nullable|numeric',
            'items.*.item_discount_percentage'  => 'nullable|numeric',
            'items.*.sub_total'                 => 'nullable|numeric',
        ]);

        $userId = Auth::id();
        if (!$userId) {
            abort(401, 'Unauthenticated: user_id is required');
        }

        // 🛡️ Server-Authoritative Sale Return Totals
        $calculated = app(\App\Services\InvoiceCalculationService::class)->calculateAndValidateSaleReturn($data, Auth::user());
        $data['items']               = $calculated['items'];
        $data['gross_total']         = $calculated['gross_total'];
        $data['discount_percentage'] = $calculated['discount_percentage'];
        $data['discount_amount']     = $calculated['discount_amount'];
        $data['tax_percentage']      = $calculated['tax_percentage'];
        $data['tax_amount']          = $calculated['tax_amount'];
        $data['total']               = $calculated['total'];

        return DB::transaction(function () use ($saleReturn, $data, $userId, $request) {
            $oldSnapshot = [
                'total'           => (float) $saleReturn->total,
                'settlement_mode' => $saleReturn->settlement_mode ?: 'cash_refund',
                'payment_method'  => $saleReturn->payment_method ?: 'cash',
                'account_id'      => $saleReturn->account_id,
            ];
            app(\App\Services\ReturnEntitlement::class)->validate('sale', $data, $saleReturn);
            $originalItems = (int) $saleReturn->sale_invoice_id === (int) ($data['sale_invoice_id'] ?? 0)
                && (int) $saleReturn->customer_id === (int) $data['customer_id'] ? $saleReturn->items()->get() : collect();
            // Revert previous stock effects
            $this->revertItems($saleReturn);

            // Replace items
            $saleReturn->items()->delete();
            $updatePayload = [
                'user_id'            => $userId,
                'customer_id'         => $data['customer_id'],
                'sale_invoice_id'     => $data['sale_invoice_id'] ?? null,
                'posted_number'       => $data['posted_number'],
                'date'                => $data['date'],
                'gross_total'         => $this->f($data['gross_total'] ?? 0),
                'discount_percentage' => $this->f($data['discount_percentage'] ?? 0),
                'discount_amount'     => $this->f($data['discount_amount'] ?? 0),
                'tax_percentage'      => $this->f($data['tax_percentage'] ?? 0),
                'tax_amount'          => $this->f($data['tax_amount'] ?? 0),
                'total'               => $this->f($data['total'] ?? 0),
            ];
            if (\Illuminate\Support\Facades\Schema::hasColumn('sale_returns', 'remarks')) {
                $updatePayload['remarks'] = $data['remarks'] ?? null;
            }
            $saleReturn->update($updatePayload);

            $this->createItemsAndIncrease($saleReturn, $data['items'], $originalItems);

            $settlementService = app(\App\Services\ReturnSettlementService::class);
            $saleReturn->settlement_mode = $settlementService->resolveSaleSettlementMode(
                $data['settlement_mode'] ?? null,
                isset($data['sale_invoice_id']) ? (int) $data['sale_invoice_id'] : null,
                $oldSnapshot['settlement_mode']
            );
            $saleReturn->payment_method = $data['payment_method'] ?? ($oldSnapshot['payment_method'] ?: 'cash');
            if (array_key_exists('account_id', $data)) {
                $saleReturn->account_id = $data['account_id'];
            }

            $settlementService->syncSaleReturnSettlementUpdate(
                $saleReturn,
                $oldSnapshot,
                $request->has('update_drawer_if_pre_shift') ? $request->boolean('update_drawer_if_pre_shift') : null,
                Auth::user()
            );

            return $saleReturn->load(['customer', 'saleInvoice', 'items.product']);
        });
    }

    public function destroy(SaleReturn $saleReturn)
    {
        // 🔒 delete
        $this->authorize('delete', $saleReturn);

        return DB::transaction(function () use ($saleReturn) {
            app(\App\Services\ReturnEntitlement::class)->lockSource('sale', $saleReturn);

            app(\App\Services\ReturnSettlementService::class)->revertSaleReturnSettlement($saleReturn, Auth::user());

            $this->revertItems($saleReturn);
            $saleReturn->items()->delete();
            $saleReturn->delete();
            return response()->json(['message' => 'Sale return deleted']);
        });
    }

    public function generateNewCode()
    {
        // 🔒 usually tied to create permission
        $this->authorize('create', SaleReturn::class);

        $last = SaleReturn::orderBy('id', 'desc')->first();
        $next = 1;
        if ($last && !empty($last->posted_number)) {
            if (preg_match('/SLRET-(\d+)/', $last->posted_number, $m)) {
                $next = ((int)$m[1]) + 1;
            } elseif (preg_match('/SL-(\d+)/', $last->posted_number, $m)) {
                $next = ((int)$m[1]) + 1;
            }
        }
        return response()->json(['posted_number' => 'SLRET-'.str_pad($next, 4, '0', STR_PAD_LEFT)]);
    }
}
