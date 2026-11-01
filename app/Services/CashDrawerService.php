<?php

namespace App\Services;

use App\Models\CashDrawerSession;
use App\Models\CashDrawerTransaction;
use App\Models\User;
use App\Support\SchemaCache;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

class CashDrawerService
{
    /**
     * Cash-in transaction types that increase drawer balance.
     */
    public const CASH_IN_TYPES = [
        'cash_sale',
        'customer_payment',
        'purchase_return',
        'cash_in',
    ];

    /**
     * Cash-out transaction types that decrease drawer balance.
     */
    public const CASH_OUT_TYPES = [
        'cash_purchase',
        'cash_return',
        'supplier_payment',
        'expense',
        'cash_out',
    ];

    /**
     * Get currently active open session for a user or system.
     */
    public function getCurrentSession(?User $user = null): ?CashDrawerSession
    {
        if (!SchemaCache::hasTable('cash_drawer_sessions')) {
            return null;
        }

        $query = CashDrawerSession::with(['user'])
            ->where('status', 'open');

        if ($user) {
            $userSession = (clone $query)->where('user_id', $user->id)->latest('opened_at')->first();
            if ($userSession) {
                return $userSession;
            }
        }

        // Fallback to the latest active open session
        return $query->latest('opened_at')->first();
    }

    /**
     * Get the most recently closed cash drawer session for float carryover & closed-state summary.
     */
    public function getLastClosedSession(?User $user = null): ?CashDrawerSession
    {
        if (!SchemaCache::hasTable('cash_drawer_sessions')) {
            return null;
        }

        $query = CashDrawerSession::with(['user'])
            ->where('status', 'closed');

        if ($user) {
            $userClosed = (clone $query)->where('user_id', $user->id)->latest('closed_at')->latest('id')->first();
            if ($userClosed) {
                return $userClosed;
            }
        }

        return $query->latest('closed_at')->latest('id')->first();
    }

    /**
     * Open a new cash drawer session.
     */
    public function openSession(User $user, float $openingBalance, ?string $notes = null): CashDrawerSession
    {
        return DB::transaction(function () use ($user, $openingBalance, $notes) {
            $existing = CashDrawerSession::where('user_id', $user->id)
                ->where('status', 'open')
                ->lockForUpdate()
                ->first();

            if ($existing) {
                throw ValidationException::withMessages([
                    'session' => 'A cash drawer session is already open for this user. Please close it first.',
                ]);
            }

            $opening = max(round($openingBalance, 2), 0);

            $session = CashDrawerSession::create([
                'user_id'                  => $user->id,
                'opened_at'                => Carbon::now(),
                'status'                   => 'open',
                'opening_balance'          => $opening,
                'closing_balance_expected' => $opening,
                'closing_balance_actual'   => null,
                'difference'               => 0,
                'notes'                    => $notes,
            ]);

            if (Schema::hasTable('accounts')) {
                app(AccountService::class)->syncCashDrawerBalance($session);
            }

            return $session->load('user');
        });
    }

    /**
     * Record a transaction in an active drawer session.
     */
    public function recordTransaction(
        ?CashDrawerSession $session,
        string $type,
        float $amount,
        ?string $refType = null,
        ?int $refId = null,
        ?string $notes = null,
        ?User $user = null
    ): ?CashDrawerTransaction {
        if (!Schema::hasTable('cash_drawer_sessions') || !Schema::hasTable('cash_drawer_transactions')) {
            return null;
        }

        if (!$session) {
            $session = $this->getCurrentSession($user);
        }

        if (!$session || $session->status !== 'open') {
            return null;
        }

        return DB::transaction(function () use ($session, $type, $amount, $refType, $refId, $notes, $user) {
            $lockedSession = CashDrawerSession::lockForUpdate()->find($session->id);
            if (!$lockedSession || $lockedSession->status !== 'open') {
                return null;
            }

            $amount = round(abs($amount), 2);
            if ($amount <= 0) {
                return null;
            }

            $txn = CashDrawerTransaction::create([
                'session_id'     => $lockedSession->id,
                'user_id'        => $user?->id ?? $lockedSession->user_id,
                'type'           => $type,
                'amount'         => $amount,
                'reference_type' => $refType,
                'reference_id'   => $refId,
                'notes'          => $notes,
            ]);

            $this->recalculateExpectedBalance($lockedSession);

            return $txn;
        });
    }

    /**
     * Recalculate and update the expected cash balance in drawer.
     */
    public function recalculateExpectedBalance(CashDrawerSession $session): float
    {
        $cashIn = (float) CashDrawerTransaction::where('session_id', $session->id)
            ->whereIn('type', self::CASH_IN_TYPES)
            ->sum('amount');

        $cashOut = (float) CashDrawerTransaction::where('session_id', $session->id)
            ->whereIn('type', self::CASH_OUT_TYPES)
            ->sum('amount');

        $expected = round((float) $session->opening_balance + $cashIn - $cashOut, 2);

        $session->closing_balance_expected = $expected;
        $session->save();

        if (Schema::hasTable('accounts')) {
            app(AccountService::class)->syncCashDrawerBalance($session);
        }

        return $expected;
    }

    /**
     * Close a drawer session with cash count reconciliation.
     */
    public function closeSession(CashDrawerSession $session, float $actualCount, ?string $notes = null): CashDrawerSession
    {
        return DB::transaction(function () use ($session, $actualCount, $notes) {
            $lockedSession = CashDrawerSession::lockForUpdate()->findOrFail($session->id);

            if ($lockedSession->status !== 'open') {
                throw ValidationException::withMessages([
                    'session' => 'This cash drawer session has already been closed.',
                ]);
            }

            $expected = $this->recalculateExpectedBalance($lockedSession);
            $actual = round($actualCount, 2);
            $difference = round($actual - $expected, 2);

            $combinedNotes = trim(($lockedSession->notes ? $lockedSession->notes . "\n" : '') . ($notes ?? ''));

            $lockedSession->update([
                'status'                   => 'closed',
                'closed_at'                => Carbon::now(),
                'closing_balance_expected' => $expected,
                'closing_balance_actual'   => $actual,
                'difference'               => $difference,
                'notes'                    => $combinedNotes ?: null,
            ]);

            return $lockedSession->fresh(['transactions.user', 'user']);
        });
    }

    /**
     * Get computed breakdown statistics for a drawer session.
     */
    public function getSessionSummary(CashDrawerSession $session): array
    {
        $transactions = $session->relationLoaded('transactions')
            ? $session->transactions
            : CashDrawerTransaction::where('session_id', $session->id)
                ->select(['id', 'session_id', 'type', 'reference_type', 'amount'])
                ->get();

        $cashSales = (float) $transactions->where('type', 'cash_sale')->sum('amount');
        $cashReturns = (float) $transactions->where('type', 'cash_return')->sum('amount');
        $cashPurchases = (float) $transactions->where('type', 'cash_purchase')->sum('amount');
        $purchaseReturns = (float) $transactions->where('type', 'purchase_return')->sum('amount');
        $customerPayments = (float) $transactions->where('type', 'customer_payment')->sum('amount');
        $supplierPayments = (float) $transactions->where('type', 'supplier_payment')->sum('amount');
        $cashIn = (float) $transactions->where('type', 'cash_in')->sum('amount');
        $expenses = (float) $transactions->filter(function ($t) {
            return $t->type === 'expense' || ($t->type === 'cash_out' && ($t->reference_type === \App\Models\Expense::class || $t->reference_type === 'expense'));
        })->sum('amount');
        $staffAdvances = (float) $transactions->filter(function ($t) {
            return $t->type === 'cash_out' && ($t->reference_type === \App\Models\EmployeeAdvance::class || $t->reference_type === 'employee_advance');
        })->sum('amount');
        $cashOut = (float) $transactions->filter(function ($t) {
            return $t->type === 'cash_out'
                && $t->reference_type !== \App\Models\Expense::class
                && $t->reference_type !== 'expense'
                && $t->reference_type !== \App\Models\EmployeeAdvance::class
                && $t->reference_type !== 'employee_advance';
        })->sum('amount');

        $totalCashIn = $cashSales + $customerPayments + $purchaseReturns + $cashIn;
        $totalCashOut = $cashPurchases + $cashReturns + $supplierPayments + $expenses + $staffAdvances + $cashOut;
        $expected = round((float) $session->opening_balance + $totalCashIn - $totalCashOut, 2);

        return [
            'session_id'        => $session->id,
            'status'            => $session->status,
            'opened_at'         => $session->opened_at,
            'closed_at'         => $session->closed_at,
            'duration'          => $session->closed_at 
                ? Carbon::parse($session->opened_at)->diffForHumans(Carbon::parse($session->closed_at), true)
                : Carbon::parse($session->opened_at)->diffForHumans(now(), true),
            'user'              => $session->user ? ['id' => $session->user->id, 'name' => $session->user->name] : null,
            'opening_balance'   => (float) $session->opening_balance,
            'cash_sales'        => $cashSales,
            'cash_returns'      => $cashReturns,
            'cash_purchases'    => $cashPurchases,
            'purchase_returns'  => $purchaseReturns,
            'customer_payments' => $customerPayments,
            'supplier_payments' => $supplierPayments,
            'expenses'          => $expenses,
            'staff_advances'    => $staffAdvances,
            'manual_cash_in'    => $cashIn,
            'manual_cash_out'   => $cashOut,
            'total_cash_in'     => $totalCashIn,
            'total_cash_out'    => $totalCashOut,
            'expected_balance'  => $expected,
            'actual_balance'    => $session->closing_balance_actual,
            'difference'        => $session->difference,
            'notes'             => $session->notes,
            'transactions_count'=> $transactions->count(),
        ];
    }

    /**
     * Batch-enrich a collection of CashDrawerTransactions with human-readable
     * document numbers, party names, category explanations, and clickable URLs.
     */
    public function enrichTransactions($transactions)
    {
        if (!$transactions || $transactions->isEmpty()) {
            return $transactions;
        }

        $saleInvIds = [];
        $purchInvIds = [];
        $saleRetIds = [];
        $purchRetIds = [];
        $paymentIds = [];
        $expenseIds = [];
        $advanceIds = [];

        foreach ($transactions as $txn) {
            $refType = (string) ($txn->reference_type ?? '');
            $refId = (int) ($txn->reference_id ?? 0);
            if ($refId <= 0) {
                continue;
            }
            if ($refType === 'sale_invoice' || $refType === \App\Models\SaleInvoice::class) {
                $saleInvIds[] = $refId;
            } elseif ($refType === 'purchase_invoice' || $refType === \App\Models\PurchaseInvoice::class) {
                $purchInvIds[] = $refId;
            } elseif ($refType === 'sale_return' || $refType === \App\Models\SaleReturn::class) {
                $saleRetIds[] = $refId;
            } elseif ($refType === 'purchase_return' || $refType === \App\Models\PurchaseReturn::class) {
                $purchRetIds[] = $refId;
            } elseif ($refType === 'payment' || $refType === \App\Models\Payment::class) {
                $paymentIds[] = $refId;
            } elseif ($refType === 'expense' || $refType === \App\Models\Expense::class) {
                $expenseIds[] = $refId;
            } elseif ($refType === 'employee_advance' || $refType === \App\Models\EmployeeAdvance::class) {
                $advanceIds[] = $refId;
            }
        }

        $saleInvoices = !empty($saleInvIds) && Schema::hasTable('sale_invoices')
            ? \App\Models\SaleInvoice::with('customer:id,name')->whereIn('id', array_unique($saleInvIds))->get()->keyBy('id')
            : collect();
        $purchInvoices = !empty($purchInvIds) && Schema::hasTable('purchase_invoices')
            ? \App\Models\PurchaseInvoice::with('supplier:id,name')->whereIn('id', array_unique($purchInvIds))->get()->keyBy('id')
            : collect();
        $saleReturns = !empty($saleRetIds) && Schema::hasTable('sale_returns')
            ? \App\Models\SaleReturn::with('customer:id,name')->whereIn('id', array_unique($saleRetIds))->get()->keyBy('id')
            : collect();
        $purchReturns = !empty($purchRetIds) && Schema::hasTable('purchase_returns')
            ? \App\Models\PurchaseReturn::with('supplier:id,name')->whereIn('id', array_unique($purchRetIds))->get()->keyBy('id')
            : collect();
        $payments = !empty($paymentIds) && Schema::hasTable('payments')
            ? \App\Models\Payment::with(['customer:id,name', 'supplier:id,name'])->whereIn('id', array_unique($paymentIds))->get()->keyBy('id')
            : collect();
        $expenses = !empty($expenseIds) && Schema::hasTable('expenses')
            ? \App\Models\Expense::withTrashed()->with('category:id,name')->whereIn('id', array_unique($expenseIds))->get()->keyBy('id')
            : collect();
        $advances = !empty($advanceIds) && Schema::hasTable('employee_advances')
            ? \App\Models\EmployeeAdvance::with('employee')->whereIn('id', array_unique($advanceIds))->get()->keyBy('id')
            : collect();

        foreach ($transactions as $txn) {
            $refType = (string) ($txn->reference_type ?? '');
            $refId = (int) ($txn->reference_id ?? 0);
            $refLabel = null;
            $partyName = null;
            $refUrl = null;
            $categoryLabel = null;

            if ($refType === 'sale_invoice' || $refType === \App\Models\SaleInvoice::class) {
                $inv = $saleInvoices->get($refId);
                $refLabel = $inv?->posted_number ?: "SI-#{$refId}";
                $partyName = $inv?->customer?->name ?: ($inv?->walk_in_customer_name ?: 'Walk-in Customer');
                $refUrl = $refId > 0 ? "/sale-invoices/{$refId}" : null;
                $categoryLabel = $txn->type === 'cash_return' ? 'Sale Invoice Refund / Reversal' : 'Cash Sale Invoice';
            } elseif ($refType === 'purchase_invoice' || $refType === \App\Models\PurchaseInvoice::class) {
                $inv = $purchInvoices->get($refId);
                $refLabel = $inv?->posted_number ?: ($inv?->invoice_number ?: "PI-#{$refId}");
                $partyName = $inv?->supplier?->name ?: 'Supplier';
                $refUrl = $refId > 0 ? "/purchase-invoices/{$refId}" : null;
                $categoryLabel = 'Cash Purchase Invoice (GRN)';
            } elseif ($refType === 'sale_return' || $refType === \App\Models\SaleReturn::class) {
                $ret = $saleReturns->get($refId);
                $refLabel = $ret?->posted_number ?: "SR-#{$refId}";
                $partyName = $ret?->customer?->name ?: 'Walk-in Customer';
                $refUrl = $refId > 0 ? "/sale-returns/{$refId}" : null;
                $categoryLabel = 'Cash Refund to Customer (Sale Return)';
            } elseif ($refType === 'purchase_return' || $refType === \App\Models\PurchaseReturn::class) {
                $ret = $purchReturns->get($refId);
                $refLabel = $ret?->posted_number ?: "PR-#{$refId}";
                $partyName = $ret?->supplier?->name ?: 'Supplier';
                $refUrl = $refId > 0 ? "/purchase-returns/{$refId}" : null;
                $categoryLabel = 'Cash Refund from Supplier (Purchase Return)';
            } elseif ($refType === 'payment' || $refType === \App\Models\Payment::class) {
                $pay = $payments->get($refId);
                $refLabel = $pay?->payment_number ?: "PMT-#{$refId}";
                if ($pay?->party_type === 'customer' || $txn->type === 'customer_payment') {
                    $partyName = $pay?->customer?->name ?: 'Customer';
                    $refUrl = $pay?->party_id ? "/customer-ledger?customer_id={$pay->party_id}" : '/customer-ledger';
                    $categoryLabel = 'Customer Udhar Recovery';
                } else {
                    $partyName = $pay?->supplier?->name ?: 'Supplier';
                    $refUrl = $pay?->party_id ? "/supplier-ledger?supplier_id={$pay->party_id}" : '/supplier-ledger';
                    $categoryLabel = 'Supplier Ledger Payment';
                }
            } elseif ($refType === 'expense' || $refType === \App\Models\Expense::class) {
                $exp = $expenses->get($refId);
                $refLabel = $exp?->expense_number ?: "EXP-#{$refId}";
                $partyName = $exp?->category?->name ?: ($exp?->payee ?: 'Shop Expense');
                $refUrl = '/expenses';
                $categoryLabel = 'Operating Shop Expense';
            } elseif ($refType === 'employee_advance' || $refType === \App\Models\EmployeeAdvance::class) {
                $adv = $advances->get($refId);
                $refLabel = $adv?->advance_number ?: "ADV-#{$refId}";
                $empName = $adv?->employee?->name
                    ?: trim(($adv?->employee?->first_name ?? '') . ' ' . ($adv?->employee?->last_name ?? ''));
                $partyName = $empName ?: 'Staff Member';
                $refUrl = '/hr-payroll?tab=advances';
                $categoryLabel = $txn->type === 'cash_in' ? 'Staff Advance Repayment' : 'Staff Salary Advance';
            } elseif ($refType === 'account_transfer') {
                $refLabel = $refId > 0 ? "TRF-#{$refId}" : 'Transfer';
                $partyName = 'Treasury / Bank Transfer';
                $refUrl = '/accounts';
                $categoryLabel = $txn->type === 'cash_in' ? 'Cash Withdrawn from Bank to Drawer' : 'Cash Deposited from Drawer to Bank/Safe';
            } else {
                $refLabel = 'Manual Drawer Entry';
                $partyName = $txn->user?->name ? "By {$txn->user->name}" : 'Cashier Entry';
                $refUrl = null;
                $categoryLabel = $txn->type === 'cash_in' ? 'Manual Cash Added to Drawer' : 'Manual Cash Removed from Drawer';
            }

            $txn->setAttribute('reference_label', $refLabel);
            $txn->setAttribute('party_name', $partyName);
            $txn->setAttribute('reference_url', $refUrl);
            $txn->setAttribute('category_label', $categoryLabel);
        }

        return $transactions;
    }

    /**
     * Synchronize cash drawer transactions when a sale invoice is edited.
     */
    public function syncSaleInvoiceUpdate(
        \App\Models\SaleInvoice $invoice,
        float $oldCash,
        float $newCash,
        ?bool $updateDrawerIfPreShift = null,
        ?User $user = null
    ): ?CashDrawerTransaction {
        if (!Schema::hasTable('cash_drawer_sessions') || !Schema::hasTable('cash_drawer_transactions')) {
            return null;
        }

        $session = $this->getCurrentSession($user);
        if (!$session || $session->status !== 'open') {
            return null;
        }

        return DB::transaction(function () use ($session, $invoice, $oldCash, $newCash, $updateDrawerIfPreShift, $user) {
            $lockedSession = CashDrawerSession::lockForUpdate()->find($session->id);
            if (!$lockedSession || $lockedSession->status !== 'open') {
                return null;
            }

            // Check if there was an existing transaction recorded in this session for this invoice
            $existingTxn = CashDrawerTransaction::where('session_id', $lockedSession->id)
                ->where('reference_type', 'sale_invoice')
                ->where('reference_id', $invoice->id)
                ->first();

            // Check if invoice was created before the current shift opened
            $isPreShift = $invoice->created_at 
                && Carbon::parse($invoice->created_at)->lt(Carbon::parse($lockedSession->opened_at))
                && !$existingTxn;

            if ($isPreShift) {
                // Pre-shift invoice: only adjust if user confirmed drawer update
                if ($updateDrawerIfPreShift !== true) {
                    return null;
                }

                $delta = round($newCash - $oldCash, 2);
                if ($delta > 0) {
                    return $this->recordTransaction(
                        $lockedSession,
                        'cash_sale',
                        $delta,
                        'sale_invoice',
                        $invoice->id,
                        "Shift adjustment for previous invoice {$invoice->posted_number} (+{$delta})",
                        $user
                    );
                } elseif ($delta < 0) {
                    return $this->recordTransaction(
                        $lockedSession,
                        'cash_out',
                        abs($delta),
                        'sale_invoice',
                        $invoice->id,
                        "Shift refund/reduction for previous invoice {$invoice->posted_number} (-" . abs($delta) . ")",
                        $user
                    );
                }
                return null;
            }

            // Same shift invoice
            $newCash = round(max($newCash, 0), 2);
            if ($existingTxn) {
                if ($newCash > 0) {
                    $existingTxn->amount = $newCash;
                    $existingTxn->notes = "Cash sale {$invoice->posted_number} (updated)";
                    $existingTxn->save();
                    $this->recalculateExpectedBalance($lockedSession);
                    return $existingTxn;
                } else {
                    $existingTxn->delete();
                    $this->recalculateExpectedBalance($lockedSession);
                    return null;
                }
            } else {
                if ($newCash > 0) {
                    return $this->recordTransaction(
                        $lockedSession,
                        'cash_sale',
                        $newCash,
                        'sale_invoice',
                        $invoice->id,
                        "Cash sale {$invoice->posted_number}",
                        $user
                    );
                }
            }

            return null;
        });
    }

    /**
     * Handle cash drawer effect when a sale invoice is deleted.
     */
    public function handleSaleInvoiceDeletion(
        \App\Models\SaleInvoice $invoice,
        string $mode = 'none',
        ?User $user = null
    ): ?CashDrawerTransaction {
        if (!Schema::hasTable('cash_drawer_sessions') || !Schema::hasTable('cash_drawer_transactions')) {
            return null;
        }

        $session = $this->getCurrentSession($user);
        if (!$session || $session->status !== 'open') {
            return null;
        }

        $payMethod = $invoice->payment_method ?? 'cash';
        if ($payMethod !== 'cash') {
            return null;
        }

        $invTotal = (float)($invoice->total ?? $invoice->grand_total ?? $invoice->gross_amount ?? 0);
        $cashReceived = (float)($invoice->total_receive ?? 0);
        if (($invoice->invoice_type ?? 'debit') === 'debit' && $cashReceived <= 0) {
            $cashReceived = $invTotal;
        }
        $cashReceived = round($cashReceived, 2);

        if ($cashReceived <= 0) {
            return null;
        }

        return DB::transaction(function () use ($session, $invoice, $mode, $cashReceived, $user) {
            $lockedSession = CashDrawerSession::lockForUpdate()->find($session->id);
            if (!$lockedSession || $lockedSession->status !== 'open') {
                return null;
            }

            // Check if there was an existing transaction recorded in this session for this invoice
            $existingTxn = CashDrawerTransaction::where('session_id', $lockedSession->id)
                ->where('reference_type', 'sale_invoice')
                ->where('reference_id', $invoice->id)
                ->first();

            if ($existingTxn) {
                // Created during current shift: delete transaction and recalculate
                $existingTxn->delete();
                $this->recalculateExpectedBalance($lockedSession);
                return null;
            }

            // Pre-shift invoice: if refund mode or cash sale, cash was refunded out of drawer
            if ($mode === 'refund' || ($invoice->invoice_type ?? 'debit') === 'debit') {
                return $this->recordTransaction(
                    $lockedSession,
                    'cash_return',
                    $cashReceived,
                    'sale_invoice_deleted',
                    $invoice->id,
                    "Cash refund for deleted invoice {$invoice->posted_number}",
                    $user
                );
            }

            return null;
        });
    }

    /**
     * Handle cash drawer effect when a sale invoice is reversed / voided.
     */
    public function handleSaleInvoiceReversal(
        \App\Models\SaleInvoice $invoice,
        string $reason,
        ?User $user = null
    ): ?CashDrawerTransaction {
        if (!Schema::hasTable('cash_drawer_sessions') || !Schema::hasTable('cash_drawer_transactions')) {
            return null;
        }

        $session = $this->getCurrentSession($user);
        if (!$session || $session->status !== 'open') {
            return null;
        }

        $payMethod = $invoice->payment_method ?? 'cash';
        if ($payMethod !== 'cash') {
            return null;
        }

        $invTotal = (float)($invoice->total ?? $invoice->grand_total ?? $invoice->gross_amount ?? 0);
        $cashReceived = (float)($invoice->total_receive ?? 0);
        if (($invoice->invoice_type ?? 'debit') === 'debit' && $cashReceived <= 0) {
            $cashReceived = $invTotal;
        }
        $cashReceived = round($cashReceived, 2);

        if ($cashReceived <= 0) {
            return null;
        }

        return DB::transaction(function () use ($session, $invoice, $reason, $cashReceived, $user) {
            $lockedSession = CashDrawerSession::lockForUpdate()->find($session->id);
            if (!$lockedSession || $lockedSession->status !== 'open') {
                return null;
            }

            // Record a cash_return for the reversal refund
            return $this->recordTransaction(
                $lockedSession,
                'cash_return',
                $cashReceived,
                'sale_invoice',
                $invoice->id,
                "Void refund for invoice {$invoice->posted_number}: {$reason}",
                $user
            );
        });
    }

    /**
     * Synchronize cash drawer transactions when a purchase invoice is edited.
     */
    public function syncPurchaseInvoiceUpdate(
        \App\Models\PurchaseInvoice $invoice,
        float $oldCashPaid,
        float $newCashPaid,
        ?bool $updateDrawerIfPreShift = null,
        ?User $user = null
    ): ?CashDrawerTransaction {
        if (!Schema::hasTable('cash_drawer_sessions') || !Schema::hasTable('cash_drawer_transactions')) {
            return null;
        }

        $session = $this->getCurrentSession($user);
        if (!$session || $session->status !== 'open') {
            return null;
        }

        return DB::transaction(function () use ($session, $invoice, $oldCashPaid, $newCashPaid, $updateDrawerIfPreShift, $user) {
            $lockedSession = CashDrawerSession::lockForUpdate()->find($session->id);
            if (!$lockedSession || $lockedSession->status !== 'open') {
                return null;
            }

            $existingTxn = CashDrawerTransaction::where('session_id', $lockedSession->id)
                ->where('reference_type', 'purchase_invoice')
                ->where('reference_id', $invoice->id)
                ->first();

            $isPreShift = $invoice->created_at 
                && Carbon::parse($invoice->created_at)->lt(Carbon::parse($lockedSession->opened_at))
                && !$existingTxn;

            if ($isPreShift) {
                if ($updateDrawerIfPreShift !== true) {
                    return null;
                }

                $delta = round($newCashPaid - $oldCashPaid, 2);
                if ($delta > 0) {
                    // Extra cash paid out from drawer
                    return $this->recordTransaction(
                        $lockedSession,
                        'cash_purchase',
                        $delta,
                        'purchase_invoice',
                        $invoice->id,
                        "Shift adjustment for purchase {$invoice->posted_number} (-{$delta})",
                        $user
                    );
                } elseif ($delta < 0) {
                    // Supplier returned cash into drawer
                    return $this->recordTransaction(
                        $lockedSession,
                        'cash_in',
                        abs($delta),
                        'purchase_invoice',
                        $invoice->id,
                        "Supplier refund for purchase {$invoice->posted_number} (+{$delta})",
                        $user
                    );
                }
                return null;
            }

            $newCashPaid = round(max($newCashPaid, 0), 2);
            if ($existingTxn) {
                if ($newCashPaid > 0) {
                    $existingTxn->amount = $newCashPaid;
                    $existingTxn->notes = "Cash purchase {$invoice->posted_number} (updated)";
                    $existingTxn->save();
                    $this->recalculateExpectedBalance($lockedSession);
                    return $existingTxn;
                } else {
                    $existingTxn->delete();
                    $this->recalculateExpectedBalance($lockedSession);
                    return null;
                }
            } else {
                if ($newCashPaid > 0) {
                    return $this->recordTransaction(
                        $lockedSession,
                        'cash_purchase',
                        $newCashPaid,
                        'purchase_invoice',
                        $invoice->id,
                        "Cash purchase {$invoice->posted_number}",
                        $user
                    );
                }
            }

            return null;
        });
    }

    /**
     * Handle cash drawer effect when a purchase invoice is deleted.
     */
    public function handlePurchaseInvoiceDeletion(
        \App\Models\PurchaseInvoice $invoice,
        ?User $user = null
    ): ?CashDrawerTransaction {
        if (!Schema::hasTable('cash_drawer_sessions') || !Schema::hasTable('cash_drawer_transactions')) {
            return null;
        }

        $session = $this->getCurrentSession($user);
        if (!$session || $session->status !== 'open') {
            return null;
        }

        $payMethod = $invoice->payment_method ?? 'cash';
        if ($payMethod !== 'cash') {
            return null;
        }

        $invTotal = (float)($invoice->total_amount ?? 0);
        $cashPaid = (float)($invoice->total_paid ?? 0);
        if (($invoice->invoice_type ?? 'debit') === 'debit' && $cashPaid <= 0) {
            $cashPaid = $invTotal;
        }
        $cashPaid = round($cashPaid, 2);

        if ($cashPaid <= 0) {
            return null;
        }

        return DB::transaction(function () use ($session, $invoice, $cashPaid, $user) {
            $lockedSession = CashDrawerSession::lockForUpdate()->find($session->id);
            if (!$lockedSession || $lockedSession->status !== 'open') {
                return null;
            }

            $existingTxn = CashDrawerTransaction::where('session_id', $lockedSession->id)
                ->where('reference_type', 'purchase_invoice')
                ->where('reference_id', $invoice->id)
                ->first();

            if ($existingTxn) {
                // Delete transaction and recalculate balance (cash paid out is undone)
                $existingTxn->delete();
                $this->recalculateExpectedBalance($lockedSession);
                return null;
            }

            // Supplier refunded the cash into drawer
            return $this->recordTransaction(
                $lockedSession,
                'cash_in',
                $cashPaid,
                'purchase_invoice_deleted',
                $invoice->id,
                "Supplier refund for deleted purchase {$invoice->posted_number}",
                $user
            );
        });
    }

    /**
     * Handle cash drawer effect when a purchase invoice is reversed.
     */
    public function handlePurchaseInvoiceReversal(
        \App\Models\PurchaseInvoice $invoice,
        string $reason,
        ?User $user = null
    ): ?CashDrawerTransaction {
        if (!Schema::hasTable('cash_drawer_sessions') || !Schema::hasTable('cash_drawer_transactions')) {
            return null;
        }

        $session = $this->getCurrentSession($user);
        if (!$session || $session->status !== 'open') {
            return null;
        }

        $payMethod = $invoice->payment_method ?? 'cash';
        if ($payMethod !== 'cash') {
            return null;
        }

        $invTotal = (float)($invoice->total_amount ?? 0);
        $cashPaid = (float)($invoice->total_paid ?? 0);
        if (($invoice->invoice_type ?? 'debit') === 'debit' && $cashPaid <= 0) {
            $cashPaid = $invTotal;
        }
        $cashPaid = round($cashPaid, 2);

        if ($cashPaid <= 0) {
            return null;
        }

        return DB::transaction(function () use ($session, $invoice, $reason, $cashPaid, $user) {
            $lockedSession = CashDrawerSession::lockForUpdate()->find($session->id);
            if (!$lockedSession || $lockedSession->status !== 'open') {
                return null;
            }

            // Record cash_in for the supplier refund of purchase payment
            return $this->recordTransaction(
                $lockedSession,
                'cash_in',
                $cashPaid,
                'purchase_invoice',
                $invoice->id,
                "Void refund from supplier for purchase {$invoice->posted_number}: {$reason}",
                $user
            );
        });
    }

    /**
     * Handle cash drawer transaction on Sale Return creation.
     */
    public function handleSaleReturnCreation(
        \App\Models\SaleReturn $saleReturn,
        ?User $user = null
    ): ?CashDrawerTransaction {
        $amount = (float) ($saleReturn->total ?? 0);
        if ($amount <= 0) {
            return null;
        }

        $session = $this->getCurrentSession($user);
        if (!$session) {
            return null;
        }

        return $this->recordTransaction(
            $session,
            'cash_return',
            $amount,
            'sale_return',
            $saleReturn->id,
            "Customer cash refund for sale return #{$saleReturn->posted_number}",
            $user
        );
    }

    /**
     * Synchronize cash drawer transactions when a sale return is edited.
     */
    public function syncSaleReturnUpdate(
        \App\Models\SaleReturn $saleReturn,
        float $oldTotal,
        float $newTotal,
        ?bool $updateDrawerIfPreShift = null,
        ?User $user = null
    ): ?CashDrawerTransaction {
        $session = $this->getCurrentSession($user);
        if (!$session) {
            return null;
        }

        return DB::transaction(function () use ($session, $saleReturn, $oldTotal, $newTotal, $updateDrawerIfPreShift, $user) {
            $existingTxn = CashDrawerTransaction::where('session_id', $session->id)
                ->where('reference_type', 'sale_return')
                ->where('reference_id', $saleReturn->id)
                ->first();

            $isPreShift = $saleReturn->created_at
                && Carbon::parse($saleReturn->created_at)->lt(Carbon::parse($session->opened_at))
                && !$existingTxn;

            if ($isPreShift) {
                if ($updateDrawerIfPreShift === false) {
                    return null;
                }
                $delta = round($newTotal - $oldTotal, 2);
                if (abs($delta) < 0.01) {
                    return null;
                }
                if ($delta > 0) {
                    // Additional refund to customer -> cash_return
                    return $this->recordTransaction(
                        $session,
                        'cash_return',
                        abs($delta),
                        'sale_return',
                        $saleReturn->id,
                        "Additional customer cash refund for pre-shift sale return #{$saleReturn->posted_number}",
                        $user
                    );
                } else {
                    // Customer returned part of refund -> cash_in
                    return $this->recordTransaction(
                        $session,
                        'cash_in',
                        abs($delta),
                        'sale_return',
                        $saleReturn->id,
                        "Cash recovery adjustment for pre-shift sale return #{$saleReturn->posted_number}",
                        $user
                    );
                }
            }

            // Same shift
            if ($existingTxn) {
                if ($newTotal > 0) {
                    $existingTxn->amount = $newTotal;
                    $existingTxn->notes = "Customer cash refund for sale return #{$saleReturn->posted_number}";
                    $existingTxn->save();
                    $this->recalculateExpectedBalance($session);
                    return $existingTxn;
                } else {
                    $existingTxn->delete();
                    $this->recalculateExpectedBalance($session);
                    return null;
                }
            } elseif ($newTotal > 0) {
                return $this->recordTransaction(
                    $session,
                    'cash_return',
                    $newTotal,
                    'sale_return',
                    $saleReturn->id,
                    "Customer cash refund for sale return #{$saleReturn->posted_number}",
                    $user
                );
            }

            return null;
        });
    }

    /**
     * Handle cash drawer recovery when a sale return is deleted.
     */
    public function handleSaleReturnDeletion(
        \App\Models\SaleReturn $saleReturn,
        ?User $user = null
    ): ?CashDrawerTransaction {
        $amount = (float) ($saleReturn->total ?? 0);
        if ($amount <= 0) {
            return null;
        }

        $session = $this->getCurrentSession($user);
        if (!$session) {
            return null;
        }

        return DB::transaction(function () use ($session, $saleReturn, $amount, $user) {
            $existingTxn = CashDrawerTransaction::where('session_id', $session->id)
                ->where('reference_type', 'sale_return')
                ->where('reference_id', $saleReturn->id)
                ->first();

            if ($existingTxn) {
                // Return was created in current active shift: deleting it restores cash to drawer
                $existingTxn->delete();
                $this->recalculateExpectedBalance($session);
                return null;
            }

            // Return was created before active shift: refund went out in prior shift.
            // Deleting the return voids the refund, recovering the cash back into active drawer
            return $this->recordTransaction(
                $session,
                'cash_in',
                $amount,
                'sale_return',
                $saleReturn->id,
                "Cash recovery for deleted pre-shift sale return #{$saleReturn->posted_number}",
                $user
            );
        });
    }

    /**
     * Handle cash drawer transaction on Purchase Return creation (cash refund from supplier).
     */
    public function handlePurchaseReturnCreation(
        \App\Models\PurchaseReturn $purchaseReturn,
        ?User $user = null
    ): ?CashDrawerTransaction {
        $amount = (float) ($purchaseReturn->total ?? 0);
        if ($amount <= 0) {
            return null;
        }

        $session = $this->getCurrentSession($user);
        if (!$session) {
            return null;
        }

        return $this->recordTransaction(
            $session,
            'purchase_return',
            $amount,
            'purchase_return',
            $purchaseReturn->id,
            "Supplier cash refund for purchase return #{$purchaseReturn->posted_number}",
            $user
        );
    }

    /**
     * Synchronize cash drawer transactions when a purchase return is edited.
     */
    public function syncPurchaseReturnUpdate(
        \App\Models\PurchaseReturn $purchaseReturn,
        float $oldTotal,
        float $newTotal,
        ?bool $updateDrawerIfPreShift = null,
        ?User $user = null
    ): ?CashDrawerTransaction {
        $session = $this->getCurrentSession($user);
        if (!$session) {
            return null;
        }

        return DB::transaction(function () use ($session, $purchaseReturn, $oldTotal, $newTotal, $updateDrawerIfPreShift, $user) {
            $existingTxn = CashDrawerTransaction::where('session_id', $session->id)
                ->where('reference_type', 'purchase_return')
                ->where('reference_id', $purchaseReturn->id)
                ->first();

            $isPreShift = $purchaseReturn->created_at
                && Carbon::parse($purchaseReturn->created_at)->lt(Carbon::parse($session->opened_at))
                && !$existingTxn;

            if ($isPreShift) {
                if ($updateDrawerIfPreShift === false) {
                    return null;
                }
                $delta = round($newTotal - $oldTotal, 2);
                if (abs($delta) < 0.01) {
                    return null;
                }
                if ($delta > 0) {
                    // Supplier refunded more cash into drawer -> purchase_return
                    return $this->recordTransaction(
                        $session,
                        'purchase_return',
                        abs($delta),
                        'purchase_return',
                        $purchaseReturn->id,
                        "Additional supplier cash refund for pre-shift purchase return #{$purchaseReturn->posted_number}",
                        $user
                    );
                } else {
                    // Supplier refunded less cash -> cash_out
                    return $this->recordTransaction(
                        $session,
                        'cash_out',
                        abs($delta),
                        'purchase_return',
                        $purchaseReturn->id,
                        "Cash adjustment for pre-shift purchase return #{$purchaseReturn->posted_number}",
                        $user
                    );
                }
            }

            // Same shift
            if ($existingTxn) {
                if ($newTotal > 0) {
                    $existingTxn->amount = $newTotal;
                    $existingTxn->notes = "Supplier cash refund for purchase return #{$purchaseReturn->posted_number}";
                    $existingTxn->save();
                    $this->recalculateExpectedBalance($session);
                    return $existingTxn;
                } else {
                    $existingTxn->delete();
                    $this->recalculateExpectedBalance($session);
                    return null;
                }
            } elseif ($newTotal > 0) {
                return $this->recordTransaction(
                    $session,
                    'purchase_return',
                    $newTotal,
                    'purchase_return',
                    $purchaseReturn->id,
                    "Supplier cash refund for purchase return #{$purchaseReturn->posted_number}",
                    $user
                );
            }

            return null;
        });
    }

    /**
     * Handle cash drawer deduction when a purchase return is deleted.
     */
    public function handlePurchaseReturnDeletion(
        \App\Models\PurchaseReturn $purchaseReturn,
        ?User $user = null
    ): ?CashDrawerTransaction {
        $amount = (float) ($purchaseReturn->total ?? 0);
        if ($amount <= 0) {
            return null;
        }

        $session = $this->getCurrentSession($user);
        if (!$session) {
            return null;
        }

        return DB::transaction(function () use ($session, $purchaseReturn, $amount, $user) {
            $existingTxn = CashDrawerTransaction::where('session_id', $session->id)
                ->where('reference_type', 'purchase_return')
                ->where('reference_id', $purchaseReturn->id)
                ->first();

            if ($existingTxn) {
                // Return was created in current active shift: deleting it removes cash from drawer
                $existingTxn->delete();
                $this->recalculateExpectedBalance($session);
                return null;
            }

            // Return was created before active shift: cash was added in prior shift.
            // Deleting the return means paying back supplier from active drawer
            return $this->recordTransaction(
                $session,
                'cash_out',
                $amount,
                'purchase_return',
                $purchaseReturn->id,
                "Cash refunded back to supplier for deleted pre-shift purchase return #{$purchaseReturn->posted_number}",
                $user
            );
        });
    }

    /**
     * Handle cash drawer reversal when a cash customer or supplier payment is reversed.
     */
    public function handlePaymentReversal(
        \App\Models\Payment $payment,
        string $reason,
        ?User $user = null
    ): ?CashDrawerTransaction {
        if (!Schema::hasTable('cash_drawer_sessions') || !Schema::hasTable('cash_drawer_transactions')) {
            return null;
        }

        $amount = (float) ($payment->amount ?? 0);
        if ($amount <= 0) {
            return null;
        }

        return DB::transaction(function () use ($payment, $amount, $reason, $user) {
            // 1. Check if the payment was recorded in an open drawer session
            $existingTxn = CashDrawerTransaction::where('reference_type', 'payment')
                ->where('reference_id', $payment->id)
                ->whereHas('session', fn($q) => $q->where('status', 'open'))
                ->first();

            if ($existingTxn) {
                $openSession = CashDrawerSession::find($existingTxn->session_id);
                $existingTxn->delete();
                if ($openSession) {
                    $this->recalculateExpectedBalance($openSession);
                }
                return null;
            }

            // 2. Otherwise, if the current user (or store) has an active open session,
            // record a compensating cash_out (for customer payment reversal) or cash_in (for supplier payment reversal)
            $session = $this->getCurrentSession($user);
            if (!$session) {
                return null;
            }

            $reversalType = $payment->party_type === 'customer' ? 'cash_out' : 'cash_in';
            $partyLabel = $payment->party_type === 'customer' ? 'Customer' : 'Supplier';

            return $this->recordTransaction(
                $session,
                $reversalType,
                $amount,
                'payment',
                $payment->id,
                "Reversal of {$partyLabel} Payment {$payment->payment_number}: {$reason}",
                $user
            );
        });
    }
}
