<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use App\Services\LicenseService;

class AuthController extends Controller
{
    protected LicenseService $licenseService;

    // Token expiry times in minutes
    protected const REMEMBER_ME_EXPIRY = 1440; // 24 hours
    protected const DEFAULT_EXPIRY = 20; // 20 minutes

    public function __construct(LicenseService $licenseService)
    {
        $this->licenseService = $licenseService;
    }

    /**
     * Handle user login.
     *
     * @param  \Illuminate\Http\Request  $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function login(Request $request): JsonResponse
    {
        $request->validate([
            'email'    => 'required|email',
            'password' => 'required|string',
            'remember' => 'sometimes|boolean',
        ]);

        if (!Auth::attempt($request->only('email', 'password'))) {
            return response()->json(['message' => 'Invalid credentials'], 401);
        }

        /** @var User $user */
        $user = Auth::user();

        if (($user->status ?? 'active') !== 'active') {
            $user->tokens()->delete();
            return response()->json([
                'message' => 'Your account has been deactivated. Please contact an administrator.',
            ], 403);
        }

        // Check license and auto-revoke if machine changed (software copied to new device)
        $licenseCleared = $this->licenseService->clearLicenseIfMachineChanged();

        // Determine token expiry based on remember me flag
        $rememberMe = $request->boolean('remember');
        $expiryMinutes = $rememberMe ? self::REMEMBER_ME_EXPIRY : self::DEFAULT_EXPIRY;
        $expiresAt = now()->addMinutes($expiryMinutes);

        // Delete any existing personal access tokens first
        $user->tokens()->delete();

        // Sanctum accepts expiry as the third argument, after token abilities.
        $token = $user->createToken('api_token', ['*'], $expiresAt)->plainTextToken;

        // Store remember token expiry in database
        $user->update([
            'remember_token_expires_at' => $expiresAt,
        ]);

        $isSetupCompleted = true;
        try {
            if (\Illuminate\Support\Facades\Schema::hasTable('settings')) {
                $setting = \App\Models\Setting::first();
                if (\Illuminate\Support\Facades\Schema::hasColumn('settings', 'is_setup_completed')) {
                    $isSetupCompleted = $setting ? (bool) $setting->is_setup_completed : false;
                } else {
                    $isSetupCompleted = (bool) (!empty($setting?->store_name) && $setting?->store_name !== 'Karobar App');
                }
            }
        } catch (\Throwable) {
            $isSetupCompleted = true;
        }

        $response = [
            'token'              => $token,
            'user'               => $user->load('roles'),
            'expires_at'         => $expiresAt->toIso8601String(),
            'remember_me'        => $rememberMe,
            'is_setup_completed' => $isSetupCompleted,
        ];

        // If license was cleared due to machine change, inform the client
        if ($licenseCleared) {
            $response['license_revoked'] = true;
            $response['message'] = 'License was revoked because software was moved to a new device. Please activate a new license.';
        }

        return response()->json($response);
    }

    /**
     * Get the currently authenticated user.
     *
     * @param  \Illuminate\Http\Request  $request
     * @return \App\Models\User
     */
    public function user(Request $request): User
    {
        /** @var User $user */
        $user = $request->user();

        return $user->load('roles');
    }
    public function updateProfile(Request $request)
    {
        $user = $request->user();

        $data = $request->validate([
            'name'             => 'required|string|max:255',
            'email'            => 'required|email|unique:users,email,' . $user->id,
            'current_password' => 'nullable|string',
            'password'         => 'nullable|confirmed|min:6',
        ]);

        $changingPassword = !empty($data['password']);
        $changingEmail = isset($data['email']) && strcasecmp($data['email'], $user->email) !== 0;

        if ($changingPassword || $changingEmail) {
            if (empty($data['current_password']) || !Hash::check($data['current_password'], $user->password)) {
                return response()->json([
                    'message' => 'Current password is required and must be valid to change your email or password.',
                    'errors'  => ['current_password' => ['The provided current password is incorrect.']],
                ], 422);
            }
        }

        unset($data['current_password']);

        if ($changingPassword) {
            $data['password'] = bcrypt($data['password']);
        } else {
            unset($data['password']);
        }

        $user->update($data);

        if ($changingPassword) {
            $currentTokenId = $user->currentAccessToken()?->id;
            if ($currentTokenId) {
                $user->tokens()->where('id', '!=', $currentTokenId)->delete();
            } else {
                $user->tokens()->delete();
            }
        }

        return response()->json($user);
    }
// AuthController.php
public function logout(Request $request): \Illuminate\Http\JsonResponse
{
    $request->user()->currentAccessToken()?->delete();
    return response()->json(['message' => 'Logged out']);
}

public function confirmPassword(Request $request)
    {
        $request->validate([
            'password' => 'required|string',
        ]);

        $user = $request->user(); // via sanctum

        if (!$user || !Hash::check($request->password, $user->password)) {
            return response()->json(['message' => 'Invalid password'], 422);
        }

        // You might add throttle/rate-limit here if you wish

        return response()->json(['ok' => true], 200);
    }

    /**
     * Handle a forgot password request.
     *
     * @param  \Illuminate\Http\Request  $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function forgotPassword(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => 'required|email',
        ]);

        if (!User::where('email', $validated['email'])->exists()) {
            return response()->json([
                'message' => 'Password reset link sent to your email.',
                'status'  => __(Password::RESET_LINK_SENT),
            ], 200);
        }

        $status = Password::sendResetLink(
            $request->only('email')
        );

        if ($status === Password::RESET_LINK_SENT) {
            return response()->json([
                'message' => 'Password reset link sent to your email.',
                'status' => __($status)
            ], 200);
        }

        return response()->json([
            'message' => 'Unable to send password reset link.',
            'errors' => ['email' => [__($status)]]
        ], 422);
    }

    /**
     * Handle a password reset request.
     *
     * @param  \Illuminate\Http\Request  $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function resetPassword(Request $request): JsonResponse
    {
        $request->validate([
            'token' => 'required|string',
            'email' => 'required|email|exists:users,email',
            'password' => 'required|confirmed|min:8',
        ]);

        $status = Password::reset(
            $request->only('email', 'password', 'password_confirmation', 'token'),
            function (User $user, string $password) {
                $user->forceFill([
                    'password' => Hash::make($password)
                ])->save();
                $user->tokens()->delete();
            }
        );

        if ($status === Password::PASSWORD_RESET) {
            return response()->json([
                'message' => 'Password has been reset successfully.',
                'status' => __($status)
            ], 200);
        }

        return response()->json([
            'message' => 'Unable to reset password.',
            'errors' => ['email' => [__($status)]]
        ], 422);
    }

}
