<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\CustomerLedger;
use App\Models\Payment;
use App\Models\PaymentAllocation;
use App\Models\PurchaseInvoice;
use App\Models\PurchaseReturn;
use App\Models\SaleInvoice;
use App\Models\SaleReturn;
use App\Models\Supplier;
use App\Models\SupplierLedger;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

class PaymentService
{
    protected DocumentAuditService $auditService;

    public function __construct(DocumentAuditService $auditService)
    {
        $this->auditService = $auditService;
    }

    /**
     * Generate sequential payment number.
     */
    public function generatePaymentNumber(string $partyType): string
    {
        $prefix = $partyType === 'customer' ? 'CR' : 'SD';
        $year = Carbon::now()->format('Y');

        $last = Payment::where('party_type', $partyType)
            ->where('payment_number', 'LIKE', "{$prefix}-{$year}-%")
            ->orderBy('id', 'desc')
            ->first();

        if ($last) {
            $parts = explode('-', $last->payment_number);
            $seq = intval(end($parts)) + 1;
        } else {
            $seq = 1;
        }

        return sprintf('%s-%s-%05d', $prefix, $year, $seq);
    }

    /**
     * Record a customer payment / receipt.
     */
    public function recordCustomerPayment(Customer $customer, array $data, ?User $user = null): Payment
    {
        return DB::transaction(function () use ($customer, $data, $user) {
            // Idempotency check
            if (!empty($data['idempotency_key'])) {
                $existing = Payment::where('idempotency_key', $data['idempotency_key'])->first();
                if ($existing) {
                    return $existing->load('allocations');
                }
            }

            $amount = round((float)$data['amount'], 2);
            if ($amount <= 0) {
                throw ValidationException::withMessages(['amount' => 'Payment amount must be greater than zero.']);
            }

            $allocationsInput = $data['allocations'] ?? [];
            $totalAllocated = 0.0;
            $allocationsToCreate = [];

            foreach ($allocationsInput as $alloc) {
                $allocAmount = round((float)($alloc['amount'] ?? 0), 2);
                if ($allocAmount <= 0) continue;

                $invoiceId = (int)$alloc['invoice_id'];
                $invoice = SaleInvoice::where('id', $invoiceId)
                    ->where('customer_id', $customer->id)
                    ->lockForUpdate()
                    ->first();

                if (!$invoice) {
                    throw ValidationException::withMessages([
                        'allocations' => "Sale invoice #{$invoiceId} not found for this customer.",
                    ]);
                }

                if ($invoice->status === 'reversed') {
                    throw ValidationException::withMessages([
                        'allocations' => "Invoice {$invoice->posted_number} is reversed and cannot receive payments.",
                    ]);
                }

                $invTotal = (float)($invoice->total ?? 0);
                $invReceived = (float)($invoice->total_receive ?? $invoice->total_recieve ?? 0);
                $remainingDue = max($invTotal - $invReceived, 0);

                if ($allocAmount > ($remainingDue + 0.001)) {
                    throw ValidationException::withMessages([
                        'allocations' => "Allocated amount ({$allocAmount}) exceeds invoice {$invoice->posted_number} due balance ({$remainingDue}).",
                    ]);
                }

                $totalAllocated += $allocAmount;
                $allocationsToCreate[] = [
                    'invoice' => $invoice,
                    'amount'  => $allocAmount,
                ];
            }

            if ($totalAllocated > ($amount + 0.001)) {
                throw ValidationException::withMessages([
                    'allocations' => "Total allocated ({$totalAllocated}) exceeds payment amount ({$amount}).",
                ]);
            }

            $unapplied = round(max($amount - $totalAllocated, 0), 2);
            $paymentNumber = $this->generatePaymentNumber('customer');
            $payMethod = $data['payment_method'] ?? 'cash';
            $isCheque = $payMethod === 'cheque';
            $chequeDate = !empty($data['cheque_date']) ? $data['cheque_date'] : null;
            $chequeStatus = null;
            if ($isCheque) {
                if (!empty($data['cheque_status'])) {
                    $chequeStatus = $data['cheque_status'];
                } elseif ($chequeDate && Carbon::parse($chequeDate)->gt(Carbon::today())) {
                    $chequeStatus = 'pending';
                } else {
                    $chequeStatus = 'cleared';
                }
            }

            $createPayload = [
                'payment_number'   => $paymentNumber,
                'party_type'       => 'customer',
                'party_id'         => $customer->id,
                'payment_date'     => $data['payment_date'] ?? Carbon::now()->toDateString(),
                'amount'           => $amount,
                'allocated_amount' => $totalAllocated,
                'unapplied_amount' => $unapplied,
                'payment_method'   => $payMethod,
                'reference'        => $data['reference'] ?? ($data['cheque_number'] ?? null),
                'status'           => 'posted',
                'notes'            => $data['notes'] ?? null,
                'idempotency_key'  => $data['idempotency_key'] ?? null,
                'created_by_id'    => $user?->id,
            ];

            if ($isCheque && Schema::hasColumn('payments', 'cheque_status')) {
                $createPayload['cheque_number'] = $data['cheque_number'] ?? ($data['reference'] ?? null);
                $createPayload['bank_name']     = $data['bank_name'] ?? null;
                $createPayload['cheque_date']   = $chequeDate ?? $createPayload['payment_date'];
                $createPayload['cheque_status'] = $chequeStatus;
                $createPayload['cleared_at']    = $chequeStatus === 'cleared' ? Carbon::now() : null;
            }

            $payment = Payment::create($createPayload);

            // Save allocations and update invoice totals
            foreach ($allocationsToCreate as $item) {
                PaymentAllocation::create([
                    'payment_id'   => $payment->id,
                    'invoice_type' => 'sale_invoice',
                    'invoice_id'   => $item['invoice']->id,
                    'amount'       => $item['amount'],
                ]);

                // Update invoice projection
                $curReceived = (float)($item['invoice']->total_receive ?? 0);
                $item['invoice']->total_receive = round($curReceived + $item['amount'], 2);
                $item['invoice']->save();
            }

            // Sync with CustomerLedger
            if (Schema::hasTable('customer_ledgers')) {
                $methodLabel = ucfirst(str_replace('_', ' ', $payment->payment_method));
                if ($isCheque && $chequeStatus && $chequeStatus !== 'cleared') {
                    $methodLabel .= ' (' . strtoupper($chequeStatus) . ')';
                }
                $notesText = $payment->notes ? ": {$payment->notes}" : '';

                CustomerLedger::create([
                    'customer_id'     => $customer->id,
                    'entry_date'      => $payment->payment_date,
                    'entry_type'      => 'payment',
                    'is_manual'       => false,
                    'credited_amount' => $payment->amount,
                    'payment_ref'     => $payment->payment_number . ($payment->reference ? " ({$payment->reference})" : ''),
                    'payment_id'      => $payment->id,
                    'description'     => "Payment via {$methodLabel}{$notesText}",
                    'created_by'      => $user?->id,
                ]);
            }

            // Audit Log
            $this->auditService->recordCreate(
                $payment,
                $user,
                "Customer payment {$payment->payment_number} recorded"
            );

            // Record financial account deposit (deferred for pending/deposited PDC cheques until cleared)
            $account = app(AccountService::class)->resolveAccount($payment->account_id ?? $data['account_id'] ?? null, $payment->payment_method);
            if ($account) {
                $payment->account_id = $account->id;
                $payment->saveQuietly();

                if (!$isCheque || $chequeStatus === 'cleared') {
                    app(AccountService::class)->deposit(
                        $account,
                        $payment->amount,
                        'customer_payment',
                        $payment->id,
                        "Customer payment {$payment->payment_number} ({$customer->name})",
                        $user
                    );
                }
            }

            // Record cash drawer transaction if payment hits the default Cash in Hand (Drawer) account
            if (app(AccountService::class)->isDefaultCashDrawerAccount($account, $payment->payment_method) && !$isCheque) {
                app(CashDrawerService::class)->recordTransaction(
                    null,
                    'customer_payment',
                    $payment->amount,
                    'payment',
                    $payment->id,
                    "Customer payment {$payment->payment_number}",
                    $user
                );
            }

            return $payment->load('allocations');
        });
    }

    /**
     * Record a supplier payment / disbursement.
     */
    public function recordSupplierPayment(Supplier $supplier, array $data, ?User $user = null): Payment
    {
        return DB::transaction(function () use ($supplier, $data, $user) {
            // Idempotency check
            if (!empty($data['idempotency_key'])) {
                $existing = Payment::where('idempotency_key', $data['idempotency_key'])->first();
                if ($existing) {
                    return $existing->load('allocations');
                }
            }

            $amount = round((float)$data['amount'], 2);
            if ($amount <= 0) {
                throw ValidationException::withMessages(['amount' => 'Payment amount must be greater than zero.']);
            }

            $allocationsInput = $data['allocations'] ?? [];
            $totalAllocated = 0.0;
            $allocationsToCreate = [];

            foreach ($allocationsInput as $alloc) {
                $allocAmount = round((float)($alloc['amount'] ?? 0), 2);
                if ($allocAmount <= 0) continue;

                $invoiceId = (int)$alloc['invoice_id'];
                $invoice = PurchaseInvoice::where('id', $invoiceId)
                    ->where('supplier_id', $supplier->id)
                    ->lockForUpdate()
                    ->first();

                if (!$invoice) {
                    throw ValidationException::withMessages([
                        'allocations' => "Purchase invoice #{$invoiceId} not found for this supplier.",
                    ]);
                }

                if ($invoice->status === 'reversed') {
                    throw ValidationException::withMessages([
                        'allocations' => "Invoice {$invoice->posted_number} is reversed and cannot receive payments.",
                    ]);
                }

                $invTotal = (float)($invoice->total_amount ?? 0);
                $invPaid = (float)($invoice->total_paid ?? 0);
                $remainingDue = max($invTotal - $invPaid, 0);

                if ($allocAmount > ($remainingDue + 0.001)) {
                    throw ValidationException::withMessages([
                        'allocations' => "Allocated amount ({$allocAmount}) exceeds purchase invoice {$invoice->posted_number} payable ({$remainingDue}).",
                    ]);
                }

                $totalAllocated += $allocAmount;
                $allocationsToCreate[] = [
                    'invoice' => $invoice,
                    'amount'  => $allocAmount,
                ];
            }

            if ($totalAllocated > ($amount + 0.001)) {
                throw ValidationException::withMessages([
                    'allocations' => "Total allocated ({$totalAllocated}) exceeds payment amount ({$amount}).",
                ]);
            }

            $unapplied = round(max($amount - $totalAllocated, 0), 2);
            $paymentNumber = $this->generatePaymentNumber('supplier');
            $payMethod = $data['payment_method'] ?? 'cash';
            $isCheque = $payMethod === 'cheque';
            $chequeDate = !empty($data['cheque_date']) ? $data['cheque_date'] : null;
            $chequeStatus = null;
            if ($isCheque) {
                if (!empty($data['cheque_status'])) {
                    $chequeStatus = $data['cheque_status'];
                } elseif ($chequeDate && Carbon::parse($chequeDate)->gt(Carbon::today())) {
                    $chequeStatus = 'pending';
                } else {
                    $chequeStatus = 'cleared';
                }
            }

            $createPayload = [
                'payment_number'   => $paymentNumber,
                'party_type'       => 'supplier',
                'party_id'         => $supplier->id,
                'payment_date'     => $data['payment_date'] ?? Carbon::now()->toDateString(),
                'amount'           => $amount,
                'allocated_amount' => $totalAllocated,
                'unapplied_amount' => $unapplied,
                'payment_method'   => $payMethod,
                'reference'        => $data['reference'] ?? ($data['cheque_number'] ?? null),
                'status'           => 'posted',
                'notes'            => $data['notes'] ?? null,
                'idempotency_key'  => $data['idempotency_key'] ?? null,
                'created_by_id'    => $user?->id,
            ];

            if ($isCheque && Schema::hasColumn('payments', 'cheque_status')) {
                $createPayload['cheque_number'] = $data['cheque_number'] ?? ($data['reference'] ?? null);
                $createPayload['bank_name']     = $data['bank_name'] ?? null;
                $createPayload['cheque_date']   = $chequeDate ?? $createPayload['payment_date'];
                $createPayload['cheque_status'] = $chequeStatus;
                $createPayload['cleared_at']    = $chequeStatus === 'cleared' ? Carbon::now() : null;
            }

            $payment = Payment::create($createPayload);

            // Save allocations and update purchase invoice totals
            foreach ($allocationsToCreate as $item) {
                PaymentAllocation::create([
                    'payment_id'   => $payment->id,
                    'invoice_type' => 'purchase_invoice',
                    'invoice_id'   => $item['invoice']->id,
                    'amount'       => $item['amount'],
                ]);

                // Update invoice projection
                $curPaid = (float)($item['invoice']->total_paid ?? 0);
                $item['invoice']->total_paid = round($curPaid + $item['amount'], 2);
                $item['invoice']->save();
            }

            // Sync with SupplierLedger
            if (Schema::hasTable('supplier_ledgers')) {
                $methodLabel = ucfirst(str_replace('_', ' ', $payment->payment_method));
                if ($isCheque && $chequeStatus && $chequeStatus !== 'cleared') {
                    $methodLabel .= ' (' . strtoupper($chequeStatus) . ')';
                }
                $notesText = $payment->notes ? ": {$payment->notes}" : '';

                SupplierLedger::create([
                    'supplier_id'    => $supplier->id,
                    'entry_date'     => $payment->payment_date,
                    'entry_type'     => 'payment',
                    'is_manual'      => false,
                    'debited_amount' => $payment->amount,
                    'payment_ref'    => $payment->payment_number . ($payment->reference ? " ({$payment->reference})" : ''),
                    'payment_id'     => $payment->id,
                    'description'    => "Payment via {$methodLabel}{$notesText}",
                    'created_by'     => $user?->id,
                ]);
            }

            // Audit Log
            $this->auditService->recordCreate(
                $payment,
                $user,
                "Supplier payment {$payment->payment_number} recorded"
            );

            // Record financial account withdrawal (deferred for pending/deposited PDC cheques until cleared)
            $account = app(AccountService::class)->resolveAccount($payment->account_id ?? $data['account_id'] ?? null, $payment->payment_method);
            if ($account) {
                $payment->account_id = $account->id;
                $payment->saveQuietly();

                if (!$isCheque || $chequeStatus === 'cleared') {
                    app(AccountService::class)->withdraw(
                        $account,
                        $payment->amount,
                        'supplier_payment',
                        $payment->id,
                        "Supplier payment {$payment->payment_number} ({$supplier->name})",
                        $user
                    );
                }
            }

            // Record cash drawer transaction if payment hits the default Cash in Hand (Drawer) account
            if (app(AccountService::class)->isDefaultCashDrawerAccount($account, $payment->payment_method) && !$isCheque) {
                app(CashDrawerService::class)->recordTransaction(
                    null,
                    'supplier_payment',
                    $payment->amount,
                    'payment',
                    $payment->id,
                    "Supplier payment {$payment->payment_number}",
                    $user
                );
            }

            return $payment->load('allocations');
        });
    }

    /**
     * Safely reverse a payment with full audit history and balance unwinding.
     */
    public function reversePayment(Payment $payment, string $reason, ?User $user = null): Payment
    {
        return DB::transaction(function () use ($payment, $reason, $user) {
            if ($payment->status === 'reversed') {
                throw ValidationException::withMessages(['payment' => 'This payment has already been reversed.']);
            }

            $beforeSnapshot = $payment->toArray();

            // Unwind allocations
            $payment->load('allocations');
            foreach ($payment->allocations as $alloc) {
                if ($alloc->invoice_type === 'sale_invoice') {
                    $invoice = SaleInvoice::find($alloc->invoice_id);
                    if ($invoice) {
                        $curReceived = (float)($invoice->total_receive ?? 0);
                        $invoice->total_receive = round(max($curReceived - $alloc->amount, 0), 2);
                        $invoice->save();
                    }
                } elseif ($alloc->invoice_type === 'purchase_invoice') {
                    $invoice = PurchaseInvoice::find($alloc->invoice_id);
                    if ($invoice) {
                        $curPaid = (float)($invoice->total_paid ?? 0);
                        $invoice->total_paid = round(max($curPaid - $alloc->amount, 0), 2);
                        $invoice->save();
                    }
                }
            }

            // Remove or unwind party ledger entry
            $isCreditNote = $payment->payment_method === 'credit_note';
            if ($payment->party_type === 'customer' && Schema::hasTable('customer_ledgers')) {
                if ($isCreditNote && Schema::hasColumn('customer_ledgers', 'sale_return_id')) {
                    CustomerLedger::where('payment_id', $payment->id)
                        ->whereNull('sale_return_id')
                        ->delete();
                } else {
                    CustomerLedger::where('payment_id', $payment->id)->delete();
                }
            } elseif ($payment->party_type === 'supplier' && Schema::hasTable('supplier_ledgers')) {
                if ($isCreditNote && Schema::hasColumn('supplier_ledgers', 'purchase_return_id')) {
                    SupplierLedger::where('payment_id', $payment->id)
                        ->whereNull('purchase_return_id')
                        ->delete();
                } else {
                    SupplierLedger::where('payment_id', $payment->id)->delete();
                }
            }

            // Mark reversed
            $payment->status = 'reversed';
            $payment->reversed_at = Carbon::now();
            $payment->reversed_by_id = $user?->id;
            $payment->reversal_reason = $reason;
            $payment->save();

            // Check whether this payment was an uncleared cheque (whose Account balance was deferred)
            $wasUnclearedCheque = $payment->payment_method === 'cheque'
                && Schema::hasColumn('payments', 'cheque_status')
                && in_array($payment->cheque_status, ['pending', 'deposited', 'bounced'], true)
                && empty($payment->cleared_at);

            if (!$isCreditNote && !$wasUnclearedCheque) {
                // Reverse financial account effect
                $account = app(AccountService::class)->resolveAccount($payment->account_id, $payment->payment_method);
                if ($account) {
                    if ($payment->party_type === 'customer') {
                        app(AccountService::class)->withdraw(
                            $account,
                            $payment->amount,
                            'payment_reversal',
                            $payment->id,
                            "Reversal of Customer Payment {$payment->payment_number}: {$reason}",
                            $user
                        );
                    } else {
                        app(AccountService::class)->deposit(
                            $account,
                            $payment->amount,
                            'payment_reversal',
                            $payment->id,
                            "Reversal of Supplier Payment {$payment->payment_number}: {$reason}",
                            $user
                        );
                    }
                }

                // Reverse cash drawer transaction if payment hit the default Cash in Hand (Drawer) account
                if (app(AccountService::class)->isDefaultCashDrawerAccount($account, $payment->payment_method)) {
                    app(CashDrawerService::class)->handlePaymentReversal(
                        $payment,
                        $reason,
                        $user
                    );
                }
            }

            // Record audit
            $this->auditService->recordReversal(
                $payment,
                $user,
                $reason
            );

            return $payment;
        });
    }

    /**
     * Transition a Post-Dated Cheque (PDC) payment through pending -> deposited -> cleared or bounced.
     */
    public function updateChequeStatus(
        Payment $payment,
        string $newStatus,
        ?int $accountId = null,
        ?string $reason = null,
        ?User $user = null
    ): Payment {
        return DB::transaction(function () use ($payment, $newStatus, $accountId, $reason, $user) {
            $locked = Payment::where('id', $payment->id)->lockForUpdate()->firstOrFail();

            if ($locked->payment_method !== 'cheque') {
                throw ValidationException::withMessages([
                    'payment' => 'Cheque lifecycle transitions are only valid for cheque payments.',
                ]);
            }

            if ($locked->status === 'reversed' && $newStatus !== 'bounced') {
                throw ValidationException::withMessages([
                    'payment' => 'Cannot update cheque status on a reversed payment.',
                ]);
            }

            if (!in_array($newStatus, ['deposited', 'cleared', 'bounced'], true)) {
                throw ValidationException::withMessages([
                    'status' => 'Invalid cheque status. Allowed: deposited, cleared, bounced.',
                ]);
            }

            if ($newStatus === 'deposited') {
                if (in_array($locked->cheque_status, ['cleared', 'bounced'], true)) {
                    throw ValidationException::withMessages([
                        'status' => "Cannot mark a {$locked->cheque_status} cheque as deposited.",
                    ]);
                }
                if ($accountId) {
                    $locked->account_id = $accountId;
                }
                $locked->cheque_status = 'deposited';
                $locked->save();
                return $locked->load(['allocations', 'customer:id,name', 'supplier:id,name', 'account:id,name,code']);
            }

            if ($newStatus === 'cleared') {
                if ($locked->cheque_status === 'bounced') {
                    throw ValidationException::withMessages([
                        'status' => 'Cannot clear a bounced cheque.',
                    ]);
                }
                if ($locked->cheque_status === 'cleared' && !empty($locked->cleared_at)) {
                    return $locked->load(['allocations', 'customer:id,name', 'supplier:id,name', 'account:id,name,code']);
                }

                $account = app(AccountService::class)->resolveAccount($accountId ?? $locked->account_id, 'cheque');
                if ($account) {
                    $locked->account_id = $account->id;
                    if ($locked->party_type === 'customer') {
                        $partyName = Customer::find($locked->party_id)?->name ?? 'Customer';
                        app(AccountService::class)->deposit(
                            $account,
                            $locked->amount,
                            'customer_payment',
                            $locked->id,
                            "Cheque cleared {$locked->payment_number} ({$partyName})",
                            $user
                        );
                    } else {
                        $partyName = Supplier::find($locked->party_id)?->name ?? 'Supplier';
                        app(AccountService::class)->withdraw(
                            $account,
                            $locked->amount,
                            'supplier_payment',
                            $locked->id,
                            "Cheque cleared {$locked->payment_number} ({$partyName})",
                            $user
                        );
                    }
                }

                $locked->cheque_status = 'cleared';
                $locked->cleared_at = Carbon::now();
                $locked->save();

                return $locked->load(['allocations', 'customer:id,name', 'supplier:id,name', 'account:id,name,code']);
            }

            // $newStatus === 'bounced'
            $bounceReason = $reason ?: 'Cheque Dishonoured / Bounced';
            if ($locked->status !== 'reversed') {
                $locked = $this->reversePayment($locked, $bounceReason, $user);
            }
            $locked->cheque_status = 'bounced';
            $locked->bounced_at = Carbon::now();
            $locked->save();

            return $locked->load(['allocations', 'customer:id,name', 'supplier:id,name', 'account:id,name,code']);
        });
    }

    /**
     * Allocate an existing payment's or credit note's unapplied_amount to open invoices.
     */
    public function allocatePayment(Payment $payment, array $allocationsInput, ?User $user = null): Payment
    {
        return DB::transaction(function () use ($payment, $allocationsInput, $user) {
            $lockedPayment = Payment::where('id', $payment->id)->lockForUpdate()->firstOrFail();

            if ($lockedPayment->status !== 'posted') {
                throw ValidationException::withMessages([
                    'payment' => 'Only posted payments or credit notes can be allocated.',
                ]);
            }

            $availableUnapplied = round((float) ($lockedPayment->unapplied_amount ?? 0), 2);
            if ($availableUnapplied <= 0.001) {
                throw ValidationException::withMessages([
                    'payment' => 'This payment has no unapplied credit remaining to allocate.',
                ]);
            }

            $beforeSnapshot = $lockedPayment->load('allocations')->toArray();

            $totalNewAllocated = 0.0;
            $allocationsToApply = [];

            foreach ($allocationsInput as $alloc) {
                $allocAmount = round((float) ($alloc['amount'] ?? 0), 2);
                if ($allocAmount <= 0) {
                    continue;
                }

                $invoiceId = (int) ($alloc['invoice_id'] ?? 0);
                if ($invoiceId <= 0) {
                    continue;
                }

                if ($lockedPayment->party_type === 'customer') {
                    $invoice = SaleInvoice::where('id', $invoiceId)
                        ->where('customer_id', $lockedPayment->party_id)
                        ->lockForUpdate()
                        ->first();

                    if (!$invoice) {
                        throw ValidationException::withMessages([
                            'allocations' => "Sale invoice #{$invoiceId} not found for this customer.",
                        ]);
                    }

                    if ($invoice->status === 'reversed') {
                        throw ValidationException::withMessages([
                            'allocations' => "Invoice {$invoice->posted_number} is reversed and cannot receive allocations.",
                        ]);
                    }

                    $invTotal = (float) ($invoice->total ?? 0);
                    $invReceived = (float) ($invoice->total_receive ?? $invoice->total_recieve ?? 0);
                    $remainingDue = max($invTotal - $invReceived, 0);

                    if ($allocAmount > ($remainingDue + 0.001)) {
                        throw ValidationException::withMessages([
                            'allocations' => "Allocation of {$allocAmount} exceeds remaining balance ({$remainingDue}) on invoice {$invoice->posted_number}.",
                        ]);
                    }

                    $allocationsToApply[] = [
                        'invoice' => $invoice,
                        'invoice_type' => 'sale_invoice',
                        'amount' => $allocAmount,
                    ];
                } else {
                    $invoice = PurchaseInvoice::where('id', $invoiceId)
                        ->where('supplier_id', $lockedPayment->party_id)
                        ->lockForUpdate()
                        ->first();

                    if (!$invoice) {
                        throw ValidationException::withMessages([
                            'allocations' => "Purchase invoice #{$invoiceId} not found for this supplier.",
                        ]);
                    }

                    if ($invoice->status === 'reversed') {
                        throw ValidationException::withMessages([
                            'allocations' => "Invoice {$invoice->posted_number} is reversed and cannot receive allocations.",
                        ]);
                    }

                    $invTotal = (float) ($invoice->total_amount ?? 0);
                    $invPaid = (float) ($invoice->total_paid ?? 0);
                    $remainingDue = max($invTotal - $invPaid, 0);

                    if ($allocAmount > ($remainingDue + 0.001)) {
                        throw ValidationException::withMessages([
                            'allocations' => "Allocation of {$allocAmount} exceeds remaining balance ({$remainingDue}) on invoice {$invoice->posted_number}.",
                        ]);
                    }

                    $allocationsToApply[] = [
                        'invoice' => $invoice,
                        'invoice_type' => 'purchase_invoice',
                        'amount' => $allocAmount,
                    ];
                }

                $totalNewAllocated = round($totalNewAllocated + $allocAmount, 2);
            }

            if ($totalNewAllocated <= 0) {
                throw ValidationException::withMessages([
                    'allocations' => 'Please enter a valid allocation amount greater than zero.',
                ]);
            }

            if ($totalNewAllocated > ($availableUnapplied + 0.001)) {
                throw ValidationException::withMessages([
                    'allocations' => "Total allocation ({$totalNewAllocated}) exceeds available unapplied credit ({$availableUnapplied}).",
                ]);
            }

            foreach ($allocationsToApply as $item) {
                $invoice = $item['invoice'];
                $invoiceType = $item['invoice_type'];
                $allocAmount = $item['amount'];

                $existingAlloc = PaymentAllocation::where('payment_id', $lockedPayment->id)
                    ->where('invoice_type', $invoiceType)
                    ->where('invoice_id', $invoice->id)
                    ->first();

                if ($existingAlloc) {
                    $existingAlloc->amount = round((float) $existingAlloc->amount + $allocAmount, 2);
                    $existingAlloc->save();
                } else {
                    PaymentAllocation::create([
                        'payment_id'   => $lockedPayment->id,
                        'invoice_type' => $invoiceType,
                        'invoice_id'   => $invoice->id,
                        'amount'       => $allocAmount,
                    ]);
                }

                if ($invoiceType === 'sale_invoice') {
                    $invoice->total_receive = round((float) ($invoice->total_receive ?? 0) + $allocAmount, 2);
                } else {
                    $invoice->total_paid = round((float) ($invoice->total_paid ?? 0) + $allocAmount, 2);
                }
                $invoice->save();
            }

            $lockedPayment->allocated_amount = round((float) ($lockedPayment->allocated_amount ?? 0) + $totalNewAllocated, 2);
            $lockedPayment->unapplied_amount = round(max((float) $lockedPayment->amount - (float) $lockedPayment->allocated_amount, 0), 2);
            $lockedPayment->save();

            $this->auditService->recordUpdate(
                $lockedPayment,
                $beforeSnapshot,
                $user,
                "Allocated {$totalNewAllocated} of unapplied credit to invoices"
            );

            return $lockedPayment->load([
                'allocations.saleInvoice:id,posted_number,date,total',
                'allocations.purchaseInvoice:id,posted_number,invoice_number,posted_date,total_amount',
                'customer:id,name',
                'supplier:id,name',
            ]);
        });
    }

    /**
     * Ensure any historical SaleReturn / PurchaseReturn settled via credit_note or invoice_offset
     * has its corresponding allocatable Payment record synchronized.
     */
    public function syncMissingReturnCreditPayments(?string $partyType = null, ?int $partyId = null): void
    {
        if (!\App\Support\SchemaCache::hasTable('payments')) {
            return;
        }

        $settlementService = app(ReturnSettlementService::class);

        if (($partyType === null || $partyType === 'customer') && \App\Support\SchemaCache::hasTable('sale_returns') && \App\Support\SchemaCache::hasColumn('sale_returns', 'settlement_mode')) {
            $existingSrLookup = Payment::query()
                ->where('idempotency_key', 'like', 'sale_return:%')
                ->pluck('idempotency_key')
                ->mapWithKeys(fn ($k) => [(int) substr((string) $k, strlen('sale_return:')) => true])
                ->all();

            $saleReturnQuery = SaleReturn::whereIn('settlement_mode', ['credit_note', 'invoice_offset'])
                ->where('credited_amount', '>', 0)
                ->whereNotNull('customer_id');

            if ($partyType === 'customer' && $partyId !== null) {
                $saleReturnQuery->where('customer_id', $partyId);
            }

            $saleReturns = $saleReturnQuery->get()->reject(fn ($sr) => isset($existingSrLookup[(int) $sr->id]));
            foreach ($saleReturns as $sr) {
                $settlementService->syncSaleReturnCreditPayment(
                    $sr,
                    round((float) $sr->credited_amount, 2),
                    (string) $sr->settlement_mode,
                    Auth::user()
                );
            }
        }

        if (($partyType === null || $partyType === 'supplier') && \App\Support\SchemaCache::hasTable('purchase_returns') && \App\Support\SchemaCache::hasColumn('purchase_returns', 'settlement_mode')) {
            $existingPrLookup = Payment::query()
                ->where('idempotency_key', 'like', 'purchase_return:%')
                ->pluck('idempotency_key')
                ->mapWithKeys(fn ($k) => [(int) substr((string) $k, strlen('purchase_return:')) => true])
                ->all();

            $purchaseReturnQuery = PurchaseReturn::whereIn('settlement_mode', ['credit_note', 'invoice_offset'])
                ->where('credited_amount', '>', 0)
                ->whereNotNull('supplier_id');

            if ($partyType === 'supplier' && $partyId !== null) {
                $purchaseReturnQuery->where('supplier_id', $partyId);
            }

            $purchaseReturns = $purchaseReturnQuery->get()->reject(fn ($pr) => isset($existingPrLookup[(int) $pr->id]));
            foreach ($purchaseReturns as $pr) {
                $settlementService->syncPurchaseReturnCreditPayment(
                    $pr,
                    round((float) $pr->credited_amount, 2),
                    (string) $pr->settlement_mode,
                    Auth::user()
                );
            }
        }
    }

    /**
     * Get all posted payments and credit notes with unapplied balance for a party.
     */
    public function getAvailableCreditsForParty(string $partyType, int $partyId): array
    {
        $this->syncMissingReturnCreditPayments($partyType, $partyId);

        $credits = Payment::with('allocations')
            ->where('party_type', $partyType)
            ->where('party_id', $partyId)
            ->where('status', 'posted')
            ->where('unapplied_amount', '>', 0)
            ->orderBy('payment_date', 'asc')
            ->orderBy('id', 'asc')
            ->get();

        return [
            'party_type'      => $partyType,
            'party_id'        => $partyId,
            'total_unapplied' => round((float) $credits->sum('unapplied_amount'), 2),
            'credits'         => $credits,
        ];
    }

    /**
     * Apply a party's available unapplied payments / credit notes (FIFO) to the requested invoices.
     */
    public function applyPartyCredits(string $partyType, int $partyId, array $allocationsInput, ?User $user = null): array
    {
        return DB::transaction(function () use ($partyType, $partyId, $allocationsInput, $user) {
            $this->syncMissingReturnCreditPayments($partyType, $partyId);

            $credits = Payment::where('party_type', $partyType)
                ->where('party_id', $partyId)
                ->where('status', 'posted')
                ->where('unapplied_amount', '>', 0)
                ->orderBy('payment_date', 'asc')
                ->orderBy('id', 'asc')
                ->lockForUpdate()
                ->get();

            $totalAvailable = round((float) $credits->sum('unapplied_amount'), 2);
            if ($totalAvailable <= 0.001) {
                throw ValidationException::withMessages([
                    'credits' => 'No unapplied payments or credit notes are available for this party.',
                ]);
            }

            // Normalize requested invoice allocations
            $invoiceBuckets = [];
            $totalRequested = 0.0;
            foreach ($allocationsInput as $alloc) {
                $invId = (int) ($alloc['invoice_id'] ?? 0);
                $amt = round((float) ($alloc['amount'] ?? 0), 2);
                if ($invId <= 0 || $amt <= 0) {
                    continue;
                }
                $invoiceBuckets[$invId] = round(($invoiceBuckets[$invId] ?? 0.0) + $amt, 2);
                $totalRequested = round($totalRequested + $amt, 2);
            }

            if ($totalRequested <= 0) {
                throw ValidationException::withMessages([
                    'allocations' => 'Please specify at least one invoice allocation amount greater than zero.',
                ]);
            }

            if ($totalRequested > ($totalAvailable + 0.001)) {
                throw ValidationException::withMessages([
                    'allocations' => "Requested credit application ({$totalRequested}) exceeds total available unapplied credit ({$totalAvailable}).",
                ]);
            }

            $updatedPayments = [];
            $totalAllocatedAcrossAll = 0.0;

            foreach ($credits as $creditPayment) {
                $creditRemaining = round((float) $creditPayment->unapplied_amount, 2);
                if ($creditRemaining <= 0.001) {
                    continue;
                }

                $perPaymentAllocations = [];
                foreach ($invoiceBuckets as $invId => &$neededAmt) {
                    if ($neededAmt <= 0.001 || $creditRemaining <= 0.001) {
                        continue;
                    }

                    $slice = round(min($creditRemaining, $neededAmt), 2);
                    if ($slice > 0) {
                        $perPaymentAllocations[] = [
                            'invoice_id' => $invId,
                            'amount'     => $slice,
                        ];
                        $neededAmt = round($neededAmt - $slice, 2);
                        $creditRemaining = round($creditRemaining - $slice, 2);
                        $totalAllocatedAcrossAll = round($totalAllocatedAcrossAll + $slice, 2);
                    }
                }
                unset($neededAmt);

                if (!empty($perPaymentAllocations)) {
                    $updatedPayments[] = $this->allocatePayment($creditPayment, $perPaymentAllocations, $user);
                }
            }

            return [
                'allocated_total' => $totalAllocatedAcrossAll,
                'payments'        => $updatedPayments,
            ];
        });
    }

    /**
     * Retrieve open collectible invoices for a customer.
     */
    public function getOpenInvoicesForCustomer(int $customerId): array
    {
        $invoices = SaleInvoice::where('customer_id', $customerId)
            ->where('invoice_type', 'credit')
            ->where(fn ($q) => $q->whereNull('status')->orWhere('status', '!=', 'reversed'))
            ->whereRaw('COALESCE(total, 0) - COALESCE(total_receive, 0) > 0.01')
            ->orderBy('date', 'asc')
            ->orderBy('id', 'asc')
            ->get();

        $open = [];
        foreach ($invoices as $inv) {
            $total = (float)($inv->total ?? 0);
            $received = (float)($inv->total_receive ?? $inv->total_recieve ?? 0);
            $remaining = round(max($total - $received, 0), 2);

            if ($remaining > 0.01) {
                $open[] = [
                    'id'            => $inv->id,
                    'posted_number' => $inv->posted_number ?: "#{$inv->id}",
                    'date'          => $inv->date,
                    'due_date'      => $inv->due_date ? (string) $inv->due_date : $inv->date,
                    'total'         => $total,
                    'received'      => $received,
                    'due'           => $remaining,
                ];
            }
        }

        return $open;
    }

    /**
     * Retrieve open payable invoices for a supplier.
     */
    public function getOpenInvoicesForSupplier(int $supplierId): array
    {
        $invoices = PurchaseInvoice::where('supplier_id', $supplierId)
            ->where('invoice_type', 'credit')
            ->where(fn ($q) => $q->whereNull('status')->orWhere('status', '!=', 'reversed'))
            ->whereRaw('COALESCE(total_amount, 0) - COALESCE(total_paid, 0) > 0.01')
            ->orderBy('posted_date', 'asc')
            ->orderBy('id', 'asc')
            ->get();

        $open = [];
        foreach ($invoices as $inv) {
            $total = (float)($inv->total_amount ?? 0);
            $paid = (float)($inv->total_paid ?? 0);
            $remaining = round(max($total - $paid, 0), 2);

            if ($remaining > 0.01) {
                $open[] = [
                    'id'            => $inv->id,
                    'posted_number' => $inv->posted_number ?: ($inv->invoice_number ?: "#{$inv->id}"),
                    'date'          => $inv->posted_date,
                    'due_date'      => $inv->due_date ? (string) $inv->due_date : $inv->posted_date,
                    'total'         => $total,
                    'paid'          => $paid,
                    'due'           => $remaining,
                ];
            }
        }

        return $open;
    }

    /**
     * Get the total amount currently allocated to a specific invoice from posted payments / credit notes.
     */
    public function getAllocatedAmountForInvoice(string $invoiceType, int $invoiceId): float
    {
        if (!Schema::hasTable('payment_allocations') || !Schema::hasTable('payments')) {
            return 0.0;
        }

        return round((float) PaymentAllocation::query()
            ->where('invoice_type', $invoiceType)
            ->where('invoice_id', $invoiceId)
            ->whereHas('payment', fn ($q) => $q->where('status', 'posted'))
            ->sum('amount'), 2);
    }

    /**
     * Detach all payment / credit note allocations from an invoice being reversed or deleted,
     * restoring unapplied credit to the underlying Payment vouchers and reducing the invoice's
     * total_receive / total_paid so only direct invoice tender remains.
     */
    public function detachInvoiceAllocations(string $invoiceType, int $invoiceId, ?User $user = null): float
    {
        if (!Schema::hasTable('payment_allocations') || !Schema::hasTable('payments')) {
            return 0.0;
        }

        return DB::transaction(function () use ($invoiceType, $invoiceId) {
            $allocations = PaymentAllocation::query()
                ->where('invoice_type', $invoiceType)
                ->where('invoice_id', $invoiceId)
                ->lockForUpdate()
                ->get();

            if ($allocations->isEmpty()) {
                return 0.0;
            }

            $totalDetached = 0.0;

            foreach ($allocations as $alloc) {
                $allocAmount = round((float) ($alloc->amount ?? 0), 2);
                $payment = Payment::where('id', $alloc->payment_id)->lockForUpdate()->first();

                if ($payment && $payment->status === 'posted' && $allocAmount > 0) {
                    $payment->allocated_amount = max(0.0, round((float) ($payment->allocated_amount ?? 0) - $allocAmount, 2));
                    $payment->unapplied_amount = round(max((float) $payment->amount - (float) $payment->allocated_amount, 0.0), 2);
                    $payment->save();
                    $totalDetached = round($totalDetached + $allocAmount, 2);
                }

                $alloc->delete();
            }

            if ($totalDetached > 0) {
                if ($invoiceType === 'sale_invoice') {
                    $invoice = SaleInvoice::where('id', $invoiceId)->lockForUpdate()->first();
                    if ($invoice) {
                        $invoice->total_receive = max(0.0, round((float) ($invoice->total_receive ?? 0) - $totalDetached, 2));
                        $invoice->saveQuietly();
                    }
                } elseif ($invoiceType === 'purchase_invoice') {
                    $invoice = PurchaseInvoice::where('id', $invoiceId)->lockForUpdate()->first();
                    if ($invoice) {
                        $invoice->total_paid = max(0.0, round((float) ($invoice->total_paid ?? 0) - $totalDetached, 2));
                        $invoice->saveQuietly();
                    }
                }
            }

            return $totalDetached;
        });
    }
}
