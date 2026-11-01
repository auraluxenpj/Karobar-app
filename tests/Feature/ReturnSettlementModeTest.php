<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\AccountTransaction;
use App\Models\CashDrawerTransaction;
use App\Models\Customer;
use App\Models\CustomerLedger;
use App\Models\Product;
use App\Models\PurchaseInvoice;
use App\Models\PurchaseReturn;
use App\Models\SaleInvoice;
use App\Models\SaleReturn;
use App\Models\Supplier;
use App\Models\SupplierLedger;
use App\Models\User;
use App\Services\CashDrawerService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Tests\TestCase;

class ReturnSettlementModeTest extends TestCase
{
    protected User $user;
    protected Customer $customer;
    protected Supplier $supplier;
    protected Product $product;

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
            '2026_10_23_000003_create_document_histories_and_invoice_reversals.php',
            '2026_10_23_000004_create_payments_and_allocations_tables.php',
            '2026_10_23_000005_add_payment_method_to_invoices_table.php',
            '2026_10_23_000006_create_cash_drawer_tables.php',
            '2026_10_23_000007_add_credit_terms_and_due_dates.php',
            '2026_10_23_000008_create_financial_accounts_tables.php',
            '2026_10_23_000009_add_code_and_icon_to_accounts_table.php',
            '2026_10_25_000005_add_settlement_mode_to_returns_and_ledgers.php',
        ] as $file) {
            (require database_path('migrations/' . $file))->up();
        }

        Gate::before(fn () => true);
        $this->withoutMiddleware(\App\Http\Middleware\EnsureLicensed::class);

        $this->user = User::forceCreate([
            'name'     => 'Return Cashier',
            'email'    => 'returncashier@example.com',
            'password' => bcrypt('secret123'),
        ]);
        $this->actingAs($this->user);

        $this->customer = Customer::create(['name' => 'Wholesale Credit Customer']);
        $this->supplier = Supplier::create(['name' => 'Wholesale Credit Supplier']);

        DB::table('categories')->insertOrIgnore(['id' => 1, 'name' => 'Pharma']);
        DB::table('brands')->insertOrIgnore(['id' => 1, 'name' => 'GSK']);

        $this->product = Product::create([
            'category_id'         => 1,
            'brand_id'            => 1,
            'supplier_id'         => $this->supplier->id,
            'name'                => 'Augmentin 625mg',
            'product_code'        => 'AUG-625',
            'barcode'             => 'BC-AUG-625',
            'pack_size'           => 1,
            'quantity'            => 200,
            'unit_purchase_price' => 800,
            'avg_price'           => 800,
            'unit_sale_price'     => 1000,
        ]);

        Account::where('type', 'cash')->update(['current_balance' => 50000]);
        Account::firstOrCreate(
            ['type' => 'bank', 'name' => 'Main Bank Account'],
            ['opening_balance' => 100000, 'current_balance' => 100000, 'is_active' => true, 'is_default' => false]
        )->update(['current_balance' => 100000]);
    }

    public function test_sale_return_against_credit_invoice_credits_customer_ledger_without_touching_cash_drawer_or_accounts(): void
    {
        $session = app(CashDrawerService::class)->openSession($this->user, 20000);
        $cashAccount = Account::where('type', 'cash')->first();
        $initialCashAccountBalance = (float) $cashAccount->fresh()->current_balance;

        // 1. Create a Rs. 50,000 Credit Sale Invoice (total_receive = 0)
        $saleRes = $this->postJson('/api/sale-invoices', [
            'customer_id'   => $this->customer->id,
            'date'          => now()->toDateString(),
            'invoice_type'  => 'credit',
            'gross_amount'  => 50000,
            'total'         => 50000,
            'total_receive' => 0,
            'items'         => [
                [
                    'product_id'       => $this->product->id,
                    'pack_size'        => 1,
                    'current_quantity' => 200,
                    'quantity'         => 50,
                    'price'            => 1000,
                    'sub_total'        => 50000,
                ],
            ],
        ])->assertStatus(201);

        $saleInvoiceId = $saleRes->json('id');
        $this->assertEquals(50000.0, CustomerLedger::getCustomerNetBalance($this->customer->id));
        $this->assertEquals(20000.0, (float) $session->fresh()->closing_balance_expected);

        // 2. Post a Rs. 10,000 Sale Return against the Credit Sale Invoice (auto-resolves to credit_note)
        $retRes = $this->postJson('/api/sale-returns', [
            'customer_id'     => $this->customer->id,
            'sale_invoice_id' => $saleInvoiceId,
            'date'            => now()->toDateString(),
            'gross_total'     => 10000,
            'total'           => 10000,
            'items'           => [
                [
                    'product_id'           => $this->product->id,
                    'unit_sale_quantity'   => 50,
                    'unit_return_quantity' => 10,
                    'unit_sale_price'      => 1000,
                    'sub_total'            => 10000,
                ],
            ],
        ])->assertStatus(201);

        $retId = $retRes->json('id');
        $saleReturn = SaleReturn::findOrFail($retId);

        // Settlement mode is credit_note with credited_amount = 10,000
        $this->assertEquals('credit_note', $saleReturn->settlement_mode);
        $this->assertEquals(10000.0, (float) $saleReturn->credited_amount);

        // Cash drawer & Cash account were NOT touched
        $this->assertEquals(20000.0, (float) $session->fresh()->closing_balance_expected);
        $this->assertEquals(0, CashDrawerTransaction::where('reference_type', 'sale_return')->where('reference_id', $retId)->count());
        $this->assertEquals($initialCashAccountBalance, (float) $cashAccount->fresh()->current_balance);
        $this->assertEquals(0, AccountTransaction::where('reference_type', 'sale_return')->where('reference_id', $retId)->count());

        // Customer ledger balance dropped from 50,000 to 40,000
        $this->assertEquals(40000.0, CustomerLedger::getCustomerNetBalance($this->customer->id));
        $ledgerRow = CustomerLedger::where('sale_return_id', $retId)->first();
        $this->assertNotNull($ledgerRow);
        $this->assertEquals('payment', $ledgerRow->entry_type);
        $this->assertEquals(10000.0, (float) $ledgerRow->credited_amount);

        // Verify /api/customer-ledger endpoint summary reflects net_balance = 40,000
        $ledgerApi = $this->getJson("/api/customer-ledger?customer_id={$this->customer->id}")->assertOk();
        $this->assertEquals(40000.0, (float) $ledgerApi->json('summary.net_balance'));
    }

    public function test_sale_return_can_update_between_credit_note_and_cash_refund_and_cleanly_revert_on_delete(): void
    {
        $session = app(CashDrawerService::class)->openSession($this->user, 20000);
        $cashAccount = Account::where('type', 'cash')->first();
        $bankAccount = Account::where('type', 'bank')->first();
        $initialCashBalance = (float) $cashAccount->fresh()->current_balance;
        $initialBankBalance = (float) $bankAccount->fresh()->current_balance;

        // Create credit invoice of Rs. 50,000
        $saleRes = $this->postJson('/api/sale-invoices', [
            'customer_id'   => $this->customer->id,
            'date'          => now()->toDateString(),
            'invoice_type'  => 'credit',
            'gross_amount'  => 50000,
            'total'         => 50000,
            'total_receive' => 0,
            'items'         => [
                [
                    'product_id'       => $this->product->id,
                    'pack_size'        => 1,
                    'current_quantity' => 200,
                    'quantity'         => 50,
                    'price'            => 1000,
                    'sub_total'        => 50000,
                ],
            ],
        ])->assertStatus(201);
        $saleInvoiceId = $saleRes->json('id');

        // 1. Create return as credit_note for Rs. 10,000
        $retRes = $this->postJson('/api/sale-returns', [
            'customer_id'     => $this->customer->id,
            'sale_invoice_id' => $saleInvoiceId,
            'settlement_mode' => 'credit_note',
            'date'            => now()->toDateString(),
            'gross_total'     => 10000,
            'total'           => 10000,
            'items'           => [
                [
                    'product_id'           => $this->product->id,
                    'unit_sale_quantity'   => 50,
                    'unit_return_quantity' => 10,
                    'unit_sale_price'      => 1000,
                    'sub_total'            => 10000,
                ],
            ],
        ])->assertStatus(201);

        $retId = $retRes->json('id');
        $postedNumber = $retRes->json('posted_number');
        $this->assertEquals(40000.0, CustomerLedger::getCustomerNetBalance($this->customer->id));

        // 2. Edit return: increase quantity to 15 (Rs. 15,000) still in credit_note mode
        $this->putJson("/api/sale-returns/{$retId}", [
            'customer_id'     => $this->customer->id,
            'sale_invoice_id' => $saleInvoiceId,
            'posted_number'   => $postedNumber,
            'settlement_mode' => 'credit_note',
            'date'            => now()->toDateString(),
            'gross_total'     => 15000,
            'total'           => 15000,
            'items'           => [
                [
                    'product_id'           => $this->product->id,
                    'unit_sale_quantity'   => 50,
                    'unit_return_quantity' => 15,
                    'unit_sale_price'      => 1000,
                    'sub_total'            => 15000,
                ],
            ],
        ])->assertOk();

        $this->assertEquals(35000.0, CustomerLedger::getCustomerNetBalance($this->customer->id));
        $this->assertEquals(20000.0, (float) $session->fresh()->closing_balance_expected);

        // 3. Edit return: switch settlement_mode from credit_note to cash_refund via bank_transfer
        $this->putJson("/api/sale-returns/{$retId}", [
            'customer_id'     => $this->customer->id,
            'sale_invoice_id' => $saleInvoiceId,
            'posted_number'   => $postedNumber,
            'settlement_mode' => 'cash_refund',
            'payment_method'  => 'bank_transfer',
            'date'            => now()->toDateString(),
            'gross_total'     => 15000,
            'total'           => 15000,
            'items'           => [
                [
                    'product_id'           => $this->product->id,
                    'unit_sale_quantity'   => 50,
                    'unit_return_quantity' => 15,
                    'unit_sale_price'      => 1000,
                    'sub_total'            => 15000,
                ],
            ],
        ])->assertOk();

        // Credit note removed -> Customer owes 50,000 again; Bank balance decreased by 15,000; Cash Drawer untouched
        $this->assertEquals(50000.0, CustomerLedger::getCustomerNetBalance($this->customer->id));
        $this->assertEquals(0, CustomerLedger::where('sale_return_id', $retId)->count());
        $this->assertEquals($initialBankBalance - 15000.0, (float) $bankAccount->fresh()->current_balance);
        $this->assertEquals(20000.0, (float) $session->fresh()->closing_balance_expected);

        // 4. Edit return: switch payment_method from bank_transfer to cash
        $this->putJson("/api/sale-returns/{$retId}", [
            'customer_id'     => $this->customer->id,
            'sale_invoice_id' => $saleInvoiceId,
            'posted_number'   => $postedNumber,
            'settlement_mode' => 'cash_refund',
            'payment_method'  => 'cash',
            'date'            => now()->toDateString(),
            'gross_total'     => 15000,
            'total'           => 15000,
            'items'           => [
                [
                    'product_id'           => $this->product->id,
                    'unit_sale_quantity'   => 50,
                    'unit_return_quantity' => 15,
                    'unit_sale_price'      => 1000,
                    'sub_total'            => 15000,
                ],
            ],
        ])->assertOk();

        // Bank restored; Cash account reduced by 15,000; Cash drawer reduced to 5,000
        $this->assertEquals($initialBankBalance, (float) $bankAccount->fresh()->current_balance);
        $this->assertEquals($initialCashBalance - 15000.0, (float) $cashAccount->fresh()->current_balance);
        $this->assertEquals(5000.0, (float) $session->fresh()->closing_balance_expected);

        // 5. Delete the return -> Cash drawer and Cash account restored
        $this->deleteJson("/api/sale-returns/{$retId}")->assertOk();
        $this->assertEquals($initialCashBalance, (float) $cashAccount->fresh()->current_balance);
        $this->assertEquals(20000.0, (float) $session->fresh()->closing_balance_expected);
    }

    public function test_purchase_return_against_credit_invoice_debits_supplier_ledger_without_touching_cash_drawer(): void
    {
        $session = app(CashDrawerService::class)->openSession($this->user, 20000);
        $cashAccount = Account::where('type', 'cash')->first();
        $initialCashBalance = (float) $cashAccount->fresh()->current_balance;

        // Create a Credit Purchase Invoice of Rs. 80,000 (total_paid = 0)
        $pi = PurchaseInvoice::create([
            'supplier_id'    => $this->supplier->id,
            'posted_number'  => 'PI-CRED-0001',
            'invoice_number' => 'SUP-INV-100',
            'posted_date'    => now()->toDateString(),
            'invoice_type'   => 'credit',
            'invoice_amount' => 80000,
            'total_amount'   => 80000,
            'total_paid'     => 0,
        ]);
        DB::table('purchase_invoice_items')->insert([
            'purchase_invoice_id' => $pi->id,
            'product_id'          => $this->product->id,
            'pack_size'           => 1,
            'pack_quantity'       => 100,
            'unit_quantity'       => 100,
            'quantity'            => 100,
            'pack_purchase_price' => 800,
            'unit_purchase_price' => 800,
            'avg_price'           => 800,
            'pack_sale_price'     => 1000,
            'unit_sale_price'     => 1000,
            'margin'              => 20,
            'sub_total'           => 80000,
        ]);
        SupplierLedger::create([
            'supplier_id'         => $this->supplier->id,
            'purchase_invoice_id' => $pi->id,
            'entry_type'          => 'invoice',
            'is_manual'           => false,
            'entry_date'          => now()->toDateString(),
            'posted_number'       => $pi->posted_number,
            'invoice_number'      => $pi->invoice_number,
            'invoice_total'       => 80000,
            'total_paid'          => 0,
            'debited_amount'      => 0,
            'credit_remaining'    => 80000,
        ]);

        // 1. Post a Rs. 20,000 Purchase Return linked to the Credit Purchase Invoice
        $prRes = $this->postJson('/api/purchase-returns', [
            'supplier_id'         => $this->supplier->id,
            'purchase_invoice_id' => $pi->id,
            'date'                => now()->toDateString(),
            'gross_total'         => 20000,
            'total'               => 20000,
            'items'               => [
                [
                    'product_id'              => $this->product->id,
                    'pack_size'               => 1,
                    'pack_purchased_quantity' => 100,
                    'return_pack_quantity'    => 25,
                    'return_unit_quantity'    => 25,
                    'pack_purchase_price'     => 800,
                    'unit_purchase_price'     => 800,
                    'sub_total'               => 20000,
                ],
            ],
        ])->assertStatus(201);

        $prId = $prRes->json('id');
        $pr = PurchaseReturn::findOrFail($prId);

        $this->assertEquals('credit_note', $pr->settlement_mode);
        $this->assertEquals(20000.0, (float) $pr->credited_amount);

        // Cash drawer & Cash account were NOT touched
        $this->assertEquals(20000.0, (float) $session->fresh()->closing_balance_expected);
        $this->assertEquals($initialCashBalance, (float) $cashAccount->fresh()->current_balance);

        // Supplier ledger has debit note row and net_balance dropped from 80,000 to 60,000
        $supplierLedgerRow = SupplierLedger::where('purchase_return_id', $prId)->first();
        $this->assertNotNull($supplierLedgerRow);
        $this->assertEquals(20000.0, (float) $supplierLedgerRow->debited_amount);

        $supLedgerApi = $this->getJson("/api/supplier-ledger?supplier_id={$this->supplier->id}")->assertOk();
        $this->assertEquals(60000.0, (float) $supLedgerApi->json('summary.net_balance'));

        // 2. Delete the Purchase Return -> Supplier ledger net_balance returns to 80,000
        $this->deleteJson("/api/purchase-returns/{$prId}")->assertNoContent();
        $this->assertEquals(0, SupplierLedger::where('purchase_return_id', $prId)->count());
        $supLedgerAfterDel = $this->getJson("/api/supplier-ledger?supplier_id={$this->supplier->id}")->assertOk();
        $this->assertEquals(80000.0, (float) $supLedgerAfterDel->json('summary.net_balance'));
    }

    public function test_sale_return_credit_note_can_be_allocated_later_to_open_sale_invoices_without_changing_net_ledger_balance(): void
    {
        // 1. Create two credit SaleInvoices: INV-A (Rs. 2,000) and INV-B (Rs. 1,500)
        $invARes = $this->postJson('/api/sale-invoices', [
            'customer_id'   => $this->customer->id,
            'date'          => now()->toDateString(),
            'invoice_type'  => 'credit',
            'gross_amount'  => 2000,
            'total'         => 2000,
            'total_receive' => 0,
            'items'         => [
                [
                    'product_id'       => $this->product->id,
                    'pack_size'        => 1,
                    'current_quantity' => 200,
                    'quantity'         => 20,
                    'price'            => 100,
                    'sub_total'        => 2000,
                ],
            ],
        ])->assertStatus(201);
        $invA = SaleInvoice::findOrFail($invARes->json('id'));

        $invBRes = $this->postJson('/api/sale-invoices', [
            'customer_id'   => $this->customer->id,
            'date'          => now()->toDateString(),
            'invoice_type'  => 'credit',
            'gross_amount'  => 1500,
            'total'         => 1500,
            'total_receive' => 0,
            'items'         => [
                [
                    'product_id'       => $this->product->id,
                    'pack_size'        => 1,
                    'current_quantity' => 180,
                    'quantity'         => 15,
                    'price'            => 100,
                    'sub_total'        => 1500,
                ],
            ],
        ])->assertStatus(201);
        $invB = SaleInvoice::findOrFail($invBRes->json('id'));

        // 2. Post a SaleReturn with settlement_mode = 'credit_note' for Rs. 1,200
        $this->postJson('/api/sale-returns', [
            'customer_id'     => $this->customer->id,
            'sale_invoice_id' => $invA->id,
            'date'            => now()->toDateString(),
            'gross_total'     => 1200,
            'total'           => 1200,
            'settlement_mode' => 'credit_note',
            'items'           => [
                [
                    'product_id'           => $this->product->id,
                    'unit_sale_quantity'   => 20,
                    'unit_return_quantity' => 12,
                    'unit_sale_price'      => 100,
                    'sub_total'            => 1200,
                ],
            ],
        ])->assertStatus(201);

        // Net balance on ledger is 2000 + 1500 - 1200 = 2300
        $ledgerBefore = $this->getJson("/api/customer-ledger?customer_id={$this->customer->id}")->assertOk();
        $this->assertEquals(2300.0, (float) $ledgerBefore->json('summary.net_balance'));

        // Available credits shows Rs. 1,200 from the Credit Note
        $avail = $this->getJson("/api/payments/available-credits?party_type=customer&party_id={$this->customer->id}")
            ->assertOk();
        $this->assertEquals(1200.0, (float) $avail->json('total_unapplied'));
        $creditPaymentId = $avail->json('credits.0.id');
        $this->assertNotNull($creditPaymentId);

        // 3. Allocate Rs. 1,200 of the Credit Note to INV-B (reducing INV-B remaining due from 1500 to 300)
        $this->postJson("/api/payments/{$creditPaymentId}/allocate", [
            'allocations' => [
                ['invoice_id' => $invB->id, 'amount' => 1200],
            ],
        ])->assertOk();

        $this->assertEquals(1200.0, (float) $invB->fresh()->total_receive);

        // Open invoices endpoint now reports INV-B due = 300
        $openInvs = collect($this->getJson("/api/payments/open-invoices?party_type=customer&party_id={$this->customer->id}")->json());
        $invBOpen = $openInvs->firstWhere('id', $invB->id);
        $this->assertEquals(300.0, (float) $invBOpen['due']);

        // Customer ledger net balance remains 2300 (no double counting!)
        $ledgerAfter = $this->getJson("/api/customer-ledger?customer_id={$this->customer->id}")->assertOk();
        $this->assertEquals(2300.0, (float) $ledgerAfter->json('summary.net_balance'));
    }
}
