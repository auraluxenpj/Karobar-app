<?php

namespace App\Http\Controllers;

use App\Models\CashDrawerSession;
use App\Services\CashDrawerService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class CashDrawerController extends Controller
{
    protected CashDrawerService $cashDrawerService;

    public function __construct(CashDrawerService $cashDrawerService)
    {
        $this->cashDrawerService = $cashDrawerService;
    }

    private function authorizeDrawerAction(string|array $permissions): void
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
     * Get the active drawer session for the logged-in user / store.
     */
    public function current(Request $request)
    {
        $this->authorizeDrawerAction([
            'cash-drawer.view',
            'cash-drawer.open',
            'cash-drawer.close',
            'cash-drawer.transaction',
            'sale-invoice.create',
            'barcode-pos.view',
            'barcode-pos.create',
        ]);
        $session = $this->cashDrawerService->getCurrentSession($request->user());
        $summaryOnly = $request->boolean('summary_only');

        if (!$session) {
            if ($summaryOnly) {
                return response()->json([
                    'is_open'             => false,
                    'session'             => null,
                    'summary'             => null,
                    'last_closed_session' => null,
                    'last_closed_summary' => null,
                ]);
            }

            $lastClosed = $this->cashDrawerService->getLastClosedSession($request->user());
            return response()->json([
                'is_open'             => false,
                'session'             => null,
                'summary'             => null,
                'last_closed_session' => $lastClosed,
                'last_closed_summary' => $lastClosed ? $this->cashDrawerService->getSessionSummary($lastClosed) : null,
            ]);
        }

        if ($summaryOnly) {
            return response()->json([
                'is_open' => true,
                'session' => null,
                'summary' => $this->cashDrawerService->getSessionSummary($session),
            ]);
        }

        $session->load([
            'transactions' => function ($q) {
                $q->reorder('created_at', 'asc')->orderBy('id', 'asc')->with('user');
            },
            'user',
        ]);

        $this->cashDrawerService->enrichTransactions($session->transactions);

        return response()->json([
            'is_open' => true,
            'session' => $session,
            'summary' => $this->cashDrawerService->getSessionSummary($session),
        ]);
    }

    /**
     * Open a new cash drawer session.
     */
    public function open(Request $request)
    {
        $this->authorizeDrawerAction('cash-drawer.open');
        $data = $request->validate([
            'opening_balance' => 'required|numeric|min:0',
            'notes'           => 'nullable|string|max:500',
        ]);

        $session = $this->cashDrawerService->openSession(
            $request->user(),
            (float) $data['opening_balance'],
            $data['notes'] ?? null
        );

        return response()->json([
            'message' => 'Cash drawer opened successfully.',
            'session' => $session,
            'summary' => $this->cashDrawerService->getSessionSummary($session),
        ], 201);
    }

    /**
     * Record a manual cash in or cash out.
     */
    public function recordTransaction(Request $request)
    {
        $this->authorizeDrawerAction('cash-drawer.transaction');
        $data = $request->validate([
            'type'   => 'required|in:cash_in,cash_out',
            'amount' => 'required|numeric|min:0.01',
            'notes'  => 'required|string|max:255',
        ]);

        $session = $this->cashDrawerService->getCurrentSession($request->user());

        if (!$session) {
            return response()->json([
                'message' => 'No active cash drawer is open. Please open the drawer first.',
            ], 422);
        }

        $txn = $this->cashDrawerService->recordTransaction(
            $session,
            $data['type'],
            (float) $data['amount'],
            'manual',
            null,
            $data['notes'],
            $request->user()
        );

        if ($txn) {
            $txn->load('user');
            $this->cashDrawerService->enrichTransactions(collect([$txn]));
        }

        return response()->json([
            'message'     => ($data['type'] === 'cash_in' ? 'Cash in' : 'Cash out') . ' recorded successfully.',
            'transaction' => $txn,
            'summary'     => $this->cashDrawerService->getSessionSummary($session->fresh()),
        ]);
    }

    /**
     * Close the current drawer session and reconcile.
     */
    public function close(Request $request)
    {
        $this->authorizeDrawerAction('cash-drawer.close');
        $data = $request->validate([
            'session_id'             => 'nullable|integer|exists:cash_drawer_sessions,id',
            'closing_balance_actual' => 'required|numeric|min:0',
            'notes'                  => 'nullable|string|max:500',
        ]);

        if (!empty($data['session_id'])) {
            $session = CashDrawerSession::where('status', 'open')->find($data['session_id']);
            if ($session && (int) $session->user_id !== (int) $request->user()?->id && !$request->user()?->hasRole(['Admin', 'admin', 'super-admin'])) {
                abort(403, 'You are not authorized to close another user\'s cash drawer session.');
            }
        } else {
            $session = $this->cashDrawerService->getCurrentSession($request->user(), true);
        }

        if (!$session) {
            return response()->json([
                'message' => 'No active cash drawer session is open to close.',
            ], 422);
        }

        $closed = $this->cashDrawerService->closeSession(
            $session,
            (float) $data['closing_balance_actual'],
            $data['notes'] ?? null
        );

        return response()->json([
            'message' => 'Cash drawer closed successfully.',
            'session' => $closed,
            'summary' => $this->cashDrawerService->getSessionSummary($closed),
        ]);
    }

    /**
     * Get historical cash drawer sessions for auditing.
     */
    public function history(Request $request)
    {
        $this->authorizeDrawerAction('cash-drawer.view');
        $limit = min(max((int) $request->query('per_page', 15), 1), 100);

        $sessions = CashDrawerSession::with(['user'])
            ->withCount('transactions')
            ->withSum([
                'transactions as total_cash_in' => fn($q) => $q->whereIn('type', [
                    'cash_sale', 'customer_payment', 'purchase_return', 'cash_in',
                ]),
            ], 'amount')
            ->withSum([
                'transactions as total_cash_out' => fn($q) => $q->whereIn('type', [
                    'cash_purchase', 'supplier_payment', 'cash_return', 'expense', 'cash_out',
                ]),
            ], 'amount')
            ->orderBy('id', 'desc')
            ->paginate($limit);

        return response()->json($sessions);
    }

    /**
     * Get complete details of a specific cash drawer session for detailed reporting.
     */
    public function show(Request $request, $id)
    {
        $this->authorizeDrawerAction('cash-drawer.view');
        $session = CashDrawerSession::with([
            'user',
            'transactions' => fn($q) => $q->reorder('created_at', 'asc')->orderBy('id', 'asc')->with('user'),
        ])->findOrFail($id);

        $this->cashDrawerService->enrichTransactions($session->transactions);

        return response()->json([
            'session'      => $session,
            'summary'      => $this->cashDrawerService->getSessionSummary($session),
            'transactions' => $session->transactions,
        ]);
    }
}

