<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\BackupSchedule;
use App\Models\License;
use App\Models\Setting;
use App\Models\StorageLocation;
use App\Models\User;
use App\Services\LicenseService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class WindowsInstallerAndSetupGenieTest extends TestCase
{
    use RefreshDatabase;

    private string $testSecretKeyRaw;
    private string $testSecretKeyB64u;
    private string $testPublicKeyB64u;
    private string $machineA = 'KRB-AAAA-1111-2222-3333';
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

    public function test_first_login_genie_setup_wizard_flow(): void
    {
        Artisan::call('db:seed', ['--class' => RolesAndPermissionsSeeder::class, '--force' => true]);

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

        [$ok] = $svc->activateLicenseKey($boundKey, true);
        $this->assertTrue($ok);

        $adminRole = Role::firstOrCreate(['name' => 'Admin', 'guard_name' => 'sanctum']);
        $admin = User::create([
            'name'     => 'Dr. Asim Shahzad',
            'email'    => 'owner@citystar.pk',
            'password' => Hash::make('SecurePass#2026'),
            'status'   => 'active',
        ]);
        $admin->syncRoles([$adminRole]);

        Setting::create([
            'id'                  => 1,
            'store_name'          => 'City Star Pharmacy',
            'is_setup_completed'  => false,
            'terms_accepted_at'   => now(),
            'privacy_accepted_at' => now(),
        ]);

        // Verify License is active and sealed to Machine A
        $this->assertDatabaseCount('licenses', 1);
        $lic = License::first();
        $this->assertSame($this->machineA, $lic->machine_hash);

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
            'custom_backup_path'      => '/backups/karobar',
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
        $this->assertSame('/backups/karobar', $bkp->custom_backup_path);

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

    public function test_printer_template_preview_routes_do_not_trigger_auto_print(): void
    {
        foreach (['standard', 'minimal', 'detailed', 'compact', 'bold', 'barcode'] as $tpl) {
            $this->get("/print/thermal-preview/{$tpl}")
                ->assertOk()
                ->assertDontSee('onload="window.print()"', false);

            $this->get("/print/a4-preview/{$tpl}")
                ->assertOk()
                ->assertDontSee('onload="window.print()"', false);
        }
    }
}
