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
}

