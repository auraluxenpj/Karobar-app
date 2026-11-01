<?php

namespace Tests\Feature;

use App\Models\Brand;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Product;
use App\Models\Setting;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class RegularCustomerReminderTest extends TestCase
{
    use RefreshDatabase;

    protected User $user;
    protected Product $medicineA;
    protected Product $medicineB;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware([
            \App\Http\Middleware\EnsureLicensed::class,
            \App\Http\Middleware\CheckTokenExpiry::class,
        ]);

        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        $permissions = [
            'customer.view',
            'customer.create',
            'customer.update',
            'customer.delete',
            'customer.export',
            'settings.view',
            'settings.update',
        ];

        foreach ($permissions as $perm) {
            Permission::findOrCreate($perm, 'sanctum');
        }

        $this->user = User::create([
            'name'     => 'Pharmacy Manager',
            'email'    => 'manager@alshifa.pk',
            'password' => bcrypt('password'),
        ]);
        $this->user->givePermissionTo($permissions);

        Setting::create([
            'store_name'                    => 'Al-Shifa Pharmacy',
            'phone_number'                  => '0300-1234567',
            'printer_type'                  => 'a4',
            'whatsapp_enabled'              => true,
            'whatsapp_provider'             => 'local_agent',
            'whatsapp_api_url'              => 'http://127.0.0.1:3001',
            'whatsapp_access_token'         => 'karobar_wa_test_key',
            'whatsapp_default_country_code' => '92',
            'whatsapp_auto_fallback'        => true,
        ]);

        $category = Category::create(['name' => 'Cardiac & Diabetes']);
        $brand = Brand::create(['name' => 'Getz Pharma']);
        $supplier = Supplier::create(['name' => 'Premier Pharma']);

        $this->medicineA = Product::create([
            'product_code'       => 'MED-GLUC-500',
            'barcode'            => '8901234567890',
            'name'               => 'Glucophage 500mg Tabs',
            'category_id'        => $category->id,
            'brand_id'           => $brand->id,
            'supplier_id'        => $supplier->id,
            'pack_size'          => 20,
            'quantity'           => 100, // 5 packs in stock
            'pack_purchase_price'=> 200,
            'unit_purchase_price'=> 10,
            'pack_sale_price'    => 260,
            'unit_sale_price'    => 13,
        ]);

        $this->medicineB = Product::create([
            'product_code'       => 'MED-CONC-5',
            'barcode'            => '8901234567891',
            'name'               => 'Concor 5mg Tabs',
            'category_id'        => $category->id,
            'brand_id'           => $brand->id,
            'supplier_id'        => $supplier->id,
            'pack_size'          => 14,
            'quantity'           => 5, // Low stock (< 1 pack)
            'pack_purchase_price'=> 350,
            'unit_purchase_price'=> 25,
            'pack_sale_price'    => 420,
            'unit_sale_price'    => 30,
        ]);
    }

    public function test_create_and_update_regular_customer_with_medicine_schedule_and_stock_readiness(): void
    {
        Sanctum::actingAs($this->user);

        $dueDate = now()->addDays(1)->toDateString();

        $createRes = $this->postJson('/api/customers', [
            'name'               => 'Haji Abdul Karim',
            'phone'              => '0300-9876543',
            'address'            => 'Model Town Block C',
            'is_regular'         => true,
            'refill_cycle'       => 'monthly',
            'reminder_lead_days' => 2,
            'next_refill_date'   => $dueDate,
            'reminder_language'  => 'urdu',
            'regular_notes'      => 'Deliver before 5 PM',
            'regular_items'      => [
                [
                    'product_id'    => $this->medicineA->id,
                    'pack_quantity' => 2,
                    'unit_quantity' => 0,
                    'dosage_notes'  => '1 Morning + 1 Night',
                ],
            ],
        ]);

        $createRes->assertCreated()
            ->assertJsonPath('is_regular', true)
            ->assertJsonPath('refill_cycle', 'monthly')
            ->assertJsonPath('regular_items_count', 1)
            ->assertJsonPath('stock_ready', true)
            ->assertJsonPath('out_of_stock_count', 0)
            ->assertJsonPath('is_due_for_reminder', true);

        $customerId = $createRes->json('id');

        // Now add medicineB (which requires 1 pack = 14 units, but only 5 units on hand)
        $updateRes = $this->putJson("/api/customers/{$customerId}", [
            'name'               => 'Haji Abdul Karim',
            'phone'              => '0300-9876543',
            'is_regular'         => true,
            'refill_cycle'       => 'weekly',
            'reminder_lead_days' => 2,
            'next_refill_date'   => $dueDate,
            'reminder_language'  => 'urdu',
            'regular_items'      => [
                [
                    'product_id'    => $this->medicineA->id,
                    'pack_quantity' => 1,
                    'unit_quantity' => 0,
                    'dosage_notes'  => '1+0+1',
                ],
                [
                    'product_id'    => $this->medicineB->id,
                    'pack_quantity' => 1,
                    'unit_quantity' => 0,
                    'dosage_notes'  => '1 Morning',
                ],
            ],
        ]);

        $updateRes->assertOk()
            ->assertJsonPath('refill_cycle', 'weekly')
            ->assertJsonPath('regular_items_count', 2)
            ->assertJsonPath('stock_ready', false)
            ->assertJsonPath('out_of_stock_count', 1);
    }

    public function test_bilingual_whatsapp_refill_reminder_preview_and_send_via_local_agent(): void
    {
        Sanctum::actingAs($this->user);

        Http::fake([
            '127.0.0.1:3001/send-text' => Http::response([
                'ok'         => true,
                'sent'       => true,
                'message_id' => 'baileys.refill.001',
            ], 200),
            '127.0.0.1:3001/send-document' => Http::response([
                'ok'         => true,
                'sent'       => true,
                'message_id' => 'baileys.doc.refill.002',
            ], 200),
        ]);

        $customer = Customer::create([
            'name'               => 'Mrs. Tahira Begum',
            'phone'              => '0321-1122334',
            'is_regular'         => true,
            'refill_cycle'       => 'monthly',
            'reminder_lead_days' => 3,
            'next_refill_date'   => now()->addDays(2)->toDateString(),
            'reminder_language'  => 'urdu',
        ]);

        $customer->regularItems()->create([
            'product_id'    => $this->medicineA->id,
            'pack_quantity' => 1,
            'unit_quantity' => 10,
            'dosage_notes'  => 'After meal',
        ]);

        // 1. Preview bilingual templates
        $previewRes = $this->getJson("/api/customers/{$customer->id}/refill-reminder-preview");
        $previewRes->assertOk()
            ->assertJsonPath('stock_ready', true)
            ->assertJsonPath('templates.language', 'urdu');

        $englishText = $previewRes->json('templates.english');
        $urduText = $previewRes->json('templates.urdu');

        $this->assertStringContainsString('Al-Shifa Pharmacy', $englishText);
        $this->assertStringContainsString('Glucophage 500mg Tabs', $englishText);
        $this->assertStringContainsString('Please do not forget to collect them', $englishText);

        $this->assertStringContainsString('محترم *Mrs. Tahira Begum*', $urduText);
        $this->assertStringContainsString('ماہانہ', $urduText);
        $this->assertStringContainsString('Glucophage 500mg Tabs', $urduText);
        $this->assertStringContainsString('تیار ہیں', $urduText);

        // 2. Send reminder via Local WhatsApp Agent
        $sendRes = $this->postJson("/api/customers/{$customer->id}/send-refill-reminder", [
            'language'      => 'urdu',
            'advance_cycle' => false,
        ]);

        $sendRes->assertOk()
            ->assertJsonPath('status', 'sent_via_api')
            ->assertJsonPath('provider', 'local_agent')
            ->assertJsonPath('whatsapp_msg_id', 'baileys.refill.001')
            ->assertJsonPath('normalized_phone', '923211122334');

        $customer->refresh();
        $this->assertNotNull($customer->last_refill_reminded_at);

        // 3. Send reminder via the shared Document Share WhatsApp route (POST /api/share/whatsapp)
        $shareRes = $this->postJson('/api/share/whatsapp', [
            'type'          => 'regular_refill_reminder',
            'id'            => $customer->id,
            'customer_id'   => $customer->id,
            'phone'         => '0321-1122334',
            'language'      => 'urdu',
            'message'       => $urduText,
            'save_phone'    => true,
            'advance_cycle' => true,
        ]);

        $shareRes->assertOk()
            ->assertJsonPath('status', 'sent_via_api')
            ->assertJsonPath('mode', 'cloud_api')
            ->assertJsonPath('provider', 'local_agent')
            ->assertJsonPath('whatsapp_msg_id', 'baileys.doc.refill.002')
            ->assertJsonPath('normalized_phone', '923211122334')
            ->assertJsonPath('customer.id', $customer->id);
    }

    public function test_bulk_refill_reminders_and_advance_refill_cycle(): void
    {
        Sanctum::actingAs($this->user);

        Http::fake([
            '127.0.0.1:3001/send-text' => Http::response([
                'ok'         => true,
                'sent'       => true,
                'message_id' => 'baileys.bulk.001',
            ], 200),
        ]);

        // Customer 1: Stock ready & due tomorrow
        $readyCustomer = Customer::create([
            'name'               => 'Tariq Mehmood',
            'phone'              => '0333-4455667',
            'is_regular'         => true,
            'refill_cycle'       => 'weekly',
            'reminder_lead_days' => 2,
            'next_refill_date'   => now()->addDay()->toDateString(),
            'reminder_language'  => 'english',
        ]);
        $readyCustomer->regularItems()->create([
            'product_id'    => $this->medicineA->id,
            'pack_quantity' => 1,
            'unit_quantity' => 0,
        ]);

        // Customer 2: Out of stock & due tomorrow
        $lowStockCustomer = Customer::create([
            'name'               => 'Kamran Akmal',
            'phone'              => '0345-6677889',
            'is_regular'         => true,
            'refill_cycle'       => 'monthly',
            'reminder_lead_days' => 2,
            'next_refill_date'   => now()->addDay()->toDateString(),
            'reminder_language'  => 'english',
        ]);
        $lowStockCustomer->regularItems()->create([
            'product_id'    => $this->medicineB->id,
            'pack_quantity' => 2, // Needs 28 units, only 5 in stock
            'unit_quantity' => 0,
        ]);

        // Bulk send with only_stock_ready = true
        $bulkRes = $this->postJson('/api/customers/send-bulk-refill-reminders', [
            'only_stock_ready' => true,
        ]);

        $bulkRes->assertOk()
            ->assertJsonPath('sent_count', 1)
            ->assertJsonPath('skipped_count', 1);

        // Advance cycle for Weekly customer (+7 days from due date)
        $expectedNextDate = now()->addDay()->addDays(7)->toDateString();
        $advRes = $this->postJson("/api/customers/{$readyCustomer->id}/advance-refill-cycle");
        $advRes->assertOk()
            ->assertJsonPath('next_refill_date', $expectedNextDate);
    }
}
