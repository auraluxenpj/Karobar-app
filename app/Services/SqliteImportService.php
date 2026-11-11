<?php

namespace App\Services;

use App\Models\Brand;
use App\Models\Category;
use App\Models\Customer;
use App\Models\ExpenseCategory;
use App\Models\Formulation;
use App\Models\Supplier;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use SQLite3;
use Throwable;

class SqliteImportService
{
    protected string $stagingDir;

    /**
     * Strictly protected security, authentication, license, RBAC, and infrastructure tables.
     * These tables are NEVER imported or overwritten from any external SQLite file.
     */
    public const PROTECTED_TABLES = [
        'users',
        'licenses',
        'roles',
        'permissions',
        'model_has_roles',
        'model_has_permissions',
        'role_has_permissions',
        'sessions',
        'personal_access_tokens',
        'password_reset_tokens',
        'migrations',
        'cache',
        'cache_locks',
        'jobs',
        'job_batches',
        'failed_jobs',
        'backup_logs',
        'backup_schedules',
        'cube_provider_usages',
    ];

    /**
     * Configuration tables that are optional (unchecked by default so current store/printer setup isn't unintentionally overwritten).
     */
    public const OPTIONAL_CONFIG_TABLES = [
        'settings',
        'theme_settings',
        'barcode_templates',
    ];

    /**
     * Topological dependency stages so parent tables are always imported before child tables.
     */
    public const DEPENDENCY_STAGES = [
        // Stage 0: Independent configuration & master lookup tables
        0 => [
            'settings',
            'theme_settings',
            'barcode_templates',
            'storage_locations',
            'tax_rates',
            'chart_of_accounts',
            'accounts',
            'expense_categories',
            'formulations',
            'categories',
            'brands',
            'suppliers',
            'customers',
            'employees',
        ],
        // Stage 1: Products, party associations & session/run headers
        1 => [
            'products',
            'product_suppliers',
            'supplier_product_positions',
            'customer_regular_items',
            'customer_whole_sale_prices',
            'cash_drawer_sessions',
            'payroll_runs',
            'journal_entries',
            'stocktake_sessions',
            'stock_adjustments',
            'invoice_drafts',
        ],
        // Stage 2: Batches, orders, payments, expenses, HR & accounting lines
        2 => [
            'batches',
            'purchase_orders',
            'payments',
            'expenses',
            'employee_attendances',
            'employee_advances',
            'payroll_items',
            'journal_entry_lines',
            'stocktake_items',
            'stock_adjustment_items',
            'user_demands',
        ],
        // Stage 3: Order items, invoices & disposals
        3 => [
            'purchase_order_items',
            'purchase_invoices',
            'sale_invoices',
            'stock_disposals',
        ],
        // Stage 4: Invoice items, returns & disposal items
        4 => [
            'purchase_invoice_items',
            'purchase_returns',
            'sale_invoice_items',
            'sale_returns',
            'stock_disposal_items',
        ],
        // Stage 5: Return items, ledgers, payment allocations & audit logs
        5 => [
            'purchase_return_items',
            'sale_return_items',
            'customer_ledgers',
            'supplier_ledgers',
            'payment_allocations',
            'account_transactions',
            'cash_drawer_transactions',
            'document_histories',
        ],
    ];

    /**
     * Table name synonyms & legacy aliases -> canonical Karobar v2 table name.
     */
    protected array $tableAliases = [
        'item'                       => 'products',
        'items'                      => 'products',
        'medicine'                   => 'products',
        'medicines'                  => 'products',
        'drug'                       => 'products',
        'drugs'                      => 'products',
        'inventory'                  => 'products',
        'product'                    => 'products',
        'stock_items'                => 'products',
        'category'                   => 'categories',
        'product_categories'         => 'categories',
        'item_categories'            => 'categories',
        'brand'                      => 'brands',
        'company'                    => 'brands',
        'companies'                  => 'brands',
        'manufacturer'               => 'brands',
        'manufacturers'              => 'brands',
        'generic'                    => 'formulations',
        'generics'                   => 'formulations',
        'salt'                       => 'formulations',
        'salts'                      => 'formulations',
        'formula'                    => 'formulations',
        'formulas'                   => 'formulations',
        'formulation'                => 'formulations',
        'supplier'                   => 'suppliers',
        'vendor'                     => 'suppliers',
        'vendors'                    => 'suppliers',
        'distributor'                => 'suppliers',
        'distributors'               => 'suppliers',
        'customer'                   => 'customers',
        'client'                     => 'customers',
        'clients'                    => 'customers',
        'patient'                    => 'customers',
        'patients'                   => 'customers',
        'buyer'                      => 'customers',
        'buyers'                     => 'customers',
        'batch'                      => 'batches',
        'product_batches'            => 'batches',
        'stock_batches'              => 'batches',
        'lots'                       => 'batches',
        'sale'                       => 'sale_invoices',
        'sales'                      => 'sale_invoices',
        'sale_invoice'               => 'sale_invoices',
        'sales_invoices'             => 'sale_invoices',
        'bills'                      => 'sale_invoices',
        'pos_sales'                  => 'sale_invoices',
        'invoices'                   => 'sale_invoices',
        'sale_item'                  => 'sale_invoice_items',
        'sale_items'                 => 'sale_invoice_items',
        'sales_items'                => 'sale_invoice_items',
        'sale_details'               => 'sale_invoice_items',
        'sale_invoice_details'       => 'sale_invoice_items',
        'bill_items'                 => 'sale_invoice_items',
        'invoice_items'              => 'sale_invoice_items',
        'purchase'                   => 'purchase_invoices',
        'purchases'                  => 'purchase_invoices',
        'purchase_invoice'           => 'purchase_invoices',
        'purchase_bills'             => 'purchase_invoices',
        'grn'                        => 'purchase_invoices',
        'purchase_item'              => 'purchase_invoice_items',
        'purchase_items'             => 'purchase_invoice_items',
        'purchase_details'           => 'purchase_invoice_items',
        'purchase_invoice_details'   => 'purchase_invoice_items',
        'sale_return'                => 'sale_returns',
        'sales_returns'              => 'sale_returns',
        'sale_return_details'        => 'sale_return_items',
        'purchase_return'            => 'purchase_returns',
        'purchase_return_details'    => 'purchase_return_items',
        'customer_ledger'            => 'customer_ledgers',
        'supplier_ledger'            => 'supplier_ledgers',
        'vendor_ledger'              => 'supplier_ledgers',
        'vendor_ledgers'             => 'supplier_ledgers',
        'employee'                   => 'employees',
        'staff'                      => 'employees',
        'workers'                    => 'employees',
        'expense'                    => 'expenses',
        'expense_category'           => 'expense_categories',
        'bank_accounts'              => 'accounts',
        'financial_accounts'         => 'accounts',
        'locations'                  => 'storage_locations',
        'warehouses'                 => 'storage_locations',
    ];

    /**
     * Column synonyms & legacy aliases per target column name.
     */
    protected array $columnAliases = [
        'product_code'             => ['code', 'sku', 'item_code', 'prod_code', 'productcode', 'medicine_code', 'article_no'],
        'name'                     => ['title', 'product_name', 'item_name', 'medicine_name', 'brand_name', 'category_name', 'supplier_name', 'vendor_name', 'customer_name', 'client_name', 'party_name', 'employee_name', 'full_name', 'account_name', 'location_name'],
        'formulation'              => ['formula', 'generic', 'generic_name', 'salt', 'salt_name', 'composition', 'active_ingredient'],
        'description'              => ['desc', 'details', 'narration', 'summary', 'info'],
        'pack_size'                => ['units_per_pack', 'units', 'uom_qty', 'pack', 'packing', 'pieces_per_pack', 'box_size'],
        'quantity'                 => ['qty', 'stock', 'onhand', 'on_hand', 'current_stock', 'total_qty', 'total_quantity', 'available_qty', 'units_qty'],
        'pack_purchase_price'      => ['ppp', 'purchase_price_pack', 'pack_cost', 'cost_per_pack', 'box_cost', 'trade_price_pack'],
        'pack_sale_price'          => ['psp', 'sale_price_pack', 'pack_retail_price', 'mrp_pack', 'box_price', 'retail_pack_price'],
        'unit_purchase_price'      => ['upp', 'purchase_price_unit', 'unit_cost', 'cost', 'cost_price', 'purchase_price', 'buy_price', 'rate', 'trade_price'],
        'unit_sale_price'          => ['usp', 'sale_price_unit', 'unit_price', 'price', 'sale_price', 'selling_price', 'retail_price', 'mrp'],
        'whole_sale_pack_price'    => ['wholesale_pack_price', 'ws_pack_price', 'wholesale_box_price'],
        'whole_sale_unit_price'    => ['wholesale_unit_price', 'ws_unit_price', 'wholesale_price'],
        'avg_price'                => ['average_price', 'weighted_avg', 'wac', 'wa_cost', 'avg_cost'],
        'margin'                   => ['gross_margin_pct', 'profit_margin', 'margin_percentage', 'markup'],
        'narcotic'                 => ['is_narcotic', 'controlled', 'is_controlled'],
        'max_discount'             => ['maxdisc', 'max_discount_pct', 'max_disc'],
        'category_id'              => ['cat_id', 'category', 'category_name', 'cat_name'],
        'brand_id'                 => ['company_id', 'manufacturer_id', 'brand', 'brand_name', 'company_name', 'manufacturer'],
        'supplier_id'              => ['vendor_id', 'distributor_id', 'supplier', 'supplier_name', 'vendor', 'vendor_name'],
        'customer_id'              => ['client_id', 'patient_id', 'buyer_id', 'customer', 'customer_name', 'client_name'],
        'product_id'               => ['item_id', 'medicine_id', 'drug_id', 'product_code', 'sku'],
        'rack'                     => ['shelf', 'bin', 'cabinet', 'row_rack'],
        'barcode'                  => ['ean', 'upc', 'bar_code', 'gtin', 'qr_code'],
        'batch_number'             => ['batch', 'batch_no', 'lot', 'lot_no', 'lot_number'],
        'batch'                    => ['batch_number', 'batch_no', 'lot', 'lot_no'],
        'expiry_date'              => ['expiry', 'exp_date', 'expire_date', 'expiration_date', 'exp'],
        'expiry'                   => ['expiry_date', 'exp_date', 'expire_date', 'expiration_date'],
        'phone'                    => ['phone_number', 'mobile', 'mobile_no', 'contact', 'contact_no', 'tel', 'telephone', 'cell'],
        'phone_number'             => ['phone', 'mobile', 'contact', 'tel'],
        'email'                    => ['email_address', 'mail'],
        'address'                  => ['street_address', 'location', 'city'],
        'tax_number'               => ['ntn', 'gst', 'strn', 'vat_no', 'tin', 'tax_id'],
        'posted_number'            => ['invoice_no', 'inv_no', 'bill_no', 'voucher_no', 'doc_no', 'number', 'ref_no', 'code', 'return_no'],
        'invoice_number'           => ['vendor_invoice_no', 'supplier_invoice_no', 'bill_no', 'inv_no', 'posted_number', 'ref_no'],
        'posted_date'              => ['date', 'invoice_date', 'purchase_date', 'bill_date', 'trans_date', 'entry_date'],
        'date'                     => ['posted_date', 'invoice_date', 'sale_date', 'bill_date', 'return_date', 'trans_date', 'entry_date', 'expense_date'],
        'entry_date'               => ['date', 'trans_date', 'transaction_date', 'posted_date'],
        'total_amount'             => ['total', 'grand_total', 'net_total', 'net_amount', 'bill_amount', 'payable_amount'],
        'invoice_amount'           => ['gross_amount', 'sub_total', 'subtotal', 'gross_total', 'total_amount', 'total'],
        'gross_amount'             => ['sub_total', 'subtotal', 'gross_total', 'invoice_amount', 'total'],
        'total'                    => ['total_amount', 'grand_total', 'net_total', 'net_amount', 'bill_amount'],
        'total_receive'            => ['paid', 'paid_amount', 'received', 'amount_received', 'total_received', 'total_paid', 'cash_received'],
        'total_received'           => ['total_receive', 'paid', 'paid_amount', 'received', 'amount_received'],
        'total_paid'               => ['paid', 'paid_amount', 'amount_paid', 'total_receive', 'cash_paid'],
        'sub_total'                => ['subtotal', 'line_total', 'total', 'amount', 'net_amount'],
        'price'                    => ['unit_sale_price', 'unit_price', 'sale_price', 'rate', 'mrp', 'selling_price'],
        'pack_quantity'            => ['pack_qty', 'packs', 'box_qty', 'boxes'],
        'unit_quantity'            => ['unit_qty', 'units', 'loose_qty', 'pieces'],
        'item_discount_percentage' => ['discount_percentage', 'discount_pct', 'disc_pct', 'item_discount', 'discount'],
        'remarks'                  => ['notes', 'note', 'comment', 'comments', 'description'],
        'note'                     => ['notes', 'remarks', 'description', 'reason'],
        'notes'                    => ['note', 'remarks', 'description', 'comments'],
        'employee_code'            => ['emp_code', 'staff_code', 'code', 'emp_no'],
        'basic_salary'             => ['salary', 'base_salary', 'monthly_salary', 'pay'],
    ];

    /**
     * Foreign key definitions for cross-table ID translation and orphan protection:
     * [table => [column => ['parent' => parentTable, 'nullable' => bool, 'fallback_type' => string|null]]]
     */
    protected array $foreignKeyRules = [
        'products' => [
            'category_id'         => ['parent' => 'categories', 'nullable' => false, 'fallback' => 'category'],
            'brand_id'            => ['parent' => 'brands', 'nullable' => false, 'fallback' => 'brand'],
            'supplier_id'         => ['parent' => 'suppliers', 'nullable' => true, 'fallback' => 'supplier_optional'],
            'storage_location_id' => ['parent' => 'storage_locations', 'nullable' => true, 'fallback' => null],
        ],
        'batches' => [
            'product_id'          => ['parent' => 'products', 'nullable' => false, 'fallback' => 'skip_row'],
            'storage_location_id' => ['parent' => 'storage_locations', 'nullable' => true, 'fallback' => null],
        ],
        'product_suppliers' => [
            'product_id'          => ['parent' => 'products', 'nullable' => false, 'fallback' => 'skip_row'],
            'supplier_id'         => ['parent' => 'suppliers', 'nullable' => false, 'fallback' => 'skip_row'],
        ],
        'supplier_product_positions' => [
            'product_id'          => ['parent' => 'products', 'nullable' => false, 'fallback' => 'skip_row'],
            'supplier_id'         => ['parent' => 'suppliers', 'nullable' => false, 'fallback' => 'skip_row'],
        ],
        'customer_regular_items' => [
            'customer_id'         => ['parent' => 'customers', 'nullable' => false, 'fallback' => 'skip_row'],
            'product_id'          => ['parent' => 'products', 'nullable' => false, 'fallback' => 'skip_row'],
        ],
        'customer_whole_sale_prices' => [
            'customer_id'         => ['parent' => 'customers', 'nullable' => false, 'fallback' => 'skip_row'],
            'product_id'          => ['parent' => 'products', 'nullable' => false, 'fallback' => 'skip_row'],
        ],
        'purchase_orders' => [
            'supplier_id'         => ['parent' => 'suppliers', 'nullable' => false, 'fallback' => 'supplier'],
        ],
        'purchase_order_items' => [
            'purchase_order_id'   => ['parent' => 'purchase_orders', 'nullable' => false, 'fallback' => 'skip_row'],
            'product_id'          => ['parent' => 'products', 'nullable' => false, 'fallback' => 'skip_row'],
        ],
        'purchase_invoices' => [
            'supplier_id'         => ['parent' => 'suppliers', 'nullable' => false, 'fallback' => 'supplier'],
            'purchase_order_id'   => ['parent' => 'purchase_orders', 'nullable' => true, 'fallback' => null],
            'account_id'          => ['parent' => 'accounts', 'nullable' => true, 'fallback' => null],
        ],
        'purchase_invoice_items' => [
            'purchase_invoice_id'    => ['parent' => 'purchase_invoices', 'nullable' => false, 'fallback' => 'skip_row'],
            'product_id'             => ['parent' => 'products', 'nullable' => false, 'fallback' => 'skip_row'],
            'purchase_order_item_id' => ['parent' => 'purchase_order_items', 'nullable' => true, 'fallback' => null],
        ],
        'purchase_returns' => [
            'supplier_id'         => ['parent' => 'suppliers', 'nullable' => false, 'fallback' => 'supplier'],
            'purchase_invoice_id' => ['parent' => 'purchase_invoices', 'nullable' => true, 'fallback' => null],
            'account_id'          => ['parent' => 'accounts', 'nullable' => true, 'fallback' => null],
        ],
        'purchase_return_items' => [
            'purchase_return_id'  => ['parent' => 'purchase_returns', 'nullable' => false, 'fallback' => 'skip_row'],
            'product_id'          => ['parent' => 'products', 'nullable' => false, 'fallback' => 'skip_row'],
        ],
        'sale_invoices' => [
            'customer_id'         => ['parent' => 'customers', 'nullable' => false, 'fallback' => 'customer'],
            'account_id'          => ['parent' => 'accounts', 'nullable' => true, 'fallback' => null],
            'salesman_id'         => ['parent' => 'employees', 'nullable' => true, 'fallback' => null],
        ],
        'sale_invoice_items' => [
            'sale_invoice_id'     => ['parent' => 'sale_invoices', 'nullable' => false, 'fallback' => 'skip_row'],
            'product_id'          => ['parent' => 'products', 'nullable' => false, 'fallback' => 'skip_row'],
        ],
        'sale_returns' => [
            'customer_id'         => ['parent' => 'customers', 'nullable' => false, 'fallback' => 'customer'],
            'sale_invoice_id'     => ['parent' => 'sale_invoices', 'nullable' => true, 'fallback' => null],
            'account_id'          => ['parent' => 'accounts', 'nullable' => true, 'fallback' => null],
        ],
        'sale_return_items' => [
            'sale_return_id'      => ['parent' => 'sale_returns', 'nullable' => false, 'fallback' => 'skip_row'],
            'product_id'          => ['parent' => 'products', 'nullable' => false, 'fallback' => 'skip_row'],
        ],
        'customer_ledgers' => [
            'customer_id'         => ['parent' => 'customers', 'nullable' => false, 'fallback' => 'customer'],
            'sale_invoice_id'     => ['parent' => 'sale_invoices', 'nullable' => true, 'fallback' => null],
            'sale_return_id'      => ['parent' => 'sale_returns', 'nullable' => true, 'fallback' => null],
            'payment_id'          => ['parent' => 'payments', 'nullable' => true, 'fallback' => null],
        ],
        'supplier_ledgers' => [
            'supplier_id'         => ['parent' => 'suppliers', 'nullable' => false, 'fallback' => 'supplier'],
            'purchase_invoice_id' => ['parent' => 'purchase_invoices', 'nullable' => true, 'fallback' => null],
            'purchase_return_id'  => ['parent' => 'purchase_returns', 'nullable' => true, 'fallback' => null],
            'payment_id'          => ['parent' => 'payments', 'nullable' => true, 'fallback' => null],
        ],
        'payments' => [
            'account_id'          => ['parent' => 'accounts', 'nullable' => true, 'fallback' => null],
            'wht_tax_rate_id'     => ['parent' => 'tax_rates', 'nullable' => true, 'fallback' => null],
        ],
        'payment_allocations' => [
            'payment_id'          => ['parent' => 'payments', 'nullable' => false, 'fallback' => 'skip_row'],
        ],
        'expenses' => [
            'expense_category_id'    => ['parent' => 'expense_categories', 'nullable' => false, 'fallback' => 'expense_category'],
            'account_id'             => ['parent' => 'accounts', 'nullable' => true, 'fallback' => null],
            'cash_drawer_session_id' => ['parent' => 'cash_drawer_sessions', 'nullable' => true, 'fallback' => null],
        ],
        'account_transactions' => [
            'account_id'          => ['parent' => 'accounts', 'nullable' => false, 'fallback' => 'skip_row'],
        ],
        'cash_drawer_transactions' => [
            'session_id'          => ['parent' => 'cash_drawer_sessions', 'nullable' => false, 'fallback' => 'skip_row'],
        ],
        'journal_entries' => [
            'account_id'          => ['parent' => 'accounts', 'nullable' => true, 'fallback' => null],
        ],
        'journal_entry_lines' => [
            'journal_entry_id'    => ['parent' => 'journal_entries', 'nullable' => false, 'fallback' => 'skip_row'],
            'chart_of_account_id' => ['parent' => 'chart_of_accounts', 'nullable' => false, 'fallback' => 'skip_row'],
        ],
        'employee_attendances' => [
            'employee_id'         => ['parent' => 'employees', 'nullable' => false, 'fallback' => 'skip_row'],
        ],
        'employee_advances' => [
            'employee_id'         => ['parent' => 'employees', 'nullable' => false, 'fallback' => 'skip_row'],
            'account_id'          => ['parent' => 'accounts', 'nullable' => true, 'fallback' => null],
            'payroll_item_id'     => ['parent' => 'payroll_items', 'nullable' => true, 'fallback' => null],
        ],
        'payroll_items' => [
            'payroll_run_id'      => ['parent' => 'payroll_runs', 'nullable' => false, 'fallback' => 'skip_row'],
            'employee_id'         => ['parent' => 'employees', 'nullable' => false, 'fallback' => 'skip_row'],
            'account_id'          => ['parent' => 'accounts', 'nullable' => true, 'fallback' => null],
            'expense_id'          => ['parent' => 'expenses', 'nullable' => true, 'fallback' => null],
        ],
        'stock_adjustment_items' => [
            'stock_adjustment_id' => ['parent' => 'stock_adjustments', 'nullable' => false, 'fallback' => 'skip_row'],
            'product_id'          => ['parent' => 'products', 'nullable' => false, 'fallback' => 'skip_row'],
        ],
        'stock_disposals' => [
            'stock_adjustment_id' => ['parent' => 'stock_adjustments', 'nullable' => true, 'fallback' => null],
            'expense_id'          => ['parent' => 'expenses', 'nullable' => true, 'fallback' => null],
        ],
        'stock_disposal_items' => [
            'stock_disposal_id'   => ['parent' => 'stock_disposals', 'nullable' => false, 'fallback' => 'skip_row'],
            'product_id'          => ['parent' => 'products', 'nullable' => false, 'fallback' => 'skip_row'],
            'batch_id'            => ['parent' => 'batches', 'nullable' => true, 'fallback' => null],
        ],
        'stocktake_sessions' => [
            'stock_adjustment_id' => ['parent' => 'stock_adjustments', 'nullable' => true, 'fallback' => null],
            'storage_location_id' => ['parent' => 'storage_locations', 'nullable' => true, 'fallback' => null],
        ],
        'stocktake_items' => [
            'stocktake_session_id'=> ['parent' => 'stocktake_sessions', 'nullable' => false, 'fallback' => 'skip_row'],
            'product_id'          => ['parent' => 'products', 'nullable' => false, 'fallback' => 'skip_row'],
        ],
        'user_demands' => [
            'product_id'          => ['parent' => 'products', 'nullable' => false, 'fallback' => 'skip_row'],
            'customer_id'         => ['parent' => 'customers', 'nullable' => true, 'fallback' => null],
        ],
    ];

    /**
     * Columns across any table that reference users.id and must be remapped to valid target users.
     */
    protected array $userForeignKeyColumns = [
        'user_id',
        'created_by',
        'updated_by',
        'received_by',
        'reversed_by',
        'reversed_by_id',
        'created_by_id',
        'recorded_by',
        'generated_by',
        'counted_by',
        'disposed_by',
        'restored_by',
        'requested_by',
    ];

    public function __construct()
    {
        $this->stagingDir = storage_path('app/imports/sqlite');
        $this->ensureStagingDirectory();
    }

    protected function ensureStagingDirectory(): void
    {
        if (!File::exists($this->stagingDir)) {
            File::makeDirectory($this->stagingDir, 0755, true, true);
        }
        $this->pruneOldStagedFiles();
    }

    /**
     * Clean up staged SQLite files older than 6 hours.
     */
    protected function pruneOldStagedFiles(): void
    {
        try {
            $cutoff = now()->subHours(6)->timestamp;
            foreach (glob($this->stagingDir . '/*') ?: [] as $file) {
                if (is_file($file) && (@filemtime($file) ?: 0) < $cutoff) {
                    @unlink($file);
                }
            }
        } catch (Throwable) {
        }
    }

    /**
     * Store and validate an uploaded SQLite file (.sqlite, .sqlite3, .db, .db3, .zip, .gz, .sql.gz, .sql).
     */
    public function storeUploadedSqlite(UploadedFile $file): array
    {
        $maxSize = 500 * 1024 * 1024; // 500MB
        if ($file->getSize() > $maxSize) {
            throw new \RuntimeException('File size exceeds maximum limit of 500MB.');
        }

        $originalName = $file->getClientOriginalName();
        $rawPath = $file->getRealPath() ?: $file->getPathname();

        return $this->stageSqliteFromFile($rawPath, $originalName);
    }

    /**
     * Stage a SQLite database from a file path (uploaded or selected on desktop), handling raw SQLite, GZIP, ZIP, or SQL dumps.
     */
    public function stageSqliteFromFile(string $sourceFilePath, ?string $originalName = null): array
    {
        if (!is_file($sourceFilePath) || !is_readable($sourceFilePath)) {
            throw new \RuntimeException('Selected database file does not exist or is not readable.');
        }

        $this->ensureStagingDirectory();
        $token = (string) Str::uuid();
        $stagedSqlitePath = $this->stagingDir . '/' . $token . '.sqlite';
        $metaPath = $this->stagingDir . '/' . $token . '.json';

        $displayFilename = $originalName ?: basename($sourceFilePath);
        $lowerName = strtolower($displayFilename);

        $rawBytes = @file_get_contents($sourceFilePath);
        if ($rawBytes === false || $rawBytes === '') {
            throw new \RuntimeException('The selected database file is empty or unreadable.');
        }

        // 1. If ZIP archive, extract the database entry inside
        if (str_starts_with($rawBytes, "PK\x03\x04") || str_ends_with($lowerName, '.zip')) {
            $backupService = app(BackupService::class);
            $entries = $backupService->readZipArchiveEntries($sourceFilePath, false);
            $dbEntryBytes = null;
            foreach ($entries as $entryName => $entryContent) {
                $lowerEntry = strtolower($entryName);
                if (
                    str_starts_with($entryContent, 'SQLite format 3')
                    || str_ends_with($lowerEntry, '.sqlite')
                    || str_ends_with($lowerEntry, '.sqlite3')
                    || str_ends_with($lowerEntry, '.db')
                    || str_ends_with($lowerEntry, '.sql.gz')
                    || str_ends_with($lowerEntry, '.sql')
                ) {
                    $dbEntryBytes = $entryContent;
                    break;
                }
            }
            if ($dbEntryBytes === null) {
                throw new \RuntimeException('ZIP archive does not contain a valid SQLite database or SQL dump.');
            }
            $rawBytes = $dbEntryBytes;
        }

        // 2. If GZIP compressed, decompress
        if (substr($rawBytes, 0, 2) === "\x1f\x8b" || str_ends_with($lowerName, '.gz')) {
            $decompressed = @gzdecode($rawBytes);
            if ($decompressed !== false && $decompressed !== '') {
                $rawBytes = $decompressed;
            }
        }

        // 3. Check for binary SQLite header ("SQLite format 3\0")
        $sqliteMagicPos = strpos($rawBytes, 'SQLite format 3');
        if ($sqliteMagicPos !== false && $sqliteMagicPos < 128) {
            $sqliteBytes = substr($rawBytes, $sqliteMagicPos);
            if (@file_put_contents($stagedSqlitePath, $sqliteBytes) === false) {
                throw new \RuntimeException('Failed to write staged SQLite file.');
            }
        } elseif ($this->looksLikeSqlStatements($rawBytes)) {
            // 4. Convert a plain SQL dump into a temporary SQLite database so our schema inspector works uniformly
            $this->buildSqliteFromSqlDump($rawBytes, $stagedSqlitePath);
        } else {
            throw new \RuntimeException('Unsupported file format. Please select a valid SQLite database (.sqlite, .sqlite3, .db) or backup archive (.zip, .sql.gz).');
        }

        // 5. Verify integrity of the staged SQLite file
        $this->assertValidSqliteFile($stagedSqlitePath);

        $metadata = [
            'token'         => $token,
            'original_name' => $displayFilename,
            'file_size'     => (int) @filesize($stagedSqlitePath),
            'created_at'    => now()->toIso8601String(),
        ];
        @file_put_contents($metaPath, json_encode($metadata, JSON_PRETTY_PRINT));

        return $metadata;
    }

    /**
     * Resolve staged SQLite file path from session token safely.
     */
    public function resolveStagedPath(string $token): string
    {
        if (!preg_match('/^[a-f0-9\-]{36}$/i', $token)) {
            throw new \InvalidArgumentException('Invalid import session token.');
        }

        $path = $this->stagingDir . '/' . $token . '.sqlite';
        if (!is_file($path) || !is_readable($path)) {
            throw new \RuntimeException('Import session has expired or file was not found. Please upload the SQLite file again.');
        }

        return $path;
    }

    /**
     * Delete a staged SQLite file and its metadata.
     */
    public function cleanupStagedSession(string $token): void
    {
        if (!preg_match('/^[a-f0-9\-]{36}$/i', $token)) {
            return;
        }
        $sqlitePath = $this->stagingDir . '/' . $token . '.sqlite';
        $metaPath = $this->stagingDir . '/' . $token . '.json';
        if (is_file($sqlitePath)) {
            @unlink($sqlitePath);
        }
        if (is_file($metaPath)) {
            @unlink($metaPath);
        }
    }

    protected function looksLikeSqlStatements(string $content): bool
    {
        $sample = substr($content, 0, 8192);
        return (bool) preg_match('/\b(CREATE\s+TABLE|INSERT\s+INTO)\b/i', $sample);
    }

    protected function buildSqliteFromSqlDump(string $sqlContent, string $targetSqlitePath): void
    {
        if (is_file($targetSqlitePath)) {
            @unlink($targetSqlitePath);
        }

        $db = new SQLite3($targetSqlitePath, SQLITE3_OPEN_READWRITE | SQLITE3_OPEN_CREATE);
        $db->busyTimeout(15000);
        $db->exec('PRAGMA foreign_keys = OFF;');
        $db->exec('BEGIN;');

        try {
            $backupService = app(BackupService::class);
            $statements = $backupService->splitSqlStatements($sqlContent);
            foreach ($statements as $stmt) {
                $trimmed = trim($stmt);
                if ($trimmed === '' || preg_match('/^(SET\s+|LOCK\s+TABLES|UNLOCK\s+TABLES|START\s+TRANSACTION|COMMIT)/i', $trimmed)) {
                    continue;
                }
                if (preg_match('/\b(ATTACH\s+DATABASE|INTO\s+(OUTFILE|DUMPFILE)|LOAD_FILE\s*\()\b/i', $trimmed)) {
                    throw new \RuntimeException('Unsafe SQL statement detected in dump.');
                }
                if (str_contains($trimmed, "\\'")) {
                    $trimmed = str_replace("\\'", "''", $trimmed);
                }
                @$db->exec($trimmed);
            }
            $db->exec('COMMIT;');
        } finally {
            $db->close();
        }
    }

    protected function assertValidSqliteFile(string $sqlitePath): void
    {
        $db = null;
        try {
            $db = new SQLite3($sqlitePath, SQLITE3_OPEN_READONLY);
            $db->busyTimeout(5000);
            $check = $db->querySingle('PRAGMA quick_check;');
            $tableCount = (int) $db->querySingle("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
            $db->close();
            $db = null;

            if ($check !== 'ok') {
                throw new \RuntimeException("SQLite database failed integrity check ({$check}).");
            }
            if ($tableCount === 0) {
                throw new \RuntimeException('The selected SQLite database contains no tables.');
            }
        } catch (Throwable $e) {
            if ($db instanceof SQLite3) {
                @$db->close();
            }
            @unlink($sqlitePath);
            throw new \RuntimeException('Invalid or corrupted SQLite database: ' . $e->getMessage(), 0, $e);
        }
    }

    /**
     * Inspect the staged SQLite database and compare against our active Karobar ERP v2 schema.
     * Produces comprehensive auto-mappings for tables and columns, sample data previews, and synthesis plans.
     */
    public function inspectAndProposeMapping(string $token): array
    {
        $sqlitePath = $this->resolveStagedPath($token);
        $metaPath = $this->stagingDir . '/' . $token . '.json';
        $meta = is_file($metaPath) ? (json_decode((string) file_get_contents($metaPath), true) ?: []) : [];

        $targetCatalog = $this->getTargetSchemaCatalog();

        $srcDb = new SQLite3($sqlitePath, SQLITE3_OPEN_READONLY);
        $srcDb->busyTimeout(10000);

        $sourceTables = [];
        $protectedSkipped = [];
        $totalImportableRows = 0;
        $autoMatchedCount = 0;
        $schemaDriftTablesCount = 0;

        try {
            $res = $srcDb->query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
            $rawTableNames = [];
            while ($row = $res->fetchArray(SQLITE3_ASSOC)) {
                if (!empty($row['name'])) {
                    $rawTableNames[] = (string) $row['name'];
                }
            }

            foreach ($rawTableNames as $srcTable) {
                $escapedTable = str_replace('`', '``', $srcTable);
                $rowCount = (int) @$srcDb->querySingle("SELECT COUNT(*) FROM `{$escapedTable}`");

                // Fetch source columns
                $srcCols = [];
                $colRes = @$srcDb->query("PRAGMA table_info(`{$escapedTable}`)");
                if ($colRes) {
                    while ($c = $colRes->fetchArray(SQLITE3_ASSOC)) {
                        $srcCols[] = [
                            'name'       => (string) $c['name'],
                            'type'       => (string) ($c['type'] ?: 'TEXT'),
                            'notnull'    => (bool) $c['notnull'],
                            'dflt_value' => $c['dflt_value'],
                            'pk'         => (bool) $c['pk'],
                        ];
                    }
                }

                $lowerSrcTable = strtolower(trim($srcTable));

                // Check if protected table (users, licenses, roles, permissions, sessions, etc.)
                if (in_array($lowerSrcTable, self::PROTECTED_TABLES, true)) {
                    $protectedSkipped[] = [
                        'source_table' => $srcTable,
                        'row_count'    => $rowCount,
                        'reason'       => $this->getProtectedTableReason($lowerSrcTable),
                    ];
                    continue;
                }

                // Sample first 3 rows
                $sampleRows = [];
                if ($rowCount > 0) {
                    $sampleRes = @$srcDb->query("SELECT * FROM `{$escapedTable}` LIMIT 3");
                    if ($sampleRes) {
                        while ($sRow = $sampleRes->fetchArray(SQLITE3_ASSOC)) {
                            $sampleRows[] = $this->truncateSampleValues($sRow);
                        }
                    }
                }

                // Resolve matching target table (exact, alias, or column-overlap heuristic)
                [$matchedTarget, $matchMethod] = $this->resolveTargetTable($srcTable, array_column($srcCols, 'name'), $targetCatalog);

                $mappingAnalysis = null;
                $isOptionalConfig = false;
                $stage = 99;

                if ($matchedTarget !== null && isset($targetCatalog[$matchedTarget])) {
                    $autoMatchedCount++;
                    $isOptionalConfig = in_array($matchedTarget, self::OPTIONAL_CONFIG_TABLES, true);
                    $stage = $targetCatalog[$matchedTarget]['stage'];
                    $mappingAnalysis = $this->buildTableColumnAnalysis(
                        $srcTable,
                        $srcCols,
                        $matchedTarget,
                        $targetCatalog[$matchedTarget]['columns'],
                        $sampleRows
                    );

                    if (!empty($mappingAnalysis['missing_target_columns']) || !empty($mappingAnalysis['unmapped_source_columns']) || $matchMethod !== 'exact') {
                        $schemaDriftTablesCount++;
                    }
                }

                $enabledByDefault = $matchedTarget !== null
                    && $rowCount > 0
                    && !$isOptionalConfig;

                if ($enabledByDefault) {
                    $totalImportableRows += $rowCount;
                }

                $sourceTables[] = [
                    'source_table'     => $srcTable,
                    'row_count'        => $rowCount,
                    'source_columns'   => $srcCols,
                    'target_table'     => $matchedTarget,
                    'match_method'     => $matchMethod, // 'exact' | 'alias' | 'fuzzy' | 'unmapped'
                    'enabled'          => $enabledByDefault,
                    'is_optional_cfg'  => $isOptionalConfig,
                    'dependency_stage' => $stage,
                    'analysis'         => $mappingAnalysis,
                    'sample_rows'      => $sampleRows,
                ];
            }

            // Sort sourceTables by dependency stage, then row_count desc, then name
            usort($sourceTables, function (array $a, array $b) {
                if ($a['dependency_stage'] !== $b['dependency_stage']) {
                    return $a['dependency_stage'] <=> $b['dependency_stage'];
                }
                return strcasecmp($a['source_table'], $b['source_table']);
            });

            // Also inspect how source users map to target users (read-only preview)
            $userRemapSummary = $this->inspectUserRemapping($srcDb);

        } finally {
            $srcDb->close();
        }

        return [
            'session' => [
                'token'         => $token,
                'original_name' => $meta['original_name'] ?? basename($sqlitePath),
                'file_size'     => $meta['file_size'] ?? @filesize($sqlitePath),
                'created_at'    => $meta['created_at'] ?? now()->toIso8601String(),
            ],
            'summary' => [
                'total_source_tables'      => count($sourceTables) + count($protectedSkipped),
                'importable_tables_count'  => count($sourceTables),
                'non_empty_tables_count'   => count(array_filter($sourceTables, fn ($t) => $t['row_count'] > 0)),
                'auto_matched_count'       => $autoMatchedCount,
                'schema_drift_count'       => $schemaDriftTablesCount,
                'protected_skipped_count'  => count($protectedSkipped),
                'total_importable_rows'    => $totalImportableRows,
            ],
            'protected_tables'   => $protectedSkipped,
            'user_remap_preview' => $userRemapSummary,
            'tables'             => $sourceTables,
            'target_catalog'     => array_values($targetCatalog),
        ];
    }

    /**
     * Dynamically preview a custom (sourceTable -> targetTable) mapping and optional custom column map.
     */
    public function previewTableMapping(string $token, string $sourceTable, string $targetTable, array $customColumnMap = []): array
    {
        $sqlitePath = $this->resolveStagedPath($token);
        $targetCatalog = $this->getTargetSchemaCatalog();

        if (!isset($targetCatalog[$targetTable])) {
            throw new \InvalidArgumentException("Target table [{$targetTable}] is not an importable table.");
        }

        $srcDb = new SQLite3($sqlitePath, SQLITE3_OPEN_READONLY);
        $srcDb->busyTimeout(5000);

        try {
            $escaped = str_replace('`', '``', $sourceTable);
            $srcCols = [];
            $colRes = @$srcDb->query("PRAGMA table_info(`{$escaped}`)");
            if ($colRes) {
                while ($c = $colRes->fetchArray(SQLITE3_ASSOC)) {
                    $srcCols[] = [
                        'name'       => (string) $c['name'],
                        'type'       => (string) ($c['type'] ?: 'TEXT'),
                        'notnull'    => (bool) $c['notnull'],
                        'dflt_value' => $c['dflt_value'],
                        'pk'         => (bool) $c['pk'],
                    ];
                }
            }

            if (empty($srcCols)) {
                throw new \InvalidArgumentException("Source table [{$sourceTable}] was not found in the staged SQLite file.");
            }

            $sampleRows = [];
            $sampleRes = @$srcDb->query("SELECT * FROM `{$escaped}` LIMIT 3");
            if ($sampleRes) {
                while ($sRow = $sampleRes->fetchArray(SQLITE3_ASSOC)) {
                    $sampleRows[] = $this->truncateSampleValues($sRow);
                }
            }

            return $this->buildTableColumnAnalysis(
                $sourceTable,
                $srcCols,
                $targetTable,
                $targetCatalog[$targetTable]['columns'],
                $sampleRows,
                $customColumnMap
            );
        } finally {
            $srcDb->close();
        }
    }

    /**
     * Build a catalog of all importable target tables and their columns in the current Karobar ERP v2 schema.
     */
    public function getTargetSchemaCatalog(): array
    {
        $stageLookup = [];
        foreach (self::DEPENDENCY_STAGES as $stage => $tbls) {
            foreach ($tbls as $t) {
                $stageLookup[$t] = $stage;
            }
        }

        $rows = DB::select("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
        $catalog = [];

        foreach ($rows as $r) {
            $tableName = (string) ($r->name ?? '');
            if ($tableName === '' || in_array(strtolower($tableName), self::PROTECTED_TABLES, true)) {
                continue;
            }

            $cols = [];
            $pragmaCols = DB::select("PRAGMA table_info(`{$tableName}`)");
            foreach ($pragmaCols as $c) {
                $cols[] = [
                    'name'       => (string) $c->name,
                    'type'       => (string) ($c->type ?: 'TEXT'),
                    'notnull'    => (bool) $c->notnull,
                    'dflt_value' => $c->dflt_value,
                    'pk'         => (bool) $c->pk,
                ];
            }

            $catalog[$tableName] = [
                'table'           => $tableName,
                'label'           => Str::headline($tableName),
                'stage'           => $stageLookup[$tableName] ?? 6,
                'is_optional_cfg' => in_array($tableName, self::OPTIONAL_CONFIG_TABLES, true),
                'columns'         => $cols,
            ];
        }

        return $catalog;
    }

    /**
     * Resolve a source table name to a target Karobar table using exact match, alias dictionary, or column similarity.
     * @return array{0: string|null, 1: string} [targetTable, matchMethod]
     */
    protected function resolveTargetTable(string $sourceTable, array $sourceColNames, array $targetCatalog): array
    {
        $clean = strtolower(trim($sourceTable));

        // 1. Exact match
        if (isset($targetCatalog[$clean])) {
            return [$clean, 'exact'];
        }

        // Strip common prefixes like tbl_, pos_, erp_, wp_, old_
        $stripped = preg_replace('/^(tbl_|pos_|erp_|app_|old_|v1_)/', '', $clean) ?: $clean;
        if (isset($targetCatalog[$stripped])) {
            return [$stripped, 'alias'];
        }

        // 2. Curated table alias lookup
        if (isset($this->tableAliases[$clean]) && isset($targetCatalog[$this->tableAliases[$clean]])) {
            return [$this->tableAliases[$clean], 'alias'];
        }
        if (isset($this->tableAliases[$stripped]) && isset($targetCatalog[$this->tableAliases[$stripped]])) {
            return [$this->tableAliases[$stripped], 'alias'];
        }

        // 3. Pluralization / singularization check
        $plural = Str::plural($stripped);
        if (isset($targetCatalog[$plural])) {
            return [$plural, 'alias'];
        }

        // 4. Column-overlap similarity heuristic (excluding generic id/created_at/updated_at)
        $meaningfulSrc = array_values(array_diff(
            array_map('strtolower', $sourceColNames),
            ['id', 'created_at', 'updated_at', 'deleted_at']
        ));

        if (count($meaningfulSrc) >= 2) {
            $bestTarget = null;
            $bestScore = 0.0;

            foreach ($targetCatalog as $tName => $tMeta) {
                $tCols = array_values(array_diff(
                    array_map(fn ($c) => strtolower($c['name']), $tMeta['columns']),
                    ['id', 'created_at', 'updated_at', 'deleted_at']
                ));
                if (empty($tCols)) {
                    continue;
                }
                $overlap = count(array_intersect($meaningfulSrc, $tCols));
                $score = $overlap / min(count($meaningfulSrc), count($tCols));
                if ($overlap >= 2 && $score > $bestScore && $score >= 0.6) {
                    $bestScore = $score;
                    $bestTarget = $tName;
                }
            }

            if ($bestTarget !== null) {
                return [$bestTarget, 'fuzzy'];
            }
        }

        return [null, 'unmapped'];
    }

    /**
     * Analyze column mappings between a source table and target table, proposing how every target column
     * will be populated (mapped from a source column, synthesized/derived, or defaulted).
     */
    protected function buildTableColumnAnalysis(
        string $sourceTable,
        array $sourceCols,
        string $targetTable,
        array $targetCols,
        array $sampleRows = [],
        array $customColumnMap = []
    ): array {
        $srcColByLower = [];
        $srcColByNormalized = [];
        foreach ($sourceCols as $sc) {
            $lower = strtolower(trim($sc['name']));
            $norm = preg_replace('/[^a-z0-9]/', '', $lower) ?: $lower;
            $srcColByLower[$lower] = $sc['name'];
            if (!isset($srcColByNormalized[$norm])) {
                $srcColByNormalized[$norm] = $sc['name'];
            }
        }

        $columnMappings = [];
        $usedSourceCols = [];
        $missingTargetCols = [];

        foreach ($targetCols as $tc) {
            $tColName = $tc['name'];
            $tLower = strtolower($tColName);
            $tNorm = preg_replace('/[^a-z0-9]/', '', $tLower) ?: $tLower;

            $matchedSrcCol = null;
            $matchType = 'unmapped'; // 'exact' | 'normalized' | 'alias' | 'custom' | 'synthesized' | 'default'
            $staticValue = null;

            // Check if user provided a custom override for this target column
            if (array_key_exists($tColName, $customColumnMap)) {
                $override = $customColumnMap[$tColName];
                if (is_array($override)) {
                    $overrideSrc = $override['source_column'] ?? null;
                    $staticValue = $override['default_value'] ?? null;
                    if ($overrideSrc && in_array($overrideSrc, array_column($sourceCols, 'name'), true)) {
                        $matchedSrcCol = $overrideSrc;
                        $matchType = 'custom';
                    } elseif ($overrideSrc === '__skip__') {
                        $matchedSrcCol = null;
                        $matchType = 'synthesized';
                    }
                } elseif (is_string($override) && $override !== '' && $override !== '__skip__') {
                    if (in_array($override, array_column($sourceCols, 'name'), true)) {
                        $matchedSrcCol = $override;
                        $matchType = 'custom';
                    }
                }
            } else {
                // Tier 1: Exact case-insensitive match
                if (isset($srcColByLower[$tLower])) {
                    $matchedSrcCol = $srcColByLower[$tLower];
                    $matchType = 'exact';
                }
                // Tier 2: Normalized alphanumeric match (e.g. productCode -> product_code)
                elseif (isset($srcColByNormalized[$tNorm])) {
                    $matchedSrcCol = $srcColByNormalized[$tNorm];
                    $matchType = 'normalized';
                }
                // Tier 3: Curated Synonym & Legacy Alias Dictionary
                elseif (isset($this->columnAliases[$tLower])) {
                    foreach ($this->columnAliases[$tLower] as $alias) {
                        $aliasLower = strtolower($alias);
                        $aliasNorm = preg_replace('/[^a-z0-9]/', '', $aliasLower) ?: $aliasLower;
                        if (isset($srcColByLower[$aliasLower])) {
                            $matchedSrcCol = $srcColByLower[$aliasLower];
                            $matchType = 'alias';
                            break;
                        }
                        if (isset($srcColByNormalized[$aliasNorm])) {
                            $matchedSrcCol = $srcColByNormalized[$aliasNorm];
                            $matchType = 'alias';
                            break;
                        }
                    }
                }
            }

            if ($matchedSrcCol !== null) {
                $usedSourceCols[$matchedSrcCol] = true;
            }

            $synthesisNote = $this->describeColumnSynthesis($targetTable, $tc, $matchedSrcCol);
            if ($matchedSrcCol === null && !$tc['pk']) {
                $matchType = $tc['dflt_value'] !== null ? 'default' : 'synthesized';
                $missingTargetCols[] = [
                    'column'         => $tColName,
                    'type'           => $tc['type'],
                    'required'       => $tc['notnull'],
                    'default_value'  => $tc['dflt_value'],
                    'synthesis_note' => $synthesisNote,
                ];
            }

            $columnMappings[] = [
                'target_column'  => $tColName,
                'target_type'    => $tc['type'],
                'required'       => $tc['notnull'],
                'is_pk'          => $tc['pk'],
                'schema_default' => $tc['dflt_value'],
                'source_column'  => $matchedSrcCol,
                'static_value'   => $staticValue,
                'match_type'     => $matchType,
                'synthesis_note' => $synthesisNote,
            ];
        }

        $unmappedSourceCols = [];
        foreach ($sourceCols as $sc) {
            if (!isset($usedSourceCols[$sc['name']])) {
                $unmappedSourceCols[] = $sc['name'];
            }
        }

        // Build quick lookup map for previewing transformed sample rows
        $effectiveColMap = [];
        $staticDefaultsMap = [];
        foreach ($columnMappings as $cm) {
            if (!empty($cm['source_column'])) {
                $effectiveColMap[$cm['target_column']] = $cm['source_column'];
            }
            if ($cm['static_value'] !== null && $cm['static_value'] !== '') {
                $staticDefaultsMap[$cm['target_column']] = $cm['static_value'];
            }
        }

        $previewTransformed = [];
        foreach ($sampleRows as $idx => $sRow) {
            $transformed = $this->previewSynthesizedRow(
                $targetTable,
                $targetCols,
                $sRow,
                $effectiveColMap,
                $staticDefaultsMap,
                $idx + 1
            );
            if ($transformed !== null) {
                $previewTransformed[] = $this->truncateSampleValues($transformed);
            }
        }

        return [
            'source_table'            => $sourceTable,
            'target_table'            => $targetTable,
            'matched_columns_count'   => count($usedSourceCols),
            'total_target_columns'    => count($targetCols),
            'missing_target_columns'  => $missingTargetCols,
            'unmapped_source_columns' => $unmappedSourceCols,
            'column_mappings'         => $columnMappings,
            'preview_rows'            => $previewTransformed,
        ];
    }

    /**
     * Explain to the user how a missing column or foreign key is intelligently synthesized.
     */
    protected function describeColumnSynthesis(string $targetTable, array $targetCol, ?string $matchedSrcCol): string
    {
        $col = $targetCol['name'];
        $isFk = isset($this->foreignKeyRules[$targetTable][$col]);
        $isUserFk = in_array($col, $this->userForeignKeyColumns, true);

        if ($isUserFk) {
            return 'Auto-remapped to matching user or current Admin';
        }

        if ($matchedSrcCol !== null) {
            if ($isFk) {
                $parent = $this->foreignKeyRules[$targetTable][$col]['parent'];
                return "Mapped from `{$matchedSrcCol}` (with cross-table ID translation to `{$parent}`)";
            }
            return "Mapped from `{$matchedSrcCol}`";
        }

        if ($targetTable === 'products') {
            return match ($col) {
                'barcode'               => 'Auto-generated unique barcode from product_code',
                'product_code'          => 'Auto-generated unique code (PRD-XXXXX)',
                'pack_size'             => 'Defaults to 1 unit per pack',
                'category_id'           => 'Auto-assigned to "General" category',
                'brand_id'              => 'Auto-assigned to "General" brand',
                'unit_purchase_price'   => 'Derived from pack_purchase_price / pack_size (or 0)',
                'pack_purchase_price'   => 'Derived from unit_purchase_price * pack_size (or 0)',
                'unit_sale_price'       => 'Derived from pack_sale_price / pack_size (or 0)',
                'pack_sale_price'       => 'Derived from unit_sale_price * pack_size (or 0)',
                'avg_price'             => 'Derived from unit_purchase_price',
                'margin'                => 'Calculated from unit_sale_price & avg_price',
                default                 => $targetCol['dflt_value'] !== null ? "Schema default ({$targetCol['dflt_value']})" : 'Nullable / safe default',
            };
        }

        if ($targetTable === 'purchase_invoice_items' || $targetTable === 'sale_invoice_items') {
            return match ($col) {
                'pack_size'             => 'Resolved from product pack_size (or 1)',
                'quantity'              => 'Derived from (pack_quantity * pack_size) + unit_quantity',
                'pack_quantity'         => 'Derived from quantity / pack_size (or 0)',
                'unit_quantity'         => 'Derived from quantity % pack_size',
                'unit_purchase_price'   => 'Derived from pack_purchase_price / pack_size',
                'pack_purchase_price'   => 'Derived from unit_purchase_price * pack_size',
                'unit_sale_price'       => 'Derived from pack_sale_price / pack_size',
                'pack_sale_price'       => 'Derived from unit_sale_price * pack_size',
                'avg_price'             => 'Set from unit_purchase_price',
                'margin'                => 'Calculated margin percentage',
                'sub_total'             => 'Calculated from quantity * unit price',
                default                 => $targetCol['dflt_value'] !== null ? "Schema default ({$targetCol['dflt_value']})" : 'Safe default (0 / NULL)',
            };
        }

        if ($isFk) {
            $rule = $this->foreignKeyRules[$targetTable][$col];
            if ($rule['fallback'] === 'customer') {
                return 'Auto-assigned to "Walk-in Customer"';
            }
            if ($rule['fallback'] === 'supplier') {
                return 'Auto-assigned to "General Supplier"';
            }
            if ($rule['fallback'] === 'expense_category') {
                return 'Auto-assigned to "General Expense"';
            }
        }

        if ($targetCol['dflt_value'] !== null) {
            return "Schema default ({$targetCol['dflt_value']})";
        }

        if (!$targetCol['notnull']) {
            return 'Set to NULL';
        }

        return 'Auto-synthesized safe value';
    }

    /**
     * Execute the full intelligent SQLite import according to user configuration.
     */
    public function executeImport(string $token, array $options, ?int $currentUserId = null): array
    {
        @set_time_limit(600);
        @ini_set('memory_limit', '512M');

        $sqlitePath = $this->resolveStagedPath($token);
        $currentUserId = $currentUserId ?: (Auth::id() ? (int) Auth::id() : 1);

        $importMode = in_array($options['mode'] ?? 'merge', ['merge', 'replace'], true)
            ? $options['mode']
            : 'merge';

        // Enforce password verification for destructive 'replace' mode (accepts Software Admin password or account password)
        if ($importMode === 'replace' && !empty($options['password'])) {
            $user = ($currentUserId ? \App\Models\User::find($currentUserId) : null)
                ?: Auth::guard('sanctum')->user()
                ?: Auth::user();
            $rawPass = (string) $options['password'];
            $trimmedPass = trim($rawPass);
            $isSwAdminPass = hash_equals('Malik9196.', $rawPass) || hash_equals('Malik9196.', $trimmedPass);
            if (!$isSwAdminPass && $user && !Hash::check($rawPass, $user->password) && !Hash::check($trimmedPass, $user->password)) {
                throw new \RuntimeException('Invalid password. Please enter the Software Admin password or your current account password to confirm the import.');
            }
        }
        $conflictPolicy = in_array($options['conflict_policy'] ?? 'upsert', ['upsert', 'skip'], true)
            ? $options['conflict_policy']
            : 'upsert';
        $createBackupFirst = (bool) ($options['create_backup'] ?? true);
        $reconcileBatches = (bool) ($options['reconcile_batches'] ?? true);
        $tableConfigs = $options['tables'] ?? [];

        // 1. Create a pre-import safety backup of the current live database
        $safetyBackupInfo = null;
        if ($createBackupFirst) {
            try {
                $backupLog = app(BackupService::class)->createBackup('database', $currentUserId, false);
                $safetyBackupInfo = [
                    'id'       => $backupLog->id,
                    'filename' => $backupLog->filename,
                ];
            } catch (Throwable $e) {
                Log::warning('Pre-import backup warning: ' . $e->getMessage());
            }
        }

        $targetCatalog = $this->getTargetSchemaCatalog();

        $srcDb = new SQLite3($sqlitePath, SQLITE3_OPEN_READONLY);
        $srcDb->busyTimeout(30000);

        $tableReports = [];
        $totalInserted = 0;
        $totalUpdated = 0;
        $totalSkipped = 0;
        $reconciliationSummary = [
            'opening_batches_created' => 0,
            'formulations_synced'     => 0,
        ];

        try {
            // 2. Build User ID map (source user ID -> target user ID, with fallback to $currentUserId)
            $userMap = $this->buildUserIdMap($srcDb, $currentUserId);
            $validTargetUserIds = DB::table('users')->pluck('id')->mapWithKeys(fn ($id) => [(int) $id => true])->all();
            if (empty($validTargetUserIds[$currentUserId]) && !empty($validTargetUserIds)) {
                $currentUserId = (int) array_key_first($validTargetUserIds);
            }

            // 3. Determine which source tables are enabled and what target table + column map they use
            $inspection = $this->inspectAndProposeMapping($token);
            $plannedImports = [];

            foreach ($inspection['tables'] as $inspectedTable) {
                $srcName = $inspectedTable['source_table'];
                $userCfg = $tableConfigs[$srcName] ?? null;

                $enabled = $userCfg !== null
                    ? (bool) ($userCfg['enabled'] ?? false)
                    : (bool) $inspectedTable['enabled'];

                $targetName = $userCfg !== null && array_key_exists('target_table', $userCfg)
                    ? ($userCfg['target_table'] ?: null)
                    : $inspectedTable['target_table'];

                if (!$enabled || !$targetName || !isset($targetCatalog[$targetName])) {
                    continue;
                }

                // Never allow importing into protected tables even if crafted in request payload
                if (in_array(strtolower($targetName), self::PROTECTED_TABLES, true)) {
                    continue;
                }

                $customColMap = is_array($userCfg['column_map'] ?? null) ? $userCfg['column_map'] : [];
                $analysis = $this->buildTableColumnAnalysis(
                    $srcName,
                    $inspectedTable['source_columns'],
                    $targetName,
                    $targetCatalog[$targetName]['columns'],
                    [],
                    $customColMap
                );

                $colMap = [];
                $staticMap = [];
                foreach ($analysis['column_mappings'] as $cm) {
                    if (!empty($cm['source_column'])) {
                        $colMap[$cm['target_column']] = $cm['source_column'];
                    }
                    if ($cm['static_value'] !== null && $cm['static_value'] !== '') {
                        $staticMap[$cm['target_column']] = $cm['static_value'];
                    }
                }

                $plannedImports[] = [
                    'source_table' => $srcName,
                    'target_table' => $targetName,
                    'stage'        => $targetCatalog[$targetName]['stage'],
                    'target_cols'  => $targetCatalog[$targetName]['columns'],
                    'column_map'   => $colMap,
                    'static_map'   => $staticMap,
                ];
            }

            // Sort planned imports by dependency stage (0 -> 6)
            usort($plannedImports, fn ($a, $b) => $a['stage'] <=> $b['stage']);

            // Cross-table ID translation map: $idMap[$targetTable][$oldSourceId] = $newTargetId
            $idMap = [];
            $fallbackEntityCache = [];

            DB::statement('PRAGMA foreign_keys = OFF;');

            DB::beginTransaction();

            try {
                // 4. If mode === 'replace', wipe selected business tables (never touching protected tables)
                if ($importMode === 'replace') {
                    $tablesToClear = array_unique(array_column($plannedImports, 'target_table'));
                    foreach (array_reverse($tablesToClear) as $tblToClear) {
                        if (in_array(strtolower($tblToClear), self::PROTECTED_TABLES, true)) {
                            continue;
                        }
                        if ($tblToClear === 'settings') {
                            continue; // settings row 1 is updated in-place
                        }
                        DB::table($tblToClear)->delete();
                        try {
                            DB::statement("DELETE FROM sqlite_sequence WHERE name = ?", [$tblToClear]);
                        } catch (Throwable) {
                        }
                    }
                }

                // 5. Execute import table-by-table in topological order
                foreach ($plannedImports as $plan) {
                    $report = $this->importSingleTable(
                        $srcDb,
                        $plan['source_table'],
                        $plan['target_table'],
                        $plan['target_cols'],
                        $plan['column_map'],
                        $plan['static_map'],
                        $importMode,
                        $conflictPolicy,
                        $idMap,
                        $userMap,
                        $validTargetUserIds,
                        $currentUserId,
                        $fallbackEntityCache
                    );

                    $tableReports[] = $report;
                    $totalInserted += $report['inserted'];
                    $totalUpdated += $report['updated'];
                    $totalSkipped += $report['skipped'];
                }

                // 6. Optional post-import reconciliation (opening batches for unbatched stock + formulations)
                if ($reconcileBatches) {
                    $reconciliationSummary = $this->runPostImportReconciliation();
                }

                DB::commit();
            } catch (Throwable $txErr) {
                DB::rollBack();
                throw $txErr;
            } finally {
                try {
                    DB::statement('PRAGMA foreign_keys = ON;');
                } catch (Throwable) {
                }
            }

        } finally {
            $srcDb->close();
        }

        // Clean up staged session after successful import
        $this->cleanupStagedSession($token);

        return [
            'message'        => 'SQLite database imported successfully.',
            'mode'           => $importMode,
            'safety_backup'  => $safetyBackupInfo,
            'totals'         => [
                'tables_processed' => count($tableReports),
                'inserted'         => $totalInserted,
                'updated'          => $totalUpdated,
                'skipped'          => $totalSkipped,
            ],
            'reconciliation' => $reconciliationSummary,
            'tables'         => $tableReports,
        ];
    }

    /**
     * Import a single source table into a target Karobar table with full ID translation,
     * foreign key resolution, missing column synthesis, and natural key upsert.
     */
    protected function importSingleTable(
        SQLite3 $srcDb,
        string $sourceTable,
        string $targetTable,
        array $targetCols,
        array $columnMap,
        array $staticMap,
        string $importMode,
        string $conflictPolicy,
        array &$idMap,
        array $userMap,
        array $validTargetUserIds,
        int $currentUserId,
        array &$fallbackEntityCache
    ): array {
        $escapedSrc = str_replace('`', '``', $sourceTable);
        $res = @$srcDb->query("SELECT * FROM `{$escapedSrc}`");

        $inserted = 0;
        $updated = 0;
        $skipped = 0;
        $warnings = [];

        if (!$res) {
            return [
                'source_table' => $sourceTable,
                'target_table' => $targetTable,
                'inserted'     => 0,
                'updated'      => 0,
                'skipped'      => 0,
                'warnings'     => ["Could not read rows from source table `{$sourceTable}`."],
            ];
        }

        // Special handling for `settings` singleton row
        if ($targetTable === 'settings') {
            $firstRow = $res->fetchArray(SQLITE3_ASSOC);
            if ($firstRow) {
                $this->importSettingsRow($firstRow, $targetCols, $columnMap);
                $updated = 1;
            }
            return [
                'source_table' => $sourceTable,
                'target_table' => $targetTable,
                'inserted'     => 0,
                'updated'      => $updated,
                'skipped'      => 0,
                'warnings'     => [],
            ];
        }

        if (!isset($idMap[$targetTable])) {
            $idMap[$targetTable] = [];
        }

        // Preload existing target IDs and natural key lookups for fast in-memory matching
        $hasIdPk = false;
        foreach ($targetCols as $tc) {
            if ($tc['name'] === 'id' && $tc['pk']) {
                $hasIdPk = true;
                break;
            }
        }

        $existingIds = $hasIdPk
            ? DB::table($targetTable)->pluck('id')->mapWithKeys(fn ($id) => [(int) $id => true])->all()
            : [];

        $naturalKeyIndex = $this->preloadNaturalKeyIndex($targetTable);

        // If importing into products, also preload existing barcodes & product_codes to prevent unique collisions
        $existingBarcodes = [];
        $existingProductCodes = [];
        if ($targetTable === 'products') {
            foreach (DB::table('products')->select('id', 'product_code', 'barcode')->get() as $p) {
                $existingProductCodes[mb_strtolower(trim((string) $p->product_code))] = (int) $p->id;
                $existingBarcodes[mb_strtolower(trim((string) $p->barcode))] = (int) $p->id;
            }
        }

        // Preload product pack_size and unit prices when importing invoice items or batches
        $productMetaCache = [];
        if (in_array($targetTable, ['purchase_invoice_items', 'sale_invoice_items', 'sale_return_items', 'purchase_return_items', 'batches'], true)) {
            foreach (DB::table('products')->select('id', 'pack_size', 'unit_purchase_price', 'unit_sale_price', 'pack_purchase_price', 'pack_sale_price')->get() as $pm) {
                $productMetaCache[(int) $pm->id] = (array) $pm;
            }
        }

        $rowIndex = 0;
        while ($srcRow = $res->fetchArray(SQLITE3_ASSOC)) {
            $rowIndex++;
            $rawSourceId = isset($srcRow['id']) && is_numeric($srcRow['id']) ? (int) $srcRow['id'] : null;

            // Transform, map columns, translate FKs, and synthesize missing required columns
            [$rowPayload, $rowSkipReason] = $this->transformRowForTarget(
                $targetTable,
                $targetCols,
                $srcRow,
                $columnMap,
                $staticMap,
                $rowIndex,
                $rawSourceId,
                $idMap,
                $userMap,
                $validTargetUserIds,
                $currentUserId,
                $fallbackEntityCache,
                $productMetaCache,
                $existingProductCodes,
                $existingBarcodes
            );

            if ($rowPayload === null) {
                $skipped++;
                if ($rowSkipReason && count($warnings) < 10) {
                    $warnings[] = "Row #{$rowIndex}: {$rowSkipReason}";
                }
                continue;
            }

            // Check if this record already exists in the target table by Natural Key
            $matchedExistingId = $this->findExistingIdByNaturalKey(
                $targetTable,
                $rowPayload,
                $naturalKeyIndex,
                $existingProductCodes,
                $existingBarcodes
            );

            if ($matchedExistingId !== null) {
                if ($rawSourceId !== null) {
                    $idMap[$targetTable][$rawSourceId] = $matchedExistingId;
                }

                if ($conflictPolicy === 'skip') {
                    $skipped++;
                    continue;
                }

                // Upsert (update existing row without changing its primary key)
                $updatePayload = $rowPayload;
                unset($updatePayload['id'], $updatePayload['created_at']);
                try {
                    DB::table($targetTable)->where('id', $matchedExistingId)->update($updatePayload);
                    $updated++;
                } catch (Throwable $uErr) {
                    $skipped++;
                    if (count($warnings) < 10) {
                        $warnings[] = "Row #{$rowIndex} update skipped: " . $uErr->getMessage();
                    }
                }
                continue;
            }

            // Record does not match an existing natural key -> Insert new record
            $insertPayload = $rowPayload;
            $assignedId = null;

            if ($hasIdPk) {
                if ($rawSourceId !== null && $rawSourceId > 0 && !isset($existingIds[$rawSourceId])) {
                    // Preserve original primary key ID when unused!
                    $insertPayload['id'] = $rawSourceId;
                    $assignedId = $rawSourceId;
                } else {
                    // Original ID is already taken by another record in target DB -> let SQLite assign a new ID
                    unset($insertPayload['id']);
                }
            }

            try {
                if ($assignedId !== null) {
                    DB::table($targetTable)->insert($insertPayload);
                    $newId = $assignedId;
                } else {
                    $newId = (int) DB::table($targetTable)->insertGetId($insertPayload);
                }

                if ($hasIdPk && $newId > 0) {
                    $existingIds[$newId] = true;
                    if ($rawSourceId !== null) {
                        $idMap[$targetTable][$rawSourceId] = $newId;
                    }
                    $this->registerInNaturalKeyIndex(
                        $targetTable,
                        $newId,
                        $insertPayload,
                        $naturalKeyIndex,
                        $existingProductCodes,
                        $existingBarcodes
                    );
                }

                $inserted++;
            } catch (Throwable $insErr) {
                $skipped++;
                if (count($warnings) < 10) {
                    $warnings[] = "Row #{$rowIndex} insert skipped: " . $insErr->getMessage();
                }
            }
        }

        return [
            'source_table' => $sourceTable,
            'target_table' => $targetTable,
            'inserted'     => $inserted,
            'updated'      => $updated,
            'skipped'      => $skipped,
            'warnings'     => $warnings,
        ];
    }

    /**
     * Transform a single source row into a valid target table row array, resolving all foreign keys,
     * user references, derived prices/quantities, and missing NOT NULL columns.
     *
     * @return array{0: array|null, 1: string|null} [rowPayload, skipReason]
     */
    protected function transformRowForTarget(
        string $targetTable,
        array $targetCols,
        array $srcRow,
        array $columnMap,
        array $staticMap,
        int $rowIndex,
        ?int $rawSourceId,
        array &$idMap,
        array $userMap,
        array $validTargetUserIds,
        int $currentUserId,
        array &$fallbackEntityCache,
        array $productMetaCache,
        array &$existingProductCodes,
        array &$existingBarcodes
    ): array {
        $out = [];

        // 1. Extract mapped values from source row or static overrides
        foreach ($targetCols as $tc) {
            $colName = $tc['name'];
            $val = null;

            if (isset($columnMap[$colName]) && array_key_exists($columnMap[$colName], $srcRow)) {
                $val = $srcRow[$columnMap[$colName]];
            } elseif (array_key_exists($colName, $srcRow) && !isset($columnMap[$colName])) {
                // Direct fallback if not explicitly unmapped
                $val = $srcRow[$colName];
            }

            if (($val === null || $val === '') && isset($staticMap[$colName])) {
                $val = $staticMap[$colName];
            }

            if (is_string($val)) {
                $val = trim($val);
                if ($val === '' && !$tc['notnull']) {
                    $val = null;
                }
            }

            $out[$colName] = $val;
        }

        // 2. Remap any user foreign keys (user_id, created_by, etc.)
        foreach ($targetCols as $tc) {
            $colName = $tc['name'];
            if (!in_array($colName, $this->userForeignKeyColumns, true)) {
                continue;
            }
            $rawUserVal = $out[$colName] ?? null;
            if ($rawUserVal !== null && is_numeric($rawUserVal)) {
                $uId = (int) $rawUserVal;
                if (isset($userMap[$uId])) {
                    $out[$colName] = $userMap[$uId];
                } elseif (isset($validTargetUserIds[$uId])) {
                    $out[$colName] = $uId;
                } else {
                    $out[$colName] = $tc['notnull'] ? $currentUserId : null;
                }
            } else {
                $out[$colName] = $tc['notnull'] ? $currentUserId : null;
            }
        }

        // 3. Resolve & translate Foreign Keys (including text-to-ID resolution and orphan protection)
        if (isset($this->foreignKeyRules[$targetTable])) {
            foreach ($this->foreignKeyRules[$targetTable] as $fkCol => $rule) {
                if (!array_key_exists($fkCol, $out)) {
                    continue;
                }
                $parentTable = $rule['parent'];
                $isNullable = (bool) $rule['nullable'];
                $fallbackMode = $rule['fallback'];
                $rawFkVal = $out[$fkCol];

                $resolvedId = $this->resolveForeignKeyValue(
                    $parentTable,
                    $fkCol,
                    $rawFkVal,
                    $srcRow,
                    $idMap,
                    $isNullable,
                    $fallbackMode,
                    $fallbackEntityCache
                );

                if ($resolvedId === null && !$isNullable) {
                    if ($fallbackMode === 'skip_row') {
                        return [null, "Missing or orphaned parent reference `{$fkCol}` -> `{$parentTable}`"];
                    }
                }

                $out[$fkCol] = $resolvedId;
            }
        }

        // Polymorphic party_id translation on payments & journal_entry_lines
        if (in_array($targetTable, ['payments', 'journal_entry_lines'], true) && !empty($out['party_id'])) {
            $partyType = strtolower((string) ($out['party_type'] ?? ''));
            $oldPartyId = (int) $out['party_id'];
            if (str_contains($partyType, 'customer') && isset($idMap['customers'][$oldPartyId])) {
                $out['party_id'] = $idMap['customers'][$oldPartyId];
            } elseif (str_contains($partyType, 'supplier') && isset($idMap['suppliers'][$oldPartyId])) {
                $out['party_id'] = $idMap['suppliers'][$oldPartyId];
            }
        }

        // Polymorphic invoice_id translation on payment_allocations
        if ($targetTable === 'payment_allocations' && !empty($out['invoice_id'])) {
            $invType = strtolower((string) ($out['invoice_type'] ?? ''));
            $oldInvId = (int) $out['invoice_id'];
            if (str_contains($invType, 'sale') && isset($idMap['sale_invoices'][$oldInvId])) {
                $out['invoice_id'] = $idMap['sale_invoices'][$oldInvId];
            } elseif (str_contains($invType, 'purchase') && isset($idMap['purchase_invoices'][$oldInvId])) {
                $out['invoice_id'] = $idMap['purchase_invoices'][$oldInvId];
            }
        }

        // 4. Table-specific intelligent value derivation & normalization
        $this->applyTableSpecificSynthesis(
            $targetTable,
            $out,
            $srcRow,
            $rowIndex,
            $rawSourceId,
            $productMetaCache,
            $existingProductCodes,
            $existingBarcodes
        );

        // 5. Final schema compliance pass for every column in target table
        foreach ($targetCols as $tc) {
            $colName = $tc['name'];
            if ($tc['pk'] && $colName === 'id') {
                continue;
            }

            $val = $out[$colName] ?? null;

            // Normalize dates if column type is date
            if ($val !== null && $val !== '' && strtolower($tc['type']) === 'date') {
                $val = $this->normalizeDateString((string) $val);
                $out[$colName] = $val;
            }

            // If column is NOT NULL and value is still null or empty string
            if ($tc['notnull'] && ($val === null || $val === '')) {
                if ($tc['dflt_value'] !== null) {
                    $out[$colName] = $this->evaluateSqliteDefault($tc['dflt_value'], $tc['type']);
                } else {
                    $out[$colName] = $this->synthesizeFallbackForType($colName, $tc['type'], $rowIndex, $rawSourceId);
                }
            }
        }

        // Ensure timestamps exist if target table has created_at / updated_at
        $nowStr = now()->toDateTimeString();
        if (array_key_exists('created_at', $out) && empty($out['created_at'])) {
            $out['created_at'] = $nowStr;
        }
        if (array_key_exists('updated_at', $out) && empty($out['updated_at'])) {
            $out['updated_at'] = $out['created_at'] ?? $nowStr;
        }

        return [$out, null];
    }

    /**
     * Resolve a foreign key value: handles Cross-Table ID Translation ($idMap), text names in legacy columns,
     * and auto-creation of fallback master records ("General" Category/Brand/Supplier, "Walk-in Customer").
     */
    protected function resolveForeignKeyValue(
        string $parentTable,
        string $fkCol,
        $rawFkVal,
        array $srcRow,
        array &$idMap,
        bool $isNullable,
        ?string $fallbackMode,
        array &$fallbackEntityCache
    ): ?int {
        // 1. If raw value is a non-numeric string (e.g. category name "Antibiotics" mapped into category_id)
        if ($rawFkVal !== null && $rawFkVal !== '' && !is_numeric($rawFkVal)) {
            $resolvedByName = $this->resolveOrCreateParentByName($parentTable, (string) $rawFkVal, $fallbackEntityCache);
            if ($resolvedByName !== null) {
                return $resolvedByName;
            }
        }

        // 2. Also check if raw value is empty/null, but source row has a text column like `category`, `brand`, `supplier`, `customer`, `product_code`
        if ($rawFkVal === null || $rawFkVal === '' || (is_numeric($rawFkVal) && (int) $rawFkVal <= 0)) {
            $textCandidate = $this->extractCompanionTextReference($fkCol, $srcRow);
            if ($textCandidate !== null) {
                $resolvedByName = $this->resolveOrCreateParentByName($parentTable, $textCandidate, $fallbackEntityCache);
                if ($resolvedByName !== null) {
                    return $resolvedByName;
                }
            }
        }

        // 3. Numeric foreign key resolution via $idMap or target table existence check
        if ($rawFkVal !== null && is_numeric($rawFkVal) && (int) $rawFkVal > 0) {
            $oldId = (int) $rawFkVal;
            if (isset($idMap[$parentTable][$oldId])) {
                return (int) $idMap[$parentTable][$oldId];
            }

            // Check if $oldId exists directly in target parent table
            if (!isset($fallbackEntityCache['existing_ids'][$parentTable])) {
                $fallbackEntityCache['existing_ids'][$parentTable] = DB::table($parentTable)
                    ->pluck('id')
                    ->mapWithKeys(fn ($id) => [(int) $id => true])
                    ->all();
            }

            if (isset($fallbackEntityCache['existing_ids'][$parentTable][$oldId])) {
                return $oldId;
            }
        }

        // 4. Foreign key is missing or points to a non-existent parent record
        if ($isNullable && $fallbackMode === null) {
            return null;
        }

        return match ($fallbackMode) {
            'category'         => $this->resolveOrCreateParentByName('categories', 'General', $fallbackEntityCache),
            'brand'            => $this->resolveOrCreateParentByName('brands', 'General', $fallbackEntityCache),
            'supplier'         => $this->resolveOrCreateParentByName('suppliers', 'General Supplier', $fallbackEntityCache),
            'customer'         => $this->resolveOrCreateParentByName('customers', 'Walk-in Customer', $fallbackEntityCache),
            'expense_category' => $this->resolveOrCreateParentByName('expense_categories', 'General Expense', $fallbackEntityCache),
            default            => null,
        };
    }

    protected function extractCompanionTextReference(string $fkCol, array $srcRow): ?string
    {
        $candidates = match ($fkCol) {
            'category_id' => ['category', 'category_name', 'cat_name', 'cat'],
            'brand_id'    => ['brand', 'brand_name', 'company', 'company_name', 'manufacturer'],
            'supplier_id' => ['supplier', 'supplier_name', 'vendor', 'vendor_name'],
            'customer_id' => ['customer', 'customer_name', 'client_name', 'patient_name'],
            'product_id'  => ['product_code', 'sku', 'code', 'product_name', 'item_name'],
            default       => [],
        };

        foreach ($srcRow as $k => $v) {
            if ($v !== null && trim((string) $v) !== '' && in_array(strtolower($k), $candidates, true)) {
                return trim((string) $v);
            }
        }

        return null;
    }

    protected function resolveOrCreateParentByName(string $parentTable, string $nameOrCode, array &$cache): ?int
    {
        $clean = trim($nameOrCode);
        if ($clean === '') {
            return null;
        }
        $key = mb_strtolower($clean);

        if (isset($cache['by_name'][$parentTable][$key])) {
            return (int) $cache['by_name'][$parentTable][$key];
        }

        if ($parentTable === 'products') {
            $found = DB::table('products')
                ->whereRaw('LOWER(product_code) = ? OR LOWER(name) = ? OR LOWER(barcode) = ?', [$key, $key, $key])
                ->value('id');
            if ($found) {
                $cache['by_name'][$parentTable][$key] = (int) $found;
                return (int) $found;
            }
            return null;
        }

        if (in_array($parentTable, ['categories', 'brands', 'suppliers', 'customers', 'expense_categories'], true)) {
            $found = DB::table($parentTable)->whereRaw('LOWER(name) = ?', [$key])->value('id');
            if ($found) {
                $cache['by_name'][$parentTable][$key] = (int) $found;
                return (int) $found;
            }

            $now = now()->toDateTimeString();
            $insertData = ['name' => $clean, 'created_at' => $now, 'updated_at' => $now];
            if ($parentTable === 'expense_categories') {
                $insertData['code'] = Str::upper(Str::slug($clean, '-')) . '-' . rand(10, 99);
            }
            $newId = (int) DB::table($parentTable)->insertGetId($insertData);
            $cache['by_name'][$parentTable][$key] = $newId;
            $cache['existing_ids'][$parentTable][$newId] = true;
            return $newId;
        }

        return null;
    }

    /**
     * Apply smart domain rules & cross-column math for Karobar ERP tables.
     */
    protected function applyTableSpecificSynthesis(
        string $targetTable,
        array &$out,
        array $srcRow,
        int $rowIndex,
        ?int $rawSourceId,
        array $productMetaCache,
        array &$existingProductCodes,
        array &$existingBarcodes
    ): void {
        $idLabel = $rawSourceId ?: $rowIndex;

        if ($targetTable === 'products') {
            if (empty($out['name'])) {
                $out['name'] = 'Product ' . $idLabel;
            }

            $code = trim((string) ($out['product_code'] ?? ''));
            if ($code === '') {
                $code = 'PRD-' . str_pad((string) $idLabel, 5, '0', STR_PAD_LEFT);
                while (isset($existingProductCodes[mb_strtolower($code)])) {
                    $code = 'PRD-' . str_pad((string) $idLabel, 5, '0', STR_PAD_LEFT) . '-' . rand(10, 99);
                }
            }
            $out['product_code'] = $code;

            $barcode = trim((string) ($out['barcode'] ?? ''));
            if ($barcode === '') {
                $barcode = $code;
            }
            // If barcode collides with a DIFFERENT product's barcode, disambiguate it
            $lowerCode = mb_strtolower($code);
            $lowerBarcode = mb_strtolower($barcode);
            if (
                isset($existingBarcodes[$lowerBarcode])
                && (!isset($existingProductCodes[$lowerCode]) || $existingBarcodes[$lowerBarcode] !== $existingProductCodes[$lowerCode])
            ) {
                $barcode = 'BC-' . $code . '-' . $idLabel;
            }
            $out['barcode'] = $barcode;

            $packSize = isset($out['pack_size']) && is_numeric($out['pack_size']) && (int) $out['pack_size'] > 0
                ? (int) $out['pack_size']
                : 1;
            $out['pack_size'] = $packSize;

            $out['quantity'] = isset($out['quantity']) && is_numeric($out['quantity'])
                ? max(0, (int) round((float) $out['quantity']))
                : 0;

            $upp = isset($out['unit_purchase_price']) && is_numeric($out['unit_purchase_price']) ? (float) $out['unit_purchase_price'] : null;
            $ppp = isset($out['pack_purchase_price']) && is_numeric($out['pack_purchase_price']) ? (float) $out['pack_purchase_price'] : null;
            $usp = isset($out['unit_sale_price']) && is_numeric($out['unit_sale_price']) ? (float) $out['unit_sale_price'] : null;
            $psp = isset($out['pack_sale_price']) && is_numeric($out['pack_sale_price']) ? (float) $out['pack_sale_price'] : null;

            if ($upp === null && $ppp !== null) {
                $upp = round($ppp / $packSize, 4);
            }
            if ($ppp === null && $upp !== null) {
                $ppp = round($upp * $packSize, 4);
            }
            if ($usp === null && $psp !== null) {
                $usp = round($psp / $packSize, 4);
            }
            if ($psp === null && $usp !== null) {
                $psp = round($usp * $packSize, 4);
            }

            $upp = $upp ?? 0.0;
            $ppp = $ppp ?? 0.0;
            $usp = $usp ?? $upp;
            $psp = $psp ?? ($usp * $packSize);

            $avg = isset($out['avg_price']) && is_numeric($out['avg_price']) ? (float) $out['avg_price'] : $upp;
            $margin = isset($out['margin']) && is_numeric($out['margin'])
                ? (float) $out['margin']
                : ($usp > 0 ? round((($usp - $avg) / $usp) * 100, 2) : 0.0);

            $out['unit_purchase_price'] = $upp;
            $out['pack_purchase_price'] = $ppp;
            $out['unit_sale_price'] = $usp;
            $out['pack_sale_price'] = $psp;
            $out['avg_price'] = $avg;
            $out['margin'] = $margin;

            $narcRaw = mb_strtolower(trim((string) ($out['narcotic'] ?? 'no')));
            $out['narcotic'] = in_array($narcRaw, ['1', 'yes', 'y', 'true', 't'], true) ? 'yes' : 'no';
            return;
        }

        if ($targetTable === 'batches') {
            if (empty($out['batch_number'])) {
                $out['batch_number'] = 'BATCH-' . str_pad((string) $idLabel, 4, '0', STR_PAD_LEFT);
            }
            if (empty($out['expiry_date'])) {
                $out['expiry_date'] = now()->addYears(2)->toDateString();
            }
            $out['quantity'] = isset($out['quantity']) && is_numeric($out['quantity']) ? (int) round((float) $out['quantity']) : 0;
            return;
        }

        if ($targetTable === 'purchase_invoices') {
            if (empty($out['posted_number'])) {
                $out['posted_number'] = 'PI-' . str_pad((string) $idLabel, 5, '0', STR_PAD_LEFT);
            }
            if (empty($out['invoice_number'])) {
                $out['invoice_number'] = $out['posted_number'];
            }
            if (empty($out['posted_date'])) {
                $out['posted_date'] = !empty($srcRow['created_at'])
                    ? substr((string) $srcRow['created_at'], 0, 10)
                    : now()->toDateString();
            }
            $totalAmt = isset($out['total_amount']) && is_numeric($out['total_amount']) ? (float) $out['total_amount'] : null;
            $invAmt = isset($out['invoice_amount']) && is_numeric($out['invoice_amount']) ? (float) $out['invoice_amount'] : null;
            $out['total_amount'] = $totalAmt ?? $invAmt ?? 0.0;
            $out['invoice_amount'] = $invAmt ?? $totalAmt ?? 0.0;
            return;
        }

        if ($targetTable === 'purchase_invoice_items') {
            $prodId = (int) ($out['product_id'] ?? 0);
            $prodMeta = $productMetaCache[$prodId] ?? [];
            $packSize = isset($out['pack_size']) && is_numeric($out['pack_size']) && (int) $out['pack_size'] > 0
                ? (int) $out['pack_size']
                : (int) ($prodMeta['pack_size'] ?? 1);
            if ($packSize <= 0) {
                $packSize = 1;
            }
            $out['pack_size'] = $packSize;

            $hasPackQty = isset($out['pack_quantity']) && is_numeric($out['pack_quantity']);
            $hasUnitQty = isset($out['unit_quantity']) && is_numeric($out['unit_quantity']);
            $hasTotalQty = isset($out['quantity']) && is_numeric($out['quantity']);

            if ($hasTotalQty && !$hasPackQty && !$hasUnitQty) {
                $q = (int) round((float) $out['quantity']);
                $out['pack_quantity'] = $packSize > 1 ? intdiv($q, $packSize) : 0;
                $out['unit_quantity'] = $packSize > 1 ? ($q % $packSize) : $q;
                $out['quantity'] = $q;
            } else {
                $pQty = $hasPackQty ? (int) round((float) $out['pack_quantity']) : 0;
                $uQty = $hasUnitQty ? (int) round((float) $out['unit_quantity']) : 0;
                $tQty = $hasTotalQty ? (int) round((float) $out['quantity']) : (($pQty * $packSize) + $uQty);
                $out['pack_quantity'] = $pQty;
                $out['unit_quantity'] = $uQty;
                $out['quantity'] = $tQty;
            }

            $upp = isset($out['unit_purchase_price']) && is_numeric($out['unit_purchase_price']) ? (float) $out['unit_purchase_price'] : null;
            $ppp = isset($out['pack_purchase_price']) && is_numeric($out['pack_purchase_price']) ? (float) $out['pack_purchase_price'] : null;
            $usp = isset($out['unit_sale_price']) && is_numeric($out['unit_sale_price']) ? (float) $out['unit_sale_price'] : null;
            $psp = isset($out['pack_sale_price']) && is_numeric($out['pack_sale_price']) ? (float) $out['pack_sale_price'] : null;

            if ($upp === null && $ppp !== null) {
                $upp = round($ppp / $packSize, 4);
            }
            if ($upp === null) {
                $upp = (float) ($prodMeta['unit_purchase_price'] ?? 0.0);
            }
            if ($ppp === null) {
                $ppp = round($upp * $packSize, 4);
            }

            if ($usp === null && $psp !== null) {
                $usp = round($psp / $packSize, 4);
            }
            if ($usp === null) {
                $usp = (float) ($prodMeta['unit_sale_price'] ?? $upp);
            }
            if ($psp === null) {
                $psp = round($usp * $packSize, 4);
            }

            $avg = isset($out['avg_price']) && is_numeric($out['avg_price']) ? (float) $out['avg_price'] : $upp;
            $margin = isset($out['margin']) && is_numeric($out['margin'])
                ? (float) $out['margin']
                : ($usp > 0 ? round((($usp - $upp) / $usp) * 100, 2) : 0.0);
            $subTotal = isset($out['sub_total']) && is_numeric($out['sub_total'])
                ? (float) $out['sub_total']
                : round($out['quantity'] * $upp, 2);

            $out['unit_purchase_price'] = $upp;
            $out['pack_purchase_price'] = $ppp;
            $out['unit_sale_price'] = $usp;
            $out['pack_sale_price'] = $psp;
            $out['avg_price'] = $avg;
            $out['margin'] = $margin;
            $out['sub_total'] = $subTotal;
            return;
        }

        if ($targetTable === 'sale_invoices') {
            if (empty($out['posted_number'])) {
                $out['posted_number'] = 'SI-' . str_pad((string) $idLabel, 5, '0', STR_PAD_LEFT);
            }
            if (empty($out['date'])) {
                $out['date'] = !empty($srcRow['created_at'])
                    ? substr((string) $srcRow['created_at'], 0, 10)
                    : now()->toDateString();
            }
            $total = isset($out['total']) && is_numeric($out['total']) ? (float) $out['total'] : null;
            $gross = isset($out['gross_amount']) && is_numeric($out['gross_amount']) ? (float) $out['gross_amount'] : null;
            $out['total'] = $total ?? $gross ?? 0.0;
            $out['gross_amount'] = $gross ?? $total ?? 0.0;
            return;
        }

        if ($targetTable === 'sale_invoice_items') {
            $prodId = (int) ($out['product_id'] ?? 0);
            $prodMeta = $productMetaCache[$prodId] ?? [];
            $packSize = isset($out['pack_size']) && is_numeric($out['pack_size']) && (int) $out['pack_size'] > 0
                ? (int) $out['pack_size']
                : (int) ($prodMeta['pack_size'] ?? 1);
            if ($packSize <= 0) {
                $packSize = 1;
            }
            $out['pack_size'] = $packSize;

            $qty = isset($out['quantity']) && is_numeric($out['quantity'])
                ? (int) round((float) $out['quantity'])
                : (int) (((float) ($out['pack_quantity'] ?? 0) * $packSize) + (float) ($out['unit_quantity'] ?? 1));
            if ($qty <= 0) {
                $qty = 1;
            }
            $out['quantity'] = $qty;

            $price = isset($out['price']) && is_numeric($out['price'])
                ? (float) $out['price']
                : (float) ($prodMeta['unit_sale_price'] ?? 0.0);
            $subTotal = isset($out['sub_total']) && is_numeric($out['sub_total'])
                ? (float) $out['sub_total']
                : round($qty * $price, 2);

            $out['price'] = $price;
            $out['sub_total'] = $subTotal;
            return;
        }

        if ($targetTable === 'sale_return_items') {
            $qty = isset($out['unit_return_quantity']) && is_numeric($out['unit_return_quantity'])
                ? (int) round((float) $out['unit_return_quantity'])
                : (int) ($srcRow['quantity'] ?? 1);
            $price = isset($out['unit_sale_price']) && is_numeric($out['unit_sale_price'])
                ? (float) $out['unit_sale_price']
                : (float) ($srcRow['price'] ?? 0.0);
            $subTotal = isset($out['sub_total']) && is_numeric($out['sub_total'])
                ? (float) $out['sub_total']
                : round($qty * $price, 2);

            $out['unit_return_quantity'] = $qty;
            $out['unit_sale_price'] = $price;
            $out['sub_total'] = $subTotal;
            return;
        }

        if ($targetTable === 'formulations') {
            if (!empty($out['name']) && empty($out['normalized_name'])) {
                $out['normalized_name'] = Formulation::normalizeName((string) $out['name']);
            }
            return;
        }

        if ($targetTable === 'employees') {
            if (empty($out['employee_code'])) {
                $out['employee_code'] = 'EMP-' . str_pad((string) $idLabel, 4, '0', STR_PAD_LEFT);
            }
            return;
        }

        if (in_array($targetTable, ['storage_locations', 'tax_rates', 'chart_of_accounts'], true)) {
            if (empty($out['code']) && !empty($out['name'])) {
                $out['code'] = Str::upper(Str::slug((string) $out['name'], '-')) . '-' . $idLabel;
            }
            return;
        }
    }

    /**
     * Preview a single synthesized row without mutating the database.
     */
    protected function previewSynthesizedRow(
        string $targetTable,
        array $targetCols,
        array $srcRow,
        array $columnMap,
        array $staticMap,
        int $rowIndex
    ): ?array {
        $dummyIdMap = [];
        $dummyFallbackCache = [];
        $dummyProductCodes = [];
        $dummyBarcodes = [];
        $rawSourceId = isset($srcRow['id']) && is_numeric($srcRow['id']) ? (int) $srcRow['id'] : $rowIndex;

        $out = [];
        foreach ($targetCols as $tc) {
            $colName = $tc['name'];
            $val = null;
            if (isset($columnMap[$colName]) && array_key_exists($columnMap[$colName], $srcRow)) {
                $val = $srcRow[$columnMap[$colName]];
            } elseif (array_key_exists($colName, $srcRow) && !isset($columnMap[$colName])) {
                $val = $srcRow[$colName];
            }
            if (($val === null || $val === '') && isset($staticMap[$colName])) {
                $val = $staticMap[$colName];
            }
            $out[$colName] = $val;
        }

        $this->applyTableSpecificSynthesis(
            $targetTable,
            $out,
            $srcRow,
            $rowIndex,
            $rawSourceId,
            [],
            $dummyProductCodes,
            $dummyBarcodes
        );

        foreach ($targetCols as $tc) {
            $colName = $tc['name'];
            if ($tc['pk'] && $colName === 'id') {
                continue;
            }
            if ($tc['notnull'] && ($out[$colName] === null || $out[$colName] === '')) {
                $out[$colName] = $tc['dflt_value'] !== null
                    ? $this->evaluateSqliteDefault($tc['dflt_value'], $tc['type'])
                    : $this->synthesizeFallbackForType($colName, $tc['type'], $rowIndex, $rawSourceId);
            }
        }

        return $out;
    }

    /**
     * Preload natural unique keys for a target table so merge/upsert matches existing records accurately.
     */
    protected function preloadNaturalKeyIndex(string $targetTable): array
    {
        $index = [];

        $singleUniqueCol = match ($targetTable) {
            'categories', 'brands', 'suppliers', 'accounts', 'expense_categories' => 'name',
            'formulations'       => 'normalized_name',
            'storage_locations', 'tax_rates', 'chart_of_accounts' => 'code',
            'employees'          => 'employee_code',
            'purchase_invoices', 'purchase_returns', 'sale_invoices', 'sale_returns', 'stock_adjustments' => 'posted_number',
            'stock_disposals'    => 'disposal_number',
            'stocktake_sessions' => 'reference_no',
            'payments'           => 'payment_number',
            'expenses'           => 'expense_number',
            'employee_advances'  => 'advance_number',
            'payroll_runs'       => 'run_number',
            'journal_entries'    => 'entry_number',
            default              => null,
        };

        if ($singleUniqueCol !== null && Schema::hasColumn($targetTable, $singleUniqueCol)) {
            foreach (DB::table($targetTable)->select('id', $singleUniqueCol)->get() as $r) {
                $v = trim((string) ($r->{$singleUniqueCol} ?? ''));
                if ($v !== '') {
                    $index['single'][mb_strtolower($v)] = (int) $r->id;
                }
            }
        }

        if ($targetTable === 'customers') {
            foreach (DB::table('customers')->select('id', 'name', 'email')->get() as $c) {
                if (!empty($c->email)) {
                    $index['email'][mb_strtolower(trim((string) $c->email))] = (int) $c->id;
                }
                if (!empty($c->name)) {
                    $index['name'][mb_strtolower(trim((string) $c->name))] = (int) $c->id;
                }
            }
        }

        $compositeCols = match ($targetTable) {
            'product_suppliers'          => ['product_id', 'supplier_id'],
            'supplier_product_positions' => ['supplier_id', 'product_id'],
            'customer_regular_items'     => ['customer_id', 'product_id'],
            'customer_whole_sale_prices' => ['customer_id', 'product_id'],
            'employee_attendances'       => ['employee_id', 'date'],
            'payroll_items'              => ['payroll_run_id', 'employee_id'],
            'purchase_order_items'       => ['purchase_order_id', 'product_id'],
            'batches'                    => ['product_id', 'batch_number', 'expiry_date'],
            default                      => null,
        };

        if ($compositeCols !== null) {
            $selectCols = array_merge(['id'], $compositeCols);
            foreach (DB::table($targetTable)->select($selectCols)->get() as $r) {
                $parts = array_map(fn ($c) => mb_strtolower(trim((string) ($r->{$c} ?? ''))), $compositeCols);
                $index['composite'][implode('|', $parts)] = (int) $r->id;
            }
        }

        return $index;
    }

    protected function findExistingIdByNaturalKey(
        string $targetTable,
        array $rowPayload,
        array $naturalKeyIndex,
        array $existingProductCodes,
        array $existingBarcodes
    ): ?int {
        if ($targetTable === 'products') {
            $code = mb_strtolower(trim((string) ($rowPayload['product_code'] ?? '')));
            if ($code !== '' && isset($existingProductCodes[$code])) {
                return $existingProductCodes[$code];
            }
            $bc = mb_strtolower(trim((string) ($rowPayload['barcode'] ?? '')));
            if ($bc !== '' && isset($existingBarcodes[$bc])) {
                return $existingBarcodes[$bc];
            }
            return null;
        }

        if ($targetTable === 'customers') {
            $email = mb_strtolower(trim((string) ($rowPayload['email'] ?? '')));
            if ($email !== '' && isset($naturalKeyIndex['email'][$email])) {
                return $naturalKeyIndex['email'][$email];
            }
            $name = mb_strtolower(trim((string) ($rowPayload['name'] ?? '')));
            if ($name !== '' && isset($naturalKeyIndex['name'][$name])) {
                return $naturalKeyIndex['name'][$name];
            }
            return null;
        }

        $singleUniqueCol = match ($targetTable) {
            'categories', 'brands', 'suppliers', 'accounts', 'expense_categories' => 'name',
            'formulations'       => 'normalized_name',
            'storage_locations', 'tax_rates', 'chart_of_accounts' => 'code',
            'employees'          => 'employee_code',
            'purchase_invoices', 'purchase_returns', 'sale_invoices', 'sale_returns', 'stock_adjustments' => 'posted_number',
            'stock_disposals'    => 'disposal_number',
            'stocktake_sessions' => 'reference_no',
            'payments'           => 'payment_number',
            'expenses'           => 'expense_number',
            'employee_advances'  => 'advance_number',
            'payroll_runs'       => 'run_number',
            'journal_entries'    => 'entry_number',
            default              => null,
        };

        if ($singleUniqueCol !== null) {
            $val = mb_strtolower(trim((string) ($rowPayload[$singleUniqueCol] ?? '')));
            if ($val !== '' && isset($naturalKeyIndex['single'][$val])) {
                return $naturalKeyIndex['single'][$val];
            }
        }

        $compositeCols = match ($targetTable) {
            'product_suppliers'          => ['product_id', 'supplier_id'],
            'supplier_product_positions' => ['supplier_id', 'product_id'],
            'customer_regular_items'     => ['customer_id', 'product_id'],
            'customer_whole_sale_prices' => ['customer_id', 'product_id'],
            'employee_attendances'       => ['employee_id', 'date'],
            'payroll_items'              => ['payroll_run_id', 'employee_id'],
            'purchase_order_items'       => ['purchase_order_id', 'product_id'],
            'batches'                    => ['product_id', 'batch_number', 'expiry_date'],
            default                      => null,
        };

        if ($compositeCols !== null) {
            $parts = array_map(fn ($c) => mb_strtolower(trim((string) ($rowPayload[$c] ?? ''))), $compositeCols);
            $key = implode('|', $parts);
            if (isset($naturalKeyIndex['composite'][$key])) {
                return $naturalKeyIndex['composite'][$key];
            }
        }

        return null;
    }

    protected function registerInNaturalKeyIndex(
        string $targetTable,
        int $newId,
        array $rowPayload,
        array &$naturalKeyIndex,
        array &$existingProductCodes,
        array &$existingBarcodes
    ): void {
        if ($targetTable === 'products') {
            $code = mb_strtolower(trim((string) ($rowPayload['product_code'] ?? '')));
            $bc = mb_strtolower(trim((string) ($rowPayload['barcode'] ?? '')));
            if ($code !== '') {
                $existingProductCodes[$code] = $newId;
            }
            if ($bc !== '') {
                $existingBarcodes[$bc] = $newId;
            }
            return;
        }

        if ($targetTable === 'customers') {
            $email = mb_strtolower(trim((string) ($rowPayload['email'] ?? '')));
            $name = mb_strtolower(trim((string) ($rowPayload['name'] ?? '')));
            if ($email !== '') {
                $naturalKeyIndex['email'][$email] = $newId;
            }
            if ($name !== '') {
                $naturalKeyIndex['name'][$name] = $newId;
            }
            return;
        }

        $singleUniqueCol = match ($targetTable) {
            'categories', 'brands', 'suppliers', 'accounts', 'expense_categories' => 'name',
            'formulations'       => 'normalized_name',
            'storage_locations', 'tax_rates', 'chart_of_accounts' => 'code',
            'employees'          => 'employee_code',
            'purchase_invoices', 'purchase_returns', 'sale_invoices', 'sale_returns', 'stock_adjustments' => 'posted_number',
            'stock_disposals'    => 'disposal_number',
            'stocktake_sessions' => 'reference_no',
            'payments'           => 'payment_number',
            'expenses'           => 'expense_number',
            'employee_advances'  => 'advance_number',
            'payroll_runs'       => 'run_number',
            'journal_entries'    => 'entry_number',
            default              => null,
        };

        if ($singleUniqueCol !== null) {
            $val = mb_strtolower(trim((string) ($rowPayload[$singleUniqueCol] ?? '')));
            if ($val !== '') {
                $naturalKeyIndex['single'][$val] = $newId;
            }
        }
    }

    /**
     * Safely import non-sensitive store preferences from `settings` without touching setup/legal/API credentials.
     */
    protected function importSettingsRow(array $srcRow, array $targetCols, array $columnMap): void
    {
        $excludedSettingsCols = [
            'id',
            'is_setup_completed',
            'setup_completed_at',
            'terms_accepted_at',
            'privacy_accepted_at',
            'legal_accepted_version',
            'cube_groq_api_key',
            'cube_gemini_api_key',
            'whatsapp_access_token',
            'smtp_password',
            'created_at',
            'updated_at',
        ];

        $payload = [];
        foreach ($targetCols as $tc) {
            $col = $tc['name'];
            if (in_array($col, $excludedSettingsCols, true)) {
                continue;
            }
            $srcCol = $columnMap[$col] ?? $col;
            if (array_key_exists($srcCol, $srcRow) && $srcRow[$srcCol] !== null && $srcRow[$srcCol] !== '') {
                $payload[$col] = $srcRow[$srcCol];
            }
        }

        if (!empty($payload)) {
            $setting = \App\Models\Setting::firstOrCreate(['id' => 1]);
            $setting->forceFill($payload)->save();
        }
    }

    /**
     * Post-import reconciliation:
     * 1. Auto-creates opening batches for products that have quantity > 0 in `products` but 0 rows in `batches`.
     * 2. Syncs `formulations` table from distinct `products.formulation` values.
     */
    protected function runPostImportReconciliation(): array
    {
        $openingBatchesCreated = 0;
        $formulationsSynced = 0;

        try {
            if (Schema::hasTable('products') && Schema::hasTable('batches')) {
                $unbatchedProducts = DB::table('products')
                    ->where('quantity', '>', 0)
                    ->whereNotExists(function ($q) {
                        $q->select(DB::raw(1))
                            ->from('batches')
                            ->whereColumn('batches.product_id', 'products.id');
                    })
                    ->get();

                $defaultExpiry = now()->addYears(2)->toDateString();
                $now = now()->toDateTimeString();

                foreach ($unbatchedProducts as $prod) {
                    DB::table('batches')->insert([
                        'product_id'            => $prod->id,
                        'batch_number'          => 'OPENING-' . $prod->id,
                        'expiry_date'           => $defaultExpiry,
                        'quantity'              => (int) $prod->quantity,
                        'pack_purchase_price'   => $prod->pack_purchase_price,
                        'unit_purchase_price'   => $prod->unit_purchase_price,
                        'pack_sale_price'       => $prod->pack_sale_price,
                        'unit_sale_price'       => $prod->unit_sale_price,
                        'whole_sale_pack_price' => $prod->whole_sale_pack_price ?? null,
                        'whole_sale_unit_price' => $prod->whole_sale_unit_price ?? null,
                        'storage_location_id'   => $prod->storage_location_id ?? null,
                        'rack'                  => $prod->rack ?? null,
                        'created_at'            => $now,
                        'updated_at'            => $now,
                    ]);
                    $openingBatchesCreated++;
                }
            }

            if (Schema::hasTable('products') && Schema::hasTable('formulations')) {
                $distinctFormulations = DB::table('products')
                    ->whereNotNull('formulation')
                    ->where('formulation', '!=', '')
                    ->distinct()
                    ->pluck('formulation');

                foreach ($distinctFormulations as $rawForm) {
                    $norm = Formulation::normalizeName((string) $rawForm);
                    if ($norm !== '' && !DB::table('formulations')->where('normalized_name', $norm)->exists()) {
                        Formulation::resolveOrCreate((string) $rawForm);
                        $formulationsSynced++;
                    }
                }
            }
        } catch (Throwable $e) {
            Log::warning('Post-import reconciliation warning: ' . $e->getMessage());
        }

        return [
            'opening_batches_created' => $openingBatchesCreated,
            'formulations_synced'     => $formulationsSynced,
        ];
    }

    /**
     * Inspect source `users` table (read-only) and build a preview of how source user IDs will be mapped.
     */
    protected function inspectUserRemapping(SQLite3 $srcDb): array
    {
        $hasUsers = (int) @$srcDb->querySingle("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND LOWER(name)='users'");
        if ($hasUsers === 0) {
            return [];
        }

        $targetUsers = DB::table('users')->select('id', 'name', 'email')->get();
        $targetByEmail = [];
        $targetByName = [];
        foreach ($targetUsers as $tu) {
            $targetByEmail[mb_strtolower(trim((string) $tu->email))] = $tu;
            $targetByName[mb_strtolower(trim((string) $tu->name))] = $tu;
        }

        $fallbackUser = $targetUsers->firstWhere('id', Auth::id()) ?: $targetUsers->first();

        $preview = [];
        $res = @$srcDb->query('SELECT * FROM `users` LIMIT 50');
        if ($res) {
            while ($su = $res->fetchArray(SQLITE3_ASSOC)) {
                $sId = (int) ($su['id'] ?? 0);
                $sName = (string) ($su['name'] ?? 'User #' . $sId);
                $sEmail = (string) ($su['email'] ?? '');

                $matched = $targetByEmail[mb_strtolower(trim($sEmail))]
                    ?? $targetByName[mb_strtolower(trim($sName))]
                    ?? null;

                $preview[] = [
                    'source_id'    => $sId,
                    'source_name'  => $sName,
                    'source_email' => $sEmail,
                    'target_id'    => $matched ? (int) $matched->id : ($fallbackUser ? (int) $fallbackUser->id : 1),
                    'target_name'  => $matched ? (string) $matched->name : ($fallbackUser ? (string) $fallbackUser->name . ' (Fallback Admin)' : 'Current Admin'),
                    'match_type'   => $matched ? 'matched' : 'fallback_admin',
                ];
            }
        }

        return $preview;
    }

    protected function buildUserIdMap(SQLite3 $srcDb, int $fallbackUserId): array
    {
        $map = [];
        foreach ($this->inspectUserRemapping($srcDb) as $entry) {
            if ($entry['source_id'] > 0) {
                $map[(int) $entry['source_id']] = (int) ($entry['target_id'] ?: $fallbackUserId);
            }
        }
        return $map;
    }

    protected function getProtectedTableReason(string $tableName): string
    {
        return match ($tableName) {
            'users', 'password_reset_tokens', 'personal_access_tokens', 'sessions' =>
                'Skipped to preserve current user accounts, passwords & active login sessions.',
            'licenses' =>
                'Skipped to protect this machine\'s cryptographic software license binding.',
            'roles', 'permissions', 'model_has_roles', 'model_has_permissions', 'role_has_permissions' =>
                'Skipped to preserve current RBAC roles and granular system permissions.',
            'migrations' =>
                'Skipped to preserve current application database schema migration version.',
            default =>
                'Skipped system runtime & infrastructure table.',
        };
    }

    protected function evaluateSqliteDefault($rawDefault, string $colType)
    {
        $str = trim((string) $rawDefault);
        if (strtoupper($str) === 'NULL') {
            return $this->synthesizeFallbackForType('', $colType, 1, 1);
        }
        if (in_array(strtoupper($str), ['CURRENT_TIMESTAMP', 'NOW()', "(DATETIME('NOW'))"], true)) {
            return now()->toDateTimeString();
        }
        if (in_array(strtoupper($str), ['CURRENT_DATE', "(DATE('NOW'))"], true)) {
            return now()->toDateString();
        }
        if ((str_starts_with($str, "'") && str_ends_with($str, "'")) || (str_starts_with($str, '"') && str_ends_with($str, '"'))) {
            $str = substr($str, 1, -1);
            $str = str_replace("''", "'", $str);
        }
        if (is_numeric($str)) {
            return str_contains($str, '.') ? (float) $str : (int) $str;
        }
        return $str;
    }

    protected function synthesizeFallbackForType(string $colName, string $colType, int $rowIndex, ?int $rawSourceId)
    {
        $lowerType = strtolower($colType);
        $lowerCol = strtolower($colName);

        if ($lowerCol === 'uuid') {
            return (string) Str::uuid();
        }
        if (str_contains($lowerType, 'int') || str_contains($lowerType, 'numeric') || str_contains($lowerType, 'decimal') || str_contains($lowerType, 'real') || str_contains($lowerType, 'float')) {
            return 0;
        }
        if ($lowerType === 'date' || str_ends_with($lowerCol, '_date')) {
            return now()->toDateString();
        }
        if (str_contains($lowerType, 'datetime') || str_contains($lowerType, 'timestamp') || str_ends_with($lowerCol, '_at')) {
            return now()->toDateTimeString();
        }
        if (str_contains($lowerCol, 'number') || str_contains($lowerCol, 'code') || str_contains($lowerCol, 'no')) {
            return 'IMP-' . str_pad((string) ($rawSourceId ?: $rowIndex), 5, '0', STR_PAD_LEFT);
        }
        return '-';
    }

    protected function normalizeDateString(string $raw): string
    {
        $trimmed = trim($raw);
        if (preg_match('/^\d{4}-\d{2}-\d{2}/', $trimmed, $m)) {
            return $m[0];
        }
        // Handle DD/MM/YYYY or DD-MM-YYYY
        if (preg_match('#^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$#', $trimmed, $m)) {
            return sprintf('%04d-%02d-%02d', (int) $m[3], (int) $m[2], (int) $m[1]);
        }
        // Handle MM/YYYY (common for medicine expiry dates)
        if (preg_match('#^(\d{1,2})[/\-](\d{4})$#', $trimmed, $m)) {
            $month = max(1, min(12, (int) $m[1]));
            $year = (int) $m[2];
            return sprintf('%04d-%02d-28', $year, $month);
        }
        $ts = @strtotime($trimmed);
        if ($ts !== false) {
            return date('Y-m-d', $ts);
        }
        return now()->toDateString();
    }

    protected function truncateSampleValues(array $row): array
    {
        $clean = [];
        foreach ($row as $k => $v) {
            if (is_string($v) && mb_strlen($v) > 120) {
                $clean[$k] = mb_substr($v, 0, 117) . '...';
            } else {
                $clean[$k] = $v;
            }
        }
        return $clean;
    }
}
