<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Models\User;
use App\Models\Product;
use App\Models\UserDemand;
use Illuminate\Support\Facades\Auth;

class NotificationController extends Controller
{
/**
     * Get the currently authenticated user (typed as App\Models\User).
     */
    private function currentUser(): User
    {
        /** @var \App\Models\User|null $user */
        $user = Auth::user();

        if (!$user instanceof User) {
            abort(401, 'Unauthenticated');
        }

        return $user;
    }

    /**
     * GET /api/notifications/low-stock
     *
     * Returns all running products whose current on-hand quantity has dropped
     * below the product's pack_size. Only products that have been purchased
     * via a purchase invoice are considered "running products".
     *
     * Optional query params:
     *   - limit (default 100, max 1000)
     */
    public function lowStock(Request $request)
    {
        $this->authorize('viewAny', Product::class);

        $limit = max(1, min((int) $request->query('limit', 100), 1000));

        // Respect per-user dismissed notifications.
        $user = $this->currentUser();
        $dismissed = $user->getPreference('dismissed_low_stock', []);
        if (!is_array($dismissed)) {
            $dismissed = [];
        }

        $buildQuery = function ($query) use ($dismissed) {
            $query->whereExists(function ($sub) {
                    $sub->select(DB::raw(1))
                        ->from('purchase_invoice_items as pii')
                        ->whereColumn('pii.product_id', 'p.id');
                })
                ->whereNotNull('p.quantity')
                ->whereColumn('p.quantity', '<', 'p.pack_size');

            if (count($dismissed) > 0) {
                $query->whereNotIn('p.id', array_map('intval', $dismissed));
            }

            return $query;
        };

        $rows = DB::table('products as p')
            ->leftJoin('brands as b', 'b.id', '=', 'p.brand_id')
            ->leftJoin('suppliers as s', 's.id', '=', 'p.supplier_id')
            ->where(function ($q) use ($buildQuery) {
                $buildQuery($q);
            })
            ->select(
                'p.id as product_id',
                'p.product_code',
                'p.name as product_name',
                'p.pack_size',
                'p.quantity',
                'p.unit_sale_price',
                'p.unit_purchase_price',
                DB::raw('COALESCE(b.name, "") as brand_name'),
                DB::raw('COALESCE(s.name, "") as supplier_name'),
                DB::raw('p.pack_size - p.quantity as units_below_pack')
            )
            ->orderByRaw('p.quantity / NULLIF(p.pack_size, 0) ASC') // most depleted first
            ->orderBy('p.name')
            ->limit($limit)
            ->get();

        $count = $rows->count() < $limit
            ? $rows->count()
            : $buildQuery(DB::table('products as p'))->count();

        return response()->json([
            'count' => $count,
            'rows'  => $rows,
        ]);
    }

    /**
     * POST /api/notifications/dismiss
     *
     * Dismiss a single low-stock notification for the current user.
     * Body: { product_id: int }
     */
    public function dismiss(Request $request)
    {
        $this->authorize('viewAny', Product::class);

        $validated = $request->validate([
            'product_id' => 'required|integer',
        ]);

        $user = $this->currentUser();
        $dismissed = $user->getPreference('dismissed_low_stock', []);
        if (!is_array($dismissed)) {
            $dismissed = [];
        }

        $productId = (int) $validated['product_id'];
        if (!in_array($productId, $dismissed, true)) {
            $dismissed[] = $productId;
        }

        $user->setPreference('dismissed_low_stock', $dismissed);
        $user->save();

        return response()->json([
            'dismissed' => $dismissed,
        ]);
    }

    /**
     * POST /api/notifications/dismiss-all
     *
     * Dismiss all current low-stock notifications for the current user.
     */
    public function dismissAll(Request $request)
    {
        $this->authorize('viewAny', Product::class);

        $user = $this->currentUser();
        $dismissed = $user->getPreference('dismissed_low_stock', []);
        if (!is_array($dismissed)) {
            $dismissed = [];
        }

        // Collect all currently eligible product ids and mark them dismissed.
        $currentLowStockIds = DB::table('products as p')
            ->whereExists(function ($sub) {
                $sub->select(DB::raw(1))
                    ->from('purchase_invoice_items as pii')
                    ->whereColumn('pii.product_id', 'p.id');
            })
            ->whereNotNull('p.quantity')
            ->whereColumn('p.quantity', '<', 'p.pack_size')
            ->pluck('p.id')
            ->map(fn ($id) => (int) $id)
            ->toArray();

        $merged = array_values(array_unique(array_merge($dismissed, $currentLowStockIds)));

        $user->setPreference('dismissed_low_stock', $merged);
        $user->save();

        return response()->json([
            'dismissed' => $merged,
        ]);
    }

    /**
     * POST /api/notifications/ack-demand
     *
     * Stamp last_notified_at on pending user demands when shown as live notifications.
     * Body: { demand_ids: int[] } or { demand_id: int }
     */
    public function ackDemand(Request $request)
    {
        $this->authorize('viewAny', UserDemand::class);

        $validated = $request->validate([
            'demand_id'    => 'nullable|integer',
            'demand_ids'   => 'nullable|array',
            'demand_ids.*' => 'integer',
        ]);

        $ids = [];
        if (!empty($validated['demand_id'])) {
            $ids[] = (int) $validated['demand_id'];
        }
        if (!empty($validated['demand_ids']) && is_array($validated['demand_ids'])) {
            foreach ($validated['demand_ids'] as $id) {
                $ids[] = (int) $id;
            }
        }
        $ids = array_values(array_unique(array_filter($ids)));

        $now = now();
        $updated = 0;
        if (!empty($ids)) {
            $updated = UserDemand::whereIn('id', $ids)
                ->where('status', 'pending')
                ->update(['last_notified_at' => $now]);
        }

        return response()->json([
            'acknowledged' => $ids,
            'updated'      => $updated,
            'notified_at'  => $now->toIso8601String(),
        ]);
    }
}
