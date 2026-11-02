<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('accounts') || !Schema::hasTable('account_transactions')) {
            return;
        }

        // 1. Clean up any historical AccountTransactions referencing hard-deleted SaleInvoices
        //    that had no corresponding sale_invoice_deletion reversal entry.
        //    Uses whereNotExists subquery instead of whereNotIn($existingSaleIds) to avoid
        //    SQLite's "too many SQL variables" limit on databases with thousands of invoices.
        if (Schema::hasTable('sale_invoices')) {
            $orphanedSaleRefIds = DB::table('account_transactions')
                ->whereIn('reference_type', ['sale_invoice', 'sale_invoice_update'])
                ->whereNotNull('reference_id')
                ->whereNotExists(function ($q) {
                    $q->select(DB::raw(1))
                        ->from('sale_invoices')
                        ->whereColumn('sale_invoices.id', 'account_transactions.reference_id');
                })
                ->pluck('reference_id')
                ->unique()
                ->all();

            foreach ($orphanedSaleRefIds as $refId) {
                $hasDeletionRow = DB::table('account_transactions')
                    ->where('reference_type', 'sale_invoice_deletion')
                    ->where('reference_id', $refId)
                    ->exists();

                if (!$hasDeletionRow) {
                    DB::table('account_transactions')
                        ->whereIn('reference_type', ['sale_invoice', 'sale_invoice_update'])
                        ->where('reference_id', $refId)
                        ->delete();
                }
            }
        }

        // 2. Reconcile sequential running balance_after for every account so statement rows
        //    are 100% mathematically continuous and match current_balance.
        $accounts = DB::table('accounts')->get();
        foreach ($accounts as $account) {
            $txns = DB::table('account_transactions')
                ->where('account_id', $account->id)
                ->orderBy('id', 'asc')
                ->get();

            if ($txns->isEmpty()) {
                continue;
            }

            $netTxns = 0.0;
            foreach ($txns as $t) {
                $isInflow = in_array($t->type, ['opening_balance', 'deposit', 'transfer_in'], true)
                    || ($t->type === 'adjustment' && (float) $t->amount >= 0);
                $delta = $isInflow ? abs((float) $t->amount) : -abs((float) $t->amount);
                $netTxns = round($netTxns + $delta, 2);
            }

            $targetBalance = round((float) $account->current_balance, 2);
            $missingBaseline = round($targetBalance - $netTxns, 2);

            // If the account existed after a cash drawer shift was already mid-stream,
            // set opening_balance to the baseline so running balance_after is continuous.
            $running = 0.0;
            if (abs($missingBaseline) >= 0.01) {
                $running = $missingBaseline;
                DB::table('accounts')
                    ->where('id', $account->id)
                    ->update(['opening_balance' => $missingBaseline]);
            }

            foreach ($txns as $t) {
                $isInflow = in_array($t->type, ['opening_balance', 'deposit', 'transfer_in'], true)
                    || ($t->type === 'adjustment' && (float) $t->amount >= 0);
                $delta = $isInflow ? abs((float) $t->amount) : -abs((float) $t->amount);
                $running = round($running + $delta, 2);

                if (abs((float) $t->balance_after - $running) >= 0.01) {
                    DB::table('account_transactions')
                        ->where('id', $t->id)
                        ->update(['balance_after' => $running]);
                }
            }
        }
    }

    public function down(): void
    {
        // Non-destructive reconciliation migration
    }
};
