<?php

namespace Tests\Feature;

use App\Http\Controllers\InvoiceDraftController;
use App\Http\Controllers\PurchaseInvoiceController;
use App\Http\Controllers\SaleInvoiceController;
use App\Models\Batch;
use App\Models\Customer;
use App\Models\CustomerLedger;
use App\Models\InvoiceDraft;
use App\Models\Product;
use App\Models\PurchaseInvoice;
use App\Models\SaleInvoice;
use App\Models\Supplier;
use App\Models\SupplierLedger;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class InvoiceDraftWorkflowTest extends TestCase
{
    private User $user;
    private User $otherUser;
    private bool $bypassGate = true;

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
            '2025_08_30_171505_create_sale_invoices_table.php',
            '2025_08_30_171513_create_sale_invoice_items_table.php',
            '2025_09_01_074800_create_sale_returns_table.php',
            '2025_09_01_074814_create_sale_return_items_table.php',
            '2025_09_08_162536_add_total_receive_to_sale_invoices_table.php',
            '2025_09_25_000000_add_invoice_type_to_sale_invoices_table.php',
            '2026_04_01_000000_add_whole_sale_prices_to_products_table.php',
            '2026_04_01_000003_add_whole_sale_margin_to_products_table.php',
            '2026_04_01_000001_add_whole_sale_prices_to_purchase_invoice_items_table.php',
            '2026_04_01_000002_add_whole_sale_margin_to_purchase_invoice_items_table.php',
            '2026_04_02_000000_add_sale_type_to_sale_invoices_table.php',
            '2026_04_02_000001_add_sale_type_to_sale_invoice_items_table.php',
            '2026_04_02_000003_add_wholesale_type_to_sale_invoices_table.php',
            '2025_09_08_171931_create_customer_ledgers_table.php',
            '2025_09_08_013727_create_supplier_ledgers_table.php',
            '2026_05_01_000000_create_user_demands_table.php',
            '2026_10_12_000001_create_purchase_orders.php',
            '2026_10_13_000006_add_sale_cost_snapshots.php',
            '2026_10_23_000001_create_invoice_drafts_table.php',
        ] as $file) {
            (require database_path('migrations/'.$file))->up();
        }

        $this->user = User::forceCreate(['name' => 'Alice', 'email' => 'alice@test.test', 'password' => bcrypt('test')]);
        $this->otherUser = User::forceCreate(['name' => 'Bob', 'email' => 'bob@test.test', 'password' => bcrypt('test')]);
        $this->actingAs($this->user);
        Gate::before(fn ($user) => ($user->id === $this->user->id && $this->bypassGate) ? true : null);

        DB::table('customers')->insert(['id' => 1, 'name' => 'Regular Customer']);
        DB::table('suppliers')->insert(['id' => 1, 'name' => 'Main Supplier']);
        DB::table('categories')->insert(['id' => 1, 'name' => 'General']);
        DB::table('brands')->insert(['id' => 1, 'name' => 'Standard']);

        Product::create([
            'id' => 1,
            'category_id' => 1,
            'brand_id' => 1,
            'supplier_id' => 1,
            'name' => 'Panadol 500mg',
            'product_code' => 'P500',
            'barcode' => 'BAR500',
            'pack_size' => 10,
            'quantity' => 100,
            'unit_purchase_price' => 10,
            'avg_price' => 10,
            'unit_sale_price' => 15,
        ]);

        Batch::create([
            'id' => 1,
            'product_id' => 1,
            'batch_number' => 'B101',
            'expiry_date' => '2027-12-31',
            'quantity' => 50,
        ]);
    }

    private function request(array $data, string $method = 'POST', ?User $user = null): Request
    {
        $request = Request::create('/api/invoice-drafts', $method, $data);
        $request->setUserResolver(fn () => $user ?? $this->user);
        $this->app->instance('request', $request);
        return $request;
    }

    public function test_draft_create_and_update_never_alters_stock_or_ledgers(): void
    {
        $controller = app(InvoiceDraftController::class);
        $uuid = (string)Str::uuid();

        $payload = [
            'customer_id' => 1,
            'invoice_type' => 'credit',
            'sale_type' => 'retail',
            'wholesale_type' => 'unit',
            'date' => '2026-10-22',
            'remarks' => 'Held counter customer',
            'gross_amount' => 150,
            'total' => 150,
            'total_receive' => 50,
            'items' => [
                [
                    'product_id' => 1,
                    'pack_size' => 10,
                    'batch_number' => 'B101',
                    'expiry' => '2027-12-31',
                    'quantity' => 10,
                    'price' => 15,
                    'sub_total' => 150,
                ],
            ],
        ];

        $req = $this->request([
            'uuid' => $uuid,
            'type' => 'sale_retail',
            'title' => 'Held Customer Cart',
            'payload' => $payload,
        ]);

        $response = $controller->store($req);
        $this->assertSame(201, $response->getStatusCode());

        $draft = InvoiceDraft::where('uuid', $uuid)->first();
        $this->assertNotNull($draft);
        $this->assertSame('draft', $draft->status);
        $this->assertSame(1, $draft->version);
        $this->assertSame('Held Customer Cart', $draft->title);
        $this->assertEquals(150, $draft->total_amount);
        $this->assertSame(1, $draft->items_count);

        // Crucial invariant: Stock and batch stock remain unchanged
        $this->assertSame(100, (int)Product::find(1)->quantity);
        $this->assertSame(50, (int)Batch::find(1)->quantity);

        // Crucial invariant: No customer ledger entries created
        $this->assertSame(0, CustomerLedger::count());
        // No posted invoice created
        $this->assertSame(0, SaleInvoice::count());

        // Update draft with additional quantity
        $payload['items'][0]['quantity'] = 20;
        $payload['total'] = 300;
        $updateReq = $this->request([
            'expected_version' => 1,
            'payload' => $payload,
        ], 'PUT');

        $updateResp = $controller->update($updateReq, $draft->id);
        $this->assertSame(200, $updateResp->getStatusCode());

        $draft->refresh();
        $this->assertSame(2, $draft->version);
        $this->assertEquals(300, $draft->total_amount);

        // Stock still untouched
        $this->assertSame(100, (int)Product::find(1)->quantity);
        $this->assertSame(50, (int)Batch::find(1)->quantity);
        $this->assertSame(0, CustomerLedger::count());
    }

    public function test_optimistic_concurrency_rejects_stale_versions_with_409(): void
    {
        $controller = app(InvoiceDraftController::class);
        $uuid = (string)Str::uuid();

        $draft = InvoiceDraft::create([
            'uuid' => $uuid,
            'user_id' => $this->user->id,
            'type' => 'sale_retail',
            'title' => 'Test Draft',
            'version' => 2,
            'payload' => ['customer_id' => 1, 'items' => []],
            'status' => 'draft',
        ]);

        // Attempting to update with stale version 1
        $updateReq = $this->request([
            'expected_version' => 1,
            'payload' => ['customer_id' => 1, 'items' => []],
        ], 'PUT');

        $resp = $controller->update($updateReq, $draft->id);
        $this->assertSame(409, $resp->getStatusCode());
        $this->assertSame(2, $draft->fresh()->version);
    }

    public function test_resume_draft_annotates_insufficient_or_depleted_stock_safely(): void
    {
        $controller = app(InvoiceDraftController::class);
        $uuid = (string)Str::uuid();

        $draft = InvoiceDraft::create([
            'uuid' => $uuid,
            'user_id' => $this->user->id,
            'type' => 'sale_retail',
            'title' => 'Resume Test',
            'version' => 1,
            'payload' => [
                'customer_id' => 1,
                'items' => [
                    [
                        'product_id' => 1,
                        'batch_number' => 'B101',
                        'quantity' => 80, // Batch only has 50
                    ],
                ],
            ],
            'status' => 'draft',
        ]);

        $resp = $controller->show($draft->id);
        $this->assertSame(200, $resp->getStatusCode());
        $data = $resp->getData(true);

        $this->assertArrayHasKey('annotations', $data);
        $this->assertNotEmpty($data['annotations']['item_issues'][0]);
        $this->assertStringContainsString('Batch only has 50 units available', $data['annotations']['item_issues'][0][0]);
    }

    public function test_atomic_idempotent_posting_deducts_stock_and_prevents_duplicate_effects(): void
    {
        $controller = app(InvoiceDraftController::class);
        $uuid = (string)Str::uuid();

        $payload = [
            'customer_id' => 1,
            'invoice_type' => 'credit',
            'sale_type' => 'retail',
            'wholesale_type' => 'unit',
            'date' => '2026-10-22',
            'gross_amount' => 150,
            'total' => 150,
            'total_receive' => 50,
            'items' => [
                [
                    'product_id' => 1,
                    'pack_size' => 10,
                    'batch_number' => 'B101',
                    'expiry' => '2027-12-31',
                    'quantity' => 10,
                    'price' => 15,
                    'sub_total' => 150,
                ],
            ],
        ];

        $draft = InvoiceDraft::create([
            'uuid' => $uuid,
            'user_id' => $this->user->id,
            'type' => 'sale_retail',
            'title' => 'Ready to Post',
            'version' => 1,
            'payload' => $payload,
            'status' => 'draft',
        ]);

        $postReq = $this->request([], 'POST');
        $resp = $controller->post($postReq, $draft->id);
        $this->assertSame(201, $resp->getStatusCode());
        $invoiceId = $resp->getData(true)['id'];

        $draft->refresh();
        $this->assertSame('posted', $draft->status);
        $this->assertSame($invoiceId, $draft->posted_invoice_id);
        $this->assertSame(SaleInvoice::class, $draft->posted_invoice_type);

        // Stock was reduced exactly once
        $this->assertSame(90, (int)Product::find(1)->quantity);
        $this->assertSame(40, (int)Batch::find(1)->quantity);
        $this->assertSame(1, SaleInvoice::count());
        $this->assertSame(1, CustomerLedger::count());

        // Repeated post call (simulating network retry or double-click)
        $retryResp = $controller->post($postReq, $draft->id);
        $this->assertSame(200, $retryResp->getStatusCode());
        $this->assertTrue($retryResp->getData(true)['already_posted']);
        $this->assertSame($invoiceId, $retryResp->getData(true)['id']);

        // Invariant: Stock, invoice count, and ledger remain untouched on retry
        $this->assertSame(90, (int)Product::find(1)->quantity);
        $this->assertSame(40, (int)Batch::find(1)->quantity);
        $this->assertSame(1, SaleInvoice::count());
        $this->assertSame(1, CustomerLedger::count());
    }

    public function test_posting_fails_atomically_if_stock_exceeded_preserving_draft(): void
    {
        $controller = app(InvoiceDraftController::class);
        $uuid = (string)Str::uuid();

        $payload = [
            'customer_id' => 1,
            'invoice_type' => 'credit',
            'sale_type' => 'retail',
            'wholesale_type' => 'unit',
            'date' => '2026-10-22',
            'gross_amount' => 3000,
            'total' => 3000,
            'total_receive' => 0,
            'items' => [
                [
                    'product_id' => 1,
                    'pack_size' => 10,
                    'batch_number' => 'B101',
                    'expiry' => '2027-12-31',
                    'quantity' => 999, // Exceeds product stock 100
                    'price' => 15,
                    'sub_total' => 3000,
                ],
            ],
        ];

        $draft = InvoiceDraft::create([
            'uuid' => $uuid,
            'user_id' => $this->user->id,
            'type' => 'sale_retail',
            'title' => 'Excessive Qty Draft',
            'version' => 1,
            'payload' => $payload,
            'status' => 'draft',
        ]);

        $this->expectException(ValidationException::class);

        try {
            $postReq = $this->request([], 'POST');
            $controller->post($postReq, $draft->id);
        } finally {
            // Invariant: Draft remains available for correction in draft status
            $draft->refresh();
            $this->assertSame('draft', $draft->status);
            $this->assertNull($draft->posted_invoice_id);
            // Stock remained untouched
            $this->assertSame(100, (int)Product::find(1)->quantity);
            $this->assertSame(0, SaleInvoice::count());
            $this->assertSame(0, CustomerLedger::count());
        }
    }

    public function test_discard_permanently_removes_draft_without_stock_effects(): void
    {
        $controller = app(InvoiceDraftController::class);
        $uuid = (string)Str::uuid();

        $draft = InvoiceDraft::create([
            'uuid' => $uuid,
            'user_id' => $this->user->id,
            'type' => 'sale_retail',
            'title' => 'To Discard',
            'version' => 1,
            'payload' => ['customer_id' => 1, 'items' => []],
            'status' => 'draft',
        ]);

        $resp = $controller->destroy($this->request([], 'DELETE'), $draft->id);
        $this->assertSame(200, $resp->getStatusCode());

        $this->assertSoftDeleted('invoice_drafts', ['id' => $draft->id, 'status' => 'discarded']);
        $this->assertSame(100, (int)Product::find(1)->quantity);
        $this->assertSame(0, SaleInvoice::count());
    }

    public function test_purchase_invoice_draft_posting_workflow(): void
    {
        $controller = app(InvoiceDraftController::class);
        $uuid = (string)Str::uuid();

        $payload = [
            'supplier_id' => 1,
            'invoice_type' => 'credit',
            'posted_date' => '2026-10-22',
            'invoice_number' => 'SUPP-INV-999',
            'invoice_amount' => 500,
            'total_amount' => 500,
            'total_paid' => 100,
            'items' => [
                [
                    'product_id' => 1,
                    'pack_size' => 10,
                    'batch' => 'B202',
                    'expiry' => '2028-06-30',
                    'pack_quantity' => 5,
                    'unit_quantity' => 50,
                    'pack_purchase_price' => 100,
                    'unit_purchase_price' => 10,
                    'pack_sale_price' => 150,
                    'unit_sale_price' => 15,
                    'whole_sale_pack_price' => 130,
                    'whole_sale_unit_price' => 13,
                    'margin' => 33.33,
                    'sub_total' => 500,
                    'avg_price' => 10,
                    'quantity' => 50,
                ],
            ],
        ];

        $draft = InvoiceDraft::create([
            'uuid' => $uuid,
            'user_id' => $this->user->id,
            'type' => 'purchase',
            'title' => 'Purchase Draft',
            'version' => 1,
            'payload' => $payload,
            'status' => 'draft',
        ]);

        $postReq = $this->request([], 'POST');
        $resp = $controller->post($postReq, $draft->id);
        $this->assertSame(201, $resp->getStatusCode());
        $invoice = $resp->getData(true);

        $draft->refresh();
        $this->assertSame('posted', $draft->status);
        $this->assertSame($invoice['id'], $draft->posted_invoice_id);

        // Product stock increased from 100 to 150
        $this->assertSame(150, (int)Product::find(1)->quantity);
        $this->assertSame(1, PurchaseInvoice::count());
        $this->assertSame(1, SupplierLedger::count());
    }

    public function test_user_cannot_access_or_mutate_another_users_draft(): void
    {
        $controller = app(InvoiceDraftController::class);
        $uuid = (string)Str::uuid();

        $draft = InvoiceDraft::create([
            'uuid' => $uuid,
            'user_id' => $this->user->id,
            'type' => 'sale_retail',
            'title' => "Alice's Secret Draft",
            'version' => 1,
            'payload' => ['customer_id' => 1, 'items' => []],
            'status' => 'draft',
        ]);

        $this->bypassGate = false;
        $this->actingAs($this->otherUser);
        $this->expectException(\Illuminate\Auth\Access\AuthorizationException::class);
        $this->request([], 'GET', $this->otherUser);
        $controller->show($draft->id);
    }

    public function test_draft_listing_is_scoped_to_current_user_and_filters_by_type(): void
    {
        $controller = app(InvoiceDraftController::class);

        InvoiceDraft::create([
            'uuid' => (string)Str::uuid(),
            'user_id' => $this->user->id,
            'type' => 'sale_retail',
            'title' => 'Alice Retail Draft',
            'version' => 1,
            'payload' => [
                'customer_id' => 1,
                'items' => [
                    ['product_id' => 1, 'quantity' => 5],
                ],
            ],
            'status' => 'draft',
        ]);

        InvoiceDraft::create([
            'uuid' => (string)Str::uuid(),
            'user_id' => $this->user->id,
            'type' => 'purchase',
            'title' => 'Alice Purchase Draft',
            'version' => 1,
            'payload' => ['supplier_id' => 1, 'items' => []],
            'status' => 'draft',
        ]);

        InvoiceDraft::create([
            'uuid' => (string)Str::uuid(),
            'user_id' => $this->otherUser->id,
            'type' => 'sale_retail',
            'title' => 'Bob Retail Draft',
            'version' => 1,
            'payload' => ['customer_id' => 1, 'items' => []],
            'status' => 'draft',
        ]);

        $listReq = $this->request(['type' => 'sale_retail'], 'GET', $this->user);
        $resp = $controller->index($listReq);
        $this->assertSame(200, $resp->getStatusCode());

        $drafts = $resp->getData(true);
        $this->assertCount(1, $drafts);
        $this->assertSame('Alice Retail Draft', $drafts[0]['title']);
        $this->assertNotEmpty($drafts[0]['items_summary']);
        $this->assertSame('Panadol 500mg', $drafts[0]['items_summary'][0]['name']);
        $this->assertSame(5, $drafts[0]['items_summary'][0]['quantity']);
    }

    public function test_cannot_hold_sale_invoice_draft_with_zero_products(): void
    {
        $controller = app(InvoiceDraftController::class);
        $uuid = (string)Str::uuid();

        $req = $this->request([
            'uuid' => $uuid,
            'type' => 'sale_retail',
            'title' => 'Empty Sale Cart',
            'payload' => [
                'customer_id' => 1,
                'remarks' => 'Walk-in customer with no items yet',
                'items' => [
                    ['product_id' => '', 'quantity' => 1],
                ],
            ],
        ]);

        $this->expectException(ValidationException::class);
        $controller->store($req);
    }

    public function test_cannot_hold_purchase_invoice_draft_with_zero_products(): void
    {
        $controller = app(InvoiceDraftController::class);
        $uuid = (string)Str::uuid();

        $req = $this->request([
            'uuid' => $uuid,
            'type' => 'purchase',
            'title' => 'Empty Purchase Cart',
            'payload' => [
                'supplier_id' => 1,
                'invoice_number' => 'INV-001',
                'items' => [],
            ],
        ]);

        $this->expectException(ValidationException::class);
        $controller->store($req);
    }

    public function test_cannot_update_draft_to_zero_products(): void
    {
        $controller = app(InvoiceDraftController::class);
        $uuid = (string)Str::uuid();

        $createReq = $this->request([
            'uuid' => $uuid,
            'type' => 'sale_retail',
            'title' => 'Cart with item',
            'payload' => [
                'customer_id' => 1,
                'items' => [
                    ['product_id' => 1, 'quantity' => 2],
                ],
            ],
        ]);
        $resp = $controller->store($createReq);
        $draft = $resp->getData();

        $updateReq = $this->request([
            'expected_version' => 1,
            'payload' => [
                'customer_id' => 1,
                'items' => [],
            ],
        ], 'PUT');

        $this->expectException(ValidationException::class);
        $controller->update($updateReq, $draft->id);
    }
}
