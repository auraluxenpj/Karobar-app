<?php

namespace App\Console\Commands;

use App\Models\Setting;
use App\Models\User;
use App\Services\LicenseService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Database\Seeders\ThemeSettingSeeder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

class KarobarInstallCommand extends Command
{
    protected $signature = 'karobar:install
                            {--seal-file= : Path to verified install-license.seal file from Inno Setup}
                            {--license-key= : Direct license key string to activate}
                            {--admin-config= : Path to JSON file with admin name, email, and password from Inno Setup}
                            {--import-sqlite= : Optional path to an existing Herd/Karobar SQLite database to import (clears only users & license)}
                            {--upgrade-only : Perform a zero-data-loss in-place software upgrade (backs up DB, runs new migrations & permissions, preserves all users, license & data)}
                            {--admin-name=Store Administrator : Initial Admin full name}
                            {--admin-email=admin@example.com : Initial Admin email address}
                            {--admin-password=password : Initial Admin password}
                            {--accept-legal : Record Terms & Conditions and Privacy Policy acceptance timestamps}
                            {--legal-version=2.0 : Version identifier for accepted Terms & Privacy Policy}
                            {--allow-unbound : Allow unbound license keys during installation}
                            {--skip-migrate : Skip running database migrations}
                            {--cleanup-temp : Delete temporary --seal-file and --admin-config files after installation}
                            {--json : Output result as JSON}';

    protected $description = 'Bootstrap a fresh or upgraded Karobar-App Windows desktop installation (DB, roles, admin account, hardware-bound license, and Genie setup state)';

    public function handle(LicenseService $licenseService): int
    {
        // 1. Ensure SQLite database file exists when using file-backed SQLite
        if (!app()->runningUnitTests()) {
            $this->ensureEnvironmentAndDatabaseFile();
        }

        $adminData = $this->resolveAdminCredentials();
        $isUpgradeOnly = (bool) $this->option('upgrade-only') || !empty($adminData['upgrade_only']);

        // 1.2. If performing an in-place upgrade over an existing installation, create a pre-upgrade SQLite backup first
        if ($isUpgradeOnly && !app()->runningUnitTests()) {
            $this->createPreUpgradeSafetyBackup();
        }

        // 1.5. Check if the user selected an existing Herd SQLite database to import during installation
        $importSqlitePath = $isUpgradeOnly ? '' : $this->resolveImportSqlitePath($adminData);
        $importedExistingDb = false;

        if ($importSqlitePath !== '') {
            [$importOk, $importErr] = $this->importExistingSqliteFile($importSqlitePath);
            if (!$importOk) {
                return $this->failInstall($importErr ?: "Failed to import SQLite database from: {$importSqlitePath}");
            }
            $importedExistingDb = true;
        }

        // 2. Run database migrations (safely adds any new v2 tables/columns to imported, upgraded, or fresh DB)
        if (!$this->option('skip-migrate')) {
            Artisan::call('migrate', ['--force' => true]);
        }

        // 2.5. If an existing Herd SQLite database was imported, clear ONLY Users and License records while keeping all store data intact
        if ($importedExistingDb) {
            $this->clearUsersAndLicensesOnly();
        }

        // 3. Seed essential Roles/Permissions & Theme presets (no dummy customers/products)
        app(PermissionRegistrar::class)->forgetCachedPermissions();
        Artisan::call('db:seed', ['--class' => RolesAndPermissionsSeeder::class, '--force' => true]);
        if (class_exists(ThemeSettingSeeder::class)) {
            Artisan::call('db:seed', ['--class' => ThemeSettingSeeder::class, '--force' => true]);
        }
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        // 3.5. If --upgrade-only and an Admin user already exists, preserve all existing users, license, and settings untouched!
        if ($isUpgradeOnly && User::query()->exists()) {
            if ($this->option('cleanup-temp')) {
                $this->cleanupTempFiles();
            }
            $firstAdmin = User::query()->first();
            $setting = Setting::first();
            $result = [
                'ok'                 => true,
                'upgraded'           => true,
                'admin_email'        => $firstAdmin?->email,
                'admin_name'         => $firstAdmin?->name,
                'machine_id'         => $licenseService->computeMachineId(),
                'licensed'           => $licenseService->currentStatus()['valid'] ?? false,
                'store_name'         => $setting?->store_name,
                'is_setup_completed' => (bool) ($setting?->is_setup_completed ?? true),
            ];
            if ($this->option('json')) {
                $this->line(json_encode($result, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
            } else {
                $this->info('Karobar-App upgraded in-place with zero data loss.');
            }
            return self::SUCCESS;
        }

        // 4. Resolve and create the initial Administrator account chosen during the .exe installer wizard
        $adminEmail = strtolower(trim($adminData['email']));
        $adminName = trim($adminData['name']) ?: 'Store Administrator';
        $adminPassword = (string) $adminData['password'];

        if (!filter_var($adminEmail, FILTER_VALIDATE_EMAIL)) {
            return $this->failInstall("Invalid Administrator email address: {$adminEmail}");
        }
        if (strlen($adminPassword) < 6) {
            return $this->failInstall('Administrator password must be at least 6 characters.');
        }

        $adminRole = Role::firstOrCreate(['name' => 'Admin', 'guard_name' => 'sanctum']);

        $adminUser = User::updateOrCreate(
            ['email' => $adminEmail],
            [
                'name'     => $adminName,
                'password' => Hash::make($adminPassword),
                'status'   => 'active',
            ]
        );
        $adminUser->syncRoles([$adminRole]);
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        // 5. Activate & seal the hardware-bound license key if provided
        $licenseKey = $this->resolveLicenseKey();
        $activatedPayload = null;

        if ($licenseKey !== '') {
            $requireMachineBinding = !$this->option('allow-unbound');
            [$ok, $payload, $reason] = $licenseService->activateLicenseKey($licenseKey, $requireMachineBinding);
            if (!$ok) {
                return $this->failInstall('License activation failed during installation: ' . ($reason ?: 'Invalid license'));
            }
            $activatedPayload = $payload;
        }

        // 6. Initialize Settings row and trigger first-login Genie Setup Wizard (/setup)
        $setting = Setting::firstOrCreate(['id' => 1], [
            'printer_type'            => 'thermal',
            'thermal_template'        => 'standard',
            'a4_template'             => 'standard',
            'share_paper_size'        => 'a4',
            'share_show_logo'         => true,
            'navigation_style'        => 'sidebar',
            'sale_system'             => 'retail_wholesale',
            'shop_type'               => 'pharmacy',
            'currency_code'           => 'PKR',
            'currency_symbol'         => 'Rs.',
            'currency_position'       => 'before',
            'currency_decimal_places' => 2,
            'expiry_warning_days'     => 90,
            'cube_ai_enabled'         => true,
            'cube_groq_enabled'       => true,
            'cube_groq_model'         => 'llama-3.3-70b-versatile',
            'cube_groq_daily_limit'   => 250,
            'cube_gemini_enabled'     => true,
            'cube_gemini_model'       => 'gemini-3.8-flash',
            'cube_gemini_daily_limit' => 250,
        ]);

        // Pre-fill store_name from the signed license payload if store_name has not been customized yet
        $licensedStoreName = trim((string) ($activatedPayload['name'] ?? ''));
        if (
            $licensedStoreName !== ''
            && (empty($setting->store_name) || $setting->store_name === 'Karobar App')
        ) {
            $setting->store_name = $licensedStoreName;
        }

        if ($this->option('accept-legal') && Schema::hasColumn('settings', 'terms_accepted_at')) {
            $now = now();
            $setting->terms_accepted_at = $now;
            $setting->privacy_accepted_at = $now;
            $setting->legal_accepted_version = trim((string) $this->option('legal-version')) ?: '2.0';
        }

        if (Schema::hasColumn('settings', 'is_setup_completed')) {
            if ($importedExistingDb && Schema::hasTable('products') && DB::table('products')->exists()) {
                $setting->is_setup_completed = true;
                $setting->setup_completed_at = $setting->setup_completed_at ?: now();
            } elseif (!$setting->is_setup_completed) {
                $setting->is_setup_completed = false;
                $setting->setup_completed_at = null;
            }
        }

        $setting->save();

        // 7. Cleanup temporary installer files if requested
        if ($this->option('cleanup-temp')) {
            $this->cleanupTempFiles();
        }

        $result = [
            'ok'                 => true,
            'admin_email'        => $adminUser->email,
            'admin_name'         => $adminUser->name,
            'machine_id'         => $licenseService->computeMachineId(),
            'licensed'           => $activatedPayload !== null,
            'imported_sqlite'    => $importedExistingDb,
            'store_name'         => $setting->store_name,
            'is_setup_completed' => (bool) $setting->is_setup_completed,
        ];

        if ($this->option('json')) {
            $this->line(json_encode($result, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
        } else {
            $this->info('Karobar-App installation initialized successfully.');
            $this->line("Admin Account : {$adminUser->name} <{$adminUser->email}>");
            $this->line("Machine ID    : {$result['machine_id']}");
            $this->line('Setup Wizard  : Pending first-time login (/setup)');
        }

        return self::SUCCESS;
    }

    protected function cleanupTempFiles(): void
    {
        $sealFile = trim((string) $this->option('seal-file'));
        if ($sealFile !== '' && is_file($sealFile)) {
            @unlink($sealFile);
        }
        $adminConfigFile = trim((string) $this->option('admin-config'));
        if ($adminConfigFile !== '' && is_file($adminConfigFile)) {
            @unlink($adminConfigFile);
        }
    }

    protected function createPreUpgradeSafetyBackup(): void
    {
        $dbPath = config('database.connections.sqlite.database');
        if (!is_string($dbPath) || $dbPath === '' || $dbPath === ':memory:' || !is_file($dbPath) || @filesize($dbPath) < 16) {
            return;
        }

        try {
            DB::statement('PRAGMA wal_checkpoint(TRUNCATE);');
        } catch (\Throwable) {
            // Ignore
        }

        $backupDir = storage_path('backups');
        if (!is_dir($backupDir)) {
            @mkdir($backupDir, 0755, true);
        }

        $timestamp = date('Ymd-His');
        $backupFile = $backupDir . DIRECTORY_SEPARATOR . "pre-upgrade-{$timestamp}.sqlite";
        @copy($dbPath, $backupFile);

        // Keep only the 10 most recent pre-upgrade backups to avoid filling disk
        $existingBackups = glob($backupDir . DIRECTORY_SEPARATOR . 'pre-upgrade-*.sqlite') ?: [];
        if (count($existingBackups) > 10) {
            sort($existingBackups);
            $toDelete = array_slice($existingBackups, 0, count($existingBackups) - 10);
            foreach ($toDelete as $oldFile) {
                @unlink($oldFile);
            }
        }
    }

    protected function ensureEnvironmentAndDatabaseFile(): void
    {
        $envPath = base_path('.env');
        $examplePath = base_path('.env.example');
        $justCreatedEnv = false;

        if (!is_file($envPath) && is_file($examplePath)) {
            $rawEnv = (string) @file_get_contents($examplePath);
            $rawEnv = preg_replace('/^APP_ENV=.*$/m', 'APP_ENV=production', $rawEnv) ?? $rawEnv;
            $rawEnv = preg_replace('/^APP_DEBUG=.*$/m', 'APP_DEBUG=false', $rawEnv) ?? $rawEnv;
            @file_put_contents($envPath, $rawEnv);
            $justCreatedEnv = true;
        }

        if ($justCreatedEnv || empty(config('app.key'))) {
            try {
                $newKey = 'base64:' . base64_encode(random_bytes(32));
                if (is_file($envPath)) {
                    $envContent = (string) @file_get_contents($envPath);
                    if (preg_match('/^APP_KEY=/m', $envContent)) {
                        $envContent = preg_replace('/^APP_KEY=.*$/m', 'APP_KEY=' . $newKey, $envContent) ?? $envContent;
                    } else {
                        $envContent .= "\nAPP_KEY={$newKey}\n";
                    }
                    @file_put_contents($envPath, $envContent);
                }
                config(['app.key' => $newKey]);
            } catch (\Throwable) {
                // Ignore if .env is not writable
            }
        }

        if (config('database.default') === 'sqlite') {
            $dbPath = config('database.connections.sqlite.database');
            if (is_string($dbPath) && $dbPath !== '' && $dbPath !== ':memory:' && !is_file($dbPath)) {
                $dir = dirname($dbPath);
                if (!is_dir($dir)) {
                    @mkdir($dir, 0755, true);
                }
                @touch($dbPath);
            }
            try {
                DB::statement('PRAGMA journal_mode=WAL;');
            } catch (\Throwable) {
                // Ignore if SQLite connection is not yet open
            }
        }

        // Ensure stale Vite HMR marker (public/hot) is removed when production build manifest is present
        if (is_file(public_path('build/manifest.json')) && is_file(public_path('hot'))) {
            @unlink(public_path('hot'));
        }

        try {
            if (!file_exists(public_path('storage'))) {
                Artisan::call('storage:link', ['--force' => true]);
            }
        } catch (\Throwable) {
            // Ignore on Windows systems where symlinks require developer mode; desktop/router.php serves /storage/* directly
        }
    }

    protected function resolveAdminCredentials(): array
    {
        $configFile = trim((string) $this->option('admin-config'));
        if ($configFile !== '' && is_file($configFile)) {
            $raw = @file_get_contents($configFile);
            $decoded = is_string($raw) ? json_decode($raw, true) : null;
            if (is_array($decoded)) {
                return [
                    'name'          => (string) ($decoded['name'] ?? 'Store Administrator'),
                    'email'         => (string) ($decoded['email'] ?? 'admin@example.com'),
                    'password'      => (string) ($decoded['password'] ?? 'password'),
                    'import_sqlite' => trim((string) ($decoded['import_sqlite'] ?? '')),
                    'upgrade_only'  => !empty($decoded['upgrade_only']),
                ];
            }
        }

        return [
            'name'          => (string) $this->option('admin-name'),
            'email'         => (string) $this->option('admin-email'),
            'password'      => (string) $this->option('admin-password'),
            'import_sqlite' => trim((string) $this->option('import-sqlite')),
            'upgrade_only'  => (bool) $this->option('upgrade-only'),
        ];
    }

    protected function resolveImportSqlitePath(array $adminData): string
    {
        $opt = trim((string) $this->option('import-sqlite'));
        if ($opt !== '') {
            return $opt;
        }

        return trim((string) ($adminData['import_sqlite'] ?? ''));
    }

    /**
     * Copy an existing Herd / Karobar SQLite database file into the application's SQLite path.
     *
     * @return array{0: bool, 1: string|null}
     */
    protected function importExistingSqliteFile(string $sourcePath): array
    {
        // Special test sentinel ":current:" allows in-memory unit tests to verify the user/license wipe without file replacement
        if ($sourcePath === ':current:' && app()->runningUnitTests()) {
            return [true, null];
        }

        if (!is_file($sourcePath) || @filesize($sourcePath) < 16) {
            return [false, "Selected SQLite file does not exist or is empty: {$sourcePath}"];
        }

        $header = (string) @file_get_contents($sourcePath, false, null, 0, 16);
        if (!str_starts_with($header, 'SQLite format 3')) {
            return [false, 'Selected file is not a valid SQLite 3 database.'];
        }

        $targetDbPath = config('database.connections.sqlite.database');
        if (!is_string($targetDbPath) || $targetDbPath === '' || $targetDbPath === ':memory:') {
            return [true, null];
        }

        try {
            DB::disconnect('sqlite');
            DB::purge('sqlite');
        } catch (\Throwable) {
            // Ignore
        }

        $targetDir = dirname($targetDbPath);
        if (!is_dir($targetDir)) {
            @mkdir($targetDir, 0755, true);
        }

        // Remove any stale WAL/SHM files at destination before copying
        if (is_file($targetDbPath . '-wal')) {
            @unlink($targetDbPath . '-wal');
        }
        if (is_file($targetDbPath . '-shm')) {
            @unlink($targetDbPath . '-shm');
        }

        if (realpath($sourcePath) !== realpath($targetDbPath)) {
            if (!@copy($sourcePath, $targetDbPath)) {
                return [false, "Unable to copy SQLite database from {$sourcePath} to {$targetDbPath}"];
            }

            // If the source Herd database had an active WAL file alongside it, copy and checkpoint it so zero recent transactions are lost
            if (is_file($sourcePath . '-wal') && @filesize($sourcePath . '-wal') > 0) {
                @copy($sourcePath . '-wal', $targetDbPath . '-wal');
                if (is_file($sourcePath . '-shm')) {
                    @copy($sourcePath . '-shm', $targetDbPath . '-shm');
                }
            }
        }

        try {
            DB::reconnect('sqlite');
            DB::statement('PRAGMA wal_checkpoint(TRUNCATE);');
            DB::statement('PRAGMA journal_mode=WAL;');
        } catch (\Throwable) {
            // Ignore
        }

        return [true, null];
    }

    /**
     * Clear ONLY Users, Sessions/Tokens, User Role Assignments, and License records from the imported database
     * while preserving 100% of Products, Batches, Invoices, Returns, Ledgers, Accounts, Cash Drawer, and Settings.
     */
    protected function clearUsersAndLicensesOnly(): void
    {
        Schema::disableForeignKeyConstraints();

        try {
            $tablesToClear = [
                'users',
                'licenses',
                'personal_access_tokens',
                'password_reset_tokens',
                'sessions',
            ];

            foreach ($tablesToClear as $table) {
                if (Schema::hasTable($table)) {
                    DB::table($table)->delete();
                }
            }

            if (Schema::hasTable('model_has_roles')) {
                DB::table('model_has_roles')
                    ->where('model_type', User::class)
                    ->delete();
            }

            if (Schema::hasTable('model_has_permissions')) {
                DB::table('model_has_permissions')
                    ->where('model_type', User::class)
                    ->delete();
            }

            try {
                DB::statement("DELETE FROM sqlite_sequence WHERE name IN ('users', 'licenses', 'personal_access_tokens')");
            } catch (\Throwable) {
                // sqlite_sequence may not exist yet
            }
        } finally {
            Schema::enableForeignKeyConstraints();
        }

        if (!app()->runningUnitTests()) {
            $clockPath = storage_path('app/.license-clock');
            if (is_file($clockPath)) {
                @unlink($clockPath);
            }
        }
    }

    protected function resolveLicenseKey(): string
    {
        $directKey = trim((string) $this->option('license-key'));
        if ($directKey !== '') {
            return $directKey;
        }

        $sealFile = trim((string) $this->option('seal-file'));
        if ($sealFile !== '' && is_file($sealFile)) {
            $raw = trim((string) @file_get_contents($sealFile));
            $decoded = json_decode($raw, true);
            if (is_array($decoded) && !empty($decoded['license_key'])) {
                return trim((string) $decoded['license_key']);
            }
            if (str_starts_with($raw, 'KRBL.') || str_contains($raw, '.')) {
                return $raw;
            }
        }

        return '';
    }

    protected function failInstall(string $message): int
    {
        if ($this->option('json')) {
            $this->line(json_encode([
                'ok'      => false,
                'message' => $message,
            ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
        } else {
            $this->error($message);
        }

        return self::FAILURE;
    }
}

