<?php

namespace Tests\Feature;

use App\Models\Brand;
use App\Models\Category;
use App\Models\Customer;
use App\Models\CustomerLedger;
use App\Models\Product;
use App\Models\PurchaseInvoice;
use App\Models\SaleInvoice;
use App\Models\Supplier;
use App\Models\SupplierLedger;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Tests\TestCase;

class CreditTermsAndAgingTest extends TestCase
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
            '2025_09_08_012037_add_total_paid_to_purchase_invoices_table.php',
            '2025_09_26_000000_add_invoice_type_to_purchase_invoices_table.php',
            '2025_08_30_171505_create_sale_invoices_table.php',
            '2025_08_30_171513_create_sale_invoice_items_table.php',
            '2025_09_01_074800_create_sale_returns_table.php',
            '2025_09_01_074814_create_sale_return_items_table.php',
            '2025_09_08_162536_add_total_receive_to_sale_invoices_table.php',
            '2025_09_25_000000_add_invoice_type_to_sale_invoices_table.php',
            '2026_04_01_000003_add_whole_sale_margin_to_products_table.php',
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
        ] as $file) {
            (require database_path('migrations/' . $file))->up();
        }

        Gate::before(fn () => true);
        $this->withoutMiddleware(\App\Http\Middleware\EnsureLicensed::class);

        $this->user = User::forceCreate([
            'name'     => 'Manager Mike',
            'email'    => 'mike@test.local',
            'password' => bcrypt('password'),
        ]);

        $category = Category::create(['name' => 'General Medicine']);
        $brand = Brand::create(['name' => 'Glaxo']);
        $this->supplier = Supplier::create([
            'name' => 'Apex Pharma Distributor',
            'phone' => '03001234567',
            'credit_limit' => 200000,
            'credit_days' => 45,
        ]);

        $this->customer = Customer::create([
            'name' => 'Dr. Haroon Clinic',
            'phone' => '03219876543',
            'credit_limit' => 50000,
            'credit_days' => 30,
            'credit_status' => 'active',
        ]);

        $this->product = Product::create([
            'name' => 'Panadol 500mg',
            'product_code' => 'PAN-500',
            'barcode' => '1234567890',
            'category_id' => $category->id,
            'brand_id' => $brand->id,
            'supplier_id' => $this->supplier->id,
            'quantity' => 1000,
            'pack_size' => 10,
            'unit_purchase_price' => 20,
            'pack_purchase_price' => 200,
            'unit_sale_price' => 30,
            'pack_sale_price' => 300,
            'narcotic' => 'no',
        ]);
    }

    public function test_customer_creation_and_credit_summary_endpoint()
    {
        $response = $this->actingAs($this->user)
            ->getJson("/api/customers/{$this->customer->id}/credit-summary");

        $response->assertStatus(200)
            ->assertJson([
                'customer_id' => $this->customer->id,
                'name' => 'Dr. Haroon Clinic',
                'credit_limit' => 50000,
                'credit_days' => 30,
                'credit_status' => 'active',
                'current_balance' => 0,
                'available_credit' => 50000,
                'is_limit_exceeded' => false,
            ]);
    }

    public function test_supplier_creation_and_credit_summary_endpoint()
    {
        $response = $this->actingAs($this->user)
            ->getJson("/api/suppliers/{$this->supplier->id}/credit-summary");

        $response->assertStatus(200)
            ->assertJson([
                'supplier_id' => $this->supplier->id,
                'name' => 'Apex Pharma Distributor',
                'credit_limit' => 200000,
                'credit_days' => 45,
                'current_balance' => 0,
                'available_credit' => 200000,
                'is_limit_exceeded' => false,
            ]);
    }

    public function test_credit_sale_invoice_auto_calculates_due_date_from_credit_days()
    {
        $saleDate = '2026-10-01';
        $payload = [
            'customer_id' => $this->customer->id,
            'date' => $saleDate,
            'invoice_type' => 'credit',
            'sale_type' => 'retail',
            'wholesale_type' => 'unit',
            'gross_amount' => 1500,
            'total' => 1500,
            'total_receive' => 0,
            'items' => [
                [
                    'product_id' => $this->product->id,
                    'quantity' => 50,
                    'price' => 30,
                    'sub_total' => 1500,
                ],
            ],
        ];

        $response = $this->actingAs($this->user)
            ->postJson('/api/sale-invoices', $payload);

        $response->assertStatus(201);
        $invoice = SaleInvoice::latest('id')->first();
        $this->assertNotNull($invoice);
        // Customer credit days = 30 -> Due date should be 2026-10-31
        $this->assertEquals('2026-10-31', Carbon::parse($invoice->due_date)->toDateString());

        // Customer ledger entry should also have due_date
        $ledger = CustomerLedger::where('sale_invoice_id', $invoice->id)->first();
        $this->assertNotNull($ledger);
        $this->assertEquals('2026-10-31', Carbon::parse($ledger->due_date)->toDateString());
    }

    public function test_credit_limit_enforcement_blocks_sale_and_requires_override()
    {
        // Customer has credit limit 50,000.
        // Attempt a credit sale of 60,000 without override -> should return 422 with requires_override: true
        $payload = [
            'customer_id' => $this->customer->id,
            'date' => '2026-10-15',
            'invoice_type' => 'credit',
            'sale_type' => 'retail',
            'wholesale_type' => 'unit',
            'gross_amount' => 60000,
            'total' => 60000,
            'total_receive' => 0,
            'items' => [
                [
                    'product_id' => $this->product->id,
                    'quantity' => 600,
                    'price' => 100,
                    'sub_total' => 60000,
                ],
            ],
        ];

        $response = $this->actingAs($this->user)
            ->postJson('/api/sale-invoices', $payload);

        $response->assertStatus(422)
            ->assertJson([
                'requires_override' => true,
                'excess_amount' => 10000,
                'credit_limit' => 50000,
            ]);

        // Now resubmit WITH credit_override = true -> should succeed!
        $payloadWithOverride = array_merge($payload, ['credit_override' => true]);
        $overrideResponse = $this->actingAs($this->user)
            ->postJson('/api/sale-invoices', $payloadWithOverride);

        $overrideResponse->assertStatus(201);
        $this->assertEquals(60000, CustomerLedger::getCustomerNetBalance($this->customer->id));
    }

    public function test_customer_on_hold_status_requires_override()
    {
        $this->customer->update(['credit_status' => 'on_hold']);

        $payload = [
            'customer_id' => $this->customer->id,
            'date' => '2026-10-15',
            'invoice_type' => 'credit',
            'sale_type' => 'retail',
            'wholesale_type' => 'unit',
            'gross_amount' => 500,
            'total' => 500,
            'total_receive' => 0,
            'items' => [
                [
                    'product_id' => $this->product->id,
                    'quantity' => 10,
                    'price' => 50,
                    'sub_total' => 500,
                ],
            ],
        ];

        $response = $this->actingAs($this->user)
            ->postJson('/api/sale-invoices', $payload);

        $response->assertStatus(422)
            ->assertJson([
                'requires_override' => true,
                'credit_status' => 'on_hold',
            ]);

        // Resubmit with credit_override: true
        $overrideResponse = $this->actingAs($this->user)
            ->postJson('/api/sale-invoices', array_merge($payload, ['credit_override' => true]));

        $overrideResponse->assertStatus(201);
    }

    public function test_customer_blocked_status_prohibits_credit_sale_completely()
    {
        $this->customer->update(['credit_status' => 'blocked']);

        $payload = [
            'customer_id' => $this->customer->id,
            'date' => '2026-10-15',
            'invoice_type' => 'credit',
            'sale_type' => 'retail',
            'wholesale_type' => 'unit',
            'credit_override' => true, // even with override!
            'gross_amount' => 500,
            'total' => 500,
            'total_receive' => 0,
            'items' => [
                [
                    'product_id' => $this->product->id,
                    'quantity' => 10,
                    'price' => 50,
                    'sub_total' => 500,
                ],
            ],
        ];

        $response = $this->actingAs($this->user)
            ->postJson('/api/sale-invoices', $payload);

        $response->assertStatus(422)
            ->assertJson([
                'credit_status' => 'blocked',
            ]);
    }

    public function test_purchase_invoice_calculates_due_date_from_supplier_terms()
    {
        $postedDate = '2026-10-01';
        $payload = [
            'supplier_id' => $this->supplier->id,
            'posted_date' => $postedDate,
            'invoice_number' => 'INV-SUPP-999',
            'invoice_amount' => 5000,
            'invoice_type' => 'credit',
            'total_amount' => 5000,
            'total_paid' => 0,
            'items' => [
                [
                    'product_id' => $this->product->id,
                    'pack_quantity' => 25,
                    'pack_size' => 10,
                    'unit_quantity' => 0,
                    'quantity' => 250,
                    'pack_purchase_price' => 200,
                    'unit_purchase_price' => 20,
                    'pack_sale_price' => 300,
                    'unit_sale_price' => 30,
                    'margin' => 50,
                    'avg_price' => 20,
                    'sub_total' => 5000,
                ],
            ],
        ];

        $response = $this->actingAs($this->user)
            ->postJson('/api/purchase-invoices', $payload);

        $response->assertStatus(201);
        $purchaseInvoice = PurchaseInvoice::latest('id')->first();
        $this->assertNotNull($purchaseInvoice);
        // Supplier credit days = 45 -> Due date should be 2026-10-01 + 45 days = 2026-11-15
        $this->assertEquals('2026-11-15', Carbon::parse($purchaseInvoice->due_date)->toDateString());

        // Supplier ledger should also have due_date
        $suppLedger = SupplierLedger::where('purchase_invoice_id', $purchaseInvoice->id)->first();
        $this->assertNotNull($suppLedger);
        $this->assertEquals('2026-11-15', Carbon::parse($suppLedger->due_date)->toDateString());
    }

    public function test_outstanding_aging_report_by_due_date_and_overdue_buckets()
    {
        // Create 2 open credit invoices:
        // Invoice 1: date 2026-08-01, credit_days 30 -> due 2026-08-31
        // As of 2026-10-23: overdue days = 53 days -> bucket days_31_60
        $inv1 = SaleInvoice::create([
            'user_id' => $this->user->id,
            'customer_id' => $this->customer->id,
            'date' => '2026-08-01',
            'due_date' => '2026-08-31',
            'posted_number' => 'SAL-001',
            'invoice_type' => 'credit',
            'sale_type' => 'retail',
            'gross_amount' => 10000,
            'total' => 10000,
            'total_receive' => 0,
        ]);
        CustomerLedger::create([
            'customer_id' => $this->customer->id,
            'sale_invoice_id' => $inv1->id,
            'entry_date' => '2026-08-01',
            'due_date' => '2026-08-31',
            'entry_type' => 'invoice',
            'posted_number' => 'SAL-001',
            'invoice_total' => 10000,
            'total_received' => 0,
        ]);

        // Invoice 2: date 2026-10-15, credit_days 30 -> due 2026-11-14
        // As of 2026-10-23: not overdue -> bucket current
        $inv2 = SaleInvoice::create([
            'user_id' => $this->user->id,
            'customer_id' => $this->customer->id,
            'date' => '2026-10-15',
            'due_date' => '2026-11-14',
            'posted_number' => 'SAL-002',
            'invoice_type' => 'credit',
            'sale_type' => 'retail',
            'gross_amount' => 5000,
            'total' => 5000,
            'total_receive' => 0,
        ]);
        CustomerLedger::create([
            'customer_id' => $this->customer->id,
            'sale_invoice_id' => $inv2->id,
            'entry_date' => '2026-10-15',
            'due_date' => '2026-11-14',
            'entry_type' => 'invoice',
            'posted_number' => 'SAL-002',
            'invoice_total' => 5000,
            'total_received' => 0,
        ]);

        // Run aging report as of 2026-10-23 by due_date
        $response = $this->actingAs($this->user)
            ->getJson('/api/reports/outstanding-aging?as_of=2026-10-23&aging_by=due_date');

        $response->assertStatus(200);
        $data = $response->json();

        $this->assertEquals('due_date', $data['aging_by']);
        $custRow = collect($data['customers'])->firstWhere('party_id', $this->customer->id);
        $this->assertNotNull($custRow);

        $this->assertEquals(15000, $custRow['total']);
        $this->assertEquals(10000, $custRow['total_overdue']);
        $this->assertEquals(5000, $custRow['current']);
        $this->assertEquals(10000, $custRow['days_31_60']);
        $this->assertEquals(0, $custRow['days_1_30']);
        $this->assertEquals(0, $custRow['days_61_90']);
        $this->assertEquals(0, $custRow['over_90']);
        $this->assertEquals(50000, $custRow['credit_limit']);
        $this->assertEquals('active', $custRow['credit_status']);
    }

    public function test_overdue_work_queue_endpoint()
    {
        // Customer 1: Has overdue invoice of 10,000 (due 2026-08-31)
        $inv1 = SaleInvoice::create([
            'user_id' => $this->user->id,
            'customer_id' => $this->customer->id,
            'date' => '2026-08-01',
            'due_date' => '2026-08-31',
            'posted_number' => 'SAL-001',
            'invoice_type' => 'credit',
            'sale_type' => 'retail',
            'gross_amount' => 10000,
            'total' => 10000,
            'total_receive' => 0,
        ]);
        CustomerLedger::create([
            'customer_id' => $this->customer->id,
            'sale_invoice_id' => $inv1->id,
            'entry_date' => '2026-08-01',
            'due_date' => '2026-08-31',
            'entry_type' => 'invoice',
            'posted_number' => 'SAL-001',
            'invoice_total' => 10000,
            'total_received' => 0,
        ]);

        // Customer 2: Has NOT overdue invoice (due 2026-11-30)
        $customer2 = Customer::create([
            'name' => 'Dr. Ayesha Clinic',
            'phone' => '03331112233',
            'credit_limit' => 30000,
            'credit_days' => 30,
        ]);
        $inv2 = SaleInvoice::create([
            'user_id' => $this->user->id,
            'customer_id' => $customer2->id,
            'date' => '2026-10-20',
            'due_date' => '2026-11-19',
            'posted_number' => 'SAL-002',
            'invoice_type' => 'credit',
            'sale_type' => 'retail',
            'gross_amount' => 7000,
            'total' => 7000,
            'total_receive' => 0,
        ]);
        CustomerLedger::create([
            'customer_id' => $customer2->id,
            'sale_invoice_id' => $inv2->id,
            'entry_date' => '2026-10-20',
            'due_date' => '2026-11-19',
            'entry_type' => 'invoice',
            'posted_number' => 'SAL-002',
            'invoice_total' => 7000,
            'total_received' => 0,
        ]);

        // Call overdue work queue as of 2026-10-23
        $response = $this->actingAs($this->user)
            ->getJson('/api/reports/overdue-work-queue?as_of=2026-10-23&party_type=customers');

        $response->assertStatus(200);
        $data = $response->json();

        // Customer 1 should be present because they are overdue
        $this->assertEquals(1, $data['total_parties']);
        $this->assertEquals(10000, $data['total_overdue_sum']);
        $party = $data['parties'][0];
        $this->assertEquals($this->customer->id, $party['party_id']);
        $this->assertEquals('Dr. Haroon Clinic', $party['party_name']);
        $this->assertEquals('03219876543', $party['party_phone']);
        $this->assertEquals(10000, $party['total_overdue']);
        $this->assertNotEmpty($party['overdue_entries']);
        $this->assertEquals('SAL-001', $party['overdue_entries'][0]['reference']);
        $this->assertEquals('2026-08-31', $party['overdue_entries'][0]['due_date']);
    }

    public function test_walk_in_customer_cannot_save_bill_with_unpaid_credit_udhar(): void
    {
        $walkIn = Customer::create([
            'name' => 'WALK-IN-CUSTOMER',
            'phone' => '03000000000',
        ]);

        // 1. Attempting a credit invoice on Walk-In Customer is blocked with 422
        $creditRes = $this->actingAs($this->user)->postJson('/api/sale-invoices', [
            'customer_id'   => $walkIn->id,
            'invoice_type'  => 'credit',
            'sale_type'     => 'retail',
            'date'          => '2026-10-31',
            'gross_amount'  => 300,
            'total'         => 300,
            'total_receive' => 0,
            'items'         => [
                [
                    'product_id' => $this->product->id,
                    'quantity'   => 10,
                    'price'      => 30,
                    'sub_total'  => 300,
                ],
            ],
        ]);

        $creditRes->assertStatus(422)
            ->assertJsonPath(
                'message',
                'Walk-In Customer bills cannot be saved with unpaid credit (Udhar)—select or create a named Customer if the bill is not paid in full.'
            );

        // 2. Attempting a debit invoice on Walk-In Customer with partial payment (total_receive < total) is blocked with 422
        $partialDebitRes = $this->actingAs($this->user)->postJson('/api/sale-invoices', [
            'customer_id'   => $walkIn->id,
            'invoice_type'  => 'debit',
            'sale_type'     => 'retail',
            'date'          => '2026-10-31',
            'gross_amount'  => 300,
            'total'         => 300,
            'total_receive' => 100,
            'items'         => [
                [
                    'product_id' => $this->product->id,
                    'quantity'   => 10,
                    'price'      => 30,
                    'sub_total'  => 300,
                ],
            ],
        ]);

        $partialDebitRes->assertStatus(422)
            ->assertJsonPath(
                'message',
                'Walk-In Customer bills cannot be saved with unpaid credit (Udhar)—select or create a named Customer if the bill is not paid in full.'
            );

        // 3. Paying in full succeeds
        $paidRes = $this->actingAs($this->user)->postJson('/api/sale-invoices', [
            'customer_id'   => $walkIn->id,
            'invoice_type'  => 'debit',
            'sale_type'     => 'retail',
            'date'          => '2026-10-31',
            'gross_amount'  => 300,
            'total'         => 300,
            'total_receive' => 300,
            'items'         => [
                [
                    'product_id' => $this->product->id,
                    'quantity'   => 10,
                    'price'      => 30,
                    'sub_total'  => 300,
                ],
            ],
        ]);

        $paidRes->assertStatus(201);

        // 4. Debit invoice on Walk-In Customer with a batched product where batch selection
        // changes the item price (e.g. client initially had catalog total=300, total_receive=300,
        // or cash_given=300, while the selected batch price is 45/unit -> 450 on server recalculation)
        // must succeed and sync total_receive to server-authoritative total (450) without triggering Udhar error.
        \App\Models\Batch::create([
            'product_id'   => $this->product->id,
            'batch_number' => 'BATCH-FRAC-01',
            'expiry_date'  => '2028-12-31',
            'quantity'     => 50,
        ]);

        $batchedDebitRes = $this->actingAs($this->user)->postJson('/api/sale-invoices', [
            'customer_id'   => $walkIn->id,
            'invoice_type'  => 'debit',
            'sale_type'     => 'retail',
            'date'          => '2026-10-31',
            'gross_amount'  => 300,
            'total'         => '300',
            'total_receive' => '300',
            'cash_given'    => '300',
            'items'         => [
                [
                    'product_id'   => $this->product->id,
                    'batch_number' => 'BATCH-FRAC-01',
                    'expiry'       => '2028-12-31',
                    'pack_size'    => 10,
                    'quantity'     => 10,
                    'price'        => 45,
                    'sub_total'    => 450,
                ],
            ],
        ]);

        $batchedDebitRes->assertStatus(201);
        $createdInv = SaleInvoice::findOrFail($batchedDebitRes->json('id'));
        $this->assertEquals(450.0, (float) $createdInv->total);
        $this->assertEquals(450.0, (float) $createdInv->total_receive);

        // Updating that debit invoice with higher batch quantity/price while client total_receive matched old client total also succeeds
        $updateBatchedDebitRes = $this->actingAs($this->user)->putJson("/api/sale-invoices/{$createdInv->id}", [
            'posted_number' => $createdInv->posted_number,
            'customer_id'   => $walkIn->id,
            'invoice_type'  => 'debit',
            'sale_type'     => 'retail',
            'date'          => '2026-10-31',
            'gross_amount'  => 450,
            'total'         => '450',
            'total_receive' => '450',
            'items'         => [
                [
                    'id'           => $createdInv->items()->first()->id,
                    'product_id'   => $this->product->id,
                    'batch_number' => 'BATCH-FRAC-01',
                    'expiry'       => '2028-12-31',
                    'pack_size'    => 10,
                    'quantity'     => 12,
                    'price'        => 45,
                    'sub_total'    => 540,
                ],
            ],
        ]);

        $updateBatchedDebitRes->assertStatus(200);
        $createdInv->refresh();
        $this->assertEquals(540.0, (float) $createdInv->total);
        $this->assertEquals(540.0, (float) $createdInv->total_receive);
    }

    public function test_flush_walkin_credit_command_flushes_walk_in_udhar_and_preserves_named_customer_credit(): void
    {
        $walkIn = Customer::create([
            'name' => 'WALK-IN-CUSTOMER',
            'phone' => '03000000000',
        ]);

        // Legacy unpaid credit invoice on Walk-In Customer
        $walkInInv = SaleInvoice::create([
            'user_id'       => $this->user->id,
            'customer_id'   => $walkIn->id,
            'date'          => '2026-10-01',
            'posted_number' => 'SI-WALKIN-001',
            'invoice_type'  => 'credit',
            'sale_type'     => 'retail',
            'gross_amount'  => 1500,
            'total'         => 1500,
            'total_receive' => 200,
        ]);
        CustomerLedger::create([
            'customer_id'       => $walkIn->id,
            'sale_invoice_id'   => $walkInInv->id,
            'entry_date'        => '2026-10-01',
            'entry_type'        => 'invoice',
            'posted_number'     => 'SI-WALKIN-001',
            'invoice_total'     => 1500,
            'total_received'    => 200,
            'balance_remaining' => 1300,
        ]);

        // Named customer credit invoice should NOT be touched
        $namedInv = SaleInvoice::create([
            'user_id'       => $this->user->id,
            'customer_id'   => $this->customer->id,
            'date'          => '2026-10-01',
            'posted_number' => 'SI-NAMED-001',
            'invoice_type'  => 'credit',
            'sale_type'     => 'retail',
            'gross_amount'  => 4000,
            'total'         => 4000,
            'total_receive' => 1000,
        ]);
        CustomerLedger::create([
            'customer_id'       => $this->customer->id,
            'sale_invoice_id'   => $namedInv->id,
            'entry_date'        => '2026-10-01',
            'entry_type'        => 'invoice',
            'posted_number'     => 'SI-NAMED-001',
            'invoice_total'     => 4000,
            'total_received'    => 1000,
            'balance_remaining' => 3000,
        ]);

        $this->artisan('karobar:flush-walkin-credit')
            ->assertExitCode(0);

        $walkInInv->refresh();
        $this->assertEquals('debit', $walkInInv->invoice_type);
        $this->assertEquals(1500.0, (float) $walkInInv->total_receive);
        $this->assertEquals(0, CustomerLedger::where('customer_id', $walkIn->id)->count());
        $this->assertEquals(0.0, CustomerLedger::getCustomerNetBalance($walkIn->id));

        // Named customer credit remains intact
        $namedInv->refresh();
        $this->assertEquals('credit', $namedInv->invoice_type);
        $this->assertEquals(1000.0, (float) $namedInv->total_receive);
        $this->assertEquals(3000.0, CustomerLedger::getCustomerNetBalance($this->customer->id));
    }
}
