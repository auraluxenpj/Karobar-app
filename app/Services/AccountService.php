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
     * Synchronize Cash in Hand (Drawer) account balance across all active open Cash Drawer sessions
     * plus any account-level safe reserve (opening_balance), without overwriting other cash accounts.
     */
    public function syncCashDrawerBalance(?\App\Models\CashDrawerSession $session = null): ?Account
    {
        if (!SchemaCache::hasTable('accounts') || !SchemaCache::hasTable('cash_drawer_sessions')) {
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
        }

        $openSessions = \App\Models\CashDrawerSession::where('status', 'open')
            ->get(['id', 'opening_balance']);

        if ($openSessions->isNotEmpty()) {
            $sessionIds = $openSessions->pluck('id')->all();
            $groupedTotals = \App\Models\CashDrawerTransaction::whereIn('session_id', $sessionIds)
                ->selectRaw('session_id, type, SUM(amount) as total_amount')
                ->groupBy('session_id', 'type')
                ->get()
                ->groupBy('session_id');

            $totalOpenDrawers = 0.0;
            foreach ($openSessions as $openSession) {
                $rows = $groupedTotals->get($openSession->id, collect());
                $cashIn = (float) $rows
                    ->whereIn('type', \App\Services\CashDrawerService::CASH_IN_TYPES)
                    ->sum('total_amount');
                $cashOut = (float) $rows
                    ->whereIn('type', \App\Services\CashDrawerService::CASH_OUT_TYPES)
                    ->sum('total_amount');
                $sessionExpected = round((float) $openSession->opening_balance + $cashIn - $cashOut, 2);
                $totalOpenDrawers = round($totalOpenDrawers + $sessionExpected, 2);
            }

            $safeOpeningReserve = max((float) ($cashAccount->opening_balance ?? 0), 0.0);
            $targetBalance = round($safeOpeningReserve + $totalOpenDrawers, 2);

            if (abs((float) $cashAccount->current_balance - $targetBalance) > 0.001) {
                $cashAccount->current_balance = $targetBalance;
                $cashAccount->save();
            }
        }

        return $cashAccount;
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
            // Fallback to any active default account or create one
            $account = Account::where('is_active', true)->first();
        }

        if (!$account) {
            $account = Account::create([
                'name'            => 'Cash in Hand (Drawer)',
                'type'            => 'cash',
                'opening_balance' => 0,
                'current_balance' => 0,
                'is_active'       => true,
                'is_default'      => true,
            ]);
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
        ?User $user = null
    ): void {
        if (!Schema::hasTable('accounts')) {
            return;
        }

        DB::transaction(function () use ($invoice, $oldAccountId, $oldMethod, $oldReceived, $newAccountId, $newMethod, $newReceived, $user) {
            $oldAcc = $this->resolveAccount($oldAccountId, $oldMethod);
            $newAcc = $this->resolveAccount($newAccountId, $newMethod);

            if (!$oldAcc || !$newAcc) {
                return;
            }

            if ($oldAcc->id === $newAcc->id) {
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
                if ($oldReceived > 0) {
                    $this->withdraw($oldAcc, $oldReceived, 'sale_invoice_update', $invoice->id, "Sale Invoice #{$invoice->posted_number} changed account from {$oldAcc->name}", $user);
                }
                // Deposit into new account
                if ($newReceived > 0) {
                    $this->deposit($newAcc, $newReceived, 'sale_invoice_update', $invoice->id, "Sale Invoice #{$invoice->posted_number} changed account to {$newAcc->name}", $user);
                }
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
        ?User $user = null
    ): void {
        if (!Schema::hasTable('accounts')) {
            return;
        }

        DB::transaction(function () use ($invoice, $oldAccountId, $oldMethod, $oldPaid, $newAccountId, $newMethod, $newPaid, $user) {
            $oldAcc = $this->resolveAccount($oldAccountId, $oldMethod);
            $newAcc = $this->resolveAccount($newAccountId, $newMethod);

            if (!$oldAcc || !$newAcc) {
                return;
            }

            if ($oldAcc->id === $newAcc->id) {
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
                if ($oldPaid > 0) {
                    $this->deposit($oldAcc, $oldPaid, 'purchase_invoice_update', $invoice->id, "Purchase Invoice #{$invoice->posted_number} payment reverted from {$oldAcc->name}", $user);
                }
                // Withdraw from new account
                if ($newPaid > 0) {
                    $this->withdraw($newAcc, $newPaid, 'purchase_invoice_update', $invoice->id, "Purchase Invoice #{$invoice->posted_number} payment charged to {$newAcc->name}", $user);
                }
            }
        });
    }

    /**
     * Get summary overview of all accounts.
     */
    public function getSummary(): array
    {
        $this->syncCashDrawerBalance();

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
