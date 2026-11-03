<?php

namespace App\Services;

use App\Models\Account;
use App\Models\AccountTransaction;
use App\Models\User;
use App\Support\SchemaCache;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

class AccountService
{
    /**
     * Map payment method string to account type.
     */
    public const METHOD_TYPE_MAP = [
        'cash'          => 'cash',
        'bank_transfer' => 'bank',
        'card'          => 'card',
        'mobile_wallet' => 'mobile_wallet',
        'cheque'        => 'bank',
        'other'         => 'other',
    ];

    /**
     * Check whether the given account (or fallback payment method when account is null)
     * represents the primary Cash in Hand (Drawer) account.
     */
    public function isDefaultCashDrawerAccount(?Account $account, ?string $fallbackMethod = null): bool
    {
        if ($account) {
            return $account->type === 'cash' && (bool) $account->is_default;
        }

        return ($fallbackMethod ?? 'cash') === 'cash';
    }

    /**
     * Check whether a document (invoice/return) was created before the currently active
     * cash drawer shift and has no transaction in the active shift.
     */
    public function isPreShiftDocumentForOpenDrawer($model, string $referenceType, ?User $user = null): bool
    {
        if (!SchemaCache::hasTable('cash_drawer_sessions') || !SchemaCache::hasTable('cash_drawer_transactions')) {
            return false;
        }

        $drawerService = app(CashDrawerService::class);
        $session = $drawerService->getCurrentSession($user, false);
        if (!$session || $session->status !== 'open') {
            return false;
        }

        $hasSameShiftTxn = \App\Models\CashDrawerTransaction::where('session_id', $session->id)
            ->where('reference_type', $referenceType)
            ->where('reference_id', $model->id)
            ->exists();

        if ($hasSameShiftTxn) {
            return false;
        }

        $createdAt = $model->created_at ? Carbon::parse($model->created_at) : null;
        $openedAt = $session->opened_at ? Carbon::parse($session->opened_at) : null;

        return (bool) ($createdAt && $openedAt && $createdAt->lt($openedAt));
    }

    /**
     * Ensure the default Cash in Hand (Drawer) account exists and return it.
     */
    public function syncCashDrawerBalance(?\App\Models\CashDrawerSession $session = null): ?Account
    {
        if (!SchemaCache::hasTable('accounts')) {
            return null;
        }

        $cashAccount = Account::where('type', 'cash')->where('is_default', true)->first();
        if (!$cashAccount) {
            $cashAccount = Account::where('type', 'cash')->first();
        }

        if (!$cashAccount) {
            $cashAccount = Account::create([
                'name'            => 'Cash in Hand (Drawer)',
                'type'            => 'cash',
                'code'            => 'cash_drawer',
                'icon'            => 'drawer',
                'opening_balance' => 0,
                'current_balance' => 0,
                'is_active'       => true,
                'is_default'      => true,
                'notes'           => 'Primary cash counter / drawer balance',
            ]);
        } elseif ((float) ($cashAccount->opening_balance ?? 0) != 0.0) {
            // Ensure Cash in Hand (Drawer) does not retain a separate locked opening_balance reserve
            // that conflicts with Cash Drawer shift opening/closing balances.
            $cashAccount->opening_balance = 0;
            $cashAccount->saveQuietly();
        }

        return $cashAccount;
    }

    /**
     * Reconcile the default Cash in Hand (Drawer) account with all currently open
     * CashDrawerSessions so that whenever a drawer shift is open, Cash in Hand (Drawer)
     * and the active Cash Drawer expected balance are 100% identical.
     */
    public function reconcileWithOpenCashDrawers(?User $user = null): ?Account
    {
        $cashAccount = $this->syncCashDrawerBalance();
        if (!$cashAccount || !SchemaCache::hasTable('cash_drawer_sessions') || !SchemaCache::hasTable('cash_drawer_transactions')) {
            return $cashAccount;
        }

        return DB::transaction(function () use ($cashAccount, $user) {
            $openSessions = \App\Models\CashDrawerSession::where('status', 'open')
                ->lockForUpdate()
                ->get();

            if ($openSessions->isEmpty()) {
                return $cashAccount->fresh();
            }

            $drawerService = app(CashDrawerService::class);
            $totalOpenExpected = round((float) $openSessions->sum(function (\App\Models\CashDrawerSession $sess) use ($drawerService) {
                return $drawerService->recalculateExpectedBalance($sess);
            }), 2);

            $lockedAccount = Account::where('id', $cashAccount->id)->lockForUpdate()->first();
            if (!$lockedAccount) {
                return $cashAccount;
            }

            if ((float) ($lockedAccount->opening_balance ?? 0) != 0.0) {
                $lockedAccount->opening_balance = 0;
                $lockedAccount->saveQuietly();
            }

            $delta = round($totalOpenExpected - (float) $lockedAccount->current_balance, 2);
            $primarySessionId = (int) $openSessions->first()->id;
            $actor = $user ?? auth()->user();

            if ($delta > 0.009) {
                $this->deposit(
                    $lockedAccount,
                    $delta,
                    'cash_drawer_reconcile',
                    $primarySessionId,
                    "Auto-reconciled Cash in Hand with active Cash Drawer (Shift #{$primarySessionId})",
                    $actor
                );
            } elseif ($delta < -0.009) {
                $this->withdraw(
                    $lockedAccount,
                    abs($delta),
                    'cash_drawer_reconcile',
                    $primarySessionId,
                    "Auto-reconciled Cash in Hand with active Cash Drawer (Shift #{$primarySessionId})",
                    $actor
                );
            }

            return $lockedAccount->fresh();
        });
    }

    /**
     * Get the default account for a given payment method.
     */
    public function getDefaultAccount(string $method = 'cash'): ?Account
    {
        if (!Schema::hasTable('accounts')) {
            return null;
        }

        $type = self::METHOD_TYPE_MAP[$method] ?? 'cash';
        if ($type === 'cash') {
            $this->syncCashDrawerBalance();
        }

        $account = Account::where('is_active', true)
            ->where('type', $type)
            ->where('is_default', true)
            ->first();

        if (!$account) {
            $account = Account::where('is_active', true)
                ->where('type', $type)
                ->first();
        }

        if (!$account) {
            // Fallback to the primary Cash in Hand (Drawer) account
            $account = $this->syncCashDrawerBalance() ?? Account::where('is_active', true)->first();
        }

        return $account;
    }

    /**
     * Resolve account by ID or fallback to default method account.
     */
    public function resolveAccount(?int $accountId, string $fallbackMethod = 'cash'): ?Account
    {
        if (!Schema::hasTable('accounts')) {
            return null;
        }

        if ($accountId) {
            $acc = Account::find($accountId);
            if ($acc) {
                return $acc;
            }
        }

        return $this->getDefaultAccount($fallbackMethod);
    }

    /**
     * Deposit funds into an account.
     */
    public function deposit(
        ?Account $account,
        float $amount,
        string $refType,
        ?int $refId = null,
        ?string $description = null,
        ?User $user = null
    ): ?AccountTransaction {
        if (!$account || !Schema::hasTable('accounts')) {
            return null;
        }

        $amount = round($amount, 2);
        if ($amount <= 0) {
            throw ValidationException::withMessages(['amount' => 'Deposit amount must be greater than zero.']);
        }

        return DB::transaction(function () use ($account, $amount, $refType, $refId, $description, $user) {
            // Lock account record
            $locked = Account::where('id', $account->id)->lockForUpdate()->first();
            $newBalance = round((float)$locked->current_balance + $amount, 2);

            $locked->current_balance = $newBalance;
            $locked->save();

            return AccountTransaction::create([
                'account_id'       => $locked->id,
                'user_id'          => $user?->id,
                'type'             => 'deposit',
                'amount'           => $amount,
                'balance_after'    => $newBalance,
                'reference_type'   => $refType,
                'reference_id'     => $refId,
                'description'      => $description ?? "Deposit to {$locked->name}",
                'transaction_date' => Carbon::now(),
            ]);
        });
    }

    /**
     * Withdraw funds from an account.
     */
    public function withdraw(
        ?Account $account,
        float $amount,
        string $refType,
        ?int $refId = null,
        ?string $description = null,
        ?User $user = null
    ): ?AccountTransaction {
        if (!$account || !Schema::hasTable('accounts')) {
            return null;
        }

        $amount = round($amount, 2);
        if ($amount <= 0) {
            throw ValidationException::withMessages(['amount' => 'Withdrawal amount must be greater than zero.']);
        }

        return DB::transaction(function () use ($account, $amount, $refType, $refId, $description, $user) {
            // Lock account record
            $locked = Account::where('id', $account->id)->lockForUpdate()->first();
            $newBalance = round((float)$locked->current_balance - $amount, 2);

            $locked->current_balance = $newBalance;
            $locked->save();

            return AccountTransaction::create([
                'account_id'       => $locked->id,
                'user_id'          => $user?->id,
                'type'             => 'withdrawal',
                'amount'           => $amount,
                'balance_after'    => $newBalance,
                'reference_type'   => $refType,
                'reference_id'     => $refId,
                'description'      => $description ?? "Withdrawal from {$locked->name}",
                'transaction_date' => Carbon::now(),
            ]);
        });
    }

    /**
     * Transfer funds between two accounts.
     */
    public function transfer(
        Account $fromAccount,
        Account $toAccount,
        float $amount,
        ?string $notes = null,
        ?User $user = null
    ): array {
        if ($fromAccount->id === $toAccount->id) {
            throw ValidationException::withMessages([
                'to_account_id' => 'Source and destination accounts must be different.',
            ]);
        }

        $amount = round($amount, 2);
        if ($amount <= 0) {
            throw ValidationException::withMessages([
                'amount' => 'Transfer amount must be greater than zero.',
            ]);
        }

        return DB::transaction(function () use ($fromAccount, $toAccount, $amount, $notes, $user) {
            // Lock both accounts in deterministic ID order to prevent deadlock
            $firstId = min($fromAccount->id, $toAccount->id);
            $secondId = max($fromAccount->id, $toAccount->id);

            Account::where('id', $firstId)->lockForUpdate()->first();
            Account::where('id', $secondId)->lockForUpdate()->first();

            $fromLocked = Account::find($fromAccount->id);
            $toLocked = Account::find($toAccount->id);

            $fromBalanceAfter = round((float)$fromLocked->current_balance - $amount, 2);
            $toBalanceAfter = round((float)$toLocked->current_balance + $amount, 2);

            $fromLocked->current_balance = $fromBalanceAfter;
            $fromLocked->save();

            $toLocked->current_balance = $toBalanceAfter;
            $toLocked->save();

            $desc = $notes ? " - {$notes}" : '';

            $outTxn = AccountTransaction::create([
                'account_id'       => $fromLocked->id,
                'user_id'          => $user?->id,
                'type'             => 'transfer_out',
                'amount'           => $amount,
                'balance_after'    => $fromBalanceAfter,
                'reference_type'   => 'transfer',
                'reference_id'     => $toLocked->id,
                'description'      => "Transfer to {$toLocked->name}{$desc}",
                'transaction_date' => Carbon::now(),
            ]);

            $inTxn = AccountTransaction::create([
                'account_id'       => $toLocked->id,
                'user_id'          => $user?->id,
                'type'             => 'transfer_in',
                'amount'           => $amount,
                'balance_after'    => $toBalanceAfter,
                'reference_type'   => 'transfer',
                'reference_id'     => $fromLocked->id,
                'description'      => "Transfer from {$fromLocked->name}{$desc}",
                'transaction_date' => Carbon::now(),
            ]);

            // Sync with active cash drawer if either side is the default cash drawer account
            $cashDrawerService = app(CashDrawerService::class);
            if ($fromLocked->type === 'cash' && $fromLocked->is_default) {
                $cashDrawerService->recordTransaction(
                    null,
                    'cash_out',
                    $amount,
                    'account_transfer',
                    $outTxn->id,
                    "Transfer to {$toLocked->name}{$desc}",
                    $user
                );
            }
            if ($toLocked->type === 'cash' && $toLocked->is_default) {
                $cashDrawerService->recordTransaction(
                    null,
                    'cash_in',
                    $amount,
                    'account_transfer',
                    $inTxn->id,
                    "Transfer from {$fromLocked->name}{$desc}",
                    $user
                );
            }

            return [
                'from_transaction' => $outTxn,
                'to_transaction'   => $inTxn,
                'from_account'     => $fromLocked->fresh(),
                'to_account'       => $toLocked->fresh(),
            ];
        });
    }

    /**
     * Direct manual adjustment / deposit / withdrawal.
     */
    public function adjust(
        Account $account,
        string $type, // 'deposit' | 'withdrawal'
        float $amount,
        string $reason,
        ?User $user = null
    ): AccountTransaction {
        $amount = round($amount, 2);
        if ($amount <= 0) {
            throw ValidationException::withMessages(['amount' => 'Adjustment amount must be greater than zero.']);
        }

        return DB::transaction(function () use ($account, $type, $amount, $reason, $user) {
            $locked = Account::where('id', $account->id)->lockForUpdate()->first();

            if ($type === 'deposit') {
                $newBalance = round((float)$locked->current_balance + $amount, 2);
                $actionType = 'adjustment';
                $desc = "Manual deposit / adjustment: {$reason}";
            } else {
                $newBalance = round((float)$locked->current_balance - $amount, 2);
                $actionType = 'adjustment';
                $desc = "Manual expense / withdrawal: {$reason}";
            }

            $locked->current_balance = $newBalance;
            $locked->save();

            $txn = AccountTransaction::create([
                'account_id'       => $locked->id,
                'user_id'          => $user?->id,
                'type'             => $actionType,
                'amount'           => $amount,
                'balance_after'    => $newBalance,
                'reference_type'   => 'manual',
                'reference_id'     => null,
                'description'      => $desc,
                'transaction_date' => Carbon::now(),
            ]);

            // If account is the default cash drawer account, sync with cash drawer
            if ($locked->type === 'cash' && $locked->is_default) {
                $cashDrawerService = app(CashDrawerService::class);
                if ($type === 'deposit') {
                    $cashDrawerService->recordTransaction(null, 'cash_in', $amount, 'account_adjustment', $txn->id, $desc, $user);
                } else {
                    $cashDrawerService->recordTransaction(null, 'cash_out', $amount, 'account_adjustment', $txn->id, $desc, $user);
                }
            }

            return $txn;
        });
    }

    /**
     * Sync account when a sale invoice is updated.
     */
    public function syncSaleInvoiceUpdate(
        $invoice,
        ?int $oldAccountId,
        string $oldMethod,
        float $oldReceived,
        ?int $newAccountId,
        string $newMethod,
        float $newReceived,
        ?User $user = null,
        ?bool $updateDrawerIfPreShift = null
    ): void {
        if (!Schema::hasTable('accounts')) {
            return;
        }

        DB::transaction(function () use ($invoice, $oldAccountId, $oldMethod, $oldReceived, $newAccountId, $newMethod, $newReceived, $user, $updateDrawerIfPreShift) {
            $oldAcc = $this->resolveAccount($oldAccountId, $oldMethod);
            $newAcc = $this->resolveAccount($newAccountId, $newMethod);

            if (!$oldAcc || !$newAcc) {
                return;
            }

            $skipDrawerCash = ($updateDrawerIfPreShift === false)
                && $this->isPreShiftDocumentForOpenDrawer($invoice, 'sale_invoice', $user);

            if ($oldAcc->id === $newAcc->id) {
                if ($skipDrawerCash && $this->isDefaultCashDrawerAccount($newAcc)) {
                    return;
                }
                $delta = round($newReceived - $oldReceived, 2);
                if (abs($delta) > 0.001) {
                    if ($delta > 0) {
                        $this->deposit($newAcc, $delta, 'sale_invoice_update', $invoice->id, "Sale Invoice #{$invoice->posted_number} update (delta +{$delta})", $user);
                    } else {
                        $this->withdraw($newAcc, abs($delta), 'sale_invoice_update', $invoice->id, "Sale Invoice #{$invoice->posted_number} update (delta {$delta})", $user);
                    }
                }
            } else {
                // Revert from old account
                if ($oldReceived > 0 && !($skipDrawerCash && $this->isDefaultCashDrawerAccount($oldAcc))) {
                    $this->withdraw($oldAcc, $oldReceived, 'sale_invoice_update', $invoice->id, "Sale Invoice #{$invoice->posted_number} changed account from {$oldAcc->name}", $user);
                }
                // Deposit into new account
                if ($newReceived > 0 && !($skipDrawerCash && $this->isDefaultCashDrawerAccount($newAcc))) {
                    $this->deposit($newAcc, $newReceived, 'sale_invoice_update', $invoice->id, "Sale Invoice #{$invoice->posted_number} changed account to {$newAcc->name}", $user);
                }
            }

            if (Schema::hasColumn('sale_invoices', 'account_id') && (int) $invoice->account_id !== (int) $newAcc->id) {
                $invoice->account_id = $newAcc->id;
                $invoice->saveQuietly();
            }
        });
    }

    /**
     * Sync account when a purchase invoice is updated.
     */
    public function syncPurchaseInvoiceUpdate(
        $invoice,
        ?int $oldAccountId,
        string $oldMethod,
        float $oldPaid,
        ?int $newAccountId,
        string $newMethod,
        float $newPaid,
        ?User $user = null,
        ?bool $updateDrawerIfPreShift = null
    ): void {
        if (!Schema::hasTable('accounts')) {
            return;
        }

        DB::transaction(function () use ($invoice, $oldAccountId, $oldMethod, $oldPaid, $newAccountId, $newMethod, $newPaid, $user, $updateDrawerIfPreShift) {
            $oldAcc = $this->resolveAccount($oldAccountId, $oldMethod);
            $newAcc = $this->resolveAccount($newAccountId, $newMethod);

            if (!$oldAcc || !$newAcc) {
                return;
            }

            $skipDrawerCash = ($updateDrawerIfPreShift === false)
                && $this->isPreShiftDocumentForOpenDrawer($invoice, 'purchase_invoice', $user);

            if ($oldAcc->id === $newAcc->id) {
                if ($skipDrawerCash && $this->isDefaultCashDrawerAccount($newAcc)) {
                    return;
                }
                $delta = round($newPaid - $oldPaid, 2);
                if (abs($delta) > 0.001) {
                    if ($delta > 0) {
                        // More paid = more withdrawn from account
                        $this->withdraw($newAcc, $delta, 'purchase_invoice_update', $invoice->id, "Purchase Invoice #{$invoice->posted_number} update (additional payment {$delta})", $user);
                    } else {
                        // Less paid = refund deposited back into account
                        $this->deposit($newAcc, abs($delta), 'purchase_invoice_update', $invoice->id, "Purchase Invoice #{$invoice->posted_number} update (payment reduced +{$delta})", $user);
                    }
                }
            } else {
                // Deposit back into old account
                if ($oldPaid > 0 && !($skipDrawerCash && $this->isDefaultCashDrawerAccount($oldAcc))) {
                    $this->deposit($oldAcc, $oldPaid, 'purchase_invoice_update', $invoice->id, "Purchase Invoice #{$invoice->posted_number} payment reverted from {$oldAcc->name}", $user);
                }
                // Withdraw from new account
                if ($newPaid > 0 && !($skipDrawerCash && $this->isDefaultCashDrawerAccount($newAcc))) {
                    $this->withdraw($newAcc, $newPaid, 'purchase_invoice_update', $invoice->id, "Purchase Invoice #{$invoice->posted_number} payment charged to {$newAcc->name}", $user);
                }
            }

            if (Schema::hasColumn('purchase_invoices', 'account_id') && (int) $invoice->account_id !== (int) $newAcc->id) {
                $invoice->account_id = $newAcc->id;
                $invoice->saveQuietly();
            }
        });
    }

    /**
     * Refund direct tender collected on a sale invoice across its exact deposit account legs
     * (supporting both single-tender and multi-account split payments).
     */
    public function refundSaleInvoice(
        $invoice,
        float $revAmount,
        string $refType,
        string $descriptionPrefix,
        ?User $user = null
    ): void {
        if (!Schema::hasTable('accounts') || $revAmount <= 0) {
            return;
        }

        DB::transaction(function () use ($invoice, $revAmount, $refType, $descriptionPrefix, $user) {
            $txns = AccountTransaction::query()
                ->whereIn('reference_type', ['sale_invoice', 'sale_invoice_update'])
                ->where('reference_id', $invoice->id)
                ->get();

            if ($txns->isNotEmpty()) {
                $netByAccount = [];
                foreach ($txns as $txn) {
                    $accId = (int) $txn->account_id;
                    $amt = (float) $txn->amount;
                    $delta = in_array($txn->type, ['deposit', 'transfer_in', 'opening_balance'], true) ? $amt : -$amt;
                    $netByAccount[$accId] = round(($netByAccount[$accId] ?? 0.0) + $delta, 2);
                }

                $positiveLegs = array_filter($netByAccount, fn ($v) => $v > 0.001);
                if (!empty($positiveLegs)) {
                    $remainingToRefund = round($revAmount, 2);
                    foreach ($positiveLegs as $accId => $legNet) {
                        if ($remainingToRefund <= 0.001) {
                            break;
                        }
                        $refundLeg = round(min($remainingToRefund, $legNet), 2);
                        $acc = Account::find($accId);
                        if ($acc && $refundLeg > 0) {
                            $this->withdraw(
                                $acc,
                                $refundLeg,
                                $refType,
                                $invoice->id,
                                "{$descriptionPrefix} ({$acc->name})",
                                $user
                            );
                            $remainingToRefund = round($remainingToRefund - $refundLeg, 2);
                        }
                    }

                    if ($remainingToRefund > 0.001) {
                        $fallbackAcc = $this->resolveAccount($invoice->account_id, $invoice->payment_method ?? 'cash');
                        if ($fallbackAcc) {
                            $this->withdraw($fallbackAcc, $remainingToRefund, $refType, $invoice->id, $descriptionPrefix, $user);
                        }
                    }
                    return;
                }
            }

            if ($invoice->account_id !== null) {
                $acc = $this->resolveAccount($invoice->account_id, $invoice->payment_method ?? 'cash');
                if ($acc) {
                    $this->withdraw($acc, $revAmount, $refType, $invoice->id, $descriptionPrefix, $user);
                }
            }
        });
    }

    /**
     * Refund direct payment made on a purchase invoice back into its exact withdrawal account(s).
     */
    public function refundPurchaseInvoice(
        $invoice,
        float $revAmount,
        string $refType,
        string $descriptionPrefix,
        ?User $user = null
    ): void {
        if (!Schema::hasTable('accounts') || $revAmount <= 0) {
            return;
        }

        DB::transaction(function () use ($invoice, $revAmount, $refType, $descriptionPrefix, $user) {
            $txns = AccountTransaction::query()
                ->whereIn('reference_type', ['purchase_invoice', 'purchase_invoice_update'])
                ->where('reference_id', $invoice->id)
                ->get();

            if ($txns->isNotEmpty()) {
                $netWithdrawnByAccount = [];
                foreach ($txns as $txn) {
                    $accId = (int) $txn->account_id;
                    $amt = (float) $txn->amount;
                    $delta = in_array($txn->type, ['withdrawal', 'transfer_out'], true) ? $amt : -$amt;
                    $netWithdrawnByAccount[$accId] = round(($netWithdrawnByAccount[$accId] ?? 0.0) + $delta, 2);
                }

                $positiveLegs = array_filter($netWithdrawnByAccount, fn ($v) => $v > 0.001);
                if (!empty($positiveLegs)) {
                    $remainingToRefund = round($revAmount, 2);
                    foreach ($positiveLegs as $accId => $legNet) {
                        if ($remainingToRefund <= 0.001) {
                            break;
                        }
                        $refundLeg = round(min($remainingToRefund, $legNet), 2);
                        $acc = Account::find($accId);
                        if ($acc && $refundLeg > 0) {
                            $this->deposit(
                                $acc,
                                $refundLeg,
                                $refType,
                                $invoice->id,
                                "{$descriptionPrefix} ({$acc->name})",
                                $user
                            );
                            $remainingToRefund = round($remainingToRefund - $refundLeg, 2);
                        }
                    }

                    if ($remainingToRefund > 0.001 && $invoice->account_id !== null) {
                        $fallbackAcc = $this->resolveAccount($invoice->account_id, $invoice->payment_method ?? 'cash');
                        if ($fallbackAcc) {
                            $this->deposit($fallbackAcc, $remainingToRefund, $refType, $invoice->id, $descriptionPrefix, $user);
                        }
                    }
                }
                return;
            }

            if ($invoice->account_id !== null) {
                $acc = $this->resolveAccount($invoice->account_id, $invoice->payment_method ?? 'cash');
                if ($acc) {
                    $this->deposit($acc, $revAmount, $refType, $invoice->id, $descriptionPrefix, $user);
                }
            }
        });
    }

    /**
     * Get summary overview of all accounts.
     */
    public function getSummary(): array
    {
        $this->reconcileWithOpenCashDrawers();

        $accounts = Account::orderBy('type')->orderBy('name')->get();
        $totalBalance = round((float)$accounts->where('is_active', true)->sum('current_balance'), 2);

        $byType = [];
        foreach ($accounts as $acc) {
            $byType[$acc->type] = round(($byType[$acc->type] ?? 0) + (float)$acc->current_balance, 2);
        }

        return [
            'total_balance' => $totalBalance,
            'by_type'       => $byType,
            'accounts'      => $accounts,
        ];
    }
}
