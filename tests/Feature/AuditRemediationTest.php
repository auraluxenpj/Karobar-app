<?php

namespace Tests\Feature;

use App\Http\Middleware\EnsureLicensed;
use App\Models\Batch;
use App\Models\Brand;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\Product;
use App\Models\PurchaseInvoice;
use App\Models\SaleInvoice;
use App\Models\SaleInvoiceItem;
use App\Models\SaleReturn;
use App\Models\SaleReturnItem;
use App\Models\Setting;
use App\Models\StocktakeSession;
use App\Models\Supplier;
use App\Models\SupplierLedger;
use App\Models\User;
use App\Services\AccountingService;
use App\Services\ReturnEntitlement;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class AuditRemediationTest extends TestCase
{
    use RefreshDatabase;

    private Category $category;
    private Brand $brand;
    private Supplier $supplier;
    private Customer $customer;
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware(EnsureLicensed::class);

        $adminRole = Role::firstOrCreate(['name' => 'Admin', 'guard_name' => 'sanctum']);
        Role::firstOrCreate(['name' => 'Manager', 'guard_name' => 'sanctum']);
        Role::firstOrCreate(['name' => 'Cashier', 'guard_name' => 'sanctum']);

        $this->admin = $this->makeUser(['name' => 'System Admin', 'email' => 'admin@audit.local']);
        $this->admin->assignRole($adminRole);

        $this->category = Category::create(['name' => 'Antibiotics']);
        $this->brand = Brand::create(['name' => 'Abbott']);
        $this->supplier = Supplier::create(['name' => 'Audit Pharma Supplier']);
        $this->customer = Customer::create(['name' => 'Audit Pharmacy Customer']);
    }

    private function makeUser(array $overrides = []): User
    {
        static $counter = 1;
        $idx = $counter++;

        return User::create(array_merge([
            'name' => "Audit User {$idx}",
            'email' => "audit_user_{$idx}@example.com",
            'password' => Hash::make('password123'),
            'status' => 'active',
        ], $overrides));
    }

    private function makeProduct(array $overrides = []): Product
    {
        static $prodCounter = 1;
        $idx = $prodCounter++;

        return Product::create(array_merge([
            'name' => "Audit Medicine {$idx}",
            'product_code' => "AUD-PRD-{$idx}",
            'barcode' => "AUD-BAR-{$idx}",
            'category_id' => $this->category->id,
            'brand_id' => $this->brand->id,
            'supplier_id' => $this->supplier->id,
            'pack_size' => 10,
            'quantity' => 100,
            'pack_purchase_price' => 80,
            'unit_purchase_price' => 8,
            'pack_sale_price' => 100,
            'unit_sale_price' => 10,
            'avg_price' => 8,
        ], $overrides));
    }

    public function test_settings_endpoint_redacts_secrets_and_blocks_ssrf_whatsapp_urls(): void
    {
        Setting::create([
            'store_name' => 'Karobar Pharmacy',
            'printer_type' => 'thermal',
            'smtp_password' => 'super-secret-smtp-pass',
            'whatsapp_access_token' => 'wa-secret-token-123',
            'cube_groq_api_key' => 'gsk_secret_key',
            'cube_gemini_api_key' => 'AIza_secret_key',
        ]);

        Sanctum::actingAs($this->admin);

        $res = $this->getJson('/api/settings')->assertOk();
        $res->assertJsonMissingPath('smtp_password');
        $res->assertJsonMissingPath('whatsapp_access_token');
        $res->assertJsonMissingPath('cube_groq_api_key');
        $res->assertJsonMissingPath('cube_gemini_api_key');
        $res->assertJsonPath('has_smtp_password', true);
        $res->assertJsonPath('has_whatsapp_access_token', true);

        // Saving settings without secret fields preserves stored secrets
        $this->postJson('/api/settings', [
            'store_name' => 'Karobar Pharmacy Updated',
            'printer_type' => 'thermal',
        ])->assertOk();

        $setting = Setting::first();
        $this->assertSame('super-secret-smtp-pass', $setting->smtp_password);
        $this->assertSame('wa-secret-token-123', $setting->whatsapp_access_token);

        // SSRF link-local metadata URL is rejected
        $this->postJson('/api/settings', [
            'printer_type' => 'thermal',
            'whatsapp_mode' => 'baileys_agent',
            'whatsapp_api_url' => 'http://169.254.169.254/latest/meta-data/',
        ])->assertStatus(422);
    }

    public function test_report_policies_enforce_authorization_on_all_6_authorizables(): void
    {
        $unprivileged = $this->makeUser();
        Sanctum::actingAs($unprivileged);

        $endpoints = [
            '/api/reports/cost-of-sale' => 'report.cost-of-sale.view',
            '/api/reports/sale-detail' => 'report.sale-detail.view',
            '/api/reports/purchase-detail' => 'report.purchase-detail.view',
            '/api/reports/current-stock' => 'report.current-stock.view',
            '/api/reports/stock-adjustment' => 'report.stock-adjustment.view',
            '/api/purchase-orders/forecast?date_from=2026-10-01&date_to=2026-10-31&projected_days=30' => 'purchase-order.generate',
        ];

        foreach ($endpoints as $url => $permName) {
            $this->getJson($url)->assertStatus(403);
        }

        foreach ($endpoints as $url => $permName) {
            $perm = Permission::firstOrCreate(['name' => $permName, 'guard_name' => 'sanctum']);
            $viewer = $this->makeUser();
            $viewer->givePermissionTo($perm);
            Sanctum::actingAs($viewer);

            $this->getJson($url)->assertOk();
        }
    }

    public function test_user_controller_prevents_role_privilege_escalation_and_linked_user_deletion(): void
    {
        $highPerm = Permission::firstOrCreate(['name' => 'backup.restore', 'guard_name' => 'sanctum']);
        $highRole = Role::firstOrCreate(['name' => 'SecurityOfficer', 'guard_name' => 'sanctum']);
        $highRole->givePermissionTo($highPerm);

        $userView = Permission::firstOrCreate(['name' => 'user.view', 'guard_name' => 'sanctum']);
        $userCreate = Permission::firstOrCreate(['name' => 'user.create', 'guard_name' => 'sanctum']);
        $userUpdate = Permission::firstOrCreate(['name' => 'user.update', 'guard_name' => 'sanctum']);
        $userAssign = Permission::firstOrCreate(['name' => 'user.assign-roles', 'guard_name' => 'sanctum']);

        $subManager = $this->makeUser();
        $subManager->givePermissionTo([$userView, $userCreate, $userUpdate, $userAssign]);
        Sanctum::actingAs($subManager);

        // Sub-manager cannot create a user with a role containing permissions they do not possess
        $this->postJson('/api/users', [
            'name' => 'Escalated User',
            'email' => 'escalated@example.com',
            'password' => 'password123',
            'roles' => [$highRole->name],
        ])->assertStatus(403);

        // Admin cannot hard-delete a user who has financial transaction records
        Sanctum::actingAs($this->admin);
        $cashier = $this->makeUser();
        SaleInvoice::create([
            'user_id' => $cashier->id,
            'customer_id' => $this->customer->id,
            'posted_number' => 'SI-AUD-001',
            'date' => now()->toDateString(),
            'invoice_type' => 'debit',
            'gross_amount' => 100,
            'total' => 100,
            'total_receive' => 100,
        ]);

        $this->deleteJson("/api/users/{$cashier->id}")
            ->assertStatus(422);
    }

    public function test_expense_controller_ignores_client_supplied_receipt_path(): void
    {
        Sanctum::actingAs($this->admin);

        $cat = ExpenseCategory::create([
            'name' => 'Utilities',
            'code' => 'EXP-UTIL',
            'is_active' => true,
        ]);

        $res = $this->postJson('/api/expenses', [
            'expense_category_id' => $cat->id,
            'date' => now()->toDateString(),
            'amount' => 500,
            'payment_method' => 'non_cash_other',
            'description' => 'Electricity Bill',
            'receipt_path' => '../../.env',
        ]);

        // If payment_method validation prefers 'cash' or 'bank_transfer', verify with 'cash'
        if ($res->status() === 422) {
            $res = $this->postJson('/api/expenses', [
                'expense_category_id' => $cat->id,
                'date' => now()->toDateString(),
                'amount' => 500,
                'payment_method' => 'cash',
                'description' => 'Electricity Bill',
                'receipt_path' => '../../.env',
            ]);
        }

        $res->assertStatus(201);
        $expense = Expense::latest('id')->firstOrFail();
        $this->assertNull($expense->receipt_path);
    }

    public function test_return_entitlement_includes_wholesale_bonus_and_caps_batchless_returns(): void
    {
        $product = $this->makeProduct(['quantity' => 100]);

        $sale = SaleInvoice::create([
            'user_id' => $this->admin->id,
            'customer_id' => $this->customer->id,
            'posted_number' => 'SI-BONUS-1',
            'date' => now()->toDateString(),
            'invoice_type' => 'debit',
            'sale_type' => 'wholesale',
            'gross_amount' => 100,
            'total' => 100,
            'total_receive' => 100,
        ]);

        SaleInvoiceItem::create([
            'sale_invoice_id' => $sale->id,
            'product_id' => $product->id,
            'batch_number' => 'B-101',
            'expiry' => '2028-12-31',
            'pack_size' => 10,
            'quantity' => 10,
            'bonus' => 2,
            'price' => 10,
            'sub_total' => 100,
        ]);

        $entitlement = app(ReturnEntitlement::class);

        // Returning 12 units (10 paid + 2 bonus) succeeds
        $entitlement->validate('sale', [
            'sale_invoice_id' => $sale->id,
            'customer_id' => $this->customer->id,
            'items' => [
                [
                    'product_id' => $product->id,
                    'batch_number' => 'B-101',
                    'expiry' => '2028-12-31',
                    'unit_return_quantity' => 12,
                ],
            ],
        ]);

        // Returning 13 units without batch_number is rejected by total product entitlement cap
        $this->expectException(ValidationException::class);
        $entitlement->validate('sale', [
            'sale_invoice_id' => $sale->id,
            'customer_id' => $this->customer->id,
            'items' => [
                [
                    'product_id' => $product->id,
                    'batch_number' => null,
                    'expiry' => null,
                    'unit_return_quantity' => 13,
                ],
            ],
        ]);
    }

    public function test_purchase_invoice_reversal_and_deletion_blocked_when_stock_already_sold(): void
    {
        Sanctum::actingAs($this->admin);
        $product = $this->makeProduct(['quantity' => 0]);

        $piRes = $this->postJson('/api/purchase-invoices', [
            'supplier_id' => $this->supplier->id,
            'posted_number' => 'PI-AUD-001',
            'posted_date' => now()->toDateString(),
            'invoice_number' => 'SUP-INV-001',
            'invoice_amount' => 400,
            'invoice_type' => 'credit',
            'total_amount' => 400,
            'total_paid' => 0,
            'items' => [
                [
                    'product_id' => $product->id,
                    'batch' => 'BATCH-REV-1',
                    'expiry' => '2028-06-30',
                    'pack_size' => 10,
                    'pack_quantity' => 5,
                    'unit_quantity' => 50,
                    'pack_purchase_price' => 80,
                    'unit_purchase_price' => 8,
                    'pack_sale_price' => 100,
                    'unit_sale_price' => 10,
                    'avg_price' => 8,
                    'margin' => 20,
                    'quantity' => 50,
                    'sub_total' => 400,
                ],
            ],
        ])->assertStatus(201);

        $piId = $piRes->json('id');
        $this->assertSame(50, (int) $product->fresh()->quantity);

        // Simulate 30 units already sold from this batch
        $product->update(['quantity' => 20]);
        Batch::where('product_id', $product->id)->where('batch_number', 'BATCH-REV-1')->update(['quantity' => 20]);

        // Reversing or deleting the 50-unit purchase invoice must fail with 422
        $this->postJson("/api/purchase-invoices/{$piId}/reverse", [
            'reason' => 'Attempted reversal after sale',
        ])->assertStatus(422);

        $this->deleteJson("/api/purchase-invoices/{$piId}")
            ->assertStatus(422);

        // Stock remains intact at 20
        $this->assertSame(20, (int) $product->fresh()->quantity);
    }

    public function test_sale_invoice_deletion_blocked_when_linked_sale_return_exists(): void
    {
        Sanctum::actingAs($this->admin);
        $product = $this->makeProduct(['quantity' => 100]);

        $sale = SaleInvoice::create([
            'user_id' => $this->admin->id,
            'customer_id' => $this->customer->id,
            'posted_number' => 'SI-DEL-GUARD',
            'date' => now()->toDateString(),
            'invoice_type' => 'debit',
            'gross_amount' => 100,
            'total' => 100,
            'total_receive' => 100,
        ]);

        SaleInvoiceItem::create([
            'sale_invoice_id' => $sale->id,
            'product_id' => $product->id,
            'pack_size' => 10,
            'quantity' => 10,
            'price' => 10,
            'sub_total' => 100,
        ]);

        $sr = SaleReturn::create([
            'user_id' => $this->admin->id,
            'customer_id' => $this->customer->id,
            'sale_invoice_id' => $sale->id,
            'posted_number' => 'SLRET-GUARD-1',
            'date' => now()->toDateString(),
            'gross_total' => 20,
            'total' => 20,
        ]);

        SaleReturnItem::create([
            'sale_return_id' => $sr->id,
            'product_id' => $product->id,
            'unit_return_quantity' => 2,
            'unit_sale_price' => 10,
            'sub_total' => 20,
        ]);

        $this->deleteJson("/api/sale-invoices/{$sale->id}")
            ->assertStatus(422);
    }

    public function test_blind_stocktake_hides_variance_value_and_linked_adjustment_cannot_be_deleted(): void
    {
        Sanctum::actingAs($this->admin);
        $product = $this->makeProduct(['quantity' => 50, 'avg_price' => 8]);

        $sessionRes = $this->postJson('/api/stocktake-sessions', [
            'session_type' => 'full',
            'is_blind' => true,
            'notes' => 'Blind audit count',
        ])->assertStatus(201);

        $sessionId = $sessionRes->json('id');
        $this->patchJson("/api/stocktake-sessions/{$sessionId}/start")->assertOk();

        $itemsRes = $this->getJson("/api/stocktake-sessions/{$sessionId}/items")->assertOk();
        $firstItem = $itemsRes->json('data.0');
        $this->assertNull($firstItem['system_qty']);
        $this->assertNull($firstItem['variance_qty']);
        $this->assertNull($firstItem['variance_value']);
        $this->assertNull($firstItem['unit_purchase_price']);

        // Counter without stocktake.finalize permission does not see variance_value on count response
        $counterPermView = Permission::firstOrCreate(['name' => 'stocktake.view', 'guard_name' => 'sanctum']);
        $counterPermUpdate = Permission::firstOrCreate(['name' => 'stocktake.update', 'guard_name' => 'sanctum']);
        $counterUser = $this->makeUser();
        $counterUser->givePermissionTo([$counterPermView, $counterPermUpdate]);
        Sanctum::actingAs($counterUser);

        $countRes = $this->patchJson("/api/stocktake-items/{$firstItem['id']}", [
            'counted_qty' => 45,
        ])->assertOk();

        $this->assertNull($countRes->json('system_qty'));
        $this->assertNull($countRes->json('variance_value'));

        // Admin finalizes session and verifies linked stock adjustment cannot be deleted directly
        Sanctum::actingAs($this->admin);
        $this->patchJson("/api/stocktake-sessions/{$sessionId}/submit-review")->assertOk();
        $this->postJson("/api/stocktake-sessions/{$sessionId}/finalize")->assertOk();

        $session = StocktakeSession::findOrFail($sessionId);
        $this->assertNotNull($session->stock_adjustment_id);

        $this->deleteJson("/api/stock-adjustments/{$session->stock_adjustment_id}")
            ->assertStatus(422);
    }

    public function test_accounting_service_payables_excludes_reversed_purchase_invoices(): void
    {
        $activeInvoice = PurchaseInvoice::create([
            'user_id' => $this->admin->id,
            'supplier_id' => $this->supplier->id,
            'posted_number' => 'PI-ACT-1',
            'posted_date' => now()->toDateString(),
            'invoice_number' => 'SUP-ACT-1',
            'invoice_amount' => 1000,
            'invoice_type' => 'credit',
            'status' => 'posted',
            'total_amount' => 1000,
            'tax_amount' => 100,
            'total_paid' => 0,
        ]);

        SupplierLedger::create([
            'supplier_id' => $this->supplier->id,
            'purchase_invoice_id' => $activeInvoice->id,
            'entry_type' => 'invoice',
            'entry_date' => now()->toDateString(),
            'posted_number' => 'PI-ACT-1',
            'invoice_total' => 1000,
            'total_paid' => 0,
            'credit_remaining' => 1000,
            'balance_remaining' => 1000,
        ]);

        $reversedInvoice = PurchaseInvoice::create([
            'user_id' => $this->admin->id,
            'supplier_id' => $this->supplier->id,
            'posted_number' => 'PI-REV-2',
            'posted_date' => now()->toDateString(),
            'invoice_number' => 'SUP-REV-2',
            'invoice_amount' => 2500,
            'invoice_type' => 'credit',
            'status' => 'reversed',
            'reversed_at' => now(),
            'total_amount' => 2500,
            'tax_amount' => 250,
            'total_paid' => 0,
        ]);

        SupplierLedger::create([
            'supplier_id' => $this->supplier->id,
            'purchase_invoice_id' => $reversedInvoice->id,
            'entry_type' => 'invoice',
            'entry_date' => now()->toDateString(),
            'posted_number' => 'PI-REV-2',
            'invoice_total' => 2500,
            'total_paid' => 0,
            'credit_remaining' => 2500,
            'balance_remaining' => 2500,
        ]);

        $tb = app(AccountingService::class)->getTrialBalance(
            now()->startOfMonth()->toDateString(),
            now()->endOfMonth()->toDateString()
        );

        $apLine = collect($tb['rows'])
            ->firstWhere('system_key', 'accounts_payable');

        $this->assertNotNull($apLine);
        $this->assertEquals(1000.0, (float) $apLine['credit']);
    }
}
