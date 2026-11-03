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
    $sampleSetting = new \stdClass();
    $sampleSetting->store_name = $dbSetting?->store_name ?: 'PHARMACY STORE';
    $sampleSetting->phone_number = $dbSetting?->phone_number ?: '+92 300 1234567';
    $sampleSetting->address = $dbSetting?->address ?: '123 Main Street, City';
    $sampleSetting->logo_url = $dbSetting?->logo_url ?? null;
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
    $sampleSetting = new \stdClass();
    $sampleSetting->store_name = $dbSetting?->store_name ?: 'PHARMACY STORE';
    $sampleSetting->phone_number = $dbSetting?->phone_number ?: '+92 300 1234567';
    $sampleSetting->address = $dbSetting?->address ?: '123 Main Street, City';
    $sampleSetting->logo_url = $dbSetting?->logo_url ?? null;
    $sampleSetting->note = request()->has('note')
        ? (string) request()->query('note', '')
        : ($dbSetting ? (string) ($dbSetting->note ?? '') : 'Thank you for your business!');
    
    return view("printer.sale_invoice_a4_{$template}", [
        'invoice' => $sampleInvoice,
        'setting' => $sampleSetting,
    ]);
})->name('a4.preview');

// (add any other Blade/PDF routes here)
// Route::get('/reports/sale-detail/pdf', ...);

// --- React SPA catch-all LAST and excluding /print/* and /privacy-policy etc ---
Route::view('/{path?}', 'index')
    ->where('path', '^(?!print/|privacy-policy|terms-of-service).*$');
