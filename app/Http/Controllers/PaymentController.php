<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\Payment;
use App\Models\Supplier;
use App\Services\PaymentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;

class PaymentController extends Controller
{
    protected PaymentService $paymentService;

    public function __construct(PaymentService $paymentService)
    {
        $this->paymentService = $paymentService;
    }

    /**
     * List payments with optional filters.
     */
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Payment::class);

        $request->validate([
            'party_type'     => ['nullable', Rule::in(['customer', 'supplier'])],
            'party_id'       => ['nullable', 'integer'],
            'status'         => ['nullable', Rule::in(['posted', 'reversed'])],
            'payment_method' => ['nullable', 'string', 'max:50'],
            'cheque_status'  => ['nullable', Rule::in(['pending', 'deposited', 'cleared', 'bounced'])],
            'unapplied_only' => ['nullable', 'boolean'],
            'from'           => ['nullable', 'date'],
            'to'             => ['nullable', 'date'],
            'search'         => ['nullable', 'string', 'max:100'],
            'per_page'       => ['nullable', 'integer', 'min:1', 'max:200'],
        ]);

        $this->paymentService->syncMissingReturnCreditPayments(
            $request->party_type,
            $request->filled('party_id') ? (int) $request->party_id : null
        );

        $query = Payment::with([
            'customer:id,name',
            'supplier:id,name',
            'creator:id,name',
            'account:id,name,code,type',
            'allocations',
        ]);

        if ($request->filled('party_type')) {
            $query->where('party_type', $request->party_type);
        }

        if ($request->filled('party_id')) {
            $query->where('party_id', $request->party_id);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('payment_method')) {
            $query->where('payment_method', $request->payment_method);
        }

        if ($request->filled('cheque_status') && \Illuminate\Support\Facades\Schema::hasColumn('payments', 'cheque_status')) {
            $query->where('cheque_status', $request->cheque_status);
        }

        if ($request->boolean('unapplied_only')) {
            $query->where('status', 'posted')->where('unapplied_amount', '>', 0);
        }

        if ($request->filled('from')) {
            $query->whereDate('payment_date', '>=', $request->from);
        }

        if ($request->filled('to')) {
            $query->whereDate('payment_date', '<=', $request->to);
        }

        if ($request->filled('search')) {
            $search = trim($request->search);
            $query->where(function ($q) use ($search) {
                $q->where('payment_number', 'LIKE', "%{$search}%")
                  ->orWhere('reference', 'LIKE', "%{$search}%")
                  ->orWhere('notes', 'LIKE', "%{$search}%");
            });
        }

        $hasChequeStatus = \Illuminate\Support\Facades\Schema::hasColumn('payments', 'cheque_status');

        $cashCustomerTotal = (float) (clone $query)
            ->where('status', 'posted')
            ->where('party_type', 'customer')
            ->where('payment_method', '!=', 'credit_note')
            ->when($hasChequeStatus, function ($q) {
                $q->where(function ($sub) {
                    $sub->whereNull('cheque_status')->orWhere('cheque_status', 'cleared');
                });
            })
            ->sum('amount');

        $cashSupplierTotal = (float) (clone $query)
            ->where('status', 'posted')
            ->where('party_type', 'supplier')
            ->where('payment_method', '!=', 'credit_note')
            ->when($hasChequeStatus, function ($q) {
                $q->where(function ($sub) {
                    $sub->whereNull('cheque_status')->orWhere('cheque_status', 'cleared');
                });
            })
            ->sum('amount');

        $reversalsCount = (int) (clone $query)->where('status', 'reversed')->count();

        $query->orderBy('payment_date', 'desc')->orderBy('id', 'desc');

        $perPage = (int)($request->per_page ?? 15);
        $paginated = $query->paginate($perPage);
        $payload = $paginated->toArray();
        $payload['summary'] = [
            'customer_total' => round($cashCustomerTotal, 2),
            'supplier_total' => round($cashSupplierTotal, 2),
            'net_cash_flow'  => round($cashCustomerTotal - $cashSupplierTotal, 2),
            'reversals'      => $reversalsCount,
        ];

        return response()->json($payload);
    }

    /**
     * Show single payment.
     */
    public function show(int $id): JsonResponse
    {
        $payment = Payment::with([
            'customer:id,name,phone,address',
            'supplier:id,name,phone,address',
            'creator:id,name',
            'reversedBy:id,name',
            'allocations.saleInvoice:id,posted_number,date,total',
            'allocations.purchaseInvoice:id,posted_number,invoice_number,posted_date,total_amount',
        ])->findOrFail($id);

        $this->authorize('view', $payment);

        return response()->json($payment);
    }

    /**
     * Create and post payment.
     */
    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', Payment::class);

        $data = $request->validate([
            'party_type'                => ['required', Rule::in(['customer', 'supplier'])],
            'party_id'                  => ['required', 'integer'],
            'amount'                    => ['required', 'numeric', 'min:0.01'],
            'payment_date'              => ['required', 'date'],
            'payment_method'            => ['required', 'string', 'max:50'],
            'account_id'                => ['nullable', 'integer', 'exists:accounts,id'],
            'reference'                 => ['nullable', 'string', 'max:100'],
            'cheque_number'             => ['nullable', 'string', 'max:100'],
            'bank_name'                 => ['nullable', 'string', 'max:150'],
            'cheque_date'               => ['nullable', 'date'],
            'cheque_status'             => ['nullable', Rule::in(['pending', 'deposited', 'cleared'])],
            'notes'                     => ['nullable', 'string', 'max:500'],
            'idempotency_key'           => ['nullable', 'string', 'max:100'],
            'allocations'               => ['nullable', 'array'],
            'allocations.*.invoice_id'  => ['required', 'integer'],
            'allocations.*.amount'      => ['required', 'numeric', 'min:0.01'],
        ]);

        $user = Auth::user();

        if ($data['party_type'] === 'customer') {
            $customer = Customer::findOrFail($data['party_id']);
            $payment = $this->paymentService->recordCustomerPayment($customer, $data, $user);
        } else {
            $supplier = Supplier::findOrFail($data['party_id']);
            $payment = $this->paymentService->recordSupplierPayment($supplier, $data, $user);
        }

        return response()->json([
            'message' => 'Payment posted successfully',
            'payment' => $payment->load([
                'allocations',
                'customer:id,name',
                'supplier:id,name',
            ]),
        ], 201);
    }

    /**
     * Reverse a payment.
     */
    public function reverse(Request $request, int $id): JsonResponse
    {
        $payment = Payment::findOrFail($id);
        $this->authorize('reverse', $payment);

        $data = $request->validate([
            'reason' => ['required', 'string', 'min:3', 'max:500'],
        ]);

        $reversed = $this->paymentService->reversePayment($payment, $data['reason'], Auth::user());

        return response()->json([
            'message' => 'Payment reversed successfully',
            'payment' => $reversed->fresh(['allocations']),
        ]);
    }

    /**
     * Fetch open invoices eligible for payment allocation.
     */
    public function openInvoices(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Payment::class);

        $request->validate([
            'party_type' => ['required', Rule::in(['customer', 'supplier'])],
            'party_id'   => ['required', 'integer'],
        ]);

        if ($request->party_type === 'customer') {
            $invoices = $this->paymentService->getOpenInvoicesForCustomer((int)$request->party_id);
        } else {
            $invoices = $this->paymentService->getOpenInvoicesForSupplier((int)$request->party_id);
        }

        return response()->json($invoices);
    }

    /**
     * Allocate an existing payment's or credit note's unapplied amount to open invoices.
     */
    public function allocate(Request $request, int $id): JsonResponse
    {
        $payment = Payment::findOrFail($id);
        $this->authorize('allocate', $payment);

        $data = $request->validate([
            'allocations'              => ['required', 'array', 'min:1'],
            'allocations.*.invoice_id' => ['required', 'integer'],
            'allocations.*.amount'     => ['required', 'numeric', 'min:0.01'],
        ]);

        $updated = $this->paymentService->allocatePayment($payment, $data['allocations'], Auth::user());

        return response()->json([
            'message' => 'Credit allocated successfully',
            'payment' => $updated,
        ]);
    }

    /**
     * Get available unapplied payment credits and credit notes for a party.
     */
    public function availableCredits(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Payment::class);

        $request->validate([
            'party_type' => ['required', Rule::in(['customer', 'supplier'])],
            'party_id'   => ['required', 'integer'],
        ]);

        $result = $this->paymentService->getAvailableCreditsForParty(
            (string) $request->party_type,
            (int) $request->party_id
        );

        return response()->json($result);
    }

    /**
     * Apply available unapplied payment credits / credit notes for a party across open invoices.
     */
    public function applyCredits(Request $request): JsonResponse
    {
        $this->authorize('allocate', Payment::class);

        $data = $request->validate([
            'party_type'               => ['required', Rule::in(['customer', 'supplier'])],
            'party_id'                 => ['required', 'integer'],
            'allocations'              => ['required', 'array', 'min:1'],
            'allocations.*.invoice_id' => ['required', 'integer'],
            'allocations.*.amount'     => ['required', 'numeric', 'min:0.01'],
        ]);

        $result = $this->paymentService->applyPartyCredits(
            $data['party_type'],
            (int) $data['party_id'],
            $data['allocations'],
            Auth::user()
        );

        return response()->json([
            'message'         => 'Available credit applied successfully',
            'allocated_total' => $result['allocated_total'],
            'payments'        => $result['payments'],
        ]);
    }

    /**
     * Update Post-Dated Cheque (PDC) status: pending -> deposited -> cleared or bounced.
     */
    public function updateChequeStatus(Request $request, int $id): JsonResponse
    {
        $payment = Payment::findOrFail($id);
        $this->authorize('create', Payment::class);

        if (!$request->has('status') && $request->has('cheque_status')) {
            $request->merge(['status' => $request->input('cheque_status')]);
        }

        $data = $request->validate([
            'status'     => ['required', Rule::in(['deposited', 'cleared', 'bounced'])],
            'account_id' => ['nullable', 'integer', 'exists:accounts,id'],
            'reason'     => ['nullable', 'string', 'max:500'],
        ]);

        $updated = $this->paymentService->updateChequeStatus(
            $payment,
            $data['status'],
            isset($data['account_id']) ? (int) $data['account_id'] : null,
            $data['reason'] ?? null,
            Auth::user()
        );

        return response()->json([
            'message' => "Cheque status updated to {$data['status']}",
            'payment' => $updated,
        ]);
    }
}

