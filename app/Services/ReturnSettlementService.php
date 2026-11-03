<?php

namespace App\Services;

use App\Models\Account;
use App\Models\AccountTransaction;
use App\Models\CustomerLedger;
use App\Models\Payment;
use App\Models\PaymentAllocation;
use App\Models\PurchaseInvoice;
use App\Models\PurchaseReturn;
use App\Models\SaleInvoice;
use App\Models\SaleReturn;
use App\Models\SupplierLedger;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ReturnSettlementService
{
    public const VALID_MODES = ['cash_refund', 'credit_note', 'invoice_offset'];

    protected CashDrawerService $cashDrawerService;
    protected AccountService $accountService;

    public function __construct(CashDrawerService $cashDrawerService, AccountService $accountService)
    {
        $this->cashDrawerService = $cashDrawerService;
        $this->accountService = $accountService;
    }

    /**
     * Resolve the effective settlement mode for a Sale Return.
     * If no mode is explicitly requested, auto-select 'credit_note' when the source SaleInvoice is a credit invoice.
     */
    public function resolveSaleSettlementMode(
        ?string $requestedMode,
        ?int $saleInvoiceId = null,
        ?string $fallbackMode = null
    ): string {
        if ($requestedMode && in_array($requestedMode, self::VALID_MODES, true)) {
            return $requestedMode;
        }

        if ($fallbackMode && in_array($fallbackMode, self::VALID_MODES, true)) {
            return $fallbackMode;
        }

        if ($saleInvoiceId && Schema::hasTable('sale_invoices') && Schema::hasColumn('sale_invoices', 'invoice_type')) {
            $invoiceType = SaleInvoice::where('id', $saleInvoiceId)->value('invoice_type');
            if ($invoiceType === 'credit') {
                return 'credit_note';
            }
        }

        return 'cash_refund';
    }

    /**
     * Resolve the effective settlement mode for a Purchase Return.
     * If no mode is explicitly requested, auto-select 'credit_note' when the source PurchaseInvoice is a credit invoice.
     */
    public function resolvePurchaseSettlementMode(
        ?string $requestedMode,
        ?int $purchaseInvoiceId = null,
        ?string $fallbackMode = null
    ): string {
        if ($requestedMode && in_array($requestedMode, self::VALID_MODES, true)) {
            return $requestedMode;
        }

        if ($fallbackMode && in_array($fallbackMode, self::VALID_MODES, true)) {
            return $fallbackMode;
        }

        if ($purchaseInvoiceId && Schema::hasTable('purchase_invoices') && Schema::hasColumn('purchase_invoices', 'invoice_type')) {
            $invoiceType = PurchaseInvoice::where('id', $purchaseInvoiceId)->value('invoice_type');
            if ($invoiceType === 'credit') {
                return 'credit_note';
            }
        }

        return 'cash_refund';
    }

    /**
     * Safely persist settlement fields on SaleReturn if columns exist in schema.
     */
    protected function persistSaleReturnSettlementFields(SaleReturn $saleReturn, array $fields): void
    {
        $updates = [];
        foreach ($fields as $col => $val) {
            $saleReturn->{$col} = $val;
            if (Schema::hasColumn('sale_returns', $col)) {
                $updates[$col] = $val;
            }
        }
        if (!empty($updates)) {
            SaleReturn::where('id', $saleReturn->id)->update($updates);
        }
    }

    /**
     * Safely persist settlement fields on PurchaseReturn if columns exist in schema.
     */
    protected function persistPurchaseReturnSettlementFields(PurchaseReturn $purchaseReturn, array $fields): void
    {
        $updates = [];
        foreach ($fields as $col => $val) {
            $purchaseReturn->{$col} = $val;
            if (Schema::hasColumn('purchase_returns', $col)) {
                $updates[$col] = $val;
            }
        }
        if (!empty($updates)) {
            PurchaseReturn::where('id', $purchaseReturn->id)->update($updates);
        }
    }

    /**
     * Apply financial / ledger settlement when a Sale Return is created.
     */
    public function applySaleReturnSettlement(SaleReturn $saleReturn, ?User $user = null): void
    {
        DB::transaction(function () use ($saleReturn, $user) {
            $mode = $saleReturn->settlement_mode ?: 'cash_refund';
            $amount = round((float) ($saleReturn->total ?? 0), 2);

            if (in_array($mode, ['credit_note', 'invoice_offset'], true)) {
                $this->persistSaleReturnSettlementFields($saleReturn, [
                    'settlement_mode' => $mode,
                    'credited_amount' => $amount,
                    'account_id'      => null,
                ]);

                $this->syncCustomerLedgerForSaleReturn($saleReturn, $amount, $mode, $user);
                return;
            }

            // cash_refund mode
            $this->deleteCustomerLedgerForSaleReturn($saleReturn->id);

            $payMethod = $saleReturn->payment_method ?: 'cash';
            $resolvedAccountId = $saleReturn->account_id ? (int) $saleReturn->account_id : null;
            $account = null;

            if ($amount > 0) {
                $account = $this->accountService->resolveAccount($resolvedAccountId, $payMethod);

                if ($account) {
                    $resolvedAccountId = $account->id;

                    $this->accountService->withdraw(
                        $account,
                        $amount,
                        'sale_return',
                        $saleReturn->id,
                        "Customer refund for sale return #{$saleReturn->posted_number}",
                        $user
                    );
                }
            }

            $this->persistSaleReturnSettlementFields($saleReturn, [
                'settlement_mode' => 'cash_refund',
                'payment_method'  => $payMethod,
                'account_id'      => $resolvedAccountId,
                'credited_amount' => 0,
            ]);

            if ($amount > 0 && $this->accountService->isDefaultCashDrawerAccount($account, $payMethod)) {
                $this->cashDrawerService->handleSaleReturnCreation($saleReturn, $user);
            }
        });
    }

    /**
     * Synchronize financial / ledger settlement when a Sale Return is updated.
     */
    public function syncSaleReturnSettlementUpdate(
        SaleReturn $saleReturn,
        array $oldSnapshot,
        ?bool $updateDrawerIfPreShift = null,
        ?User $user = null
    ): void {
        DB::transaction(function () use ($saleReturn, $oldSnapshot, $updateDrawerIfPreShift, $user) {
            $oldMode = $oldSnapshot['settlement_mode'] ?? 'cash_refund';
            $oldPayMethod = $oldSnapshot['payment_method'] ?? 'cash';
            $oldTotal = round((float) ($oldSnapshot['total'] ?? 0), 2);

            $newMode = $saleReturn->settlement_mode ?: 'cash_refund';
            $newPayMethod = $saleReturn->payment_method ?: 'cash';
            $newTotal = round((float) ($saleReturn->total ?? 0), 2);

            $skipDrawerCash = ($updateDrawerIfPreShift === false)
                && $this->accountService->isPreShiftDocumentForOpenDrawer($saleReturn, 'sale_return', $user);

            // 1. Sync Financial Account transaction
            $existingAccTxn = Schema::hasTable('account_transactions')
                ? AccountTransaction::where('reference_type', 'sale_return')
                    ->where('reference_id', $saleReturn->id)
                    ->latest('id')
                    ->first()
                : null;

            $oldAccModel = $existingAccTxn
                ? Account::find($existingAccTxn->account_id)
                : ($oldMode === 'cash_refund' ? $this->accountService->resolveAccount(!empty($oldSnapshot['account_id']) ? (int) $oldSnapshot['account_id'] : null, $oldPayMethod) : null);
            $targetAccount = null;

            if ($newMode === 'cash_refund' && $newTotal > 0) {
                $explicitAccountId = ($newPayMethod !== $oldPayMethod && (int) ($saleReturn->account_id ?? 0) === (int) ($oldSnapshot['account_id'] ?? 0))
                    ? null
                    : ($saleReturn->account_id ? (int) $saleReturn->account_id : null);
                $targetAccount = $this->accountService->resolveAccount(
                    $explicitAccountId,
                    $newPayMethod
                );
                $resolvedAccountId = $targetAccount ? $targetAccount->id : $explicitAccountId;

                $dateStr = $saleReturn->date instanceof \Carbon\Carbon
                    ? $saleReturn->date->toDateString()
                    : (string) $saleReturn->date;

                if ($existingAccTxn) {
                    $oldAcc = Account::lockForUpdate()->find($existingAccTxn->account_id);
                    $isSameDefaultDrawer = $oldAcc && $targetAccount
                        && (int) $oldAcc->id === (int) $targetAccount->id
                        && $this->accountService->isDefaultCashDrawerAccount($targetAccount);

                    if (!($skipDrawerCash && $isSameDefaultDrawer)) {
                        if ($oldAcc && !($skipDrawerCash && $this->accountService->isDefaultCashDrawerAccount($oldAcc))) {
                            $oldAcc->current_balance = round((float) $oldAcc->current_balance + (float) $existingAccTxn->amount, 2);
                            $oldAcc->save();
                        }

                        if ($targetAccount) {
                            $lockedTarget = Account::lockForUpdate()->find($targetAccount->id);
                            if ($lockedTarget) {
                                if (!($skipDrawerCash && $this->accountService->isDefaultCashDrawerAccount($lockedTarget))) {
                                    $lockedTarget->current_balance = round((float) $lockedTarget->current_balance - $newTotal, 2);
                                    $lockedTarget->save();
                                }

                                $existingAccTxn->account_id = $lockedTarget->id;
                                $existingAccTxn->amount = $newTotal;
                                $existingAccTxn->balance_after = $lockedTarget->current_balance;
                                $existingAccTxn->transaction_date = $dateStr;
                                $existingAccTxn->description = "Customer refund for sale return #{$saleReturn->posted_number}";
                                $existingAccTxn->save();

                                $resolvedAccountId = $lockedTarget->id;
                            }
                        } else {
                            $existingAccTxn->delete();
                            $resolvedAccountId = null;
                        }
                    }
                } elseif ($targetAccount && !($skipDrawerCash && $this->accountService->isDefaultCashDrawerAccount($targetAccount))) {
                    $resolvedAccountId = $targetAccount->id;
                    $this->accountService->withdraw(
                        $targetAccount,
                        $newTotal,
                        'sale_return',
                        $saleReturn->id,
                        "Customer refund for sale return #{$saleReturn->posted_number}",
                        $user
                    );
                }

                $this->persistSaleReturnSettlementFields($saleReturn, [
                    'settlement_mode' => 'cash_refund',
                    'payment_method'  => $newPayMethod,
                    'account_id'      => $resolvedAccountId,
                    'credited_amount' => 0,
                ]);

                $this->deleteCustomerLedgerForSaleReturn($saleReturn->id);
            } else {
                // Switched to credit_note / invoice_offset or 0 total: unwind any previous account withdrawal
                if ($existingAccTxn) {
                    $oldAcc = Account::lockForUpdate()->find($existingAccTxn->account_id);
                    if ($oldAcc && !($skipDrawerCash && $this->accountService->isDefaultCashDrawerAccount($oldAcc))) {
                        $oldAcc->current_balance = round((float) $oldAcc->current_balance + (float) $existingAccTxn->amount, 2);
                        $oldAcc->save();
                    }
                    $existingAccTxn->delete();
                }

                $credited = in_array($newMode, ['credit_note', 'invoice_offset'], true) ? $newTotal : 0;
                $this->persistSaleReturnSettlementFields($saleReturn, [
                    'settlement_mode' => $newMode,
                    'account_id'      => null,
                    'credited_amount' => $credited,
                ]);

                if (in_array($newMode, ['credit_note', 'invoice_offset'], true)) {
                    $this->syncCustomerLedgerForSaleReturn($saleReturn, $newTotal, $newMode, $user);
                } else {
                    $this->deleteCustomerLedgerForSaleReturn($saleReturn->id);
                }
            }

            // 2. Sync Cash Drawer based on effective physical cash impact before vs after
            $oldIsDrawerCash = ($oldMode === 'cash_refund') && $this->accountService->isDefaultCashDrawerAccount($oldAccModel, $oldPayMethod);
            $newIsDrawerCash = ($newMode === 'cash_refund') && $this->accountService->isDefaultCashDrawerAccount($targetAccount, $newPayMethod);
            $oldCash = $oldIsDrawerCash ? $oldTotal : 0.0;
            $newCash = $newIsDrawerCash ? $newTotal : 0.0;

            if ($oldCash > 0 || $newCash > 0) {
                $this->cashDrawerService->syncSaleReturnUpdate(
                    $saleReturn,
                    $oldCash,
                    $newCash,
                    $updateDrawerIfPreShift,
                    $user
                );
            }
        });
    }

    /**
     * Revert financial / ledger settlement when a Sale Return is deleted or reversed.
     */
    public function revertSaleReturnSettlement(SaleReturn $saleReturn, ?User $user = null): void
    {
        DB::transaction(function () use ($saleReturn, $user) {
            $this->deleteCustomerLedgerForSaleReturn($saleReturn->id);

            $mode = $saleReturn->settlement_mode ?: 'cash_refund';
            $payMethod = $saleReturn->payment_method ?: 'cash';

            if ($mode === 'cash_refund') {
                if (Schema::hasTable('account_transactions')) {
                    $existingAccTxn = AccountTransaction::where('reference_type', 'sale_return')
                        ->where('reference_id', $saleReturn->id)
                        ->latest('id')
                        ->first();

                    if ($existingAccTxn) {
                        $acc = Account::lockForUpdate()->find($existingAccTxn->account_id);
                        if ($acc) {
                            $this->accountService->deposit(
                                $acc,
                                (float) $existingAccTxn->amount,
                                'sale_return_deletion',
                                $saleReturn->id,
                                "Recovery for deleted sale return #{$saleReturn->posted_number}",
                                $user
                            );
                        }
                    } elseif ((float) $saleReturn->total > 0) {
                        $acc = $this->accountService->resolveAccount(
                            $saleReturn->account_id ? (int) $saleReturn->account_id : null,
                            $payMethod
                        );
                        if ($acc) {
                            $this->accountService->deposit(
                                $acc,
                                (float) $saleReturn->total,
                                'sale_return_deletion',
                                $saleReturn->id,
                                "Recovery for deleted sale return #{$saleReturn->posted_number}",
                                $user
                            );
                        }
                    }
                }

                if ($payMethod === 'cash') {
                    $this->cashDrawerService->handleSaleReturnDeletion($saleReturn, $user);
                }
            }
        });
    }

    /**
     * Apply financial / ledger settlement when a Purchase Return is created.
     */
    public function applyPurchaseReturnSettlement(PurchaseReturn $purchaseReturn, ?User $user = null): void
    {
        DB::transaction(function () use ($purchaseReturn, $user) {
            $mode = $purchaseReturn->settlement_mode ?: 'cash_refund';
            $amount = round((float) ($purchaseReturn->total ?? 0), 2);

            if (in_array($mode, ['credit_note', 'invoice_offset'], true)) {
                $this->persistPurchaseReturnSettlementFields($purchaseReturn, [
                    'settlement_mode' => $mode,
                    'credited_amount' => $amount,
                    'account_id'      => null,
                ]);

                $this->syncSupplierLedgerForPurchaseReturn($purchaseReturn, $amount, $mode, $user);
                return;
            }

            // cash_refund mode
            $this->deleteSupplierLedgerForPurchaseReturn($purchaseReturn->id);

            $payMethod = $purchaseReturn->payment_method ?: 'cash';
            $resolvedAccountId = $purchaseReturn->account_id ? (int) $purchaseReturn->account_id : null;
            $account = null;

            if ($amount > 0) {
                $account = $this->accountService->resolveAccount($resolvedAccountId, $payMethod);

                if ($account) {
                    $resolvedAccountId = $account->id;

                    $this->accountService->deposit(
                        $account,
                        $amount,
                        'purchase_return',
                        $purchaseReturn->id,
                        "Supplier refund for purchase return #{$purchaseReturn->posted_number}",
                        $user
                    );
                }
            }

            $this->persistPurchaseReturnSettlementFields($purchaseReturn, [
                'settlement_mode' => 'cash_refund',
                'payment_method'  => $payMethod,
                'account_id'      => $resolvedAccountId,
                'credited_amount' => 0,
            ]);

            if ($amount > 0 && $this->accountService->isDefaultCashDrawerAccount($account, $payMethod)) {
                $this->cashDrawerService->handlePurchaseReturnCreation($purchaseReturn, $user);
            }
        });
    }

    /**
     * Synchronize financial / ledger settlement when a Purchase Return is updated.
     */
    public function syncPurchaseReturnSettlementUpdate(
        PurchaseReturn $purchaseReturn,
        array $oldSnapshot,
        ?bool $updateDrawerIfPreShift = null,
        ?User $user = null
    ): void {
        DB::transaction(function () use ($purchaseReturn, $oldSnapshot, $updateDrawerIfPreShift, $user) {
            $oldMode = $oldSnapshot['settlement_mode'] ?? 'cash_refund';
            $oldPayMethod = $oldSnapshot['payment_method'] ?? 'cash';
            $oldTotal = round((float) ($oldSnapshot['total'] ?? 0), 2);

            $newMode = $purchaseReturn->settlement_mode ?: 'cash_refund';
            $newPayMethod = $purchaseReturn->payment_method ?: 'cash';
            $newTotal = round((float) ($purchaseReturn->total ?? 0), 2);

            $skipDrawerCash = ($updateDrawerIfPreShift === false)
                && $this->accountService->isPreShiftDocumentForOpenDrawer($purchaseReturn, 'purchase_return', $user);

            // 1. Sync Financial Account transaction
            $existingAccTxn = Schema::hasTable('account_transactions')
                ? AccountTransaction::where('reference_type', 'purchase_return')
                    ->where('reference_id', $purchaseReturn->id)
                    ->latest('id')
                    ->first()
                : null;

            $oldAccModel = $existingAccTxn
                ? Account::find($existingAccTxn->account_id)
                : ($oldMode === 'cash_refund' ? $this->accountService->resolveAccount(!empty($oldSnapshot['account_id']) ? (int) $oldSnapshot['account_id'] : null, $oldPayMethod) : null);
            $targetAccount = null;

            if ($newMode === 'cash_refund' && $newTotal > 0) {
                $explicitAccountId = ($newPayMethod !== $oldPayMethod && (int) ($purchaseReturn->account_id ?? 0) === (int) ($oldSnapshot['account_id'] ?? 0))
                    ? null
                    : ($purchaseReturn->account_id ? (int) $purchaseReturn->account_id : null);
                $targetAccount = $this->accountService->resolveAccount(
                    $explicitAccountId,
                    $newPayMethod
                );
                $resolvedAccountId = $targetAccount ? $targetAccount->id : $explicitAccountId;

                $dateStr = $purchaseReturn->date instanceof \Carbon\Carbon
                    ? $purchaseReturn->date->toDateString()
                    : (string) $purchaseReturn->date;

                if ($existingAccTxn) {
                    $oldAcc = Account::lockForUpdate()->find($existingAccTxn->account_id);
                    $isSameDefaultDrawer = $oldAcc && $targetAccount
                        && (int) $oldAcc->id === (int) $targetAccount->id
                        && $this->accountService->isDefaultCashDrawerAccount($targetAccount);

                    if (!($skipDrawerCash && $isSameDefaultDrawer)) {
                        if ($oldAcc && !($skipDrawerCash && $this->accountService->isDefaultCashDrawerAccount($oldAcc))) {
                            $oldAcc->current_balance = round((float) $oldAcc->current_balance - (float) $existingAccTxn->amount, 2);
                            $oldAcc->save();
                        }

                        if ($targetAccount) {
                            $lockedTarget = Account::lockForUpdate()->find($targetAccount->id);
                            if ($lockedTarget) {
                                if (!($skipDrawerCash && $this->accountService->isDefaultCashDrawerAccount($lockedTarget))) {
                                    $lockedTarget->current_balance = round((float) $lockedTarget->current_balance + $newTotal, 2);
                                    $lockedTarget->save();
                                }

                                $existingAccTxn->account_id = $lockedTarget->id;
                                $existingAccTxn->amount = $newTotal;
                                $existingAccTxn->balance_after = $lockedTarget->current_balance;
                                $existingAccTxn->transaction_date = $dateStr;
                                $existingAccTxn->description = "Supplier refund for purchase return #{$purchaseReturn->posted_number}";
                                $existingAccTxn->save();

                                $resolvedAccountId = $lockedTarget->id;
                            }
                        } else {
                            $existingAccTxn->delete();
                            $resolvedAccountId = null;
                        }
                    }
                } elseif ($targetAccount && !($skipDrawerCash && $this->accountService->isDefaultCashDrawerAccount($targetAccount))) {
                    $resolvedAccountId = $targetAccount->id;
                    $this->accountService->deposit(
                        $targetAccount,
                        $newTotal,
                        'purchase_return',
                        $purchaseReturn->id,
                        "Supplier refund for purchase return #{$purchaseReturn->posted_number}",
                        $user
                    );
                }

                $this->persistPurchaseReturnSettlementFields($purchaseReturn, [
                    'settlement_mode' => 'cash_refund',
                    'payment_method'  => $newPayMethod,
                    'account_id'      => $resolvedAccountId,
                    'credited_amount' => 0,
                ]);

                $this->deleteSupplierLedgerForPurchaseReturn($purchaseReturn->id);
            } else {
                // Switched to credit_note / invoice_offset or 0 total: unwind any previous account deposit
                if ($existingAccTxn) {
                    $oldAcc = Account::lockForUpdate()->find($existingAccTxn->account_id);
                    if ($oldAcc && !($skipDrawerCash && $this->accountService->isDefaultCashDrawerAccount($oldAcc))) {
                        $oldAcc->current_balance = round((float) $oldAcc->current_balance - (float) $existingAccTxn->amount, 2);
                        $oldAcc->save();
                    }
                    $existingAccTxn->delete();
                }

                $credited = in_array($newMode, ['credit_note', 'invoice_offset'], true) ? $newTotal : 0;
                $this->persistPurchaseReturnSettlementFields($purchaseReturn, [
                    'settlement_mode' => $newMode,
                    'account_id'      => null,
                    'credited_amount' => $credited,
                ]);

                if (in_array($newMode, ['credit_note', 'invoice_offset'], true)) {
                    $this->syncSupplierLedgerForPurchaseReturn($purchaseReturn, $newTotal, $newMode, $user);
                } else {
                    $this->deleteSupplierLedgerForPurchaseReturn($purchaseReturn->id);
                }
            }

            // 2. Sync Cash Drawer based on effective physical cash impact before vs after
            $oldIsDrawerCash = ($oldMode === 'cash_refund') && $this->accountService->isDefaultCashDrawerAccount($oldAccModel, $oldPayMethod);
            $newIsDrawerCash = ($newMode === 'cash_refund') && $this->accountService->isDefaultCashDrawerAccount($targetAccount, $newPayMethod);
            $oldCash = $oldIsDrawerCash ? $oldTotal : 0.0;
            $newCash = $newIsDrawerCash ? $newTotal : 0.0;

            if ($oldCash > 0 || $newCash > 0) {
                $this->cashDrawerService->syncPurchaseReturnUpdate(
                    $purchaseReturn,
                    $oldCash,
                    $newCash,
                    $updateDrawerIfPreShift,
                    $user
                );
            }
        });
    }

    /**
     * Revert financial / ledger settlement when a Purchase Return is deleted or reversed.
     */
    public function revertPurchaseReturnSettlement(PurchaseReturn $purchaseReturn, ?User $user = null): void
    {
        DB::transaction(function () use ($purchaseReturn, $user) {
            $this->deleteSupplierLedgerForPurchaseReturn($purchaseReturn->id);

            $mode = $purchaseReturn->settlement_mode ?: 'cash_refund';
            $payMethod = $purchaseReturn->payment_method ?: 'cash';

            if ($mode === 'cash_refund') {
                if (Schema::hasTable('account_transactions')) {
                    $existingAccTxn = AccountTransaction::where('reference_type', 'purchase_return')
                        ->where('reference_id', $purchaseReturn->id)
                        ->latest('id')
                        ->first();

                    if ($existingAccTxn) {
                        $acc = Account::lockForUpdate()->find($existingAccTxn->account_id);
                        if ($acc) {
                            $this->accountService->withdraw(
                                $acc,
                                (float) $existingAccTxn->amount,
                                'purchase_return_deletion',
                                $purchaseReturn->id,
                                "Reversal for deleted purchase return #{$purchaseReturn->posted_number}",
                                $user
                            );
                        }
                    } elseif ((float) $purchaseReturn->total > 0) {
                        $acc = $this->accountService->resolveAccount(
                            $purchaseReturn->account_id ? (int) $purchaseReturn->account_id : null,
                            $payMethod
                        );
                        if ($acc) {
                            $this->accountService->withdraw(
                                $acc,
                                (float) $purchaseReturn->total,
                                'purchase_return_deletion',
                                $purchaseReturn->id,
                                "Reversal for deleted purchase return #{$purchaseReturn->posted_number}",
                                $user
                            );
                        }
                    }
                }

                if ($payMethod === 'cash') {
                    $this->cashDrawerService->handlePurchaseReturnDeletion($purchaseReturn, $user);
                }
            }
        });
    }

    protected function deleteCustomerLedgerForSaleReturn(int $saleReturnId): void
    {
        $this->deleteSaleReturnCreditPayment($saleReturnId);
        if (Schema::hasTable('customer_ledgers') && Schema::hasColumn('customer_ledgers', 'sale_return_id')) {
            CustomerLedger::where('sale_return_id', $saleReturnId)->delete();
        }
    }

    protected function deleteSupplierLedgerForPurchaseReturn(int $purchaseReturnId): void
    {
        $this->deletePurchaseReturnCreditPayment($purchaseReturnId);
        if (Schema::hasTable('supplier_ledgers') && Schema::hasColumn('supplier_ledgers', 'purchase_return_id')) {
            SupplierLedger::where('purchase_return_id', $purchaseReturnId)->delete();
        }
    }

    /**
     * Create or update the CustomerLedger credit entry for a non-cash Sale Return.
     */
    protected function syncCustomerLedgerForSaleReturn(
        SaleReturn $saleReturn,
        float $amount,
        string $mode,
        ?User $user = null
    ): void {
        if ($amount <= 0) {
            $this->deleteCustomerLedgerForSaleReturn($saleReturn->id);
            return;
        }

        $payment = $this->syncSaleReturnCreditPayment($saleReturn, $amount, $mode, $user);

        if (!Schema::hasTable('customer_ledgers') || !Schema::hasColumn('customer_ledgers', 'sale_return_id')) {
            return;
        }

        $invPosted = null;
        if ($saleReturn->sale_invoice_id) {
            $invPosted = $saleReturn->relationLoaded('saleInvoice')
                ? $saleReturn->saleInvoice?->posted_number
                : SaleInvoice::where('id', $saleReturn->sale_invoice_id)->value('posted_number');
        }

        $label = $mode === 'invoice_offset' ? 'Invoice Offset' : 'Credit Note';
        $description = "{$label} - Sale Return #{$saleReturn->posted_number}" . ($invPosted ? " (Inv #{$invPosted})" : '');
        $entryDate = $saleReturn->date instanceof \Carbon\Carbon
            ? $saleReturn->date->toDateString()
            : (string) $saleReturn->date;

        $attrs = [
            'customer_id'       => $saleReturn->customer_id,
            'sale_invoice_id'   => null,
            'entry_type'        => 'payment',
            'is_manual'         => false,
            'entry_date'        => $entryDate,
            'posted_number'     => $saleReturn->posted_number,
            'invoice_total'     => 0,
            'total_received'    => 0,
            'balance_remaining' => 0,
            'credited_amount'   => $amount,
            'payment_ref'       => $saleReturn->posted_number,
            'description'       => $description,
            'created_by'        => $user?->id ?? $saleReturn->user_id,
        ];
        if ($payment && Schema::hasColumn('customer_ledgers', 'payment_id')) {
            $attrs['payment_id'] = $payment->id;
        }

        CustomerLedger::updateOrCreate(
            ['sale_return_id' => $saleReturn->id],
            $attrs
        );
    }

    /**
     * Create or update the SupplierLedger debit entry for a non-cash Purchase Return.
     */
    protected function syncSupplierLedgerForPurchaseReturn(
        PurchaseReturn $purchaseReturn,
        float $amount,
        string $mode,
        ?User $user = null
    ): void {
        if ($amount <= 0) {
            $this->deleteSupplierLedgerForPurchaseReturn($purchaseReturn->id);
            return;
        }

        $payment = $this->syncPurchaseReturnCreditPayment($purchaseReturn, $amount, $mode, $user);

        if (!Schema::hasTable('supplier_ledgers') || !Schema::hasColumn('supplier_ledgers', 'purchase_return_id')) {
            return;
        }

        $invPosted = null;
        $invNumber = null;
        if ($purchaseReturn->purchase_invoice_id) {
            $inv = $purchaseReturn->relationLoaded('purchaseInvoice')
                ? $purchaseReturn->purchaseInvoice
                : PurchaseInvoice::select('id', 'posted_number', 'invoice_number')->find($purchaseReturn->purchase_invoice_id);
            $invPosted = $inv?->posted_number;
            $invNumber = $inv?->invoice_number;
        }

        $label = $mode === 'invoice_offset' ? 'Invoice Offset' : 'Debit Note';
        $description = "{$label} - Purchase Return #{$purchaseReturn->posted_number}" . ($invPosted ? " (Inv #{$invPosted})" : '');
        $entryDate = $purchaseReturn->date instanceof \Carbon\Carbon
            ? $purchaseReturn->date->toDateString()
            : (string) $purchaseReturn->date;

        $attrs = [
            'supplier_id'         => $purchaseReturn->supplier_id,
            'purchase_invoice_id' => null,
            'entry_type'          => 'payment',
            'is_manual'           => false,
            'entry_date'          => $entryDate,
            'posted_number'       => $purchaseReturn->posted_number,
            'invoice_number'      => $invNumber,
            'invoice_total'       => 0,
            'total_paid'          => 0,
            'debited_amount'      => $amount,
            'credit_remaining'    => 0,
            'payment_ref'         => $purchaseReturn->posted_number,
            'description'         => $description,
            'created_by'          => $user?->id,
        ];
        if ($payment && Schema::hasColumn('supplier_ledgers', 'payment_id')) {
            $attrs['payment_id'] = $payment->id;
        }

        SupplierLedger::updateOrCreate(
            ['purchase_return_id' => $purchaseReturn->id],
            $attrs
        );
    }

    /**
     * Synchronize a Credit Note Payment record for a SaleReturn so its balance can be allocated to open SaleInvoices.
     */
    public function syncSaleReturnCreditPayment(
        SaleReturn $saleReturn,
        float $amount,
        string $mode = 'credit_note',
        ?User $user = null
    ): ?Payment {
        if (!Schema::hasTable('payments') || !Schema::hasTable('payment_allocations') || !$saleReturn->customer_id) {
            return null;
        }

        $amount = round($amount, 2);
        if ($amount <= 0) {
            $this->deleteSaleReturnCreditPayment($saleReturn->id);
            return null;
        }

        $idempotencyKey = "sale_return:{$saleReturn->id}";
        $entryDate = $saleReturn->date instanceof \Carbon\Carbon
            ? $saleReturn->date->toDateString()
            : ((string) ($saleReturn->date ?: now()->toDateString()));

        $payment = Payment::where('idempotency_key', $idempotencyKey)->first();
        if (!$payment) {
            $baseNo = 'CN-' . ($saleReturn->posted_number ?: ('SR-' . str_pad((string) $saleReturn->id, 4, '0', STR_PAD_LEFT)));
            $paymentNumber = Payment::where('payment_number', $baseNo)->exists()
                ? "{$baseNo}-{$saleReturn->id}"
                : $baseNo;

            $payment = Payment::create([
                'payment_number'   => $paymentNumber,
                'party_type'       => 'customer',
                'party_id'         => $saleReturn->customer_id,
                'payment_date'     => $entryDate,
                'amount'           => $amount,
                'allocated_amount' => 0,
                'unapplied_amount' => $amount,
                'payment_method'   => 'credit_note',
                'reference'        => $saleReturn->posted_number,
                'status'           => 'posted',
                'notes'            => "Credit Note from Sale Return #{$saleReturn->posted_number}",
                'idempotency_key'  => $idempotencyKey,
                'created_by_id'    => $user?->id ?? $saleReturn->user_id,
            ]);
        }

        // Detach existing auto-allocations if mode switched away from invoice_offset or invoice/customer changed
        $existingAllocs = PaymentAllocation::where('payment_id', $payment->id)->orderByDesc('id')->get();
        if ($mode !== 'invoice_offset' || (int) $payment->party_id !== (int) $saleReturn->customer_id) {
            foreach ($existingAllocs as $alloc) {
                if ($alloc->invoice_type === 'sale_invoice') {
                    $inv = SaleInvoice::lockForUpdate()->find($alloc->invoice_id);
                    if ($inv) {
                        $inv->total_receive = round(max((float) ($inv->total_receive ?? 0) - (float) $alloc->amount, 0), 2);
                        $inv->save();
                    }
                }
                $alloc->delete();
            }
            $existingAllocs = collect();
        } elseif ($saleReturn->sale_invoice_id) {
            foreach ($existingAllocs as $alloc) {
                if ($alloc->invoice_type === 'sale_invoice' && (int) $alloc->invoice_id !== (int) $saleReturn->sale_invoice_id) {
                    $inv = SaleInvoice::lockForUpdate()->find($alloc->invoice_id);
                    if ($inv) {
                        $inv->total_receive = round(max((float) ($inv->total_receive ?? 0) - (float) $alloc->amount, 0), 2);
                        $inv->save();
                    }
                    $alloc->delete();
                }
            }
            $existingAllocs = PaymentAllocation::where('payment_id', $payment->id)->orderByDesc('id')->get();
        }

        // Trim existing allocations if return amount decreased
        $allocatedSum = round((float) $existingAllocs->sum('amount'), 2);

        if ($allocatedSum > $amount) {
            $excessToTrim = round($allocatedSum - $amount, 2);
            foreach ($existingAllocs as $alloc) {
                if ($excessToTrim <= 0) break;
                $reduceBy = min((float) $alloc->amount, $excessToTrim);
                if ($reduceBy > 0) {
                    $inv = SaleInvoice::find($alloc->invoice_id);
                    if ($inv) {
                        $inv->total_receive = round(max((float) ($inv->total_receive ?? 0) - $reduceBy, 0), 2);
                        $inv->save();
                    }
                    $newAllocAmt = round((float) $alloc->amount - $reduceBy, 2);
                    if ($newAllocAmt <= 0.001) {
                        $alloc->delete();
                    } else {
                        $alloc->amount = $newAllocAmt;
                        $alloc->save();
                    }
                    $excessToTrim = round($excessToTrim - $reduceBy, 2);
                }
            }
            $allocatedSum = round((float) PaymentAllocation::where('payment_id', $payment->id)->sum('amount'), 2);
        }

        // If mode is invoice_offset and linked to an open SaleInvoice, auto-allocate remaining credit to that invoice
        if ($mode === 'invoice_offset' && $saleReturn->sale_invoice_id && $allocatedSum < $amount) {
            $linkedInv = SaleInvoice::lockForUpdate()->find($saleReturn->sale_invoice_id);
            if ($linkedInv && (int) $linkedInv->customer_id === (int) $saleReturn->customer_id && ($linkedInv->status ?? 'posted') !== 'reversed') {
                $invTotal = (float) ($linkedInv->total ?? 0);
                $invReceived = (float) ($linkedInv->total_receive ?? $linkedInv->total_recieve ?? 0);
                $invDue = round(max($invTotal - $invReceived, 0), 2);
                $toAutoAlloc = round(min($amount - $allocatedSum, $invDue), 2);

                if ($toAutoAlloc > 0) {
                    $existingAlloc = PaymentAllocation::where('payment_id', $payment->id)
                        ->where('invoice_type', 'sale_invoice')
                        ->where('invoice_id', $linkedInv->id)
                        ->first();
                    if ($existingAlloc) {
                        $existingAlloc->amount = round((float) $existingAlloc->amount + $toAutoAlloc, 2);
                        $existingAlloc->save();
                    } else {
                        PaymentAllocation::create([
                            'payment_id'   => $payment->id,
                            'invoice_type' => 'sale_invoice',
                            'invoice_id'   => $linkedInv->id,
                            'amount'       => $toAutoAlloc,
                        ]);
                    }
                    $linkedInv->total_receive = round($invReceived + $toAutoAlloc, 2);
                    $linkedInv->save();
                    $allocatedSum = round($allocatedSum + $toAutoAlloc, 2);
                }
            }
        }

        $payment->update([
            'party_id'         => $saleReturn->customer_id,
            'payment_date'     => $entryDate,
            'amount'           => $amount,
            'allocated_amount' => $allocatedSum,
            'unapplied_amount' => round(max($amount - $allocatedSum, 0), 2),
            'payment_method'   => 'credit_note',
            'reference'        => $saleReturn->posted_number,
            'status'           => 'posted',
            'notes'            => "Credit Note from Sale Return #{$saleReturn->posted_number}",
        ]);

        return $payment;
    }

    protected function deleteSaleReturnCreditPayment(int $saleReturnId): void
    {
        if (!Schema::hasTable('payments') || !Schema::hasTable('payment_allocations')) {
            return;
        }

        $payment = Payment::where('idempotency_key', "sale_return:{$saleReturnId}")
            ->with('allocations')
            ->first();

        if (!$payment) {
            return;
        }

        foreach ($payment->allocations as $alloc) {
            if ($alloc->invoice_type === 'sale_invoice') {
                $inv = SaleInvoice::find($alloc->invoice_id);
                if ($inv) {
                    $inv->total_receive = round(max((float) ($inv->total_receive ?? 0) - (float) $alloc->amount, 0), 2);
                    $inv->save();
                }
            }
        }

        $payment->allocations()->delete();
        $payment->delete();
    }

    /**
     * Synchronize a Debit Note Payment record for a PurchaseReturn so its balance can be allocated to open PurchaseInvoices.
     */
    public function syncPurchaseReturnCreditPayment(
        PurchaseReturn $purchaseReturn,
        float $amount,
        string $mode = 'credit_note',
        ?User $user = null
    ): ?Payment {
        if (!Schema::hasTable('payments') || !Schema::hasTable('payment_allocations') || !$purchaseReturn->supplier_id) {
            return null;
        }

        $amount = round($amount, 2);
        if ($amount <= 0) {
            $this->deletePurchaseReturnCreditPayment($purchaseReturn->id);
            return null;
        }

        $idempotencyKey = "purchase_return:{$purchaseReturn->id}";
        $entryDate = $purchaseReturn->date instanceof \Carbon\Carbon
            ? $purchaseReturn->date->toDateString()
            : ((string) ($purchaseReturn->date ?: now()->toDateString()));

        $payment = Payment::where('idempotency_key', $idempotencyKey)->first();
        if (!$payment) {
            $baseNo = 'DN-' . ($purchaseReturn->posted_number ?: ('PR-' . str_pad((string) $purchaseReturn->id, 4, '0', STR_PAD_LEFT)));
            $paymentNumber = Payment::where('payment_number', $baseNo)->exists()
                ? "{$baseNo}-{$purchaseReturn->id}"
                : $baseNo;

            $payment = Payment::create([
                'payment_number'   => $paymentNumber,
                'party_type'       => 'supplier',
                'party_id'         => $purchaseReturn->supplier_id,
                'payment_date'     => $entryDate,
                'amount'           => $amount,
                'allocated_amount' => 0,
                'unapplied_amount' => $amount,
                'payment_method'   => 'credit_note',
                'reference'        => $purchaseReturn->posted_number,
                'status'           => 'posted',
                'notes'            => "Debit Note from Purchase Return #{$purchaseReturn->posted_number}",
                'idempotency_key'  => $idempotencyKey,
                'created_by_id'    => $user?->id,
            ]);
        }

        $existingAllocs = PaymentAllocation::where('payment_id', $payment->id)->orderByDesc('id')->get();
        if ($mode !== 'invoice_offset' || (int) $payment->party_id !== (int) $purchaseReturn->supplier_id) {
            foreach ($existingAllocs as $alloc) {
                if ($alloc->invoice_type === 'purchase_invoice') {
                    $inv = PurchaseInvoice::lockForUpdate()->find($alloc->invoice_id);
                    if ($inv) {
                        $inv->total_paid = round(max((float) ($inv->total_paid ?? 0) - (float) $alloc->amount, 0), 2);
                        $inv->save();
                    }
                }
                $alloc->delete();
            }
            $existingAllocs = collect();
        } elseif ($purchaseReturn->purchase_invoice_id) {
            foreach ($existingAllocs as $alloc) {
                if ($alloc->invoice_type === 'purchase_invoice' && (int) $alloc->invoice_id !== (int) $purchaseReturn->purchase_invoice_id) {
                    $inv = PurchaseInvoice::lockForUpdate()->find($alloc->invoice_id);
                    if ($inv) {
                        $inv->total_paid = round(max((float) ($inv->total_paid ?? 0) - (float) $alloc->amount, 0), 2);
                        $inv->save();
                    }
                    $alloc->delete();
                }
            }
            $existingAllocs = PaymentAllocation::where('payment_id', $payment->id)->orderByDesc('id')->get();
        }

        $allocatedSum = round((float) $existingAllocs->sum('amount'), 2);

        if ($allocatedSum > $amount) {
            $excessToTrim = round($allocatedSum - $amount, 2);
            foreach ($existingAllocs as $alloc) {
                if ($excessToTrim <= 0) break;
                $reduceBy = min((float) $alloc->amount, $excessToTrim);
                if ($reduceBy > 0) {
                    $inv = PurchaseInvoice::find($alloc->invoice_id);
                    if ($inv) {
                        $inv->total_paid = round(max((float) ($inv->total_paid ?? 0) - $reduceBy, 0), 2);
                        $inv->save();
                    }
                    $newAllocAmt = round((float) $alloc->amount - $reduceBy, 2);
                    if ($newAllocAmt <= 0.001) {
                        $alloc->delete();
                    } else {
                        $alloc->amount = $newAllocAmt;
                        $alloc->save();
                    }
                    $excessToTrim = round($excessToTrim - $reduceBy, 2);
                }
            }
            $allocatedSum = round((float) PaymentAllocation::where('payment_id', $payment->id)->sum('amount'), 2);
        }

        if ($mode === 'invoice_offset' && $purchaseReturn->purchase_invoice_id && $allocatedSum < $amount) {
            $linkedInv = PurchaseInvoice::lockForUpdate()->find($purchaseReturn->purchase_invoice_id);
            if ($linkedInv && (int) $linkedInv->supplier_id === (int) $purchaseReturn->supplier_id && ($linkedInv->status ?? 'posted') !== 'reversed') {
                $invTotal = (float) ($linkedInv->total_amount ?? 0);
                $invPaid = (float) ($linkedInv->total_paid ?? 0);
                $invDue = round(max($invTotal - $invPaid, 0), 2);
                $toAutoAlloc = round(min($amount - $allocatedSum, $invDue), 2);

                if ($toAutoAlloc > 0) {
                    $existingAlloc = PaymentAllocation::where('payment_id', $payment->id)
                        ->where('invoice_type', 'purchase_invoice')
                        ->where('invoice_id', $linkedInv->id)
                        ->first();
                    if ($existingAlloc) {
                        $existingAlloc->amount = round((float) $existingAlloc->amount + $toAutoAlloc, 2);
                        $existingAlloc->save();
                    } else {
                        PaymentAllocation::create([
                            'payment_id'   => $payment->id,
                            'invoice_type' => 'purchase_invoice',
                            'invoice_id'   => $linkedInv->id,
                            'amount'       => $toAutoAlloc,
                        ]);
                    }
                    $linkedInv->total_paid = round($invPaid + $toAutoAlloc, 2);
                    $linkedInv->save();
                    $allocatedSum = round($allocatedSum + $toAutoAlloc, 2);
                }
            }
        }

        $payment->update([
            'party_id'         => $purchaseReturn->supplier_id,
            'payment_date'     => $entryDate,
            'amount'           => $amount,
            'allocated_amount' => $allocatedSum,
            'unapplied_amount' => round(max($amount - $allocatedSum, 0), 2),
            'payment_method'   => 'credit_note',
            'reference'        => $purchaseReturn->posted_number,
            'status'           => 'posted',
            'notes'            => "Debit Note from Purchase Return #{$purchaseReturn->posted_number}",
        ]);

        return $payment;
    }

    protected function deletePurchaseReturnCreditPayment(int $purchaseReturnId): void
    {
        if (!Schema::hasTable('payments') || !Schema::hasTable('payment_allocations')) {
            return;
        }

        $payment = Payment::where('idempotency_key', "purchase_return:{$purchaseReturnId}")
            ->with('allocations')
            ->first();

        if (!$payment) {
            return;
        }

        foreach ($payment->allocations as $alloc) {
            if ($alloc->invoice_type === 'purchase_invoice') {
                $inv = PurchaseInvoice::find($alloc->invoice_id);
                if ($inv) {
                    $inv->total_paid = round(max((float) ($inv->total_paid ?? 0) - (float) $alloc->amount, 0), 2);
                    $inv->save();
                }
            }
        }

        $payment->allocations()->delete();
        $payment->delete();
    }
}
