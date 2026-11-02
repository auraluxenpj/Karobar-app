<?php

namespace App\Http\Controllers;

use App\Models\Brand;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class BrandController extends Controller
{
    public static function normalizeExpiryPolicyPayload(array $validated): array
    {
        $policy = $validated['expiry_return_policy'] ?? 'before_expiry';
        if (!in_array($policy, ['before_expiry', 'accepts_expired', 'non_returnable'], true)) {
            $policy = 'before_expiry';
        }

        if ($policy === 'accepts_expired' || $policy === 'non_returnable') {
            $months = 0;
            $days = 0;
        } else {
            $months = isset($validated['expiry_return_months']) && $validated['expiry_return_months'] !== ''
                ? max(0, (int) $validated['expiry_return_months'])
                : null;
            $days = isset($validated['expiry_return_days']) && $validated['expiry_return_days'] !== ''
                ? max(0, (int) $validated['expiry_return_days'])
                : null;

            if ($months !== null && $months > 0 && ($days === null || $days === 0)) {
                $days = $months === 12 ? 365 : ($months === 24 ? 730 : $months * 30);
            } elseif ($days !== null && $days > 0 && ($months === null || $months === 0)) {
                $months = $days === 365 ? 12 : ($days === 730 ? 24 : (int) round($days / 30));
            } elseif ($months === null && $days === null) {
                $months = 3;
                $days = 90;
            }
        }

        $validated['expiry_return_policy'] = $policy;
        $validated['expiry_return_months'] = $months ?? 0;
        $validated['expiry_return_days'] = $days ?? 0;
        if (array_key_exists('expiry_return_notes', $validated)) {
            $validated['expiry_return_notes'] = $validated['expiry_return_notes'] !== null
                ? trim((string) $validated['expiry_return_notes'])
                : null;
        }

        return $validated;
    }

    public static function evaluateBatchIntimation(
        string $expiryDateStr,
        string $policy,
        int $policyMonths,
        int $policyDays
    ): array {
        static $memo = [];
        static $cachedTodayStr = null;
        static $cachedToday = null;

        $todayStr = Carbon::hasTestNow() ? Carbon::today()->toDateString() : date('Y-m-d');
        $cacheKey = "{$todayStr}|{$expiryDateStr}|{$policy}|{$policyMonths}|{$policyDays}";
        if (isset($memo[$cacheKey])) {
            return $memo[$cacheKey];
        }

        if ($cachedTodayStr !== $todayStr || $cachedToday === null) {
            $cachedTodayStr = $todayStr;
            $cachedToday = Carbon::parse($todayStr)->startOfDay();
        }
        $today = $cachedToday;
        $expiry = Carbon::parse($expiryDateStr)->startOfDay();
        $daysRemaining = (int) $today->diffInDays($expiry, false);

        if (count($memo) > 2048) {
            $memo = [];
        }

        if ($policy === 'non_returnable') {
            return $memo[$cacheKey] = [
                'days_remaining'             => $daysRemaining,
                'return_deadline_date'       => null,
                'days_until_return_deadline' => null,
                'intimation_status'          => $daysRemaining < 0 ? 'expired_non_returnable' : 'non_returnable',
                'is_intimation_due'          => false,
            ];
        }

        if ($policy === 'accepts_expired') {
            $isDue = $daysRemaining <= 30;
            return $memo[$cacheKey] = [
                'days_remaining'             => $daysRemaining,
                'return_deadline_date'       => $expiry->toDateString(),
                'days_until_return_deadline' => $daysRemaining,
                'intimation_status'          => $daysRemaining < 0
                    ? 'expired_returnable'
                    : ($daysRemaining <= 30 ? 'intimate_now' : 'safe'),
                'is_intimation_due'          => $isDue,
            ];
        }

        // 'before_expiry' policy
        $effectiveDays = $policyDays > 0
            ? $policyDays
            : ($policyMonths > 0 ? ($policyMonths === 12 ? 365 : ($policyMonths === 24 ? 730 : $policyMonths * 30)) : 90);

        $deadline = $policyMonths > 0
            ? $expiry->copy()->subMonthsNoOverflow($policyMonths)
            : $expiry->copy()->subDays($effectiveDays);

        $daysUntilDeadline = (int) $today->diffInDays($deadline, false);

        // Intimation is due if we are within 30 days before the return deadline OR already inside the return window (before actual expiry)
        if ($daysRemaining < 0) {
            $status = 'expired_window_missed';
            $isDue = true;
        } elseif ($daysUntilDeadline < 0) {
            // We are inside the X-months before expiry window (past the prior-cutoff date, must return immediately!)
            $status = 'return_window_open';
            $isDue = true;
        } elseif ($daysUntilDeadline <= 30) {
            // Approaching the X-months cutoff within 30 days — intimate now!
            $status = 'intimate_now';
            $isDue = true;
        } else {
            $status = 'safe';
            $isDue = false;
        }

        return $memo[$cacheKey] = [
            'days_remaining'             => $daysRemaining,
            'return_deadline_date'       => $deadline->toDateString(),
            'days_until_return_deadline' => $daysUntilDeadline,
            'intimation_status'          => $status,
            'is_intimation_due'          => $isDue,
        ];
    }

    public function search(Request $req)
    {
        $this->authorize('lookup', Brand::class);

        $q     = trim($req->input('q', ''));
        $limit = max(1, min((int)$req->input('limit', 50), 10000));

        $query = Brand::select(
            'id',
            'name',
            'expiry_return_policy',
            'expiry_return_months',
            'expiry_return_days',
            'expiry_return_notes'
        )->orderBy('name');

        if ($q !== '') {
            $query->where('name', 'like', "%{$q}%");
        }

        return $query->limit($limit)->get();
    }

    public function index(Request $req)
    {
        $this->authorize('viewAny', Brand::class);

        $perPage = max(1, min((int)$req->input('per_page', 25), 2000));
        $qName = trim((string)($req->input('q_name') ?? $req->input('q', '')));
        $policyFilter = trim((string)$req->input('policy', 'all'));

        $q = Brand::query()
            ->select([
                'id',
                'name',
                'image',
                'expiry_return_policy',
                'expiry_return_months',
                'expiry_return_days',
                'expiry_return_notes',
            ])
            ->withCount('products');

        if ($qName !== '') {
            $q->where('name', 'like', "%{$qName}%");
        }

        if ($policyFilter !== '' && $policyFilter !== 'all') {
            if (in_array($policyFilter, ['before_expiry', 'accepts_expired', 'non_returnable'], true)) {
                $q->where('expiry_return_policy', $policyFilter);
            } elseif (preg_match('/^before_(\d+)$/', $policyFilter, $m)) {
                $months = (int) $m[1];
                $q->where('expiry_return_policy', 'before_expiry')
                  ->where('expiry_return_months', $months);
            }
        }

        $q->orderBy('name');

        $paginated = $q->paginate($perPage);

        // Attach intimation_due_count per brand on the current page
        $brandIds = collect($paginated->items())->pluck('id')->all();
        if (!empty($brandIds) && Schema::hasTable('batches')) {
            $batches = DB::table('batches as b')
                ->join('products as p', 'p.id', '=', 'b.product_id')
                ->whereIn('p.brand_id', $brandIds)
                ->whereNotNull('b.expiry_date')
                ->where('b.quantity', '>', 0)
                ->select('p.brand_id', 'b.expiry_date', 'b.quantity')
                ->get()
                ->groupBy('brand_id');

            foreach ($paginated->items() as $brand) {
                $brandBatches = $batches->get($brand->id, collect());
                $dueCount = 0;
                $dueUnits = 0;
                foreach ($brandBatches as $bRow) {
                    $eval = self::evaluateBatchIntimation(
                        $bRow->expiry_date,
                        (string) ($brand->expiry_return_policy ?: 'before_expiry'),
                        (int) ($brand->expiry_return_months ?? 3),
                        (int) ($brand->expiry_return_days ?? 90)
                    );
                    if ($eval['is_intimation_due']) {
                        $dueCount++;
                        $dueUnits += (int) $bRow->quantity;
                    }
                }
                $brand->setAttribute('intimation_due_count', $dueCount);
                $brand->setAttribute('intimation_due_units', $dueUnits);
            }
        }

        return response()->json($paginated);
    }

    public function store(Request $request)
    {
        $this->authorize('create', Brand::class);

        $validated = $request->validate([
            'name'                 => 'required|unique:brands,name',
            'image'                => 'nullable|image|max:2048',
            'expiry_return_policy' => 'nullable|string|in:before_expiry,accepts_expired,non_returnable',
            'expiry_return_months' => 'nullable|integer|min:0|max:120',
            'expiry_return_days'   => 'nullable|integer|min:0|max:3650',
            'expiry_return_notes'  => 'nullable|string|max:500',
        ]);

        $validated = self::normalizeExpiryPolicyPayload($validated);

        if ($request->hasFile('image')) {
            $validated['image'] = $request->file('image')->store('brands', 'public');
        }

        $brand = Brand::create($validated);

        return response()->json($brand, 201);
    }

    public function show(Brand $brand)
    {
        $this->authorize('view', $brand);

        $brand->loadCount('products');

        $intimationBatches = [];
        if (Schema::hasTable('batches')) {
            $rows = DB::table('batches as b')
                ->join('products as p', 'p.id', '=', 'b.product_id')
                ->leftJoin('suppliers as s', 's.id', '=', 'p.supplier_id')
                ->where('p.brand_id', $brand->id)
                ->whereNotNull('b.expiry_date')
                ->where('b.quantity', '>', 0)
                ->select(
                    'b.id as batch_id',
                    'b.batch_number',
                    'b.expiry_date',
                    'b.quantity',
                    'p.id as product_id',
                    'p.name as product_name',
                    'p.product_code',
                    'p.pack_size',
                    DB::raw('COALESCE(s.name, "") as supplier_name')
                )
                ->orderBy('b.expiry_date', 'asc')
                ->limit(150)
                ->get();

            foreach ($rows as $r) {
                $eval = self::evaluateBatchIntimation(
                    $r->expiry_date,
                    (string) ($brand->expiry_return_policy ?: 'before_expiry'),
                    (int) ($brand->expiry_return_months ?? 3),
                    (int) ($brand->expiry_return_days ?? 90)
                );
                $intimationBatches[] = array_merge((array) $r, $eval);
            }
        }

        $payload = $brand->toArray();
        $payload['intimation_batches'] = $intimationBatches;

        return response()->json($payload);
    }

    public function update(Request $request, Brand $brand)
    {
        $this->authorize('update', $brand);

        $validated = $request->validate([
            'name'                 => 'required|unique:brands,name,' . $brand->id,
            'image'                => 'nullable|image|max:2048',
            'expiry_return_policy' => 'nullable|string|in:before_expiry,accepts_expired,non_returnable',
            'expiry_return_months' => 'nullable|integer|min:0|max:120',
            'expiry_return_days'   => 'nullable|integer|min:0|max:3650',
            'expiry_return_notes'  => 'nullable|string|max:500',
        ]);

        if (
            $request->hasAny(['expiry_return_policy', 'expiry_return_months', 'expiry_return_days', 'expiry_return_notes'])
        ) {
            $validated = self::normalizeExpiryPolicyPayload(array_merge([
                'expiry_return_policy' => $brand->expiry_return_policy ?? 'before_expiry',
                'expiry_return_months' => $brand->expiry_return_months ?? 3,
                'expiry_return_days'   => $brand->expiry_return_days ?? 90,
                'expiry_return_notes'  => $brand->expiry_return_notes,
            ], $validated));
        }

        if ($request->hasFile('image')) {
            if ($brand->image) Storage::disk('public')->delete($brand->image);
            $validated['image'] = $request->file('image')->store('brands', 'public');
        }

        $brand->update($validated);

        return response()->json($brand->fresh());
    }

    public function destroy(Brand $brand)
    {
        $this->authorize('delete', $brand);

        if ($brand->products()->exists()) {
            return response()->json([
                'message' => 'Cannot delete: brand is used by one or more products.'
            ], 422);
        }

        if ($brand->image) Storage::disk('public')->delete($brand->image);
        $brand->delete();

        return response()->json(null, 204);
    }

    public function export(): StreamedResponse
    {
        $this->authorize('export', Brand::class);

        $file = 'brands_' . now()->format('Y-m-d_H-i-s') . '.csv';

        return response()->streamDownload(function () {
            $out = fopen('php://output', 'w');
            fprintf($out, chr(0xEF) . chr(0xBB) . chr(0xBF)); // BOM
            fputcsv($out, ['name', 'expiry_return_policy', 'expiry_return_months', 'expiry_return_days', 'expiry_return_notes', 'image']);
            $sanitizeCsv = static function ($val) {
                $str = (string) ($val ?? '');
                if ($str !== '' && in_array($str[0], ['=', '+', '-', '@', "\t", "\r"], true) && !preg_match('/^[+-]?\d+(\.\d+)?$/', $str)) {
                    return "'" . $str;
                }
                return $str;
            };
            Brand::select('name', 'expiry_return_policy', 'expiry_return_months', 'expiry_return_days', 'expiry_return_notes', 'image')
                ->orderBy('name')
                ->chunk(1000, function ($chunk) use ($out, $sanitizeCsv) {
                    foreach ($chunk as $b) {
                        fputcsv($out, [
                            $sanitizeCsv($b->name ?? ''),
                            $sanitizeCsv($b->expiry_return_policy ?? 'before_expiry'),
                            (string) ($b->expiry_return_months ?? 3),
                            (string) ($b->expiry_return_days ?? 90),
                            $sanitizeCsv($b->expiry_return_notes ?? ''),
                            $sanitizeCsv($b->image ?? ''),
                        ]);
                    }
                });
            fclose($out);
        }, $file, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }
}
