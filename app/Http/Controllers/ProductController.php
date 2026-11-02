<?php

namespace App\Http\Controllers;

use App\Models\Formulation;
use App\Models\Product;
use App\Models\ProductSupplier;
use App\Models\PurchaseInvoiceItem;
use App\Models\PurchaseReturnItem;
use App\Models\SaleInvoiceItem;
use App\Models\SaleReturnItem;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ProductController extends Controller
{
    public function search(Request $req)
    {
        $this->authorize('lookup', Product::class);

        $q     = trim($req->input('q', ''));
        $ids   = $req->input('ids'); // can be array or comma-separated
        $limit = max(1, min((int)$req->input('limit', 30), 1000));

        $existingCols = array_flip(\App\Support\SchemaCache::getColumnListing('products'));
        $desiredCols = [
            'id','name','product_code','barcode','formulation','rack','storage_location_id','narcotic','pack_size',
            'unit_purchase_price','unit_sale_price',
            'pack_purchase_price','pack_sale_price',
            'whole_sale_pack_price','whole_sale_unit_price',
            'quantity','margin','avg_price',
            'category_id','brand_id','supplier_id',
        ];
        $selectCols = array_values(array_filter($desiredCols, fn(string $c) => isset($existingCols[$c])));

        $relations = ['brand:id,name', 'supplier:id,name'];
        if (isset($existingCols['category_id']) && \App\Support\SchemaCache::hasTable('categories')) {
            $relations[] = 'category:id,name';
        }
        if (isset($existingCols['storage_location_id']) && \App\Support\SchemaCache::hasTable('storage_locations')) {
            $relations[] = 'storageLocation:id,code,name,type';
        }

        $query = Product::select($selectCols ?: ['*'])
            ->with($relations)
            ->orderBy('name');
        if (\App\Support\SchemaCache::hasTable('batches') && \App\Support\SchemaCache::hasColumn('batches', 'quantity')) {
            $query->withSum('batches', 'quantity');
        }

        // If ids are provided → return exactly those (no limit)
        if ($ids) {
            if (is_string($ids)) {
                $ids = array_filter(array_map('intval', explode(',', $ids)));
            }
            if (is_array($ids) && count($ids)) {
                return response()->json($query->whereIn('id', $ids)->get());
            }
        }

        if ($q !== '') {
            $query->where('name', 'like', $q.'%');
        }

        return response()->json($query->limit($limit)->get());
    }

    public function generateNewCode()
    {
        $this->authorize('create', Product::class);
        $lastProduct = Product::orderBy('id', 'desc')->first();

        if ($lastProduct && preg_match('/PRD-(\d+)/', $lastProduct->product_code, $matches)) {
            $lastCodeNum = (int) $matches[1];
            $newCodeNum = $lastCodeNum + 1;
        } else {
            $newCodeNum = 1;
        }

        $formattedProductCode = 'PRD-' . str_pad($newCodeNum, 4, '0', STR_PAD_LEFT);
        $barcode = 'PRD' . str_pad((string) random_int(0, 9999999999), 10, '0', STR_PAD_LEFT);

        return response()->json([
            'product_code' => $formattedProductCode,
            'barcode' => $barcode,
        ]);
    }

    public function availableQuantity(Request $request, ?Product $product = null)
    {
        $this->authorize('lookup', Product::class);
        $productId = $product ? $product->id : $request->query('product_id');
        $batch     = trim((string)$request->query('batch', ''));

        if (!$productId) {
            return response()->json(['message' => 'product_id is required'], 422);
        }

        $product = $product ?: \App\Models\Product::find($productId);
        if (!$product) {
            return response()->json(['message' => 'Product not found'], 404);
        }

        $totalQty = (int) ($product->quantity ?? 0);
        $batches = \App\Models\Batch::where('product_id', $productId)->get();
        $totalBatched = (int) $batches->sum('quantity');
        $unbatchedQty = max(0, $totalQty - $totalBatched);

        $available = 0;

        if ($batch !== '' && $batch !== '__unbatched__') {
            $available = (int) $batches->where('batch_number', $batch)->sum('quantity');
        } else {
            // When no batch is selected, user is selling unbatched stock if batches exist,
            // or entire product stock if product has no batches.
            $available = $batches->isNotEmpty() ? $unbatchedQty : $totalQty;
        }

        return response()->json([
            'product_id'      => (int) $productId,
            'batch'           => $batch,
            'available_units' => $available,
            'unbatched_units' => $unbatchedQty,
            'batched_units'   => $totalBatched,
            'total_units'     => $totalQty,
        ]);
    }

    public function index(Request $req)
    {
        $this->authorize('viewAny', Product::class);
        $perPage = max(1, min((int)$req->input('per_page', 25), 100));

        $search       = trim((string)$req->input('q', ''));
        $qName        = trim((string)$req->input('q_name', ''));
        $qBrand       = trim((string)$req->input('q_brand', ''));
        $qSupplier    = trim((string)$req->input('q_supplier', ''));
        $qFormulation = trim((string)$req->input('q_formulation', ''));
        $qBarcode     = trim((string)$req->input('q_barcode', ''));
        $qRack        = trim((string)$req->input('q_rack', ''));
        $lowStock     = (int) $req->input('low_stock', 0);

        $existingCols = array_flip(\App\Support\SchemaCache::getColumnListing('products'));
        $desiredCols = [
            'id','product_code','barcode','name','formulation','rack','storage_location_id','image',
            'category_id','brand_id','supplier_id',
            'quantity','pack_size',
        ];
        $selectCols = array_values(array_filter($desiredCols, fn(string $c) => isset($existingCols[$c])));

        $indexRelations = [
            'category:id,name',
            'brand:id,name',
            'supplier:id,name',
        ];
        if (isset($existingCols['storage_location_id']) && \App\Support\SchemaCache::hasTable('storage_locations')) {
            $indexRelations[] = 'storageLocation:id,code,name,type';
        }

        $q = Product::query()
            ->select($selectCols ?: ['*'])
            ->with($indexRelations)
            ->withCount('batches');
        if (\App\Support\SchemaCache::hasTable('batches') && \App\Support\SchemaCache::hasColumn('batches', 'quantity')) {
            $q->withSum('batches', 'quantity');
        }

        $hasBarcode     = isset($existingCols['barcode']);
        $hasFormulation = isset($existingCols['formulation']);
        $hasRack        = isset($existingCols['rack']);

        // Starts-with (prefix) matching: searches products from the start (e.g. 'x' matches 'xyx' but not 'axt'),
        // plus barcode, rack, and generic/salt formulation.
        if ($search !== '') {
            $pattern = $search.'%';
            $q->where(function (Builder $matches) use ($search, $pattern, $hasBarcode, $hasFormulation, $hasRack) {
                $matches->where('name', 'like', $pattern)
                    ->orWhere('product_code', 'like', $pattern)
                    ->orWhereHas('brand', fn(Builder $brand) => $brand->where('name', 'like', $pattern))
                    ->orWhereHas('supplier', fn(Builder $supplier) => $supplier->where('name', 'like', $pattern));
                if ($hasBarcode) {
                    $matches->orWhere('barcode', 'like', $pattern);
                }
                if ($hasFormulation) {
                    $matches->orWhere('formulation', 'like', '%'.$search.'%');
                }
                if ($hasRack) {
                    $matches->orWhere('rack', 'like', $pattern);
                }
            });
        }

        // 🔍 Field-specific matching for name, brand, supplier, formulation, barcode, and rack
        if ($qName !== '') {
            $q->where('name', 'like', $qName.'%');
        }
        if ($qBrand !== '') {
            $q->whereHas('brand', fn(Builder $b) => $b->where('name', 'like', $qBrand.'%'));
        }
        if ($qSupplier !== '') {
            $q->where(function (Builder $sq) use ($qSupplier) {
                $sq->whereHas('supplier', fn(Builder $s) => $s->where('name', 'like', $qSupplier.'%'));
                if (\App\Support\SchemaCache::hasTable('product_suppliers')) {
                    $sq->orWhereHas('suppliers', fn(Builder $s) => $s->where('name', 'like', $qSupplier.'%'));
                }
            });
        }
        if ($qFormulation !== '' && $hasFormulation) {
            $q->where('formulation', 'like', '%'.$qFormulation.'%');
        }
        if ($qBarcode !== '' && $hasBarcode) {
            $q->where('barcode', 'like', $qBarcode.'%');
        }
        if ($qRack !== '' && $hasRack) {
            $q->where('rack', 'like', $qRack.'%');
        }

        // 🟠 Low stock only — running products (ever purchased) whose on-hand
        // quantity has dropped below pack_size. Matches the dashboard count and
        // the low-stock notification logic.
        if ($lowStock === 1) {
            $q->whereExists(function ($sub) {
                    $sub->select(\Illuminate\Support\Facades\DB::raw(1))
                        ->from('purchase_invoice_items as pii')
                        ->whereColumn('pii.product_id', 'products.id');
                })
                ->whereNotNull('quantity')
                ->whereColumn('quantity', '<', 'pack_size');
        }

        $q->orderByDesc('id');
        $page = $q->paginate($perPage);

        return response()->json($page);
    }

    public function store(Request $request)
    {
        $this->authorize('create', Product::class);
        $validated = $request->validate([
            'product_code' => 'required|unique:products,product_code',
            'name' => 'required|unique:products,name',
            'image' => 'nullable|image|max:2048',
            'formulation' => 'nullable|string',
            'description' => 'nullable|string',
            'pack_size' => 'required|integer',
            'quantity' => 'nullable|integer',
            'pack_purchase_price' => 'nullable|numeric',
            'pack_sale_price' => 'nullable|numeric',
            'unit_purchase_price' => 'nullable|numeric',
            'unit_sale_price' => 'nullable|numeric',
            'whole_sale_pack_price' => 'nullable|numeric',
            'whole_sale_unit_price' => 'nullable|numeric',
            'whole_sale_margin' => 'nullable|numeric',
            'avg_price' => 'nullable|numeric',
            'margin' => 'nullable|numeric',
            'narcotic' => ['required', Rule::in(['yes', 'no'])],
            'max_discount' => 'nullable|integer',
            'expiry_warning_days' => 'nullable|integer|min:1|max:3650',
            'category_id' => 'required|exists:categories,id',
            'brand_id' => 'required|exists:brands,id',
            'supplier_id' => 'required|exists:suppliers,id',
            'rack' => 'nullable|string',
            'storage_location_id' => 'nullable|integer|exists:storage_locations,id',
            'barcode' => 'required|unique:products,barcode',
        ]);

        if (array_key_exists('formulation', $validated)) {
            $resolvedFormulation = Formulation::resolveOrCreate($validated['formulation']);
            $validated['formulation'] = $resolvedFormulation?->name;
        }

        if (empty($validated['storage_location_id']) && Schema::hasTable('storage_locations')) {
            $validated['storage_location_id'] = \App\Models\StorageLocation::where('is_default', true)->value('id')
                ?? \App\Models\StorageLocation::orderBy('id')->value('id');
        }

        if ($request->hasFile('image')) {
            $path = $request->file('image')->store('products', 'public');
            $validated['image'] = $path;
        }

        $product = Product::create($validated);

        if (!empty($product->supplier_id) && Schema::hasTable('product_suppliers')) {
            ProductSupplier::updateOrCreate(
                ['product_id' => $product->id, 'supplier_id' => $product->supplier_id],
                [
                    'last_purchase_price' => $product->unit_purchase_price,
                    'is_preferred'        => true,
                ]
            );
        }

        return response()->json($product, 201);
    }

    public function show($id)
    {
        $relations = ['brand', 'category', 'supplier'];
        if (Schema::hasTable('product_suppliers')) {
            $relations[] = 'productSuppliers.supplier:id,name';
        }
        if (Schema::hasTable('storage_locations')) {
            $relations[] = 'storageLocation:id,code,name,type,default_rack';
        }
        $product = Product::with($relations)->findOrFail($id);
        $this->authorize('view', $product);
        return response()->json($product);
    }

    public function update(Request $request, $id)
    {
        $product = Product::findOrFail($id);
        $this->authorize('update', $product);
        $validated = $request->validate([
            'product_code' => ['required', Rule::unique('products', 'product_code')->ignore($product->id)],
            'name' => ['required', Rule::unique('products', 'name')->ignore($product->id)],
            'image' => 'nullable|image|max:2048',
            'formulation' => 'nullable|string',
            'description' => 'nullable|string',
            'pack_size' => 'required|integer',
            'quantity' => 'nullable|integer',
            'pack_purchase_price' => 'nullable|numeric',
            'pack_sale_price' => 'nullable|numeric',
            'unit_purchase_price' => 'nullable|numeric',
            'unit_sale_price' => 'nullable|numeric',
            'whole_sale_pack_price' => 'nullable|numeric',
            'whole_sale_unit_price' => 'nullable|numeric',
            'whole_sale_margin' => 'nullable|numeric',
            'avg_price' => 'nullable|numeric',
            'margin' => 'nullable|numeric',
            'narcotic' => ['required', Rule::in(['yes', 'no'])],
            'max_discount' => 'nullable|integer',
            'expiry_warning_days' => 'nullable|integer|min:1|max:3650',
            'category_id' => 'required|exists:categories,id',
            'brand_id' => 'required|exists:brands,id',
            'supplier_id' => 'required|exists:suppliers,id',
            'rack' => 'nullable|string',
            'storage_location_id' => 'nullable|integer|exists:storage_locations,id',
            'barcode' => ['required', Rule::unique('products', 'barcode')->ignore($product->id)],
        ]);

        if (array_key_exists('formulation', $validated)) {
            $resolvedFormulation = Formulation::resolveOrCreate($validated['formulation']);
            $validated['formulation'] = $resolvedFormulation?->name;
        }

        if ($request->hasFile('image')) {
            if ($product->image) {
                Storage::disk('public')->delete($product->image);
            }
            $path = $request->file('image')->store('products', 'public');
            $validated['image'] = $path;
        }
        $product->update($validated);

        if (!empty($product->supplier_id) && Schema::hasTable('product_suppliers')) {
            ProductSupplier::updateOrCreate(
                ['product_id' => $product->id, 'supplier_id' => $product->supplier_id],
                [
                    'last_purchase_price' => $product->unit_purchase_price,
                    'is_preferred'        => true,
                ]
            );
        }

        return response()->json($product);
    }

    public function destroy($id)
    {
        $product = Product::findOrFail($id);
        $this->authorize('delete', $product);
        if (($product->quantity ?? 0) > 0) {
            return response()->json(['message' => 'Cannot delete: product has on-hand quantity.'], 422);
        }
        if ($product->batches()->exists()) {
            return response()->json(['message' => 'Cannot delete: product has batch records.'], 422);
        }

        $capPerType = 8;

        $purchaseInvoiceNos = PurchaseInvoiceItem::where('product_id', $product->id)
            ->join('purchase_invoices', 'purchase_invoices.id', '=', 'purchase_invoice_items.purchase_invoice_id')
            ->pluck('purchase_invoices.posted_number', 'purchase_invoices.id')
            ->map(fn($num, $id) => $num ?: $id)
            ->values()
            ->unique();

        $saleInvoiceNos = SaleInvoiceItem::where('product_id', $product->id)
            ->join('sale_invoices', 'sale_invoices.id', '=', 'sale_invoice_items.sale_invoice_id')
            ->pluck('sale_invoices.posted_number', 'sale_invoices.id')
            ->map(fn($num, $id) => $num ?: $id)
            ->values()
            ->unique();

        $purchaseReturnNos = PurchaseReturnItem::where('product_id', $product->id)
            ->join('purchase_returns', 'purchase_returns.id', '=', 'purchase_return_items.purchase_return_id')
            ->pluck('purchase_returns.posted_number', 'purchase_returns.id')
            ->map(fn($num, $id) => $num ?: $id)
            ->values()
            ->unique();

        $saleReturnNos = SaleReturnItem::where('product_id', $product->id)
            ->join('sale_returns', 'sale_returns.id', '=', 'sale_return_items.sale_return_id')
            ->pluck('sale_returns.posted_number', 'sale_returns.id')
            ->map(fn($num, $id) => $num ?: $id)
            ->values()
            ->unique();

        $hasRefs = $purchaseInvoiceNos->isNotEmpty()
            || $saleInvoiceNos->isNotEmpty()
            || $purchaseReturnNos->isNotEmpty()
            || $saleReturnNos->isNotEmpty();

        if ($hasRefs) {
            $fmt = function ($label, $coll) use ($capPerType) {
                if ($coll->isEmpty()) return null;
                $shown = $coll->take($capPerType)->all();
                $more  = max(0, $coll->count() - $capPerType);
                $base  = $label.': '.implode(', ', array_map('strval', $shown));
                return $more > 0 ? $base.' +'.$more.' more' : $base;
            };

            $parts = array_filter([
                $fmt('Purchase Invoices', $purchaseInvoiceNos),
                $fmt('Sale Invoices',     $saleInvoiceNos),
                $fmt('Purchase Returns',  $purchaseReturnNos),
                $fmt('Sale Returns',      $saleReturnNos),
            ]);

            return response()->json([
                'message' => 'Product cannot be deleted because it exists in the following documents. ' . implode(' | ', $parts)
            ], 422);
        }

        if ($product->image) {
            Storage::disk('public')->delete($product->image);
        }
        $product->delete();

        return response()->json(['message' => 'Product deleted']);
    }

    // NEW: Bulk destroy with same checks as single delete
    public function bulkDestroy(Request $request)
    {
        $this->authorize('delete', Product::class);

        $validated = $request->validate([
            'product_ids'   => 'required|array|min:1',
            'product_ids.*' => 'integer|exists:products,id',
        ]);

        $ids = $validated['product_ids'];

        $deleted = 0;
        $failed  = [];

        $capPerType = 8;

        foreach ($ids as $id) {
            $product = Product::find($id);
            if (!$product) {
                $failed[] = ['id' => $id, 'name' => null, 'reason' => 'Not found'];
                continue;
            }
            $this->authorize('delete', $product);

            if (($product->quantity ?? 0) > 0) {
                $failed[] = ['id' => $id, 'name' => $product->name, 'reason' => 'Has on-hand quantity'];
                continue;
            }
            if ($product->batches()->exists()) {
                $failed[] = ['id' => $id, 'name' => $product->name, 'reason' => 'Has batch records'];
                continue;
            }

            $purchaseInvoiceNos = PurchaseInvoiceItem::where('product_id', $product->id)
                ->join('purchase_invoices', 'purchase_invoices.id', '=', 'purchase_invoice_items.purchase_invoice_id')
                ->pluck('purchase_invoices.posted_number', 'purchase_invoices.id')
                ->map(fn($num, $pid) => $num ?: $pid)->values()->unique();

            $saleInvoiceNos = SaleInvoiceItem::where('product_id', $product->id)
                ->join('sale_invoices', 'sale_invoices.id', '=', 'sale_invoice_items.sale_invoice_id')
                ->pluck('sale_invoices.posted_number', 'sale_invoices.id')
                ->map(fn($num, $sid) => $num ?: $sid)->values()->unique();

            $purchaseReturnNos = PurchaseReturnItem::where('product_id', $product->id)
                ->join('purchase_returns', 'purchase_returns.id', '=', 'purchase_return_items.purchase_return_id')
                ->pluck('purchase_returns.posted_number', 'purchase_returns.id')
                ->map(fn($num, $rid) => $num ?: $rid)->values()->unique();

            $saleReturnNos = SaleReturnItem::where('product_id', $product->id)
                ->join('sale_returns', 'sale_returns.id', '=', 'sale_return_items.sale_return_id')
                ->pluck('sale_returns.posted_number', 'sale_returns.id')
                ->map(fn($num, $rid) => $num ?: $rid)->values()->unique();

            $hasRefs = $purchaseInvoiceNos->isNotEmpty()
                || $saleInvoiceNos->isNotEmpty()
                || $purchaseReturnNos->isNotEmpty()
                || $saleReturnNos->isNotEmpty();

            if ($hasRefs) {
                $fmt = function ($label, $coll) use ($capPerType) {
                    if ($coll->isEmpty()) return null;
                    $shown = $coll->take($capPerType)->all();
                    $more  = max(0, $coll->count() - $capPerType);
                    $base  = $label.': '.implode(' | ', array_map('strval', $shown));
                    return $more > 0 ? $base.' +'.$more.' more' : $base;
                };

                $parts = array_filter([
                    $fmt('Purchase Invoices', $purchaseInvoiceNos),
                    $fmt('Sale Invoices',     $saleInvoiceNos),
                    $fmt('Purchase Returns',  $purchaseReturnNos),
                    $fmt('Sale Returns',      $saleReturnNos),
                ]);

                $failed[] = [
                    'id' => $id,
                    'name' => $product->name,
                    'reason' => 'Exists in: '.implode(' | ', $parts),
                ];
                continue;
            }

            if ($product->image) {
                Storage::disk('public')->delete($product->image);
            }
            $product->delete();
            $deleted++;
        }

        return response()->json([
            'deleted' => $deleted,
            'failed'  => $failed,
        ]);
    }

    public function bulkUpdateMeta(Request $request)
    {
        $this->authorize('bulkUpdate', Product::class);
        $validated = $request->validate([
            'product_ids'   => 'required|array|min:1',
            'product_ids.*' => 'integer|exists:products,id',
            'category_id'   => 'nullable|integer|exists:categories,id',
            'brand_id'      => 'nullable|integer|exists:brands,id',
            'supplier_id'   => 'nullable|integer|exists:suppliers,id',
        ]);

        $updates = array_filter([
            'category_id' => $validated['category_id'] ?? null,
            'brand_id'    => $validated['brand_id'] ?? null,
            'supplier_id' => $validated['supplier_id'] ?? null,
        ], fn($v) => !is_null($v));

        if (empty($updates)) {
            return response()->json([
                'message' => 'Provide at least one of category_id, brand_id, supplier_id to update.'
            ], 422);
        }

        $count = Product::whereIn('id', $validated['product_ids'])->update($updates);

        return response()->json([
            'updated'    => $count,
            'updates'    => $updates,
            'product_ids'=> $validated['product_ids'],
        ]);
    }

    public function export(): StreamedResponse
    {
        $this->authorize('export', Product::class);
        $file = 'products_'.now()->format('Y-m-d_H-i-s').'.csv';

        return response()->streamDownload(function () {
            $out = fopen('php://output', 'w');
            fprintf($out, chr(0xEF).chr(0xBB).chr(0xBF));

            fputcsv($out, [
                'product_code','name','pack_size','unit_purchase_price','unit_sale_price',
                'pack_purchase_price','pack_sale_price','whole_sale_pack_price','whole_sale_unit_price',
                'avg_price','margin','quantity',
                'category','brand','supplier','barcode','narcotic','max_discount','formulation','description','rack'
            ]);

            $sanitizeCsv = static function ($val) {
                $str = (string) ($val ?? '');
                if ($str !== '' && in_array($str[0], ['=', '+', '-', '@', "\t", "\r"], true) && !preg_match('/^[+-]?\d+(\.\d+)?$/', $str)) {
                    return "'" . $str;
                }
                return $str;
            };

            Product::with(['category:id,name','brand:id,name','supplier:id,name'])
                ->orderBy('id')
                ->chunk(1000, function ($chunk) use ($out, $sanitizeCsv) {
                foreach ($chunk as $p) {
                        fputcsv($out, [
                            $sanitizeCsv($p->product_code ?? ''),
                            $sanitizeCsv($p->name ?? ''),
                            (int)($p->pack_size ?? 0),
                            (string)($p->unit_purchase_price ?? ''),
                            (string)($p->unit_sale_price ?? ''),
                            (string)($p->pack_purchase_price ?? ''),
                            (string)($p->pack_sale_price ?? ''),
                            (string)($p->whole_sale_pack_price ?? ''),
                            (string)($p->whole_sale_unit_price ?? ''),
                            (string)($p->avg_price ?? ''),
                            (string)($p->margin ?? ''),
                            (int)($p->quantity ?? 0),
                            $sanitizeCsv($p->category->name ?? ''),
                            $sanitizeCsv($p->brand->name ?? ''),
                            $sanitizeCsv($p->supplier->name ?? ''),
                            $sanitizeCsv($p->barcode ?? ''),
                            $sanitizeCsv($p->narcotic ?? 'no'),
                            (string)($p->max_discount ?? ''),
                            $sanitizeCsv($p->formulation ?? ''),
                            $sanitizeCsv($p->description ?? ''),
                            $sanitizeCsv($p->rack ?? ''),
                        ]);
                    }
                });

            fclose($out);
        }, $file, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    /**
     * One-Click Generic / Formulation Substitute Lookup for POS & Sale Invoices.
     * GET /api/products/{product}/substitutes
     */
    public function substitutes(Request $request, Product $product)
    {
        $user = $request->user();
        if (
            !$user
            || (
                !$user->hasRole(['Admin', 'admin', 'super-admin'])
                && !$user->can('product.view')
                && !$user->can('barcode-pos.view')
                && !$user->can('barcode-pos.create')
                && !$user->can('sale-invoice.view')
                && !$user->can('sale-invoice.create')
                && !$user->can('sale-invoice.update')
            )
        ) {
            abort(403, 'This action is unauthorized.');
        }

        $formulation = trim((string) ($product->formulation ?? ''));
        $today = now()->toDateString();

        $query = Product::with([
            'brand:id,name',
            'category:id,name',
            'supplier:id,name',
            'batches' => function ($bq) use ($today) {
                $bq->where('quantity', '>', 0)
                   ->orderByRaw("CASE WHEN expiry_date IS NOT NULL AND expiry_date >= '{$today}' THEN 0 ELSE 1 END")
                   ->orderBy('expiry_date', 'asc');
            },
        ])->where('id', '!=', $product->id);

        $matchType = 'formulation';

        if ($formulation !== '') {
            // Split formulation into primary salt tokens (e.g. "Paracetamol 500mg" -> "Paracetamol")
            $primarySalt = trim(preg_replace('/\b\d+(\.\d+)?\s*(mg|ml|mcg|g|iu|%)\b/i', '', $formulation));
            $query->where(function (Builder $q) use ($formulation, $primarySalt) {
                $q->where('formulation', 'like', '%' . $formulation . '%');
                if ($primarySalt !== '' && strlen($primarySalt) >= 3 && strtolower($primarySalt) !== strtolower($formulation)) {
                    $q->orWhere('formulation', 'like', '%' . $primarySalt . '%');
                }
            });
        } elseif (!empty($product->category_id)) {
            $matchType = 'category';
            $query->where('category_id', $product->category_id);
        } else {
            return response()->json([
                'product' => [
                    'id'              => $product->id,
                    'name'            => $product->name,
                    'formulation'     => $product->formulation,
                    'unit_sale_price' => (float) ($product->unit_sale_price ?? 0),
                    'quantity'        => (int) ($product->quantity ?? 0),
                ],
                'match_type'  => 'none',
                'substitutes' => [],
            ]);
        }

        $substitutes = $query
            ->orderByRaw('CASE WHEN COALESCE(quantity, 0) > 0 THEN 0 ELSE 1 END')
            ->orderBy('unit_sale_price', 'asc')
            ->limit(25)
            ->get()
            ->map(function (Product $sub) use ($product, $formulation) {
                $fefoBatch = $sub->batches->first(fn ($b) => !$b->is_expired && (int) $b->quantity > 0)
                    ?? $sub->batches->first();

                $effectiveUnitPrice = ($fefoBatch && $fefoBatch->unit_sale_price !== null && (float) $fefoBatch->unit_sale_price > 0)
                    ? (float) $fefoBatch->unit_sale_price
                    : (float) ($sub->unit_sale_price ?? 0);

                $basePrice = (float) ($product->unit_sale_price ?? 0);
                $priceDiff = round($effectiveUnitPrice - $basePrice, 2);

                $isExactFormulation = $formulation !== ''
                    && strtolower(trim((string) $sub->formulation)) === strtolower($formulation);

                return [
                    'id'                    => $sub->id,
                    'name'                  => $sub->name,
                    'product_code'          => $sub->product_code,
                    'barcode'               => $sub->barcode,
                    'formulation'           => $sub->formulation,
                    'is_exact_formulation'  => $isExactFormulation,
                    'rack'                  => $sub->rack,
                    'pack_size'             => (int) ($sub->pack_size ?? 1),
                    'quantity'              => (int) ($sub->quantity ?? 0),
                    'unit_sale_price'       => $effectiveUnitPrice,
                    'pack_sale_price'       => (float) ($sub->pack_sale_price ?? 0),
                    'whole_sale_unit_price' => (float) ($sub->whole_sale_unit_price ?? 0),
                    'whole_sale_pack_price' => (float) ($sub->whole_sale_pack_price ?? 0),
                    'price_diff'            => $priceDiff,
                    'brand'                 => $sub->brand,
                    'category'              => $sub->category,
                    'Earliest_expiry'       => $fefoBatch?->expiry_date,
                    'fefo_batch'            => $fefoBatch ? [
                        'id'              => $fefoBatch->id,
                        'batch_number'    => $fefoBatch->batch_number,
                        'expiry_date'     => $fefoBatch->expiry_date,
                        'quantity'        => (int) $fefoBatch->quantity,
                        'unit_sale_price' => $effectiveUnitPrice,
                    ] : null,
                ];
            });

        return response()->json([
            'product' => [
                'id'              => $product->id,
                'name'            => $product->name,
                'formulation'     => $product->formulation,
                'category_id'     => $product->category_id,
                'unit_sale_price' => (float) ($product->unit_sale_price ?? 0),
                'quantity'        => (int) ($product->quantity ?? 0),
            ],
            'match_type'  => $matchType,
            'substitutes' => $substitutes,
        ]);
    }

    /**
     * List all mapped suppliers for a product (Multi-Supplier Catalog).
     * GET /api/products/{product}/suppliers
     */
    public function getSuppliers(Product $product)
    {
        $this->authorize('view', $product);

        if (!Schema::hasTable('product_suppliers')) {
            return response()->json([]);
        }

        $links = ProductSupplier::with('supplier:id,name,phone,email')
            ->where('product_id', $product->id)
            ->orderByDesc('is_preferred')
            ->orderBy('id')
            ->get();

        return response()->json($links);
    }

    /**
     * Add or update a supplier mapping for a product.
     * POST /api/products/{product}/suppliers
     */
    public function saveSupplier(Request $request, Product $product)
    {
        $this->authorize('update', $product);

        $validated = $request->validate([
            'supplier_id'         => ['required', 'integer', 'exists:suppliers,id'],
            'supplier_sku'        => ['nullable', 'string', 'max:100'],
            'last_purchase_price' => ['nullable', 'numeric', 'min:0'],
            'lead_time_days'      => ['nullable', 'integer', 'min:0', 'max:365'],
            'min_order_qty'       => ['nullable', 'integer', 'min:1'],
            'is_preferred'        => ['nullable', 'boolean'],
            'notes'               => ['nullable', 'string', 'max:255'],
        ]);

        if (!empty($validated['is_preferred'])) {
            ProductSupplier::where('product_id', $product->id)
                ->where('supplier_id', '!=', $validated['supplier_id'])
                ->update(['is_preferred' => false]);
        }

        $record = ProductSupplier::updateOrCreate(
            [
                'product_id'  => $product->id,
                'supplier_id' => $validated['supplier_id'],
            ],
            [
                'supplier_sku'        => $validated['supplier_sku'] ?? null,
                'last_purchase_price' => $validated['last_purchase_price'] ?? $product->unit_purchase_price,
                'lead_time_days'      => $validated['lead_time_days'] ?? null,
                'min_order_qty'       => $validated['min_order_qty'] ?? 1,
                'is_preferred'        => (bool) ($validated['is_preferred'] ?? false),
                'notes'               => $validated['notes'] ?? null,
            ]
        );

        return response()->json($record->load('supplier:id,name,phone,email'), 201);
    }

    /**
     * Remove a secondary supplier mapping from a product.
     * DELETE /api/products/{product}/suppliers/{supplierId}
     */
    public function removeSupplier(Product $product, int $supplierId)
    {
        $this->authorize('update', $product);

        if ((int) $product->supplier_id === $supplierId) {
            return response()->json([
                'message' => 'Cannot remove the primary supplier. Change the product primary supplier first.',
            ], 422);
        }

        ProductSupplier::where('product_id', $product->id)
            ->where('supplier_id', $supplierId)
            ->delete();

        return response()->json(['message' => 'Supplier mapping removed']);
    }
}
