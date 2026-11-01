<?php

namespace Tests\Feature;

use App\Models\ChartOfAccount;
use App\Models\Customer;
use App\Models\PurchaseInvoice;
use App\Models\PurchaseReturn;
use App\Models\SaleInvoice;
use App\Models\SaleReturn;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class AccountingAndTaxEngineTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\App\Http\Middleware\EnsureLicensed::class);

        $role = Role::firstOrCreate(['name' => 'Admin', 'guard_name' => 'sanctum']);
        $this->admin = User::create([
            'name'     => 'Test Admin',
            'email'    => 'admin@test.com',
            'password' => bcrypt('password'),
            'status'   => 'active',
        ]);
        $this->admin->assignRole($role);
    }

    public function test_trial_balance_and_balance_sheet_are_always_mathematically_balanced(): void
    {
        $response = $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/accounting/overview?from=' . now()->startOfMonth()->toDateString() . '&to=' . now()->toDateString())
            ->assertOk();

        $response->assertJsonPath('trial_balance.is_balanced', true);
        $response->assertJsonPath('balance_sheet.is_balanced', true);
        $this->assertNotEmpty($response->json('chart_of_accounts'));
        $this->assertNotEmpty($response->json('tax_rates'));
    }

    public function test_can_create_and_reverse_double_entry_journal_voucher_and_rejects_unbalanced(): void
    {
        $cashAccount = ChartOfAccount::where('code', '1010')->firstOrFail();
        $capitalAccount = ChartOfAccount::where('code', '3100')->firstOrFail();

        // 1. Unbalanced entry should fail with 422
        $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/accounting/journal-entries', [
                'entry_date'  => now()->toDateString(),
                'description' => 'Unbalanced test entry',
                'lines'       => [
                    ['chart_of_account_id' => $cashAccount->id, 'debit' => 5000, 'credit' => 0],
                    ['chart_of_account_id' => $capitalAccount->id, 'debit' => 0, 'credit' => 3000],
                ],
            ])
            ->assertStatus(422);

        // 2. Balanced entry should succeed with 201
        $createRes = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/accounting/journal-entries', [
                'entry_date'       => now()->toDateString(),
                'reference_type'   => 'capital',
                'reference_number' => 'JV-CAP-01',
                'description'      => 'Additional owner capital injection',
                'lines'            => [
                    ['chart_of_account_id' => $cashAccount->id, 'debit' => 25000, 'credit' => 0, 'description' => 'Cash injected'],
                    ['chart_of_account_id' => $capitalAccount->id, 'debit' => 0, 'credit' => 25000, 'description' => 'Owner equity'],
                ],
            ])
            ->assertCreated();

        $entryId = $createRes->json('entry.id');
        $this->assertEquals(25000.0, (float) $createRes->json('entry.total_debit'));
        $this->assertEquals(25000.0, (float) $createRes->json('entry.total_credit'));

        // Verify Trial Balance & Balance Sheet remain balanced after JV
        $overviewRes = $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/accounting/overview')
            ->assertOk();
        $overviewRes->assertJsonPath('trial_balance.is_balanced', true);
        $overviewRes->assertJsonPath('balance_sheet.is_balanced', true);

        // 3. Reverse the Journal Entry
        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/accounting/journal-entries/{$entryId}/reverse", [
                'reason' => 'Testing reversal of capital entry',
            ])
            ->assertOk()
            ->assertJsonPath('entry.status', 'reversed');
    }

    public function test_statutory_tax_return_report_computes_output_and_input_tax_and_challan_settlement(): void
    {
        $customer = Customer::create([
            'name'       => 'Al-Shifa Hospital',
            'tax_number' => 'NTN-1122334-5',
            'tax_status' => 'registered',
        ]);

        $supplier = Supplier::create([
            'name'       => 'Getz Pharma Pvt Ltd',
            'tax_number' => 'STRN-9988776-1',
            'tax_status' => 'registered',
        ]);

        // Create a taxable Sale Invoice: Gross 10,000, Tax 18% = 1,800, Total 11,800
        SaleInvoice::create([
            'user_id'             => $this->admin->id,
            'customer_id'         => $customer->id,
            'posted_number'       => 'SI-TAX-001',
            'status'              => 'posted',
            'sale_type'           => 'wholesale',
            'date'                => now()->toDateString(),
            'gross_amount'        => 10000,
            'discount_percentage' => 0,
            'discount_amount'     => 0,
            'tax_percentage'      => 18,
            'tax_amount'          => 1800,
            'total'               => 11800,
            'total_receive'       => 11800,
        ]);

        // Create a Sale Return with tax reversal: Sub Total 1,000, Tax 180, Total 1,180
        SaleReturn::create([
            'user_id'             => $this->admin->id,
            'customer_id'         => $customer->id,
            'posted_number'       => 'SR-TAX-001',
            'date'                => now()->toDateString(),
            'gross_total'         => 1000,
            'discount_percentage' => 0,
            'discount_amount'     => 0,
            'tax_percentage'      => 18,
            'tax_amount'          => 180,
            'total'               => 1180,
        ]);

        // Create a taxable Purchase Invoice: Sub Total 5,000, Tax 18% = 900, Total 5,900
        PurchaseInvoice::create([
            'supplier_id'    => $supplier->id,
            'posted_number'  => 'PI-TAX-001',
            'posted_date'    => now()->toDateString(),
            'invoice_number' => 'SUP-INV-77',
            'invoice_amount' => 5000,
            'tax_percentage' => 18,
            'tax_amount'     => 900,
            'total_amount'   => 5900,
            'total_paid'     => 5900,
        ]);

        // Create a Purchase Return with input tax reversal: Sub Total 500, Tax 90, Total 590
        PurchaseReturn::create([
            'supplier_id'    => $supplier->id,
            'posted_number'  => 'PR-TAX-001',
            'date'           => now()->toDateString(),
            'gross_total'    => 500,
            'tax_percentage' => 18,
            'tax_amount'     => 90,
            'total'          => 590,
        ]);

        // Query Statutory Tax Return Report
        // Net Output Tax = 1,800 - 180 = 1,620
        // Net Input Tax  = 900 - 90 = 810
        // Net Tax Payable for Period = 1,620 - 810 = 810
        $taxRes = $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/reports/tax-return?from=' . now()->startOfMonth()->toDateString() . '&to=' . now()->toDateString())
            ->assertOk();

        $taxRes->assertJsonPath('summary.output_tax_collected', 1800);
        $taxRes->assertJsonPath('summary.sale_returns_tax_reversed', 180);
        $taxRes->assertJsonPath('summary.net_output_tax', 1620);

        $taxRes->assertJsonPath('summary.input_tax_paid', 900);
        $taxRes->assertJsonPath('summary.purchase_returns_tax_reversed', 90);
        $taxRes->assertJsonPath('summary.net_input_tax', 810);

        $taxRes->assertJsonPath('summary.net_tax_before_challan', 810);
        $taxRes->assertJsonPath('summary.net_tax_payable', 810);
        $taxRes->assertJsonPath('customer_annexure.0.party_tax_number', 'NTN-1122334-5');
        $taxRes->assertJsonPath('supplier_annexure.0.party_tax_number', 'STRN-9988776-1');

        // Record a Tax Challan Payment JV for Rs. 810 (Dr 2200 Output Tax Payable, Cr 1010 Cash & Bank)
        $taxPayableAccount = ChartOfAccount::where('code', '2200')->firstOrFail();
        $cashAccount = ChartOfAccount::where('code', '1010')->firstOrFail();

        $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/accounting/journal-entries', [
                'entry_date'       => now()->toDateString(),
                'reference_type'   => 'tax_payment',
                'reference_number' => 'CPR-2026-10',
                'description'      => 'Monthly GST Challan Payment',
                'lines'            => [
                    ['chart_of_account_id' => $taxPayableAccount->id, 'debit' => 810, 'credit' => 0],
                    ['chart_of_account_id' => $cashAccount->id, 'debit' => 0, 'credit' => 810],
                ],
            ])
            ->assertCreated();

        // Verify Tax Return now shows Tax Challans Paid = 810 and Net Tax Payable = 0
        $afterChallanRes = $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/reports/tax-return?from=' . now()->startOfMonth()->toDateString() . '&to=' . now()->toDateString())
            ->assertOk();

        $afterChallanRes->assertJsonPath('summary.tax_challans_paid', 810);
        $afterChallanRes->assertJsonPath('summary.net_tax_payable', 0);
        $afterChallanRes->assertJsonPath('summary.status', 'settled');
    }

    public function test_stock_writeoff_not_double_counted_and_cash_flow_excludes_credit_notes_and_allocated_payments(): void
    {
        $customer = Customer::create(['name' => 'CashFlow Audit Customer']);

        // 1. Create a Stock Disposal Write-off Expense of Rs. 400
        $disposalCat = \App\Models\ExpenseCategory::firstOrCreate(
            ['code' => 'stock_disposal_writeoff'],
            ['name' => 'Stock Disposal / Damage Write-off', 'is_system' => true, 'is_active' => true]
        );
        \App\Models\Expense::create([
            'expense_number'      => 'EXP-DISP-001',
            'expense_category_id' => $disposalCat->id,
            'date'                => now()->toDateString(),
            'amount'              => 400,
            'payment_method'      => 'none',
            'description'         => 'Expired batch write-off',
            'user_id'             => $this->admin->id,
        ]);

        // 2. Create a credit SaleInvoice of Rs. 1,000 (0 direct cash at sale)
        $invoice = SaleInvoice::create([
            'user_id'       => $this->admin->id,
            'customer_id'   => $customer->id,
            'posted_number' => 'SI-CF-001',
            'status'        => 'posted',
            'invoice_type'  => 'credit',
            'date'          => now()->toDateString(),
            'gross_amount'  => 1000,
            'total'         => 1000,
            'total_receive' => 0,
        ]);

        // 3. Allocate a Rs. 600 Cash Payment to SI-CF-001
        $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/payments', [
                'party_type'     => 'customer',
                'party_id'       => $customer->id,
                'payment_date'   => now()->toDateString(),
                'amount'         => 600,
                'payment_method' => 'cash',
                'allocations'    => [
                    ['invoice_id' => $invoice->id, 'amount' => 600],
                ],
            ])
            ->assertCreated();

        // 4. Also create a non-cash credit_note Payment of Rs. 200 (from a sale return)
        \App\Models\Payment::create([
            'payment_number'   => 'RET-CN-TEST-01',
            'party_type'       => 'customer',
            'party_id'         => $customer->id,
            'payment_date'     => now()->toDateString(),
            'amount'           => 200,
            'allocated_amount' => 0,
            'unapplied_amount' => 200,
            'payment_method'   => 'credit_note',
            'status'           => 'posted',
            'created_by'       => $this->admin->id,
        ]);

        // Verify Accounting Overview:
        $overviewRes = $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/accounting/overview?from=' . now()->startOfMonth()->toDateString() . '&to=' . now()->toDateString())
            ->assertOk();

        // (a) Trial Balance & Balance Sheet are balanced
        $overviewRes->assertJsonPath('trial_balance.is_balanced', true);
        $overviewRes->assertJsonPath('balance_sheet.is_balanced', true);

        // (b) Stock disposal write-off (400) is in 5200 (Shrinkage) and NOT in 5300 (Operating Expenses)
        $tbRows = collect($overviewRes->json('trial_balance.rows'));
        $coa5200 = $tbRows->firstWhere('code', '5200');
        $coa5300 = $tbRows->firstWhere('code', '5300');
        $this->assertEquals(400.0, (float) ($coa5200['debit'] ?? 0));
        $this->assertEquals(0.0, (float) ($coa5300['debit'] ?? 0));

        // (c) Cash Flow Statement:
        // Direct cash on sales = 0 (since 600 on invoice came from PaymentAllocation!)
        // Customer payments received = 600 (excluding the 200 non-cash credit_note!)
        // Operating expenses paid = 0 (excluding the 400 non-cash inventory write-off!)
        $cf = $overviewRes->json('cash_flow.operating');
        $this->assertEquals(0.0, (float) $cf['cash_from_sales']);
        $this->assertEquals(600.0, (float) $cf['customer_payment_vouchers']);
        $this->assertEquals(0.0, (float) $cf['operating_expenses_paid']);
        $this->assertEquals(600.0, (float) $overviewRes->json('cash_flow.net_cash_change'));
    }
}
