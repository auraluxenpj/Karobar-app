<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Auth\MeController;
use App\Http\Controllers\AccountController;
use App\Http\Controllers\AccountingController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\BatchController;
use App\Http\Controllers\BatchExpiryController;
use App\Http\Controllers\BackupController;
use App\Http\Controllers\BrandController;
use App\Http\Controllers\BrandImportController;
use App\Http\Controllers\CashDrawerController;
use App\Http\Controllers\CategoryController;
use App\Http\Controllers\CategoryImportController;
use App\Http\Controllers\CustomerController;
use App\Http\Controllers\CustomerImportController;
use App\Http\Controllers\CustomerLedgerController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\DocumentHistoryController;
use App\Http\Controllers\ExpenseCategoryController;
use App\Http\Controllers\ExpenseController;
use App\Http\Controllers\FormulationController;
use App\Http\Controllers\HrPayrollController;
use App\Http\Controllers\InvoiceDraftController;
use App\Http\Controllers\PaymentController;
use App\Http\Controllers\LicenseController;
use App\Http\Controllers\PermissionController;
use App\Http\Controllers\ProductController;
use App\Http\Controllers\ProductImportController;
use App\Http\Controllers\PurchaseInvoiceController;
use App\Http\Controllers\PurchaseOrderController;
use App\Http\Controllers\PurchaseReturnController;
use App\Http\Controllers\ReportsController;
use App\Http\Controllers\RoleController;
use App\Http\Controllers\SaleInvoiceController;
use App\Http\Controllers\SaleReturnController;
use App\Http\Controllers\SettingController;
use App\Http\Controllers\StockAdjustmentController;
use App\Http\Controllers\StorageLocationController;
use App\Http\Controllers\SupplierController;
use App\Http\Controllers\SupplierImportController;
use App\Http\Controllers\SupplierLedgerController;
use App\Http\Controllers\ThemeSettingController;
use App\Http\Controllers\UserController;
use App\Http\Controllers\UserPreferenceController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\UserDemandController;
use App\Http\Controllers\CubeAssistantController;
use App\Http\Controllers\Api\SystemUpdateController;

/*
|--------------------------------------------------------------------------
| Public/Auth endpoints
|--------------------------------------------------------------------------
*/
Route::get('/system/version', [SystemUpdateController::class, 'version']);
Route::get('/system/check-update', [SystemUpdateController::class, 'checkUpdate']);

Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:10,1');
Route::post('/session/extend', [AuthController::class, 'extendSession'])->middleware('throttle:30,1');
Route::middleware(['auth:sanctum', 'token.expiry'])->get('/user', [AuthController::class, 'user']);
Route::middleware(['auth:sanctum', 'token.expiry'])->put('/profile', [AuthController::class, 'updateProfile']);
Route::middleware(['auth:sanctum', 'token.expiry'])->post('/logout', [AuthController::class, 'logout']);

// Password reset routes (public)
Route::post('/forgot-password', [AuthController::class, 'forgotPassword'])->middleware('throttle:10,1');
Route::post('/reset-password', [AuthController::class, 'resetPassword'])->middleware('throttle:10,1');

/*
|--------------------------------------------------------------------------
| Auth-only (NO license gate) — allow shell to render & license to activate
|--------------------------------------------------------------------------
*/
Route::middleware(['auth:sanctum', 'token.expiry'])->group(function () {
    // Password verification (for license management in settings)
    Route::post('/verify-password', [AuthController::class, 'confirmPassword'])->middleware('throttle:10,1');

    // License endpoints
    Route::get('/license/status',     [LicenseController::class, 'status']);
    Route::post('/license/activate',  [LicenseController::class, 'activate'])->middleware('throttle:10,1');
    Route::post('/license/deactivate',[LicenseController::class, 'deactivate'])->middleware('throttle:10,1'); // optional

    // Keep /me here so dashboard shell can mount pre-activation
    Route::get('/me', MeController::class);

    // Theme Settings - available before license activation (for shell rendering)
    Route::get('/theme-settings/active',          [ThemeSettingController::class, 'getActive']);

    // Sale system mode & Currency — app-wide UI gating and formatting.
    // Any authenticated user needs this to render the correct UI, so it is
    // intentionally NOT gated by license or the settings.view permission.
    Route::get('/sale-system', [SettingController::class, 'saleSystem']);
    Route::get('/currency',    [SettingController::class, 'currency']);
});

/*
|--------------------------------------------------------------------------
| Auth + Licensed — EVERYTHING ELSE is gated
|--------------------------------------------------------------------------
*/
Route::middleware(['auth:sanctum', 'licensed', 'token.expiry'])->group(function () {
    Route::post('/auth/confirm-password', [AuthController::class, 'confirmPassword'])->middleware('throttle:10,1');

// User preferences (window positions, sizes, etc.)
    Route::get('/preferences', [UserPreferenceController::class, 'index']);
    Route::put('/preferences', [UserPreferenceController::class, 'update']);
    Route::get('/preferences/{key}', [UserPreferenceController::class, 'show']);
    Route::post('/preferences/{key}', [UserPreferenceController::class, 'store']);

    // Users
    Route::post('/users/bulk-action', [UserController::class, 'bulkAction']);
    Route::resource('users', UserController::class);
    Route::put('/users/{user}/roles', [UserController::class, 'syncRoles']);
    Route::put('/users/{user}/permissions', [UserController::class, 'syncPermissions']);

    // Roles
    Route::get('/roles',          [RoleController::class, 'index']);
    Route::post('/roles',         [RoleController::class, 'store']);
    Route::get('/roles/{role}',   [RoleController::class, 'show']);
    Route::put('/roles/{role}',   [RoleController::class, 'update']);
    Route::delete('/roles/{role}',[RoleController::class, 'destroy']);

    // Permissions (single set — removed duplicate index)
    Route::get('/permissions',                     [PermissionController::class, 'index']);
    Route::post('/permissions',                    [PermissionController::class, 'store'])->middleware('permission:permission.create');
    Route::delete('/permissions/{permission}',     [PermissionController::class, 'destroy'])->middleware('permission:permission.delete');

    // Quick searches
    Route::get('/brands/search',        [BrandController::class, 'search']);
    Route::get('/categories/search',    [CategoryController::class, 'search']);
    Route::get('/suppliers/search',     [SupplierController::class, 'search']);
    Route::get('/customers/search',     [CustomerController::class, 'search']);
    Route::get('/formulations/search',  [FormulationController::class, 'search']);

    // Formulations (canonical generic/salt dictionary)
    Route::get('/formulations',         [FormulationController::class, 'index']);
    Route::post('/formulations',        [FormulationController::class, 'store']);

    // Master data
    Route::get('/categories/export', [CategoryController::class, 'export'])->name('categories.export');
    Route::apiResource('categories', CategoryController::class);

    Route::get('/brands/export', [BrandController::class, 'export'])->name('brands.export');
    Route::apiResource('brands', BrandController::class);

    Route::get('/customers/export', [CustomerController::class, 'export'])->name('customers.export');
    Route::post('/customers/send-bulk-refill-reminders', [CustomerController::class, 'sendBulkRefillReminders']);
    Route::get('/customers/{customer}/credit-summary', [CustomerController::class, 'creditSummary']);
    Route::get('/customers/{customer}/refill-reminder-preview', [CustomerController::class, 'refillReminderPreview']);
    Route::post('/customers/{customer}/send-refill-reminder', [CustomerController::class, 'sendRefillReminder']);
    Route::post('/customers/{customer}/advance-refill-cycle', [CustomerController::class, 'advanceRefillCycle']);
    Route::apiResource('customers', CustomerController::class);

    Route::get('/suppliers/export', [SupplierController::class, 'export']);
    Route::get('/suppliers/{supplier}/credit-summary', [SupplierController::class, 'creditSummary']);
    Route::apiResource('suppliers', SupplierController::class);

    // Storage Locations (Shop Counter, Main Godown, Cold Fridge, etc.)
    Route::get('storage-locations',                       [StorageLocationController::class, 'index']);
    Route::post('storage-locations',                      [StorageLocationController::class, 'store']);
    Route::put('storage-locations/{storageLocation}',     [StorageLocationController::class, 'update']);
    Route::delete('storage-locations/{storageLocation}',  [StorageLocationController::class, 'destroy']);

    // Products & batches
    Route::get('products/new-code',                [ProductController::class, 'generateNewCode']);
    Route::get('products/{product}/batches',      [BatchController::class, 'index']);
    Route::post('products/{product}/batches',     [BatchController::class, 'store']);
    Route::put('batches/{batch}',                 [BatchController::class, 'update']);
    Route::post('batches/{batch}/move-location',  [BatchController::class, 'moveLocation']);
    Route::delete('batches/{batch}',              [BatchController::class, 'destroy']);
    Route::get('products/{product}/substitutes',  [ProductController::class, 'substitutes']);
    Route::get('products/{product}/suppliers',    [ProductController::class, 'getSuppliers']);
    Route::post('products/{product}/suppliers',   [ProductController::class, 'saveSupplier']);
    Route::delete('products/{product}/suppliers/{supplierId}', [ProductController::class, 'removeSupplier']);
    Route::get('products/available-quantity',     [ProductController::class, 'availableQuantity']);
    Route::get('products/{product}/available-quantity', [ProductController::class, 'availableQuantity']);
    Route::get('/products/search',                [ProductController::class, 'search']);
    Route::get('/products/by-ids',               [ProductController::class, 'search']);
        // Optional extra endpoints (if you rely on them)
    Route::get('/products/export',                 [ProductController::class, 'export'])->middleware('can:product.export');
    Route::patch('/products/bulk-update-meta',     [ProductController::class, 'bulkUpdateMeta'])->middleware('can:product.update');
    Route::post('/products/bulk-destroy', [ProductController::class, 'bulkDestroy']);
    Route::apiResource('products', ProductController::class);

    // Purchases
    Route::get('purchase-invoices/new-code',      [PurchaseInvoiceController::class, 'generateNewCode']);
    Route::get('purchase-invoices/check-unique',  [PurchaseInvoiceController::class, 'checkUnique']);
    Route::get('purchase-invoices/search',       [PurchaseInvoiceController::class, 'search']);
    Route::post('purchase-invoices/{id}/reverse', [PurchaseInvoiceController::class, 'reverse']);
    Route::apiResource('purchase-invoices',       PurchaseInvoiceController::class);

    // Purchase returns
    Route::get('purchase-returns/new-code',       [PurchaseReturnController::class, 'generateNewCode']);
    Route::apiResource('purchase-returns',        PurchaseReturnController::class);

    // Drafts
    Route::post('invoice-drafts/{id}/post',       [InvoiceDraftController::class, 'post']);
    Route::apiResource('invoice-drafts',          InvoiceDraftController::class);

    // Sales
    Route::get('sale-invoices/new-code',          [SaleInvoiceController::class, 'generateNewCode']);
    Route::get('sale-invoices/search',            [SaleInvoiceController::class, 'search']);
    Route::get('sale-invoices/{saleInvoice}/print-url', [SaleInvoiceController::class, 'printUrl']);
    Route::post('sale-invoices/{id}/reverse',     [SaleInvoiceController::class, 'reverse']);
    Route::apiResource('sale-invoices',           SaleInvoiceController::class);

    // Document Audit History
    Route::get('/document-histories',             [DocumentHistoryController::class, 'index']);

    // Payments & Allocations (Project 3)
    Route::get('payments/open-invoices',          [PaymentController::class, 'openInvoices']);
    Route::get('payments/available-credits',      [PaymentController::class, 'availableCredits']);
    Route::post('payments/apply-credits',         [PaymentController::class, 'applyCredits']);
    Route::post('payments/{id}/allocate',         [PaymentController::class, 'allocate']);
    Route::post('payments/{id}/cheque-status',    [PaymentController::class, 'updateChequeStatus']);
    Route::post('payments/{id}/reverse',          [PaymentController::class, 'reverse']);
    Route::apiResource('payments',                PaymentController::class)->only(['index', 'show', 'store']);

    // Cash Drawer Register Management
    Route::get('cash-drawer/current',             [CashDrawerController::class, 'current']);
    Route::get('cash-drawer/session/{id}',        [CashDrawerController::class, 'show']);
    Route::post('cash-drawer/open',               [CashDrawerController::class, 'open']);
    Route::post('cash-drawer/transaction',        [CashDrawerController::class, 'recordTransaction']);
    Route::post('cash-drawer/close',              [CashDrawerController::class, 'close']);
    Route::get('cash-drawer/history',             [CashDrawerController::class, 'history']);

    // Financial Accounts & Balances
    Route::get('accounts',                        [AccountController::class, 'index']);
    Route::get('accounts/presets',                [AccountController::class, 'presets']);
    Route::post('accounts/seed-defaults',         [AccountController::class, 'seedDefaults']);
    Route::post('accounts',                       [AccountController::class, 'store']);
    Route::put('accounts/{id}',                   [AccountController::class, 'update']);
    Route::delete('accounts/{id}',                [AccountController::class, 'destroy']);
    Route::get('accounts/{id}/transactions',      [AccountController::class, 'transactions']);
    Route::post('accounts/transfer',              [AccountController::class, 'transfer']);
    Route::post('accounts/{id}/adjust',           [AccountController::class, 'adjust']);

    // Double-Entry Accounting, Chart of Accounts, Journal Vouchers & Statutory Tax Rates
    Route::get('accounting/overview',                               [AccountingController::class, 'overview']);
    Route::get('accounting/chart-of-accounts',                      [AccountingController::class, 'chartOfAccounts']);
    Route::post('accounting/chart-of-accounts',                     [AccountingController::class, 'storeAccount']);
    Route::put('accounting/chart-of-accounts/{chartOfAccount}',     [AccountingController::class, 'updateAccount']);
    Route::get('accounting/journal-entries',                        [AccountingController::class, 'journalEntries']);
    Route::post('accounting/journal-entries',                       [AccountingController::class, 'storeJournalEntry']);
    Route::post('accounting/journal-entries/{journalEntry}/reverse',[AccountingController::class, 'reverseJournalEntry']);
    Route::get('accounting/tax-rates',                              [AccountingController::class, 'taxRates']);
    Route::post('accounting/tax-rates',                             [AccountingController::class, 'storeTaxRate']);
    Route::put('accounting/tax-rates/{taxRate}',                    [AccountingController::class, 'updateTaxRate']);
    Route::delete('accounting/tax-rates/{taxRate}',                 [AccountingController::class, 'destroyTaxRate']);

    // Operating Expenses & Categories
    Route::get('expenses/summary',                [ExpenseController::class, 'summary']);
    Route::post('expenses/process-recurring',     [ExpenseController::class, 'processRecurring']);
    Route::get('expenses/{expense}/receipt',      [ExpenseController::class, 'receipt']);
    Route::apiResource('expenses',                ExpenseController::class);
    Route::apiResource('expense-categories',      ExpenseCategoryController::class);

    // Human Resources (HR), Attendance, Staff Advances, Payroll & Sales Commissions
    Route::get('hr/overview',                           [HrPayrollController::class, 'overview']);
    Route::get('hr/employees/new-code',                 [HrPayrollController::class, 'newEmployeeCode']);
    Route::get('hr/employees',                          [HrPayrollController::class, 'employees']);
    Route::post('hr/employees',                         [HrPayrollController::class, 'storeEmployee']);
    Route::put('hr/employees/{employee}',               [HrPayrollController::class, 'updateEmployee']);
    Route::delete('hr/employees/{employee}',            [HrPayrollController::class, 'destroyEmployee']);
    Route::get('hr/attendance',                         [HrPayrollController::class, 'attendance']);
    Route::post('hr/attendance',                        [HrPayrollController::class, 'saveAttendance']);
    Route::post('hr/attendance/bulk',                   [HrPayrollController::class, 'saveBulkAttendance']);
    Route::get('hr/advances',                           [HrPayrollController::class, 'advances']);
    Route::post('hr/advances',                          [HrPayrollController::class, 'storeAdvance']);
    Route::get('hr/commissions',                        [HrPayrollController::class, 'commissions']);
    Route::get('hr/payroll-runs',                       [HrPayrollController::class, 'payrollRuns']);
    Route::post('hr/payroll-runs/generate',             [HrPayrollController::class, 'generatePayrollRun']);
    Route::put('hr/payroll-items/{payrollItem}',        [HrPayrollController::class, 'updatePayrollItem']);
    Route::post('hr/payroll-items/{payrollItem}/pay',   [HrPayrollController::class, 'payPayrollItem']);
    Route::post('hr/payroll-runs/{payrollRun}/pay-all', [HrPayrollController::class, 'payAllInRun']);

    // Sale returns
    Route::get('sale-returns/new-code',           [SaleReturnController::class, 'generateNewCode']);
    Route::apiResource('sale-returns',            SaleReturnController::class);

    // Purchase Orders
    Route::get('/purchase-orders/forecast',       [PurchaseOrderController::class, 'forecast']);
    Route::get('/purchase-orders/supplier-sort-order/{supplier}', [PurchaseOrderController::class, 'supplierSortOrder']);
    Route::post('/purchase-orders/{purchaseOrder}/receive', [PurchaseOrderController::class, 'receive']);
    Route::post('/purchase-orders/{purchaseOrder}/cancel', [PurchaseOrderController::class, 'cancel']);
    Route::apiResource('purchase-orders', PurchaseOrderController::class);

// Dashboard
    Route::get('/dashboard/summary',              [DashboardController::class, 'summary']);
    Route::get('/dashboard/near-expiry',          [DashboardController::class, 'nearExpiry']);
    Route::get('/dashboard/near-expiry/filters',  [DashboardController::class, 'nearExpiryFilters']);
    Route::get('/dashboard/invoice-counts',       [DashboardController::class, 'invoiceCounts']);
    Route::get('/dashboard/sales-by-brands',      [DashboardController::class, 'salesByBrands']);
    Route::get('/dashboard/sales-by-category',    [DashboardController::class, 'salesByCategory']);
    Route::get('/dashboard/top-products',         [DashboardController::class, 'topProducts']);
    Route::get('/dashboard/kpi-metrics',          [DashboardController::class, 'kpiMetrics']);

// Notifications
    Route::get('/notifications/low-stock',        [NotificationController::class, 'lowStock']);
    Route::get('/notifications/expiry-alerts',    [BatchExpiryController::class, 'expiryAlerts']);
    Route::post('/notifications/dismiss',         [NotificationController::class, 'dismiss']);
    Route::post('/notifications/dismiss-all',     [NotificationController::class, 'dismissAll']);
    Route::post('/notifications/ack-demand',      [NotificationController::class, 'ackDemand']);

    // Batch Expiry Tracking & Warning System
    Route::get('/batch-expiry',                           [BatchExpiryController::class, 'index']);
    Route::put('/batch-expiry/product-warning/{product}', [BatchExpiryController::class, 'updateProductWarning']);
    Route::put('/batch-expiry/global-warning',            [BatchExpiryController::class, 'updateGlobalWarning']);

    // User Demands
    Route::get('/user-demands/count',             [UserDemandController::class, 'count']);
    Route::apiResource('user-demands',            UserDemandController::class);

    // Reports
    Route::get('/reports/cost-of-sale',           [ReportsController::class, 'costOfSale']);
    Route::get('/reports/cost-of-sale/pdf',       [ReportsController::class, 'costOfSalePdf']);
    Route::get('/reports/cost-of-sale-detail',    [ReportsController::class, 'costOfSaleDetail']);
    Route::get('/reports/cost-of-sale-detail/pdf', [ReportsController::class, 'costOfSaleDetailPdf']);
    Route::get('/reports/purchase-detail',        [ReportsController::class, 'purchaseDetail']);
    Route::get('/reports/purchase-detail/pdf',    [ReportsController::class, 'purchaseDetailPdf']);
    Route::get('/reports/sale-detail',            [ReportsController::class, 'saleDetail']);
    Route::get('/reports/sale-detail/pdf',        [ReportsController::class, 'saleDetailPdf']);
    Route::get('/reports/current-stock',          [ReportsController::class, 'currentStock']);
    Route::get('/reports/current-stock/pdf',      [ReportsController::class, 'currentStockPdf']);
    Route::get('/reports/stock-adjustment',       [ReportsController::class, 'stockAdjustment']);
    Route::get('/reports/stock-adjustment/pdf',   [ReportsController::class, 'stockAdjustmentPdf']);
    Route::get('/reports/product-comprehensive',  [ReportsController::class, 'productComprehensive']);
    Route::get('/reports/product-comprehensive/pdf', [ReportsController::class, 'productComprehensivePdf']);
    Route::get('/reports/near-expiry-product',     [ReportsController::class, 'nearExpiryProduct']);
    Route::get('/reports/near-expiry-product/pdf', [ReportsController::class, 'nearExpiryProductPdf']);
    Route::get('/reports/purchase-returns',        [ReportsController::class, 'purchaseReturns']);
    Route::get('/reports/purchase-returns/pdf',    [ReportsController::class, 'purchaseReturnsPdf']);
    Route::get('/reports/sale-returns',            [ReportsController::class, 'saleReturns']);
    Route::get('/reports/sale-returns/pdf',        [ReportsController::class, 'saleReturnsPdf']);
    Route::get('/reports/purchase-summary',        [ReportsController::class, 'purchaseSummary']);
    Route::get('/reports/purchase-summary/pdf',    [ReportsController::class, 'purchaseSummaryPdf']);
    Route::get('/reports/outstanding-aging',       [ReportsController::class, 'outstandingAging']);
    Route::get('/reports/outstanding-aging/pdf',   [ReportsController::class, 'outstandingAgingPdf']);
    Route::get('/reports/overdue-work-queue',      [ReportsController::class, 'overdueWorkQueue']);
    Route::get('/reports/overdue-work-queue/pdf',  [ReportsController::class, 'overdueWorkQueuePdf']);
    Route::get('/reports/reorder',                 [ReportsController::class, 'reorderReport']);
    Route::get('/reports/reorder/pdf',             [ReportsController::class, 'reorderReportPdf']);
    Route::get('/reports/net-profit',              [ReportsController::class, 'netProfit']);
    Route::get('/reports/net-profit/pdf',          [ReportsController::class, 'netProfitPdf']);
    Route::get('/reports/tax-return',              [ReportsController::class, 'taxReturn']);
    Route::get('/reports/tax-return/pdf',          [ReportsController::class, 'taxReturnPdf']);
    Route::get('/reports/financial-statements/pdf',[ReportsController::class, 'financialStatementsPdf']);
    Route::put('/sale-invoices/{saleInvoice}/meta',[SaleInvoiceController::class, 'updateMeta']);


    // Settings & First-Login Genie Setup Wizard
    Route::get('/setup/state',                           [SettingController::class, 'setupState']);
    Route::post('/setup/complete',                       [SettingController::class, 'completeSetup']);
    Route::get('/settings',                              [SettingController::class, 'show']);
    Route::post('/settings',                             [SettingController::class, 'update']);
    Route::post('/settings/test-smtp',                   [SettingController::class, 'testSmtp']);
    Route::post('/settings/test-whatsapp',               [SettingController::class, 'testWhatsApp']);
    Route::get('/settings/whatsapp-agent/status',        [SettingController::class, 'whatsappAgentStatus']);
    Route::post('/settings/whatsapp-agent/start',        [SettingController::class, 'whatsappAgentStart']);
    Route::post('/settings/whatsapp-agent/pair-code',    [SettingController::class, 'whatsappAgentPairCode']);
    Route::post('/settings/whatsapp-agent/logout',       [SettingController::class, 'whatsappAgentLogout']);
    Route::post('/settings/whatsapp-agent/stop',         [SettingController::class, 'whatsappAgentStop']);
    Route::post('/settings/test-cube-ai',                [SettingController::class, 'testCubeAi']);

    // Theme Settings (CRUD operations require license)
    Route::put('/theme-settings/active',          [ThemeSettingController::class, 'updateActive']);
    Route::get('/theme-settings',                 [ThemeSettingController::class, 'index']);
    Route::get('/theme-settings/{id}',            [ThemeSettingController::class, 'show']);
    Route::post('/theme-settings',                [ThemeSettingController::class, 'store']);
    Route::put('/theme-settings/{id}',            [ThemeSettingController::class, 'update']);
    Route::put('/theme-settings/{id}/activate',  [ThemeSettingController::class, 'activate']);
    Route::delete('/theme-settings/{id}',        [ThemeSettingController::class, 'destroy']);

    // Backups & Storage Destination
    Route::get('/backups/stats',                  [BackupController::class, 'stats']);
    Route::get('/backups/schedule',               [BackupController::class, 'getSchedule']);
    Route::post('/backups/schedule',              [BackupController::class, 'updateSchedule']);
    Route::post('/backups/test-destination',      [BackupController::class, 'testDestination']);
    Route::get('/backups/browse-directories',     [BackupController::class, 'browseDirectories']);
    Route::post('/backups/create-directory',      [BackupController::class, 'createDirectory']);
    Route::post('/backups/run-now',               [BackupController::class, 'runScheduledNow']);
    Route::get('/backups',                        [BackupController::class, 'index']);
    Route::post('/backups',                       [BackupController::class, 'store']);
    Route::get('/backups/{id}/download',          [BackupController::class, 'download']);
    Route::post('/backups/{id}/restore',          [BackupController::class, 'restore'])->middleware('throttle:10,1');
    Route::delete('/backups/{id}',                [BackupController::class, 'destroy']);
    Route::post('/backups/upload/validate',       [BackupController::class, 'validateUpload']);
    Route::post('/backups/upload',                [BackupController::class, 'upload']);
    Route::post('/backups/upload/restore',        [BackupController::class, 'restoreFromUpload'])->middleware('throttle:10,1');

    // Supplier Import
    Route::get('/suppliers/import/template',      [SupplierImportController::class, 'template'])->middleware('permission:supplier.import');
    Route::post('/suppliers/import/validate',     [SupplierImportController::class, 'validateUpload'])->middleware('permission:supplier.import');
    Route::post('/suppliers/import/commit',       [SupplierImportController::class, 'commit'])->middleware('permission:supplier.import');

    // Brands import
    Route::get('/brands/import/template',         [BrandImportController::class, 'template'])->middleware('permission:brand.import');
    Route::post('/brands/import/validate',        [BrandImportController::class, 'validateUpload'])->middleware('permission:brand.import');
    Route::post('/brands/import/commit',          [BrandImportController::class, 'commit'])->middleware('permission:brand.import');

    // Categories import
    Route::get('/categories/import/template',     [CategoryImportController::class, 'template'])->middleware('permission:category.import');
    Route::post('/categories/import/validate',    [CategoryImportController::class, 'validateUpload'])->middleware('permission:category.import');
    Route::post('/categories/import/commit',      [CategoryImportController::class, 'commit'])->middleware('permission:category.import');

    // Customers import
    Route::get('/customers/import/template',      [CustomerImportController::class, 'template'])->middleware('permission:customer.import');
    Route::post('/customers/import/validate',     [CustomerImportController::class, 'validateUpload'])->middleware('permission:customer.import');
    Route::post('/customers/import/commit',       [CustomerImportController::class, 'commit'])->middleware('permission:customer.import');

    // Customer wholesale prices
    Route::get('/customers/{customerId}/whole-sale-prices', function (Request $request, $customerId) {
        $user = $request->user();
        if (!$user || (!$user->hasRole(['Admin', 'admin', 'super-admin']) && !$user->can('customer.view') && !$user->can('sale-invoice.create'))) {
            abort(403, 'This action is unauthorized.');
        }
        $prices = \App\Models\CustomerWholeSalePrice::with('product:id,name,product_code,pack_size,whole_sale_pack_price,whole_sale_unit_price,unit_sale_price,pack_sale_price')
            ->where('customer_id', $customerId)
            ->orderByDesc('id')
            ->get();
        return response()->json($prices);
    });
    Route::post('/customers/{customerId}/whole-sale-prices', function (Request $request, $customerId) {
        $user = $request->user();
        if (!$user || (!$user->hasRole(['Admin', 'admin', 'super-admin']) && !$user->can('customer.update') && !$user->can('customer.create'))) {
            abort(403, 'This action is unauthorized.');
        }
        \App\Models\Customer::findOrFail($customerId);
        $validated = $request->validate([
            'product_id' => 'required|integer|exists:products,id',
            'pack_price' => 'required|numeric|min:0',
        ]);
        $price = \App\Models\CustomerWholeSalePrice::updateOrCreate(
            [
                'customer_id' => (int) $customerId,
                'product_id'  => (int) $validated['product_id'],
            ],
            [
                'pack_price'  => round((float) $validated['pack_price'], 2),
            ]
        );
        return response()->json(
            $price->load('product:id,name,product_code,pack_size,whole_sale_pack_price,whole_sale_unit_price,unit_sale_price,pack_sale_price'),
            201
        );
    });
    Route::delete('/customers/{customerId}/whole-sale-prices/{priceId}', function (Request $request, $customerId, $priceId) {
        $user = $request->user();
        if (!$user || (!$user->hasRole(['Admin', 'admin', 'super-admin']) && !$user->can('customer.update') && !$user->can('customer.delete'))) {
            abort(403, 'This action is unauthorized.');
        }
        $price = \App\Models\CustomerWholeSalePrice::where('customer_id', $customerId)
            ->where('id', $priceId)
            ->firstOrFail();
        $price->delete();
        return response()->json(['message' => 'Custom wholesale price removed']);
    });

    // Product import
    Route::get('/products/import/template',       [ProductImportController::class, 'template'])->middleware('permission:product.import');
    Route::post('/products/import/validate',      [ProductImportController::class, 'validateUpload'])->middleware('permission:product.import');
    Route::post('/products/import/commit',        [ProductImportController::class, 'commit'])->middleware('permission:product.import');

    // Stock Adjustments (immutable audit records — no update endpoint)
    Route::get('/stock-adjustments',              [StockAdjustmentController::class, 'index']);
    Route::post('/stock-adjustments',             [StockAdjustmentController::class, 'store']);
    Route::get('/stock-adjustments/new-code',     [StockAdjustmentController::class, 'newCode']);
    Route::get('/stock-adjustments/{id}',         [StockAdjustmentController::class, 'show']);
    Route::delete('/stock-adjustments/{id}',      [StockAdjustmentController::class, 'destroy']);

    // Supplier Ledger
    Route::get('/supplier-ledger',                [SupplierLedgerController::class, 'index']);
    Route::get('/supplier-ledger/print-url',      [SupplierLedgerController::class, 'printUrl']);
    Route::post('/supplier-ledger',               [SupplierLedgerController::class, 'store']);
    Route::put('/supplier-ledger/bulk',           [SupplierLedgerController::class, 'bulkUpdate']);
    Route::delete('/supplier-ledger/{id}',        [SupplierLedgerController::class, 'destroy']);
    Route::post('/supplier-ledger/rebuild',       [SupplierLedgerController::class, 'rebuild']);
    Route::post('/supplier-ledger/settle-invoice',[SupplierLedgerController::class, 'settleInvoice']);

    // Customer Ledger
    Route::get('/customer-ledger',                [CustomerLedgerController::class, 'index']);
    Route::get('/customer-ledger/print-url',      [CustomerLedgerController::class, 'printUrl']);
    Route::post('/customer-ledger',               [CustomerLedgerController::class, 'store']);
    Route::put('/customer-ledger/bulk',           [CustomerLedgerController::class, 'bulkUpdate']);
    Route::delete('/customer-ledger/{customerLedger}', [CustomerLedgerController::class, 'destroy']);
    Route::post('/customer-ledger/rebuild',       [CustomerLedgerController::class, 'rebuild']);
    Route::post('/customer-ledger/settle-invoice', [CustomerLedgerController::class, 'settleInvoice']);

    // Barcode Designer & Label Printing
    Route::get('/barcodes/templates',              [\App\Http\Controllers\BarcodeController::class, 'getTemplates']);
    Route::post('/barcodes/templates',             [\App\Http\Controllers\BarcodeController::class, 'saveTemplate']);
    Route::put('/barcodes/templates/{id}',         [\App\Http\Controllers\BarcodeController::class, 'updateTemplate']);
    Route::delete('/barcodes/templates/{id}',      [\App\Http\Controllers\BarcodeController::class, 'deleteTemplate']);
    Route::get('/barcodes/products-search',        [\App\Http\Controllers\BarcodeController::class, 'searchProducts']);
    Route::get('/barcodes/purchase-orders',        [\App\Http\Controllers\BarcodeController::class, 'getPurchaseOrders']);
    Route::get('/barcodes/purchase-invoices',      [\App\Http\Controllers\BarcodeController::class, 'getPurchaseInvoices']);
    Route::get('/barcodes/scan',                   [\App\Http\Controllers\BarcodeController::class, 'scanProduct']);

    // -------------------------------------------------------------------------
    // Stocktake Sessions (Physical Cycle Count & Blind Audits)
    // -------------------------------------------------------------------------
    Route::get('/stocktake-sessions/new-code',          [\App\Http\Controllers\StocktakeController::class, 'newCode']);
    Route::get('/stocktake-sessions',                   [\App\Http\Controllers\StocktakeController::class, 'index']);
    Route::post('/stocktake-sessions',                  [\App\Http\Controllers\StocktakeController::class, 'store']);
    Route::get('/stocktake-sessions/{id}',              [\App\Http\Controllers\StocktakeController::class, 'show']);
    Route::delete('/stocktake-sessions/{id}',           [\App\Http\Controllers\StocktakeController::class, 'destroy']);
    Route::patch('/stocktake-sessions/{id}/start',      [\App\Http\Controllers\StocktakeController::class, 'start']);
    Route::patch('/stocktake-sessions/{id}/submit-review', [\App\Http\Controllers\StocktakeController::class, 'submitForReview']);
    Route::post('/stocktake-sessions/{id}/finalize',    [\App\Http\Controllers\StocktakeController::class, 'finalize']);
    Route::patch('/stocktake-sessions/{id}/cancel',     [\App\Http\Controllers\StocktakeController::class, 'cancel']);
    Route::get('/stocktake-sessions/{id}/items',        [\App\Http\Controllers\StocktakeController::class, 'items']);
    Route::post('/stocktake-sessions/{id}/items',       [\App\Http\Controllers\StocktakeController::class, 'addItem']);
    Route::patch('/stocktake-items/{item}',             [\App\Http\Controllers\StocktakeController::class, 'recordCount']);

    // -------------------------------------------------------------------------
    // Outbound Document Sharing (WhatsApp & Email PDF)
    // -------------------------------------------------------------------------
    Route::get('/share/metadata',  [\App\Http\Controllers\DocumentShareController::class, 'metadata']);
    Route::get('/share/pdf',       [\App\Http\Controllers\DocumentShareController::class, 'pdf']);
    Route::post('/share/email',    [\App\Http\Controllers\DocumentShareController::class, 'sendEmail']);
    Route::post('/share/whatsapp', [\App\Http\Controllers\DocumentShareController::class, 'sendWhatsApp']);

    // -------------------------------------------------------------------------
    // Quarantine & Scrap Stock Disposals
    // -------------------------------------------------------------------------
    Route::get('/stock-disposals/new-code',         [\App\Http\Controllers\StockDisposalController::class, 'newCode']);
    Route::get('/stock-disposals',                  [\App\Http\Controllers\StockDisposalController::class, 'index']);
    Route::post('/stock-disposals',                 [\App\Http\Controllers\StockDisposalController::class, 'store']);
    Route::get('/stock-disposals/{id}',             [\App\Http\Controllers\StockDisposalController::class, 'show']);
    Route::post('/stock-disposals/{id}/dispose',    [\App\Http\Controllers\StockDisposalController::class, 'dispose']);
    Route::post('/stock-disposals/{id}/restore',    [\App\Http\Controllers\StockDisposalController::class, 'restore']);

    // -------------------------------------------------------------------------
    // Cube Hybrid AI Assistant (Free-Quota Only) & Non-Destructive Task Runner
    // -------------------------------------------------------------------------
    Route::post('/cube/ask', [CubeAssistantController::class, 'ask'])->middleware('throttle:30,1');
    Route::post('/cube/execute-task', [CubeAssistantController::class, 'executeTask'])->middleware('throttle:60,1');
});
