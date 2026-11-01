<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('accounts')) {
            return;
        }

        // 1. Ensure the primary Cash in Hand (Drawer) account has standard code/icon/color metadata
        $cashUpdates = [
            'is_default' => true,
            'is_active'  => true,
        ];
        if (Schema::hasColumn('accounts', 'code')) {
            $cashUpdates['code'] = 'cash_drawer';
        }
        if (Schema::hasColumn('accounts', 'icon')) {
            $cashUpdates['icon'] = 'drawer';
        }
        if (Schema::hasColumn('accounts', 'color')) {
            $cashUpdates['color'] = '#10b981';
        }

        DB::table('accounts')
            ->where('type', 'cash')
            ->where('name', 'Cash in Hand (Drawer)')
            ->update($cashUpdates);

        // 2. Unmark non-cash accounts from being system defaults so users can freely edit/delete them
        DB::table('accounts')
            ->where('type', '!=', 'cash')
            ->update(['is_default' => false]);

        // 3. Remove legacy auto-seeded non-cash accounts that have 0 balance
        $legacyAutoSeededNames = [
            'Main Bank Account',
            'Card / POS Terminal',
            'Mobile Wallet (JazzCash / EasyPaisa)',
            'Other Payment Account',
        ];

        $legacyZeroAccounts = DB::table('accounts')
            ->where('type', '!=', 'cash')
            ->whereIn('name', $legacyAutoSeededNames)
            ->whereRaw('ABS(COALESCE(current_balance, 0)) < 0.01')
            ->pluck('id')
            ->all();

        if (!empty($legacyZeroAccounts)) {
            foreach (['sale_invoices', 'purchase_invoices', 'payments', 'sale_returns', 'purchase_returns', 'expenses'] as $tbl) {
                if (Schema::hasTable($tbl) && Schema::hasColumn($tbl, 'account_id')) {
                    DB::table($tbl)->whereIn('account_id', $legacyZeroAccounts)->update(['account_id' => null]);
                }
            }

            if (Schema::hasTable('account_transactions')) {
                DB::table('account_transactions')->whereIn('account_id', $legacyZeroAccounts)->delete();
            }

            DB::table('accounts')->whereIn('id', $legacyZeroAccounts)->delete();
        }
    }

    public function down(): void
    {
        // Non-destructive cleanup migration
    }
};

