<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

class RolesAndPermissionsSeeder extends Seeder
{
    public function run(): void
    {
        app()[\Spatie\Permission\PermissionRegistrar::class]->forgetCachedPermissions();

        $guard = 'sanctum';

        // ---- Keep your existing custom perms ----
        $baseCustom = [
            // Users
            'user.view','user.create','user.update','user.delete',
            'user.assign.roles','user.assign.permissions','user.manage',
            // Roles
            'role.view','role.create','role.update','role.delete','role.sync.permissions',
            // Permissions registry
            'permission.view','permission.create','permission.delete',
            // Legacy product/invoice (kept for compatibility if used anywhere)
            'product.view','product.create','product.update','product.delete',
            'invoice.view','invoice.create','invoice.update','invoice.delete',

            // Ledgers
            'customer-ledger.view','customer-ledger.create','customer-ledger.update','customer-ledger.delete',
            'supplier-ledger.view','supplier-ledger.create','supplier-ledger.update','supplier-ledger.delete',

// Purchase Order Forecast
            'purchase-order.view','purchase-order.generate',
            'purchase-order.create','purchase-order.update','purchase-order.cancel','purchase-order.delete',

            // User Demands
            'user-demands.view','user-demands.create','user-demands.update','user-demands.delete',

            // Reports
            'report.cost-of-sale.view', 'report.cost-of-sale.export',
            'report.cost-of-sale-detail.view', 'report.cost-of-sale-detail.export',
            'report.net-profit.view', 'report.net-profit.export',
            'report.purchase-detail.view', 'report.purchase-detail.export',
            'report.purchase-summary.view', 'report.purchase-summary.export',
            'report.purchase-returns.view', 'report.purchase-returns.export',
            'report.sale-detail.view', 'report.sale-detail.export', 'report.sale-detail.edit',
            'report.sale-returns.view', 'report.sale-returns.export',
            'report.current-stock.view', 'report.current-stock.export',
            'report.reorder.view', 'report.reorder.export',
            'report.stock-adjustment.view', 'report.stock-adjustment.export',
            'report.product-comprehensive.view', 'report.product-comprehensive.export',
            'report.near-expiry-product.view', 'report.near-expiry-product.export',
            'report.outstanding-aging.view', 'report.outstanding-aging.export',

            // Barcode Studio / Label Generator & Barcode POS & Batch Expiry Tracking
            'barcode.view', 'barcode.print', 'barcode.create', 'barcode.update', 'barcode.delete',
            'barcode-pos.view', 'barcode-pos.create',
            'batch-expiry.view', 'batch-expiry.update',

            // Financial Accounts, Cash Drawer, Expenses, Payments, HR & POS Overrides
            'account.view', 'account.create', 'account.update', 'account.delete', 'account.transfer', 'account.adjust',
            'cash-drawer.view', 'cash-drawer.open', 'cash-drawer.transaction', 'cash-drawer.close',
            'expense.view', 'expense.create', 'expense.update', 'expense.delete',
            'payment.view', 'payment.create', 'payment.update', 'payment.delete',
            'hr.view', 'hr.manage',
            'storage-location.view', 'tax.view', 'report.tax-return.view', 'report.tax-return.export',
            'stocktake.view', 'stocktake.create', 'stocktake.update', 'stocktake.delete', 'stocktake.finalize',
            'sale-invoice.credit-override', 'sale-invoice.discount-override', 'sale-invoice.expired-override',
        ];

        // ---- Domain modules & standard actions ----
        // CRUD + export/import for master data
        $masterModules = ['category','brand','supplier','product','customer'];
        $masterActions = ['view','create','update','delete','export','import'];

        // Documents (invoices/returns) – CRUD (+ export if you plan CSV/PDF dumps)
        $docModules = [
            'sale-invoice',
            'purchase-invoice',
            'sale-return',
            'purchase-return',
        ];
        $docActions = ['view','create','update','delete','export'];

        // Stock Adjustment – CRUD
        $stockModules = ['stock-adjustment'];
        $stockActions = ['view','create','update','delete'];

        // Stock Disposal & Quarantine
        $disposalPerms = [
            'stock-disposal.view',
            'stock-disposal.create',
            'stock-disposal.dispose',
            'stock-disposal.restore',
            'stock-disposal.delete',
        ];

        // Settings – usually view/update only
        $settingsModules = ['settings'];
        $settingsActions = ['view','update'];

        // Backup System
        $backupModules = ['backup'];
        $backupActions = ['view','create','restore','delete','upload'];

        // Build final list
        $perms = [];

        foreach ($baseCustom as $p) $perms[] = $p;

        foreach ($masterModules as $m) {
            foreach ($masterActions as $a) $perms[] = "{$m}.{$a}";
        }

        foreach ($docModules as $m) {
            foreach ($docActions as $a) $perms[] = "{$m}.{$a}";
        }

        foreach ($stockModules as $m) {
            foreach ($stockActions as $a) $perms[] = "{$m}.{$a}";
        }

        foreach ($disposalPerms as $p) $perms[] = $p;

        foreach ($settingsModules as $m) {
            foreach ($settingsActions as $a) $perms[] = "{$m}.{$a}";
        }

        foreach ($backupModules as $m) {
            foreach ($backupActions as $a) $perms[] = "{$m}.{$a}";
        }

        // Create if missing
        foreach (array_unique($perms) as $name) {
            Permission::firstOrCreate(['name' => $name, 'guard_name' => $guard]);
        }

        // Ensure Admin role exists and has everything
        $admin = Role::firstOrCreate(['name' => 'Admin', 'guard_name' => $guard]);
        $admin->syncPermissions(Permission::where('guard_name', $guard)->pluck('name')->all());

        app()[\Spatie\Permission\PermissionRegistrar::class]->forgetCachedPermissions();
    }
}
