<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use App\Models\User;
use Laravel\Sanctum\PersonalAccessToken;

class CheckTokenExpiry
{
    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        // If no user, proceed (other middleware will handle auth)
        if (!$user) {
            return $next($request);
        }

        // Immediately reject deactivated / inactive user accounts and revoke tokens
        if (($user->status ?? 'active') !== 'active') {
            $user->tokens()->delete();

            return response()->json([
                'message' => 'Your account has been deactivated. Please contact an administrator.',
            ], 403);
        }

        // Check if remember_token_expires_at is set and has passed
        if ($user->remember_token_expires_at && now()->isAfter($user->remember_token_expires_at)) {
            return response()->json([
                'message' => 'Session expired. Please login again.',
                'expired' => true,
            ], 401);
        }

        return $next($request);
    }
}
