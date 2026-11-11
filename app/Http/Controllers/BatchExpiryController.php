<?php

namespace App\Http\Controllers;

use App\Models\Batch;
use App\Models\Product;
use App\Models\Setting;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class BatchExpiryController extends Controller
{
    private function authorizeExpiryAction(string|array $permissions): void
    {
        $user = request()->user() ?? auth()->user();
        if (!$user) {
            abort(401, 'Unauthenticated.');
        }
        if ($user->hasRole(['Admin', 'admin', 'super-admin'])) {
            return;
        }
        foreach ((array) $permissions as $perm) {
            if ($user->can($perm)) {
                return;
            }
        }
        abort(403, 'This action is unauthorized.');
    }

    /**
     * Get the active global warning days setting.
     */
    private function getGlobalWarningDays(): int
    {
        $setting = Setting::first();
        return (int) ($setting?->expiry_warning_days ?? 90);
    }

    /**
     * Get the active global critical days setting.
     */
    private function getGlobalCriticalDays(?Setting $setting = null): int
    {
        $setting = $setting ?? Setting::first();
        $critical = (int) ($setting?->expiry_critical_days ?? 30);
        return max(1, $critical);
    }

    /**
     * Get the active daily flash reminder limit setting.
     */
    private function getDailyFlashLimit(?Setting $setting = null): int
    {
        $setting = $setting ?? Setting::first();
        $limit = (int) ($setting?->expiry_daily_flash_limit ?? 5);
        return max(1, min(20, $limit));
    }

    /**
     * Compute human-friendly months remaining bucket and label from days remaining.
     * Uses 30.4375 average days/month so 30d=1M, 60d=2M, 90d=3M, 180d=6M, 210d/addMonths(7)=7M, 365d=12M.
     */
    public static function computeMonthsRemainingMeta(int $daysRemaining): array
    {
        if ($daysRemaining < 0) {
            return [
                'months_remaining' => 0,
                'months_remaining_label' => 'Expired',
            ];
        }
        if ($daysRemaining === 0) {
            return [
                'months_remaining' => 1,
                'months_remaining_label' => 'Expires Today',
            ];
        }

        $months = max(1, (int) ceil($daysRemaining / 30.4375));
        $label = $months === 1 ? '1 Month Left' : "{$months} Months Left";

        return [
            'months_remaining' => $months,
            'months_remaining_label' => $label,
        ];
    }

    /**
     * GET /api/batch-expiry
     *
     * List batches with expiry analysis, status categorization, days & months remaining,
     * financial value at risk, and summary metrics.
     */
    public function index(Request $request)
    {
        $this->authorizeExpiryAction(['batch-expiry.view', 'product.view', 'product.update']);

        $setting = Setting::first();
        $globalWarningDays = (int) ($setting?->expiry_warning_days ?? 90);
        $globalCriticalDays = $this->getGlobalCriticalDays($setting);
        $dailyFlashLimit = $this->getDailyFlashLimit($setting);

        $statusFilter = $request->query('status', 'all'); // all, expired, critical, warning, safe
        $monthsParam = $request->query('months');
        $monthsFilter = ($monthsParam !== null && $monthsParam !== '' && is_numeric($monthsParam))
            ? max(1, (int) $monthsParam)
            : null;
        $monthsMode = strtolower((string) $request->query('months_mode', 'exact')) === 'within'
            ? 'within'
            : 'exact';

        $search = trim((string) $request->query('search', ''));
        $productId = $request->query('product_id');
        $supplierId = $request->query('supplier_id');
        $brandId = $request->query('brand_id');
        $categoryId = $request->query('category_id');
        $storageLocationId = $request->query('storage_location_id');
        $includeZeroQty = $request->boolean('include_zero_qty', false);
        $hasCustom = $request->query('has_custom_warning');
        $sortBy = $request->query('sort_by', 'expiry_date');
        $sortDir = strtolower($request->query('sort_dir', 'asc')) === 'desc' ? 'desc' : 'asc';
        $perPage = max(1, min((int) $request->query('per_page', 25), 500));
        $page = max(1, (int) $request->query('page', 1));

        $hasStorageLocations = \App\Support\SchemaCache::hasTable('storage_locations')
            && \App\Support\SchemaCache::hasColumn('batches', 'storage_location_id');
        $hasBatchPricing = \App\Support\SchemaCache::hasColumn('batches', 'unit_sale_price');
        $hasExpiryPolicy = \App\Support\SchemaCache::hasColumn('brands', 'expiry_return_policy')
            && \App\Support\SchemaCache::hasColumn('suppliers', 'expiry_return_policy');
        $hasProductCriticalCol = \App\Support\SchemaCache::hasColumn('products', 'expiry_critical_days');

        // Base query: batches with expiry_date set
        $query = DB::table('batches as b')
            ->join('products as p', 'p.id', '=', 'b.product_id')
            ->leftJoin('suppliers as s', 's.id', '=', 'p.supplier_id')
            ->leftJoin('brands as br', 'br.id', '=', 'p.brand_id')
            ->leftJoin('categories as c', 'c.id', '=', 'p.category_id')
            ->whereNotNull('b.expiry_date');

        if (!$includeZeroQty) {
            $query->where('b.quantity', '>', 0);
        }

        if ($hasStorageLocations) {
            $query->leftJoin('storage_locations as sl', 'sl.id', '=', 'b.storage_location_id');
        }

        if ($search !== '') {
            $query->where(function ($q) use ($search, $hasStorageLocations) {
                $q->where('p.name', 'like', "%{$search}%")
                  ->orWhere('p.product_code', 'like', "%{$search}%")
                  ->orWhere('p.barcode', 'like', "%{$search}%")
                  ->orWhere('b.batch_number', 'like', "%{$search}%");
                if ($hasStorageLocations) {
                    $q->orWhere('b.rack', 'like', "%{$search}%")
                      ->orWhere('sl.name', 'like', "%{$search}%");
                }
            });
        }

        if (!empty($productId)) {
            $query->where('p.id', $productId);
        }
        if (!empty($supplierId)) {
            $query->where('p.supplier_id', $supplierId);
        }
        if (!empty($brandId)) {
            $query->where('p.brand_id', $brandId);
        }
        if (!empty($categoryId)) {
            $query->where('p.category_id', $categoryId);
        }
        if ($hasStorageLocations && !empty($storageLocationId)) {
            $query->where('b.storage_location_id', $storageLocationId);
        }
        if ($hasCustom === '1' || $hasCustom === 'true') {
            $query->where(function ($q) use ($hasProductCriticalCol) {
                $q->whereNotNull('p.expiry_warning_days');
                if ($hasProductCriticalCol) {
                    $q->orWhereNotNull('p.expiry_critical_days');
                }
            });
        } elseif ($hasCustom === '0' || $hasCustom === 'false') {
            $query->whereNull('p.expiry_warning_days');
            if ($hasProductCriticalCol) {
                $query->whereNull('p.expiry_critical_days');
            }
        }

        $selectColumns = [
            'b.id as batch_id',
            'b.batch_number',
            'b.expiry_date',
            'b.quantity',
            'b.created_at as batch_created_at',
            'p.id as product_id',
            'p.product_code',
            'p.barcode',
            'p.name as product_name',
            'p.pack_size',
            'p.quantity as product_total_qty',
            'p.unit_purchase_price',
            'p.pack_purchase_price',
            'p.unit_sale_price',
            'p.pack_sale_price',
            'p.avg_price',
            'p.rack as product_rack',
            'p.expiry_warning_days as product_warning_days',
            'p.supplier_id',
            'p.brand_id',
            'p.category_id',
            DB::raw('COALESCE(s.name, "") as supplier_name'),
            DB::raw('COALESCE(s.phone, "") as supplier_phone'),
            DB::raw('COALESCE(br.name, "") as brand_name'),
            DB::raw('COALESCE(c.name, "") as category_name'),
        ];

        if ($hasProductCriticalCol) {
            $selectColumns[] = 'p.expiry_critical_days as product_critical_days';
        }

        if ($hasBatchPricing) {
            $selectColumns[] = 'b.unit_sale_price as batch_unit_sale_price';
            $selectColumns[] = 'b.unit_purchase_price as batch_unit_purchase_price';
            $selectColumns[] = 'b.pack_sale_price as batch_pack_sale_price';
            $selectColumns[] = 'b.pack_purchase_price as batch_pack_purchase_price';
            $selectColumns[] = 'b.whole_sale_unit_price as batch_whole_sale_unit_price';
            $selectColumns[] = 'b.whole_sale_pack_price as batch_whole_sale_pack_price';
        }

        if ($hasExpiryPolicy) {
            $selectColumns[] = 'br.expiry_return_policy as brand_expiry_return_policy';
            $selectColumns[] = 'br.expiry_return_months as brand_expiry_return_months';
            $selectColumns[] = 'br.expiry_return_days as brand_expiry_return_days';
            $selectColumns[] = 's.expiry_return_policy as supplier_expiry_return_policy';
            $selectColumns[] = 's.expiry_return_months as supplier_expiry_return_months';
            $selectColumns[] = 's.expiry_return_days as supplier_expiry_return_days';
        }

        if ($hasStorageLocations) {
            $selectColumns[] = 'b.storage_location_id';
            $selectColumns[] = 'p.storage_location_id as product_storage_location_id';
            $selectColumns[] = 'b.rack as batch_rack';
            $selectColumns[] = DB::raw('COALESCE(sl.name, "") as storage_location_name');
            $selectColumns[] = DB::raw('COALESCE(sl.code, "") as storage_location_code');
            $selectColumns[] = DB::raw('COALESCE(sl.type, "shop") as storage_location_type');
        }

        $allRows = $query->select(...$selectColumns)->get();

        $monthBuckets = [];
        for ($m = 1; $m <= 12; $m++) {
            $monthBuckets[(string) $m] = 0;
        }
        $monthBuckets['12+'] = 0;

        // Process rows in memory for accurate date math, financial value, and summary KPIs
        $summary = [
            'total_batches_tracked' => 0,
            'total_expired_batches' => 0,
            'total_expired_qty' => 0,
            'total_expired_value' => 0.0,
            'total_critical_batches' => 0,
            'total_critical_qty' => 0,
            'total_critical_value' => 0.0,
            'total_warning_batches' => 0,
            'total_warning_qty' => 0,
            'total_warning_value' => 0.0,
            'total_stock_value_at_risk' => 0.0,
            'global_warning_days' => $globalWarningDays,
            'global_critical_days' => $globalCriticalDays,
            'daily_flash_limit' => $dailyFlashLimit,
            'month_buckets' => $monthBuckets,
        ];

        $enriched = [];

        foreach ($allRows as $row) {
            // Resolve Brand / Supplier Expiry Return Policy
            $resolvedPolicy = 'before_expiry';
            $resolvedPolicyMonths = 3;
            $resolvedPolicyDays = 90;
            if ($hasExpiryPolicy) {
                if (!empty($row->brand_id) && !empty($row->brand_expiry_return_policy)) {
                    $resolvedPolicy = (string) $row->brand_expiry_return_policy;
                    $resolvedPolicyMonths = (int) ($row->brand_expiry_return_months ?? 3);
                    $resolvedPolicyDays = (int) ($row->brand_expiry_return_days ?? 90);
                } elseif (!empty($row->supplier_id) && !empty($row->supplier_expiry_return_policy)) {
                    $resolvedPolicy = (string) $row->supplier_expiry_return_policy;
                    $resolvedPolicyMonths = (int) ($row->supplier_expiry_return_months ?? 3);
                    $resolvedPolicyDays = (int) ($row->supplier_expiry_return_days ?? 90);
                }
            }

            $intimationMeta = BrandController::evaluateBatchIntimation(
                (string) $row->expiry_date,
                $resolvedPolicy,
                $resolvedPolicyMonths,
                $resolvedPolicyDays
            );
            $daysRemaining = (int) $intimationMeta['days_remaining'];
            $monthsMeta = self::computeMonthsRemainingMeta($daysRemaining);
            $monthsRemaining = $monthsMeta['months_remaining'];

            $warningDays = $row->product_warning_days !== null
                ? (int) $row->product_warning_days
                : $globalWarningDays;

            $productCriticalDays = ($hasProductCriticalCol && $row->product_critical_days !== null)
                ? (int) $row->product_critical_days
                : null;

            $criticalDays = $productCriticalDays !== null
                ? $productCriticalDays
                : min($globalCriticalDays, $warningDays);

            if ($warningDays < $criticalDays) {
                $warningDays = $criticalDays;
            }

            // Determine status using user-configured critical and warning thresholds
            if ($daysRemaining < 0) {
                $status = 'expired';
            } elseif ($daysRemaining <= $criticalDays) {
                $status = 'critical';
            } elseif ($daysRemaining <= $warningDays || ($resolvedPolicyDays > 90 && $intimationMeta['is_intimation_due'])) {
                $status = 'warning';
            } else {
                $status = 'safe';
            }

            // Estimate unit cost (prefer batch-specific cost, then product cost)
            $packSize = max(1, (int) ($row->pack_size ?? 1));
            $unitCost = (float) ($row->batch_unit_purchase_price ?? $row->unit_purchase_price ?? 0);
            if ($unitCost <= 0 && !empty($row->avg_price)) {
                $unitCost = (float) $row->avg_price;
            }
            if ($unitCost <= 0 && !empty($row->pack_purchase_price)) {
                $unitCost = (float) $row->pack_purchase_price / $packSize;
            }
            $unitSalePrice = (float) ($row->batch_unit_sale_price ?? $row->unit_sale_price ?? 0);

            $qty = (int) $row->quantity;
            $valueAtRisk = round($qty * $unitCost, 2);
            $retailValue = round($qty * $unitSalePrice, 2);

            // Update global metrics (for all batches matching query filters before status/month tab)
            $summary['total_batches_tracked']++;
            $summary['total_stock_value_at_risk'] += $valueAtRisk;

            if ($daysRemaining >= 0) {
                if ($monthsRemaining <= 12) {
                    $monthBuckets[(string) $monthsRemaining] = ($monthBuckets[(string) $monthsRemaining] ?? 0) + 1;
                } else {
                    $monthBuckets['12+']++;
                }
            }

            if ($status === 'expired') {
                $summary['total_expired_batches']++;
                $summary['total_expired_qty'] += $qty;
                $summary['total_expired_value'] += $valueAtRisk;
            } elseif ($status === 'critical') {
                $summary['total_critical_batches']++;
                $summary['total_critical_qty'] += $qty;
                $summary['total_critical_value'] += $valueAtRisk;
            }

            if ($daysRemaining <= $warningDays) {
                $summary['total_warning_batches']++;
                $summary['total_warning_qty'] += $qty;
                $summary['total_warning_value'] += $valueAtRisk;
            }

            $item = (array) $row;
            $item['days_remaining'] = $daysRemaining;
            $item['months_remaining'] = $monthsRemaining;
            $item['months_remaining_label'] = $monthsMeta['months_remaining_label'];
            $item['product_critical_days'] = $productCriticalDays;
            $item['effective_warning_days'] = $warningDays;
            $item['effective_critical_days'] = $criticalDays;
            $item['has_custom_warning'] = ($row->product_warning_days !== null || $productCriticalDays !== null);
            $item['status'] = $status;
            $item['should_flash_warning'] = ($daysRemaining >= 0 && $daysRemaining <= $warningDays) || $daysRemaining < 0;
            $item['expiry_return_policy'] = $resolvedPolicy;
            $item['expiry_return_months'] = $resolvedPolicyMonths;
            $item['expiry_return_days'] = $resolvedPolicyDays;
            $item['expiry_policy_label'] = \App\Models\Brand::formatExpiryPolicyLabel($resolvedPolicy, $resolvedPolicyMonths, $resolvedPolicyDays);
            $item['return_deadline_date'] = $intimationMeta['return_deadline_date'];
            $item['days_until_return_deadline'] = $intimationMeta['days_until_return_deadline'];
            $item['intimation_status'] = $intimationMeta['intimation_status'];
            $item['unit_cost'] = round($unitCost, 2);
            $item['value_at_risk'] = $valueAtRisk;
            $item['retail_value'] = $retailValue;
            $item['packs_count'] = floor($qty / $packSize);
            $item['loose_units'] = $qty % $packSize;

            $enriched[] = $item;
        }

        $summary['month_buckets'] = $monthBuckets;

        // Apply status tab filter
        if ($statusFilter === 'expired') {
            $filtered = array_filter($enriched, fn($i) => $i['status'] === 'expired');
        } elseif ($statusFilter === 'critical') {
            $filtered = array_filter($enriched, fn($i) => $i['status'] === 'critical');
        } elseif ($statusFilter === 'warning') {
            $filtered = array_filter($enriched, fn($i) => in_array($i['status'], ['expired', 'critical', 'warning']));
        } elseif ($statusFilter === 'safe') {
            $filtered = array_filter($enriched, fn($i) => $i['status'] === 'safe');
        } else {
            $filtered = $enriched;
        }

        // Apply Months Remaining filter (e.g. "7 months remaining" or "within <= 7 months")
        if ($monthsFilter !== null) {
            if ($monthsMode === 'within') {
                $filtered = array_filter(
                    $filtered,
                    fn($i) => $i['days_remaining'] >= 0 && $i['months_remaining'] <= $monthsFilter
                );
            } else {
                $filtered = array_filter(
                    $filtered,
                    fn($i) => $i['days_remaining'] >= 0 && $i['months_remaining'] === $monthsFilter
                );
            }
        }

        // Sort items
        usort($filtered, function ($a, $b) use ($sortBy, $sortDir) {
            $valA = $a[$sortBy] ?? null;
            $valB = $b[$sortBy] ?? null;

            if (in_array($sortBy, ['days_remaining', 'months_remaining', 'quantity', 'value_at_risk'], true)) {
                $cmp = ($valA <=> $valB);
            } else {
                $cmp = strcmp((string)$valA, (string)$valB);
            }

            return $sortDir === 'desc' ? -$cmp : $cmp;
        });

        // Paginate in memory
        $total = count($filtered);
        $offset = ($page - 1) * $perPage;
        $paginatedRows = array_slice($filtered, $offset, $perPage);

        return response()->json([
            'rows' => array_values($paginatedRows),
            'total' => $total,
            'page' => $page,
            'per_page' => $perPage,
            'last_page' => (int) ceil($total / $perPage),
            'summary' => $summary,
            'filters' => [
                'status' => $statusFilter,
                'months' => $monthsFilter,
                'months_mode' => $monthsMode,
                'search' => $search,
                'supplier_id' => $supplierId,
                'brand_id' => $brandId,
                'category_id' => $categoryId,
                'has_custom_warning' => $hasCustom,
                'sort_by' => $sortBy,
                'sort_dir' => $sortDir,
            ],
        ]);
    }

    /**
     * PUT /api/batch-expiry/product-warning/{productId}
     *
     * Set or clear a specific product's expiry warning and/or critical days.
     */
    public function updateProductWarning(Request $request, $productId)
    {
        $this->authorizeExpiryAction('batch-expiry.update');

        $product = Product::findOrFail($productId);

        $validated = $request->validate([
            'expiry_warning_days' => 'nullable|integer|min:1|max:3650',
            'expiry_critical_days' => 'nullable|integer|min:1|max:3650',
        ]);

        $days = $validated['expiry_warning_days'] ?? null;
        $product->expiry_warning_days = $days !== null ? (int) $days : null;

        if (\App\Support\SchemaCache::hasColumn('products', 'expiry_critical_days') && array_key_exists('expiry_critical_days', $validated)) {
            $critDays = $validated['expiry_critical_days'];
            $product->expiry_critical_days = $critDays !== null ? (int) $critDays : null;
        }

        $product->save();

        $setting = Setting::first();
        $globalWarning = (int) ($setting?->expiry_warning_days ?? 90);
        $globalCritical = $this->getGlobalCriticalDays($setting);
        $effectiveWarning = $product->expiry_warning_days ?? $globalWarning;
        $effectiveCritical = $product->expiry_critical_days ?? min($globalCritical, $effectiveWarning);

        return response()->json([
            'message' => 'Product warning threshold updated successfully.',
            'product_id' => $product->id,
            'expiry_warning_days' => $product->expiry_warning_days,
            'expiry_critical_days' => $product->expiry_critical_days ?? null,
            'effective_warning_days' => max($effectiveWarning, $effectiveCritical),
            'effective_critical_days' => $effectiveCritical,
        ]);
    }

    /**
     * PUT /api/batch-expiry/global-warning
     *
     * Set the global store default expiry warning days, critical days, and daily flash limit.
     */
    public function updateGlobalWarning(Request $request)
    {
        $this->authorizeExpiryAction('batch-expiry.update');

        $validated = $request->validate([
            'expiry_warning_days' => 'required|integer|min:1|max:3650',
            'expiry_critical_days' => 'nullable|integer|min:1|max:3650',
            'expiry_daily_flash_limit' => 'nullable|integer|min:1|max:20',
        ]);

        $setting = Setting::firstOrCreate(['id' => 1]);
        $warningDays = (int) $validated['expiry_warning_days'];
        $setting->expiry_warning_days = $warningDays;

        if (\App\Support\SchemaCache::hasColumn('settings', 'expiry_critical_days') && isset($validated['expiry_critical_days'])) {
            $setting->expiry_critical_days = min($warningDays, max(1, (int) $validated['expiry_critical_days']));
        }

        if (\App\Support\SchemaCache::hasColumn('settings', 'expiry_daily_flash_limit') && isset($validated['expiry_daily_flash_limit'])) {
            $setting->expiry_daily_flash_limit = max(1, min(20, (int) $validated['expiry_daily_flash_limit']));
        }

        $setting->save();

        return response()->json([
            'message' => 'Global expiry warning window updated successfully.',
            'expiry_warning_days' => (int) $setting->expiry_warning_days,
            'expiry_critical_days' => $this->getGlobalCriticalDays($setting),
            'expiry_daily_flash_limit' => $this->getDailyFlashLimit($setting),
        ]);
    }

    /**
     * GET /api/notifications/expiry-alerts
     *
     * Returns top urgent alerts (expired, critical <= user critical days, warning <= custom/global days)
     * for real-time notification badge, daily flash reminders, and popup drawer.
     */
    public function expiryAlerts(Request $request)
    {
        $this->authorizeExpiryAction([
            'batch-expiry.view',
            'product.view',
            'report.near-expiry-product.view',
            'sale-invoice.create',
            'barcode-pos.view',
            'barcode-pos.create',
            'purchase-invoice.create',
        ]);

        $limit = max(1, min((int) $request->query('limit', 15), 100));
        $setting = Setting::first();
        $globalWarningDays = (int) ($setting?->expiry_warning_days ?? 90);
        $globalCriticalDays = $this->getGlobalCriticalDays($setting);
        $dailyFlashLimit = $this->getDailyFlashLimit($setting);
        $hasProductCriticalCol = \App\Support\SchemaCache::hasColumn('products', 'expiry_critical_days');

        $today = now()->startOfDay();
        $maxGlobalWindow = max($globalWarningDays, $globalCriticalDays);

        $selectCols = [
            'b.id as batch_id',
            'b.batch_number',
            'b.expiry_date',
            'b.quantity',
            'p.id as product_id',
            'p.name as product_name',
            'p.product_code',
            'p.pack_size',
            'p.expiry_warning_days as product_warning_days',
            'p.supplier_id',
            DB::raw('COALESCE(s.name, "") as supplier_name'),
        ];

        if ($hasProductCriticalCol) {
            $selectCols[] = 'p.expiry_critical_days as product_critical_days';
        }

        $rows = DB::table('batches as b')
            ->join('products as p', 'p.id', '=', 'b.product_id')
            ->leftJoin('suppliers as s', 's.id', '=', 'p.supplier_id')
            ->whereNotNull('b.expiry_date')
            ->where('b.quantity', '>', 0)
            ->whereRaw(
                "b.expiry_date <= date(?, '+' || COALESCE(p.expiry_warning_days, ?) || ' days')",
                [$today->toDateString(), $maxGlobalWindow]
            )
            ->select(...$selectCols)
            ->orderBy('b.expiry_date')
            ->get();

        $expiredList = [];
        $criticalList = [];
        $warningList = [];
        $daysMemo = [];

        foreach ($rows as $row) {
            $expKey = (string) $row->expiry_date;
            if (!array_key_exists($expKey, $daysMemo)) {
                $expiry = Carbon::parse($expKey)->startOfDay();
                $daysMemo[$expKey] = (int) $today->diffInDays($expiry, false);
            }
            $daysRemaining = $daysMemo[$expKey];
            $monthsMeta = self::computeMonthsRemainingMeta($daysRemaining);

            $warningDays = $row->product_warning_days !== null
                ? (int) $row->product_warning_days
                : $globalWarningDays;

            $productCriticalDays = ($hasProductCriticalCol && $row->product_critical_days !== null)
                ? (int) $row->product_critical_days
                : null;

            $criticalDays = $productCriticalDays !== null
                ? $productCriticalDays
                : min($globalCriticalDays, $warningDays);

            if ($warningDays < $criticalDays) {
                $warningDays = $criticalDays;
            }

            $item = (array) $row;
            $item['days_remaining'] = $daysRemaining;
            $item['months_remaining'] = $monthsMeta['months_remaining'];
            $item['months_remaining_label'] = $monthsMeta['months_remaining_label'];
            $item['effective_warning_days'] = $warningDays;
            $item['effective_critical_days'] = $criticalDays;

            if ($daysRemaining < 0) {
                $item['status'] = 'expired';
                $expiredList[] = $item;
            } elseif ($daysRemaining <= $criticalDays) {
                $item['status'] = 'critical';
                $criticalList[] = $item;
            } elseif ($daysRemaining <= $warningDays) {
                $item['status'] = 'warning';
                $warningList[] = $item;
            }
        }

        // Sort: expired first (most expired first), then critical (lowest days first), then warning
        usort($expiredList, fn($a, $b) => $a['days_remaining'] <=> $b['days_remaining']);
        usort($criticalList, fn($a, $b) => $a['days_remaining'] <=> $b['days_remaining']);
        usort($warningList, fn($a, $b) => $a['days_remaining'] <=> $b['days_remaining']);

        $combined = array_merge($expiredList, $criticalList, $warningList);
        $topItems = array_slice($combined, 0, $limit);

        $totalAlerts = count($expiredList) + count($criticalList) + count($warningList);

        return response()->json([
            'count' => $totalAlerts,
            'expired_count' => count($expiredList),
            'critical_count' => count($criticalList),
            'warning_count' => count($warningList),
            'global_warning_days' => $globalWarningDays,
            'global_critical_days' => $globalCriticalDays,
            'daily_flash_limit' => $dailyFlashLimit,
            'rows' => $topItems,
        ]);
    }
}
