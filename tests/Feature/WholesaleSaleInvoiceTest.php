<?php

namespace Tests\Feature;

use App\Http\Controllers\ReportsController;
use App\Models\Customer;
use App\Models\Product;
use App\Models\SaleInvoice;
use App\Models\Supplier;
use App\Models\User;
use App\Services\AccountingService;
use App\Services\ExpenseService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class WholesaleSaleInvoiceTest extends TestCase
{
    use RefreshDatabase;

    private User $adminUser;
    private Customer $customer;
    private Supplier $supplier;
    private Product $wholesaleProduct;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\App\Http\Middleware\EnsureLicensed::class);

        foreach ([
            'sale-invoice.create',
            'sale-invoice.view',
            'sale-invoice.update',
            'sale-invoice.delete',
            'report.cost-of-sale.view',
            'report.cost-of-sale-detail.view',
            'report.product-comprehensive.view',
        ] as $perm) {
            Permission::firstOrCreate(['name' => $perm, 'guard_name' => 'sanctum']);
        }

        $adminRole = Role::firstOrCreate(['name' => 'Admin', 'guard_name' => 'sanctum']);
        $adminRole->givePermissionTo(Permission::all());

        $this->adminUser = User::forceCreate([
            'name' => 'Wholesale Admin',
            'email' => 'wholesale_admin@example.test',
            'password' => bcrypt('secret'),
        ]);
        $this->adminUser->assignRole($adminRole);

        $this->customer = Customer::create([
            'name' => 'Wholesale Distributor',
            'phone' => '03001112233',
            'address' => 'Main Wholesale Market',
            'credit_limit' => 500000,
            'customer_type' => 'wholesale',
        ]);

        $this->supplier = Supplier::create([
            'name' => 'Manufacturer Supplier',
            'phone' => '03009998877',
            'address' => 'Industrial Area',
        ]);

        $category = DB::table('categories')->insertGetId([
            'name' => 'Antibiotics',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $brand = DB::table('brands')->insertGetId([
            'name' => 'Abbott',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Product with pack_size = 10, unit_purchase_price = 70, avg_price = 80, whole_sale_unit_price = 100
        $this->wholesaleProduct = Product::create([
            'category_id' => $category,
            'brand_id' => $brand,
            'supplier_id' => $this->supplier->id,
            'product_code' => 'WS-100',
            'name' => 'Klaricid 500mg Wholesale Pack',
            'pack_size' => 10,
            'quantity' => 200,
            'pack_purchase_price' => 700,
            'unit_purchase_price' => 70,
            'avg_price' => 80,
            'whole_sale_pack_price' => 1000,
            'whole_sale_unit_price' => 100,
            'whole_sale_margin' => 25,
            'pack_sale_price' => 1100,
            'unit_sale_price' => 110,
            'max_discount' => 20,
            'barcode' => '896400099001',
        ]);
    }

    public function test_wholesale_pack_and_unit_quantities_sync_without_double_counting_including_fractional_packs(): void
    {
        // 1.5 packs with pack_size 10 = 15 billed units @ 120 = 1800; 0.5 pack bonus = 5 bonus units (total cost = 20 * 80 = 1600)
        $response = $this->actingAs($this->adminUser, 'sanctum')
            ->postJson('/api/sale-invoices', [
                'customer_id' => $this->customer->id,
                'posted_number' => 'WS-INV-001',
                'date' => '2026-11-01',
                'sale_type' => 'wholesale',
                'invoice_type' => 'debit',
                'total_receive' => 1800,
                'items' => [
                    [
                        'product_id' => $this->wholesaleProduct->id,
                        'pack_size' => 10,
                        'pack_quantity' => 1.5,
                        'unit_quantity' => 15,
                        'quantity' => 15,
                        'pack_bonus' => 0.5,
                        'unit_bonus' => 5,
                        'bonus' => 5,
                        'pack_price' => 1200,
                        'price' => 120,
                        'item_discount_percentage' => 0,
                        'sub_total' => 1800,
                    ],
                ],
            ]);

        $response->assertCreated();

        $invoice = SaleInvoice::with('items')->findOrFail($response->json('id'));
        $item = $invoice->items->first();

        // Must be 15 billed units + 5 bonus units = 20 total stock units deducted (not double-counted)
        $this->assertSame(15, (int) $item->quantity);
        $this->assertSame(15, (int) $item->unit_quantity);
        $this->assertEquals(1.5, (float) $item->pack_quantity);
        $this->assertSame(5, (int) $item->bonus);
        $this->assertSame(5, (int) $item->unit_bonus);
        $this->assertEquals(0.5, (float) $item->pack_bonus);
        $this->assertEquals(1800.0, (float) $item->sub_total);
        $this->assertEquals(1800.0, (float) $invoice->total);

        // Product stock was 200 -> 200 - (15 + 5) = 180
        $this->assertSame(180, (int) $this->wholesaleProduct->fresh()->quantity);
    }

    public function test_wholesale_bonus_units_increase_cogs_and_reduce_daily_profit_across_reports(): void
    {
        // Sell 10 units @ 120 = 1200 revenue, plus 2 bonus units.
        // avg_price = 80 -> COGS should be (10 + 2) * 80 = 960 (not 10 * 80 = 800).
        // Profit should be 1200 - 960 = 240.
        $response = $this->actingAs($this->adminUser, 'sanctum')
            ->postJson('/api/sale-invoices', [
                'customer_id' => $this->customer->id,
                'posted_number' => 'WS-INV-002',
                'date' => '2026-11-01',
                'sale_type' => 'wholesale',
                'invoice_type' => 'debit',
                'total_receive' => 1200,
                'items' => [
                    [
                        'product_id' => $this->wholesaleProduct->id,
                        'pack_size' => 10,
                        'pack_quantity' => 1,
                        'unit_quantity' => 10,
                        'quantity' => 10,
                        'pack_bonus' => 0.2,
                        'unit_bonus' => 2,
                        'bonus' => 2,
                        'pack_price' => 1200,
                        'price' => 120,
                        'item_discount_percentage' => 0,
                        'sub_total' => 1200,
                    ],
                ],
            ]);

        $response->assertCreated();

        // 1. Check ReportsController::costOfSale (Daily Profit Report)
        $cosResponse = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson('/api/reports/cost-of-sale?from=2026-11-01&to=2026-11-01');
        $cosResponse->assertOk();
        $dayRow = $cosResponse->json('0');
        $this->assertEquals(1200.0, (float) $dayRow['total_sales']);
        $this->assertEquals(960.0, (float) $dayRow['cost_of_sales']);
        $this->assertEquals(240.0, (float) $dayRow['total_sales'] - (float) $dayRow['cost_of_sales']);

        // 2. Check ReportsController::costOfSaleDetail
        $detailResponse = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson('/api/reports/cost-of-sale-detail?from=2026-11-01&to=2026-11-01');
        $detailResponse->assertOk();
        $invDetail = $detailResponse->json('invoices.0');
        $this->assertEquals(960.0, (float) $invDetail['total_cost']);
        $this->assertEquals(240.0, (float) $invDetail['profit']);
        $this->assertSame(2, (int) $invDetail['items'][0]['bonus']);

        // 3. Check ExpenseService::getNetProfitReport
        $netProfit = app(ExpenseService::class)->getNetProfitReport('2026-11-01', '2026-11-01');
        $this->assertEquals(960.0, (float) $netProfit['kpis']['cost_of_goods_sold']);
        $this->assertEquals(240.0, (float) $netProfit['kpis']['gross_profit']);

        // 4. Check AccountingService::getTrialBalance
        $trialBalance = app(AccountingService::class)->getTrialBalance('2026-11-01', '2026-11-01');
        $cogsRow = collect($trialBalance['rows'])->firstWhere('system_key', 'cost_of_goods_sold');
        $this->assertNotNull($cogsRow);
        $this->assertEquals(960.0, (float) $cogsRow['debit']);

        // 5. Check ReportsController::productComprehensive (quantity_out includes bonus)
        $compResponse = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson('/api/reports/product-comprehensive?product_id=' . $this->wholesaleProduct->id . '&from=2026-11-01&to=2026-11-01');
        $compResponse->assertOk();
        $saleMovement = collect($compResponse->json('transactions'))->firstWhere('type', 'sale');
        $this->assertNotNull($saleMovement);
        $this->assertSame(12, (int) $saleMovement['quantity_out']);
    }

    public function test_wholesale_sale_rejects_negative_margin_from_avg_price(): void
    {
        // Case A: Unit price (75) is above unit_purchase_price (70) but below avg_price (80) -> margin < 0 -> MUST REJECT
        $resPriceBelowAvg = $this->actingAs($this->adminUser, 'sanctum')
            ->postJson('/api/sale-invoices', [
                'customer_id' => $this->customer->id,
                'posted_number' => 'WS-INV-NEG-1',
                'date' => '2026-11-01',
                'sale_type' => 'wholesale',
                'invoice_type' => 'debit',
                'total_receive' => 750,
                'items' => [
                    [
                        'product_id' => $this->wholesaleProduct->id,
                        'pack_size' => 10,
                        'pack_quantity' => 1,
                        'unit_quantity' => 10,
                        'quantity' => 10,
                        'pack_price' => 750,
                        'price' => 75,
                        'item_discount_percentage' => 0,
                        'sub_total' => 750,
                    ],
                ],
            ]);

        $resPriceBelowAvg->assertStatus(422);
        $resPriceBelowAvg->assertJsonValidationErrors(['items.0.price']);

        // Case B: Unit price is 90 (above avg_price 80), but 15% discount makes effective price 76.50 (< 80) -> margin < 0 -> MUST REJECT
        $resDiscBelowAvg = $this->actingAs($this->adminUser, 'sanctum')
            ->postJson('/api/sale-invoices', [
                'customer_id' => $this->customer->id,
                'posted_number' => 'WS-INV-NEG-2',
                'date' => '2026-11-01',
                'sale_type' => 'wholesale',
                'invoice_type' => 'debit',
                'total_receive' => 765,
                'items' => [
                    [
                        'product_id' => $this->wholesaleProduct->id,
                        'pack_size' => 10,
                        'pack_quantity' => 1,
                        'unit_quantity' => 10,
                        'quantity' => 10,
                        'pack_price' => 900,
                        'price' => 90,
                        'item_discount_percentage' => 15,
                        'sub_total' => 765,
                    ],
                ],
            ]);

        $resDiscBelowAvg->assertStatus(422);
        $resDiscBelowAvg->assertJsonValidationErrors(['items.0.price']);

        // Case C: Unit price is 90 (10 units = 900 subtotal), but 5 bonus units make total cost (10+5)*80 = 1200 > 900 -> margin < 0 -> MUST REJECT
        $resBonusBelowAvg = $this->actingAs($this->adminUser, 'sanctum')
            ->postJson('/api/sale-invoices', [
                'customer_id' => $this->customer->id,
                'posted_number' => 'WS-INV-NEG-3',
                'date' => '2026-11-01',
                'sale_type' => 'wholesale',
                'invoice_type' => 'debit',
                'total_receive' => 900,
                'items' => [
                    [
                        'product_id' => $this->wholesaleProduct->id,
                        'pack_size' => 10,
                        'pack_quantity' => 1,
                        'unit_quantity' => 10,
                        'quantity' => 10,
                        'pack_bonus' => 0.5,
                        'unit_bonus' => 5,
                        'bonus' => 5,
                        'pack_price' => 900,
                        'price' => 90,
                        'item_discount_percentage' => 0,
                        'sub_total' => 900,
                    ],
                ],
            ]);

        $resBonusBelowAvg->assertStatus(422);
        $resBonusBelowAvg->assertJsonValidationErrors(['items.0.price']);
    }
}
