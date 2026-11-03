<?php

namespace App\Http\Controllers;

use App\Models\SupplierLedger;
use App\Models\PurchaseInvoice;
use App\Models\Setting;
use App\Models\Supplier;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;

class SupplierLedgerController extends Controller
{
    private function calculateOpeningBalance(int $supplierId, ?string $from): float
    {
        if (!$from) {
            return 0.0;
        }

        $priorRows = SupplierLedger::with(['purchaseInvoice:id,invoice_number,posted_number,total_amount,total_paid,status'])
            ->where('supplier_id', $supplierId)
            ->whereDate('entry_date', '<', $from)
            ->get();

        $priorInvIds = $priorRows->pluck('purchase_invoice_id')->filter()->unique()->values()->all();
        $priorAllocated = \App\Models\PaymentAllocation::sumAllocatedByInvoiceIds('purchase_invoice', $priorInvIds);

        $openingBalance = 0.0;
        foreach ($priorRows as $pRow) {
            if ($pRow->entry_type === 'invoice' && $pRow->purchaseInvoice && $pRow->purchaseInvoice->status === 'reversed') {
                continue;
            }
            $invTotal = (float) ($pRow->invoice_total ?? 0);
            $paidOnInv = (float) ($pRow->total_paid ?? 0);
            if ($pRow->entry_type === 'invoice' && $pRow->purchaseInvoice) {
                $inv = $pRow->purchaseInvoice;
                $invTotal = (float) ($inv->total_amount ?? $invTotal);
                $rawPaid = (float) ($inv->total_paid ?? $paidOnInv);
                $alloc = (float) ($priorAllocated[$inv->id] ?? 0);
                $paidOnInv = max(0.0, min($rawPaid - $alloc, $invTotal));
            }
            if (in_array($pRow->entry_type, ['invoice', 'manual'], true)) {
                $openingBalance += ($invTotal - $paidOnInv);
            } elseif ($pRow->entry_type === 'payment') {
                $openingBalance -= (float) ($pRow->debited_amount ?? 0);
            }
        }

        return round($openingBalance, 2);
    }

    // GET /api/supplier-ledger?supplier_id=..&from=..&to=..
    public function index(Request $request)
    {
        $this->authorize('viewAny', SupplierLedger::class);

        $validated = $request->validate([
            'supplier_id' => ['required','integer','exists:suppliers,id'],
            'from'        => ['nullable','date'],
            'to'          => ['nullable','date'],
        ]);

        $q = SupplierLedger::with(['purchaseInvoice:id,invoice_number,posted_number,total_amount,total_paid'])
            ->where('supplier_id', $validated['supplier_id']);

        if ($request->filled('from')) $q->whereDate('entry_date', '>=', $request->get('from'));
        if ($request->filled('to'))   $q->whereDate('entry_date', '<=', $request->get('to'));

        $rows = $q->orderBy('entry_date')->orderBy('id')->get();

        $invIds = $rows->pluck('purchase_invoice_id')->filter()->unique()->values()->all();
        $allocatedByInvoice = \App\Models\PaymentAllocation::sumAllocatedByInvoiceIds('purchase_invoice', $invIds);

        foreach ($rows as $row) {
            if ($row->entry_type === 'invoice' && $row->purchaseInvoice) {
                $inv = $row->purchaseInvoice;
                $invTotal = (float) ($inv->total_amount ?? $row->invoice_total ?? 0);
                $rawPaid  = (float) ($inv->total_paid ?? $row->total_paid ?? 0);
                $allocated = (float) ($allocatedByInvoice[$inv->id] ?? 0);
                $paidOnInv = max(0.0, min($rawPaid - $allocated, $invTotal));
                $creditRem = max(0.0, round($invTotal - $paidOnInv, 2));
                $invSettled = min($rawPaid, $invTotal);
                $invDue    = max(0.0, round($invTotal - $invSettled, 2));

                $row->invoice_total    = $invTotal;
                $row->total_paid       = $paidOnInv;
                $row->credit_remaining = $creditRem;
                $row->invoice_settled  = round($invSettled, 2);
                $row->invoice_due      = $invDue;
            }
        }

        $openingBalance = $this->calculateOpeningBalance((int) $validated['supplier_id'], $request->get('from'));
        $invoiceRows = $rows->whereIn('entry_type', ['invoice', 'manual']);
        $paymentRows = $rows->where('entry_type', 'payment');

        $summary = [
            'opening_balance'  => $openingBalance,
            'total_invoiced'   => $invoiceRows->sum('invoice_total'),
            'paid_on_invoice'  => $invoiceRows->sum('total_paid'),
            'payments_debited' => $paymentRows->sum('debited_amount'),
            'net_balance'      => round(
                $openingBalance
                + ($invoiceRows->sum('invoice_total'))
                - ($invoiceRows->sum('total_paid') + $paymentRows->sum('debited_amount')),
                2
            ),
        ];

        return response()->json([
            'data'    => $rows->values(),
            'summary' => $summary,
        ]);
    }

    // POST /api/supplier-ledger   (create manual row OR a payment row)
    // Recognize "payment" if debited_amount > 0 and no purchase_invoice_id.
    public function store(Request $request)
    {
        $this->authorize('create', SupplierLedger::class);

        $validated = $request->validate([
            'supplier_id'        => ['required','integer','exists:suppliers,id'],
            'entry_date'         => ['required','date'],
            'description'        => ['nullable','string','max:255'],
            'posted_number'      => ['nullable','string','max:191'],
            'invoice_number'     => ['nullable','string','max:191'],

            // invoice snapshot (for manual invoice-like rows if you ever want)
            'invoice_total'      => ['nullable','numeric','min:0'],
            'total_paid'         => ['nullable','numeric','min:0'],

            // payment
            'debited_amount'     => ['nullable','numeric','min:0'],
            'payment_ref'        => ['nullable','string','max:191'],

            // tie to invoice if needed
            'purchase_invoice_id'=> ['nullable','integer','exists:purchase_invoices,id'],

            // explicit row kind coming from the UI ('payment' | 'manual')
            'entry_type'         => ['nullable', Rule::in(['payment','manual'])],
        ]);

        $isPayment = ($validated['entry_type'] ?? null) === 'payment'
            || (($validated['debited_amount'] ?? 0) > 0 && empty($validated['purchase_invoice_id']));
        $entryType = $isPayment ? 'payment' : (!empty($validated['purchase_invoice_id']) ? 'invoice' : 'manual');

        $invoiceTotal = (float)($validated['invoice_total'] ?? 0);
        $totalPaid    = (float)($validated['total_paid'] ?? 0);
        $credit       = round($invoiceTotal - $totalPaid, 2);
        if ($credit < 0) $credit = 0;

        $row = SupplierLedger::create([
            'supplier_id'         => $validated['supplier_id'],
            'purchase_invoice_id' => $validated['purchase_invoice_id'] ?? null,
            'entry_type'          => $entryType,
            'entry_date'          => $validated['entry_date'],
            'description'         => $validated['description'] ?? null,
            'posted_number'       => $validated['posted_number'] ?? null,
            'invoice_number'      => $validated['invoice_number'] ?? null,
            'invoice_total'       => $invoiceTotal,
            'total_paid'          => $totalPaid,
            'debited_amount'      => (float)($validated['debited_amount'] ?? 0),
            'payment_ref'         => $validated['payment_ref'] ?? null,
            'credit_remaining'    => $credit,
            'is_manual'           => $entryType !== 'invoice',
            'created_by'          => optional($request->user())->id,
        ]);

        return response()->json(['data' => $row], 201);
    }

    // PUT /api/supplier-ledger/bulk
    // rows: [{id, entry_date, description, posted_number, invoice_number, invoice_total, total_paid, debited_amount, payment_ref}]
    public function bulkUpdate(Request $request)
    {
        $this->authorize('updateAny', SupplierLedger::class);

        $validated = $request->validate([
            'rows'                        => ['required','array','min:1'],
            'rows.*.id'                   => ['required','integer','exists:supplier_ledgers,id'],
            'rows.*.entry_date'           => ['required','date'],
            'rows.*.description'          => ['nullable','string','max:255'],
            'rows.*.posted_number'        => ['nullable','string','max:191'],
            'rows.*.invoice_number'       => ['nullable','string','max:191'],
            'rows.*.invoice_total'        => ['required','numeric','min:0'],
            'rows.*.total_paid'           => ['required','numeric','min:0'],
            'rows.*.debited_amount'       => ['nullable','numeric','min:0'],
            'rows.*.payment_ref'          => ['nullable','string','max:191'],
        ]);

        DB::transaction(function () use ($validated) {
            foreach ($validated['rows'] as $r) {
                $existing = SupplierLedger::find($r['id']);
                if (!$existing) {
                    continue;
                }

                $isSystemLinked = !empty($existing->payment_id) || !empty($existing->purchase_return_id);
                $isSystemInvoice = $existing->entry_type === 'invoice' && !$existing->is_manual;

                $invTotal = ($isSystemInvoice || $isSystemLinked)
                    ? (float) $existing->invoice_total
                    : (float) ($r['invoice_total'] ?? 0);
                $totalPaid = ($isSystemInvoice || $isSystemLinked)
                    ? (float) $existing->total_paid
                    : (float) ($r['total_paid'] ?? 0);
                $debited = $isSystemLinked
                    ? (float) $existing->debited_amount
                    : (float) ($r['debited_amount'] ?? 0);

                $credit = round($invTotal - $totalPaid, 2);
                if ($credit < 0) $credit = 0;

                $existing->update([
                    'entry_date'       => $r['entry_date'],
                    'description'      => $r['description'] ?? null,
                    'posted_number'    => $r['posted_number'] ?? null,
                    'invoice_number'   => $r['invoice_number'] ?? null,
                    'invoice_total'    => $invTotal,
                    'total_paid'       => $totalPaid,
                    'debited_amount'   => $debited,
                    'payment_ref'      => $isSystemLinked ? $existing->payment_ref : ($r['payment_ref'] ?? null),
                    'credit_remaining' => $credit,
                ]);
            }
        });

        return response()->json(['status' => 'ok']);
    }

    // DELETE /api/supplier-ledger/{id}
    public function destroy(int $id)
    {
        $row = SupplierLedger::findOrFail($id);
        $this->authorize('delete', $row);

        if (!$row->is_manual && $row->entry_type === 'invoice') {
            return response()->json(['message' => 'Cannot delete auto-synced invoice row.'], 422);
        }
        if (!empty($row->purchase_return_id)) {
            return response()->json(['message' => 'Cannot delete auto-synced return debit note row. Delete or edit the Purchase Return instead.'], 422);
        }
        if (!empty($row->payment_id) && Schema::hasTable('payments')) {
            $payment = \App\Models\Payment::find($row->payment_id);
            if ($payment && $payment->status !== 'reversed') {
                app(\App\Services\PaymentService::class)->reversePayment(
                    $payment,
                    'Deleted from Supplier Ledger',
                    Auth::user()
                );
                return response()->json(['status' => 'ok']);
            }
        }
        $row->delete();
        return response()->json(['status' => 'ok']);
    }

    // POST /api/supplier-ledger/rebuild {supplier_id}
    public function rebuild(Request $request)
    {
        $this->authorize('updateAny', SupplierLedger::class);

        $validated = $request->validate([
            'supplier_id' => ['required','integer','exists:suppliers,id'],
        ]);

        // Remove any ledger rows pointing to reversed purchase invoices
        $reversedIds = PurchaseInvoice::query()
            ->where('supplier_id', $validated['supplier_id'])
            ->where('status', 'reversed')
            ->pluck('id')
            ->all();
        foreach (array_chunk($reversedIds, 500) as $revChunk) {
            SupplierLedger::where('supplier_id', $validated['supplier_id'])
                ->whereIn('purchase_invoice_id', $revChunk)
                ->delete();
        }

        // NOTE: purchase_invoices has `posted_date` (there is no `invoice_date` column).
        $invoices = PurchaseInvoice::query()
            ->select('id','supplier_id','invoice_number','posted_number','posted_date','total_amount','total_paid')
            ->where('supplier_id', $validated['supplier_id'])
            ->where('invoice_type', 'credit')
            ->where(fn ($q) => $q->whereNull('status')->orWhere('status', '!=', 'reversed'))
            ->get();

        $invIds = $invoices->pluck('id')->all();
        $allocatedByInvoice = \App\Models\PaymentAllocation::sumAllocatedByInvoiceIds('purchase_invoice', $invIds);

        DB::transaction(function () use ($invoices, $allocatedByInvoice) {
            foreach ($invoices as $inv) {
                $invTotal = round((float) ($inv->total_amount ?? 0), 2);
                $rawPaid  = round((float) ($inv->total_paid ?? 0), 2);
                $allocated = round((float) ($allocatedByInvoice[$inv->id] ?? 0), 2);
                $directPaid = max(0.0, round($rawPaid - $allocated, 2));
                $paidOnInv = min($directPaid, $invTotal);
                $credit = max(0.0, round($invTotal - $paidOnInv, 2));
                $excessPaid = max(0.0, round($directPaid - max(0.0, $invTotal - $allocated), 2));
                $entryDate = $this->dateStr($inv->posted_date, now()->toDateString());

                SupplierLedger::updateOrCreate(
                    [
                        'supplier_id'         => $inv->supplier_id,
                        'purchase_invoice_id' => $inv->id,
                    ],
                    [
                        'entry_type'       => 'invoice',
                        'entry_date'       => $entryDate,
                        'description'      => 'Invoice #'.$inv->invoice_number,
                        'posted_number'    => $inv->posted_number,
                        'invoice_number'   => $inv->invoice_number,
                        'invoice_total'    => $invTotal,
                        'total_paid'       => $paidOnInv,
                        'debited_amount'   => 0, // not a payment row
                        'credit_remaining' => $credit,
                        'is_manual'        => false,
                    ]
                );

                if ($inv->posted_number) {
                    SupplierLedger::where('supplier_id', $inv->supplier_id)
                        ->where('payment_ref', 'Inv #' . $inv->posted_number)
                        ->where('entry_type', 'payment')
                        ->whereNull('payment_id')
                        ->delete();

                    if ($excessPaid > 0) {
                        SupplierLedger::create([
                            'supplier_id'         => $inv->supplier_id,
                            'purchase_invoice_id' => null,
                            'entry_type'          => 'payment',
                            'entry_date'          => $entryDate,
                            'description'         => 'Payment made on invoice ' . $inv->posted_number,
                            'posted_number'       => $inv->posted_number,
                            'invoice_number'      => $inv->invoice_number,
                            'invoice_total'       => 0,
                            'total_paid'          => 0,
                            'debited_amount'      => $excessPaid,
                            'payment_ref'         => 'Inv #' . $inv->posted_number,
                            'credit_remaining'    => 0,
                            'is_manual'           => false,
                        ]);
                    }
                }
            }
        });

        return response()->json(['status' => 'ok', 'count' => $invoices->count()]);
    }

    /**
     * POST /api/supplier-ledger/settle-invoice
     * Mark a credit purchase invoice as fully paid and sync the ledger in one shot:
     *   1) purchase_invoices.total_paid = invoice total   (invoice side)
     *   2) supplier_ledgers invoice row: total_paid = total, credit_remaining = 0
     *   3) withdraw settled amount from cash/selected account & active cash drawer
     */
    public function settleInvoice(Request $request)
    {
        $this->authorize('updateAny', SupplierLedger::class);

        $data = $request->validate([
            'purchase_invoice_id' => ['required','integer','exists:purchase_invoices,id'],
            'entry_date'          => ['nullable','date'],
            'payment_method'      => ['nullable','string'],
            'account_id'          => ['nullable','integer','exists:accounts,id'],
        ]);

        $result = DB::transaction(function () use ($data, $request) {
            /** @var PurchaseInvoice $invoice */
            $invoice = PurchaseInvoice::lockForUpdate()->findOrFail($data['purchase_invoice_id']);

            $invoiceTotal = (float)($invoice->total_amount ?? 0);
            $paid         = (float)($invoice->total_paid ?? 0);
            $balance      = round(max($invoiceTotal - $paid, 0), 2);

            if ($balance <= 0) {
                return ['already_paid' => true, 'settled' => 0.0, 'invoice' => $invoice];
            }

            $supplier = Supplier::findOrFail((int) $invoice->supplier_id);
            $payMethod = $data['payment_method'] ?? 'cash';
            $entryDate = $data['entry_date'] ?? now()->toDateString();
            $refLabel = $invoice->posted_number ?: ($invoice->invoice_number ?: "#{$invoice->id}");

            if (Schema::hasTable('payments') && Schema::hasTable('payment_allocations')) {
                $payment = app(\App\Services\PaymentService::class)->recordSupplierPayment(
                    $supplier,
                    [
                        'payment_date'   => $entryDate,
                        'amount'         => $balance,
                        'payment_method' => $payMethod,
                        'account_id'     => $data['account_id'] ?? null,
                        'reference'      => "Inv {$refLabel}",
                        'notes'          => "Settled Purchase Invoice {$refLabel}",
                        'allocations'    => [
                            [
                                'invoice_id' => $invoice->id,
                                'amount'     => $balance,
                            ],
                        ],
                    ],
                    $request->user()
                );

                return [
                    'already_paid' => false,
                    'settled'      => $balance,
                    'invoice'      => $invoice->fresh(),
                    'payment_id'   => $payment->id,
                ];
            }

            // ---- Fallback when payments table is unavailable ----
            $invoice->total_paid = $invoiceTotal;
            $invoice->save();

            // ---- (2) Ledger side: keep the invoice row consistent ----
            $allocated = 0.0;
            if (Schema::hasTable('payment_allocations') && Schema::hasTable('payments')) {
                $allocated = (float) \App\Models\PaymentAllocation::query()
                    ->where('invoice_type', 'purchase_invoice')
                    ->where('invoice_id', $invoice->id)
                    ->whereHas('payment', fn($q) => $q->where('status', 'posted'))
                    ->sum('amount');
            }
            $paidOnInv = max(0.0, $invoiceTotal - $allocated);
            $creditOnInv = max(0.0, $invoiceTotal - $paidOnInv);

            $ledgerRow = SupplierLedger::where('purchase_invoice_id', $invoice->id)
                ->where('entry_type', 'invoice')
                ->lockForUpdate()
                ->first();

            if ($ledgerRow) {
                $ledgerRow->total_paid       = $paidOnInv;
                $ledgerRow->credit_remaining = $creditOnInv;
                $ledgerRow->save();
            } else {
                // Legacy credit invoice that never got a ledger row — create one so the
                // supplier ledger (and net balance) stays accurate.
                $ledgerRow = new SupplierLedger();
                $ledgerRow->supplier_id         = (int)$invoice->supplier_id;
                $ledgerRow->purchase_invoice_id = $invoice->id;
                $ledgerRow->entry_type          = 'invoice';
                $ledgerRow->is_manual           = false;
                $ledgerRow->entry_date          = $data['entry_date']
                                                    ?? $this->dateStr($invoice->posted_date, now()->toDateString());
                $ledgerRow->posted_number       = $invoice->posted_number;
                $ledgerRow->invoice_number      = $invoice->invoice_number;
                $ledgerRow->invoice_total       = $invoiceTotal;
                $ledgerRow->total_paid          = $paidOnInv;
                $ledgerRow->debited_amount      = 0;
                $ledgerRow->credit_remaining    = $creditOnInv;
                $ledgerRow->payment_ref         = null;
                $ledgerRow->description         = 'Purchase invoice ' . ($invoice->posted_number ?? $invoice->id) . ' (marked paid)';
                $ledgerRow->created_by          = optional($request->user())->id;
                $ledgerRow->save();
            }

            // ---- (3) Financial account & Cash Drawer sync ----
            $payMethod = $data['payment_method'] ?? 'cash';
            $account = app(\App\Services\AccountService::class)->resolveAccount($data['account_id'] ?? null, $payMethod);
            $refLabel = $invoice->posted_number ?: ($invoice->invoice_number ?: "#{$invoice->id}");
            if ($account) {
                app(\App\Services\AccountService::class)->withdraw(
                    $account,
                    $balance,
                    'supplier_payment',
                    $invoice->id,
                    "Settled Purchase Invoice {$refLabel}",
                    $request->user()
                );
            }

            if (app(\App\Services\AccountService::class)->isDefaultCashDrawerAccount($account, $payMethod)) {
                app(\App\Services\CashDrawerService::class)->recordTransaction(
                    null,
                    'supplier_payment',
                    $balance,
                    'purchase_invoice',
                    $invoice->id,
                    "Settled Purchase Invoice {$refLabel}",
                    $request->user()
                );
            }

            return ['already_paid' => false, 'settled' => $balance, 'invoice' => $invoice];
        });

        if ($result['already_paid']) {
            return response()->json([
                'status'  => 'ok',
                'settled' => 0,
                'message' => 'Invoice is already fully paid',
            ]);
        }

        return response()->json([
            'status'             => 'ok',
            'settled'            => $result['settled'],
            'purchase_invoice_id'=> $result['invoice']->id,
            'posted_number'      => $result['invoice']->posted_number,
            'payment_id'         => $result['payment_id'] ?? null,
        ]);
    }

    /**
     * purchase_invoices.posted_date is NOT cast to a date on the model, so it can
     * arrive as a string ("2025-08-20" / "2025-08-20 00:00:00") or, in other
     * environments, as a DateTimeInterface. Normalise both to Y-m-d.
     */
    private function dateStr($value, ?string $fallback = null): ?string
    {
        if ($value instanceof \DateTimeInterface) {
            return $value->format('Y-m-d');
        }
        if (is_string($value) && trim($value) !== '') {
            return substr($value, 0, 10);
        }
        return $fallback;
    }

    public function printUrl(Request $request)
    {
        $this->authorize('viewAny', SupplierLedger::class);

        $supplierId = (int) $request->query('supplier_id');
        abort_if(!$supplierId, 422, 'Supplier is required');

        $supplier = Supplier::findOrFail($supplierId);

        $params = array_filter([
            'supplier_id' => $supplier->id,
            'type'        => $request->query('type'),
            'from'        => $request->query('from'),
            'to'          => $request->query('to'),
        ], fn ($v) => $v !== null && $v !== '');

        $url = \Illuminate\Support\Facades\URL::temporarySignedRoute(
            'supplier-ledger.print',
            now()->addMinutes(5),
            $params
        );

        return response()->json(['url' => $url]);
    }

    public function print(Request $request)
    {

        $supplierId = (int) $request->query('supplier_id');
        abort_if(!$supplierId, 404, 'Supplier is required');

        $supplier = Supplier::findOrFail($supplierId);
        $setting  = Setting::first();

        $type = strtolower($request->query('type', $setting->printer_type ?? 'a4'));
        if (!in_array($type, ['a4', 'thermal'])) {
            $type = 'a4';
        }

        $from = $request->query('from');
        $to   = $request->query('to');

        $rows = SupplierLedger::with(['purchaseInvoice:id,invoice_number,posted_number,total_amount,total_paid'])
            ->where('supplier_id', $supplier->id)
            ->when($from, fn($q) => $q->whereDate('entry_date', '>=', $from))
            ->when($to,   fn($q) => $q->whereDate('entry_date', '<=', $to))
            ->orderBy('entry_date')
            ->orderBy('id')
            ->get();

        $invIds = $rows->pluck('purchase_invoice_id')->filter()->unique()->values()->all();
        $allocatedByInvoice = \App\Models\PaymentAllocation::sumAllocatedByInvoiceIds('purchase_invoice', $invIds);

        $openingBalance = $this->calculateOpeningBalance($supplier->id, $from);
        $balance = $openingBalance;
        $mapped = $rows->map(function ($r) use (&$balance, $allocatedByInvoice) {
            if ($r->entry_type === 'invoice' && $r->purchaseInvoice) {
                $inv = $r->purchaseInvoice;
                $invTotal = (float) ($inv->total_amount ?? $r->invoice_total ?? 0);
                $rawPaid  = (float) ($inv->total_paid ?? $r->total_paid ?? 0);
                $allocated = (float) ($allocatedByInvoice[$inv->id] ?? 0);
                $r->invoice_total = $invTotal;
                $r->total_paid    = max(0.0, min($rawPaid - $allocated, $invTotal));
            }

            $invoiceTotal = (float) ($r->invoice_total ?? 0);
            $paidOnInv    = (float) ($r->total_paid ?? 0);
            $payment      = (float) ($r->debited_amount ?? 0);
            $type         = $r->entry_type;

            $creditRemaining = 0.0;
            if (in_array($type, ['invoice', 'manual'])) {
                $creditRemaining = max(0, round($invoiceTotal - $paidOnInv, 2));
                $balance += ($invoiceTotal - $paidOnInv);
            }
            if ($type === 'payment') {
                $balance -= $payment;
            }

            $r->credit_remaining_calc = $creditRemaining;
            $r->running_balance = round($balance, 2);
            return $r;
        });

        $summary = [
            'opening_balance'   => $openingBalance,
            'total_invoiced'    => (float) $mapped->sum('invoice_total'),
            'paid_on_invoice'   => (float) $mapped->sum('total_paid'),
            'payments_debited'  => (float) $mapped->sum('debited_amount'),
            'net_balance'       => round(
                $openingBalance + ($mapped->sum('invoice_total') - $mapped->sum('total_paid')) - $mapped->sum('debited_amount'),
                2
            ),
        ];

        return view("printer.supplier_ledger_{$type}", [
            'supplier' => $supplier,
            'setting'  => $setting,
            'rows'     => $mapped,
            'summary'  => $summary,
            'from'     => $from,
            'to'       => $to,
        ]);
    }
}
