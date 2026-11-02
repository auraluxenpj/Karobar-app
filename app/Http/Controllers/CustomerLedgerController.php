<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\CustomerLedger;
use App\Models\SaleInvoice;
use App\Models\Setting;
use App\Support\SchemaCache;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;

class CustomerLedgerController extends Controller
{
    /* -------------------------------
       Helpers to read model fields safely
    --------------------------------- */
    private function num(...$vals): float
    {
        foreach ($vals as $v) {
            if ($v !== null && $v !== '') return (float)$v;
        }
        return 0.0;
    }

    private function str(...$vals): ?string
    {
        foreach ($vals as $v) {
            if (!is_null($v) && $v !== '') return (string)$v;
        }
        return null;
    }

    private function calculateOpeningBalance(int $customerId, ?string $from): float
    {
        if (!$from) {
            return 0.0;
        }

        $priorInvoices = SaleInvoice::query()
            ->where('customer_id', $customerId)
            ->where('invoice_type', 'credit')
            ->where(fn ($q) => $q->whereNull('status')->orWhere('status', '!=', 'reversed'))
            ->where('date', '<', $from)
            ->get([
                'id', 'invoice_total', 'total', 'grand_total', 'net_total', 'gross_amount', 'sub_total',
                'total_receive', 'total_recieve', 'received', 'amount_received',
            ]);

        $priorIds = $priorInvoices->pluck('id')->all();
        $priorAllocated = \App\Models\PaymentAllocation::sumAllocatedByInvoiceIds('sale_invoice', $priorIds);

        $openingBalance = 0.0;
        foreach ($priorInvoices as $pInv) {
            $t = $this->num(
                $pInv->invoice_total ?? null,
                $pInv->total ?? null,
                $pInv->grand_total ?? null,
                $pInv->net_total ?? null,
                $pInv->gross_amount ?? null,
                $pInv->sub_total ?? null
            );
            $rawR = $this->num(
                $pInv->total_receive ?? null,
                $pInv->total_recieve ?? null,
                $pInv->received ?? null,
                $pInv->amount_received ?? null
            );
            $alloc = (float) ($priorAllocated[$pInv->id] ?? 0);
            $r = max(0.0, min($rawR - $alloc, $t));
            $openingBalance += max(0.0, $t - $r);
        }

        $priorLedgers = CustomerLedger::query()
            ->where('customer_id', $customerId)
            ->whereIn('entry_type', ['payment', 'manual'])
            ->where('entry_date', '<', $from)
            ->get();

        foreach ($priorLedgers as $pRow) {
            if (strtolower((string) $pRow->entry_type) === 'manual') {
                $openingBalance += ((float) ($pRow->invoice_total ?? 0) - (float) ($pRow->total_received ?? 0));
            } elseif (strtolower((string) $pRow->entry_type) === 'payment') {
                $openingBalance -= (float) ($pRow->credited_amount ?? 0);
            }
        }

        return round($openingBalance, 2);
    }

    /** ================================
     * GET /api/customer-ledger?customer_id=&from=&to=
     * Build ledger view:
     *  - INVOICE rows are read-through from SaleInvoice
     *  - PAYMENT & MANUAL rows from CustomerLedger
     * ================================ */
    public function index(Request $request)
    {
        $this->authorize('viewAny', CustomerLedger::class);
        $request->validate([
            'customer_id' => ['required','integer','exists:customers,id'],
            'from'        => ['nullable','date'],
            'to'          => ['nullable','date'],
        ]);

        $customerId = (int)$request->customer_id;
        $from = $request->from;
        $to   = $request->to;

        $customer = Customer::find($customerId);
        if ($customer && $customer->isWalkIn()) {
            return response()->json([
                'data' => [],
                'summary' => [
                    'opening_balance'     => 0.0,
                    'total_invoiced'      => 0.0,
                    'received_on_invoice' => 0.0,
                    'payments_credited'   => 0.0,
                    'net_balance'         => 0.0,
                ],
            ]);
        }

        $toEnd = $to ? ($to . ' 23:59:59') : null;

        // ---- Editable rows (payment + manual) ----
        $manualAndPayments = CustomerLedger::query()
            ->where('customer_id', $customerId)
            ->whereIn('entry_type', ['payment','manual'])
            ->when($from, fn($q)=>$q->where('entry_date','>=',$from))
            ->when($toEnd, fn($q)=>$q->where('entry_date','<=',$toEnd))
            ->orderBy('entry_date')->orderBy('id')
            ->get();

        // ---- Invoice rows (read-through from sale_invoices) ----
        // Only include non-reversed credit invoices in the ledger
        $invoices = SaleInvoice::query()
            ->where('customer_id', $customerId)
            ->where('invoice_type', 'credit')
            ->where(fn ($q) => $q->whereNull('status')->orWhere('status', '!=', 'reversed'))
            ->when($from, fn($q)=>$q->where('date','>=',$from))
            ->when($toEnd, fn($q)=>$q->where('date','<=',$toEnd))
            ->orderBy('date')->orderBy('id')
            ->get([
                // include generous set; we’ll pick what exists
                'id',
                'invoice_no',
                'posted_number',
                'date',
                'invoice_total', 'total', 'grand_total', 'net_total', 'gross_amount', 'sub_total',
                'total_receive', 'total_recieve', 'received', 'amount_received',
            ]);

        $invoiceIds = $invoices->pluck('id')->all();
        $allocatedByInvoice = \App\Models\PaymentAllocation::sumAllocatedByInvoiceIds('sale_invoice', $invoiceIds);

        $invoiceRows = $invoices->map(function ($inv) use ($customerId, $allocatedByInvoice) {
            // Invoice Total - pick the first that exists on your model
            $invoiceTotal = $this->num(
                $inv->invoice_total ?? null,
                $inv->total ?? null,
                $inv->grand_total ?? null,
                $inv->net_total ?? null,
                $inv->gross_amount ?? null,
                $inv->sub_total ?? null
            );

            // Received on Invoice - robust to spelling/alt columns (capped at invoice total for invoice row)
            $rawReceived = $this->num(
                $inv->total_receive ?? null,
                $inv->total_recieve ?? null,
                $inv->received ?? null,
                $inv->amount_received ?? null
            );
            $allocated = (float) ($allocatedByInvoice[$inv->id] ?? 0);
            $receivedOnInv = max(0.0, min($rawReceived - $allocated, $invoiceTotal));

            // Balance remaining for this invoice row (excluding separate allocated payment rows)
            $balanceRemaining = max($invoiceTotal - $receivedOnInv, 0);
            // Actual remaining unpaid balance on the invoice itself (including allocated payments)
            $invoiceSettled = min($rawReceived, $invoiceTotal);
            $invoiceDue = max($invoiceTotal - $invoiceSettled, 0);

            // Use 'date' column from sale_invoices (not invoice_date which doesn't exist)
            $entryDate = $inv->date ? Carbon::parse($inv->date)->format('Y-m-d') : null;

            return [
                'id'                => $inv->id,
                'customer_id'       => $customerId,
                'sale_invoice_id'   => $inv->id,
                'entry_type'        => 'invoice',
                'is_manual'         => false,
                'entry_date'        => $entryDate,
                'posted_number'     => $this->str($inv->posted_number),
                'invoice_total'     => $invoiceTotal,
                'total_received'    => round($receivedOnInv, 2),
                // Payment (Credit) shows the remaining balance for this invoice
                'credited_amount'   => $balanceRemaining,
                'payment_ref'       => '',
                // Balance Remaining is the same as credited_amount for invoice rows
                'balance_remaining' => round($balanceRemaining, 2),
                'invoice_settled'   => round($invoiceSettled, 2),
                'invoice_due'       => round($invoiceDue, 2),
                'description'       => 'Sale Invoice ' . $this->str($inv->posted_number),
            ];
        });

        // ---- Normalize payment + manual rows ----
        $mp = $manualAndPayments->map(function (CustomerLedger $r) {
            $isInvoiceLike = $r->entry_type === 'manual';
            $invTotal  = $isInvoiceLike ? (float)($r->invoice_total ?? 0) : 0.0;
            $invRecv   = $isInvoiceLike ? (float)($r->total_received ?? 0) : 0.0;
            $balRemain = $isInvoiceLike ? max($invTotal - $invRecv, 0) : 0.0;

            return [
                'id'                => $r->id,
                'customer_id'       => $r->customer_id,
                'sale_invoice_id'   => $r->sale_invoice_id,
                'sale_return_id'    => $r->sale_return_id,
                'payment_id'        => $r->payment_id,
                'entry_type'        => $r->entry_type, // payment | manual
                'is_manual'         => (bool)$r->is_manual,
                'entry_date'        => optional($r->entry_date)->format('Y-m-d'),
                'posted_number'     => $r->posted_number,
                // invoice_number not used in UI anymore
                'invoice_total'     => $invTotal,
                'total_received'    => $invRecv,
                // (5) Received Payment
                'credited_amount'   => (float)($r->credited_amount ?? 0),
                'payment_ref'       => $r->payment_ref,
                'balance_remaining' => round($balRemain, 2),
                'description'       => $r->description,
            ];
        });

        // ---- Merge & sort by date, then by id ----
        $all = collect()->merge($invoiceRows)->merge($mp)
            ->sortBy([['entry_date','asc'], ['id','asc']], SORT_STRING, [false, false])
            ->values()
            ->all();

        // ---- Calculate running balance ----
        // Running balance = Opening balance + Previous balance + Invoice remaining - Payments
        $openingBalance = $this->calculateOpeningBalance($customerId, $from);
        $runningBalance = $openingBalance;
        foreach ($all as &$row) {
            $type = $row['entry_type'];
            
            if ($type === 'invoice' || $type === 'manual') {
                // Add the remaining balance (what customer owes) to running balance
                $runningBalance += (float)$row['balance_remaining'];
            } elseif ($type === 'payment') {
                // Subtract the payment from running balance
                $runningBalance -= (float)$row['credited_amount'];
            }
            
            $row['running_balance'] = round($runningBalance, 2);
        }
        unset($row); // Break reference

        // ---- Summary cards ----
        $totalInvoiced = 0.0;
        $receivedOnInv = 0.0;
        $paymentsCred  = 0.0;

        foreach ($all as $row) {
            if ($row['entry_type'] === 'invoice' || $row['entry_type'] === 'manual') {
                $totalInvoiced += (float)($row['invoice_total'] ?? 0);
                $receivedOnInv += (float)($row['total_received'] ?? 0);
            }
            if ($row['entry_type'] === 'payment') {
                $paymentsCred  += (float)($row['credited_amount'] ?? 0);
            }
        }

        // Net Balance = Opening Balance + Total Invoiced - Received on Invoice - Payments
        // This is the total amount still owed by the customer at period end
        $net = $openingBalance + ($totalInvoiced - $receivedOnInv) - $paymentsCred;

        return response()->json([
            'data' => $all,
            'summary' => [
                'opening_balance'     => round($openingBalance, 2),
                'total_invoiced'      => round($totalInvoiced, 2),
                'received_on_invoice' => round($receivedOnInv, 2),
                'payments_credited'   => round($paymentsCred, 2),
                'net_balance'         => round($net, 2),
            ],
        ]);
    }

    /** ================================
     * POST /api/customer-ledger
     * Create PAYMENT or MANUAL row
     * ================================ */
    public function store(Request $request)
    {
        $this->authorize('create', CustomerLedger::class);
        $data = $request->validate([
            'customer_id'     => ['required','integer','exists:customers,id'],
            'entry_date'      => ['required','date'],
            'entry_type'      => ['nullable', Rule::in(['payment','manual'])],
            'posted_number'   => ['nullable','string','max:100'],
            // invoice_number removed
            'invoice_total'   => ['nullable','numeric'],
            'total_received'  => ['nullable','numeric'],
            'credited_amount' => ['nullable','numeric'],
            'payment_ref'     => ['nullable','string','max:200'],
            'sale_invoice_id' => ['nullable','integer','exists:sale_invoices,id'],
            'description'     => ['nullable','string','max:500'],
        ]);

        $customer = Customer::find((int)$data['customer_id']);
        if ($customer && $customer->isWalkIn()) {
            $walkInMsg = 'Walk-In Customer bills cannot be saved with unpaid credit (Udhar)—select or create a named Customer if the bill is not paid in full.';
            return response()->json([
                'message' => $walkInMsg,
                'errors'  => [
                    'customer_id' => [$walkInMsg],
                ],
            ], 422);
        }

        $type = $data['entry_type'] ?? (!empty($data['credited_amount']) ? 'payment' : 'manual');

        $row = new CustomerLedger();
        $row->customer_id       = (int)$data['customer_id'];
        $row->entry_date        = $data['entry_date'];
        $row->entry_type        = $type;
        $row->is_manual         = true;
        $row->posted_number     = $data['posted_number'] ?? null;
        $row->invoice_total     = (float)($data['invoice_total']  ?? 0);
        $row->total_received    = (float)($data['total_received'] ?? 0);
        $row->balance_remaining = max($row->invoice_total - $row->total_received, 0);
        $row->credited_amount   = (float)($data['credited_amount'] ?? 0);
        $row->payment_ref       = $data['payment_ref'] ?? null;
        $row->sale_invoice_id   = $data['sale_invoice_id'] ?? null;
        $row->description       = $data['description'] ?? null;
        $row->created_by        = Auth::id();
        $row->save();

        return response()->json(['status' => 'ok', 'row' => $row], 201);
    }

    /** ================================
     * PUT /api/customer-ledger/bulk
     * Update PAYMENT or MANUAL rows
     * ================================ */
    public function bulkUpdate(Request $request)
    {
        $this->authorize('updateAny', CustomerLedger::class);
        $payload = $request->validate([
            'rows' => ['required','array','min:1'],
            'rows.*.id'              => ['required','integer','exists:customer_ledgers,id'],
            'rows.*.entry_date'      => ['required','date'],
            'rows.*.posted_number'   => ['nullable','string','max:100'],
            'rows.*.invoice_total'   => ['nullable','numeric'],
            'rows.*.total_received'  => ['nullable','numeric'],
            'rows.*.credited_amount' => ['nullable','numeric'],
            'rows.*.payment_ref'     => ['nullable','string','max:200'],
            'rows.*.description'     => ['nullable','string','max:500'],
        ]);

        DB::transaction(function () use ($payload) {
            foreach ($payload['rows'] as $r) {
                /** @var CustomerLedger $row */
                $row = CustomerLedger::findOrFail($r['id']);

                if ($row->entry_type === 'invoice' && !$row->is_manual) {
                    abort(422, 'Cannot update invoice rows');
                }

                $isSystemLinked = !empty($row->payment_id) || !empty($row->sale_return_id);

                $row->entry_date      = $r['entry_date'];
                $row->posted_number   = $r['posted_number']  ?? null;

                if ($row->entry_type === 'manual' && !$isSystemLinked) {
                    $row->invoice_total     = (float)($r['invoice_total']  ?? 0);
                    $row->total_received    = (float)($r['total_received'] ?? 0);
                    $row->balance_remaining = max($row->invoice_total - $row->total_received, 0);
                }

                if (($row->entry_type === 'payment' || $row->is_manual) && !$isSystemLinked) {
                    $row->credited_amount = (float)($r['credited_amount'] ?? 0);
                    $row->payment_ref     = $r['payment_ref'] ?? null;
                }

                $row->description = $r['description'] ?? null;
                $row->save();
            }
        });

        return response()->json(['status' => 'ok']);
    }

    /** ================================
     * DELETE /api/customer-ledger/{customerLedger}
     * ================================ */
    public function destroy(CustomerLedger $customerLedger)
    {
        $this->authorize('delete', $customerLedger);
        if ($customerLedger->entry_type === 'invoice' && !$customerLedger->is_manual) {
            return response()->json(['message' => 'Cannot delete invoice row'], 422);
        }
        if (!empty($customerLedger->sale_return_id)) {
            return response()->json(['message' => 'Cannot delete auto-synced return credit note row. Delete or edit the Sale Return instead.'], 422);
        }
        if (!empty($customerLedger->payment_id) && Schema::hasTable('payments')) {
            $payment = \App\Models\Payment::find($customerLedger->payment_id);
            if ($payment && $payment->status !== 'reversed') {
                app(\App\Services\PaymentService::class)->reversePayment(
                    $payment,
                    'Deleted from Customer Ledger',
                    Auth::user()
                );
                return response()->json(['status' => 'ok']);
            }
        }
        $customerLedger->delete();
        return response()->json(['status' => 'ok']);
    }

    /** ================================
     * POST /api/customer-ledger/settle-invoice
     * Mark a credit sale invoice as fully paid and sync the ledger in one shot:
     *   1) sale_invoices.total_receive = invoice total (invoice side)
     *   2) customer_ledgers invoice row: total_received = total, balance_remaining = 0
     *   3) deposit settled amount into cash/selected account & active cash drawer
     * ================================ */
    public function settleInvoice(Request $request)
    {
        $this->authorize('updateAny', CustomerLedger::class);

        $data = $request->validate([
            'sale_invoice_id' => ['required','integer','exists:sale_invoices,id'],
            'entry_date'      => ['nullable','date'],
            'payment_method'  => ['nullable','string'],
            'account_id'      => ['nullable','integer','exists:accounts,id'],
        ]);

        $result = DB::transaction(function () use ($data) {
            /** @var SaleInvoice $invoice */
            $invoice = SaleInvoice::lockForUpdate()->findOrFail($data['sale_invoice_id']);

            $invoiceTotal = $this->num(
                $invoice->invoice_total ?? null,
                $invoice->total ?? null,
                $invoice->grand_total ?? null,
                $invoice->net_total ?? null,
                $invoice->gross_amount ?? null,
                $invoice->sub_total ?? null
            );

            $received = $this->num(
                $invoice->total_receive ?? null,
                $invoice->total_recieve ?? null,
                $invoice->received ?? null,
                $invoice->amount_received ?? null
            );

            $balance = round(max($invoiceTotal - $received, 0), 2);

            if ($balance <= 0) {
                return ['already_paid' => true, 'settled' => 0.0, 'invoice' => $invoice];
            }

            $postedNumber = $this->str($invoice->posted_number ?? null, $invoice->invoice_no ?? null);
            $customer = Customer::findOrFail((int) $invoice->customer_id);
            $payMethod = $data['payment_method'] ?? 'cash';
            $entryDate = $data['entry_date'] ?? now()->toDateString();

            if (Schema::hasTable('payments') && Schema::hasTable('payment_allocations')) {
                $payment = app(\App\Services\PaymentService::class)->recordCustomerPayment(
                    $customer,
                    [
                        'payment_date'   => $entryDate,
                        'amount'         => $balance,
                        'payment_method' => $payMethod,
                        'account_id'     => $data['account_id'] ?? null,
                        'reference'      => 'Inv #' . ($postedNumber ?? $invoice->id),
                        'notes'          => 'Settled Sale Invoice ' . ($postedNumber ?? "#{$invoice->id}"),
                        'allocations'    => [
                            [
                                'invoice_id' => $invoice->id,
                                'amount'     => $balance,
                            ],
                        ],
                    ],
                    Auth::user()
                );

                return [
                    'already_paid' => false,
                    'settled'      => round($balance, 2),
                    'invoice'      => $invoice->fresh(),
                    'payment_id'   => $payment->id,
                ];
            }

            // ---- Fallback when payments table is unavailable ----
            $invoice->total_receive = $invoiceTotal;
            $invoice->save();

            // ---- (2) Ledger side: keep the invoice row consistent ----
            $postedNumber = $this->str($invoice->posted_number ?? null, $invoice->invoice_no ?? null);
            $allocated = 0.0;
            if (Schema::hasTable('payment_allocations') && Schema::hasTable('payments')) {
                $allocated = (float) \App\Models\PaymentAllocation::query()
                    ->where('invoice_type', 'sale_invoice')
                    ->where('invoice_id', $invoice->id)
                    ->whereHas('payment', fn($q) => $q->where('status', 'posted'))
                    ->sum('amount');
            }
            $recvOnInv = max(0.0, $invoiceTotal - $allocated);
            $balOnInv  = max(0.0, $invoiceTotal - $recvOnInv);

            $ledgerRow = CustomerLedger::where('sale_invoice_id', $invoice->id)
                ->where('entry_type', 'invoice')
                ->lockForUpdate()
                ->first();

            if ($ledgerRow) {
                $ledgerRow->total_received    = $recvOnInv;
                $ledgerRow->balance_remaining = $balOnInv;
                $ledgerRow->save();
            } else {
                // Legacy credit invoice that never got a ledger row — create one so the
                // customer ledger (and net balance) stays accurate.
                $ledgerRow = new CustomerLedger();
                $ledgerRow->customer_id       = (int)$invoice->customer_id;
                $ledgerRow->sale_invoice_id   = $invoice->id;
                $ledgerRow->entry_type        = 'invoice';
                $ledgerRow->is_manual         = false;
                $ledgerRow->entry_date        = $data['entry_date'] ?? ($invoice->date ?: now()->toDateString());
                $ledgerRow->posted_number     = $postedNumber;
                $ledgerRow->invoice_total     = $invoiceTotal;
                $ledgerRow->total_received    = $recvOnInv;
                $ledgerRow->balance_remaining = $balOnInv;
                $ledgerRow->credited_amount   = 0;
                $ledgerRow->payment_ref       = null;
                $ledgerRow->description       = 'Sale invoice ' . ($postedNumber ?? $invoice->id) . ' (marked paid)';
                $ledgerRow->created_by        = Auth::id();
                $ledgerRow->save();
            }

            // ---- (3) Financial account & Cash Drawer sync ----
            $payMethod = $data['payment_method'] ?? 'cash';
            $account = app(\App\Services\AccountService::class)->resolveAccount($data['account_id'] ?? null, $payMethod);
            if ($account) {
                app(\App\Services\AccountService::class)->deposit(
                    $account,
                    $balance,
                    'customer_payment',
                    $invoice->id,
                    "Settled Sale Invoice " . ($postedNumber ?? "#{$invoice->id}"),
                    Auth::user()
                );
            }

            if (($account && $account->type === 'cash') || $payMethod === 'cash') {
                app(\App\Services\CashDrawerService::class)->recordTransaction(
                    null,
                    'customer_payment',
                    $balance,
                    'sale_invoice',
                    $invoice->id,
                    "Settled Sale Invoice " . ($postedNumber ?? "#{$invoice->id}"),
                    Auth::user()
                );
            }

            return ['already_paid' => false, 'settled' => round($balance, 2), 'invoice' => $invoice];
        });

        if ($result['already_paid']) {
            return response()->json([
                'status'  => 'ok',
                'settled' => 0,
                'message' => 'Invoice is already fully paid',
            ]);
        }

        return response()->json([
            'status'          => 'ok',
            'settled'         => $result['settled'],
            'sale_invoice_id' => $result['invoice']->id,
            'posted_number'   => $this->str($result['invoice']->posted_number ?? null, $result['invoice']->invoice_no ?? null),
            'payment_id'      => $result['payment_id'] ?? null,
        ]);
    }

    /** ================================
     * POST /api/customer-ledger/rebuild { customer_id }
     * Upsert invoice rows with robust field reads
     * ================================ */
    public function rebuild(Request $request)
    {
        $this->authorize('updateAny', CustomerLedger::class);
        $request->validate([
            'customer_id' => ['required','integer','exists:customers,id'],
        ]);
        $customerId = (int)$request->customer_id;
        $customer = Customer::find($customerId);
        if ($customer && $customer->isWalkIn()) {
            CustomerLedger::where('customer_id', $customerId)->delete();
            return response()->json(['status' => 'ok']);
        }

        DB::transaction(function () use ($customerId) {
            // Remove any ledger rows pointing to reversed invoices
            $reversedIds = SaleInvoice::where('customer_id', $customerId)
                ->where('status', 'reversed')
                ->pluck('id')
                ->all();
            foreach (array_chunk($reversedIds, 500) as $revChunk) {
                CustomerLedger::where('customer_id', $customerId)
                    ->whereIn('sale_invoice_id', $revChunk)
                    ->delete();
            }

            // Only rebuild non-reversed credit invoices
            $invoices = SaleInvoice::where('customer_id', $customerId)
                ->where('invoice_type', 'credit')
                ->where(fn ($q) => $q->whereNull('status')->orWhere('status', '!=', 'reversed'))
                ->get([
                    'id','invoice_no','posted_number','date',
                    'invoice_total','total','grand_total','net_total','gross_amount','sub_total',
                    'total_receive','total_recieve','received','amount_received',
                ]);

            $invIds = $invoices->pluck('id')->all();
            $allocatedByInvoice = \App\Models\PaymentAllocation::sumAllocatedByInvoiceIds('sale_invoice', $invIds);

            foreach ($invoices as $inv) {
                $invTotal = $this->num(
                    $inv->invoice_total ?? null,
                    $inv->total ?? null,
                    $inv->grand_total ?? null,
                    $inv->net_total ?? null,
                    $inv->gross_amount ?? null,
                    $inv->sub_total ?? null
                );
                $rawRecv = $this->num(
                    $inv->total_receive ?? null,
                    $inv->total_recieve ?? null,
                    $inv->received ?? null,
                    $inv->amount_received ?? null
                );
                $allocated = (float) ($allocatedByInvoice[$inv->id] ?? 0);
                $recv = max(0.0, $rawRecv - $allocated);
                $recvOnInv = min($recv, $invTotal);
                $excess = max(0.0, $recv - $invTotal);

                // Use 'date' column from sale_invoices (not invoice_date which doesn't exist)
                $entryDate = $inv->date ?? now()->toDateString();

                CustomerLedger::updateOrCreate(
                    [
                        'customer_id'     => $customerId,
                        'sale_invoice_id' => $inv->id,
                        'entry_type'      => 'invoice',
                        'is_manual'       => false,
                    ],
                    [
                        'entry_date'        => $entryDate,
                        'posted_number'     => $this->str($inv->posted_number),
                        'invoice_total'     => $invTotal,
                        'total_received'    => $recvOnInv,
                        'balance_remaining' => max($invTotal - $recvOnInv, 0),
                        'credited_amount'   => 0,
                        'payment_ref'       => null,
                        'description'       => $this->str($inv->invoice_no ? ('Invoice #'.$inv->invoice_no) : null),
                    ]
                );

                if ($excess > 0) {
                    CustomerLedger::updateOrCreate(
                        [
                            'customer_id'     => $customerId,
                            'payment_ref'     => 'Inv #' . $this->str($inv->posted_number),
                            'entry_type'      => 'payment',
                            'is_manual'       => false,
                        ],
                        [
                            'sale_invoice_id'   => null,
                            'entry_date'        => $entryDate,
                            'posted_number'     => $this->str($inv->posted_number),
                            'invoice_total'     => 0,
                            'total_received'    => 0,
                            'balance_remaining' => 0,
                            'credited_amount'   => $excess,
                            'description'       => 'Payment received on invoice ' . $this->str($inv->posted_number),
                        ]
                    );
                } else {
                    CustomerLedger::where('customer_id', $customerId)
                        ->where('payment_ref', 'Inv #' . $this->str($inv->posted_number))
                        ->where('entry_type', 'payment')
                        ->where('is_manual', false)
                        ->delete();
                }
            }
        });

        return response()->json(['status' => 'ok', 'message' => 'Rebuilt from sale invoices']);
    }

    /** ================================
     * POST /api/auth/confirm-password
     * ================================ */
    public function confirmPassword(Request $request)
    {
        $request->validate(['password' => ['required','string']]);
        $user = Auth::user();
        if (!$user || !Hash::check($request->password, $user->password)) {
            return response()->json(['message' => 'Incorrect password'], 422);
        }
        return response()->json(['status' => 'ok']);
    }

    /** ================================
     * GET /api/customer-ledger/print-url
     * ================================ */
    public function printUrl(Request $request)
    {
        $this->authorize('viewAny', CustomerLedger::class);

        $customerId = (int) $request->query('customer_id');
        abort_if(!$customerId, 422, 'Customer is required');

        $customer = \App\Models\Customer::findOrFail($customerId);

        $params = array_filter([
            'customer_id' => $customer->id,
            'type'        => $request->query('type'),
            'from'        => $request->query('from'),
            'to'          => $request->query('to'),
        ], fn ($v) => $v !== null && $v !== '');

        $url = \Illuminate\Support\Facades\URL::temporarySignedRoute(
            'customer-ledger.print',
            now()->addMinutes(5),
            $params
        );

        return response()->json(['url' => $url]);
    }

    /** ================================
     * GET /customer-ledger/print
     * ================================ */

    public function print(Request $request)
{
    // -------- Validate + fetch basics --------
    $customerId = (int) $request->query('customer_id');
    abort_if(!$customerId, 404, 'Customer is required');

    $customer = \App\Models\Customer::findOrFail($customerId);
    $setting  = \App\Models\Setting::first();

    // Accept aliases; default to A4
    $type = strtolower((string) $request->query('type', $setting->printer_type ?? 'a4'));
    $aliases = [
        'invoice'      => 'a4',
        'a4_invoice'   => 'a4',
        'a4-portrait'  => 'a4',
        'receipt'      => 'thermal',
        'pos'          => 'thermal',
    ];
    if (isset($aliases[$type])) $type = $aliases[$type];
    $type = in_array($type, ['a4', 'thermal'], true) ? $type : 'a4';
    $view = $type === 'thermal'
        ? 'printer.customer_ledger_thermal'
        : 'printer.customer_ledger_a4';

    $from = $request->query('from');
    $to   = $request->query('to');

    // -------- Choose existing date column safely --------
    $hasInvoiceDate = \Illuminate\Support\Facades\Schema::hasColumn('sale_invoices', 'invoice_date');
    $dateColumn     = $hasInvoiceDate ? 'invoice_date' : 'date';

    // Optional: whether you have invoice_no column
    $hasInvoiceNo   = \Illuminate\Support\Facades\Schema::hasColumn('sale_invoices', 'invoice_no');

    // Build select list (only include columns that exist)
    $selectCols = [
        'id', 'posted_number', 'date',
        'invoice_total','total','grand_total','net_total','gross_amount','sub_total',
        'total_receive','total_recieve','received','amount_received',
    ];
    if ($hasInvoiceDate) $selectCols[] = 'invoice_date';
    if ($hasInvoiceNo)   $selectCols[] = 'invoice_no';

    // -------- 1) Read-through INVOICE rows from sale_invoices --------
    // Only include non-reversed credit invoices in the ledger
    $rawInvoices = \App\Models\SaleInvoice::query()
        ->where('customer_id', $customer->id)
        ->where('invoice_type', 'credit')
        ->where(fn ($q) => $q->whereNull('status')->orWhere('status', '!=', 'reversed'))
        ->when($from, fn($q) => $q->whereDate($dateColumn, '>=', $from))
        ->when($to,   fn($q) => $q->whereDate($dateColumn, '<=', $to))
        ->orderBy($dateColumn)
        ->orderBy('id')
        ->get($selectCols);

    $invIds = $rawInvoices->pluck('id')->all();
    $allocatedByInvoice = \App\Models\PaymentAllocation::sumAllocatedByInvoiceIds('sale_invoice', $invIds);

    $invoices = $rawInvoices->map(function ($inv) use ($hasInvoiceDate, $hasInvoiceNo, $allocatedByInvoice) {
            // robust totals
            $t = (float) ($inv->invoice_total ?? $inv->total ?? $inv->grand_total ?? $inv->net_total ?? $inv->gross_amount ?? $inv->sub_total ?? 0);
            $rawR = (float) ($inv->total_receive ?? $inv->total_recieve ?? $inv->received ?? $inv->amount_received ?? 0);
            $allocated = (float) ($allocatedByInvoice[$inv->id] ?? 0);
            $r = max(0.0, min($rawR - $allocated, $t));

            // entry date
            $rawDate   = $hasInvoiceDate ? ($inv->invoice_date ?? $inv->date) : $inv->date;
            $entryDate = $rawDate ? \Carbon\Carbon::parse($rawDate)->format('Y-m-d') : null;

            // invoice number (fallback to posted_number if you want it visible)
            $invoiceNumber = $hasInvoiceNo ? ($inv->invoice_no ?? null) : null;

            return (object) [
                'id'                 => $inv->id,
                'entry_type'         => 'invoice',
                'is_manual'          => false,
                'entry_date'         => $entryDate,
                'posted_number'      => $inv->posted_number,
                'invoice_number'     => $invoiceNumber, // or: $inv->posted_number
                'invoice_total'      => $t,
                'total_received'     => $r,
                'credited_amount'    => 0.0,
                'payment_ref'        => null,
                'description'        => $invoiceNumber ? ('Invoice #'.$invoiceNumber) : null,
                'sale_invoice_id'    => $inv->id,
            ];
        });

    // -------- 2) MANUAL + PAYMENT rows from customer_ledgers --------
    $manualAndPayments = \App\Models\CustomerLedger::query()
        ->where('customer_id', $customer->id)
        ->whereIn('entry_type', ['payment', 'manual'])
        ->when($from, fn($q) => $q->whereDate('entry_date', '>=', $from))
        ->when($to,   fn($q) => $q->whereDate('entry_date', '<=', $to))
        ->orderBy('entry_date')
        ->orderBy('id')
        ->get()
        ->map(function (\App\Models\CustomerLedger $r) {
            $isInvoiceLike = strtolower($r->entry_type) === 'manual'; // manual behaves like invoice row
            return (object) [
                'id'                 => $r->id,
                'entry_type'         => strtolower($r->entry_type), // 'payment' | 'manual'
                'is_manual'          => (bool) $r->is_manual,
                'entry_date'         => optional($r->entry_date)->format('Y-m-d'),
                'posted_number'      => $r->posted_number,
                'invoice_number'     => null,
                'invoice_total'      => $isInvoiceLike ? (float)($r->invoice_total ?? 0) : 0.0,
                'total_received'     => $isInvoiceLike ? (float)($r->total_received ?? 0) : 0.0,
                'credited_amount'    => (float)($r->credited_amount ?? 0),
                'payment_ref'        => $r->payment_ref,
                'description'        => $r->description,
                'sale_invoice_id'    => $r->sale_invoice_id,
            ];
        });

    // -------- 3) Merge + sort --------
    $all = $invoices->merge($manualAndPayments)
        ->sortBy(fn($r) => [$r->entry_date, $r->id ?? 0])
        ->values();

    // -------- 4) Running balance + per-row "credit remaining" --------
    $openingBalance = $this->calculateOpeningBalance($customer->id, $from);
    $balance = $openingBalance;
    foreach ($all as $r) {
        $type = strtolower($r->entry_type);
        $creditRemaining = 0.0;

        if (in_array($type, ['invoice', 'manual'], true)) {
            $delta = (float)$r->invoice_total - (float)$r->total_received; // negative allowed for reversals
            $creditRemaining = max($delta, 0);
            $balance += $delta;
        } elseif ($type === 'payment') {
            $balance -= (float)$r->credited_amount;
        }

        $r->credit_remaining_calc = round($creditRemaining, 2);
        $r->running_balance       = round($balance, 2);
    }

    // -------- 5) Summary (matches your UI header math) --------
    $sumInv   = (float) $all->whereIn('entry_type', ['invoice','manual'])->sum('invoice_total');
    $sumRecv  = (float) $all->whereIn('entry_type', ['invoice','manual'])->sum('total_received');
    $sumPay   = (float) $all->where('entry_type', 'payment')->sum('credited_amount');

    $summary = [
        'opening_balance'     => $openingBalance,
        'total_invoiced'      => $sumInv,
        'received_on_invoice' => $sumRecv,
        'payments_credited'   => $sumPay,
        'net_balance'         => round($openingBalance + ($sumInv - $sumRecv) - $sumPay, 2),
    ];

    // -------- Render --------
    return view($view, [
        'customer' => $customer,
        'setting'  => $setting,
        'rows'     => $all,
        'summary'  => $summary,
        'from'     => $from,
        'to'       => $to,
    ]);
}

    

}
