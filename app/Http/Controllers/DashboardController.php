<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Models\SaleInvoice;
use App\Models\PurchaseInvoice;
use App\Models\SaleReturn;
use App\Models\PurchaseReturn;

class DashboardController extends Controller
{
    private function authorizeDashboardAction(Request $request, array $permissions): void
    {
        $user = $request->user();
        if (!$user) {
            abort(401, 'Unauthenticated.');
        }
        if ($user->hasRole(['Admin', 'admin', 'super-admin'])) {
            return;
        }
        foreach ($permissions as $perm) {
            if ($user->can($perm)) {
                return;
            }
        }
        abort(403, 'This action is unauthorized.');
    }

    /**
     * GET /api/dashboard/summary?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
     * If date_from/date_to are missing, defaults to today (local app timezone).
     */
    public function summary(Request $request)
    {
        $this->authorizeDashboardAction($request, [
            'sale-invoice.view',
            'purchase-invoice.view',
            'report.sale-detail.view',
            'report.purchase-detail.view',
            'report.cost-of-sale.view',
        ]);

        // Default to "today" if user didn't pick dates
        $today = now()->toDateString();
        $from = $request->query('date_from', $today);
        $to   = $request->query('date_to', $today);

        // Lightweight validation only if present
        $request->validate([
            'date_from' => ['nullable', 'date'],
            'date_to'   => ['nullable', 'date', 'after_or_equal:date_from'],
        ]);

        $totalsOnly = $request->boolean('totals_only');
        $toEnd = $to . ' 23:59:59';

        $applyPurchaseDateRange = function ($q) use ($from, $toEnd) {
            $q->whereBetween('posted_date', [$from, $toEnd])
              ->orWhere(function ($fallback) use ($from, $toEnd) {
                  $fallback->whereNull('posted_date')->whereBetween('created_at', [$from, $toEnd]);
              });
        };

        if ($totalsOnly) {
            $salesAgg = SaleInvoice::whereBetween('date', [$from, $toEnd])
                ->selectRaw("COALESCE(SUM(total), 0) as total, COALESCE(SUM(CASE WHEN invoice_type = 'credit' THEN total ELSE 0 END), 0) as credit_total")
                ->first();
            $purchasesAgg = PurchaseInvoice::where($applyPurchaseDateRange)
                ->selectRaw("COALESCE(SUM(total_amount), 0) as total, COALESCE(SUM(CASE WHEN invoice_type = 'credit' THEN total_amount ELSE 0 END), 0) as credit_total")
                ->first();
            $saleReturnsTotal = (float) SaleReturn::whereBetween('date', [$from, $toEnd])->sum('total');
            $purchaseReturnsTotal = (float) PurchaseReturn::whereBetween('date', [$from, $toEnd])->sum('total');

            $salesTotal = (float) ($salesAgg->total ?? 0);
            $salesCredit = (float) ($salesAgg->credit_total ?? 0);
            $purchasesTotal = (float) ($purchasesAgg->total ?? 0);
            $purchasesCredit = (float) ($purchasesAgg->credit_total ?? 0);

            return response()->json([
                'totals' => [
                    'sales'            => $salesTotal,
                    'purchases'        => $purchasesTotal,
                    'sale_returns'     => $saleReturnsTotal,
                    'purchase_returns' => $purchaseReturnsTotal,
                    'net_sales'        => $salesTotal - $saleReturnsTotal,
                    'sales_credit'     => $salesCredit,
                    'sales_debit'      => $salesTotal - $salesCredit,
                    'purchases_credit' => $purchasesCredit,
                    'purchases_debit'  => $purchasesTotal - $purchasesCredit,
                ],
                'series' => [
                    'sales'            => [],
                    'purchases'        => [],
                    'sale_returns'     => [],
                    'purchase_returns' => [],
                ],
            ]);
        }

        // ---- Single-pass grouped queries (compute both daily series and period totals in 4 SARGable indexed queries) ----
        $salesRows = SaleInvoice::selectRaw("SUBSTR(date, 1, 10) as date, COALESCE(SUM(total), 0) as value, COALESCE(SUM(CASE WHEN invoice_type = 'credit' THEN total ELSE 0 END), 0) as credit_value")
            ->whereBetween('date', [$from, $toEnd])
            ->groupBy(DB::raw('SUBSTR(date, 1, 10)'))
            ->orderBy('date')
            ->get();

        $purchaseRows = PurchaseInvoice::selectRaw("SUBSTR(COALESCE(posted_date, created_at), 1, 10) as date, COALESCE(SUM(total_amount), 0) as value, COALESCE(SUM(CASE WHEN invoice_type = 'credit' THEN total_amount ELSE 0 END), 0) as credit_value")
            ->where($applyPurchaseDateRange)
            ->groupBy(DB::raw('SUBSTR(COALESCE(posted_date, created_at), 1, 10)'))
            ->orderBy('date')
            ->get();

        $saleReturnRows = SaleReturn::selectRaw('SUBSTR(date, 1, 10) as date, COALESCE(SUM(total), 0) as value')
            ->whereBetween('date', [$from, $toEnd])
            ->groupBy(DB::raw('SUBSTR(date, 1, 10)'))
            ->orderBy('date')
            ->get();

        $purchaseReturnRows = PurchaseReturn::selectRaw('SUBSTR(date, 1, 10) as date, COALESCE(SUM(total), 0) as value')
            ->whereBetween('date', [$from, $toEnd])
            ->groupBy(DB::raw('SUBSTR(date, 1, 10)'))
            ->orderBy('date')
            ->get();

        $salesTotal = (float) $salesRows->sum('value');
        $salesCredit = (float) $salesRows->sum('credit_value');
        $salesDebit = $salesTotal - $salesCredit;

        $purchasesTotal = (float) $purchaseRows->sum('value');
        $purchasesCredit = (float) $purchaseRows->sum('credit_value');
        $purchasesDebit = $purchasesTotal - $purchasesCredit;

        $saleReturnsTotal = (float) $saleReturnRows->sum('value');
        $purchaseReturnsTotal = (float) $purchaseReturnRows->sum('value');

        $totals = [
            'sales'            => $salesTotal,
            'purchases'        => $purchasesTotal,
            'sale_returns'     => $saleReturnsTotal,
            'purchase_returns' => $purchaseReturnsTotal,
            'net_sales'        => $salesTotal - $saleReturnsTotal,
            'sales_credit'     => $salesCredit,
            'sales_debit'      => $salesDebit,
            'purchases_credit' => $purchasesCredit,
            'purchases_debit'  => $purchasesDebit,
        ];

        $salesSeries = $salesRows->map(fn ($r) => ['date' => $r->date, 'value' => (float) $r->value]);
        $purchaseSeries = $purchaseRows->map(fn ($r) => ['date' => $r->date, 'value' => (float) $r->value]);
        $saleReturnSeries = $saleReturnRows->map(fn ($r) => ['date' => (string) $r->date, 'value' => (float) $r->value]);
        $purchaseReturnSeries = $purchaseReturnRows->map(fn ($r) => ['date' => substr($r->date, 0, 10), 'value' => (float) $r->value]);

        return response()->json([
            'totals' => $totals,
            'series' => [
                'sales'            => $salesSeries,
                'purchases'        => $purchaseSeries,
                'sale_returns'     => $saleReturnSeries,
                'purchase_returns' => $purchaseReturnSeries,
            ],
        ]);
    }

public function nearExpiry(Request $request)
{
    $this->authorizeDashboardAction($request, ['product.view', 'report.near-expiry-product.view']);
    $months = (int) $request->query('months', 3);
    if (!in_array($months, [1,3,6,12,18], true)) {
        $months = 3;
    }

    $supplierId = $request->query('supplier_id');
    $brandId    = $request->query('brand_id');

    $today = now()->toDateString();
    $to    = now()->copy()->addMonths($months)->toDateString();

        $q = DB::table('batches as b')
            ->join('products as p', 'p.id', '=', 'b.product_id')
            ->leftJoin('suppliers as s', 's.id', '=', 'p.supplier_id')
            ->leftJoin('brands as br', 'br.id', '=', 'p.brand_id')
            ->whereNotNull('b.expiry_date')
            ->whereBetween('b.expiry_date', [$today, $to])
            ->where('b.quantity', '>', 0); // Only show products with available quantity > 0

    if (!empty($supplierId)) $q->where('p.supplier_id', $supplierId);
    if (!empty($brandId))    $q->where('p.brand_id', $brandId);

    $rows = $q->orderBy('b.expiry_date')
        ->select(
            'b.id as batch_id',
            'b.batch_number',
            'b.expiry_date',
            'b.quantity',
            'p.id as product_id',
            'p.product_code',
            'p.name as product_name',
            'p.supplier_id',
            'p.brand_id',
            DB::raw('COALESCE(s.name, "") as supplier_name'),
            DB::raw('COALESCE(br.name, "") as brand_name')
        )
        ->limit(1000)
        ->get();

    return response()->json([
        'months' => $months,
        'from'   => $today,
        'to'     => $to,
        'rows'   => $rows,
    ]);
}

public function nearExpiryFilters(Request $request)
{
    $this->authorizeDashboardAction($request, ['product.view', 'report.near-expiry-product.view']);
    $suppliers = DB::table('suppliers')->select('id','name')->orderBy('name')->get();
    $brands    = DB::table('brands')->select('id','name')->orderBy('name')->get();
    return response()->json(compact('suppliers','brands'));
}

    /**
     * GET /api/dashboard/invoice-counts
     * Returns total counts of sale and purchase invoices
     */
    public function invoiceCounts(Request $request)
    {
        $this->authorizeDashboardAction($request, [
            'sale-invoice.view',
            'purchase-invoice.view',
            'report.sale-detail.view',
            'report.purchase-detail.view',
        ]);
        $counts = DB::selectOne('
            SELECT
                (SELECT COUNT(*) FROM sale_invoices) as sale_invoices,
                (SELECT COUNT(*) FROM purchase_invoices) as purchase_invoices
        ');
        $saleCount = (int) ($counts->sale_invoices ?? 0);
        $purchaseCount = (int) ($counts->purchase_invoices ?? 0);
        
        return response()->json([
            'sale_invoices' => $saleCount,
            'purchase_invoices' => $purchaseCount,
            'total' => $saleCount + $purchaseCount,
        ]);
    }

    /**
     * GET /api/dashboard/sales-by-category
     * Returns sales data grouped by product category
     */
    public function salesByCategory(Request $request)
    {
        $this->authorizeDashboardAction($request, [
            'sale-invoice.view',
            'report.sale-detail.view',
            'report.cost-of-sale.view',
        ]);
        $today = now()->toDateString();
        $from = $request->query('date_from', now()->startOfMonth()->toDateString());
        $to = $request->query('date_to', $today);

        // Get sales by category from sale_invoice_items joined with products and categories
        $query = DB::table('sale_invoice_items as sii')
            ->join('sale_invoices as si', 'si.id', '=', 'sii.sale_invoice_id')
            ->join('products as p', 'p.id', '=', 'sii.product_id')
            ->leftJoin('categories as c', 'c.id', '=', 'p.category_id')
            ->whereBetween('si.date', [$from, $to]);

        if (\App\Support\SchemaCache::hasColumn('sale_invoices', 'status')) {
            $query->where(function ($q) {
                $q->whereNull('si.status')->orWhere('si.status', '!=', 'reversed');
            });
        }

        $data = $query
            ->select(
                DB::raw("COALESCE(c.name, 'Uncategorized') as category"),
                DB::raw("COALESCE(c.name, 'Uncategorized') as name"),
                DB::raw('COALESCE(SUM(COALESCE(sii.sub_total, sii.quantity * sii.price, 0)), 0) as value'),
                DB::raw('COALESCE(SUM(COALESCE(sii.sub_total, sii.quantity * sii.price, 0)), 0) as revenue')
            )
            ->groupBy('c.name')
            ->orderByDesc('value')
            ->limit(10)
            ->get();

        return response()->json(['data' => $data]);
    }

    /**
     * GET /api/dashboard/kpi-metrics
     * Returns various KPI metrics for the dashboard
     */
    public function kpiMetrics(Request $request)
    {
        $this->authorizeDashboardAction($request, [
            'product.view',
            'sale-invoice.view',
            'purchase-invoice.view',
            'customer.view',
            'supplier.view',
            'user.view',
            'report.current-stock.view',
        ]);
        $request->validate([
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date', 'after_or_equal:date_from'],
        ]);
        $today = now()->toDateString();
        $from = $request->query('date_from', $today);
        $to = $request->query('date_to', $today);

        $canViewValuation = $request->user()?->hasRole(['Admin', 'admin', 'super-admin'])
            || $request->user()?->can('product.view')
            || $request->user()?->can('report.current-stock.view');

        // Combine all 3 product table aggregates (count, units, valuation) into a single scan
        $productStats = DB::table('products')
            ->selectRaw(
                $canViewValuation
                    ? 'COUNT(*) as active_products, COALESCE(SUM(quantity), 0) as stock_units, COALESCE(SUM(COALESCE(quantity,0) * COALESCE(avg_price, unit_purchase_price, pack_purchase_price, 0)), 0) as stock_value'
                    : 'COUNT(*) as active_products, COALESCE(SUM(quantity), 0) as stock_units'
            )
            ->first();

        $activeProducts = (int) ($productStats->active_products ?? 0);
        $stockUnits = (float) ($productStats->stock_units ?? 0);
        $stockValue = $canViewValuation ? (float) ($productStats->stock_value ?? 0) : null;

        // Combine simple entity counts into 1 scalar-subquery round-trip
        $threeMonthsOut = now()->addMonths(3)->toDateString();
        $counts = DB::selectOne("
            SELECT
                (SELECT COUNT(*) FROM suppliers) as suppliers,
                (SELECT COUNT(*) FROM customers) as customers,
                (SELECT COUNT(*) FROM brands) as brands,
                (SELECT COUNT(*) FROM categories) as categories,
                (SELECT COUNT(*) FROM users) as users,
                (SELECT COUNT(*) FROM stock_adjustments) as stock_adjustments,
                (SELECT COUNT(*) FROM user_demands WHERE status = 'pending') as pending_demands,
                (SELECT COUNT(*) FROM batches b WHERE b.expiry_date IS NOT NULL AND b.expiry_date > ? AND b.expiry_date <= ?) as near_expiry
        ", [$today, $threeMonthsOut]);

        $supplierCount = (int) ($counts->suppliers ?? 0);
        $customerCount = (int) ($counts->customers ?? 0);
        $brandCount = (int) ($counts->brands ?? 0);
        $categoryCount = (int) ($counts->categories ?? 0);
        $userCount = (int) ($counts->users ?? 0);
        $stockAdjustmentCount = (int) ($counts->stock_adjustments ?? 0);
        $pendingDemandsCount = (int) ($counts->pending_demands ?? 0);
        $nearExpiryCount = (int) ($counts->near_expiry ?? 0);

        // Low stock count — running products (ever purchased) whose on-hand
        // quantity has dropped below pack_size. Mirrors the notification logic.
        $lowStockCount = DB::table('products as p')
            ->whereExists(function ($sub) {
                $sub->select(DB::raw(1))
                    ->from('purchase_invoice_items as pii')
                    ->whereColumn('pii.product_id', 'p.id');
            })
            ->whereNotNull('p.quantity')
            ->whereColumn('p.quantity', '<', 'p.pack_size')
            ->count();

        return response()->json([
            'active_products'    => $activeProducts,
            'customers'          => $customerCount,
            'suppliers'          => $supplierCount,
            'brands'             => $brandCount,
            'categories'         => $categoryCount,
            'users'              => $userCount,
            'near_expiry'        => $nearExpiryCount,
            'low_stock'          => $lowStockCount,
            'stock_adjustments'  => $stockAdjustmentCount,
            'pending_demands'    => $pendingDemandsCount,
            'stock_units'        => $stockUnits,
            'stock_value'        => $stockValue,
            'expected_orders_amount' => $request->user()->can('viewAny', \App\Models\PurchaseOrder::class)
                ? \App\Models\PurchaseOrder::expectedAmountBetween(
                    $request->query('date_from', now('Asia/Karachi')->toDateString()),
                    $request->query('date_to', now('Asia/Karachi')->toDateString())
                ) : null,
        ]);
    }

    /**
     * GET /api/dashboard/sales-by-brands
     * Returns sales data grouped by product brand
     */
    public function salesByBrands(Request $request)
    {
        $this->authorizeDashboardAction($request, [
            'sale-invoice.view',
            'report.sale-detail.view',
            'report.cost-of-sale.view',
        ]);
        $today = now()->toDateString();
        $from = $request->query('date_from', now()->startOfMonth()->toDateString());
        $to = $request->query('date_to', $today);

        // Get sales by brand from sale_invoice_items joined with products and brands
        $data = DB::table('sale_invoice_items as sii')
            ->join('sale_invoices as si', 'si.id', '=', 'sii.sale_invoice_id')
            ->join('products as p', 'p.id', '=', 'sii.product_id')
            ->leftJoin('brands as br', 'br.id', '=', 'p.brand_id')
            ->whereBetween('si.date', [$from, $to])
            ->select(
                DB::raw('COALESCE(br.name, "No Brand") as brand'),
                DB::raw('SUM(sii.sub_total) as revenue')
            )
            ->groupBy('br.name')
            ->orderByDesc('revenue')
            ->limit(5)
            ->get();

        return response()->json(['data' => $data]);
    }

    /**
     * GET /api/dashboard/top-products
     * Returns top selling products by quantity sold
     */
    public function topProducts(Request $request)
    {
        $this->authorizeDashboardAction($request, [
            'sale-invoice.view',
            'report.sale-detail.view',
            'report.cost-of-sale.view',
        ]);
        $today = now()->toDateString();
        $from = $request->query('date_from', now()->startOfMonth()->toDateString());
        $to = $request->query('date_to', $today);
        $limit = (int) $request->query('limit', 10);

        $data = DB::table('sale_invoice_items as sii')
            ->join('sale_invoices as si', 'si.id', '=', 'sii.sale_invoice_id')
            ->join('products as p', 'p.id', '=', 'sii.product_id')
            ->whereBetween('si.date', [$from, $to])
            ->select(
                'p.id',
                'p.name as product_name',
                DB::raw('SUM(sii.quantity) as total_sold'),
                DB::raw('SUM(sii.sub_total) as revenue')
            )
            ->groupBy('p.id', 'p.name')
            ->orderByDesc('total_sold')
            ->limit($limit)
            ->get();

        return response()->json(['data' => $data]);
    }
}
