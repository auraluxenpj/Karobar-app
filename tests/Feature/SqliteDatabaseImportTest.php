<?php

namespace Tests\Feature;

use App\Models\Brand;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Product;
use App\Models\PurchaseInvoice;
use App\Models\SaleInvoice;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use PDO;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class SqliteDatabaseImportTest extends TestCase
{
    use RefreshDatabase;

    protected User $adminUser;
    protected array $tempFiles = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware(\App\Http\Middleware\EnsureLicensed::class);

        $role = Role::firstOrCreate(['name' => 'Admin', 'guard_name' => 'sanctum']);
        $perms = ['settings.view', 'settings.update', 'backup.view', 'backup.create', 'backup.restore'];
        foreach ($perms as $p) {
            $perm = Permission::firstOrCreate(['name' => $p, 'guard_name' => 'sanctum']);
            $role->givePermissionTo($perm);
        }

        $this->adminUser = User::forceCreate([
            'name' => 'Primary Admin',
            'email' => 'admin@karobar.test',
            'password' => bcrypt('secret123'),
        ]);
        $this->adminUser->assignRole($role);
    }

    protected function tearDown(): void
    {
        foreach ($this->tempFiles as $file) {
            if (is_file($file)) {
                @unlink($file);
            }
        }
        parent::tearDown();
    }

    /**
     * Helper to build a temporary legacy/external SQLite database file.
     */
    protected function createLegacySqliteDatabase(): string
    {
        $path = sys_get_temp_dir() . '/legacy_karobar_' . uniqid() . '.sqlite';
        $this->tempFiles[] = $path;

        $pdo = new PDO('sqlite:' . $path);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

        // 1. Protected tables that MUST be skipped (users & licenses)
        $pdo->exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT, password TEXT)');
        $pdo->exec("INSERT INTO users (id, name, email, password) VALUES (99, 'Attacker Or Old User', 'olduser@legacy.com', 'hacked_hash')");

        $pdo->exec('CREATE TABLE licenses (id INTEGER PRIMARY KEY, license_key TEXT, status TEXT)');
        $pdo->exec("INSERT INTO licenses (id, license_key, status) VALUES (1, 'FAKE-OLD-LICENSE-KEY', 'revoked')");

        // 2. Aliased table `medicines` (-> `products`) missing required v2 columns (`barcode`, `category_id`, `brand_id`, `pack_size`)
        //    and having aliased columns (`sku`, `title`, `mrp`, `cost_price`, `qty`, `category_name`, `brand_name`) + extra column (`legacy_rack_note`)
        $pdo->exec('CREATE TABLE medicines (
            id INTEGER PRIMARY KEY,
            sku TEXT,
            title TEXT,
            category_name TEXT,
            brand_name TEXT,
            cost_price REAL,
            mrp REAL,
            qty INTEGER,
            legacy_rack_note TEXT
        )');
        $pdo->exec("INSERT INTO medicines (id, sku, title, category_name, brand_name, cost_price, mrp, qty, legacy_rack_note)
            VALUES (10, 'MED-001', 'Augmentin 625mg Tabs', 'Antibiotics', 'GSK Pharma', 420.00, 500.00, 35, 'Rack-A1')");
        $pdo->exec("INSERT INTO medicines (id, sku, title, category_name, brand_name, cost_price, mrp, qty, legacy_rack_note)
            VALUES (20, NULL, 'Panadol Extra', 'Analgesics', 'Haleon', 80.00, 100.00, 120, 'Rack-B2')");

        // 3. Aliased table `vendors` (-> `suppliers`) with existing conflict test
        $pdo->exec('CREATE TABLE vendors (id INTEGER PRIMARY KEY, vendor_name TEXT, mobile TEXT, balance REAL)');
        $pdo->exec("INSERT INTO vendors (id, vendor_name, mobile, balance) VALUES (50, 'Premier Distributors', '03001112233', 15000)");

        // 4. `purchase_invoices` & `purchase_invoice_items` missing several NOT NULL v2 columns
        $pdo->exec('CREATE TABLE purchase_invoices (id INTEGER PRIMARY KEY, supplier_id INTEGER, bill_no TEXT, date TEXT, net_amount REAL)');
        $pdo->exec("INSERT INTO purchase_invoices (id, supplier_id, bill_no, date, net_amount) VALUES (500, 50, 'PI-LEG-900', '2026-01-15', 4200.00)");

        $pdo->exec('CREATE TABLE purchase_invoice_items (id INTEGER PRIMARY KEY, purchase_invoice_id INTEGER, product_id INTEGER, qty INTEGER, cost_price REAL, sale_price REAL)');
        $pdo->exec('INSERT INTO purchase_invoice_items (id, purchase_invoice_id, product_id, qty, cost_price, sale_price) VALUES (600, 500, 10, 10, 420.00, 500.00)');

        // 5. `sale_invoices` & `sale_invoice_items` referencing old `user_id = 99` (which is skipped) and `customer_name`
        $pdo->exec('CREATE TABLE sale_invoices (id INTEGER PRIMARY KEY, user_id INTEGER, customer_name TEXT, invoice_no TEXT, date TEXT, net_total REAL)');
        $pdo->exec("INSERT INTO sale_invoices (id, user_id, customer_name, invoice_no, date, net_total) VALUES (700, 99, 'Zain Clinic', 'SI-LEG-101', '2026-01-20', 1000.00)");

        $pdo->exec('CREATE TABLE sale_invoice_items (id INTEGER PRIMARY KEY, sale_invoice_id INTEGER, product_id INTEGER, price REAL, qty INTEGER, line_total REAL)');
        $pdo->exec('INSERT INTO sale_invoice_items (id, sale_invoice_id, product_id, price, qty, line_total) VALUES (800, 700, 10, 500.00, 2, 1000.00)');

        // 6. Custom unknown table `custom_legacy_notes` that can be manually mapped to `categories`
        $pdo->exec('CREATE TABLE custom_legacy_groups (id INTEGER PRIMARY KEY, group_title TEXT)');
        $pdo->exec("INSERT INTO custom_legacy_groups (id, group_title) VALUES (1, 'Surgical Supplies')");

        $pdo = null;

        return $path;
    }

    /**
     * Unlock Software Admin access using the master password ("Malik9196.") and return headers.
     */
    protected function softwareAdminHeaders(?User $user = null): array
    {
        $targetUser = $user ?? $this->adminUser;
        $unlockRes = $this->actingAs($targetUser)
            ->postJson('/api/settings/sqlite-import/unlock', [
                'password' => 'Malik9196.',
            ]);
        $unlockRes->assertStatus(200);

        return [
            'X-Software-Admin-Token' => (string) $unlockRes->json('unlock_token'),
        ];
    }

    public function test_software_admin_lock_blocks_non_admins_and_requires_special_password_for_application_admins(): void
    {
        // 1. Non-admin user (even with settings.update and backup.restore permissions) is blocked with 403
        $managerRole = Role::firstOrCreate(['name' => 'Manager', 'guard_name' => 'sanctum']);
        $managerRole->givePermissionTo(['settings.view', 'settings.update', 'backup.restore']);

        $managerUser = User::forceCreate([
            'name' => 'Store Manager',
            'email' => 'manager@karobar.test',
            'password' => bcrypt('manager123'),
        ]);
        $managerUser->assignRole($managerRole);

        $this->actingAs($managerUser)
            ->postJson('/api/settings/sqlite-import/unlock', [
                'password' => 'Malik9196.',
            ])
            ->assertStatus(403);

        $sqlitePath = $this->createLegacySqliteDatabase();

        $this->actingAs($managerUser)
            ->postJson('/api/settings/sqlite-import/upload', [
                'local_file_path' => $sqlitePath,
            ])
            ->assertStatus(403);

        // 2. Application Admin (with Admin role) is blocked with 403 (software_admin_locked = true) before unlocking
        $this->actingAs($this->adminUser)
            ->postJson('/api/settings/sqlite-import/upload', [
                'local_file_path' => $sqlitePath,
            ])
            ->assertStatus(403)
            ->assertJsonPath('software_admin_locked', true);

        // 3. Application Admin cannot unlock with their own user password or wrong password
        $this->actingAs($this->adminUser)
            ->postJson('/api/settings/sqlite-import/unlock', [
                'password' => 'secret123',
            ])
            ->assertStatus(422);

        $this->actingAs($this->adminUser)
            ->postJson('/api/settings/sqlite-import/unlock', [
                'password' => 'Malik9196', // missing trailing dot
            ])
            ->assertStatus(422);

        // 4. Application Admin unlocks ONLY with exact Software Admin password "Malik9196."
        $unlockRes = $this->actingAs($this->adminUser)
            ->postJson('/api/settings/sqlite-import/unlock', [
                'password' => 'Malik9196.',
            ]);
        $unlockRes->assertStatus(200)
            ->assertJsonPath('ok', true);

        $token = $unlockRes->json('unlock_token');
        $this->assertNotEmpty($token);

        // 5. Once unlocked with X-Software-Admin-Token, upload succeeds
        $this->actingAs($this->adminUser)
            ->withHeaders(['X-Software-Admin-Token' => $token])
            ->postJson('/api/settings/sqlite-import/upload', [
                'local_file_path' => $sqlitePath,
            ])
            ->assertStatus(200);
    }

    public function test_upload_and_inspect_identifies_protected_tables_and_synthesizes_mappings(): void
    {
        $sqlitePath = $this->createLegacySqliteDatabase();
        $uploadedFile = new UploadedFile(
            $sqlitePath,
            'legacy_karobar.sqlite',
            'application/x-sqlite3',
            null,
            true
        );

        $headers = $this->softwareAdminHeaders();

        $response = $this->actingAs($this->adminUser)
            ->withHeaders($headers)
            ->postJson('/api/settings/sqlite-import/upload', [
                'database_file' => $uploadedFile,
            ]);

        $response->assertStatus(200)
            ->assertJsonStructure([
                'session_token',
                'file_name',
                'summary' => [
                    'total_source_tables',
                    'protected_skipped_count',
                    'matched_tables_count',
                    'total_rows_to_import',
                ],
                'protected_tables',
                'importable_tables',
                'available_target_tables',
                'user_remapping',
            ]);

        $data = $response->json();

        // Verify `users` and `licenses` are strictly in protected_tables and NOT in importable_tables
        $protectedNames = collect($data['protected_tables'])->pluck('source_table')->all();
        $this->assertContains('users', $protectedNames);
        $this->assertContains('licenses', $protectedNames);

        $importableSourceNames = collect($data['importable_tables'])->pluck('source_table')->all();
        $this->assertNotContains('users', $importableSourceNames);
        $this->assertNotContains('licenses', $importableSourceNames);

        // Verify `medicines` was intelligently matched to `products` via alias
        $medicinesTable = collect($data['importable_tables'])->firstWhere('source_table', 'medicines');
        $this->assertNotNull($medicinesTable);
        $this->assertEquals('products', $medicinesTable['target_table']);
        $this->assertEquals('alias', $medicinesTable['match_type']);
        $this->assertCount(2, $medicinesTable['sample_rows']);

        // Verify missing required columns (`barcode`, `pack_size`) were synthesized in sample preview
        $firstSample = $medicinesTable['sample_rows'][0];
        $this->assertEquals('MED-001', $firstSample['product_code']);
        $this->assertEquals('Augmentin 625mg Tabs', $firstSample['name']);
        $this->assertNotEmpty($firstSample['barcode']);
        $this->assertEquals(1, $firstSample['pack_size']);
    }

    public function test_execute_import_skips_users_and_licenses_and_imports_legacy_schema_with_missing_columns(): void
    {
        // Seed an active license row and pre-existing supplier to test ID translation & protection
        DB::table('licenses')->insert([
            'license_key' => 'ACTIVE-PROD-LICENSE-999',
            'payload' => json_encode(['tier' => 'enterprise']),
            'valid' => true,
            'machine_hash' => 'MACHINE-ABC',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Pre-existing supplier with ID 1, whereas legacy DB has 'Premier Distributors' with ID 50
        $existingSupplier = Supplier::create([
            'name' => 'Premier Distributors',
            'phone' => '03009998877',
        ]);

        $sqlitePath = $this->createLegacySqliteDatabase();
        $headers = $this->softwareAdminHeaders();

        // 1. Inspect via local_file_path
        $inspectRes = $this->actingAs($this->adminUser)
            ->withHeaders($headers)
            ->postJson('/api/settings/sqlite-import/upload', [
                'local_file_path' => $sqlitePath,
            ]);
        $inspectRes->assertStatus(200);
        $sessionToken = $inspectRes->json('session_token');

        // 2. Also test custom manual table mapping for `custom_legacy_groups` -> `categories`
        $previewRes = $this->actingAs($this->adminUser)
            ->withHeaders($headers)
            ->postJson('/api/settings/sqlite-import/preview-table', [
                'session_token' => $sessionToken,
                'source_table' => 'custom_legacy_groups',
                'target_table' => 'categories',
                'custom_columns' => [
                    'name' => 'group_title',
                ],
            ]);
        $previewRes->assertStatus(200);
        $this->assertEquals('Surgical Supplies', $previewRes->json('sample_rows.0.name'));

        // 3. Commit the import
        $commitRes = $this->actingAs($this->adminUser)
            ->withHeaders($headers)
            ->postJson('/api/settings/sqlite-import/commit', [
                'session_token' => $sessionToken,
                'password' => 'secret123',
                'options' => [
                    'mode' => 'merge',
                    'conflict_policy' => 'upsert',
                    'create_backup' => false,
                    'reconcile_batches' => true,
                    'tables' => [
                        'custom_legacy_groups' => [
                            'enabled' => true,
                            'target_table' => 'categories',
                            'columns' => [
                                'name' => 'group_title',
                            ],
                        ],
                    ],
                ],
            ]);

        $commitRes->assertStatus(200);

        // ASSERT 1: `users` and `licenses` were NEVER touched or overwritten
        $this->assertEquals(1, User::count());
        $this->assertDatabaseMissing('users', ['email' => 'olduser@legacy.com']);
        $this->assertDatabaseHas('users', ['email' => 'admin@karobar.test']);

        $this->assertEquals(1, DB::table('licenses')->count());
        $this->assertDatabaseHas('licenses', ['license_key' => 'ACTIVE-PROD-LICENSE-999', 'valid' => 1]);
        $this->assertDatabaseMissing('licenses', ['license_key' => 'FAKE-OLD-LICENSE-KEY']);

        // ASSERT 2: `medicines` were imported into `products` with synthesized missing columns (`barcode`, `product_code`, `category_id`, `brand_id`, `pack_size`)
        $this->assertEquals(2, Product::count());
        $augmentin = Product::where('name', 'Augmentin 625mg Tabs')->first();
        $this->assertNotNull($augmentin);
        $this->assertEquals('MED-001', $augmentin->product_code);
        $this->assertNotEmpty($augmentin->barcode);
        $this->assertEquals(35, $augmentin->quantity);

        // Text `category_name` ('Antibiotics') and `brand_name` ('GSK Pharma') were auto-created & linked
        $antibioticsCategory = Category::where('name', 'Antibiotics')->first();
        $gskBrand = Brand::where('name', 'GSK Pharma')->first();
        $this->assertNotNull($antibioticsCategory);
        $this->assertNotNull($gskBrand);
        $this->assertEquals($antibioticsCategory->id, $augmentin->category_id);
        $this->assertEquals($gskBrand->id, $augmentin->brand_id);

        // Second product had NULL sku, so `product_code` was auto-synthesized
        $panadol = Product::where('name', 'Panadol Extra')->first();
        $this->assertNotNull($panadol);
        $this->assertNotEmpty($panadol->product_code);
        $this->assertNotEmpty($panadol->barcode);

        // Custom mapped table `custom_legacy_groups` was imported into `categories`
        $this->assertDatabaseHas('categories', ['name' => 'Surgical Supplies']);

        // ASSERT 3: Opening batches were automatically synthesized for imported products with stock > 0
        $this->assertDatabaseHas('batches', [
            'product_id' => $augmentin->id,
            'quantity' => 35,
        ]);

        // ASSERT 4: Cross-table FK translation mapped `vendors` ID 50 -> existing `suppliers` ID 1 on `purchase_invoices`
        $purchaseInvoice = PurchaseInvoice::where('invoice_number', 'PI-LEG-900')->first();
        $this->assertNotNull($purchaseInvoice);
        $this->assertEquals($existingSupplier->id, $purchaseInvoice->supplier_id);

        // Purchase invoice item had missing NOT NULL columns (`pack_quantity`, `margin`, `sub_total`, `avg_price`) synthesized
        $this->assertDatabaseHas('purchase_invoice_items', [
            'purchase_invoice_id' => $purchaseInvoice->id,
            'product_id' => $augmentin->id,
            'quantity' => 10,
        ]);

        // ASSERT 5: `sale_invoices` had legacy `user_id = 99` remapped to `$this->adminUser->id` and `customer_name` resolved to a Customer record
        $saleInvoice = SaleInvoice::where('posted_number', 'SI-LEG-101')->first();
        $this->assertNotNull($saleInvoice);
        $this->assertEquals($this->adminUser->id, $saleInvoice->user_id);

        $zainCustomer = Customer::where('name', 'Zain Clinic')->first();
        $this->assertNotNull($zainCustomer);
        $this->assertEquals($zainCustomer->id, $saleInvoice->customer_id);

        $this->assertDatabaseHas('sale_invoice_items', [
            'sale_invoice_id' => $saleInvoice->id,
            'product_id' => $augmentin->id,
            'quantity' => 2,
            'sub_total' => 1000.00,
        ]);
    }

    public function test_replace_mode_clears_operational_tables_while_preserving_users_and_licenses_and_enforces_password(): void
    {
        DB::table('licenses')->insert([
            'license_key' => 'PROTECTED-LICENSE-KEY',
            'payload' => json_encode(['tier' => 'pro']),
            'valid' => true,
            'machine_hash' => 'HASH-001',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Seed an old category that should be replaced when `categories` is imported in replace mode
        Category::create(['name' => 'Temporary Old Category']);

        $sqlitePath = $this->createLegacySqliteDatabase();
        $headers = $this->softwareAdminHeaders();

        $inspectRes = $this->actingAs($this->adminUser)
            ->withHeaders($headers)
            ->postJson('/api/settings/sqlite-import/upload', [
                'local_file_path' => $sqlitePath,
            ]);
        $inspectRes->assertStatus(200);
        $sessionToken = $inspectRes->json('session_token');

        // 1. Wrong password must be rejected with 422
        $badCommit = $this->actingAs($this->adminUser)
            ->withHeaders($headers)
            ->postJson('/api/settings/sqlite-import/commit', [
                'session_token' => $sessionToken,
                'password' => 'wrong-password',
                'options' => [
                    'mode' => 'replace',
                    'create_backup' => false,
                ],
            ]);
        $badCommit->assertStatus(422);

        // 2. Valid password in `replace` mode succeeds
        $goodCommit = $this->actingAs($this->adminUser)
            ->withHeaders($headers)
            ->postJson('/api/settings/sqlite-import/commit', [
                'session_token' => $sessionToken,
                'password' => 'secret123',
                'options' => [
                    'mode' => 'replace',
                    'create_backup' => false,
                    'tables' => [
                        'custom_legacy_groups' => [
                            'enabled' => true,
                            'target_table' => 'categories',
                            'columns' => [
                                'name' => 'group_title',
                            ],
                        ],
                    ],
                ],
            ]);
        $goodCommit->assertStatus(200);

        // Temporary Old Category was wiped in replace mode, and Surgical Supplies + Antibiotics/Analgesics exist
        $this->assertDatabaseMissing('categories', ['name' => 'Temporary Old Category']);
        $this->assertDatabaseHas('categories', ['name' => 'Surgical Supplies']);

        // Users and Licenses remain 100% intact
        $this->assertDatabaseHas('users', ['email' => 'admin@karobar.test']);
        $this->assertDatabaseMissing('users', ['email' => 'olduser@legacy.com']);
        $this->assertDatabaseHas('licenses', ['license_key' => 'PROTECTED-LICENSE-KEY']);
    }
}
