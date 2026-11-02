<?php

namespace App\Http\Controllers;

use App\Models\StocktakeItem;
use App\Models\StocktakeSession;
use App\Services\StocktakeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StocktakeController extends Controller
{
    public function __construct(private readonly StocktakeService $service)
    {
    }

    // ===== List sessions (paginated) =====

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', StocktakeSession::class);

        $q      = trim((string) $request->get('q', ''));
        $status = $request->get('status');
        $per    = (int) $request->get('per_page', 50);

        $query = StocktakeSession::query()
            ->withCount('items')
            ->withCount(['items as counted_items_count' => fn($q) => $q->where('status', 'counted')])
            ->when($q !== '', function ($qq) use ($q) {
                $qq->where(function ($sub) use ($q) {
                    $sub->where('reference_no', 'like', "%{$q}%")
                        ->orWhere('notes', 'like', "%{$q}%")
                        ->orWhere(function ($b) use ($q) {
                            $b->where('scope_type', 'brand')
                              ->whereIn('scope_id', \App\Models\Brand::where('name', 'like', "%{$q}%")->select('id'));
                        })
                        ->orWhere(function ($c) use ($q) {
                            $c->where('scope_type', 'category')
                              ->whereIn('scope_id', \App\Models\Category::where('name', 'like', "%{$q}%")->select('id'));
                        })
                        ->orWhere(function ($s) use ($q) {
                            $s->where('scope_type', 'supplier')
                              ->whereIn('scope_id', \App\Models\Supplier::where('name', 'like', "%{$q}%")->select('id'));
                        });
                });
            })
            ->when($status, fn($qq) => $qq->where('status', $status))
            ->orderByDesc('id');

        return response()->json($query->paginate($per));
    }

    // ===== Get single session with items =====

    public function show(int $id, Request $request): JsonResponse
    {
        $session = StocktakeSession::with([
            'items.product:id,name,product_code,barcode,rack,unit_purchase_price,avg_price,category_id,brand_id,supplier_id',
            'items.product.brand:id,name',
            'user:id,name',
            'stockAdjustment:id,posted_number',
        ])->findOrFail($id);

        $this->authorize('view', $session);

        $canReveal = $request->user()?->can('finalize', $session) || $session->status !== 'in_progress';
        if ($session->is_blind && !$canReveal) {
            $data = $session->toArray();
            if (!empty($data['items']) && is_array($data['items'])) {
                foreach ($data['items'] as &$item) {
                    $item['system_qty'] = null;
                    $item['variance_qty'] = null;
                    $item['variance_value'] = null;
                    $item['unit_purchase_price'] = null;
                    $item['unit_cost'] = null;
                }
                unset($item);
            }
            return response()->json($data);
        }

        return response()->json($session);
    }

    // ===== Generate new reference number =====

    public function newCode(): JsonResponse
    {
        $this->authorize('create', StocktakeSession::class);

        return response()->json(['reference_no' => $this->service->generateReferenceNo()]);
    }

    // ===== Create a new session (stays in draft) =====

    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', StocktakeSession::class);

        $data = $request->validate([
            'session_type' => ['required', 'in:full,cycle'],
            'is_blind'     => ['boolean'],
            'scope_type'   => ['nullable', 'required_if:session_type,cycle', 'in:category,brand,supplier'],
            'scope_id'     => ['nullable', 'required_if:session_type,cycle', 'integer', 'min:1'],
            'notes'        => ['nullable', 'string', 'max:2000'],
        ]);

        $session = $this->service->createSession($data, $request->user());

        return response()->json($session, 201);
    }

    // ===== Start session (draft → in_progress, snapshot items) =====

    public function start(int $id): JsonResponse
    {
        $session = StocktakeSession::findOrFail($id);
        $this->authorize('update', $session);

        try {
            $started = $this->service->startSession($session);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json($started);
    }

    // ===== Submit for review (in_progress → pending_review) =====

    public function submitForReview(int $id): JsonResponse
    {
        $session = StocktakeSession::findOrFail($id);
        $this->authorize('update', $session);

        try {
            $reviewed = $this->service->submitForReview($session);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json($reviewed);
    }

    // ===== Finalize session (pending_review → finalized, apply stock) =====

    public function finalize(Request $request, int $id): JsonResponse
    {
        $session = StocktakeSession::findOrFail($id);
        $this->authorize('finalize', $session);

        try {
            $finalized = $this->service->finalizeSession($session, $request->user());
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json($finalized);
    }

    // ===== Cancel session =====

    public function cancel(int $id): JsonResponse
    {
        $session = StocktakeSession::findOrFail($id);
        $this->authorize('update', $session);

        try {
            $cancelled = $this->service->cancelSession($session);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json($cancelled);
    }

    // ===== List items for a session (blind-aware) =====

    public function items(int $id, Request $request): JsonResponse
    {
        $session = StocktakeSession::findOrFail($id);
        $this->authorize('view', $session);

        $statusFilter = $request->get('status', 'all');

        $query = $session->items()
            ->with([
                'product:id,name,product_code,barcode,rack,unit_purchase_price,brand_id,category_id,supplier_id',
                'product.brand:id,name',
                'counter:id,name',
            ]);

        if (in_array($statusFilter, ['pending', 'counted'])) {
            $query->where('status', $statusFilter);
        }

        $items = $query->orderBy('id')->paginate((int) $request->get('per_page', 100));

        // In blind mode, hide the system_qty snapshot from the response
        // (unless ?reveal=1 is passed AND the user is authorized to finalize or the session is no longer in_progress)
        $canReveal = $request->boolean('reveal') && (
            $request->user()?->can('finalize', $session) || $session->status !== 'in_progress'
        );
        if ($session->is_blind && !$canReveal) {
            $items->getCollection()->transform(function (StocktakeItem $item) {
                $arr                        = $item->toArray();
                $arr['system_qty']          = null;
                $arr['variance_qty']        = null;
                $arr['variance_value']      = null;
                $arr['unit_purchase_price'] = null;
                $arr['unit_cost']           = null;
                return $arr;
            });
        }

        return response()->json($items);
    }

    // ===== Add an unexpected product / batch to an in-progress session =====

    public function addItem(Request $request, int $id): JsonResponse
    {
        $session = StocktakeSession::findOrFail($id);
        $this->authorize('update', $session);

        $data = $request->validate([
            'product_id'         => ['required', 'integer', 'exists:products,id'],
            'batch_number'       => ['nullable', 'string', 'max:100'],
            'expiry_date'        => ['nullable', 'date'],
            'counted_qty'        => ['nullable', 'numeric', 'min:0'],
            'discrepancy_reason' => ['nullable', 'string', 'max:500'],
        ]);

        try {
            $item = $this->service->addItem($session, $data, optional($request->user())->id);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(
            $item->load(['product:id,name,barcode,rack,unit_purchase_price', 'counter:id,name']),
            201
        );
    }

    // ===== Record a count for one item =====

    public function recordCount(Request $request, StocktakeItem $item): JsonResponse
    {
        // Load parent session for policy checks
        $session = $item->session;
        $this->authorize('update', $session);

        $data = $request->validate([
            'counted_qty'        => ['required', 'numeric', 'min:0'],
            'discrepancy_reason' => ['nullable', 'string', 'max:500'],
        ]);

        try {
            $updated = $this->service->recordCount(
                $item,
                (float) $data['counted_qty'],
                $data['discrepancy_reason'] ?? null,
                optional($request->user())->id,
            );
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $loaded = $updated->load('product:id,name,barcode,rack');
        $canReveal = $request->user()?->can('finalize', $session) || $session->status !== 'in_progress';
        if ($session->is_blind && !$canReveal) {
            $arr                        = $loaded->toArray();
            $arr['system_qty']          = null;
            $arr['variance_qty']        = null;
            $arr['variance_value']      = null;
            $arr['unit_purchase_price'] = null;
            $arr['unit_cost']           = null;
            return response()->json($arr);
        }

        return response()->json($loaded);
    }

    // ===== Delete session (only draft or cancelled) =====

    public function destroy(int $id): JsonResponse
    {
        $session = StocktakeSession::findOrFail($id);
        $this->authorize('delete', $session);

        if (!in_array($session->status, ['draft', 'cancelled'])) {
            return response()->json([
                'message' => 'Only draft or cancelled sessions can be deleted.',
            ], 422);
        }

        $session->items()->delete();
        $session->delete();

        return response()->json(null, 204);
    }
}
