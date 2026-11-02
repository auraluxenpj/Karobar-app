<?php

namespace App\Http\Controllers;

use App\Authorizables\PurchaseOrderForecast;
use App\Services\SupplierProductSorting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Auth;
use Carbon\Carbon;

class PurchaseOrderController extends Controller
{
    public function index(Request $request)
    {
        $this->authorize('viewAny', \App\Models\PurchaseOrder::class);
        $totalAmount = \App\Models\PurchaseOrderItem::query()
            ->selectRaw('COALESCE(SUM(ordered_quantity * unit_purchase_price * (1 - COALESCE(item_discount_percentage, 0) / 100.0)), 0)')
            ->whereColumn('purchase_order_items.purchase_order_id', 'purchase_orders.id');
        $supplierName = \App\Models\Supplier::query()
            ->select('name')
            ->whereColumn('suppliers.id', 'purchase_orders.supplier_id')
            ->limit(1);

        $query = \App\Models\PurchaseOrder::with('supplier', 'invoices')
            ->whereNotIn('purchase_orders.status', ['received', 'partially_received'])
            ->withCount('items')
            ->withSum('items', 'ordered_quantity')
            ->selectSub($totalAmount, 'total_amount');

        $supplier = trim((string) ($request->query('supplier') ?? $request->query('search') ?? $request->query('q') ?? ''));
        if ($supplier !== '') {
            $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $supplier) . '%';
            $query->whereHas('supplier', fn ($q) => $q->where('name', 'like', $like));
        }

        match ((string) $request->query('sort', 'newest')) {
            'oldest' => $query->orderBy('purchase_orders.id'),
            'date_desc' => $query->orderByDesc('purchase_orders.date')->orderByDesc('purchase_orders.id'),
            'date_asc' => $query->orderBy('purchase_orders.date')->orderBy('purchase_orders.id'),
            'supplier_asc' => $query->orderBy($supplierName)->orderByDesc('purchase_orders.id'),
            'supplier_desc' => $query->orderByDesc($supplierName)->orderByDesc('purchase_orders.id'),
            'total_desc' => $query->orderByDesc('total_amount')->orderByDesc('purchase_orders.id'),
            'total_asc' => $query->orderBy('total_amount')->orderByDesc('purchase_orders.id'),
            'units_desc' => $query->orderByDesc('items_sum_ordered_quantity')->orderByDesc('purchase_orders.id'),
            'units_asc' => $query->orderBy('items_sum_ordered_quantity')->orderByDesc('purchase_orders.id'),
            'items_desc' => $query->orderByDesc('items_count')->orderByDesc('purchase_orders.id'),
            'items_asc' => $query->orderBy('items_count')->orderByDesc('purchase_orders.id'),
            'status_asc' => $query->orderBy('purchase_orders.status')->orderByDesc('purchase_orders.id'),
            'status_desc' => $query->orderByDesc('purchase_orders.status')->orderByDesc('purchase_orders.id'),
            default => $query->orderByDesc('purchase_orders.id'),
        };

        return $query->paginate(20);
    }

    public function show(\App\Models\PurchaseOrder $purchaseOrder)
    {
        $this->authorize('view', $purchaseOrder);
        $purchaseOrder->load('supplier', 'items.product.brand', 'items.invoiceItems', 'invoices');
        foreach ($purchaseOrder->items as $item) {
            $item->received_quantity = $item->invoiceItems->sum('unit_quantity');
            $item->remaining_quantity = max(0, $item->ordered_quantity - $item->received_quantity);
            $item->unsetRelation('invoiceItems');
        }
        $purchaseOrder->setRelation('items', app(SupplierProductSorting::class)
            ->sort((int) $purchaseOrder->supplier_id, $purchaseOrder->items, fn ($line) => $line->product_id));
        return $purchaseOrder;
    }

    /** Product IDs in the order last saved on a Purchase Order based invoice for this supplier. */
    public function supplierSortOrder(\App\Models\Supplier $supplier)
    {
        $this->authorize('viewAny', \App\Models\PurchaseOrder::class);
        return response()->json(['product_ids' => app(SupplierProductSorting::class)->productIds((int) $supplier->id)]);
    }

    private function validateOrder(Request $request): array
    {
        $data = $request->validate([
            'supplier_id' => 'required|integer|exists:suppliers,id',
            'date' => 'required|date',
            'expected_received_date' => 'required|date|after_or_equal:date',
            'reference' => 'nullable|string|max:255',
            'notes' => 'nullable|string|max:10000',
            'items' => 'required|array|min:1',
            'items.*.product_id' => 'required|integer|distinct|exists:products,id',
            'items.*.ordered_packs' => 'nullable|integer|min:1|max:2147483647',
            'items.*.pack_purchase_price' => 'nullable|numeric|min:0|max:99999999',
            'items.*.unit_bonus' => 'nullable|integer|min:0|max:2147483647',
            'items.*.ordered_quantity' => 'required_without:items.*.ordered_packs|integer|min:1|max:2147483647',
            'items.*.pack_size' => 'required|integer|min:1|max:2147483647',
            'items.*.unit_purchase_price' => 'required_without:items.*.pack_purchase_price|numeric|min:0|max:99999999',
            'items.*.item_discount_percentage' => 'nullable|numeric|min:0|max:100',
        ], ['supplier_id.required' => 'Please select a supplier before saving the Purchase Order.']);
        $products = \App\Models\Product::whereIn('id', array_column($data['items'], 'product_id'))->get()->keyBy('id');
        foreach ($data['items'] as $index => &$item) {
            $packSize = max(1, (int) $products[$item['product_id']]->pack_size);
            if ((int) $item['pack_size'] !== $packSize) {
                throw \Illuminate\Validation\ValidationException::withMessages(["items.$index.pack_size" => 'Pack size must match the selected product.']);
            }
            $quantity = isset($item['ordered_packs']) ? $item['ordered_packs'] * $packSize : $item['ordered_quantity'];
            if ($quantity > 2147483647 || $quantity % $packSize !== 0) {
                throw \Illuminate\Validation\ValidationException::withMessages(["items.$index.ordered_packs" => 'Order a positive whole number of packs.']);
            }
            $item['ordered_quantity'] = $quantity;
            if (isset($item['pack_purchase_price'])) {
                $item['unit_purchase_price'] = $item['pack_purchase_price'] / $packSize;
            }
            $item['unit_bonus'] = $item['unit_bonus'] ?? 0;
            unset($item['ordered_packs'], $item['pack_purchase_price']);
        }
        unset($item);
        return $data;
    }

    public function store(Request $request)
    {
        $this->authorize('create', \App\Models\PurchaseOrder::class);
        $data = $this->validateOrder($request);
        return DB::transaction(function () use ($data) {
            $order = \App\Models\PurchaseOrder::create(array_merge($data, [
                'status' => 'ordered', 'created_by' => Auth::id(), 'updated_by' => Auth::id(),
            ]));
            // The database ID provides a race-safe sequence, including the first order.
            $order->number = 'PO-' . str_pad($order->id, 5, '0', STR_PAD_LEFT);
            $order->save();
            $order->items()->createMany($data['items']);

            $productIds = collect($data['items'])->pluck('product_id')->filter()->unique()->all();
            if (!empty($productIds) && \Illuminate\Support\Facades\Schema::hasTable('user_demands')) {
                \App\Models\UserDemand::whereIn('product_id', $productIds)
                    ->where('status', 'pending')
                    ->update(['status' => 'ordered']);
            }

            return response()->json($order->load('supplier', 'items.product.brand'), 201);
        });
    }

    public function update(Request $request, \App\Models\PurchaseOrder $purchaseOrder)
    {
        $this->authorize('update', $purchaseOrder);
        $data = $this->validateOrder($request);
        return DB::transaction(function () use ($purchaseOrder, $data) {
            $order = \App\Models\PurchaseOrder::lockForUpdate()->findOrFail($purchaseOrder->id);
            if ($order->status !== 'ordered' || $order->invoices()->exists()) {
                abort(409, 'Only unreceived orders can be edited.');
            }
            $order->update(array_merge($data, ['updated_by' => Auth::id()]));
            $order->items()->delete();
            $order->items()->createMany($data['items']);

            $productIds = collect($data['items'])->pluck('product_id')->filter()->unique()->all();
            if (!empty($productIds) && \Illuminate\Support\Facades\Schema::hasTable('user_demands')) {
                \App\Models\UserDemand::whereIn('product_id', $productIds)
                    ->where('status', 'pending')
                    ->update(['status' => 'ordered']);
            }

            return $order->load('supplier', 'items.product.brand');
        });
    }

    public function cancel(\App\Models\PurchaseOrder $purchaseOrder)
    {
        $this->authorize('cancel', $purchaseOrder);
        return DB::transaction(function () use ($purchaseOrder) {
            $order = \App\Models\PurchaseOrder::lockForUpdate()->findOrFail($purchaseOrder->id);
            if ($order->status !== 'ordered' || $order->invoices()->exists()) abort(409, 'Only unreceived orders can be cancelled.');
            $order->update(['status' => 'cancelled', 'updated_by' => Auth::id()]);
            return $order;
        });
    }

    public function destroy(\App\Models\PurchaseOrder $purchaseOrder)
    {
        $this->authorize('delete', $purchaseOrder);
        return DB::transaction(function () use ($purchaseOrder) {
            $order = \App\Models\PurchaseOrder::lockForUpdate()->findOrFail($purchaseOrder->id);
            if (!in_array($order->status, ['ordered', 'cancelled'], true) || $order->invoices()->exists()) {
                abort(409, 'Received Purchase Orders cannot be deleted.');
            }
            $order->delete();
            return response()->noContent();
        });
    }

    public function receive(\App\Models\PurchaseOrder $purchaseOrder)
    {
        $this->authorize('view', $purchaseOrder);
        $this->authorize('create', \App\Models\PurchaseInvoice::class);
        return DB::transaction(function () use ($purchaseOrder) {
            $order = \App\Models\PurchaseOrder::lockForUpdate()->findOrFail($purchaseOrder->id);
            if (!in_array($order->status, ['ordered', 'partially_received'], true)) abort(409, 'This order cannot be received.');
            $order->load([
                'supplier',
                'items.product.brand',
                'items.product.batches' => fn ($q) => $q->orderByDesc('id'),
                'items.invoiceItems',
            ]);
            return response()->json([
                'purchase_order_id' => $order->id,
                'receipt_key' => (string) \Illuminate\Support\Str::uuid(),
                'purchase_order' => ['id' => $order->id, 'number' => $order->number,
                    'previous_receipts' => $order->invoices()->count(),
                    'remaining_units' => $order->items->sum(fn ($line) => max(0, $line->ordered_quantity - $line->invoiceItems->sum('unit_quantity')))],
                'supplier_id' => $order->supplier_id,
                'supplier' => $order->supplier,
                'posted_date' => now()->toDateString(),
                'remarks' => $order->notes,
                'items' => app(SupplierProductSorting::class)->sort((int) $order->supplier_id, $order->items, fn ($line) => $line->product_id)
                    ->filter(fn ($line) => $line->invoiceItems->sum('unit_quantity') < $line->ordered_quantity)->values()->map(function ($line) {
                    $p = $line->product;
                    $remaining = max(0, $line->ordered_quantity - $line->invoiceItems->sum('unit_quantity'));
                    $bonus = max(0, $line->unit_bonus - $line->invoiceItems->sum('unit_bonus'));

                    // Find most recent batch if product already had a batch
                    $recentBatch = $p && $p->batches ? $p->batches->first(fn ($b) => trim((string) $b->batch_number) !== '') : null;
                    $batchNumber = $recentBatch ? trim((string) $recentBatch->batch_number) : '';
                    $batchExpiry = $recentBatch && $recentBatch->expiry_date ? \Carbon\Carbon::parse($recentBatch->expiry_date)->toDateString() : '';

                    if ($batchNumber === '' && $p) {
                        $lastPiItem = \App\Models\PurchaseInvoiceItem::where('product_id', $p->id)
                            ->whereNotNull('batch')
                            ->where('batch', '!=', '')
                            ->latest('id')
                            ->first();
                        if ($lastPiItem) {
                            $batchNumber = trim((string) $lastPiItem->batch);
                            $batchExpiry = $lastPiItem->expiry ? \Carbon\Carbon::parse($lastPiItem->expiry)->toDateString() : '';
                        }
                    }

                    $hasBatch = $batchNumber !== '';

                    return [
                        'purchase_order_item_id' => $line->id, 'product_id' => $p->id,
                        'pack_size' => $line->pack_size,
                        'unit_quantity' => $remaining,
                        'pack_quantity' => $remaining / $line->pack_size,
                        'unit_purchase_price' => $line->unit_purchase_price,
                        'pack_purchase_price' => $line->unit_purchase_price * $line->pack_size,
                        'unit_sale_price' => $p->unit_sale_price ?? 0,
                        'pack_sale_price' => ($p->unit_sale_price ?? 0) * $line->pack_size,
                        'whole_sale_unit_price' => $p->whole_sale_unit_price ?? 0,
                        'whole_sale_pack_price' => ($p->whole_sale_unit_price ?? 0) * $line->pack_size,
                        'item_discount_percentage' => $line->item_discount_percentage,
                        'unit_bonus' => $bonus, 'pack_bonus' => $bonus / $line->pack_size,
                        'batch' => $hasBatch ? $batchNumber : '',
                        'expiry' => $hasBatch ? $batchExpiry : '',
                        'is_unbatched' => !$hasBatch,
                        'product' => $p,
                    ];
                }),
            ]);
        });
    }

    public function forecast(Request $request)
    {
        $this->authorize('generate', PurchaseOrderForecast::class);

        // ✅ added optional knobs (packs)
        $data = $request->validate([
            'date_from'      => 'required|date',
            'date_to'        => 'required|date|after_or_equal:date_from',
            'projected_days' => 'required|integer|min:1',
            'supplier_id'    => 'nullable|integer|exists:suppliers,id',
            'brand_id'       => 'nullable|integer|exists:brands,id',
            'brand_ids'      => 'nullable|array',
            'brand_ids.*'    => 'integer|exists:brands,id',
            'safety_packs'   => 'nullable|integer|min:0',
            'moq_packs'      => 'nullable|integer|min:0',
        ]);

        // Merge single brand_id (backward compatible) with multi brand_ids into a unique list
        $brandIds = collect(array_merge(
            isset($data['brand_id']) ? [(int) $data['brand_id']] : [],
            array_map('intval', $data['brand_ids'] ?? [])
        ))->filter()->unique()->values()->all();

        $from = Carbon::parse($data['date_from'])->startOfDay();
        $to   = Carbon::parse($data['date_to'])->endOfDay();
        $days = max(1, $from->diffInDays($to) + 1);
        $proj = (int) $data['projected_days'];

        $safetyPacks = (int) ($data['safety_packs'] ?? 0);
        $moqPacks    = (int) ($data['moq_packs'] ?? 0);

        // --- sales within selected range (STRICT filter, excluding reversed invoices & netting sale returns) ---
        $saleReturnsInRange = DB::table('sale_return_items as sri')
            ->join('sale_returns as sr', 'sr.id', '=', 'sri.sale_return_id')
            ->whereBetween('sr.date', [$from->toDateString(), $to->toDateString()])
            ->groupBy('sri.product_id')
            ->select(
                'sri.product_id',
                DB::raw('SUM(sri.unit_return_quantity) as units_returned')
            );

        $salesInRange = DB::table('sale_invoice_items as sii')
            ->join('sale_invoices as si', 'si.id', '=', 'sii.sale_invoice_id')
            ->leftJoinSub($saleReturnsInRange, 'srx', function ($j) {
                $j->on('srx.product_id', '=', 'sii.product_id');
            })
            ->whereBetween('si.date', [$from->toDateString(), $to->toDateString()])
            ->where(function ($q) {
                $q->whereNull('si.status')->orWhere('si.status', '!=', 'reversed');
            })
            ->groupBy('sii.product_id', 'srx.units_returned')
            ->select(
                'sii.product_id',
                DB::raw('MAX(0, SUM(sii.quantity + COALESCE(sii.bonus, 0)) - COALESCE(srx.units_returned, 0)) as units_sold'),
                DB::raw('MAX(si.date) as last_sold_date_in_range')
            );

// ---- Products that SOLD in the selected period (STRICT filter) ----
        $soldRows = DB::table('products as p')
            ->joinSub($salesInRange, 'sx', function ($j) {
                $j->on('p.id', '=', 'sx.product_id');
            })
            ->leftJoin('brands as b', 'b.id', '=', 'p.brand_id')
            ->leftJoin('suppliers as s', 's.id', '=', 'p.supplier_id')
            ->when($data['supplier_id'] ?? null, fn($q, $sid) => $q->where('p.supplier_id', $sid))
            ->when(!empty($brandIds), fn($q) => $q->whereIn('p.brand_id', $brandIds))
            ->where('sx.units_sold', '>', 0)
            ->select(
                'p.id as product_id',
                'p.product_code',
                'p.name as product_name',
                'p.pack_size as product_pack_size',
                'p.quantity as current_stock_units',
                'p.unit_purchase_price',
                'p.pack_purchase_price',
                'p.unit_sale_price',
                'p.brand_id',
                'p.supplier_id',
                'b.name as brand_name',
                's.name as supplier_name',
DB::raw('sx.units_sold as units_sold'),
                DB::raw('sx.last_sold_date_in_range as last_sold_date'),
                DB::raw('0 as is_user_demand')
            )
            ->orderByDesc('sx.units_sold')
            ->get();

        // ---- Products with active (pending) user demands, even if they didn't sell ----
        $demandRows = DB::table('user_demands as ud')
            ->join('products as p', 'p.id', '=', 'ud.product_id')
            ->leftJoin('brands as b', 'b.id', '=', 'p.brand_id')
            ->leftJoin('suppliers as s', 's.id', '=', 'p.supplier_id')
            ->where('ud.status', 'pending')
            ->when($data['supplier_id'] ?? null, fn($q, $sid) => $q->where('p.supplier_id', $sid))
            ->when(!empty($brandIds), fn($q) => $q->whereIn('p.brand_id', $brandIds))
            ->groupBy(
                'p.id', 'p.product_code', 'p.name', 'p.pack_size', 'p.quantity',
                'p.unit_purchase_price', 'p.pack_purchase_price', 'p.unit_sale_price',
                'p.brand_id', 'p.supplier_id', 'b.name', 's.name'
            )
            ->select(
                'p.id as product_id',
                'p.product_code',
                'p.name as product_name',
                'p.pack_size as product_pack_size',
                'p.quantity as current_stock_units',
                'p.unit_purchase_price',
                'p.pack_purchase_price',
                'p.unit_sale_price',
                'p.brand_id',
                'p.supplier_id',
                'b.name as brand_name',
                's.name as supplier_name',
                DB::raw('SUM(ud.requested_quantity) as units_sold'),
                DB::raw('MAX(ud.created_at) as last_sold_date'),
                DB::raw('1 as is_user_demand')
            )
            ->get();

// Pending user-demand info per product (customer names + total requested units)
        $demandInfoRows = DB::table('user_demands as ud')
            ->leftJoin('customers as c', 'c.id', '=', 'ud.customer_id')
            ->where('ud.status', 'pending')
            ->groupBy('ud.product_id')
            ->select(
                'ud.product_id',
                DB::raw('GROUP_CONCAT(DISTINCT COALESCE(c.name, ud.requested_name)) as customer_names'),
                DB::raw('SUM(ud.requested_quantity) as demand_quantity')
            )
            ->get()
            ->keyBy(fn ($r) => (int) $r->product_id);

        $pendingDemandProductIds = $demandInfoRows->keys()->all();

        // ---- Products returned via purchase returns within the selected date range ----
        $returnedRows = DB::table('purchase_return_items as pri')
            ->join('purchase_returns as pr', 'pr.id', '=', 'pri.purchase_return_id')
            ->whereDate('pr.date', '>=', $from->toDateString())
            ->whereDate('pr.date', '<=', $to->toDateString())
            ->groupBy('pri.product_id')
            ->select(
                'pri.product_id',
                DB::raw('SUM(pri.return_unit_quantity) as returned_units'),
                DB::raw('MAX(pr.date) as last_purchase_return_date')
            )
            ->get()
            ->keyBy(fn ($r) => (int) $r->product_id);

        // Merge: sold products first, then any user-demand products not already present.
        // Mark sold products that also have a pending user demand.
        $seen = [];
        $rows = collect();
        foreach ($soldRows as $r) {
            $seen[(int) $r->product_id] = true;
            $r->is_user_demand = in_array((int) $r->product_id, $pendingDemandProductIds, true) ? 1 : 0;
            $rows->push($r);
        }
        foreach ($demandRows as $r) {
            if (isset($seen[(int) $r->product_id])) {
                continue;
            }
            $rows->push($r);
        }

        $items = $rows->map(function ($row) use ($days, $proj, $safetyPacks, $moqPacks, $demandInfoRows, $returnedRows) {
            $packSize = max(1, (int) ($row->product_pack_size ?? 0));

            // ===== Demand model (UNITS) =====
            $unitsSold   = (int) ($row->units_sold ?? 0);
            $dailyUnits  = $days > 0 ? ($unitsSold / $days) : 0.0;
            $projUnits   = $dailyUnits * $proj;

            // ===== Stock & safety (UNITS) =====
            $stockUnits  = (int) ($row->current_stock_units ?? 0);
            $safetyUnits = $safetyPacks * $packSize; // request-level safety; extend here if you add per-product RL

            // Projected ending stock after the projection window
            $endingUnits = $stockUnits - $projUnits;

            // Order is DUE iff projected ending stock falls below safety
            $dueUnits    = max(0, $safetyUnits - $endingUnits);
            $suggested   = (int) ceil($dueUnits / $packSize); // round up to whole packs

            // Apply MOQ (packs) if any
            if ($suggested > 0 && $moqPacks > 0) {
                $suggested = max($suggested, $moqPacks);
            }

            // ===== Pricing =====
            $ppu       = (float) ($row->unit_purchase_price ?? 0);
            $ppp       = (float) ($row->pack_purchase_price ?? 0);
            $packPrice = $ppp > 0 ? $ppp : ($ppu > 0 ? $ppu * $packSize : 0);

            // ===== Flags: user demand & purchase return =====
            $demandInfo   = $demandInfoRows->get((int) $row->product_id);
            $returnInfo   = $returnedRows->get((int) $row->product_id);
            $isUserDemand = ((int) ($row->is_user_demand ?? 0) === 1) || $demandInfo !== null;

            return [
                'product_id'            => (int) $row->product_id,
                'product_code'          => $row->product_code,
                'product_name'          => $row->product_name,
                'brand_id'              => $row->brand_id,
                'brand_name'            => $row->brand_name,
                'supplier_id'           => $row->supplier_id,
                'supplier_name'         => $row->supplier_name,
                'pack_size'             => $packSize,
                'units_sold'            => $unitsSold,
                'current_stock_units'   => $stockUnits,
                'projected_days'        => (int) $proj,
                'suggested_packs'       => (int) $suggested,
                'suggested_units'       => (int) ($suggested * $packSize),
                'pack_price'            => round($packPrice, 2),
                'pack_purchase_price'   => (float) $ppp,         // for "Remove Zero"
'last_sold_date'        => $row->last_sold_date, // within range
                'unit_purchase_price'   => $ppu,
                'unit_sale_price'       => $row->unit_sale_price,
                'is_user_demand'        => $isUserDemand ? 1 : 0, // 1 = originated from a user demand
                'user_demand_customers' => $demandInfo?->customer_names, // comma-separated customer names (pending demands)
                'user_demand_quantity'  => $demandInfo ? (int) $demandInfo->demand_quantity : 0,

                'has_purchase_return'       => $returnInfo ? 1 : 0, // 1 = returned via purchase return in the selected range
                'purchase_return_units'     => $returnInfo ? (int) $returnInfo->returned_units : 0,
                'last_purchase_return_date' => $returnInfo ? substr((string) $returnInfo->last_purchase_return_date, 0, 10) : null,

                // Optional: aid debugging in UI (safe to keep or remove)
                'policy' => [
                    'daily_units'  => round($dailyUnits, 4),
                    'proj_units'   => round($projUnits, 2),
                    'ending_units' => round($endingUnits, 2),
                    'safety_units' => $safetyUnits,
                    'due_units'    => round($dueUnits, 2),
                    'moq_packs'    => (int) $moqPacks,
                ],
            ];
        })->values();

        return response()->json([
            'meta' => [
                'date_from'      => $from->toDateString(),
                'date_to'        => $to->toDateString(),
                'days'           => (int) $days,
                'projected_days' => $proj,
                'filter'         => [
                    'supplier_id' => $data['supplier_id'] ?? null,
                    'brand_id'    => $data['brand_id'] ?? null,
                    'brand_ids'   => !empty($brandIds) ? $brandIds : null,
                    'safety_packs'=> $safetyPacks,
                    'moq_packs'   => $moqPacks,
                ],
            ],
            'items' => $items,
        ]);
    }
}
