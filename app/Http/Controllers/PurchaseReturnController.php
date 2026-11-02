<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\Batch;
use App\Models\PurchaseReturn;
use App\Models\PurchaseReturnItem;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PurchaseReturnController extends Controller
{
    // ===== Helpers =====
    private function i($v): int { return (int)($v ?? 0); }
    private function f($v): float { return (float)($v ?? 0.0); }

    // IMPORTANT: units are ALREADY precomputed on the client.
    private function unitsFromArray(array $item): int
    {
        return $this->i($item['return_unit_quantity'] ?? 0);
    }

    private function unitsFromModel(PurchaseReturnItem $item): int
    {
        return $this->i($item->return_unit_quantity ?? 0);
    }

    private function validateStockAvailability(array $items, ?\Illuminate\Support\Collection $originalItems = null): void
    {
        $originalItems ??= collect();
        $ids = collect($items)->pluck('product_id')->merge($originalItems->pluck('product_id'))->unique()->filter()->values();
        $products = Product::whereIn('id', $ids)->orderBy('id')->lockForUpdate()->get()->keyBy('id');
        $batches = Batch::whereIn('product_id', $ids)->orderBy('id')->lockForUpdate()->get();

        $restored = $originalItems->groupBy('product_id')->map(fn ($rows) => $rows->sum('return_unit_quantity'));
        $batchRestored = [];
        $unbatchedRestored = [];
        foreach ($originalItems as $old) {
            $batchNo = trim((string)($old->batch ?? ''));
            if ($batchNo !== '') {
                $b = $batches->first(fn ($batch) => (int)$batch->product_id === (int)$old->product_id && trim((string)$batch->batch_number) === $batchNo);
                if ($b) {
                    $batchRestored[$b->id] = ($batchRestored[$b->id] ?? 0) + (int)$old->return_unit_quantity;
                }
            } else {
                $unbatchedRestored[(int)$old->product_id] = ($unbatchedRestored[(int)$old->product_id] ?? 0) + (int)$old->return_unit_quantity;
            }
        }

        $requested = [];
        $batchRequested = [];
        $unbatchedRequested = [];

        foreach ($items as $index => $row) {
            $productId = (int)($row['product_id'] ?? 0);
            $product = $products->get($productId);
            if (!$product) {
                throw \Illuminate\Validation\ValidationException::withMessages(["items.$index.product_id" => "Selected product is invalid or unavailable."]);
            }
            $returnQty = (int)($row['return_unit_quantity'] ?? 0);
            if ($returnQty <= 0) {
                continue;
            }

            $requested[$productId] = ($requested[$productId] ?? 0) + $returnQty;
            $available = (int)($product->quantity ?? 0) + (int)($restored[$productId] ?? 0);

            if ($requested[$productId] > $available) {
                throw \Illuminate\Validation\ValidationException::withMessages([
                    "items.$index.return_unit_quantity" => "Only {$available} units remain available on hand for {$product->name}. Insufficient stock (requested: {$requested[$productId]} units)."
                ]);
            }

            $batchNo = trim((string)($row['batch'] ?? ''));
            if ($batchNo !== '') {
                $b = $batches->first(fn ($batch) => (int)$batch->product_id === $productId && trim((string)$batch->batch_number) === $batchNo);
                if ($b) {
                    $batchRequested[$b->id] = ($batchRequested[$b->id] ?? 0) + $returnQty;
                    $batchAvailable = (int)($b->quantity ?? 0) + (int)($batchRestored[$b->id] ?? 0);
                    if ($batchRequested[$b->id] > $batchAvailable) {
                        throw \Illuminate\Validation\ValidationException::withMessages([
                            "items.$index.return_unit_quantity" => "Only {$batchAvailable} units remain available in batch {$b->batch_number} for {$product->name}. Insufficient stock (requested: {$batchRequested[$b->id]} units)."
                        ]);
                    }
                }
            } else {
                $productBatches = $batches->where('product_id', $productId);
                if ($productBatches->isNotEmpty()) {
                    $totalBatched = (int) $productBatches->sum('quantity');
                    $unbatchedAvailable = max(0, (int)($product->quantity ?? 0) - $totalBatched) + (int)($unbatchedRestored[$productId] ?? 0);
                    $unbatchedRequested[$productId] = ($unbatchedRequested[$productId] ?? 0) + $returnQty;
                    if ($unbatchedRequested[$productId] > $unbatchedAvailable) {
                        throw \Illuminate\Validation\ValidationException::withMessages([
                            "items.$index.return_unit_quantity" => "Only {$unbatchedAvailable} unassigned units remain available on hand for {$product->name}. Insufficient unassigned stock (requested: {$unbatchedRequested[$productId]} units)."
                        ]);
                    }
                }
            }
        }
    }

    /**
     * Apply delta to Batch first; then apply the *actual* applied delta to Product.
     * $deltaUnits: negative = reduce (creating a return), positive = revert (on update/delete).
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
                    'items' => ["Insufficient stock in batch {$batch->batch_number}."],
                ]);
            }
            $actualApplied = $after - $before;         // what really changed
            $batch->quantity = $after;
            $batch->save();
        }

        if ($product = Product::lockForUpdate()->find($productId)) {
            $pBefore = $this->i($product->quantity);
            $pAfter  = $pBefore + $actualApplied;
            if ($pAfter < 0) {
                throw \Illuminate\Validation\ValidationException::withMessages([
                    'items' => ["Insufficient stock for {$product->name}."],
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

    private function createItemsAndReduce(PurchaseReturn $pr, array $items): void
    {
        foreach ($items as $raw) {
            $payload = [
                'product_id'                => $raw['product_id'],
                'batch'                     => $raw['batch'] ?? null,
                'expiry'                    => $raw['expiry'] ?? null,
                'pack_size'                 => $this->i($raw['pack_size'] ?? 0),
                'pack_purchased_quantity'   => $this->i($raw['pack_purchased_quantity'] ?? 0),
                'return_pack_quantity'      => $this->i($raw['return_pack_quantity'] ?? 0),
                'return_unit_quantity'      => $this->i($raw['return_unit_quantity'] ?? 0), // ← already final units
                'pack_purchase_price'       => $this->f($raw['pack_purchase_price'] ?? 0),
                'unit_purchase_price'       => $this->f($raw['unit_purchase_price'] ?? 0),
                'item_discount_percentage'  => $this->f($raw['item_discount_percentage'] ?? 0),
                'sub_total'                 => $this->f($raw['sub_total'] ?? 0),
            ];

            $units = $this->unitsFromArray($payload);
            $payload['quantity'] = $units; // harmless if column absent

            /** @var PurchaseReturnItem $item */
            $item = $pr->items()->create($payload);

            // Returns reduce stock by exactly the units provided
            $this->applyStockDeltaSmart($item->product_id, $item->batch, $item->expiry, -$units);
        }
    }

    private function revertItems(PurchaseReturn $pr): void
    {
        $pr->load('items');
        foreach ($pr->items as $item) {
            $units = $this->unitsFromModel($item);
            $this->applyStockDeltaSmart($item->product_id, $item->batch, $item->expiry, +$units);
        }
    }

    // ===== Endpoints =====

// PurchaseReturnController@index
public function index(Request $request)
{
    $this->authorize('viewAny', PurchaseReturn::class);
    $qPosted   = trim((string) $request->query('posted'));
    $qSupplier = trim((string) $request->query('supplier'));

    $query = PurchaseReturn::with(['supplier', 'purchaseInvoice'])->latest();

    if ($qPosted !== '') {
        $query->where('posted_number', 'like', '%' . $qPosted . '%');
    }
    if ($qSupplier !== '') {
        $query->whereHas('supplier', function ($q) use ($qSupplier) {
            $q->where('name', 'like', '%' . $qSupplier . '%');
        });
    }

    if ($request->filled('per_page')) {
        $perPage = max(1, min((int) $request->query('per_page', 25), 200));
        return $query->paginate($perPage);
    }

    return $query->get();
}


    public function show(PurchaseReturn $purchaseReturn)
    {
        $this->authorize('view', $purchaseReturn);
        return $purchaseReturn->load(['supplier', 'purchaseInvoice', 'items.product', 'account']);
    }

    public function store(Request $request)
    {
        $this->authorize('create', PurchaseReturn::class);
        $data = $request->validate([
            'supplier_id'           => 'required|exists:suppliers,id',
            'date'                  => 'required|date',
            'purchase_invoice_id'   => 'nullable|exists:purchase_invoices,id',
            'remarks'               => 'nullable|string',

            'gross_total'           => 'nullable|numeric',
            'discount_percentage'   => 'nullable|numeric',
            'discount_amount'       => 'nullable|numeric',
            'tax_percentage'        => 'nullable|numeric',
            'tax_amount'            => 'nullable|numeric',
            'total'                 => 'required|numeric',
            'settlement_mode'       => 'nullable|string|in:cash_refund,credit_note,invoice_offset',
            'payment_method'        => 'nullable|string|in:cash,bank_transfer,card,mobile_wallet',
            'account_id'            => 'nullable|integer|exists:accounts,id',

            'items'                                 => 'required|array|min:1',
            'items.*.product_id'                    => 'required|exists:products,id',
            'items.*.pack_size'                     => 'nullable|integer',
            'items.*.batch'                         => 'nullable|string',
            'items.*.expiry'                        => 'nullable|string',
            'items.*.pack_purchased_quantity'       => 'nullable|integer',
            'items.*.return_pack_quantity' => 'nullable|numeric|min:0',
            'items.*.return_unit_quantity'          => 'required|integer|min:0', // ← trust this
            'items.*.pack_purchase_price'           => 'nullable|numeric',
            'items.*.unit_purchase_price'           => 'nullable|numeric',
            'items.*.item_discount_percentage'      => 'nullable|numeric',
            'items.*.sub_total'                     => 'nullable|numeric',
        ]);

        // 🛡️ Server-Authoritative Purchase Return Totals
        $calculated = app(\App\Services\InvoiceCalculationService::class)->calculateAndValidatePurchaseReturn($data, $request->user());
        $data['items']               = $calculated['items'];
        $data['gross_total']         = $calculated['gross_total'];
        $data['discount_percentage'] = $calculated['discount_percentage'];
        $data['discount_amount']     = $calculated['discount_amount'];
        $data['tax_percentage']      = $calculated['tax_percentage'];
        $data['tax_amount']          = $calculated['tax_amount'];
        $data['total']               = $calculated['total'];

        return DB::transaction(function () use ($data, $request) {
            $this->validateStockAvailability($data['items']);
            app(\App\Services\ReturnEntitlement::class)->validate('purchase', $data);
            // Generate posted_number server-side (concurrency-safe)
            $last = PurchaseReturn::lockForUpdate()->orderByDesc('id')->first();
            $next = $last ? ($last->id + 1) : 1;
            $posted = 'PRRET-' . str_pad((string)$next, 4, '0', STR_PAD_LEFT);

            $pr = PurchaseReturn::create([
                'supplier_id'         => $data['supplier_id'],
                'posted_number'       => $posted, // assigned on save
                'date'                => $data['date'],
                'purchase_invoice_id' => $data['purchase_invoice_id'] ?? null,
                'remarks'             => $data['remarks'] ?? null,
                'gross_total'         => $data['gross_total'] ?? 0,
                'discount_percentage' => $data['discount_percentage'] ?? 0,
                'discount_amount'     => $data['discount_amount'] ?? 0,
                'tax_percentage'      => $data['tax_percentage'] ?? 0,
                'tax_amount'          => $data['tax_amount'] ?? 0,
                'total'               => $data['total'],
            ]);

            $this->createItemsAndReduce($pr, $data['items']);

            $settlementService = app(\App\Services\ReturnSettlementService::class);
            $pr->settlement_mode = $settlementService->resolvePurchaseSettlementMode(
                $data['settlement_mode'] ?? null,
                isset($data['purchase_invoice_id']) ? (int) $data['purchase_invoice_id'] : null
            );
            $pr->payment_method = $data['payment_method'] ?? 'cash';
            $pr->account_id = $data['account_id'] ?? null;

            $settlementService->applyPurchaseReturnSettlement($pr, \Illuminate\Support\Facades\Auth::user());

            return $pr->load(['supplier', 'purchaseInvoice', 'items.product']);
        });
    }

    public function update(Request $request, PurchaseReturn $purchaseReturn)
    {
        $this->authorize('update', $purchaseReturn);
        $data = $request->validate([
            'supplier_id'           => 'required|exists:suppliers,id',
            'posted_number'         => 'required|string',
            'date'                  => 'required|date',
            'purchase_invoice_id'   => 'nullable|exists:purchase_invoices,id',
            'remarks'               => 'nullable|string',

            'gross_total'           => 'nullable|numeric',
            'discount_percentage'   => 'nullable|numeric',
            'discount_amount'       => 'nullable|numeric',
            'tax_percentage'        => 'nullable|numeric',
            'tax_amount'            => 'nullable|numeric',
            'total'                 => 'required|numeric',
            'settlement_mode'       => 'nullable|string|in:cash_refund,credit_note,invoice_offset',
            'payment_method'        => 'nullable|string|in:cash,bank_transfer,card,mobile_wallet',
            'account_id'            => 'nullable|integer|exists:accounts,id',

            'items'                                 => 'required|array|min:1',
            'items.*.product_id'                    => 'required|exists:products,id',
            'items.*.pack_size'                     => 'nullable|integer',
            'items.*.batch'                         => 'nullable|string',
            'items.*.expiry'                        => 'nullable|string',
            'items.*.pack_purchased_quantity'       => 'nullable|integer',
            'items.*.return_pack_quantity' => 'nullable|numeric|min:0',
            'items.*.return_unit_quantity'          => 'required|integer|min:0', // ← trust this
            'items.*.pack_purchase_price'           => 'nullable|numeric',
            'items.*.unit_purchase_price'           => 'nullable|numeric',
            'items.*.item_discount_percentage'      => 'nullable|numeric',
            'items.*.sub_total'                     => 'nullable|numeric',
        ]);

        // 🛡️ Server-Authoritative Purchase Return Totals
        $calculated = app(\App\Services\InvoiceCalculationService::class)->calculateAndValidatePurchaseReturn($data, $request->user());
        $data['items']               = $calculated['items'];
        $data['gross_total']         = $calculated['gross_total'];
        $data['discount_percentage'] = $calculated['discount_percentage'];
        $data['discount_amount']     = $calculated['discount_amount'];
        $data['tax_percentage']      = $calculated['tax_percentage'];
        $data['tax_amount']          = $calculated['tax_amount'];
        $data['total']               = $calculated['total'];

        return DB::transaction(function () use ($purchaseReturn, $data, $request) {
            $purchaseReturn->load('items');
            $this->validateStockAvailability($data['items'], $purchaseReturn->items);
            $oldSnapshot = [
                'total'           => (float) $purchaseReturn->total,
                'settlement_mode' => $purchaseReturn->settlement_mode ?: 'cash_refund',
                'payment_method'  => $purchaseReturn->payment_method ?: 'cash',
                'account_id'      => $purchaseReturn->account_id,
            ];
            app(\App\Services\ReturnEntitlement::class)->validate('purchase', $data, $purchaseReturn);
            // Revert previous stock effects
            $this->revertItems($purchaseReturn);

            // Replace items
            $purchaseReturn->items()->delete();

            // Update header
            $purchaseReturn->update([
                'supplier_id'         => $data['supplier_id'],
                'posted_number'       => $data['posted_number'],
                'date'                => $data['date'],
                'purchase_invoice_id' => $data['purchase_invoice_id'] ?? null,
                'remarks'             => $data['remarks'] ?? null,
                'gross_total'         => $data['gross_total'] ?? 0,
                'discount_percentage' => $data['discount_percentage'] ?? 0,
                'discount_amount'     => $data['discount_amount'] ?? 0,
                'tax_percentage'      => $data['tax_percentage'] ?? 0,
                'tax_amount'          => $data['tax_amount'] ?? 0,
                'total'               => $data['total'],
            ]);

            // Apply new items
            $this->createItemsAndReduce($purchaseReturn, $data['items']);

            $settlementService = app(\App\Services\ReturnSettlementService::class);
            $purchaseReturn->settlement_mode = $settlementService->resolvePurchaseSettlementMode(
                $data['settlement_mode'] ?? null,
                isset($data['purchase_invoice_id']) ? (int) $data['purchase_invoice_id'] : null,
                $oldSnapshot['settlement_mode']
            );
            $purchaseReturn->payment_method = $data['payment_method'] ?? ($oldSnapshot['payment_method'] ?: 'cash');
            if (array_key_exists('account_id', $data)) {
                $purchaseReturn->account_id = $data['account_id'];
            }

            $settlementService->syncPurchaseReturnSettlementUpdate(
                $purchaseReturn,
                $oldSnapshot,
                $request->has('update_drawer_if_pre_shift') ? $request->boolean('update_drawer_if_pre_shift') : null,
                \Illuminate\Support\Facades\Auth::user()
            );

            return $purchaseReturn->load(['supplier', 'purchaseInvoice', 'items.product']);
        });
    }

    public function destroy(PurchaseReturn $purchaseReturn)
    {
        $this->authorize('delete', $purchaseReturn);
        return DB::transaction(function () use ($purchaseReturn) {
            app(\App\Services\ReturnEntitlement::class)->lockSource('purchase', $purchaseReturn);

            app(\App\Services\ReturnSettlementService::class)->revertPurchaseReturnSettlement(
                $purchaseReturn,
                \Illuminate\Support\Facades\Auth::user()
            );

            $this->revertItems($purchaseReturn);
            $purchaseReturn->items()->delete();
            $purchaseReturn->delete();
            return response()->json(null, 204);
        });
    }

    public function generateNewCode()
    {
        $this->authorize('create', PurchaseReturn::class);
        $last = PurchaseReturn::orderBy('id', 'desc')->first();
        $next = 1;
        if ($last && !empty($last->posted_number)) {
            if (preg_match('/PRRET-(\d+)/', $last->posted_number, $m)) {
                $next = ((int)$m[1]) + 1;
            } elseif (preg_match('/PR-(\d+)/', $last->posted_number, $m)) {
                $next = ((int)$m[1]) + 1;
            }
        }
        return response()->json(['posted_number' => 'PRRET-'.str_pad($next, 4, '0', STR_PAD_LEFT)]);
    }
}
