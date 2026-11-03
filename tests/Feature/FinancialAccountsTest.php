<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\AccountTransaction;
use App\Models\Customer;
use App\Models\Product;
use App\Models\PurchaseInvoice;
use App\Models\SaleInvoice;
use App\Models\Supplier;
use App\Models\User;
use App\Services\AccountService;
use App\Services\CashDrawerService;
use Illuminate\Support\Facades\Gate;
use Tests\TestCase;

class FinancialAccountsTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        foreach ([
            '0001_01_01_000000_create_users_table.php',
            '2025_08_10_080111_create_permission_tables.php',
            '2025_08_10_100605_create_suppliers_table.php',
            '2025_08_10_103922_create_customers_table.php',
            '2025_08_10_113445_create_categories_table.php',
            '2025_08_10_113550_create_brands_table.php',
            '2025_08_10_151532_create_products_table.php',
            '2025_08_10_152438_create_batches_table.php',
            '2025_08_20_154726_create_purchase_invoices_table.php',
            '2025_08_20_154744_create_purchase_invoice_items_table.php',
            '2025_08_24_015207_create_purchase_returns_table.php',
            '2025_08_24_015215_create_purchase_return_items_table.php',
            '2025_09_08_012037_add_total_paid_to_purchase_invoices_table.php',
            '2025_09_26_000000_add_invoice_type_to_purchase_invoices_table.php',
            '2026_04_01_000000_add_whole_sale_prices_to_products_table.php',
            '2026_04_01_000001_add_whole_sale_prices_to_purchase_invoice_items_table.php',
            '2026_04_01_000002_add_whole_sale_margin_to_purchase_invoice_items_table.php',
            '2026_04_01_000003_add_whole_sale_margin_to_products_table.php',
            '2026_04_02_000002_create_customer_whole_sale_prices_table.php',
            '2025_08_30_171505_create_sale_invoices_table.php',
            '2025_08_30_171513_create_sale_invoice_items_table.php',
            '2025_09_01_074800_create_sale_returns_table.php',
            '2025_09_01_074814_create_sale_return_items_table.php',
            '2025_09_08_162536_add_total_receive_to_sale_invoices_table.php',
            '2025_09_25_000000_add_invoice_type_to_sale_invoices_table.php',
            '2026_04_02_000000_add_sale_type_to_sale_invoices_table.php',
            '2026_04_02_000001_add_sale_type_to_sale_invoice_items_table.php',
            '2026_04_02_000003_add_wholesale_type_to_sale_invoices_table.php',
            '2026_10_13_000006_add_sale_cost_snapshots.php',
            '2025_09_08_171931_create_customer_ledgers_table.php',
            '2025_09_08_013727_create_supplier_ledgers_table.php',
            '2025_09_21_102824_create_licenses_table.php',
            '2026_10_23_000001_create_invoice_drafts_table.php',
            '2026_10_23_000003_create_document_histories_and_invoice_reversals.php',
            '2026_10_23_000004_create_payments_and_allocations_tables.php',
            '2026_10_23_000005_add_payment_method_to_invoices_table.php',
            '2026_10_23_000006_create_cash_drawer_tables.php',
            '2026_10_23_000007_add_credit_terms_and_due_dates.php',
            '2026_10_23_000008_create_financial_accounts_tables.php',
            '2026_10_23_000009_add_code_and_icon_to_accounts_table.php',
            '2026_10_28_000001_add_cheque_fields_to_payments_table.php',
        ] as $file) {
            (require database_path('migrations/' . $file))->up();
        }

        Gate::before(fn () => true);
        $this->withoutMiddleware(\App\Http\Middleware\EnsureLicensed::class);
    }

    public function test_default_accounts_exist_and_can_be_retrieved(): void
    {
        $user = User::forceCreate([
            'name'     => 'Accountant User',
            'email'    => 'accountant@example.com',
            'password' => bcrypt('secret123'),
        ]);

        $this->actingAs($user);

        $res = $this->getJson('/api/accounts');
        $res->assertOk();
        $this->assertArrayHasKey('accounts', $res->json());
        $this->assertArrayHasKey('total_balance', $res->json());

        $names = collect($res->json('accounts'))->pluck('name')->all();
        $this->assertEquals(['Cash in Hand (Drawer)'], $names);
    }

    public function test_can_create_new_bank_account_with_opening_balance(): void
    {
        $user = User::forceCreate([
            'name'     => 'Accountant User',
            'email'    => 'accountant@example.com',
            'password' => bcrypt('secret123'),
        ]);

        $this->actingAs($user);

        $res = $this->postJson('/api/accounts', [
            'name'            => 'Meezan Bank - Gulberg',
            'type'            => 'bank',
            'bank_name'       => 'Meezan Bank',
            'account_number'  => '010203040506',
            'opening_balance' => 75000,
            'notes'           => 'Primary business operations account',
        ]);

        $res->assertStatus(201);
        $this->assertEquals(75000, $res->json('account.current_balance'));
        $this->assertEquals('Meezan Bank', $res->json('account.bank_name'));

        // Verify transaction was logged
        $accountId = $res->json('account.id');
        $txRes = $this->getJson("/api/accounts/{$accountId}/transactions");
        $txRes->assertOk();
        $this->assertEquals(1, count($txRes->json('transactions.data')));
        $this->assertEquals('opening_balance', $txRes->json('transactions.data.0.type'));
        $this->assertEquals(75000, $txRes->json('transactions.data.0.amount'));
    }

    public function test_transfer_between_cash_drawer_and_bank_account(): void
    {
        $user = User::forceCreate([
            'name'     => 'Cashier Manager',
            'email'    => 'manager@example.com',
            'password' => bcrypt('secret123'),
        ]);

        $this->actingAs($user);

        // Open drawer session
        app(CashDrawerService::class)->openSession($user, 10000, 'Shift opening float');

        $cashAcc = Account::where('type', 'cash')->first();
        $cashAcc->current_balance = 10000;
        $cashAcc->save();

        $bankAcc = Account::create([
            'name'            => 'HBL Business',
            'type'            => 'bank',
            'bank_name'       => 'HBL',
            'account_number'  => '9988776655',
            'opening_balance' => 5000,
            'current_balance' => 5000,
            'is_active'       => true,
        ]);

        // Transfer 4,000 from Cash Drawer to Bank
        $res = $this->postJson('/api/accounts/transfer', [
            'from_account_id' => $cashAcc->id,
            'to_account_id'   => $bankAcc->id,
            'amount'          => 4000,
            'notes'           => 'Evening cash deposit to bank',
        ]);

        $res->assertOk();
        $this->assertEquals(6000, $cashAcc->fresh()->current_balance);
        $this->assertEquals(9000, $bankAcc->fresh()->current_balance);

        // Verify active cash drawer session also updated (cash_out 4,000)
        $drawerSession = app(CashDrawerService::class)->getCurrentSession($user);
        $this->assertEquals(6000, $drawerSession->closing_balance_expected);
    }

    public function test_sale_invoice_with_bank_transfer_updates_bank_account_not_drawer(): void
    {
        $user = User::forceCreate([
            'name'     => 'POS Cashier',
            'email'    => 'pos@example.com',
            'password' => bcrypt('secret123'),
        ]);

        $this->actingAs($user);

        // Open cash drawer with 2,000
        app(CashDrawerService::class)->openSession($user, 2000);

        $customer = Customer::create(['name' => 'Walk-in Customer']);
        \Illuminate\Support\Facades\DB::table('categories')->insertOrIgnore(['id' => 1, 'name' => 'General Cat']);
        \Illuminate\Support\Facades\DB::table('brands')->insertOrIgnore(['id' => 1, 'name' => 'General Brand']);

        $product = Product::create([
            'category_id'         => 1,
            'brand_id'            => 1,
            'name'                => 'Test Medicine',
            'product_code'        => 'TM-01',
            'barcode'             => 'BC-TM-01',
            'pack_size'           => 1,
            'quantity'            => 50,
            'unit_purchase_price' => 300,
            'unit_sale_price'     => 500,
        ]);

        $bankAcc = Account::firstOrCreate(
            ['type' => 'bank', 'name' => 'Main Bank Account'],
            ['opening_balance' => 0, 'current_balance' => 0, 'is_active' => true, 'is_default' => false]
        );
        $initialBankBalance = (float)$bankAcc->current_balance;

        // Post sale invoice paying via Bank Transfer
        $res = $this->postJson('/api/sale-invoices', [
            'customer_id'    => $customer->id,
            'invoice_type'   => 'debit',
            'payment_method' => 'bank_transfer',
            'account_id'     => $bankAcc->id,
            'date'           => now()->format('Y-m-d'),
            'gross_amount'   => 1500,
            'total'          => 1500,
            'total_receive'  => 1500,
            'items'          => [
                [
                    'product_id' => $product->id,
                    'quantity'   => 3,
                    'price'      => 500,
                    'sub_total'  => 1500,
                ],
            ],
        ]);

        $res->assertStatus(201);

        // Bank account credited by 1500
        $this->assertEquals($initialBankBalance + 1500, (float)$bankAcc->fresh()->current_balance);

        // Cash drawer unaffected (stays at 2000)
        $drawerSession = app(CashDrawerService::class)->getCurrentSession($user);
        $this->assertEquals(2000, (float)$drawerSession->closing_balance_expected);
    }

    public function test_purchase_invoice_paying_from_specific_account_withdraws_correctly(): void
    {
        $user = User::forceCreate([
            'name'     => 'Procurement User',
            'email'    => 'procure@example.com',
            'password' => bcrypt('secret123'),
        ]);

        $this->actingAs($user);

        $supplier = Supplier::create(['name' => 'ABC Pharma']);
        \Illuminate\Support\Facades\DB::table('categories')->insertOrIgnore(['id' => 1, 'name' => 'General Cat']);
        \Illuminate\Support\Facades\DB::table('brands')->insertOrIgnore(['id' => 1, 'name' => 'General Brand']);

        $product = Product::create([
            'category_id'         => 1,
            'brand_id'            => 1,
            'supplier_id'         => $supplier->id,
            'name'                => 'Syrup Panadol',
            'product_code'        => 'SP-01',
            'barcode'             => 'BC-SP-01',
            'price'               => 150,
            'whole_sale_price'    => 140,
            'unit_purchase_price' => 100,
            'pack_purchase_price' => 1000,
            'pack_size'           => 10,
            'current_quantity'    => 20,
        ]);

        $walletAcc = Account::firstOrCreate(
            ['type' => 'mobile_wallet', 'name' => 'Mobile Wallet'],
            ['opening_balance' => 20000, 'current_balance' => 20000, 'is_active' => true, 'is_default' => false]
        );
        $walletAcc->current_balance = 20000;
        $walletAcc->save();

        // Create purchase invoice paid via mobile wallet
        $res = $this->postJson('/api/purchase-invoices', [
            'supplier_id'    => $supplier->id,
            'invoice_type'   => 'debit',
            'payment_method' => 'mobile_wallet',
            'account_id'     => $walletAcc->id,
            'invoice_number' => 'INV-PUR-9001',
            'invoice_amount' => 5000,
            'posted_date'    => now()->format('Y-m-d'),
            'total_amount'   => 5000,
            'total_paid'     => 5000,
            'items'          => [
                [
                    'product_id'          => $product->id,
                    'pack_quantity'       => 5,
                    'unit_quantity'       => 50,
                    'pack_purchase_price' => 1000,
                    'unit_purchase_price' => 100,
                    'pack_sale_price'     => 1500,
                    'unit_sale_price'     => 150,
                    'margin'              => 50,
                    'sub_total'           => 5000,
                    'avg_price'           => 100,
                    'quantity'            => 50,
                ],
            ],
        ]);

        $res->assertStatus(201);

        // Wallet balance decreased by 5,000 (from 20,000 to 15,000)
        $this->assertEquals(15000, (float)$walletAcc->fresh()->current_balance);
    }

    public function test_customer_payment_via_card_allocates_and_updates_card_account(): void
    {
        $user = User::forceCreate([
            'name'     => 'Cashier',
            'email'    => 'cashier@example.com',
            'password' => bcrypt('secret123'),
        ]);

        $this->actingAs($user);

        $customer = Customer::create(['name' => 'Corporate Client']);
        \Illuminate\Support\Facades\DB::table('categories')->insertOrIgnore(['id' => 1, 'name' => 'General Cat']);
        \Illuminate\Support\Facades\DB::table('brands')->insertOrIgnore(['id' => 1, 'name' => 'General Brand']);

        $product = Product::create([
            'category_id'         => 1,
            'brand_id'            => 1,
            'name'                => 'Bandage Pack',
            'product_code'        => 'BP-01',
            'barcode'             => 'BC-BP-01',
            'pack_size'           => 1,
            'quantity'            => 50,
            'unit_purchase_price' => 700,
            'unit_sale_price'     => 1000,
        ]);

        // Create credit sale invoice
        $invRes = $this->postJson('/api/sale-invoices', [
            'customer_id'    => $customer->id,
            'invoice_type'   => 'credit',
            'payment_method' => 'cash',
            'date'           => now()->format('Y-m-d'),
            'gross_amount'   => 3000,
            'total'          => 3000,
            'total_receive'  => 0,
            'items'          => [
                [
                    'product_id' => $product->id,
                    'quantity'   => 3,
                    'price'      => 1000,
                    'sub_total'  => 3000,
                ],
            ],
        ]);
        $invRes->assertStatus(201);
        $invoiceId = $invRes->json('id');

        $cardAcc = Account::firstOrCreate(
            ['type' => 'card', 'name' => 'Card / POS Terminal'],
            ['opening_balance' => 0, 'current_balance' => 0, 'is_active' => true, 'is_default' => false]
        );
        $initialCardBalance = (float)$cardAcc->current_balance;

        // Record payment of 3000 via card
        $payRes = $this->postJson('/api/payments', [
            'party_type'     => 'customer',
            'party_id'       => $customer->id,
            'payment_date'   => now()->format('Y-m-d'),
            'amount'         => 3000,
            'payment_method' => 'card',
            'account_id'     => $cardAcc->id,
            'allocations'    => [
                ['invoice_id' => $invoiceId, 'amount' => 3000],
            ],
        ]);

        $payRes->assertStatus(201);

        // Card account increased by 3000
        $this->assertEquals($initialCardBalance + 3000, (float)$cardAcc->fresh()->current_balance);
    }

    public function test_manual_adjustment_increases_and_decreases_account_balance(): void
    {
        $user = User::forceCreate([
            'name'     => 'Owner',
            'email'    => 'owner@example.com',
            'password' => bcrypt('secret123'),
        ]);

        $this->actingAs($user);

        $bank = Account::firstOrCreate(
            ['type' => 'bank', 'name' => 'Main Bank Account'],
            ['opening_balance' => 0, 'current_balance' => 0, 'is_active' => true, 'is_default' => false]
        );
        $startBal = (float)$bank->current_balance;

        // Direct deposit (e.g. Bank profit or owner deposit)
        $depRes = $this->postJson("/api/accounts/{$bank->id}/adjust", [
            'type'   => 'deposit',
            'amount' => 12500,
            'reason' => 'Owner capital injection',
        ]);
        $depRes->assertOk();
        $this->assertEquals($startBal + 12500, (float)$bank->fresh()->current_balance);

        // Direct withdrawal (e.g. Bank charges or utility payment)
        $withRes = $this->postJson("/api/accounts/{$bank->id}/adjust", [
            'type'   => 'withdrawal',
            'amount' => 500,
            'reason' => 'Monthly account maintenance fee',
        ]);
        $withRes->assertOk();
        $this->assertEquals($startBal + 12000, (float)$bank->fresh()->current_balance);
    }

    public function test_sale_invoice_reversal_deducts_money_back_from_account(): void
    {
        $user = User::forceCreate([
            'name'     => 'Cashier',
            'email'    => 'cashier@example.com',
            'password' => bcrypt('secret123'),
        ]);

        $this->actingAs($user);

        $customer = Customer::create(['name' => 'John Doe']);
        \Illuminate\Support\Facades\DB::table('categories')->insertOrIgnore(['id' => 1, 'name' => 'General Cat']);
        \Illuminate\Support\Facades\DB::table('brands')->insertOrIgnore(['id' => 1, 'name' => 'General Brand']);

        $product = Product::create([
            'category_id'         => 1,
            'brand_id'            => 1,
            'name'                => 'Syrup Fever',
            'product_code'        => 'SF-01',
            'barcode'             => 'BC-SF-01',
            'pack_size'           => 1,
            'quantity'            => 50,
            'unit_purchase_price' => 100,
            'unit_sale_price'     => 200,
        ]);

        $bankAcc = Account::firstOrCreate(
            ['type' => 'bank', 'name' => 'Main Bank Account'],
            ['opening_balance' => 0, 'current_balance' => 0, 'is_active' => true, 'is_default' => false]
        );
        $startBal = (float)$bankAcc->current_balance;

        // Create debit sale via bank transfer
        $invRes = $this->postJson('/api/sale-invoices', [
            'customer_id'    => $customer->id,
            'invoice_type'   => 'debit',
            'payment_method' => 'bank_transfer',
            'account_id'     => $bankAcc->id,
            'date'           => now()->format('Y-m-d'),
            'gross_amount'   => 1000,
            'total'          => 1000,
            'total_receive'  => 1000,
            'items'          => [
                [
                    'product_id' => $product->id,
                    'quantity'   => 5,
                    'price'      => 200,
                    'sub_total'  => 1000,
                ],
            ],
        ]);
        $invRes->assertStatus(201);
        $invoiceId = $invRes->json('id');
        $this->assertEquals($startBal + 1000, (float)$bankAcc->fresh()->current_balance);

        // Reverse the invoice
        $revRes = $this->postJson("/api/sale-invoices/{$invoiceId}/reverse", [
            'reason' => 'Customer returned goods and requested refund',
        ]);
        $revRes->assertOk();

        // Account balance reverted back
        $this->assertEquals($startBal, (float)$bankAcc->fresh()->current_balance);
    }

    public function test_cash_in_hand_account_automatically_pulls_balance_from_active_cash_drawer(): void
    {
        $user = User::forceCreate([
            'name'     => 'Cashier Drawer User',
            'email'    => 'cashierdrawer@example.com',
            'password' => bcrypt('secret123'),
        ]);

        $this->actingAs($user);

        // Open a cash drawer session with 7,500 float
        $openDrawerRes = $this->postJson('/api/cash-drawer/open', [
            'opening_balance' => 7500,
            'notes'           => 'Morning shift opening float',
        ]);
        $openDrawerRes->assertStatus(201);

        // Add a manual cash in of 1,200 (e.g. change float)
        $this->postJson('/api/cash-drawer/transaction', [
            'type'   => 'cash_in',
            'amount' => 1200,
            'notes'  => 'Additional change float',
        ])->assertOk();

        // Expected drawer balance is 7,500 + 1,200 = 8,700
        $drawerSummary = $this->getJson('/api/cash-drawer/current')->json('summary');
        $this->assertEquals(8700, (float)$drawerSummary['expected_balance']);

        // Check that GET /api/accounts automatically pulls this balance into Cash in Hand (Drawer)
        $accountsRes = $this->getJson('/api/accounts');
        $accountsRes->assertOk();

        $accounts = collect($accountsRes->json('accounts'));
        $cashAcc = $accounts->firstWhere('type', 'cash');
        $this->assertNotNull($cashAcc);
        $this->assertEquals(8700, (float)$cashAcc['current_balance']);

        // And total_balance reflects this automatically
        $this->assertGreaterThanOrEqual(8700, (float)$accountsRes->json('total_balance'));
    }

    public function test_pakistan_banks_and_wallets_presets_endpoint(): void
    {
        $user = User::forceCreate([
            'name'     => 'Preset User',
            'email'    => 'presets@example.com',
            'password' => bcrypt('secret123'),
        ]);

        $this->actingAs($user);

        $res = $this->getJson('/api/accounts/presets');
        $res->assertOk();

        $banks = collect($res->json('banks'));
        $wallets = collect($res->json('wallets'));

        $this->assertTrue($banks->contains('code', 'meezan'));
        $this->assertTrue($banks->contains('code', 'hbl'));
        $this->assertTrue($banks->contains('code', 'ubl'));
        $this->assertTrue($banks->contains('code', 'alfalah'));
        $this->assertTrue($wallets->contains('code', 'jazzcash'));
        $this->assertTrue($wallets->contains('code', 'easypaisa'));
        $this->assertTrue($wallets->contains('code', 'sadapay'));
        $this->assertTrue($wallets->contains('code', 'nayapay'));
    }

    public function test_seed_default_pakistani_accounts(): void
    {
        $user = User::forceCreate([
            'name'     => 'Seed User',
            'email'    => 'seed@example.com',
            'password' => bcrypt('secret123'),
        ]);

        $this->actingAs($user);

        // By default, seed-defaults only ensures Cash in Hand (Drawer) is present
        $resDefault = $this->postJson('/api/accounts/seed-defaults');
        $resDefault->assertOk();
        $defaultAccounts = collect($resDefault->json('summary.accounts'));
        $this->assertCount(1, $defaultAccounts);
        $this->assertTrue($defaultAccounts->contains('name', 'Cash in Hand (Drawer)'));

        // Explicit opt-in seeds preset Pakistani accounts
        $res = $this->postJson('/api/accounts/seed-defaults', ['include_presets' => true]);
        $res->assertOk();

        $accounts = collect($res->json('summary.accounts'));
        $this->assertTrue($accounts->contains('name', 'Meezan Bank'));
        $this->assertTrue($accounts->contains('name', 'JazzCash Business'));
        $this->assertTrue($accounts->contains('name', 'Easypaisa Business'));
    }

    public function test_can_create_account_with_code_icon_and_color(): void
    {
        $user = User::forceCreate([
            'name'     => 'Create User',
            'email'    => 'createacc@example.com',
            'password' => bcrypt('secret123'),
        ]);

        $this->actingAs($user);

        $res = $this->postJson('/api/accounts', [
            'name'            => 'Meezan Corporate Islamic',
            'type'            => 'bank',
            'code'            => 'meezan',
            'icon'            => 'meezan',
            'color'           => '#005b41',
            'bank_name'       => 'Meezan Bank Limited',
            'account_number'  => 'PK88MEZN0011223344',
            'opening_balance' => 50000,
            'notes'           => 'Corporate operational account',
        ]);

        $res->assertStatus(201);
        $acc = $res->json('account');
        $this->assertEquals('meezan', $acc['code']);
        $this->assertEquals('meezan', $acc['icon']);
        $this->assertEquals('#005b41', $acc['color']);
        $this->assertEquals(50000, (float)$acc['current_balance']);
    }

    public function test_multiple_open_cash_drawer_shifts_aggregate_without_overwriting_each_other_or_secondary_cash_accounts(): void
    {
        $cashier1 = User::forceCreate([
            'name'     => 'Cashier One',
            'email'    => 'cashier1@example.com',
            'password' => bcrypt('secret123'),
        ]);
        $cashier2 = User::forceCreate([
            'name'     => 'Cashier Two',
            'email'    => 'cashier2@example.com',
            'password' => bcrypt('secret123'),
        ]);

        // Create a secondary "Safe Vault Cash" account (non-default cash account)
        $safeVault = Account::create([
            'name'            => 'Safe Vault Cash',
            'type'            => 'cash',
            'code'            => 'safe_vault',
            'opening_balance' => 100000,
            'current_balance' => 100000,
            'is_default'      => false,
            'is_active'       => true,
        ]);

        $drawerAccount = Account::where('type', 'cash')->where('is_default', true)->firstOrFail();

        // Cashier 1 opens shift with 5,000
        $session1 = app(CashDrawerService::class)->openSession($cashier1, 5000, 'Morning Counter 1');
        $this->assertEquals(5000, (float) $drawerAccount->fresh()->current_balance);
        $this->assertEquals(100000, (float) $safeVault->fresh()->current_balance);

        // Cashier 2 opens concurrent shift with 8,000
        $session2 = app(CashDrawerService::class)->openSession($cashier2, 8000, 'Morning Counter 2');

        // Default drawer account must reflect the combined open drawer floats (5,000 + 8,000 = 13,000), not overwrite with 8,000!
        $this->assertEquals(13000, (float) $drawerAccount->fresh()->current_balance);
        // Secondary safe vault cash account must remain untouched at 100,000
        $this->assertEquals(100000, (float) $safeVault->fresh()->current_balance);

        // Cashier 1 records a 2,000 cash sale
        app(CashDrawerService::class)->recordTransaction($session1, 'cash_sale', 2000, null, null, 'Walk-in cash sale');
        $this->assertEquals(15000, (float) $drawerAccount->fresh()->current_balance);
        $this->assertEquals(100000, (float) $safeVault->fresh()->current_balance);
    }

    public function test_dashboard_sales_by_category_returns_revenue_without_sql_error(): void
    {
        $user = User::forceCreate([
            'name'     => 'Dashboard User',
            'email'    => 'dashboard@example.com',
            'password' => bcrypt('secret123'),
        ]);
        $this->actingAs($user);

        $customer = Customer::create(['name' => 'Walk-in Customer']);
        \Illuminate\Support\Facades\DB::table('categories')->insertOrIgnore(['id' => 10, 'name' => 'Antibiotics']);
        \Illuminate\Support\Facades\DB::table('brands')->insertOrIgnore(['id' => 10, 'name' => 'GSK']);

        $product = Product::create([
            'category_id'         => 10,
            'brand_id'            => 10,
            'name'                => 'Augmentin 625mg',
            'product_code'        => 'AUG-625',
            'barcode'             => 'BC-AUG-625',
            'pack_size'           => 1,
            'quantity'            => 100,
            'unit_purchase_price' => 200,
            'unit_sale_price'     => 300,
        ]);

        $this->postJson('/api/sale-invoices', [
            'customer_id'    => $customer->id,
            'invoice_type'   => 'debit',
            'payment_method' => 'cash',
            'date'           => now()->format('Y-m-d'),
            'gross_amount'   => 600,
            'total'          => 600,
            'total_receive'  => 600,
            'items'          => [
                [
                    'product_id' => $product->id,
                    'quantity'   => 2,
                    'price'      => 300,
                    'sub_total'  => 600,
                ],
            ],
        ])->assertStatus(201);

        $res = $this->getJson('/api/dashboard/sales-by-category');
        $res->assertOk();

        $categories = collect($res->json('data'));
        $antibiotics = $categories->firstWhere('category', 'Antibiotics');
        $this->assertNotNull($antibiotics);
        $this->assertEquals(600.0, (float) $antibiotics['value']);
        $this->assertEquals(600.0, (float) $antibiotics['revenue']);
    }

    public function test_tier2_customer_wholesale_prices_account_delete_barcodes_grn_and_bulk_users(): void
    {
        $admin = User::forceCreate([
            'name'     => 'Admin User',
            'email'    => 'admin_tier2@example.com',
            'password' => bcrypt('secret123'),
            'status'   => 'active',
        ]);
        \Spatie\Permission\Models\Permission::findOrCreate('user.view', 'sanctum');
        \Spatie\Permission\Models\Permission::findOrCreate('user.update', 'sanctum');
        \Spatie\Permission\Models\Permission::findOrCreate('user.delete', 'sanctum');
        \Spatie\Permission\Models\Permission::findOrCreate('customer.view', 'sanctum');
        \Spatie\Permission\Models\Permission::findOrCreate('customer.update', 'sanctum');
        \Spatie\Permission\Models\Permission::findOrCreate('purchase-invoice.view', 'sanctum');
        $admin->givePermissionTo(['user.view', 'user.update', 'user.delete', 'customer.view', 'customer.update', 'purchase-invoice.view']);
        $this->actingAs($admin);

        // 1. Customer Custom Wholesale Price CRUD
        $customer = Customer::create(['name' => 'Clinic Wholesale Partner']);
        \Illuminate\Support\Facades\DB::table('categories')->insertOrIgnore(['id' => 11, 'name' => 'Tablets']);
        \Illuminate\Support\Facades\DB::table('brands')->insertOrIgnore(['id' => 11, 'name' => 'Abbott']);
        $product = Product::create([
            'category_id'           => 11,
            'brand_id'              => 11,
            'name'                  => 'Brufen 400mg',
            'product_code'          => 'BRU-400',
            'barcode'               => 'BC-BRU-400',
            'pack_size'             => 10,
            'quantity'              => 200,
            'unit_purchase_price'   => 10,
            'unit_sale_price'       => 15,
            'whole_sale_pack_price' => 135,
            'whole_sale_unit_price' => 13.5,
        ]);

        $savePriceRes = $this->postJson("/api/customers/{$customer->id}/whole-sale-prices", [
            'product_id' => $product->id,
            'pack_price' => 125.50,
        ]);
        $savePriceRes->assertStatus(201);
        $priceId = $savePriceRes->json('id');
        $this->assertNotNull($priceId);
        $this->assertEquals(125.50, (float) $savePriceRes->json('pack_price'));

        $listPriceRes = $this->getJson("/api/customers/{$customer->id}/whole-sale-prices");
        $listPriceRes->assertOk();
        $this->assertCount(1, $listPriceRes->json());
        $this->assertEquals('Brufen 400mg', $listPriceRes->json('0.product.name'));

        $this->deleteJson("/api/customers/{$customer->id}/whole-sale-prices/{$priceId}")
            ->assertOk();
        $this->assertCount(0, $this->getJson("/api/customers/{$customer->id}/whole-sale-prices")->json());

        // 2. Financial Account Deletion Guard
        $unusedBank = Account::create([
            'name'            => 'Temporary Bank Account',
            'type'            => 'bank',
            'code'            => 'temp_bank',
            'opening_balance' => 0,
            'current_balance' => 0,
            'is_default'      => false,
            'is_active'       => true,
        ]);
        $this->deleteJson("/api/accounts/{$unusedBank->id}")->assertOk();
        $this->assertDatabaseMissing('accounts', ['id' => $unusedBank->id]);

        // Default cash account cannot be deleted
        $defaultCash = Account::where('type', 'cash')->where('is_default', true)->firstOrFail();
        $this->deleteJson("/api/accounts/{$defaultCash->id}")->assertStatus(422);

        // 3. Barcode Purchase Invoices (GRN) endpoint
        $supplier = Supplier::create(['name' => 'Pharma Distributor']);
        $piRes = $this->postJson('/api/purchase-invoices', [
            'supplier_id'    => $supplier->id,
            'posted_number'  => 'PI-GRN-001',
            'posted_date'    => now()->format('Y-m-d'),
            'invoice_number' => 'SUP-INV-77',
            'invoice_amount' => 1000,
            'invoice_type'   => 'credit',
            'total_amount'   => 1000,
            'total_paid'     => 0,
            'payment_method' => 'cash',
            'items'          => [
                [
                    'product_id'          => $product->id,
                    'batch'               => 'B-GRN-99',
                    'expiry'              => '2028-06-30',
                    'pack_quantity'       => 10,
                    'pack_size'           => 10,
                    'unit_quantity'       => 100,
                    'pack_purchase_price' => 100,
                    'unit_purchase_price' => 10,
                    'pack_sale_price'     => 150,
                    'unit_sale_price'     => 15,
                    'margin'              => 33.33,
                    'avg_price'           => 10,
                    'quantity'            => 100,
                    'sub_total'           => 1000,
                ],
            ],
        ])->assertStatus(201);

        $grnQueueRes = $this->getJson('/api/barcodes/purchase-invoices');
        $grnQueueRes->assertOk();
        $this->assertNotEmpty($grnQueueRes->json('purchase_invoices'));
        $piId = $piRes->json('data.id') ?? $piRes->json('id');
        $firstGrn = collect($grnQueueRes->json('purchase_invoices'))->firstWhere('id', $piId);
        $this->assertNotNull($firstGrn);
        $this->assertEquals('B-GRN-99', $firstGrn['items'][0]['batch']);

        // 4. Global Document History endpoint
        $globalHistRes = $this->getJson('/api/document-histories');
        $globalHistRes->assertOk();
        $this->assertNotEmpty($globalHistRes->json('histories'));

        // 5. Users Bulk Action endpoint
        $staff1 = User::forceCreate([
            'name'     => 'Staff One',
            'email'    => 'staff1@example.com',
            'password' => bcrypt('secret123'),
            'status'   => 'active',
        ]);
        $staff2 = User::forceCreate([
            'name'     => 'Staff Two',
            'email'    => 'staff2@example.com',
            'password' => bcrypt('secret123'),
            'status'   => 'active',
        ]);

        $this->postJson('/api/users/bulk-action', [
            'action'   => 'deactivate',
            'user_ids' => [$staff1->id, $staff2->id],
        ])->assertOk();

        $this->assertEquals('inactive', $staff1->fresh()->status);
        $this->assertEquals('inactive', $staff2->fresh()->status);
    }

    public function test_tier3_pdf_reports_document_sharing_and_dated_ledgers(): void
    {
        foreach ([
            '2025_09_02_133214_create_settings_table.php',
            '2025_09_06_170858_create_stock_adjustments_table.php',
            '2025_09_06_171041_create_stock_adjustment_items_table.php',
            '2026_10_23_000010_create_expenses_and_categories_tables.php',
            '2026_10_25_000001_create_stocktake_sessions_table.php',
            '2026_10_25_000002_create_stocktake_items_table.php',
            '2026_10_25_000004_create_stock_disposals_tables.php',
        ] as $file) {
            if (file_exists(database_path('migrations/' . $file))) {
                try {
                    (require database_path('migrations/' . $file))->up();
                } catch (\Throwable $e) {
                    // Already migrated
                }
            }
        }

        $user = User::forceCreate([
            'name'     => 'Tier3 Admin',
            'email'    => 'tier3admin@example.com',
            'password' => bcrypt('secret123'),
        ]);
        $this->actingAs($user);

        \Illuminate\Support\Facades\DB::table('categories')->insertOrIgnore(['id' => 1, 'name' => 'General Cat']);
        \Illuminate\Support\Facades\DB::table('brands')->insertOrIgnore(['id' => 1, 'name' => 'General Brand']);

        $supplier = Supplier::create(['name' => 'Alpha Pharma', 'phone' => '03001112222']);
        $customer = Customer::create(['name' => 'Beta Clinic', 'phone' => '03003334444']);

        $product = Product::create([
            'category_id'         => 1,
            'brand_id'            => 1,
            'name'                => 'Amoxicillin 250mg',
            'product_code'        => 'AMX-250',
            'barcode'             => 'BC-AMX-250',
            'pack_size'           => 10,
            'quantity'            => 50,
            'unit_purchase_price' => 10,
            'unit_sale_price'     => 15,
            'supplier_id'         => $supplier->id,
        ]);

        // 1. Create Purchase Invoice & test share metadata + PDF
        $piRes = $this->postJson('/api/purchase-invoices', [
            'supplier_id'    => $supplier->id,
            'posted_number'  => 'PI-T3-001',
            'posted_date'    => '2026-10-01',
            'invoice_number' => 'INV-T3-01',
            'invoice_amount' => 1000,
            'invoice_type'   => 'credit',
            'total_amount'   => 1000,
            'total_paid'     => 200,
            'payment_method' => 'cash',
            'items'          => [
                [
                    'product_id'          => $product->id,
                    'batch'               => 'B-T3-01',
                    'expiry'              => '2028-12-31',
                    'pack_quantity'       => 10,
                    'pack_size'           => 10,
                    'unit_quantity'       => 100,
                    'pack_purchase_price' => 100,
                    'unit_purchase_price' => 10,
                    'pack_sale_price'     => 150,
                    'unit_sale_price'     => 15,
                    'margin'              => 33.33,
                    'avg_price'           => 10,
                    'quantity'            => 100,
                    'sub_total'           => 1000,
                ],
            ],
        ])->assertStatus(201);
        $piId = $piRes->json('data.id') ?? $piRes->json('id');

        $this->getJson("/api/share/metadata?type=purchase_invoice&id={$piId}")
            ->assertOk()
            ->assertJsonPath('document_title', 'Purchase Invoice PRINV-0001');
        $this->get("/api/share/pdf?type=purchase_invoice&id={$piId}")
            ->assertOk();

        // 2. Create two Sale Invoices on different dates & verify Customer Ledger opening balance
        $this->postJson('/api/sale-invoices', [
            'customer_id'    => $customer->id,
            'invoice_type'   => 'credit',
            'payment_method' => 'cash',
            'date'           => '2026-10-05',
            'gross_amount'   => 300,
            'total'          => 300,
            'total_receive'  => 100,
            'items'          => [
                [
                    'product_id' => $product->id,
                    'quantity'   => 20,
                    'price'      => 15,
                    'sub_total'  => 300,
                ],
            ],
        ])->assertStatus(201);

        $this->postJson('/api/sale-invoices', [
            'customer_id'    => $customer->id,
            'invoice_type'   => 'credit',
            'payment_method' => 'cash',
            'date'           => '2026-10-15',
            'gross_amount'   => 150,
            'total'          => 150,
            'total_receive'  => 0,
            'items'          => [
                [
                    'product_id' => $product->id,
                    'quantity'   => 10,
                    'price'      => 15,
                    'sub_total'  => 150,
                ],
            ],
        ])->assertStatus(201);

        // Date-filtered customer ledger from 2026-10-10 to 2026-10-20 should have opening_balance = 200 (300 - 100)
        $custLedgerRes = $this->getJson("/api/customer-ledger?customer_id={$customer->id}&from=2026-10-10&to=2026-10-20");
        $custLedgerRes->assertOk();
        $this->assertEquals(200.0, (float) $custLedgerRes->json('summary.opening_balance'));
        $this->assertEquals(350.0, (float) $custLedgerRes->json('summary.net_balance'));
        $this->assertCount(1, $custLedgerRes->json('data'));

        // Date-filtered supplier ledger after 2026-10-10 should have opening_balance = 800 (1000 - 200)
        $suppLedgerRes = $this->getJson("/api/supplier-ledger?supplier_id={$supplier->id}&from=2026-10-10&to=2026-10-20");
        $suppLedgerRes->assertOk();
        $this->assertEquals(800.0, (float) $suppLedgerRes->json('summary.opening_balance'));
        $this->assertEquals(800.0, (float) $suppLedgerRes->json('summary.net_balance'));

        // 3. Test Cash Drawer Session Z-Report PDF via DocumentShareController
        $drawerRes = $this->postJson('/api/cash-drawer/open', ['opening_balance' => 5000])->assertStatus(201);
        $drawerSessionId = $drawerRes->json('session.id');
        $this->getJson("/api/share/metadata?type=cash_drawer_session&id={$drawerSessionId}")
            ->assertOk();
        $this->get("/api/share/pdf?type=cash_drawer_session&id={$drawerSessionId}")
            ->assertOk();

        // 4. Test Stocktake Session PDF via DocumentShareController
        $stRes = $this->postJson('/api/stocktake-sessions', [
            'session_type' => 'full',
            'is_blind'     => true,
            'notes'        => 'Tier 3 PDF test',
        ])->assertStatus(201);
        $stId = $stRes->json('session.id') ?? $stRes->json('id');
        $this->getJson("/api/share/metadata?type=stocktake_session&id={$stId}")
            ->assertOk();
        $this->get("/api/share/pdf?type=stocktake_session&id={$stId}")
            ->assertOk();

        // 5. Test new Report PDF endpoints
        $this->get('/api/reports/purchase-summary/pdf?from=2026-10-01&to=2026-10-31')->assertOk();
        $this->get('/api/reports/purchase-returns/pdf?from=2026-10-01&to=2026-10-31')->assertOk();
        $this->get('/api/reports/sale-returns/pdf?from=2026-10-01&to=2026-10-31')->assertOk();
        $this->get('/api/reports/outstanding-aging/pdf?as_of=2026-10-31&aging_by=due_date')->assertOk();
        $this->get('/api/reports/overdue-work-queue/pdf?as_of=2026-10-31&party_type=customers')->assertOk();
        $this->get("/api/reports/reorder/pdf?supplier_id={$supplier->id}")->assertOk();
        $this->get('/api/reports/net-profit/pdf?from=2026-10-01&to=2026-10-31')->assertOk();
    }

    public function test_tier4_opening_balances_pdc_cheques_quotations_challan_and_pos_split_checkout(): void
    {
        if (file_exists(database_path('migrations/2025_09_02_133214_create_settings_table.php'))) {
            try {
                (require database_path('migrations/2025_09_02_133214_create_settings_table.php'))->up();
            } catch (\Throwable $e) {
            }
        }

        $user = User::forceCreate([
            'name'     => 'Tier4 Manager',
            'email'    => 'tier4manager@example.com',
            'password' => bcrypt('secret123'),
        ]);
        $this->actingAs($user);

        // 1. Party Opening Balances on Customer & Supplier creation
        $custRes = $this->postJson('/api/customers', [
            'name'            => 'Opening Balance Customer',
            'phone'           => '03009998888',
            'opening_balance' => 4500,
        ])->assertStatus(201);
        $custId = $custRes->json('id');

        $custLedger = $this->getJson("/api/customer-ledger?customer_id={$custId}")->assertOk();
        $this->assertEquals(4500.0, (float) $custLedger->json('summary.net_balance'));

        $suppRes = $this->postJson('/api/suppliers', [
            'name'            => 'Opening Balance Supplier',
            'phone'           => '03007776666',
            'opening_balance' => 12000,
        ])->assertStatus(201);
        $suppId = $suppRes->json('id');

        $suppLedger = $this->getJson("/api/supplier-ledger?supplier_id={$suppId}")->assertOk();
        $this->assertEquals(12000.0, (float) $suppLedger->json('summary.net_balance'));

        // 2. Post-Dated Cheque (PDC) Lifecycle: pending -> deposited -> cleared (and bounce test)
        $bankAcc = Account::firstOrCreate(
            ['type' => 'bank', 'name' => 'Meezan Bank'],
            ['opening_balance' => 0, 'current_balance' => 0, 'is_active' => true, 'is_default' => false]
        );
        $initialBankBal = (float) $bankAcc->current_balance;

        $pdcRes = $this->postJson('/api/payments', [
            'party_type'     => 'customer',
            'party_id'       => $custId,
            'payment_date'   => '2026-10-28',
            'amount'         => 2000,
            'payment_method' => 'cheque',
            'account_id'     => $bankAcc->id,
            'cheque_number'  => 'CHQ-778899',
            'bank_name'      => 'Meezan Bank',
            'cheque_date'    => '2026-11-15',
            'cheque_status'  => 'pending',
        ])->assertStatus(201);
        $pdcId = $pdcRes->json('payment.id') ?? $pdcRes->json('id');
        $this->assertEquals('pending', $pdcRes->json('payment.cheque_status'));

        // Bank balance should NOT increase while cheque is pending!
        $this->assertEquals($initialBankBal, (float) $bankAcc->fresh()->current_balance);

        // Transition to deposited -> still deferred
        $this->postJson("/api/payments/{$pdcId}/cheque-status", [
            'cheque_status' => 'deposited',
        ])->assertOk()->assertJsonPath('payment.cheque_status', 'deposited');
        $this->assertEquals($initialBankBal, (float) $bankAcc->fresh()->current_balance);

        // Transition to cleared -> bank account is now credited!
        $this->postJson("/api/payments/{$pdcId}/cheque-status", [
            'cheque_status' => 'cleared',
        ])->assertOk()->assertJsonPath('payment.cheque_status', 'cleared');
        $this->assertEquals($initialBankBal + 2000.0, (float) $bankAcc->fresh()->current_balance);

        // Transition to bounced -> reverses the cleared bank deposit and restores customer ledger
        $this->postJson("/api/payments/{$pdcId}/cheque-status", [
            'cheque_status' => 'bounced',
            'reason'        => 'Insufficient funds',
        ])->assertOk()->assertJsonPath('payment.cheque_status', 'bounced');
        $this->assertEquals($initialBankBal, (float) $bankAcc->fresh()->current_balance);

        // 3. Quotations / Estimates -> PDF & Convert to Sale Invoice -> Delivery Challan PDF
        \Illuminate\Support\Facades\DB::table('categories')->insertOrIgnore(['id' => 1, 'name' => 'General Cat']);
        \Illuminate\Support\Facades\DB::table('brands')->insertOrIgnore(['id' => 1, 'name' => 'General Brand']);

        $product = Product::create([
            'category_id'         => 1,
            'brand_id'            => 1,
            'name'                => 'Ciprofloxacin 500mg',
            'product_code'        => 'CIP-500',
            'barcode'             => 'BC-CIP-500',
            'pack_size'           => 10,
            'quantity'            => 100,
            'unit_purchase_price' => 20,
            'unit_sale_price'     => 30,
        ]);

        $quoteRes = $this->postJson('/api/invoice-drafts', [
            'type'       => 'quotation',
            'party_id'   => $custId,
            'party_name' => 'Opening Balance Customer',
            'total'      => 300,
            'payload'    => [
                'customer_id'  => $custId,
                'sale_type'    => 'retail',
                'invoice_type' => 'credit',
                'gross_amount' => 300,
                'total'        => 300,
                'items'        => [
                    [
                        'product_id' => $product->id,
                        'quantity'   => 10,
                        'price'      => 30,
                        'sub_total'  => 300,
                    ],
                ],
            ],
        ])->assertStatus(201);
        $quoteId = $quoteRes->json('id') ?? $quoteRes->json('draft.id');

        // Verify Quotation PDF & metadata
        $this->getJson("/api/share/metadata?type=quotation&id={$quoteId}")
            ->assertOk();
        $this->get("/api/share/pdf?type=quotation&id={$quoteId}")
            ->assertOk();

        // Convert Quotation to posted Sale Invoice
        $postQuoteRes = $this->postJson("/api/invoice-drafts/{$quoteId}/post")->assertStatus(201);
        $convertedInvoiceId = $postQuoteRes->json('id') ?? $postQuoteRes->json('invoice_id');
        $this->assertNotNull($convertedInvoiceId);

        // Verify Delivery Challan / Gate Pass PDF & metadata
        $this->getJson("/api/share/metadata?type=delivery_challan&id={$convertedInvoiceId}")
            ->assertOk();
        $this->get("/api/share/pdf?type=delivery_challan&id={$convertedInvoiceId}")
            ->assertOk();

        // 4. POS Split-Tender Checkout + Instant Customer Credit Redemption
        // First record an unapplied advance payment of Rs. 200 for the customer
        $cashAcc = Account::where('type', 'cash')->where('is_default', true)->firstOrFail();
        $cardAcc = Account::where('type', 'card')->first() ?? $bankAcc;

        $this->postJson('/api/payments', [
            'party_type'     => 'customer',
            'party_id'       => $custId,
            'payment_date'   => '2026-10-28',
            'amount'         => 200,
            'payment_method' => 'cash',
            'account_id'     => $cashAcc->id,
        ])->assertStatus(201);

        $cashBefore = (float) $cashAcc->fresh()->current_balance;
        $cardBefore = (float) $cardAcc->fresh()->current_balance;

        // Checkout Rs. 600 sale: Redeem Rs. 200 credit + Split Tender (Rs. 250 Cash + Rs. 150 Card)
        $splitSaleRes = $this->postJson('/api/sale-invoices', [
            'customer_id'         => $custId,
            'sale_type'           => 'retail',
            'invoice_type'        => 'debit',
            'date'                => '2026-10-28',
            'payment_method'      => 'cash',
            'gross_amount'        => 600,
            'total'               => 600,
            'total_receive'       => 400,
            'apply_credit_amount' => 200,
            'split_payments'      => [
                ['payment_method' => 'cash', 'account_id' => $cashAcc->id, 'amount' => 250],
                ['payment_method' => 'card', 'account_id' => $cardAcc->id, 'amount' => 150],
            ],
            'items'               => [
                [
                    'product_id' => $product->id,
                    'quantity'   => 20,
                    'price'      => 30,
                    'sub_total'  => 600,
                ],
            ],
        ])->assertStatus(201);

        $splitInvoiceId = $splitSaleRes->json('id');
        $splitInvoice = SaleInvoice::findOrFail($splitInvoiceId);

        // Cash account increased by 250, Card account increased by 150
        $this->assertEquals($cashBefore + 250.0, (float) $cashAcc->fresh()->current_balance);
        $this->assertEquals($cardBefore + 150.0, (float) $cardAcc->fresh()->current_balance);
        // Total received on invoice = 400 (split tender) + 200 (applied credit) = 600 (fully settled)
        $this->assertEquals(600.0, (float) $splitInvoice->total_receive);
        $this->assertEquals((float) $splitInvoice->total, (float) $splitInvoice->total_receive);
    }

    public function test_multi_shift_close_and_reopen_preserves_cash_in_hand_ledger_and_per_user_isolation(): void
    {
        $cashierA = User::forceCreate([
            'name'     => 'Cashier Alpha',
            'email'    => 'alpha@example.com',
            'password' => bcrypt('secret123'),
        ]);
        $cashierB = User::forceCreate([
            'name'     => 'Cashier Beta',
            'email'    => 'beta@example.com',
            'password' => bcrypt('secret123'),
        ]);

        $this->actingAs($cashierA);

        // 1. Cashier A opens shift with Rs. 5,000 float
        $openRes = $this->postJson('/api/cash-drawer/open', [
            'opening_balance' => 5000,
            'notes'           => 'Morning shift',
        ])->assertStatus(201);

        $cashAcc = Account::where('type', 'cash')->where('is_default', true)->firstOrFail();
        $this->assertEquals(5000.0, (float) $cashAcc->fresh()->current_balance);

        // 2. Cashier B checks current session -> must be isolated (is_open = false) and cannot close Cashier A's shift
        $this->actingAs($cashierB);
        $bCurrent = $this->getJson('/api/cash-drawer/current')->assertOk();
        $this->assertFalse($bCurrent->json('is_open'));
        $this->assertNull($bCurrent->json('last_closed_session'));

        $this->postJson('/api/cash-drawer/close', [
            'closing_balance_actual' => 5000,
        ])->assertStatus(422);

        // 3. Switch back to Cashier A, record manual cash_in (+300) and close shift with Rs. 5,250 actual (Rs. 50 shortage)
        $this->actingAs($cashierA);
        $this->postJson('/api/cash-drawer/transaction', [
            'type'   => 'cash_in',
            'amount' => 300,
            'notes'  => 'Petty cash top-up',
        ])->assertOk();

        // Cash in Hand account immediately reflects +300 manual cash_in = 5,300
        $this->assertEquals(5300.0, (float) $cashAcc->fresh()->current_balance);

        // Close shift with 5,250 actual count (shortage of 50)
        $this->postJson('/api/cash-drawer/close', [
            'closing_balance_actual' => 5250,
            'notes'                  => 'Rs. 50 shortage at close',
        ])->assertOk();

        // Cash in Hand (Drawer) must preserve the 5,250 physical balance (not wipe to 0!)
        $this->assertEquals(5250.0, (float) $cashAcc->fresh()->current_balance);

        // Calling getAccountsWithSummary() must NOT overwrite the 5,250 balance
        $accountsRes = $this->getJson('/api/accounts')->assertOk();
        $cashRow = collect($accountsRes->json('accounts'))->firstWhere('id', $cashAcc->id);
        $this->assertEquals(5250.0, (float) $cashRow['current_balance']);

        // 4. Reopen next shift carrying over the 5,250 balance -> must NOT double-deposit 5,250!
        $this->postJson('/api/cash-drawer/open', [
            'opening_balance' => 5250,
            'notes'           => 'Afternoon shift carryover',
        ])->assertStatus(201);
        $this->assertEquals(5250.0, (float) $cashAcc->fresh()->current_balance);
    }

    public function test_reversing_split_tender_and_credit_allocated_sale_invoice_unwinds_allocations_and_refunds_exact_accounts(): void
    {
        $user = User::forceCreate([
            'name'     => 'Split Reversal User',
            'email'    => 'splitrev@example.com',
            'password' => bcrypt('secret123'),
        ]);
        $this->actingAs($user);

        $drawerSession = app(CashDrawerService::class)->openSession($user, 2000);
        $cashAcc = Account::where('type', 'cash')->where('is_default', true)->firstOrFail();
        $bankAcc = Account::firstOrCreate(
            ['type' => 'bank', 'name' => 'Main Bank Account'],
            ['opening_balance' => 0, 'current_balance' => 0, 'is_active' => true, 'is_default' => false]
        );

        $customer = Customer::create(['name' => 'Split Reversal Customer']);
        \Illuminate\Support\Facades\DB::table('categories')->insertOrIgnore(['id' => 1, 'name' => 'General Cat']);
        \Illuminate\Support\Facades\DB::table('brands')->insertOrIgnore(['id' => 1, 'name' => 'General Brand']);

        $product = Product::create([
            'category_id'         => 1,
            'brand_id'            => 1,
            'name'                => 'Azithromycin 500mg',
            'product_code'        => 'AZI-500',
            'barcode'             => 'BC-AZI-500',
            'pack_size'           => 10,
            'quantity'            => 100,
            'unit_purchase_price' => 20,
            'unit_sale_price'     => 30,
        ]);

        // 1. Customer pays Rs. 200 advance via Bank Transfer
        $advRes = $this->postJson('/api/payments', [
            'party_type'     => 'customer',
            'party_id'       => $customer->id,
            'payment_date'   => now()->toDateString(),
            'amount'         => 200,
            'payment_method' => 'bank_transfer',
            'account_id'     => $bankAcc->id,
        ])->assertStatus(201);
        $advPaymentId = $advRes->json('payment.id');

        $cashBeforeSale = (float) $cashAcc->fresh()->current_balance;
        $bankBeforeSale = (float) $bankAcc->fresh()->current_balance;
        $drawerBeforeSale = (float) $drawerSession->fresh()->closing_balance_expected;

        // 2. Create Rs. 600 sale: apply Rs. 200 advance credit + split tender (Rs. 250 Cash + Rs. 150 Bank)
        $saleRes = $this->postJson('/api/sale-invoices', [
            'customer_id'         => $customer->id,
            'sale_type'           => 'retail',
            'invoice_type'        => 'debit',
            'date'                => now()->toDateString(),
            'payment_method'      => 'cash',
            'gross_amount'        => 600,
            'total'               => 600,
            'total_receive'       => 400,
            'apply_credit_amount' => 200,
            'split_payments'      => [
                ['payment_method' => 'cash', 'account_id' => $cashAcc->id, 'amount' => 250],
                ['payment_method' => 'bank_transfer', 'account_id' => $bankAcc->id, 'amount' => 150],
            ],
            'items'               => [
                [
                    'product_id' => $product->id,
                    'quantity'   => 20,
                    'price'      => 30,
                    'sub_total'  => 600,
                ],
            ],
        ])->assertStatus(201);

        $saleId = $saleRes->json('id');
        $this->assertEquals($cashBeforeSale + 250.0, (float) $cashAcc->fresh()->current_balance);
        $this->assertEquals($bankBeforeSale + 150.0, (float) $bankAcc->fresh()->current_balance);
        $this->assertEquals($drawerBeforeSale + 250.0, (float) $drawerSession->fresh()->closing_balance_expected);
        $this->assertEquals(0.0, (float) \App\Models\Payment::findOrFail($advPaymentId)->unapplied_amount);

        // 3. Reverse the sale invoice
        $this->postJson("/api/sale-invoices/{$saleId}/reverse", [
            'reason' => 'Customer cancelled entire order',
        ])->assertOk();

        // Advance payment must have its Rs. 200 unapplied credit restored!
        $advPaymentFresh = \App\Models\Payment::findOrFail($advPaymentId);
        $this->assertEquals(200.0, (float) $advPaymentFresh->unapplied_amount);
        $this->assertEquals(0.0, (float) $advPaymentFresh->allocated_amount);

        // Cash account & drawer must be refunded ONLY Rs. 250, and Bank account refunded ONLY Rs. 150!
        $this->assertEquals($cashBeforeSale, (float) $cashAcc->fresh()->current_balance);
        $this->assertEquals($bankBeforeSale, (float) $bankAcc->fresh()->current_balance);
        $this->assertEquals($drawerBeforeSale, (float) $drawerSession->fresh()->closing_balance_expected);

        // Customer ledger net balance must be -200 (the unapplied advance payment), with reversed invoice excluded
        $custLedgerRes = $this->getJson("/api/customer-ledger?customer_id={$customer->id}")->assertOk();
        $this->assertEquals(-200.0, (float) $custLedgerRes->json('summary.net_balance'));
    }

    public function test_settling_invoice_via_ledger_creates_auditable_payment_voucher(): void
    {
        $user = User::forceCreate([
            'name'     => 'Ledger Settle User',
            'email'    => 'ledgersettle@example.com',
            'password' => bcrypt('secret123'),
        ]);
        $this->actingAs($user);

        $drawerSession = app(CashDrawerService::class)->openSession($user, 1000);
        $customer = Customer::create(['name' => 'Settle Invoice Customer']);

        $invoice = SaleInvoice::create([
            'user_id'       => $user->id,
            'customer_id'   => $customer->id,
            'invoice_type'  => 'credit',
            'posted_number' => 'SI-SETTLE-01',
            'date'          => now()->toDateString(),
            'gross_amount'  => 750,
            'total'         => 750,
            'total_receive' => 250,
            'status'        => 'posted',
        ]);

        // Settle remaining Rs. 500 via /api/customer-ledger/settle-invoice
        $settleRes = $this->postJson('/api/customer-ledger/settle-invoice', [
            'sale_invoice_id' => $invoice->id,
            'payment_method'  => 'cash',
        ])->assertOk();

        $this->assertNotNull($settleRes->json('payment_id'));
        $this->assertEquals(750.0, (float) $invoice->fresh()->total_receive);
        $this->assertEquals(1500.0, (float) $drawerSession->fresh()->closing_balance_expected);
    }

    public function test_deleting_credit_sale_invoice_with_upfront_cash_payment_reconciles_both_drawer_and_account(): void
    {
        $user = User::forceCreate([
            'name'     => 'Delete Credit Sale User',
            'email'    => 'delcreditsale@example.com',
            'password' => bcrypt('secret123'),
        ]);
        $this->actingAs($user);

        $drawerSession = app(CashDrawerService::class)->openSession($user, 3000);
        $cashAcc = Account::where('type', 'cash')->where('is_default', true)->firstOrFail();

        $customer = Customer::create(['name' => 'Credit Upfront Customer']);
        \Illuminate\Support\Facades\DB::table('categories')->insertOrIgnore(['id' => 1, 'name' => 'General Cat']);
        \Illuminate\Support\Facades\DB::table('brands')->insertOrIgnore(['id' => 1, 'name' => 'General Brand']);

        $product = Product::create([
            'category_id'         => 1,
            'brand_id'            => 1,
            'name'                => 'Cefixime 400mg',
            'product_code'        => 'CEF-400',
            'barcode'             => 'BC-CEF-400',
            'pack_size'           => 10,
            'quantity'            => 100,
            'unit_purchase_price' => 30,
            'unit_sale_price'     => 50,
        ]);

        // Create Rs. 500 credit sale invoice with Rs. 200 upfront cash payment
        $saleRes = $this->postJson('/api/sale-invoices', [
            'customer_id'    => $customer->id,
            'sale_type'      => 'retail',
            'invoice_type'   => 'credit',
            'date'           => now()->toDateString(),
            'payment_method' => 'cash',
            'gross_amount'   => 500,
            'total'          => 500,
            'total_receive'  => 200,
            'items'          => [
                [
                    'product_id' => $product->id,
                    'quantity'   => 10,
                    'price'      => 50,
                    'sub_total'  => 500,
                ],
            ],
        ])->assertStatus(201);

        $saleId = $saleRes->json('id');
        $this->assertEquals(3200.0, (float) $drawerSession->fresh()->closing_balance_expected);
        $this->assertEquals(3200.0, (float) $cashAcc->fresh()->current_balance);

        // Delete the credit sale invoice (default mode = 'none') -> both drawer and cash account must return to 3,000!
        $this->deleteJson("/api/sale-invoices/{$saleId}")->assertOk();

        $this->assertEquals(3000.0, (float) $drawerSession->fresh()->closing_balance_expected);
        $this->assertEquals(3000.0, (float) $cashAcc->fresh()->current_balance);
    }

    public function test_cash_in_hand_and_cash_drawer_remain_strictly_synchronized_across_all_operations(): void
    {
        if (file_exists(database_path('migrations/2026_10_23_000010_create_expenses_and_categories_tables.php'))) {
            try {
                (require database_path('migrations/2026_10_23_000010_create_expenses_and_categories_tables.php'))->up();
            } catch (\Throwable $e) {
            }
        }

        $manager = User::forceCreate([
            'name'     => 'Store Manager',
            'email'    => 'storemgr@example.com',
            'password' => bcrypt('secret123'),
        ]);
        $staff = User::forceCreate([
            'name'     => 'Counter Staff',
            'email'    => 'counterstaff@example.com',
            'password' => bcrypt('secret123'),
        ]);

        $this->actingAs($manager);

        $cashAcc = Account::where('type', 'cash')->where('is_default', true)->firstOrFail();
        // Simulate legacy non-zero opening_balance (4841.67) on Cash in Hand (Drawer)
        $cashAcc->update([
            'opening_balance' => 4841.67,
            'current_balance' => 4841.67,
        ]);

        $customer = Customer::create(['name' => 'Sync Customer']);
        $supplier = Supplier::create(['name' => 'Sync Supplier']);
        \Illuminate\Support\Facades\DB::table('categories')->insertOrIgnore(['id' => 1, 'name' => 'General Cat']);
        \Illuminate\Support\Facades\DB::table('brands')->insertOrIgnore(['id' => 1, 'name' => 'General Brand']);

        $product = Product::create([
            'category_id'         => 1,
            'brand_id'            => 1,
            'name'                => 'Panadol Extra',
            'product_code'        => 'PAN-EXT',
            'barcode'             => 'BC-PAN-EXT',
            'pack_size'           => 10,
            'quantity'            => 500,
            'unit_purchase_price' => 10,
            'unit_sale_price'     => 20,
        ]);

        // 1. Open Shift #1 with Rs. 7,000 -> Cash in Hand must become 7,000 (not 4841.67 + 7000!)
        $open1 = $this->postJson('/api/cash-drawer/open', [
            'opening_balance' => 7000,
            'notes'           => 'Shift 1 open',
        ])->assertStatus(201);
        $session1Id = $open1->json('session.id');

        $this->assertEquals(7000.0, (float) $cashAcc->fresh()->current_balance);
        $this->assertEquals(0.0, (float) $cashAcc->fresh()->opening_balance);
        $this->assertEquals(7000.0, (float) \App\Models\CashDrawerSession::findOrFail($session1Id)->closing_balance_expected);

        // 2. Staff user (who did NOT open their own drawer) records a Rs. 600 cash sale and a Rs. 250 cash expense
        $this->actingAs($staff);
        $saleRes = $this->postJson('/api/sale-invoices', [
            'customer_id'    => $customer->id,
            'sale_type'      => 'retail',
            'invoice_type'   => 'debit',
            'date'           => now()->toDateString(),
            'payment_method' => 'cash',
            'gross_amount'   => 600,
            'total'          => 600,
            'total_receive'  => 600,
            'items'          => [
                [
                    'product_id' => $product->id,
                    'quantity'   => 30,
                    'price'      => 20,
                    'sub_total'  => 600,
                ],
            ],
        ])->assertStatus(201);
        $saleId = $saleRes->json('id');
        $salePosted = $saleRes->json('posted_number');

        $expCat = \App\Models\ExpenseCategory::firstOrCreate(['name' => 'Utilities']);
        $expense = app(\App\Services\ExpenseService::class)->createExpense([
            'expense_category_id' => $expCat->id,
            'amount'              => 250,
            'date'                => now()->toDateString(),
            'payment_method'      => 'cash',
            'description'         => 'Electricity bill token',
        ], $staff);

        // Both Cash Drawer and Cash in Hand must be 7000 + 600 - 250 = 7350
        $this->assertEquals(7350.0, (float) \App\Models\CashDrawerSession::findOrFail($session1Id)->closing_balance_expected);
        $this->assertEquals(7350.0, (float) $cashAcc->fresh()->current_balance);

        // 3. Manager closes Shift #1 with Rs. 5,000 actual count -> both become 5,000
        $this->actingAs($manager);
        $this->postJson('/api/cash-drawer/close', [
            'closing_balance_actual' => 5000,
            'notes'                  => 'End of Shift 1',
        ])->assertOk();
        $this->assertEquals(5000.0, (float) $cashAcc->fresh()->current_balance);

        // 4. While drawer is CLOSED, transfer Rs. 1,000 from Bank into Cash in Hand -> Cash in Hand is now 6,000
        $bankAcc = Account::firstOrCreate(
            ['type' => 'bank', 'name' => 'HBL Business'],
            ['opening_balance' => 10000, 'current_balance' => 10000, 'is_active' => true, 'is_default' => false]
        );
        app(\App\Services\AccountService::class)->transfer($bankAcc, $cashAcc->fresh(), 1000, 'Off-shift float top-up', $manager);
        $this->assertEquals(6000.0, (float) $cashAcc->fresh()->current_balance);

        // GET /api/cash-drawer/current when closed reports cash_in_hand_balance = 6,000
        $closedCurrent = $this->getJson('/api/cash-drawer/current')->assertOk();
        $this->assertEquals(6000.0, (float) $closedCurrent->json('cash_in_hand_balance'));

        // Backdate the Shift #1 sale invoice & expense so they are pre-shift relative to Shift #2
        SaleInvoice::where('id', $saleId)->update(['created_at' => now()->subHours(2)]);
        \App\Models\Expense::where('id', $expense->id)->update(['created_at' => now()->subHours(2)]);

        // 5. Open Shift #2 with Rs. 4,000 (e.g. manager kept 2,000 out of the 6,000) -> both Drawer and Cash in Hand become 4,000!
        $open2 = $this->postJson('/api/cash-drawer/open', [
            'opening_balance' => 4000,
            'notes'           => 'Shift 2 open',
        ])->assertStatus(201);
        $session2Id = $open2->json('session.id');

        $this->assertEquals(4000.0, (float) \App\Models\CashDrawerSession::findOrFail($session2Id)->closing_balance_expected);
        $this->assertEquals(4000.0, (float) $cashAcc->fresh()->current_balance);

        // 6. Edit pre-shift sale invoice from 600 to 800 WITH update_drawer = false ("Save Without Updating Drawer")
        // -> Neither Drawer nor Cash in Hand should change (both stay 4,000)
        $this->putJson("/api/sale-invoices/{$saleId}", [
            'customer_id'    => $customer->id,
            'sale_type'      => 'retail',
            'invoice_type'   => 'debit',
            'posted_number'  => $salePosted,
            'date'           => now()->toDateString(),
            'payment_method' => 'cash',
            'gross_amount'   => 800,
            'total'          => 800,
            'total_receive'  => 800,
            'update_drawer'  => false,
            'items'          => [
                [
                    'product_id' => $product->id,
                    'quantity'   => 40,
                    'price'      => 20,
                    'sub_total'  => 800,
                ],
            ],
        ])->assertOk();

        $this->assertEquals(4000.0, (float) \App\Models\CashDrawerSession::findOrFail($session2Id)->closing_balance_expected);
        $this->assertEquals(4000.0, (float) $cashAcc->fresh()->current_balance);

        // 7. Edit pre-shift sale invoice from 800 to 1,000 without update_drawer flag (default)
        // -> Both Drawer and Cash in Hand increase by +200 to 4,200
        $this->putJson("/api/sale-invoices/{$saleId}", [
            'customer_id'    => $customer->id,
            'sale_type'      => 'retail',
            'invoice_type'   => 'debit',
            'posted_number'  => $salePosted,
            'date'           => now()->toDateString(),
            'payment_method' => 'cash',
            'gross_amount'   => 1000,
            'total'          => 1000,
            'total_receive'  => 1000,
            'items'          => [
                [
                    'product_id' => $product->id,
                    'quantity'   => 50,
                    'price'      => 20,
                    'sub_total'  => 1000,
                ],
            ],
        ])->assertOk();

        $this->assertEquals(4200.0, (float) \App\Models\CashDrawerSession::findOrFail($session2Id)->closing_balance_expected);
        $this->assertEquals(4200.0, (float) $cashAcc->fresh()->current_balance);

        // 8. Edit pre-shift expense from 250 to 350 (+100 extra cash paid out)
        // -> Both Drawer and Cash in Hand decrease by 100 (from 4,200 to 4,100)
        app(\App\Services\ExpenseService::class)->updateExpense($expense->fresh(), [
            'amount'         => 350,
            'payment_method' => 'cash',
        ], $manager);

        $this->assertEquals(4100.0, (float) \App\Models\CashDrawerSession::findOrFail($session2Id)->closing_balance_expected);
        $this->assertEquals(4100.0, (float) $cashAcc->fresh()->current_balance);
    }
}
