<?php

namespace Tests\Feature;

use App\Mail\DocumentShareMail;
use App\Models\Account;
use App\Models\Brand;
use App\Models\Category;
use App\Models\Customer;
use App\Models\CustomerLedger;
use App\Models\Payment;
use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\SaleInvoice;
use App\Models\SaleInvoiceItem;
use App\Models\Setting;
use App\Models\Supplier;
use App\Models\SupplierLedger;
use App\Models\User;
use App\Services\DocumentShareService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Permission;
use Tests\TestCase;

class OutboundDocumentSharingTest extends TestCase
{
    use RefreshDatabase;

    private User $authorizedUser;
    private User $unauthorizedUser;
    private Category $category;
    private Brand $brand;
    private Supplier $defaultSupplier;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware([
            \App\Http\Middleware\EnsureLicensed::class,
            \App\Http\Middleware\CheckTokenExpiry::class,
        ]);

        $this->category = Category::create(['name' => 'Tablets']);
        $this->brand = Brand::create(['name' => 'GSK']);
        $this->defaultSupplier = Supplier::create(['name' => 'Default Supplier']);

        Setting::create([
            'store_name'   => 'Al-Shifa Pharmacy & Mart',
            'phone_number' => '0300-1112223',
            'address'      => 'Main Boulevard, Lahore',
        ]);

        $permissions = [
            'sale-invoice.view',
            'purchase-invoice.view',
            'customer-ledger.view',
            'supplier-ledger.view',
            'payment.view',
            'purchase-order.view',
            'settings.view',
            'settings.update',
        ];

        foreach ($permissions as $perm) {
            Permission::findOrCreate($perm, 'sanctum');
        }

        $this->authorizedUser = User::create([
            'name'     => 'Authorized Manager',
            'email'    => 'manager@karobar.test',
            'password' => bcrypt('password'),
        ]);
        $this->authorizedUser->givePermissionTo($permissions);

        $this->unauthorizedUser = User::create([
            'name'     => 'Restricted User',
            'email'    => 'restricted@karobar.test',
            'password' => bcrypt('password'),
        ]);
    }

    public function test_phone_normalization_converts_local_and_international_formats(): void
    {
        $service = app(DocumentShareService::class);

        $this->assertSame('923001234567', $service->normalizePhone('0300-1234567'));
        $this->assertSame('923219876543', $service->normalizePhone('+92 321 9876543'));
        $this->assertSame('923331112233', $service->normalizePhone('00923331112233'));
        $this->assertSame('923001234567', $service->normalizePhone('3001234567'));
        $this->assertSame('', $service->normalizePhone(null));
    }

    public function test_sale_invoice_metadata_pdf_and_signed_public_link(): void
    {
        Sanctum::actingAs($this->authorizedUser);

        $customer = Customer::create([
            'name'    => 'Tariq Mehmood',
            'phone'   => '0300-7654321',
            'email'   => 'tariq@example.com',
            'address' => 'Model Town',
        ]);

        $product = Product::create([
            'product_code'        => 'PRD-001',
            'barcode'             => '8964001112221',
            'name'                => 'Panadol 500mg',
            'category_id'         => $this->category->id,
            'brand_id'            => $this->brand->id,
            'supplier_id'         => $this->defaultSupplier->id,
            'pack_size'           => 10,
            'unit_purchase_price' => 30,
            'unit_sale_price'     => 45,
            'quantity'            => 100,
        ]);

        $invoice = SaleInvoice::create([
            'user_id'        => $this->authorizedUser->id,
            'customer_id'    => $customer->id,
            'posted_number'  => 'SI-000105',
            'date'           => '2026-10-25',
            'invoice_type'   => 'credit',
            'gross_amount'   => 450,
            'total'          => 450,
            'total_receive'  => 150,
        ]);

        SaleInvoiceItem::create([
            'sale_invoice_id' => $invoice->id,
            'product_id'      => $product->id,
            'pack_size'       => 10,
            'pack_quantity'   => 1,
            'unit_quantity'   => 0,
            'quantity'        => 10,
            'price'           => 45,
            'sub_total'       => 450,
        ]);

        // Verify the rendered Sale Invoice template shows the actual quantity (10), even when unit_quantity is 0
        $renderedInvoiceHtml = view('pdf.sale_invoice', [
            'invoice'          => $invoice->fresh(['customer', 'user', 'items.product']),
            'setting'          => Setting::first(),
            'customerTotalDue' => 300,
        ])->render();
        $this->assertStringContainsString('<td class="text-right">10</td>', $renderedInvoiceHtml);

        // 1. Metadata check (no URL link inside whatsapp_text + PDF design templates + English & Urdu invoice formats returned)
        Setting::first()->update([
            'note' => "فریج میڈیسن، کھلی میڈیسن، استعمال شدہ میڈیسن اورکٹی ہوئی میڈیسن ناقابل واپسی ہے-\nواپسی یا تبدیلی 7 دن کے اندر بل کے ہمراہ ہوگی-\nآپ کے تعاون کا شکریہ-",
        ]);

        $metaRes = $this->getJson("/api/share/metadata?type=sale_invoice&id={$invoice->id}&template=barcode");
        $metaRes->assertOk()
            ->assertJsonPath('type', 'sale_invoice')
            ->assertJsonPath('pdf_template', 'barcode')
            ->assertJsonPath('normalized_phone', '923007654321')
            ->assertJsonPath('recipient_email', 'tariq@example.com');

        $this->assertCount(6, $metaRes->json('available_pdf_templates'));
        $this->assertStringContainsString('https://wa.me/923007654321?text=', $metaRes->json('whatsapp_url'));
        $this->assertStringContainsString('SI-000105', $metaRes->json('whatsapp_text'));
        $this->assertStringContainsString('SALE INVOICE', $metaRes->json('whatsapp_text_en'));
        $this->assertStringContainsString('Refrigerated, loose, used', $metaRes->json('whatsapp_text_en'));
        $this->assertStringContainsString('سیل انوائس / بل کی تفصیل', $metaRes->json('whatsapp_text_ur'));
        $this->assertStringContainsString('فریج میڈیسن', $metaRes->json('whatsapp_text_ur'));
        $this->assertStringContainsString('سیل انوائس SI-000105', $metaRes->json('email_subject_ur'));
        $this->assertStringContainsString('بل کا خلاصہ:', $metaRes->json('email_body_ur'));
        $this->assertStringNotContainsString('🧾', $metaRes->json('whatsapp_text'));
        $this->assertStringNotContainsString('http://', $metaRes->json('whatsapp_text'));
        $this->assertStringNotContainsString('https://', $metaRes->json('whatsapp_text'));

        // Verify UrduPdfTextShaper shapes Urdu letters into presentation forms
        $shapedSample = \App\Support\UrduPdfTextShaper::shapeText('آپ کے تعاون کا شکریہ');
        $this->assertNotEmpty($shapedSample);
        $this->assertNotSame('آپ کے تعاون کا شکریہ', $shapedSample);

        // Verify PDF generation works across multiple design templates
        foreach (['standard', 'minimal', 'detailed', 'compact', 'bold', 'barcode'] as $tpl) {
            $tplPdfRes = $this->get("/api/share/pdf?type=sale_invoice&id={$invoice->id}&template={$tpl}");
            $tplPdfRes->assertOk();
            $this->assertStringStartsWith('%PDF-', $tplPdfRes->getContent());
        }

        // 2. Build & Send actual PDF for WhatsApp (client_file mode + saved PDF in private local storage)
        Storage::fake('local');
        Storage::fake('public');
        Storage::disk('public')->put('shared-pdfs/Legacy_Exposed_File.pdf', 'legacy-pdf');

        $waRes = $this->postJson('/api/share/whatsapp', [
            'type'    => 'sale_invoice',
            'id'      => $invoice->id,
            'phone'   => '0300-7654321',
            'message' => $metaRes->json('whatsapp_text'),
        ]);
        $waRes->assertOk()
            ->assertJsonPath('status', 'pdf_built')
            ->assertJsonPath('filename', 'Sale_Invoice_SI-000105.pdf')
            ->assertJsonPath('normalized_phone', '923007654321');
        $this->assertNotEmpty($waRes->json('pdf_base64'));
        $this->assertStringStartsWith('%PDF-', base64_decode($waRes->json('pdf_base64')));

        // Verify PDF is stored in private local storage with randomized prefix and NOT in public storage
        $storedPath = $waRes->json('stored_path');
        $this->assertNotEmpty($storedPath);
        $this->assertNotSame('shared-pdfs/Sale_Invoice_SI-000105.pdf', $storedPath);
        Storage::disk('local')->assertExists($storedPath);
        Storage::disk('public')->assertMissing('shared-pdfs/Sale_Invoice_SI-000105.pdf');
        Storage::disk('public')->assertMissing('shared-pdfs/Legacy_Exposed_File.pdf');

        // 3. Direct WhatsApp Cloud API PDF document dispatch when credentials are configured
        config([
            'services.whatsapp.access_token'    => 'test-wa-token',
            'services.whatsapp.phone_number_id' => '1234567890',
            'services.whatsapp.api_version'     => 'v20.0',
        ]);
        Http::fake([
            'https://graph.facebook.com/v20.0/1234567890/media'    => Http::response(['id' => 'media_pdf_999'], 200),
            'https://graph.facebook.com/v20.0/1234567890/messages' => Http::response(['messages' => [['id' => 'wamid.test123']]], 200),
        ]);

        $waCloudRes = $this->postJson('/api/share/whatsapp', [
            'type'    => 'sale_invoice',
            'id'      => $invoice->id,
            'phone'   => '0300-7654321',
            'message' => 'Attached Sale Invoice PDF',
        ]);
        $waCloudRes->assertOk()
            ->assertJsonPath('status', 'sent_via_api')
            ->assertJsonPath('mode', 'cloud_api')
            ->assertJsonPath('whatsapp_msg_id', 'wamid.test123');

        // 4. Authenticated PDF download
        $pdfRes = $this->get("/api/share/pdf?type=sale_invoice&id={$invoice->id}&download=1");
        $pdfRes->assertOk();
        $this->assertStringContainsString('application/pdf', $pdfRes->headers->get('content-type'));

        // 3. Signed public PDF link works without auth
        $signedUrl = $metaRes->json('signed_pdf_url');
        $this->assertNotEmpty($signedUrl);

        $publicRes = $this->get($signedUrl);
        $publicRes->assertOk();
        $this->assertStringContainsString('application/pdf', $publicRes->headers->get('content-type'));

        // Tampered signature is rejected with 403
        $tamperedRes = $this->get($signedUrl . 'tampered');
        $tamperedRes->assertStatus(403);
    }

    public function test_customer_and_supplier_ledger_statement_share_and_email_dispatch(): void
    {
        Mail::fake();
        Sanctum::actingAs($this->authorizedUser);

        $customer = Customer::create([
            'name'  => 'Zainab Enterprises',
            'phone' => '0321-5556677',
            'email' => null,
        ]);

        CustomerLedger::create([
            'customer_id'     => $customer->id,
            'entry_type'      => 'manual',
            'is_manual'       => true,
            'entry_date'      => '2026-10-20',
            'posted_number'   => 'OB-01',
            'invoice_total'   => 5000,
            'total_received'  => 1000,
            'credited_amount' => 0,
            'description'     => 'Opening balance',
        ]);

        // Send Email with PDF & save_email=true
        $emailRes = $this->postJson('/api/share/email', [
            'type'        => 'customer_ledger',
            'customer_id' => $customer->id,
            'email'       => 'accounts@zainab.pk',
            'subject'     => 'Customer Statement - Zainab Enterprises',
            'message'     => 'Please find attached your statement.',
            'save_email'  => true,
        ]);

        $emailRes->assertOk()
            ->assertJsonPath('status', 'sent');

        Mail::assertSent(DocumentShareMail::class, function (DocumentShareMail $mail) {
            return $mail->hasTo('accounts@zainab.pk')
                && $mail->subjectLine === 'Customer Statement - Zainab Enterprises'
                && !empty($mail->pdfBytes);
        });

        // Verify email was saved back to customer profile
        $this->assertDatabaseHas('customers', [
            'id'    => $customer->id,
            'email' => 'accounts@zainab.pk',
        ]);

        // Supplier Ledger Statement + supplier email persistence
        $supplier = Supplier::create([
            'name'  => 'Meditech Distributors',
            'phone' => '0333-4445566',
        ]);

        SupplierLedger::create([
            'supplier_id'      => $supplier->id,
            'entry_type'       => 'manual',
            'is_manual'        => true,
            'entry_date'       => '2026-10-22',
            'posted_number'    => 'SUP-OB-1',
            'invoice_total'    => 12000,
            'total_paid'       => 2000,
            'debited_amount'   => 0,
            'credit_remaining' => 10000,
            'description'      => 'Opening supplier balance',
        ]);

        $supEmailRes = $this->postJson('/api/share/email', [
            'type'        => 'supplier_ledger',
            'supplier_id' => $supplier->id,
            'email'       => 'billing@meditech.pk',
            'subject'     => 'Supplier Statement',
            'message'     => 'Attached is our supplier statement.',
            'save_email'  => true,
        ]);

        $supEmailRes->assertOk();
        $this->assertDatabaseHas('suppliers', [
            'id'    => $supplier->id,
            'email' => 'billing@meditech.pk',
        ]);
    }

    public function test_payment_voucher_and_purchase_order_pdf_sharing(): void
    {
        Sanctum::actingAs($this->authorizedUser);

        $supplier = Supplier::create([
            'name'  => 'Prime Pharma',
            'phone' => '0345-1239876',
            'email' => 'orders@primepharma.pk',
        ]);

        $account = Account::create([
            'code'            => 'ACC-CASH',
            'name'            => 'Main Cash',
            'type'            => 'cash',
            'opening_balance' => 50000,
            'current_balance' => 50000,
            'is_active'       => true,
            'is_default_cash' => true,
        ]);

        $payment = Payment::create([
            'payment_number'   => 'PAY-2026-0001',
            'party_type'       => 'supplier',
            'party_id'         => $supplier->id,
            'payment_date'     => '2026-10-25',
            'amount'           => 7500,
            'allocated_amount' => 7500,
            'unapplied_amount' => 0,
            'payment_method'   => 'cash',
            'account_id'       => $account->id,
            'status'           => 'posted',
            'created_by_id'    => $this->authorizedUser->id,
        ]);

        $payMeta = $this->getJson("/api/share/metadata?type=payment&id={$payment->id}");
        $payMeta->assertOk()
            ->assertJsonPath('normalized_phone', '923451239876')
            ->assertJsonPath('recipient_email', 'orders@primepharma.pk');

        $payPdf = $this->get("/api/share/pdf?type=payment&id={$payment->id}");
        $payPdf->assertOk();

        // Purchase Order test
        $product = Product::create([
            'product_code'        => 'PRD-002',
            'barcode'             => '8964001112222',
            'name'                => 'Augmentin 625mg',
            'category_id'         => $this->category->id,
            'brand_id'            => $this->brand->id,
            'supplier_id'         => $supplier->id,
            'pack_size'           => 6,
            'unit_purchase_price' => 50,
            'unit_sale_price'     => 65,
            'quantity'            => 30,
        ]);

        $po = PurchaseOrder::create([
            'date'                    => '2026-10-25',
            'expected_received_date'  => '2026-10-30',
            'supplier_id'             => $supplier->id,
            'status'                  => 'ordered',
            'reference'               => 'REF-PO-99',
            'created_by'              => $this->authorizedUser->id,
        ]);

        PurchaseOrderItem::create([
            'purchase_order_id'        => $po->id,
            'product_id'               => $product->id,
            'ordered_quantity'         => 60,
            'pack_size'                => 6,
            'unit_purchase_price'      => 50,
            'item_discount_percentage' => 0,
            'unit_bonus'               => 0,
        ]);

        $poMeta = $this->getJson("/api/share/metadata?type=purchase_order&id={$po->id}");
        $poMeta->assertOk()
            ->assertJsonPath('recipient_name', 'Prime Pharma');
        $this->assertStringContainsString('3,000.00', $poMeta->json('whatsapp_text'));

        $poPdf = $this->get("/api/share/pdf?type=purchase_order&id={$po->id}");
        $poPdf->assertOk();
    }

    public function test_unauthorized_user_cannot_access_document_share_endpoints(): void
    {
        Sanctum::actingAs($this->unauthorizedUser);

        $customer = Customer::create(['name' => 'Test Customer']);

        $res = $this->getJson("/api/share/metadata?type=customer_ledger&customer_id={$customer->id}");
        $res->assertStatus(403);
    }

    public function test_whatsapp_settings_crud_and_test_connection_endpoint(): void
    {
        Sanctum::actingAs($this->authorizedUser);

        // 1. Save WhatsApp Agent API settings via POST /api/settings
        $saveRes = $this->postJson('/api/settings', [
            'printer_type'                  => 'a4',
            'whatsapp_enabled'              => true,
            'whatsapp_provider'             => 'whapi_cloud',
            'whatsapp_access_token'         => 'whapi-agent-key-999',
            'whatsapp_default_country_code' => '92',
            'whatsapp_auto_fallback'        => true,
        ]);

        $saveRes->assertOk()
            ->assertJsonPath('whatsapp_enabled', true)
            ->assertJsonPath('whatsapp_provider', 'whapi_cloud')
            ->assertJsonPath('whatsapp_access_token', 'whapi-agent-key-999')
            ->assertJsonPath('whatsapp_default_country_code', '92')
            ->assertJsonPath('whatsapp_auto_fallback', true);

        // 2. Test WhatsApp Agent API connection via POST /api/settings/test-whatsapp
        Http::fake([
            'gate.whapi.cloud/messages/document' => Http::response([
                'sent'    => true,
                'message' => ['id' => 'whapi.msg.12345'],
            ], 200),
        ]);

        $testRes = $this->postJson('/api/settings/test-whatsapp', [
            'test_phone'            => '0300-1234567',
            'whatsapp_provider'     => 'whapi_cloud',
            'whatsapp_access_token' => 'whapi-agent-key-999',
        ]);

        $testRes->assertOk()
            ->assertJsonPath('status', 'sent')
            ->assertJsonPath('provider', 'whapi_cloud')
            ->assertJsonPath('normalized_phone', '923001234567');
    }

    public function test_whatsapp_agent_api_dispatch_save_phone_and_auto_fallback(): void
    {
        Sanctum::actingAs($this->authorizedUser);

        // Configure Whapi.Cloud Single-API-Key Agent in database settings
        Setting::first()->update([
            'whatsapp_enabled'              => true,
            'whatsapp_provider'             => 'whapi_cloud',
            'whatsapp_access_token'         => 'whapi-live-token-abc',
            'whatsapp_default_country_code' => '92',
            'whatsapp_auto_fallback'        => true,
        ]);

        $customer = Customer::create([
            'name'  => 'MedLife Clinic',
            'phone' => null,
        ]);

        $invoice = SaleInvoice::create([
            'user_id'       => $this->authorizedUser->id,
            'customer_id'   => $customer->id,
            'posted_number' => 'SI-2026-0099',
            'date'          => '2026-10-31',
            'invoice_type'  => 'credit',
            'status'        => 'posted',
            'gross_amount'  => 500,
            'total'         => 500,
            'total_receive' => 0,
            'remain_this'   => 500,
        ]);

        // Metadata endpoint reflects DB-configured WhatsApp Agent API
        $metaRes = $this->getJson("/api/share/metadata?type=sale_invoice&id={$invoice->id}");
        $metaRes->assertOk()
            ->assertJsonPath('whatsapp_api_configured', true)
            ->assertJsonPath('whatsapp_provider', 'whapi_cloud');

        // 1. Successful Agent API dispatch + save_phone persistence
        Http::fake([
            'gate.whapi.cloud/messages/document' => Http::response([
                'sent'    => true,
                'message' => ['id' => 'whapi.doc.777'],
            ], 200),
        ]);

        $waRes = $this->postJson('/api/share/whatsapp', [
            'type'       => 'sale_invoice',
            'id'         => $invoice->id,
            'phone'      => '0321-7654321',
            'message'    => 'Please find your invoice attached.',
            'save_phone' => true,
        ]);

        $waRes->assertOk()
            ->assertJsonPath('status', 'sent_via_api')
            ->assertJsonPath('mode', 'cloud_api')
            ->assertJsonPath('provider', 'whapi_cloud')
            ->assertJsonPath('normalized_phone', '923217654321');

        $this->assertSame('0321-7654321', $customer->fresh()->phone);

        // 2. When remote API fails and auto_fallback is true, returns api_fallback with Base64 PDF
        Setting::first()->update([
            'whatsapp_provider' => 'wasender',
            'whatsapp_api_url'  => 'https://wasenderapi.com/api/send-message',
        ]);

        Http::fake([
            'wasenderapi.com/*' => Http::response(['message' => 'Session disconnected'], 500),
        ]);

        $fallbackRes = $this->postJson('/api/share/whatsapp', [
            'type'    => 'sale_invoice',
            'id'      => $invoice->id,
            'phone'   => '0321-7654321',
            'message' => 'Please find your invoice attached.',
        ]);

        $fallbackRes->assertOk()
            ->assertJsonPath('status', 'api_fallback')
            ->assertJsonPath('mode', 'client_file');
        $this->assertNotEmpty($fallbackRes->json('pdf_base64'));
    }

    public function test_meta_cloud_api_24h_window_template_fallback(): void
    {
        Sanctum::actingAs($this->authorizedUser);

        Setting::first()->update([
            'whatsapp_enabled'           => true,
            'whatsapp_provider'          => 'meta_cloud',
            'whatsapp_access_token'      => 'meta-perm-token-123',
            'whatsapp_phone_number_id'   => '9988776655',
            'whatsapp_api_version'       => 'v20.0',
            'whatsapp_template_name'     => 'invoice_document_utility',
            'whatsapp_template_language' => 'en',
            'whatsapp_auto_fallback'     => false,
        ]);

        $customer = Customer::create([
            'name'  => 'City Hospital',
            'phone' => '0300-9988776',
        ]);

        $invoice = SaleInvoice::create([
            'user_id'       => $this->authorizedUser->id,
            'customer_id'   => $customer->id,
            'posted_number' => 'SI-2026-0105',
            'date'          => '2026-10-31',
            'invoice_type'  => 'credit',
            'status'        => 'posted',
            'gross_amount'  => 1200,
            'total'         => 1200,
            'total_receive' => 1200,
            'remain_this'   => 0,
        ]);

        $messagesCallCount = 0;

        Http::fake(function ($request) use (&$messagesCallCount) {
            if (str_contains($request->url(), '/9988776655/media')) {
                return Http::response(['id' => 'media_id_555'], 200);
            }
            if (str_contains($request->url(), '/9988776655/messages')) {
                $messagesCallCount++;
                // First call (free-form document) fails with 131047 (Re-engagement / 24h window closed)
                if ($messagesCallCount === 1) {
                    return Http::response([
                        'error' => [
                            'message' => 'Re-engagement message',
                            'code'    => 131047,
                        ],
                    ], 400);
                }
                // Second call (template retry) succeeds
                return Http::response([
                    'messages' => [['id' => 'wamid.TEMPLATE999']],
                ], 200);
            }

            return Http::response([], 404);
        });

        $res = $this->postJson('/api/share/whatsapp', [
            'type'    => 'sale_invoice',
            'id'      => $invoice->id,
            'phone'   => '0300-9988776',
            'message' => 'Invoice summary',
        ]);

        $res->assertOk()
            ->assertJsonPath('status', 'sent_via_api')
            ->assertJsonPath('mode', 'cloud_api')
            ->assertJsonPath('provider', 'meta_cloud');
        $this->assertSame(2, $messagesCallCount);
    }

    public function test_free_local_agent_waha_and_evolution_api_pdf_delivery(): void
    {
        Sanctum::actingAs($this->authorizedUser);

        $customer = Customer::create([
            'name'  => 'Free Agent Pharmacy',
            'phone' => '0300-1122334',
        ]);

        $invoice = SaleInvoice::create([
            'user_id'       => $this->authorizedUser->id,
            'customer_id'   => $customer->id,
            'posted_number' => 'SI-2026-0200',
            'date'          => '2026-10-31',
            'invoice_type'  => 'credit',
            'status'        => 'posted',
            'gross_amount'  => 950,
            'total'         => 950,
            'total_receive' => 950,
            'remain_this'   => 0,
        ]);

        // 1. Built-in Free Local WhatsApp Agent (local_agent) status, pairing code, and PDF dispatch
        Setting::first()->update([
            'whatsapp_enabled'      => true,
            'whatsapp_provider'     => 'local_agent',
            'whatsapp_api_url'      => 'http://127.0.0.1:3001',
            'whatsapp_access_token' => 'karobar_wa_free_key',
        ]);

        Http::fake([
            '127.0.0.1:3001/status' => Http::response([
                'ok'          => true,
                'status'      => 'qr_ready',
                'qr_data_url' => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==',
            ], 200),
            '127.0.0.1:3001/pair-code' => Http::response([
                'ok'           => true,
                'pairing_code' => 'ABCD-1234',
                'phone'        => '923001122334',
            ], 200),
            '127.0.0.1:3001/send-document' => Http::response([
                'ok'         => true,
                'sent'       => true,
                'message_id' => 'baileys.free.001',
            ], 200),
            'localhost:3000/api/sendFile' => Http::response([
                'id' => 'waha.free.002',
            ], 200),
            'localhost:8080/message/sendMedia/default' => Http::response([
                'key' => ['id' => 'evolution.free.003'],
            ], 200),
        ]);

        $statusRes = $this->getJson('/api/settings/whatsapp-agent/status');
        $statusRes->assertOk()
            ->assertJsonPath('agent_running', true)
            ->assertJsonPath('status', 'qr_ready');

        $startRes = $this->postJson('/api/settings/whatsapp-agent/start');
        $startRes->assertOk()
            ->assertJsonPath('agent_running', true)
            ->assertJsonPath('status', 'qr_ready');

        $pairRes = $this->postJson('/api/settings/whatsapp-agent/pair-code', [
            'phone' => '0300-1122334',
        ]);
        $pairRes->assertOk()
            ->assertJsonPath('pairing_code', 'ABCD-1234');

        $localSend = $this->postJson('/api/share/whatsapp', [
            'type'    => 'sale_invoice',
            'id'      => $invoice->id,
            'phone'   => '0300-1122334',
            'message' => 'Free local agent PDF',
        ]);
        $localSend->assertOk()
            ->assertJsonPath('status', 'sent_via_api')
            ->assertJsonPath('provider', 'local_agent')
            ->assertJsonPath('whatsapp_msg_id', 'baileys.free.001');

        // 2. WAHA (Free Open-Source Docker API)
        Setting::first()->update([
            'whatsapp_provider'        => 'waha',
            'whatsapp_api_url'         => 'http://localhost:3000',
            'whatsapp_phone_number_id' => 'default',
        ]);

        $wahaSend = $this->postJson('/api/share/whatsapp', [
            'type'    => 'sale_invoice',
            'id'      => $invoice->id,
            'phone'   => '0300-1122334',
            'message' => 'Free WAHA PDF',
        ]);
        $wahaSend->assertOk()
            ->assertJsonPath('status', 'sent_via_api')
            ->assertJsonPath('provider', 'waha')
            ->assertJsonPath('whatsapp_msg_id', 'waha.free.002');

        // 3. Evolution API (Free Open-Source Gateway)
        Setting::first()->update([
            'whatsapp_provider'        => 'evolution_api',
            'whatsapp_api_url'         => 'http://localhost:8080',
            'whatsapp_phone_number_id' => 'default',
            'whatsapp_access_token'    => 'evo-free-key',
        ]);

        $evoSend = $this->postJson('/api/share/whatsapp', [
            'type'    => 'sale_invoice',
            'id'      => $invoice->id,
            'phone'   => '0300-1122334',
            'message' => 'Free Evolution PDF',
        ]);
        $evoSend->assertOk()
            ->assertJsonPath('status', 'sent_via_api')
            ->assertJsonPath('provider', 'evolution_api')
            ->assertJsonPath('whatsapp_msg_id', 'evolution.free.003');
    }
}
