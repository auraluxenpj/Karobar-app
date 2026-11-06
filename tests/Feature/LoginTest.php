<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\LicenseService;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

class LoginTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // Keep authentication tests independent of unrelated business migrations.
        foreach ([
            '0001_01_01_000000_create_users_table.php',
            '2025_02_20_000000_add_remember_expiry_to_users.php',
            '2025_08_10_080028_create_personal_access_tokens_table.php',
            '2025_08_10_080111_create_permission_tables.php',
        ] as $migration) {
            (require database_path('migrations/'.$migration))->up();
        }

        $this->mock(LicenseService::class, function ($mock) {
            $mock->shouldReceive('clearLicenseIfMachineChanged')->andReturn(false);
        });

        User::create([
            'name' => 'Login Test',
            'email' => 'login@example.com',
            'password' => Hash::make('correct-password'),
        ]);
    }

    public function test_login_creates_a_token_with_twenty_minute_expiry(): void
    {
        $this->assertTokenExpiry(false, 20);
    }

    public function test_remember_me_creates_a_token_with_twenty_four_hour_expiry(): void
    {
        $this->assertTokenExpiry(true, 1440);
    }

    private function assertTokenExpiry(bool $remember, int $minutes): void
    {
        $this->freezeSecond();
        $response = $this->postJson('/api/login', [
            'email' => 'login@example.com',
            'password' => 'correct-password',
            'remember' => $remember,
        ])->assertOk()->assertJsonPath('remember_me', $remember);

        $token = PersonalAccessToken::findToken($response->json('token'));
        $this->assertNotNull($token);
        $this->assertTrue($token->expires_at->equalTo(now()->addMinutes($minutes)));
        $this->assertTrue($token->can('*'));
        $this->assertSame(now()->addMinutes($minutes)->toIso8601String(), $response->json('expires_at'));

        // Sanctum must reject the expired bearer token before the controller runs.
        config(['sanctum.guard' => []]);
        $this->app['auth']->forgetGuards();
        $this->travel($minutes + 1)->minutes();
        $this->withToken($response->json('token'))->getJson('/api/user')->assertUnauthorized();
    }

    public function test_invalid_credentials_do_not_issue_a_token(): void
    {
        $this->postJson('/api/login', [
            'email' => 'login@example.com',
            'password' => 'wrong-password',
        ])->assertUnauthorized()->assertJsonPath('message', 'Invalid credentials');

        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_malformed_password_is_a_validation_error(): void
    {
        $this->postJson('/api/login', [
            'email' => 'login@example.com',
            'password' => ['invalid'],
        ])->assertUnprocessable()->assertJsonValidationErrors('password');
    }

    public function test_expired_session_authentication_returns_401_instead_of_500(): void
    {
        $user = User::first();
        $user->update(['remember_token_expires_at' => now()->subMinute()]);
        $this->actingAs($user, 'web');

        $this->getJson('/api/user')->assertUnauthorized()->assertJsonPath('expired', true);
        $this->getJson('/api/user')->assertUnauthorized();
    }

    public function test_session_can_be_extended_by_ten_minutes_repeatedly_after_expiry(): void
    {
        $this->freezeSecond();
        $loginRes = $this->postJson('/api/login', [
            'email' => 'login@example.com',
            'password' => 'correct-password',
            'remember' => true,
        ])->assertOk();

        $token = $loginRes->json('token');

        config(['sanctum.guard' => []]);
        $this->app['auth']->forgetGuards();

        // Travel past the 24-hour mark so token is expired
        $this->travel(1441)->minutes();
        $this->withToken($token)->getJson('/api/user')->assertUnauthorized();

        // User clicks "Wait 10 Minutes" -> extends session by 10 minutes
        $extendRes = $this->withToken($token)
            ->postJson('/api/session/extend', ['minutes' => 10])
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('wait_minutes', 10);

        $this->assertSame(now()->addMinutes(10)->toIso8601String(), $extendRes->json('expires_at'));

        // User can now save their invoice / call protected APIs during the 10-minute wait window
        $this->app['auth']->forgetGuards();
        $this->withToken($token)->getJson('/api/user')->assertOk();

        // After 11 minutes, session expires again and can be extended for another 10 minutes
        $this->travel(11)->minutes();
        $this->app['auth']->forgetGuards();
        $this->withToken($token)->getJson('/api/user')->assertUnauthorized();

        $this->withToken($token)
            ->postJson('/api/session/extend', ['minutes' => 10])
            ->assertOk()
            ->assertJsonPath('ok', true);

        $this->app['auth']->forgetGuards();
        $this->withToken($token)->getJson('/api/user')->assertOk();
    }
}
