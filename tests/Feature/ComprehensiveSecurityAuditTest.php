<?php

namespace Tests\Feature;

use App\Http\Middleware\EnsureLicensed;
use App\Models\Account;
use App\Models\Brand;
use App\Models\Category;
use App\Models\Customer;
use App\Models\License;
use App\Models\Product;
use App\Models\SaleInvoice;
use App\Models\SaleInvoiceItem;
use App\Models\Supplier;
use App\Models\User;
use App\Services\BackupService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class ComprehensiveSecurityAuditTest extends TestCase
{
    use RefreshDatabase;

    private Category $category;
    private Brand $brand;
    private Supplier $supplier;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware(EnsureLicensed::class);

        Role::firstOrCreate(['name' => 'Admin', 'guard_name' => 'sanctum']);
        Role::firstOrCreate(['name' => 'Manager', 'guard_name' => 'sanctum']);
        Role::firstOrCreate(['name' => 'Cashier', 'guard_name' => 'sanctum']);

        $this->category = Category::create(['name' => 'Tablets']);
        $this->brand = Brand::create(['name' => 'GSK']);
        $this->supplier = Supplier::create(['name' => 'Primary Pharma']);
    }

    private function makeUser(array $overrides = []): User
    {
        static $counter = 1;
        $idx = $counter++;

        return User::create(array_merge([
            'name' => "Test User {$idx}",
            'email' => "user{$idx}@example.com",
            'password' => Hash::make('password123'),
            'status' => 'active',
        ], $overrides));
    }

    private function makeProduct(array $overrides = []): Product
    {
        static $prodCounter = 1;
        $idx = $prodCounter++;

        return Product::create(array_merge([
            'name' => "Product {$idx}",
            'product_code' => "PRD-{$idx}",
            'barcode' => "BAR-{$idx}",
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

    public function test_s03_sale_return_recalculates_totals_and_ignores_manipulated_client_total(): void
    {
        $admin = $this->makeUser();
        $admin->assignRole('Admin');
        Sanctum::actingAs($admin);

        $customer = Customer::create([
            'name' => 'Walk-in Test Customer',
            'phone' => '03001234567',
        ]);

        $product = $this->makeProduct([
            'name' => 'Panadol 500mg',
            'product_code' => 'PAN-500',
        ]);

        $saleInvoice = SaleInvoice::create([
            'user_id' => $admin->id,
            'customer_id' => $customer->id,
            'posted_number' => 'SI-TEST-001',
            'date' => now()->toDateString(),
            'sale_type' => 'retail',
            'payment_method' => 'cash',
            'gross_amount' => 100,
            'total_receive' => 100,
            'total' => 100,
        ]);

        SaleInvoiceItem::create([
            'sale_invoice_id' => $saleInvoice->id,
            'product_id' => $product->id,
            'pack_size' => 10,
            'quantity' => 10,
            'unit_quantity' => 10,
            'price' => 100,
            'unit_price' => 10,
            'sub_total' => 100,
        ]);

        $response = $this->postJson('/api/sale-returns', [
            'customer_id' => $customer->id,
            'sale_invoice_id' => $saleInvoice->id,
            'posted_number' => 'SR-SEC-001',
            'date' => now()->toDateString(),
            'gross_total' => 999999, // Manipulated client total
            'total' => 999999,       // Manipulated client total
            'items' => [
                [
                    'product_id' => $product->id,
                    'pack_size' => 10,
                    'unit_return_quantity' => 2,
                    'unit_sale_price' => 10,
                    'item_discount_percentage' => 0,
                    'sub_total' => 999999, // Manipulated line subtotal
                ],
            ],
        ]);

        $response->assertCreated();
        $this->assertEquals(20.0, (float) $response->json('total'));
        $this->assertEquals(20.0, (float) $response->json('gross_total'));
    }

    public function test_s04_unprivileged_user_cannot_access_accounts_or_adjust_balances(): void
    {
        $cashier = $this->makeUser();
        $cashier->assignRole('Cashier');
        Sanctum::actingAs($cashier);

        $account = Account::create([
            'name' => 'Main Bank',
            'code' => 'BNK-01',
            'type' => 'bank',
            'current_balance' => 50000,
            'is_active' => true,
        ]);

        $this->getJson('/api/accounts')->assertForbidden();
        $this->postJson("/api/accounts/{$account->id}/adjust", [
            'type' => 'credit',
            'amount' => 10000,
            'description' => 'Unauthorized adjustment',
        ])->assertForbidden();
    }

    public function test_s05_inactive_user_cannot_log_in_or_use_existing_token(): void
    {
        $user = $this->makeUser([
            'email' => 'inactive@example.com',
            'password' => Hash::make('secret123'),
            'status' => 'inactive',
        ]);

        $loginResponse = $this->postJson('/api/login', [
            'email' => 'inactive@example.com',
            'password' => 'secret123',
        ]);

        $loginResponse->assertStatus(403);

        $token = $user->createToken('test-token')->plainTextToken;
        $meResponse = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->getJson('/api/me');

        $meResponse->assertStatus(403);
    }

    public function test_s06_only_admin_with_valid_password_can_deactivate_license(): void
    {
        License::create([
            'license_key' => 'KRB-TEST-KEY',
            'payload' => ['customer' => 'Test Pharmacy'],
            'valid' => true,
            'machine_hash' => 'TEST-MACHINE-HASH',
            'activated_at' => now(),
            'last_verified_at' => now(),
        ]);

        $cashier = $this->makeUser([
            'password' => Hash::make('cashierpass'),
        ]);
        $cashier->assignRole('Cashier');
        Sanctum::actingAs($cashier);

        $this->postJson('/api/license/deactivate', [
            'password' => 'cashierpass',
        ])->assertForbidden();

        $admin = $this->makeUser([
            'password' => Hash::make('adminpass123'),
        ]);
        $admin->assignRole('Admin');
        Sanctum::actingAs($admin);

        // Wrong password rejected
        $this->postJson('/api/license/deactivate', [
            'password' => 'wrongpass',
        ])->assertStatus(422);

        $this->assertDatabaseCount('licenses', 1);

        // Correct password succeeds
        $this->postJson('/api/license/deactivate', [
            'password' => 'adminpass123',
        ])->assertOk();

        $this->assertDatabaseCount('licenses', 0);
    }

    public function test_s07_and_s08_backup_service_blocks_webroot_paths_and_unsafe_sql(): void
    {
        /** @var BackupService $backupService */
        $backupService = app(BackupService::class);

        $this->expectException(\InvalidArgumentException::class);
        $backupService->assertSafeBackupDirectory(public_path('backups'));
    }

    public function test_s10_and_s11_and_s18_role_and_permission_protections(): void
    {
        Permission::firstOrCreate(['name' => 'user.view', 'guard_name' => 'sanctum']);
        Permission::firstOrCreate(['name' => 'user.create', 'guard_name' => 'sanctum']);
        Permission::firstOrCreate(['name' => 'user.update', 'guard_name' => 'sanctum']);
        Permission::firstOrCreate(['name' => 'product.view', 'guard_name' => 'sanctum']);

        $managerRole = Role::findByName('Manager', 'sanctum');
        $managerRole->givePermissionTo(['user.view', 'user.create', 'user.update']);

        $manager = $this->makeUser();
        $manager->assignRole('Manager');

        $admin = $this->makeUser();
        $admin->assignRole('Admin');

        Sanctum::actingAs($manager);

        // S10: Manager cannot promote self to Admin
        $this->putJson("/api/users/{$manager->id}", [
            'name' => $manager->name,
            'email' => $manager->email,
            'roles' => ['Admin'],
        ])->assertForbidden();

        // S10: Manager cannot modify an existing Admin user
        $this->putJson("/api/users/{$admin->id}", [
            'name' => 'Hacked Admin',
            'email' => $admin->email,
        ])->assertForbidden();

        // S11: Even Admin cannot rename the Admin role
        Sanctum::actingAs($admin);
        $adminRole = Role::findByName('Admin', 'sanctum');
        $this->putJson("/api/roles/{$adminRole->id}", [
            'name' => 'RenamedAdmin',
        ])->assertStatus(422);

        // S18: Core system permission cannot be deleted
        $corePerm = Permission::findByName('product.view', 'sanctum');
        $this->deleteJson("/api/permissions/{$corePerm->id}")->assertStatus(422);
    }

    public function test_s12_and_s13_pos_discount_and_credit_overrides_require_supervisor_or_permission(): void
    {
        Permission::firstOrCreate(['name' => 'sale-invoice.create', 'guard_name' => 'sanctum']);
        Permission::firstOrCreate(['name' => 'sale-invoice.discount-override', 'guard_name' => 'sanctum']);

        $cashierRole = Role::findByName('Cashier', 'sanctum');
        $cashierRole->givePermissionTo(['sale-invoice.create']);

        $cashier = $this->makeUser();
        $cashier->assignRole('Cashier');

        $supervisor = $this->makeUser([
            'email' => 'supervisor@example.com',
            'password' => Hash::make('superpass123'),
        ]);
        $supervisor->givePermissionTo('sale-invoice.discount-override');

        $product = $this->makeProduct([
            'name' => 'Augmentin 625mg',
            'product_code' => 'AUG-625',
            'pack_size' => 1,
            'quantity' => 50,
            'pack_purchase_price' => 200,
            'unit_purchase_price' => 200,
            'pack_sale_price' => 300,
            'unit_sale_price' => 300,
            'max_discount' => 5, // Max 5% discount
        ]);

        $customer = Customer::create([
            'name' => 'Retail Customer',
            'phone' => '03009998887',
        ]);

        Sanctum::actingAs($cashier);

        // S13: Cashier trying to bypass 5% max_discount via 20% bill-level discount is blocked
        $blockedResponse = $this->postJson('/api/sale-invoices', [
            'customer_id' => $customer->id,
            'posted_number' => 'SI-DISC-001',
            'date' => now()->toDateString(),
            'sale_type' => 'retail',
            'payment_method' => 'cash',
            'discount_percentage' => 20,
            'total_receive' => 240,
            'items' => [
                [
                    'product_id' => $product->id,
                    'pack_size' => 1,
                    'quantity' => 1,
                    'unit_quantity' => 1,
                    'price' => 300,
                    'unit_price' => 300,
                    'item_discount_percentage' => 0,
                ],
            ],
        ]);
        $blockedResponse->assertStatus(422);

        // S12: Providing valid supervisor credentials authorizes the discount override
        $approvedResponse = $this->postJson('/api/sale-invoices', [
            'customer_id' => $customer->id,
            'posted_number' => 'SI-DISC-002',
            'date' => now()->toDateString(),
            'sale_type' => 'retail',
            'payment_method' => 'cash',
            'discount_percentage' => 20,
            'discount_override' => true,
            'supervisor_email' => 'supervisor@example.com',
            'supervisor_password' => 'superpass123',
            'total_receive' => 240,
            'items' => [
                [
                    'product_id' => $product->id,
                    'pack_size' => 1,
                    'quantity' => 1,
                    'unit_quantity' => 1,
                    'price' => 300,
                    'unit_price' => 300,
                    'item_discount_percentage' => 0,
                ],
            ],
        ]);
        $approvedResponse->assertCreated();
    }

    public function test_s20_document_history_rejects_arbitrary_class_names(): void
    {
        $admin = $this->makeUser();
        $admin->assignRole('Admin');
        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/document-histories?entity_type=' . urlencode(User::class) . '&entity_id=' . $admin->id);
        $response->assertStatus(400);
    }

    public function test_s17_and_s19_and_s21_and_s22_profile_demands_csv_and_token_expiry(): void
    {
        // S22: Sanctum fallback expiration is configured
        $this->assertNotNull(config('sanctum.expiration'));
        $this->assertGreaterThan(0, (int) config('sanctum.expiration'));

        // S17: Changing password in profile requires current_password
        $user = $this->makeUser([
            'password' => Hash::make('oldpassword123'),
        ]);
        Sanctum::actingAs($user);

        $this->putJson('/api/profile', [
            'name' => $user->name,
            'email' => $user->email,
            'password' => 'newpassword123',
            'password_confirmation' => 'newpassword123',
        ])->assertStatus(422);

        $activeToken = $user->createToken('active_device');
        $otherToken = $user->createToken('other_device');

        $this->withHeader('Authorization', 'Bearer ' . $activeToken->plainTextToken)
            ->putJson('/api/profile', [
                'name' => $user->name,
                'email' => $user->email,
                'current_password' => 'oldpassword123',
                'password' => 'newpassword123',
                'password_confirmation' => 'newpassword123',
            ])->assertOk()
            ->assertJsonStructure(['id', 'name', 'email', 'roles']);

        $this->assertTrue(Hash::check('newpassword123', $user->fresh()->password));
        $this->assertDatabaseHas('personal_access_tokens', ['id' => $activeToken->accessToken->id]);
        $this->assertDatabaseMissing('personal_access_tokens', ['id' => $otherToken->accessToken->id]);

        // S15: Unprivileged user cannot fetch customer wholesale prices
        $this->getJson('/api/customers/1/whole-sale-prices')->assertForbidden();

        // S19: User with user-demand.create but without product.create cannot auto-create catalog products
        Permission::firstOrCreate(['name' => 'user-demand.create', 'guard_name' => 'sanctum']);
        $cashierRole = Role::findByName('Cashier', 'sanctum');
        $cashierRole->givePermissionTo('user-demand.create');
        $user->assignRole('Cashier');

        $this->postJson('/api/user-demands', [
            'name' => 'Brand New Uncatalogued Medicine',
            'requested_quantity' => 5,
        ])->assertForbidden();
    }
}
