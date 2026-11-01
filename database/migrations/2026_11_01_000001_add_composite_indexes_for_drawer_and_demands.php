<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Add composite indexes for Cash Drawer, Accounts, User Demands, and Expenses
     * to accelerate Topbar status polling, shift summaries, and notification queries.
     */
    public function up(): void
    {
        $indexSpecs = [
            'cash_drawer_sessions' => [
                'idx_cds_status_user_opened' => ['status', 'user_id', 'opened_at'],
                'idx_cds_status_closed'      => ['status', 'closed_at'],
            ],
            'cash_drawer_transactions' => [
                'idx_cdt_session_type'       => ['session_id', 'type'],
                'idx_cdt_session_ref'        => ['session_id', 'reference_type', 'reference_id'],
            ],
            'accounts' => [
                'idx_accounts_active_type_def' => ['is_active', 'type', 'is_default'],
            ],
            'account_transactions' => [
                'idx_at_account_date'        => ['account_id', 'transaction_date'],
            ],
            'user_demands' => [
                'idx_ud_status_date'         => ['status', 'date'],
                'idx_ud_product_status'      => ['product_id', 'status'],
            ],
            'expenses' => [
                'idx_expenses_date'          => ['expense_date'],
                'idx_expenses_category_id'   => ['category_id'],
            ],
        ];

        foreach ($indexSpecs as $table => $indexes) {
            if (!Schema::hasTable($table)) {
                continue;
            }

            $existingColumns = array_flip(Schema::getColumnListing($table));
            $existingIndexes = [];
            try {
                foreach (Schema::getIndexes($table) as $idx) {
                    if (!empty($idx['name'])) {
                        $existingIndexes[strtolower($idx['name'])] = true;
                    }
                }
            } catch (\Throwable) {
                // Fallback if driver does not support getIndexes()
            }

            foreach ($indexes as $indexName => $columns) {
                if (isset($existingIndexes[strtolower($indexName)])) {
                    continue;
                }

                $allColumnsExist = true;
                foreach ($columns as $col) {
                    if (!isset($existingColumns[$col])) {
                        $allColumnsExist = false;
                        break;
                    }
                }
                if (!$allColumnsExist) {
                    continue;
                }

                try {
                    Schema::table($table, function (Blueprint $blueprint) use ($columns, $indexName) {
                        $blueprint->index($columns, $indexName);
                    });
                } catch (\Throwable) {
                    // Ignore duplicate index errors
                }
            }
        }
    }

    public function down(): void
    {
        // Indexes can remain safely or be dropped with tables
    }
};

