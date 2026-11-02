<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('sale_returns') && !Schema::hasColumn('sale_returns', 'remarks')) {
            Schema::table('sale_returns', function (Blueprint $table) {
                $table->text('remarks')->nullable()->after('date');
            });
        }
        if (Schema::hasTable('purchase_returns') && !Schema::hasColumn('purchase_returns', 'remarks')) {
            Schema::table('purchase_returns', function (Blueprint $table) {
                $table->text('remarks')->nullable()->after('date');
            });
        }

        $this->addIndexSafely('sale_invoices', ['customer_id', 'date'], 'idx_sale_invoices_customer_date');
        $this->addIndexSafely('sale_invoices', ['status', 'date'], 'idx_sale_invoices_status_date');
        $this->addIndexSafely('purchase_invoices', ['supplier_id', 'posted_date'], 'idx_purchase_invoices_supplier_date');
        $this->addIndexSafely('purchase_invoices', ['status', 'posted_date'], 'idx_purchase_invoices_status_date');
        $this->addIndexSafely('customer_ledgers', ['customer_id', 'entry_type', 'entry_date'], 'idx_customer_ledgers_cust_type_date');
        $this->addIndexSafely('supplier_ledgers', ['supplier_id', 'entry_type', 'entry_date'], 'idx_supplier_ledgers_supp_type_date');
        $this->addIndexSafely('batches', ['product_id', 'expiry_date'], 'idx_batches_product_expiry');
        $this->addIndexSafely('sale_returns', ['sale_invoice_id'], 'idx_sale_returns_sale_invoice_id');
        $this->addIndexSafely('purchase_returns', ['purchase_invoice_id'], 'idx_purchase_returns_purchase_invoice_id');
    }

    public function down(): void
    {
        $this->dropIndexSafely('sale_invoices', 'idx_sale_invoices_customer_date');
        $this->dropIndexSafely('sale_invoices', 'idx_sale_invoices_status_date');
        $this->dropIndexSafely('purchase_invoices', 'idx_purchase_invoices_supplier_date');
        $this->dropIndexSafely('purchase_invoices', 'idx_purchase_invoices_status_date');
        $this->dropIndexSafely('customer_ledgers', 'idx_customer_ledgers_cust_type_date');
        $this->dropIndexSafely('supplier_ledgers', 'idx_supplier_ledgers_supp_type_date');
        $this->dropIndexSafely('batches', 'idx_batches_product_expiry');
        $this->dropIndexSafely('sale_returns', 'idx_sale_returns_sale_invoice_id');
        $this->dropIndexSafely('purchase_returns', 'idx_purchase_returns_purchase_invoice_id');
    }

    private function addIndexSafely(string $table, array $columns, string $indexName): void
    {
        if (!Schema::hasTable($table)) {
            return;
        }
        foreach ($columns as $col) {
            if (!Schema::hasColumn($table, $col)) {
                return;
            }
        }
        try {
            Schema::table($table, function (Blueprint $blueprint) use ($columns, $indexName) {
                $blueprint->index($columns, $indexName);
            });
        } catch (\Throwable) {
            // Index already exists or equivalent index present
        }
    }

    private function dropIndexSafely(string $table, string $indexName): void
    {
        if (!Schema::hasTable($table)) {
            return;
        }
        try {
            Schema::table($table, function (Blueprint $blueprint) use ($indexName) {
                $blueprint->dropIndex($indexName);
            });
        } catch (\Throwable) {
            // Ignore if index does not exist
        }
    }
};
