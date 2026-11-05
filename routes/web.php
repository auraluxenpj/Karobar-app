<?php

use App\Http\Controllers\CustomerLedgerController;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\SaleInvoiceController;
use App\Http\Controllers\SupplierLedgerController;

// --- Password Reset Route ---
Route::get('/password/reset/{token}/{email}', function ($token, $email) {
    return redirect('/reset-password/' . rawurlencode((string) $token) . '/' . rawurlencode((string) $email));
})->name('password.reset');

// --- Server-rendered routes FIRST ---
Route::get('/print/sale-invoices/{invoice}', [SaleInvoiceController::class, 'print'])
    ->whereNumber('invoice')
    ->middleware(['signed', 'licensed'])
    ->name('sale-invoices.print');
Route::get('/supplier-ledger/print', [SupplierLedgerController::class, 'print'])
    ->middleware(['signed', 'licensed'])
    ->name('supplier-ledger.print');

Route::get('/customer-ledger/print', [CustomerLedgerController::class, 'print'])
    ->middleware(['signed', 'licensed'])
    ->name('customer-ledger.print');

// Signed public PDF route for WhatsApp / external document sharing
Route::get('/print/shared-pdf/{type}', [\App\Http\Controllers\DocumentShareController::class, 'publicPdf'])
    ->middleware(['signed', 'licensed'])
    ->name('public.documents.pdf');

    // Thermal template preview route
Route::get('/print/thermal-preview/{template}', function ($template) {
    $validTemplates = ['standard', 'minimal', 'detailed', 'compact', 'bold', 'barcode'];
    
    if (!in_array($template, $validTemplates)) {
        abort(404, 'Template not found');
    }
    
    // Create sample data for preview
    $sampleInvoice = new \stdClass();
    $sampleInvoice->id = 1;
    $sampleInvoice->posted_number = 'INV-001';
    $sampleInvoice->date = now();
    $sampleInvoice->total = 450.00;
    $sampleInvoice->total_receive = 500.00;
    $sampleInvoice->discount_amount = 50.00;
    $sampleInvoice->tax_amount = 0;
    $sampleInvoice->invoice_type = 'credit';
    $sampleInvoice->remarks = 'Please keep refrigerated';
    $sampleInvoice->footer_note = '';
    $sampleInvoice->customer_id = null;
    $sampleInvoice->doctor_name = 'Dr. Ahmed Khan';
    $sampleInvoice->patient_name = 'Ali Ahmed';
    
    $user = new \stdClass();
    $user->name = 'Admin User';
    $sampleInvoice->user = $user;
    
    $customer = new \stdClass();
    $customer->name = 'John Doe';
    $customer->phone = '0300 1234567';
    $sampleInvoice->customer = $customer;
    
    // Create sample items
    $items = [];
    
    $item1 = new \stdClass();
    $product1 = new \stdClass();
    $product1->name = 'Paracetamol 500mg';
    $product1->barcode = '123456789012';
    $item1->product = $product1;
    $item1->quantity = 2;
    $item1->price = 100.00;
    $item1->sub_total = 200.00;
    $item1->item_discount_percentage = 0;
    $items[] = $item1;
    
    $item2 = new \stdClass();
    $product2 = new \stdClass();
    $product2->name = 'Brufen 400mg';
    $product2->barcode = '987654321098';
    $item2->product = $product2;
    $item2->quantity = 1;
    $item2->price = 150.00;
    $item2->sub_total = 150.00;
    $item2->item_discount_percentage = 0;
    $items[] = $item2;
    
    $item3 = new \stdClass();
    $product3 = new \stdClass();
    $product3->name = 'Vitamin C 1000mg';
    $product3->barcode = '456789123456';
    $item3->product = $product3;
    $item3->quantity = 3;
    $item3->price = 50.00;
    $item3->sub_total = 150.00;
    $item3->item_discount_percentage = 10;
    $items[] = $item3;
    
    $sampleInvoice->items = new \Illuminate\Support\Collection($items);
    
    $dbSetting = \Illuminate\Support\Facades\Schema::hasTable('settings') ? \App\Models\Setting::first() : null;
    $showLogo = request()->has('show_logo')
        ? request()->boolean('show_logo')
        : (bool) ($dbSetting?->share_show_logo ?? true);
    $sampleSetting = new \stdClass();
    $sampleSetting->store_name = $dbSetting?->store_name ?: 'PHARMACY STORE';
    $sampleSetting->phone_number = $dbSetting?->phone_number ?: '+92 300 1234567';
    $sampleSetting->address = $dbSetting?->address ?: '123 Main Street, City';
    $sampleSetting->logo_url = $showLogo ? ($dbSetting?->resolveLogoDataUri() ?? $dbSetting?->logo_url ?? null) : null;
    $sampleSetting->note = request()->has('note')
        ? (string) request()->query('note', '')
        : ($dbSetting ? (string) ($dbSetting->note ?? '') : 'Thank you for your business!');
    
    return view("printer.sale_invoice_thermal_{$template}", [
        'invoice' => $sampleInvoice,
        'setting' => $sampleSetting,
    ]);
})->name('thermal.preview');

    // A4 template preview route
Route::get('/print/a4-preview/{template}', function ($template) {
    $validTemplates = ['standard', 'minimal', 'detailed', 'compact', 'bold', 'barcode'];
    
    if (!in_array($template, $validTemplates)) {
        abort(404, 'Template not found');
    }
    
    // Create sample data for preview
    $sampleInvoice = new \stdClass();
    $sampleInvoice->id = 1;
    $sampleInvoice->posted_number = 'INV-001';
    $sampleInvoice->date = now();
    $sampleInvoice->total = 450.00;
    $sampleInvoice->total_receive = 500.00;
    $sampleInvoice->discount_amount = 50.00;
    $sampleInvoice->tax_amount = 0;
    $sampleInvoice->footer_note = '';
    $sampleInvoice->customer_id = null;
    $sampleInvoice->doctor_name = 'Dr. Ahmed Khan';
    $sampleInvoice->patient_name = 'Ali Ahmed';
    
    $user = new \stdClass();
    $user->name = 'Admin User';
    $sampleInvoice->user = $user;
    
    $customer = new \stdClass();
    $customer->name = 'John Doe';
    $customer->phone = '0300 1234567';
    $sampleInvoice->customer = $customer;
    
    // Create sample items
    $items = [];
    
    $item1 = new \stdClass();
    $product1 = new \stdClass();
    $product1->name = 'Paracetamol 500mg';
    $product1->barcode = '123456789012';
    $item1->product = $product1;
    $item1->quantity = 2;
    $item1->price = 100.00;
    $item1->sub_total = 200.00;
    $item1->item_discount_percentage = 0;
    $item1->pack_size = 1;
    $item1->batch_number = 'B001';
    $item1->expiry = '2026-12';
    $items[] = $item1;
    
    $item2 = new \stdClass();
    $product2 = new \stdClass();
    $product2->name = 'Brufen 400mg';
    $product2->barcode = '987654321098';
    $item2->product = $product2;
    $item2->quantity = 1;
    $item2->price = 150.00;
    $item2->sub_total = 150.00;
    $item2->item_discount_percentage = 0;
    $item2->pack_size = 1;
    $item2->batch_number = 'B002';
    $item2->expiry = '2026-06';
    $items[] = $item2;
    
    $item3 = new \stdClass();
    $product3 = new \stdClass();
    $product3->name = 'Vitamin C 1000mg';
    $product3->barcode = '456789123456';
    $item3->product = $product3;
    $item3->quantity = 3;
    $item3->price = 50.00;
    $item3->sub_total = 150.00;
    $item3->item_discount_percentage = 10;
    $item3->pack_size = 1;
    $item3->batch_number = 'B003';
    $item3->expiry = '2027-03';
    $items[] = $item3;
    
    $sampleInvoice->items = new \Illuminate\Support\Collection($items);
    
    $dbSetting = \Illuminate\Support\Facades\Schema::hasTable('settings') ? \App\Models\Setting::first() : null;
    $showLogo = request()->has('show_logo')
        ? request()->boolean('show_logo')
        : (bool) ($dbSetting?->share_show_logo ?? true);
    $sampleSetting = new \stdClass();
    $sampleSetting->store_name = $dbSetting?->store_name ?: 'PHARMACY STORE';
    $sampleSetting->phone_number = $dbSetting?->phone_number ?: '+92 300 1234567';
    $sampleSetting->address = $dbSetting?->address ?: '123 Main Street, City';
    $sampleSetting->logo_url = $showLogo ? ($dbSetting?->resolveLogoDataUri() ?? $dbSetting?->logo_url ?? null) : null;
    $sampleSetting->note = request()->has('note')
        ? (string) request()->query('note', '')
        : ($dbSetting ? (string) ($dbSetting->note ?? '') : 'Thank you for your business!');
    
    return view("printer.sale_invoice_a4_{$template}", [
        'invoice' => $sampleInvoice,
        'setting' => $sampleSetting,
    ]);
})->name('a4.preview');

// Document Sharing template preview route (renders the exact shared PDF template in A4 or Thermal size)
Route::get('/print/share-preview/{size}/{template}', function (string $size, string $template) {
    $validSizes = ['a4', 'thermal'];
    $validTemplates = ['standard', 'minimal', 'detailed', 'compact', 'bold', 'barcode'];

    if (!in_array($size, $validSizes, true) || !in_array($template, $validTemplates, true)) {
        abort(404, 'Preview template not found');
    }

    $sampleInvoice = new \App\Models\SaleInvoice([
        'posted_number'       => 'INV-00104',
        'date'                => now(),
        'sale_type'           => 'retail',
        'invoice_type'        => 'cash',
        'gross_amount'        => 500.00,
        'discount_amount'     => 50.00,
        'discount_percentage' => 0,
        'tax_amount'          => 0,
        'tax_percentage'      => 0,
        'total'               => 450.00,
        'total_receive'       => 450.00,
        'doctor_name'         => 'Dr. Ahmed Khan',
        'patient_name'        => 'Ali Ahmed',
        'footer_note'         => '',
    ]);
    $sampleInvoice->id = 104;

    $sampleInvoice->setRelation('user', new \App\Models\User(['name' => 'Admin User']));
    $sampleInvoice->setRelation('customer', new \App\Models\Customer([
        'name'    => 'Muhammad Usman',
        'phone'   => '0300-1234567',
        'address' => 'Model Town, Lahore',
    ]));

    $sampleItems = collect([
        (object) [
            'product'                  => (object) ['name' => 'Paracetamol 500mg Tabs', 'barcode' => '896400123456', 'product_code' => 'PRD-001', 'pack_size' => 1],
            'pack_size'                => 1,
            'quantity'                 => 2,
            'price'                    => 100.00,
            'item_discount_percentage' => 0,
            'item_discount_amount'     => 0,
            'batch_number'             => 'B-204',
            'expiry'                   => '2027-12-01',
            'sub_total'                => 200.00,
        ],
        (object) [
            'product'                  => (object) ['name' => 'Brufen 400mg Suspension', 'barcode' => '896400987654', 'product_code' => 'PRD-002', 'pack_size' => 1],
            'pack_size'                => 1,
            'quantity'                 => 1,
            'price'                    => 150.00,
            'item_discount_percentage' => 0,
            'item_discount_amount'     => 0,
            'batch_number'             => 'B-118',
            'expiry'                   => '2027-06-01',
            'sub_total'                => 150.00,
        ],
        (object) [
            'product'                  => (object) ['name' => 'Vitamin C 1000mg Sachet', 'barcode' => '896400456789', 'product_code' => 'PRD-003', 'pack_size' => 1],
            'pack_size'                => 1,
            'quantity'                 => 3,
            'price'                    => 50.00,
            'item_discount_percentage' => 10,
            'item_discount_amount'     => 15.00,
            'batch_number'             => 'B-309',
            'expiry'                   => '2028-03-01',
            'sub_total'                => 135.00,
        ],
    ]);
    $sampleInvoice->setRelation('items', $sampleItems);

    $dbSetting = \Illuminate\Support\Facades\Schema::hasTable('settings') ? \App\Models\Setting::first() : null;
    $showLogo = request()->has('show_logo')
        ? request()->boolean('show_logo')
        : (bool) ($dbSetting?->share_show_logo ?? true);

    $logoDataUri = $showLogo ? ($dbSetting?->resolveLogoDataUri() ?? $dbSetting?->logo_url ?? null) : null;

    $sampleSetting = $dbSetting ? clone $dbSetting : new \App\Models\Setting();
    $sampleSetting->store_name = $dbSetting?->store_name ?: 'KAROBAR PHARMACY & STORE';
    $sampleSetting->phone_number = $dbSetting?->phone_number ?: '+92 300 1234567';
    $sampleSetting->address = $dbSetting?->address ?: 'Main Boulevard, Commercial Market';
    $sampleSetting->license_number = $dbSetting?->license_number ?: 'LIC-99482';
    $sampleSetting->share_paper_size = $size;
    $sampleSetting->share_show_logo = $showLogo;
    $sampleSetting->note = request()->has('note')
        ? (string) request()->query('note', '')
        : ($dbSetting ? (string) ($dbSetting->note ?? '') : 'Thank you for your business!');

    $html = view('pdf.sale_invoice', [
        'invoice'          => $sampleInvoice,
        'setting'          => $sampleSetting,
        'customerTotalDue' => 0,
        'pdfDesign'        => $template,
        'paperSize'        => $size,
        'showLogo'         => $showLogo,
        'logoDataUri'      => $logoDataUri,
    ])->render();

    $previewCss = $size === 'thermal'
        ? '<style>html { background: #f1f5f9; padding: 12px 0; } body { width: 58mm; min-height: 80mm; max-width: 94%; margin: 0 auto !important; padding: 8px 7px !important; background: #ffffff; box-shadow: 0 4px 16px rgba(15,23,42,0.12); border-radius: 4px; }</style>'
        : '<style>html { background: #f1f5f9; padding: 12px; } body { max-width: 210mm; margin: 0 auto !important; padding: 18px 22px !important; background: #ffffff; box-shadow: 0 4px 16px rgba(15,23,42,0.08); border-radius: 4px; }</style>';

    $html = str_replace('</head>', $previewCss . '</head>', $html);

    return response($html)->header('Content-Type', 'text/html; charset=UTF-8');
})->name('share.preview');

// (add any other Blade/PDF routes here)
// Route::get('/reports/sale-detail/pdf', ...);

// Legal pages (Terms of Service & Privacy Policy)
Route::get('/terms-of-service', function () {
    return view('legal.document', [
        'type'  => 'terms',
        'title' => 'Terms and Conditions (End-User License Agreement)',
    ]);
})->name('legal.terms');

Route::get('/privacy-policy', function () {
    return view('legal.document', [
        'type'  => 'privacy',
        'title' => 'Privacy Policy & Data Handling Agreement',
    ]);
})->name('legal.privacy');

// --- React SPA catch-all LAST and excluding /print/* and /privacy-policy etc ---
Route::view('/{path?}', 'index')
    ->where('path', '^(?!print/|privacy-policy|terms-of-service).*$');
