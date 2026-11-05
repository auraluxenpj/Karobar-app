<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\BackupSchedule;
use App\Models\License;
use App\Models\Setting;
use App\Models\StorageLocation;
use App\Models\User;
use App\Services\LicenseService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class WindowsInstallerAndSetupGenieTest extends TestCase
{
    use RefreshDatabase;

    private string $testSecretKeyRaw;
    private string $testSecretKeyB64u;
    private string $testPublicKeyB64u;
    private string $machineA = 'KRB-AAAA-1111-2222-3333';
    private string $machineB = 'KRB-BBBB-4444-5555-6666';
    private int $baseTime;

    protected function setUp(): void
    {
        parent::setUp();

        $this->baseTime = time();
        $seed = hash('sha256', 'KAROBAR-INSTALLER-TEST-SEED', true);
        $kp = sodium_crypto_sign_seed_keypair($seed);
        $this->testSecretKeyRaw = sodium_crypto_sign_secretkey($kp);
        $this->testSecretKeyB64u = LicenseService::b64uEncode($this->testSecretKeyRaw);
        $this->testPublicKeyB64u = LicenseService::b64uEncode(sodium_crypto_sign_publickey($kp));

        LicenseService::setTestOverrides($this->testPublicKeyB64u, $this->machineA, $this->baseTime);
    }

    protected function tearDown(): void
    {
        LicenseService::setTestOverrides(null, null, null);
        parent::tearDown();
    }

    public function test_license_issue_requires_machine_id_and_binds_key_to_single_machine(): void
    {
        // Issuing without --machine fails by default so keys are always machine-bound
        $exitCode = Artisan::call('license:issue', [
            '--name'       => 'Al-Shifa Pharmacy',
            '--secret-key' => $this->testSecretKeyB64u,
        ]);
        $this->assertSame(1, $exitCode);

        // Issuing with --machine succeeds and embeds machine claim inside Ed25519 signature
        $exitCode = Artisan::call('license:issue', [
            '--machine'    => $this->machineA,
            '--name'       => 'Al-Shifa Pharmacy',
            '--edition'    => 'Enterprise',
            '--days'       => 365,
            '--secret-key' => $this->testSecretKeyB64u,
            '--json'       => true,
        ]);
        $this->assertSame(0, $exitCode);

        $output = json_decode(trim(Artisan::output()), true);
        $this->assertTrue($output['ok'] ?? false);
        $this->assertSame($this->machineA, $output['payload']['machine'] ?? null);
        $this->assertStringStartsWith('KRBL.', $output['license_key'] ?? '');
    }

    public function test_installer_verifier_accepts_target_machine_and_blocks_reuse_on_second_machine(): void
    {
        $svc = app(LicenseService::class);
        $boundKey = $svc->signPayload([
            'iss'     => 'Karobar',
            'sub'     => 'KarobarApp',
            'ver'     => 2,
            'lid'     => 'LIC-WIN-001',
            'name'    => 'MedCare Pharmacy',
            'Edition' => 'Professional',
            'machine' => $this->machineA,
            'iat'     => $this->baseTime,
            'nbf'     => $this->baseTime - 100,
            'exp'     => $this->baseTime + (365 * 86400),
        ], $this->testSecretKeyRaw);

        $sealPath = storage_path('app/test-install-license.seal');
        $errPath = storage_path('app/test-install-error.txt');
        @unlink($sealPath);
        @unlink($errPath);

        // 1. Succeeds on Machine A
        $exitA = Artisan::call('license:verify-installer', [
            '--key'       => $boundKey,
            '--seal-out'  => $sealPath,
            '--error-out' => $errPath,
        ]);
        $this->assertSame(0, $exitA);
        $this->assertFileExists($sealPath);

        // 2. Fails immediately if the client tries to use the same key on Machine B
        LicenseService::setTestOverrides($this->testPublicKeyB64u, $this->machineB, $this->baseTime);
        $exitB = Artisan::call('license:verify-installer', [
            '--key'       => $boundKey,
            '--error-out' => $errPath,
        ]);
        $this->assertSame(1, $exitB);
        $this->assertFileExists($errPath);
        $this->assertStringContainsString('different computer', (string) file_get_contents($errPath));

        // 3. Also rejects unbound keys in strict installer mode
        $unboundKey = $svc->signPayload([
            'iss'  => 'Karobar',
            'sub'  => 'KarobarApp',
            'name' => 'Unbound Store',
            'iat'  => $this->baseTime,
            'exp'  => null,
        ], $this->testSecretKeyRaw);

        $exitUnbound = Artisan::call('license:verify-installer', [
            '--key'       => $unboundKey,
            '--error-out' => $errPath,
        ]);
        $this->assertSame(1, $exitUnbound);
        $this->assertStringContainsString('not bound to a Machine ID', (string) file_get_contents($errPath));

        @unlink($sealPath);
        @unlink($errPath);
    }

    public function test_full_windows_installer_bootstrap_and_first_login_genie_setup_wizard_flow(): void
    {
        $svc = app(LicenseService::class);
        $boundKey = $svc->signPayload([
            'iss'     => 'Karobar',
            'sub'     => 'KarobarApp',
            'ver'     => 2,
            'lid'     => 'LIC-GENIE-777',
            'name'    => 'City Star Pharmacy',
            'Edition' => 'Enterprise',
            'machine' => $this->machineA,
            'iat'     => $this->baseTime,
            'nbf'     => $this->baseTime - 100,
            'exp'     => null,
        ], $this->testSecretKeyRaw);

        $sealPath = storage_path('app/test-genie-install.seal');
        $adminConfigPath = storage_path('app/test-admin-init.json');

        Artisan::call('license:verify-installer', [
            '--key'      => $boundKey,
            '--seal-out' => $sealPath,
        ]);

        file_put_contents($adminConfigPath, json_encode([
            'name'     => 'Dr. Asim Shahzad',
            'email'    => 'owner@citystar.pk',
            'password' => 'SecurePass#2026',
        ]));

        // Run post-install command (simulating Inno Setup [Run] step)
        $installExit = Artisan::call('karobar:install', [
            '--seal-file'    => $sealPath,
            '--admin-config' => $adminConfigPath,
            '--accept-legal' => true,
            '--skip-migrate' => true,
            '--cleanup-temp' => true,
            '--json'         => true,
        ]);

        $this->assertSame(0, $installExit);
        $this->assertFileDoesNotExist($sealPath);
        $this->assertFileDoesNotExist($adminConfigPath);

        // Verify Admin user was created with custom credentials and Admin role
        $admin = User::where('email', 'owner@citystar.pk')->first();
        $this->assertNotNull($admin);
        $this->assertSame('Dr. Asim Shahzad', $admin->name);
        $this->assertTrue($admin->hasRole('Admin'));

        // Verify License is active and sealed to Machine A
        $this->assertDatabaseCount('licenses', 1);
        $lic = License::first();
        $this->assertSame($this->machineA, $lic->machine_hash);

        // Verify Settings row has legal timestamps, pre-filled store_name from license, and is_setup_completed = false
        $setting = Setting::first();
        $this->assertNotNull($setting);
        $this->assertSame('City Star Pharmacy', $setting->store_name);
        $this->assertFalse((bool) $setting->is_setup_completed);
        $this->assertNotNull($setting->terms_accepted_at);
        $this->assertNotNull($setting->privacy_accepted_at);

        // Step 1: First-time login returns is_setup_completed = false so frontend routes to /setup
        $loginRes = $this->postJson('/api/login', [
            'email'    => 'owner@citystar.pk',
            'password' => 'SecurePass#2026',
        ]);
        $loginRes->assertOk()
            ->assertJsonPath('is_setup_completed', false);

        Sanctum::actingAs($admin);

        // Step 2: /api/sale-system also reports is_setup_completed = false
        $this->getJson('/api/sale-system')
            ->assertOk()
            ->assertJsonPath('is_setup_completed', false)
            ->assertJsonPath('store_name', 'City Star Pharmacy');

        // Step 3: Genie Setup Wizard fetches initial state (/api/setup/state)
        $this->getJson('/api/setup/state')
            ->assertOk()
            ->assertJsonPath('setting.store_name', 'City Star Pharmacy')
            ->assertJsonPath('license.valid', true)
            ->assertJsonPath('license.machine_id', $this->machineA);

        // Step 4: User completes the Genie Setup Wizard (POST /api/setup/complete)
        $completeRes = $this->postJson('/api/setup/complete', [
            'store_name'              => 'City Star Pharmacy & Wellness',
            'phone_number'            => '+92 300 9876543',
            'address'                 => 'Main Boulevard, Gulberg, Lahore',
            'license_number'          => 'DRUG-LHR-9921',
            'shop_type'               => 'pharmacy',
            'sale_system'             => 'retail_wholesale',
            'currency_code'           => 'PKR',
            'currency_symbol'         => 'Rs.',
            'currency_position'       => 'before',
            'currency_decimal_places' => 2,
            'navigation_style'        => 'sidebar',
            'printer_type'            => 'thermal',
            'thermal_template'        => 'detailed',
            'a4_template'             => 'standard',
            'backup_is_automated'     => true,
            'backup_frequency'        => 'daily',
            'backup_time_of_day'      => '03:00',
            'custom_backup_path'      => 'D:\\KarobarBackups',
            'seed_default_accounts'   => true,
            'seed_default_locations'  => true,
        ]);

        $completeRes->assertOk()
            ->assertJsonPath('store_name', 'City Star Pharmacy & Wellness')
            ->assertJsonPath('is_setup_completed', true);

        // Verify default financial accounts & storage locations were seeded
        $this->assertGreaterThanOrEqual(1, Account::count());
        $this->assertGreaterThanOrEqual(3, StorageLocation::count());

        // Verify automated backup schedule was updated
        $bkp = BackupSchedule::getSchedule();
        $this->assertTrue((bool) $bkp->is_automated);
        $this->assertSame('03:00', $bkp->time_of_day);
        $this->assertSame('D:\\KarobarBackups', $bkp->custom_backup_path);

        // Step 5: /api/sale-system now reports is_setup_completed = true
        $this->getJson('/api/sale-system')
            ->assertOk()
            ->assertJsonPath('is_setup_completed', true)
            ->assertJsonPath('store_name', 'City Star Pharmacy & Wellness');
    }

    public function test_legal_terms_and_privacy_policy_routes_render_successfully(): void
    {
        $this->get('/terms-of-service')
            ->assertOk()
            ->assertSee('Terms and Conditions')
            ->assertSee('Single-Machine License Grant');

        $this->get('/privacy-policy')
            ->assertOk()
            ->assertSee('Privacy Policy')
            ->assertSee('Local-First Data Ownership');
    }

    public function test_installer_sqlite_import_clears_only_users_and_licenses_while_keeping_all_store_data(): void
    {
        // 1. Seed existing "Herd" users, old license, and existing store business data
        $oldAdmin = User::create([
            'name'     => 'Old Herd Admin',
            'email'    => 'old-admin@herd.local',
            'password' => bcrypt('oldpass123'),
            'status'   => 'active',
        ]);
        $oldCashier = User::create([
            'name'     => 'Old Herd Cashier',
            'email'    => 'old-cashier@herd.local',
            'password' => bcrypt('oldpass123'),
            'status'   => 'active',
        ]);

        License::create([
            'license_key'  => 'KRBL.OLD-HERD-KEY.SIGNATURE',
            'payload'      => ['name' => 'Old Herd Store', 'machine' => 'KRB-0000-0000-0000-0000'],
            'valid'        => true,
            'machine_hash' => 'KRB-0000-0000-0000-0000',
            'activated_at' => now()->subDays(90),
        ]);

        \Illuminate\Support\Facades\DB::table('categories')->insert([
            'id'         => 10,
            'name'       => 'Antibiotics',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        \Illuminate\Support\Facades\DB::table('brands')->insert([
            'id'         => 11,
            'name'       => 'GSK',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        \Illuminate\Support\Facades\DB::table('suppliers')->insert([
            'id'         => 12,
            'name'       => 'Premier Pharma Distributors',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        \Illuminate\Support\Facades\DB::table('customers')->insert([
            'id'         => 20,
            'name'       => 'Al-Shifa Clinic',
            'phone'      => '03001112233',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        \Illuminate\Support\Facades\DB::table('products')->insert([
            'id'                 => 30,
            'product_code'       => 'PRD-AUG-625',
            'barcode'            => '8964001234567',
            'name'               => 'Augmentin 625mg Tabs',
            'category_id'        => 10,
            'brand_id'           => 11,
            'supplier_id'        => 12,
            'pack_size'          => 6,
            'unit_purchase_price'=> 50.00,
            'unit_sale_price'    => 65.00,
            'pack_purchase_price'=> 300.00,
            'pack_sale_price'    => 390.00,
            'avg_price'          => 50.00,
            'margin'             => 23.08,
            'quantity'           => 120,
            'created_at'         => now(),
            'updated_at'         => now(),
        ]);

        $this->assertDatabaseCount('users', 2);
        $this->assertDatabaseCount('licenses', 1);
        $this->assertDatabaseCount('products', 1);
        $this->assertDatabaseCount('customers', 1);

        // 2. Issue a new hardware-bound key for Machine A
        Artisan::call('license:issue', [
            '--machine'    => $this->machineA,
            '--name'       => 'City Pharmacy Sillanwali',
            '--edition'    => 'Enterprise',
            '--days'       => 365,
            '--secret-key' => $this->testSecretKeyB64u,
            '--json'       => true,
        ]);
        $issued = json_decode(trim(Artisan::output()), true);
        $boundKey = $issued['license_key'];

        $sealPath = sys_get_temp_dir() . '/test-herd-import-' . uniqid() . '.seal';
        $adminConfigPath = sys_get_temp_dir() . '/test-herd-admin-' . uniqid() . '.json';

        file_put_contents($sealPath, json_encode([
            'ok'          => true,
            'license_key' => $boundKey,
            'machine_id'  => $this->machineA,
        ]));

        file_put_contents($adminConfigPath, json_encode([
            'name'          => 'New Desktop Owner',
            'email'         => 'new-owner@citypharmacy.pk',
            'password'      => 'NewPass#2026',
            'import_sqlite' => ':current:',
        ]));

        LicenseService::setTestOverrides($this->testPublicKeyB64u, $this->machineA, $this->baseTime);

        $exitCode = Artisan::call('karobar:install', [
            '--seal-file'    => $sealPath,
            '--admin-config' => $adminConfigPath,
            '--accept-legal' => true,
            '--cleanup-temp' => true,
            '--skip-migrate' => true,
            '--json'         => true,
        ]);

        $this->assertSame(0, $exitCode);
        $this->assertFileDoesNotExist($sealPath);
        $this->assertFileDoesNotExist($adminConfigPath);

        // 3. Verify old Herd users & old license were wiped and replaced ONLY by the new Admin & new License
        $this->assertDatabaseCount('users', 1);
        $this->assertDatabaseMissing('users', ['email' => 'old-admin@herd.local']);
        $this->assertDatabaseMissing('users', ['email' => 'old-cashier@herd.local']);
        $this->assertDatabaseHas('users', [
            'id'    => 1,
            'email' => 'new-owner@citypharmacy.pk',
            'name'  => 'New Desktop Owner',
        ]);

        $this->assertDatabaseCount('licenses', 1);
        $this->assertDatabaseMissing('licenses', ['machine_hash' => 'KRB-0000-0000-0000-0000']);
        $this->assertDatabaseHas('licenses', ['machine_hash' => $this->machineA]);

        // 4. Verify 100% of business data (Categories, Customers, Products) remained intact!
        $this->assertDatabaseHas('categories', ['id' => 10, 'name' => 'Antibiotics']);
        $this->assertDatabaseHas('customers', ['id' => 20, 'name' => 'Al-Shifa Clinic']);
        $this->assertDatabaseHas('products', ['id' => 30, 'name' => 'Augmentin 625mg Tabs', 'quantity' => 120]);
    }

    public function test_in_place_ota_upgrade_preserves_all_users_licenses_and_store_data_and_checks_github_releases(): void
    {
        // 1. Seed existing installed store with Admin, Cashier, License, Settings, and Products
        $existingAdmin = User::create([
            'name'     => 'Existing Store Owner',
            'email'    => 'owner@karobar.pk',
            'password' => bcrypt('ownerpass123'),
            'status'   => 'active',
        ]);
        $existingCashier = User::create([
            'name'     => 'Counter Cashier',
            'email'    => 'cashier@karobar.pk',
            'password' => bcrypt('cashierpass123'),
            'status'   => 'active',
        ]);

        License::create([
            'license_key'  => 'KRBL.EXISTING-BOUND-KEY.SIG',
            'payload'      => ['name' => 'Madina Medical Store', 'machine' => $this->machineA],
            'valid'        => true,
            'machine_hash' => $this->machineA,
            'activated_at' => now()->subDays(30),
        ]);

        Setting::create([
            'id'                 => 1,
            'store_name'         => 'Madina Medical Store',
            'is_setup_completed' => true,
        ]);

        \Illuminate\Support\Facades\DB::table('categories')->insert([
            'id'         => 50,
            'name'       => 'Pain Relief',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // 2. Run karobar:install via admin-init.json with upgrade_only=true (simulating Inno Setup /UPGRADE=1)
        $adminConfigPath = sys_get_temp_dir() . '/test-ota-upgrade-' . uniqid() . '.json';
        file_put_contents($adminConfigPath, json_encode(['upgrade_only' => true]));

        $exitCode = Artisan::call('karobar:install', [
            '--admin-config' => $adminConfigPath,
            '--cleanup-temp' => true,
            '--skip-migrate' => true,
            '--json'         => true,
        ]);

        $this->assertSame(0, $exitCode);
        $this->assertFileDoesNotExist($adminConfigPath);

        // Verify ALL existing users, license, settings, and categories were 100% preserved untouched
        $this->assertDatabaseCount('users', 2);
        $this->assertDatabaseHas('users', ['email' => 'owner@karobar.pk']);
        $this->assertDatabaseHas('users', ['email' => 'cashier@karobar.pk']);
        $this->assertDatabaseCount('licenses', 1);
        $this->assertDatabaseHas('licenses', ['license_key' => 'KRBL.EXISTING-BOUND-KEY.SIG']);
        $this->assertDatabaseHas('settings', ['store_name' => 'Madina Medical Store', 'is_setup_completed' => 1]);
        $this->assertDatabaseHas('categories', ['id' => 50, 'name' => 'Pain Relief']);

        // 3. Verify /api/system/version and /api/system/check-update OTA endpoints
        $this->getJson('/api/system/version')
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('app_name', 'Karobar-App');

        \Illuminate\Support\Facades\Http::fake([
            'https://github.com/shzdasim/Karobar-App/releases/latest/download/latest-release.json' => \Illuminate\Support\Facades\Http::response([
                'app_name'       => 'Karobar-App',
                'version'        => '2.0.99',
                'build_number'   => 99,
                'commit_sha'     => 'abc9999',
                'release_name'   => 'Karobar-App v2.0.99 (Build #99)',
                'released_at'    => '2026-11-05T12:00:00Z',
                'notes'          => '• Added new POS shortcut and batch report filters',
                'download_url'   => 'https://github.com/shzdasim/Karobar-App/releases/latest/download/Karobar-App-Setup.exe',
                'bundle_url'     => 'https://github.com/shzdasim/Karobar-App/releases/latest/download/Karobar-App-Setup-Bundle.zip',
                'release_url'    => 'https://github.com/shzdasim/Karobar-App/releases/latest',
                'zero_data_loss' => true,
            ], 200),
        ]);

        $this->getJson('/api/system/check-update?force=1')
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('update_available', true)
            ->assertJsonPath('latest_version', '2.0.99')
            ->assertJsonPath('latest_build', 99)
            ->assertJsonPath('zero_data_loss', true);
    }
}

