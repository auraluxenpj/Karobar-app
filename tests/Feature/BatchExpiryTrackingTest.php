<?php

namespace Tests\Feature;

use App\Models\Batch;
use App\Models\Brand;
use App\Models\Category;
use App\Models\Product;
use App\Models\Setting;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class BatchExpiryTrackingTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private Supplier $supplier;
    private Brand $brand;
    private Category $category;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\App\Http\Middleware\EnsureLicensed::class);

        // Ensure permissions
        Permission::firstOrCreate(['name' => 'product.view', 'guard_name' => 'sanctum']);
        Permission::firstOrCreate(['name' => 'product.update', 'guard_name' => 'sanctum']);
        Permission::firstOrCreate(['name' => 'settings.view', 'guard_name' => 'sanctum']);
        Permission::firstOrCreate(['name' => 'settings.update', 'guard_name' => 'sanctum']);

        $role = Role::firstOrCreate(['name' => 'Admin', 'guard_name' => 'sanctum']);
        $role->givePermissionTo(Permission::all());

        $this->user = User::forceCreate([
            'name' => 'Admin User',
            'email' => 'admin@example.test',
            'password' => bcrypt('secret'),
        ]);
        $this->user->assignRole($role);

        // Default setting: global 90 days
        Setting::create([
            'id' => 1,
            'store_name' => 'Test Pharmacy',
            'expiry_warning_days' => 90,
        ]);

        $this->supplier = Supplier::create([
            'name' => 'Pharma Alpha',
            'phone' => '03001234567',
        ]);

        $this->brand = Brand::create(['name' => 'GSK']);
        $this->category = Category::create(['name' => 'Antibiotics']);
    }

    private function createTestProduct(string $name, string $code, string $barcode, ?int $warningDays = null): Product
    {
        return Product::create([
            'name' => $name,
            'product_code' => $code,
            'barcode' => $barcode,
            'category_id' => $this->category->id,
            'brand_id' => $this->brand->id,
            'supplier_id' => $this->supplier->id,
            'pack_size' => 10,
            'quantity' => 100,
            'unit_purchase_price' => 10,
            'pack_purchase_price' => 100,
            'unit_sale_price' => 15,
            'pack_sale_price' => 150,
            'avg_price' => 10,
            'expiry_warning_days' => $warningDays,
        ]);
    }

    public function test_batch_expiry_status_categorization(): void
    {
        $prod = $this->createTestProduct('Product Standard', 'STD-01', 'BAR-STD-01');

        // Batch 1: Expired (10 days ago)
        Batch::create([
            'product_id' => $prod->id,
            'batch_number' => 'B-EXP',
            'expiry_date' => now()->subDays(10)->toDateString(),
            'quantity' => 20,
        ]);

        // Batch 2: Critical (15 days left)
        Batch::create([
            'product_id' => $prod->id,
            'batch_number' => 'B-CRIT',
            'expiry_date' => now()->addDays(15)->toDateString(),
            'quantity' => 30,
        ]);

        // Batch 3: Warning (60 days left, within global 90d)
        Batch::create([
            'product_id' => $prod->id,
            'batch_number' => 'B-WARN',
            'expiry_date' => now()->addDays(60)->toDateString(),
            'quantity' => 25,
        ]);

        // Batch 4: Safe (200 days left)
        Batch::create([
            'product_id' => $prod->id,
            'batch_number' => 'B-SAFE',
            'expiry_date' => now()->addDays(200)->toDateString(),
            'quantity' => 50,
        ]);

        $res = $this->actingAs($this->user)->getJson('/api/batch-expiry');
        $res->assertOk();

        $data = $res->json();
        $this->assertEquals(4, $data['summary']['total_batches_tracked']);
        $this->assertEquals(1, $data['summary']['total_expired_batches']);
        $this->assertEquals(20, $data['summary']['total_expired_qty']);
        $this->assertEquals(1, $data['summary']['total_critical_batches']);
        $this->assertEquals(30, $data['summary']['total_critical_qty']);
        // Warning count includes expired + critical + warning within 90d
        $this->assertEquals(3, $data['summary']['total_warning_batches']);
    }

    public function test_product_custom_warning_days_overrides_global_default(): void
    {
        // Global is 90 days.
        // Product Custom has 150 days warning window.
        $prodCustom = $this->createTestProduct('Sensitive Vaccine', 'VAC-01', 'BAR-VAC-01', 150);

        // Batch with 120 days remaining:
        // Under global 90d it would be "safe", but under product 150d it is "warning"!
        Batch::create([
            'product_id' => $prodCustom->id,
            'batch_number' => 'B-VAC-120',
            'expiry_date' => now()->addDays(120)->toDateString(),
            'quantity' => 15,
        ]);

        $res = $this->actingAs($this->user)->getJson('/api/batch-expiry?status=warning');
        $res->assertOk();

        $rows = $res->json('rows');
        $this->assertCount(1, $rows);
        $this->assertEquals('B-VAC-120', $rows[0]['batch_number']);
        $this->assertEquals('warning', $rows[0]['status']);
        $this->assertEquals(150, $rows[0]['effective_warning_days']);
        $this->assertTrue($rows[0]['has_custom_warning']);
    }

    public function test_can_update_product_warning_threshold_and_reset_to_default(): void
    {
        $prod = $this->createTestProduct('Generic Capsule', 'GEN-01', 'BAR-GEN-01', null);

        // Set custom warning to 45 days
        $res = $this->actingAs($this->user)->putJson("/api/batch-expiry/product-warning/{$prod->id}", [
            'expiry_warning_days' => 45,
        ]);
        $res->assertOk();
        $this->assertEquals(45, $res->json('expiry_warning_days'));

        $prod->refresh();
        $this->assertEquals(45, $prod->expiry_warning_days);

        // Reset to global default (null)
        $res2 = $this->actingAs($this->user)->putJson("/api/batch-expiry/product-warning/{$prod->id}", [
            'expiry_warning_days' => null,
        ]);
        $res2->assertOk();
        $this->assertNull($res2->json('expiry_warning_days'));
        $this->assertEquals(90, $res2->json('effective_warning_days'));

        $prod->refresh();
        $this->assertNull($prod->expiry_warning_days);
    }

    public function test_can_update_global_warning_days(): void
    {
        $res = $this->actingAs($this->user)->putJson('/api/batch-expiry/global-warning', [
            'expiry_warning_days' => 120,
        ]);
        $res->assertOk();
        $this->assertEquals(120, $res->json('expiry_warning_days'));

        $setting = Setting::first();
        $this->assertEquals(120, $setting->expiry_warning_days);
    }

    public function test_notifications_expiry_alerts_endpoint(): void
    {
        $prod = $this->createTestProduct('Syrup 100ml', 'SYR-01', 'BAR-SYR-01');

        // Expired batch
        Batch::create([
            'product_id' => $prod->id,
            'batch_number' => 'B-ALERT-1',
            'expiry_date' => now()->subDays(5)->toDateString(),
            'quantity' => 10,
        ]);

        // Critical batch (10 days left)
        Batch::create([
            'product_id' => $prod->id,
            'batch_number' => 'B-ALERT-2',
            'expiry_date' => now()->addDays(10)->toDateString(),
            'quantity' => 20,
        ]);

        $res = $this->actingAs($this->user)->getJson('/api/notifications/expiry-alerts');
        $res->assertOk();

        $data = $res->json();
        $this->assertEquals(2, $data['count']);
        $this->assertEquals(1, $data['expired_count']);
        $this->assertEquals(1, $data['critical_count']);
        $this->assertCount(2, $data['rows']);
        $this->assertEquals('B-ALERT-1', $data['rows'][0]['batch_number']); // Expired first
    }

    public function test_can_filter_batches_by_months_remaining_exact_and_within(): void
    {
        $prod = $this->createTestProduct('Month Filter Product', 'MFP-01', 'BAR-MFP-01');

        // Batch 1: ~2 Months remaining (55 days)
        Batch::create([
            'product_id' => $prod->id,
            'batch_number' => 'B-2M',
            'expiry_date' => now()->addDays(55)->toDateString(),
            'quantity' => 15,
        ]);

        // Batch 2: ~6 Months remaining (175 days)
        Batch::create([
            'product_id' => $prod->id,
            'batch_number' => 'B-6M',
            'expiry_date' => now()->addDays(175)->toDateString(),
            'quantity' => 20,
        ]);

        // Batch 3: ~7 Months remaining (205 days)
        Batch::create([
            'product_id' => $prod->id,
            'batch_number' => 'B-7M',
            'expiry_date' => now()->addDays(205)->toDateString(),
            'quantity' => 40,
        ]);

        // Batch 4: ~10 Months remaining (300 days)
        Batch::create([
            'product_id' => $prod->id,
            'batch_number' => 'B-10M',
            'expiry_date' => now()->addDays(300)->toDateString(),
            'quantity' => 50,
        ]);

        // 1. Exact 7 Months Remaining filter
        $resExact7 = $this->actingAs($this->user)->getJson('/api/batch-expiry?months=7&months_mode=exact');
        $resExact7->assertOk();
        $rowsExact7 = $resExact7->json('rows');
        $this->assertCount(1, $rowsExact7);
        $this->assertEquals('B-7M', $rowsExact7[0]['batch_number']);
        $this->assertEquals(7, $rowsExact7[0]['months_remaining']);
        $this->assertEquals('7 Months Left', $rowsExact7[0]['months_remaining_label']);
        $this->assertEquals(1, $resExact7->json('summary.month_buckets.7'));

        // 2. Within <= 6 Months Remaining filter (matches 2M and 6M)
        $resWithin6 = $this->actingAs($this->user)->getJson('/api/batch-expiry?months=6&months_mode=within');
        $resWithin6->assertOk();
        $rowsWithin6 = $resWithin6->json('rows');
        $this->assertCount(2, $rowsWithin6);
        $batchNumbers = array_column($rowsWithin6, 'batch_number');
        $this->assertContains('B-2M', $batchNumbers);
        $this->assertContains('B-6M', $batchNumbers);
    }

    public function test_user_selected_critical_expiry_time_and_daily_flash_limit(): void
    {
        $prod = $this->createTestProduct('Critical Custom Product', 'CCP-01', 'BAR-CCP-01');

        // Batch with 45 days remaining (under default 30d critical it would be 'warning',
        // but when user sets critical threshold to 60 days and warning to 180 days, it becomes 'critical'!)
        Batch::create([
            'product_id' => $prod->id,
            'batch_number' => 'B-45D',
            'expiry_date' => now()->addDays(45)->toDateString(),
            'quantity' => 30,
        ]);

        $updateRes = $this->actingAs($this->user)->putJson('/api/batch-expiry/global-warning', [
            'expiry_warning_days' => 180,
            'expiry_critical_days' => 60,
            'expiry_daily_flash_limit' => 5,
        ]);
        $updateRes->assertOk();
        $this->assertEquals(180, $updateRes->json('expiry_warning_days'));
        $this->assertEquals(60, $updateRes->json('expiry_critical_days'));
        $this->assertEquals(5, $updateRes->json('expiry_daily_flash_limit'));

        $res = $this->actingAs($this->user)->getJson('/api/batch-expiry?status=critical');
        $res->assertOk();
        $rows = $res->json('rows');
        $this->assertCount(1, $rows);
        $this->assertEquals('B-45D', $rows[0]['batch_number']);
        $this->assertEquals('critical', $rows[0]['status']);
        $this->assertEquals(60, $rows[0]['effective_critical_days']);
        $this->assertEquals(180, $rows[0]['effective_warning_days']);
        $this->assertTrue($rows[0]['should_flash_warning']);

        // Also verify /api/notifications/expiry-alerts uses the user-selected 60d critical threshold
        $alertRes = $this->actingAs($this->user)->getJson('/api/notifications/expiry-alerts');
        $alertRes->assertOk();
        $this->assertEquals(1, $alertRes->json('critical_count'));
        $this->assertEquals(60, $alertRes->json('global_critical_days'));
        $this->assertEquals(5, $alertRes->json('daily_flash_limit'));
    }
}

