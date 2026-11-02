<?php

namespace App\Http\Controllers;

use App\Models\CubeProviderUsage;
use App\Models\Setting;
use App\Services\Cube\CubeQuotaGuard;
use App\Services\Cube\GeminiProvider;
use App\Services\Cube\GroqProvider;
use App\Services\DocumentShareService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class SettingController extends Controller
{
    // GET /api/settings
    public function show()
    {
        $this->authorize('view', Setting::class);
        $setting = Setting::firstOrCreate(['id' => 1], [
            'printer_type' => 'thermal',
            'thermal_template' => 'standard',
            'a4_template' => 'standard',
            'navigation_style' => 'sidebar',
            'sale_system' => 'retail_wholesale',
            'shop_type' => 'pharmacy',
            'currency_code' => 'PKR',
            'currency_symbol' => 'Rs.',
            'currency_position' => 'before',
            'currency_decimal_places' => 2,
            'expiry_warning_days' => 90,
            'cube_ai_enabled' => true,
            'cube_groq_enabled' => true,
            'cube_groq_model' => 'llama-3.3-70b-versatile',
            'cube_groq_daily_limit' => 250,
            'cube_gemini_enabled' => true,
            'cube_gemini_model' => 'gemini-3.8-flash',
            'cube_gemini_daily_limit' => 250,
        ]);

        return response()->json($this->appendCubeMetadata($setting));
    }

    // GET /api/sale-system
    // Lightweight app-wide sale system mode. Accessible to any authenticated
    // user (no settings.view permission / license gate) because the whole UI
    // — not just the settings page — depends on it (e.g. hiding wholesale
    // actions in retail-only mode). Returns only the two mode fields.
    public function saleSystem()
    {
        $setting = Setting::first();

        return response()->json([
            'store_name'              => $setting?->store_name ?? 'Karobar App',
            'logo_url'                => $setting?->logo_url ?? null,
            'sale_system'             => $setting?->sale_system ?? 'retail_wholesale',
            'shop_type'               => $setting?->shop_type ?? 'pharmacy',
            'currency_code'           => $setting?->currency_code ?? 'PKR',
            'currency_symbol'         => $setting?->currency_symbol ?? 'Rs.',
            'currency_position'       => $setting?->currency_position ?? 'before',
            'currency_decimal_places' => (int)($setting?->currency_decimal_places ?? 2),
        ]);
    }

    // GET /api/currency
    public function currency()
    {
        $setting = Setting::first();

        return response()->json([
            'currency_code'           => $setting?->currency_code ?? 'PKR',
            'currency_symbol'         => $setting?->currency_symbol ?? 'Rs.',
            'currency_position'       => $setting?->currency_position ?? 'before',
            'currency_decimal_places' => (int)($setting?->currency_decimal_places ?? 2),
        ]);
    }

    // POST /api/settings  (multipart/form-data supported)
    public function update(Request $request)
    {
        $this->authorize('update', Setting::class);
        $setting = Setting::firstOrCreate(['id' => 1]);

        $validated = $request->validate([
            'store_name'              => ['nullable','string','max:255'],
            'phone_number'            => ['nullable','string','max:30'],
            'address'                 => ['nullable','string','max:500'],
            'license_number'          => ['nullable','string','max:100'],
            'note'                    => ['nullable','string','max:2000'],
            'printer_type'            => ['required', Rule::in(['thermal','a4'])],
            'thermal_template'        => ['nullable', Rule::in(['standard','minimal','detailed','compact','bold','barcode'])],
            'a4_template'             => ['nullable', Rule::in(['standard','minimal','detailed','compact','bold','barcode'])],
            'navigation_style'        => ['nullable', Rule::in(['sidebar','topbar'])],
            'sale_system'             => ['nullable', Rule::in(['retail', 'retail_wholesale'])],
            'shop_type'               => ['nullable', Rule::in(['pharmacy', 'general_store'])],
            'currency_code'           => ['nullable', 'string', 'max:10'],
            'currency_symbol'         => ['nullable', 'string', 'max:15'],
            'currency_position'       => ['nullable', Rule::in(['before', 'after'])],
            'currency_decimal_places' => ['nullable', 'integer', 'min:0', 'max:4'],
            'expiry_warning_days'     => ['nullable', 'integer', 'min:1', 'max:3650'],
            'smtp_enabled'            => ['nullable', 'boolean'],
            'smtp_host'               => ['nullable', 'string', 'max:255'],
            'smtp_port'               => ['nullable', 'integer', 'min:1', 'max:65535'],
            'smtp_username'           => ['nullable', 'string', 'max:255'],
            'smtp_password'           => ['nullable', 'string', 'max:1000'],
            'smtp_encryption'         => ['nullable', Rule::in(['tls', 'ssl', 'none', ''])],
            'smtp_from_address'             => ['nullable', 'email', 'max:255'],
            'smtp_from_name'                => ['nullable', 'string', 'max:255'],
            'whatsapp_enabled'              => ['nullable', 'boolean'],
            'whatsapp_provider'             => ['nullable', Rule::in(['local_agent', 'waha', 'evolution_api', 'whapi_cloud', 'wasender', 'ultramsg', 'green_api', 'meta_cloud', 'custom_http', ''])],
            'whatsapp_access_token'         => ['nullable', 'string', 'max:2000'],
            'whatsapp_phone_number_id'      => ['nullable', 'string', 'max:120'],
            'whatsapp_business_account_id'  => ['nullable', 'string', 'max:120'],
            'whatsapp_api_version'          => ['nullable', 'string', 'max:20'],
            'whatsapp_api_url'              => ['nullable', 'string', 'max:500'],
            'whatsapp_default_country_code' => ['nullable', 'string', 'max:10'],
            'whatsapp_template_name'        => ['nullable', 'string', 'max:120'],
            'whatsapp_template_language'    => ['nullable', 'string', 'max:20'],
            'whatsapp_auto_fallback'        => ['nullable', 'boolean'],
            'cube_ai_enabled'               => ['nullable', 'boolean'],
            'cube_groq_enabled'       => ['nullable', 'boolean'],
            'cube_groq_api_key'       => ['nullable', 'string', 'max:1000'],
            'cube_groq_model'         => ['nullable', 'string', 'max:120'],
            'cube_groq_daily_limit'   => ['nullable', 'integer', 'min:0', 'max:1000'],
            'cube_gemini_enabled'     => ['nullable', 'boolean'],
            'cube_gemini_api_key'     => ['nullable', 'string', 'max:1000'],
            'cube_gemini_model'       => ['nullable', 'string', 'max:120'],
            'cube_gemini_daily_limit' => ['nullable', 'integer', 'min:0', 'max:1000'],
            'logo'                    => ['nullable','image','mimes:jpg,jpeg,png,webp','max:2048'],
        ]);

        $effectiveProvider = $request->has('whatsapp_provider')
            ? ($request->input('whatsapp_provider') ?: 'local_agent')
            : ($setting->whatsapp_provider ?: 'local_agent');

        if ($request->filled('whatsapp_api_url')) {
            $this->assertSafeWhatsAppApiUrl(
                trim((string) $request->input('whatsapp_api_url')),
                (string) $effectiveProvider
            );
        }

        $submittedSecrets = [];

        // Handle logo upload (optional)
        if ($request->hasFile('logo')) {
            $newPath = $request->file('logo')->store('logos', 'public');
            // delete old file if exists
            if ($setting->logo_path) {
                Storage::disk('public')->delete($setting->logo_path);
            }
            $setting->logo_path = $newPath;
        }

        $smtpFields = [
            'smtp_enabled',
            'smtp_host',
            'smtp_port',
            'smtp_username',
            'smtp_password',
            'smtp_encryption',
            'smtp_from_address',
            'smtp_from_name',
        ];

        $whatsappFields = [
            'whatsapp_enabled',
            'whatsapp_provider',
            'whatsapp_access_token',
            'whatsapp_phone_number_id',
            'whatsapp_business_account_id',
            'whatsapp_api_version',
            'whatsapp_api_url',
            'whatsapp_default_country_code',
            'whatsapp_template_name',
            'whatsapp_template_language',
            'whatsapp_auto_fallback',
        ];

        $cubeFields = [
            'cube_ai_enabled',
            'cube_groq_enabled',
            'cube_groq_api_key',
            'cube_groq_model',
            'cube_groq_daily_limit',
            'cube_gemini_enabled',
            'cube_gemini_api_key',
            'cube_gemini_model',
            'cube_gemini_daily_limit',
        ];

        // Fill non-SMTP / non-WhatsApp / non-Cube fields first
        $setting->fill(collect($validated)->except(array_merge(['logo'], $smtpFields, $whatsappFields, $cubeFields))->toArray());

        // Fill SMTP fields safely if columns exist on the settings table
        if (Schema::hasColumn('settings', 'smtp_host')) {
            if ($request->has('smtp_enabled')) {
                $setting->smtp_enabled = $request->boolean('smtp_enabled');
            }
            if ($request->has('smtp_host')) {
                $setting->smtp_host = $request->input('smtp_host');
            }
            if ($request->has('smtp_port')) {
                $port = $request->input('smtp_port');
                $setting->smtp_port = ($port !== null && $port !== '') ? (int) $port : 587;
            }
            if ($request->has('smtp_username')) {
                $setting->smtp_username = $request->input('smtp_username');
            }
            if ($request->has('smtp_password')) {
                $rawPass = (string) $request->input('smtp_password');
                if ($rawPass !== '') {
                    $setting->smtp_password = $rawPass;
                    $submittedSecrets[] = 'smtp_password';
                } elseif ($request->boolean('clear_smtp_password')) {
                    $setting->smtp_password = null;
                }
            }
            if ($request->has('smtp_encryption')) {
                $setting->smtp_encryption = $request->input('smtp_encryption') ?: 'tls';
            }
            if ($request->has('smtp_from_address')) {
                $setting->smtp_from_address = $request->input('smtp_from_address');
            }
            if ($request->has('smtp_from_name')) {
                $setting->smtp_from_name = $request->input('smtp_from_name');
            }
        }

        // Fill WhatsApp API / Agent fields safely if columns exist on the settings table
        if (Schema::hasColumn('settings', 'whatsapp_enabled')) {
            if ($request->has('whatsapp_enabled')) {
                $setting->whatsapp_enabled = $request->boolean('whatsapp_enabled');
            }
            if ($request->has('whatsapp_provider')) {
                $setting->whatsapp_provider = $request->input('whatsapp_provider') ?: 'local_agent';
            }
            if ($request->has('whatsapp_access_token')) {
                $rawToken = trim((string) $request->input('whatsapp_access_token'));
                if ($rawToken !== '') {
                    $setting->whatsapp_access_token = $rawToken;
                    $submittedSecrets[] = 'whatsapp_access_token';
                } elseif ($request->boolean('clear_whatsapp_access_token')) {
                    $setting->whatsapp_access_token = null;
                }
            }
            if ($request->has('whatsapp_phone_number_id')) {
                $setting->whatsapp_phone_number_id = trim((string) $request->input('whatsapp_phone_number_id'));
            }
            if ($request->has('whatsapp_business_account_id')) {
                $setting->whatsapp_business_account_id = trim((string) $request->input('whatsapp_business_account_id'));
            }
            if ($request->has('whatsapp_api_version')) {
                $setting->whatsapp_api_version = trim((string) $request->input('whatsapp_api_version')) ?: 'v21.0';
            }
            if ($request->has('whatsapp_api_url')) {
                $setting->whatsapp_api_url = trim((string) $request->input('whatsapp_api_url'));
            }
            if ($request->has('whatsapp_default_country_code')) {
                $cc = preg_replace('/\D+/', '', (string) $request->input('whatsapp_default_country_code')) ?: '92';
                $setting->whatsapp_default_country_code = $cc;
            }
            if ($request->has('whatsapp_template_name')) {
                $setting->whatsapp_template_name = trim((string) $request->input('whatsapp_template_name'));
            }
            if ($request->has('whatsapp_template_language')) {
                $setting->whatsapp_template_language = trim((string) $request->input('whatsapp_template_language')) ?: 'en_US';
            }
            if ($request->has('whatsapp_auto_fallback')) {
                $setting->whatsapp_auto_fallback = $request->boolean('whatsapp_auto_fallback');
            }
        }

        // Fill Cube AI fields safely if columns exist on the settings table
        if (Schema::hasColumn('settings', 'cube_ai_enabled')) {
            if ($request->has('cube_ai_enabled')) {
                $setting->cube_ai_enabled = $request->boolean('cube_ai_enabled');
            }
            if ($request->has('cube_groq_enabled')) {
                $setting->cube_groq_enabled = $request->boolean('cube_groq_enabled');
            }
            if ($request->has('cube_groq_api_key')) {
                $rawGroqKey = trim((string) $request->input('cube_groq_api_key'));
                if ($rawGroqKey !== '') {
                    $setting->cube_groq_api_key = $rawGroqKey;
                    $submittedSecrets[] = 'cube_groq_api_key';
                } elseif ($request->boolean('clear_cube_groq_api_key')) {
                    $setting->cube_groq_api_key = null;
                }
            }
            if ($request->has('cube_groq_model')) {
                $setting->cube_groq_model = $request->input('cube_groq_model') ?: 'llama-3.3-70b-versatile';
            }
            if ($request->has('cube_groq_daily_limit')) {
                $limit = $request->input('cube_groq_daily_limit');
                $setting->cube_groq_daily_limit = ($limit !== null && $limit !== '') ? max(0, min(1000, (int) $limit)) : 250;
            }
            if ($request->has('cube_gemini_enabled')) {
                $setting->cube_gemini_enabled = $request->boolean('cube_gemini_enabled');
            }
            if ($request->has('cube_gemini_api_key')) {
                $rawGeminiKey = trim((string) $request->input('cube_gemini_api_key'));
                if ($rawGeminiKey !== '') {
                    $setting->cube_gemini_api_key = $rawGeminiKey;
                    $submittedSecrets[] = 'cube_gemini_api_key';
                } elseif ($request->boolean('clear_cube_gemini_api_key')) {
                    $setting->cube_gemini_api_key = null;
                }
            }
            if ($request->has('cube_gemini_model')) {
                $setting->cube_gemini_model = $request->input('cube_gemini_model') ?: 'gemini-3.8-flash';
            }
            if ($request->has('cube_gemini_daily_limit')) {
                $limit = $request->input('cube_gemini_daily_limit');
                $setting->cube_gemini_daily_limit = ($limit !== null && $limit !== '') ? max(0, min(1000, (int) $limit)) : 250;
            }
        }
        
        // Ensure navigation_style is always updated (it might not be in validated if null)
        if ($request->has('navigation_style')) {
            $setting->navigation_style = $request->input('navigation_style');
        }
        
        // Ensure sale_system is always updated (it might not be in validated if null)
        if ($request->has('sale_system')) {
            $setting->sale_system = $request->input('sale_system');
        }
        
        // Ensure shop_type is always updated (it might not be in validated if null)
        if ($request->has('shop_type')) {
            $setting->shop_type = $request->input('shop_type');
        }

        if ($request->has('currency_code')) {
            $setting->currency_code = $request->input('currency_code');
        }
        if ($request->has('currency_symbol')) {
            $setting->currency_symbol = $request->input('currency_symbol');
        }
        if ($request->has('currency_position')) {
            $setting->currency_position = $request->input('currency_position');
        }
        if ($request->has('currency_decimal_places')) {
            $setting->currency_decimal_places = (int)$request->input('currency_decimal_places');
        }
        
        $setting->save();
        $setting->applyWhatsAppConfig();
        $setting->applyCubeAiConfig();

        return response()->json($this->appendCubeMetadata($setting->fresh(), $submittedSecrets));
    }

    // POST /api/settings/test-whatsapp
    public function testWhatsApp(Request $request)
    {
        $this->authorize('update', Setting::class);

        $validated = $request->validate([
            'whatsapp_provider'             => ['required', Rule::in(['local_agent', 'waha', 'evolution_api', 'whapi_cloud', 'wasender', 'ultramsg', 'green_api', 'meta_cloud', 'custom_http'])],
            'whatsapp_access_token'         => ['nullable', 'string', 'max:2000'],
            'whatsapp_phone_number_id'      => ['nullable', 'string', 'max:120'],
            'whatsapp_business_account_id'  => ['nullable', 'string', 'max:120'],
            'whatsapp_api_version'          => ['nullable', 'string', 'max:20'],
            'whatsapp_api_url'              => ['nullable', 'string', 'max:500'],
            'whatsapp_default_country_code' => ['nullable', 'string', 'max:10'],
            'whatsapp_template_name'        => ['nullable', 'string', 'max:120'],
            'whatsapp_template_language'    => ['nullable', 'string', 'max:20'],
            'test_phone'                    => ['required', 'string', 'max:50'],
        ]);

        $setting = Setting::first();
        $provider = $validated['whatsapp_provider'];
        $token = trim((string) ($validated['whatsapp_access_token'] ?? ''));
        if ($token === '' && $setting && !empty($setting->whatsapp_access_token)) {
            $token = trim((string) $setting->whatsapp_access_token);
        }
        $phoneOrInstanceId = trim((string) ($validated['whatsapp_phone_number_id'] ?? ''));
        $apiUrl = trim((string) ($validated['whatsapp_api_url'] ?? ''));

        if ($apiUrl !== '') {
            $this->assertSafeWhatsAppApiUrl($apiUrl, $provider);
        }

        if (in_array($provider, ['whapi_cloud', 'wasender'], true) && $token === '') {
            return response()->json([
                'status'  => 'failed',
                'message' => 'Please enter your WhatsApp Agent API Key / Bearer Token.',
            ], 422);
        }

        if (in_array($provider, ['meta_cloud', 'ultramsg', 'green_api'], true) && ($token === '' || $phoneOrInstanceId === '')) {
            return response()->json([
                'status'  => 'failed',
                'message' => 'Please enter both the API Token and Phone Number ID / Instance ID for ' . $provider . '.',
            ], 422);
        }

        if ($provider === 'evolution_api' && ($apiUrl === '' || $token === '')) {
            return response()->json([
                'status'  => 'failed',
                'message' => 'Please enter both the Evolution API Server URL and API Key.',
            ], 422);
        }

        if ($provider === 'custom_http' && $apiUrl === '') {
            return response()->json([
                'status'  => 'failed',
                'message' => 'Please enter your Custom WhatsApp API endpoint URL.',
            ], 422);
        }

        $storeName = $setting?->store_name ?: 'Karobar App';

        if ($provider === 'local_agent') {
            $agentService = app(\App\Services\LocalWhatsAppAgentService::class);
            if ($apiUrl === '') {
                $apiUrl = $agentService->resolveAgentUrl($setting);
            }
            if ($token === '') {
                $token = $agentService->ensureApiKey($setting);
            }
        }

        Setting::applyRuntimeWhatsApp([
            'enabled'              => true,
            'provider'             => $provider,
            'access_token'         => $token,
            'phone_number_id'      => $phoneOrInstanceId,
            'business_account_id'  => $validated['whatsapp_business_account_id'] ?? null,
            'api_version'          => $validated['whatsapp_api_version'] ?? 'v21.0',
            'api_url'              => $apiUrl,
            'default_country_code' => $validated['whatsapp_default_country_code'] ?? '92',
            'template_name'        => $validated['whatsapp_template_name'] ?? null,
            'template_language'    => $validated['whatsapp_template_language'] ?? 'en_US',
            'auto_fallback'        => false,
        ]);

        try {
            $result = app(DocumentShareService::class)->sendTestWhatsAppMessage($validated['test_phone'], $storeName);

            return response()->json($result);
        } catch (\Throwable $e) {
            return response()->json([
                'status'  => 'failed',
                'message' => 'WhatsApp API connection failed: ' . $e->getMessage(),
            ], 422);
        }
    }

    protected function authorizeWhatsAppAgentAccess(Request $request): void
    {
        $user = $request->user();
        if (!$user) {
            abort(401);
        }

        try {
            if (method_exists($user, 'hasRole') && ($user->hasRole('Admin') || $user->hasRole('Super Admin'))) {
                return;
            }
        } catch (\Throwable) {
            // Ignore role guard lookup issues
        }

        $allowedPermissions = [
            'settings.view',
            'settings.update',
            'sale-invoice.view',
            'purchase-invoice.view',
            'customer-ledger.view',
            'supplier-ledger.view',
            'payment.view',
            'purchase-order.view',
        ];

        foreach ($allowedPermissions as $perm) {
            try {
                if ($user->can($perm)) {
                    return;
                }
            } catch (\Throwable) {
                // Ignore missing permission exception on unmigrated/unseeded DB
            }
        }

        try {
            if ($user->can('view', Setting::class) || $user->can('update', Setting::class)) {
                return;
            }
        } catch (\Throwable) {
            // Fall through
        }

        abort(403, 'Unauthorized to access WhatsApp Agent.');
    }

    // GET /api/settings/whatsapp-agent/status
    public function whatsappAgentStatus(Request $request, \App\Services\LocalWhatsAppAgentService $agent)
    {
        $this->authorizeWhatsAppAgentAccess($request);

        try {
            $setting = null;
            try {
                $setting = Setting::first();
            } catch (\Throwable) {
                $setting = null;
            }

            $status = $agent->status($setting);
            unset($status['api_key']);
            return response()->json($status);
        } catch (\Throwable $e) {
            return response()->json([
                'ok'            => false,
                'agent_running' => false,
                'status'        => 'error',
                'qr_data_url'   => null,
                'pairing_code'  => null,
                'user'          => null,
                'last_error'    => $e->getMessage(),
                'agent_url'     => $agent->agentUrl(),
            ]);
        }
    }

    // POST /api/settings/whatsapp-agent/start
    public function whatsappAgentStart(Request $request, \App\Services\LocalWhatsAppAgentService $agent)
    {
        $this->authorizeWhatsAppAgentAccess($request);

        try {
            $setting = null;
            try {
                $setting = Setting::first();
            } catch (\Throwable) {
                $setting = null;
            }

            $result = $agent->start($setting);
            unset($result['api_key']);

            if (empty($result['ok']) && empty($result['agent_running'])) {
                return response()->json([
                    ...$result,
                    'message' => $result['last_error'] ?? 'Could not start built-in WhatsApp Agent.',
                ], 422);
            }

            return response()->json($result);
        } catch (\Throwable $e) {
            return response()->json([
                'ok'            => false,
                'agent_running' => false,
                'status'        => 'error',
                'last_error'    => $e->getMessage(),
                'message'       => $e->getMessage(),
            ], 422);
        }
    }

    // POST /api/settings/whatsapp-agent/pair-code
    public function whatsappAgentPairCode(Request $request, \App\Services\LocalWhatsAppAgentService $agent)
    {
        $this->authorize('update', Setting::class);

        $validated = $request->validate([
            'phone' => ['required', 'string', 'max:50'],
        ]);

        try {
            $result = $agent->requestPairingCode($validated['phone'], Setting::first());
            unset($result['api_key']);
            return response()->json($result);
        } catch (\Throwable $e) {
            return response()->json([
                'ok'      => false,
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    // POST /api/settings/whatsapp-agent/logout
    public function whatsappAgentLogout(Request $request, \App\Services\LocalWhatsAppAgentService $agent)
    {
        $this->authorize('update', Setting::class);

        try {
            return response()->json($agent->logout(Setting::first()));
        } catch (\Throwable $e) {
            return response()->json([
                'ok'      => false,
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    // POST /api/settings/whatsapp-agent/stop
    public function whatsappAgentStop(Request $request, \App\Services\LocalWhatsAppAgentService $agent)
    {
        $this->authorize('update', Setting::class);

        try {
            return response()->json($agent->stop(Setting::first()));
        } catch (\Throwable $e) {
            return response()->json([
                'ok'      => false,
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    // POST /api/settings/test-smtp
    public function testSmtp(Request $request)
    {
        $this->authorize('update', Setting::class);

        $validated = $request->validate([
            'smtp_host'         => ['required', 'string', 'max:255'],
            'smtp_port'         => ['required', 'integer', 'min:1', 'max:65535'],
            'smtp_username'     => ['nullable', 'string', 'max:255'],
            'smtp_password'     => ['nullable', 'string', 'max:1000'],
            'smtp_encryption'   => ['nullable', Rule::in(['tls', 'ssl', 'none', ''])],
            'smtp_from_address' => ['nullable', 'email', 'max:255'],
            'smtp_from_name'    => ['nullable', 'string', 'max:255'],
            'test_email'        => ['required', 'email', 'max:255'],
        ]);

        $setting = Setting::first();
        $storeName = $validated['smtp_from_name'] ?? $setting?->store_name ?? 'Karobar App';
        $smtpPassword = trim((string) ($validated['smtp_password'] ?? ''));
        if ($smtpPassword === '' && $setting && !empty($setting->smtp_password)) {
            $smtpPassword = (string) $setting->smtp_password;
        }

        Setting::applyRuntimeSmtp([
            'smtp_host'         => $validated['smtp_host'],
            'smtp_port'         => $validated['smtp_port'],
            'smtp_username'     => $validated['smtp_username'] ?? null,
            'smtp_password'     => $smtpPassword !== '' ? $smtpPassword : null,
            'smtp_encryption'   => $validated['smtp_encryption'] ?? 'tls',
            'smtp_from_address' => $validated['smtp_from_address'] ?? $validated['smtp_username'] ?? null,
            'smtp_from_name'    => $storeName,
        ]);

        try {
            Mail::mailer('smtp')->raw(
                "Hello!\n\nThis is a test email from {$storeName} (Karobar App).\nYour SMTP mail server ({$validated['smtp_host']}:{$validated['smtp_port']}) is configured and ready to send invoices via email.",
                function ($message) use ($validated, $storeName) {
                    $message->to($validated['test_email'])
                        ->subject("SMTP Test Email — {$storeName}");
                }
            );

            return response()->json([
                'status'  => 'sent',
                'message' => 'Test email sent successfully to ' . $validated['test_email'],
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'status'  => 'failed',
                'message' => 'SMTP connection failed: ' . $e->getMessage(),
            ], 422);
        }
    }

    // POST /api/settings/test-cube-ai
    public function testCubeAi(Request $request)
    {
        $this->authorize('update', Setting::class);

        $validated = $request->validate([
            'provider' => ['required', Rule::in(['groq', 'gemini'])],
            'api_key'  => ['nullable', 'string', 'max:1000'],
            'model'    => ['required', 'string', 'max:120'],
        ]);

        $provider = $validated['provider'];
        $apiKey = trim((string) ($validated['api_key'] ?? ''));
        if ($apiKey === '') {
            $existingSetting = Setting::first();
            $apiKey = $provider === 'groq'
                ? trim((string) ($existingSetting?->cube_groq_api_key ?? ''))
                : trim((string) ($existingSetting?->cube_gemini_api_key ?? ''));
        }
        if ($apiKey === '') {
            return response()->json([
                'status'  => 'failed',
                'message' => 'Please enter your ' . ucfirst($provider) . ' API key.',
            ], 422);
        }

        $allowedModels = (array) config("cube.providers.{$provider}.allowed_free_models", []);
        if (! app(CubeQuotaGuard::class)->isEligibleFreeModel($provider, $validated['model'], $allowedModels)) {
            return response()->json([
                'status'  => 'failed',
                'message' => "Selected model '{$validated['model']}' is not in the verified free-tier allowlist for " . ucfirst($provider) . '.',
            ], 422);
        }

        Setting::applyRuntimeCubeProvider($provider, [
            'enabled'     => true,
            'api_key'     => $apiKey,
            'model'       => $validated['model'],
            'daily_limit' => 250,
        ]);

        $systemPrompt = 'You are Cube, the Karobar-App ERP training assistant. Respond ONLY with a valid JSON object: {"title_en":"Connected","title_ur":"منسلک","answer_en":"Cube AI connection verified.","answer_ur":"کیوب اے آئی کنکشن کامیاب رہا۔","source_ids":[]}';
        $userPrompt = 'Verify connectivity and return the required JSON object.';

        $result = $provider === 'groq'
            ? app(GroqProvider::class)->generate($systemPrompt, $userPrompt)
            : app(GeminiProvider::class)->generate($systemPrompt, $userPrompt);

        if (($result['ok'] ?? false) === true) {
            $verifiedModel = $result['model'] ?? $validated['model'];

            try {
                if (Schema::hasTable('settings') && Schema::hasColumn('settings', 'cube_ai_enabled')) {
                    $setting = Setting::first();
                    if ($setting) {
                        $setting->cube_ai_enabled = true;
                        if ($provider === 'groq') {
                            $setting->cube_groq_enabled = true;
                            $setting->cube_groq_api_key = $apiKey;
                            $setting->cube_groq_model = $verifiedModel;
                            if (! $setting->cube_groq_daily_limit || $setting->cube_groq_daily_limit <= 0) {
                                $setting->cube_groq_daily_limit = 250;
                            }
                        } else {
                            $setting->cube_gemini_enabled = true;
                            $setting->cube_gemini_api_key = $apiKey;
                            $setting->cube_gemini_model = $verifiedModel;
                            if (! $setting->cube_gemini_daily_limit || $setting->cube_gemini_daily_limit <= 0) {
                                $setting->cube_gemini_daily_limit = 250;
                            }
                        }
                        $setting->save();
                        $setting->applyCubeAiConfig();
                    }
                }

                if (Schema::hasTable('cube_provider_usages')) {
                    CubeProviderUsage::query()
                        ->where('provider', $provider)
                        ->whereDate('usage_date', now()->toDateString())
                        ->update([
                            'status'           => 'ready',
                            'disabled_reason'  => null,
                            'cooldown_until'   => null,
                            'last_http_status' => 200,
                            'last_error_code'  => null,
                        ]);
                }
            } catch (\Throwable) {
                // Ignore if usage or settings table not present
            }

            $switchedNote = $verifiedModel !== $validated['model']
                ? " (auto-selected available model '{$verifiedModel}' on your account)"
                : '';

            return response()->json([
                'status'           => 'connected',
                'provider'         => $provider,
                'model'            => $verifiedModel,
                'available_models' => $result['available_models'] ?? [],
                'message'          => ucfirst($provider) . " ({$verifiedModel}) connected and verified!{$switchedNote}",
            ]);
        }

        $errCode = $result['error_code'] ?? ('HTTP ' . ($result['http_status'] ?? 500));
        $errDetail = trim((string) ($result['error_message'] ?? ''));
        $detailSuffix = $errDetail !== '' ? " — {$errDetail}" : '';

        return response()->json([
            'status'           => 'failed',
            'provider'         => $provider,
            'available_models' => $result['available_models'] ?? [],
            'message'          => ucfirst($provider) . " connection failed ({$errCode}){$detailSuffix}. Please check your API key and free-tier model eligibility.",
        ], 422);
    }

    /**
     * Validate that a WhatsApp API URL uses HTTP(S) and does not target cloud metadata
     * or (for remote providers) loopback/private network addresses.
     */
    protected function assertSafeWhatsAppApiUrl(string $url, string $provider): void
    {
        $url = trim($url);
        if ($url === '') {
            return;
        }

        $parsed = @parse_url($url);
        $scheme = strtolower((string) ($parsed['scheme'] ?? ''));
        $host   = strtolower(trim((string) ($parsed['host'] ?? ''), '[]'));

        if (!filter_var($url, FILTER_VALIDATE_URL) || !in_array($scheme, ['http', 'https'], true) || $host === '') {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'whatsapp_api_url' => ['The WhatsApp API URL must be a valid http:// or https:// URL.'],
            ]);
        }

        // Always block cloud metadata, link-local, and unspecified addresses across ALL providers
        $alwaysBlockedHosts = ['169.254.169.254', 'metadata.google.internal', 'metadata', '0.0.0.0', '::', '0:0:0:0:0:0:0:0'];
        if (in_array($host, $alwaysBlockedHosts, true) || str_starts_with($host, '169.254.') || str_starts_with($host, 'fe80:')) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'whatsapp_api_url' => ['The WhatsApp API URL points to a restricted metadata or link-local address.'],
            ]);
        }

        // Self-hosted bridges (local_agent, waha, evolution_api) legitimately run on localhost / LAN
        $selfHostedProviders = ['local_agent', 'waha', 'evolution_api'];
        if (in_array($provider, $selfHostedProviders, true)) {
            return;
        }

        if ($host === 'localhost' || str_ends_with($host, '.localhost') || $host === '::1' || str_starts_with($host, '127.')) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'whatsapp_api_url' => ['Remote WhatsApp providers cannot target loopback/localhost addresses.'],
            ]);
        }

        if (filter_var($host, FILTER_VALIDATE_IP)) {
            if (!filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
                throw \Illuminate\Validation\ValidationException::withMessages([
                    'whatsapp_api_url' => ['Remote WhatsApp providers cannot target private or reserved IP ranges.'],
                ]);
            }
        }
    }

    protected function appendCubeMetadata(Setting $setting, array $visibleSecrets = []): array
    {
        if (!empty($visibleSecrets)) {
            $setting->makeVisible($visibleSecrets);
        }

        $payload = $setting->toArray();
        $payload['has_smtp_password']          = trim((string) ($setting->getRawOriginal('smtp_password') ?? $setting->smtp_password ?? '')) !== '';
        $payload['has_whatsapp_access_token']  = trim((string) ($setting->getRawOriginal('whatsapp_access_token') ?? $setting->whatsapp_access_token ?? '')) !== '';
        $payload['has_cube_groq_api_key']      = trim((string) ($setting->getRawOriginal('cube_groq_api_key') ?? $setting->cube_groq_api_key ?? '')) !== '';
        $payload['has_cube_gemini_api_key']    = trim((string) ($setting->getRawOriginal('cube_gemini_api_key') ?? $setting->cube_gemini_api_key ?? '')) !== '';

        $today = now()->toDateString();
        $groqUsage = null;
        $geminiUsage = null;

        try {
            if (Schema::hasTable('cube_provider_usages')) {
                $groqUsage = CubeProviderUsage::query()
                    ->where('provider', 'groq')
                    ->whereDate('usage_date', $today)
                    ->first();
                $geminiUsage = CubeProviderUsage::query()
                    ->where('provider', 'gemini')
                    ->whereDate('usage_date', $today)
                    ->first();
            }
        } catch (\Throwable) {
            // Ignore if table not migrated yet
        }

        $payload['cube_usage_summary'] = [
            'groq' => [
                'request_count' => (int) ($groqUsage?->request_count ?? 0),
                'success_count' => (int) ($groqUsage?->success_count ?? 0),
                'failure_count' => (int) ($groqUsage?->failure_count ?? 0),
                'status'        => (string) ($groqUsage?->status ?? 'ready'),
                'has_env_key'   => trim((string) env('GROQ_API_KEY', '')) !== '',
            ],
            'gemini' => [
                'request_count' => (int) ($geminiUsage?->request_count ?? 0),
                'success_count' => (int) ($geminiUsage?->success_count ?? 0),
                'failure_count' => (int) ($geminiUsage?->failure_count ?? 0),
                'status'        => (string) ($geminiUsage?->status ?? 'ready'),
                'has_env_key'   => trim((string) env('GEMINI_API_KEY', '')) !== '',
            ],
        ];

        return $payload;
    }
}
