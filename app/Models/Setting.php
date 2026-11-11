<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\Mailer\Transport\Smtp\Stream\SocketStream;

class Setting extends Model
{
    protected $fillable = [
        'store_name',
        'phone_number',
        'address',
        'license_number',
        'note',
        'note_en',
        'note_ur',
        'whatsapp_message_en',
        'whatsapp_message_ur',
        'printer_type',
        'thermal_template',
        'a4_template',
        'print_paper_width_mm',
        'print_margin_top_mm',
        'print_margin_bottom_mm',
        'print_margin_left_mm',
        'print_margin_right_mm',
        'print_font_scale',
        'print_contrast_mode',
        'print_scale_mode',
        'print_show_logo',
        'share_paper_size',
        'logo_path',
        'share_show_logo',
        'navigation_style',
        'sale_system',
        'shop_type',
        'currency_code',
        'currency_symbol',
        'currency_position',
        'currency_decimal_places',
        'expiry_warning_days',
        'smtp_enabled',
        'smtp_host',
        'smtp_port',
        'smtp_username',
        'smtp_password',
        'smtp_encryption',
        'smtp_from_address',
        'smtp_from_name',
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
        'cube_ai_enabled',
        'cube_groq_enabled',
        'cube_groq_api_key',
        'cube_groq_model',
        'cube_groq_daily_limit',
        'cube_gemini_enabled',
        'cube_gemini_api_key',
        'cube_gemini_model',
        'cube_gemini_daily_limit',
        'is_setup_completed',
        'setup_completed_at',
        'terms_accepted_at',
        'privacy_accepted_at',
        'legal_accepted_version',
    ];

    protected $casts = [
        'print_paper_width_mm'    => 'integer',
        'print_margin_top_mm'     => 'integer',
        'print_margin_bottom_mm'  => 'integer',
        'print_margin_left_mm'    => 'integer',
        'print_margin_right_mm'   => 'integer',
        'print_font_scale'        => 'integer',
        'print_show_logo'         => 'boolean',
        'share_show_logo'         => 'boolean',
        'smtp_enabled'            => 'boolean',
        'smtp_port'               => 'integer',
        'whatsapp_enabled'        => 'boolean',
        'whatsapp_auto_fallback'  => 'boolean',
        'cube_ai_enabled'         => 'boolean',
        'cube_groq_enabled'       => 'boolean',
        'cube_groq_daily_limit'   => 'integer',
        'cube_gemini_enabled'     => 'boolean',
        'cube_gemini_daily_limit' => 'integer',
        'is_setup_completed'      => 'boolean',
        'setup_completed_at'      => 'datetime',
        'terms_accepted_at'       => 'datetime',
        'privacy_accepted_at'     => 'datetime',
    ];

    protected $hidden = [
        'smtp_password',
        'whatsapp_access_token',
        'cube_groq_api_key',
        'cube_gemini_api_key',
    ];

    protected $appends = ['logo_url'];

    public function getLogoUrlAttribute(): ?string
    {
        return $this->logo_path ? Storage::url($this->logo_path) : null;
    }

    /**
     * Resolve the store logo as a base64 data URI suitable for DomPDF and inline HTML previews.
     */
    public function resolveLogoDataUri(): ?string
    {
        $logoPath = trim((string) ($this->logo_path ?? ''));
        if ($logoPath === '') {
            return null;
        }

        if (str_starts_with($logoPath, 'data:image/')) {
            return $logoPath;
        }

        try {
            if (Storage::disk('public')->exists($logoPath)) {
                $contents = Storage::disk('public')->get($logoPath);
                if ($contents !== null && $contents !== '') {
                    $mime = Storage::disk('public')->mimeType($logoPath) ?: $this->guessImageMimeType($logoPath);
                    return 'data:' . $mime . ';base64,' . base64_encode($contents);
                }
            }
        } catch (\Throwable) {
            // Fall through to filesystem check
        }

        $candidates = [
            storage_path('app/public/' . ltrim($logoPath, '/')),
            public_path('storage/' . ltrim($logoPath, '/')),
            public_path(ltrim($logoPath, '/')),
        ];

        foreach ($candidates as $filePath) {
            if (is_file($filePath) && is_readable($filePath)) {
                $contents = @file_get_contents($filePath);
                if ($contents !== false && $contents !== '') {
                    $mime = $this->guessImageMimeType($filePath);
                    return 'data:' . $mime . ';base64,' . base64_encode($contents);
                }
            }
        }

        return null;
    }

    protected function guessImageMimeType(string $path): string
    {
        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        return match ($ext) {
            'jpg', 'jpeg' => 'image/jpeg',
            'webp'        => 'image/webp',
            'gif'         => 'image/gif',
            'svg'         => 'image/svg+xml',
            default       => 'image/png',
        };
    }

    /**
     * Apply the stored SMTP settings to Laravel's runtime mail configuration.
     * Returns true when custom SMTP is enabled and a host is configured.
     */
    public function applySmtpConfig(): bool
    {
        if (!$this->smtp_enabled || empty(trim((string) $this->smtp_host))) {
            return false;
        }

        self::applyRuntimeSmtp([
            'smtp_host'         => $this->smtp_host,
            'smtp_port'         => $this->smtp_port ?: 587,
            'smtp_username'     => $this->smtp_username,
            'smtp_password'     => $this->smtp_password,
            'smtp_encryption'   => $this->smtp_encryption ?: 'tls',
            'smtp_from_address' => $this->smtp_from_address ?: $this->smtp_username,
            'smtp_from_name'    => $this->smtp_from_name ?: ($this->store_name ?: config('mail.from.name', 'Karobar App')),
        ]);

        return true;
    }

    /**
     * Configure Laravel's 'smtp' mailer and 'from' address at runtime from an array of SMTP credentials.
     */
    public static function applyRuntimeSmtp(array $smtp): void
    {
        $encryption = strtolower(trim((string) ($smtp['smtp_encryption'] ?? 'tls')));
        $port = (int) ($smtp['smtp_port'] ?? 587);

        // In Symfony Mailer:
        // - 'smtps' is implicit SSL/TLS (Port 465), connecting via ssl://host:port immediately.
        // - 'smtp' is plain TCP with STARTTLS negotiation (Port 587 or 25).
        // If port is 587 (or 25 / 2525), it NEVER uses implicit SSL on initial socket connect,
        // even if the user selected "SSL" in the UI dropdown.
        $useImplicitSsl = ($port === 465 && $encryption !== 'none')
            || (($encryption === 'ssl' || $encryption === 'smtps') && !in_array($port, [25, 587, 2525], true));

        if ($useImplicitSsl) {
            $scheme = 'smtps';
            $autoTls = true;
            $requireTls = false;
        } elseif ($encryption === 'none') {
            $scheme = 'smtp';
            $autoTls = false;
            $requireTls = false;
        } else {
            // Port 587 / 25 / 2525 with TLS or SSL selected -> use plain TCP + STARTTLS upgrade
            $scheme = 'smtp';
            $autoTls = true;
            $requireTls = true;
        }

        $fromAddress = trim((string) ($smtp['smtp_from_address'] ?? ''))
            ?: trim((string) ($smtp['smtp_username'] ?? ''))
            ?: config('mail.from.address', 'hello@example.com');

        $fromName = trim((string) ($smtp['smtp_from_name'] ?? ''))
            ?: config('mail.from.name', 'Karobar App');

        config([
            'mail.default'                  => 'smtp',
            'mail.mailers.smtp.transport'   => 'smtp',
            'mail.mailers.smtp.scheme'      => $scheme,
            'mail.mailers.smtp.encryption'  => ($encryption === 'none' || $encryption === '') ? null : $encryption,
            'mail.mailers.smtp.auto_tls'    => $autoTls,
            'mail.mailers.smtp.require_tls' => $requireTls,
            'mail.mailers.smtp.host'        => trim((string) ($smtp['smtp_host'] ?? '')),
            'mail.mailers.smtp.port'        => $port,
            'mail.mailers.smtp.username'    => ($smtp['smtp_username'] ?? '') !== '' ? $smtp['smtp_username'] : null,
            'mail.mailers.smtp.password'    => ($smtp['smtp_password'] ?? '') !== '' ? $smtp['smtp_password'] : null,
            'mail.from.address'             => $fromAddress,
            'mail.from.name'                => $fromName,
        ]);

        Mail::purge('smtp');

        // Ensure a valid SSL CA bundle is set on the Symfony SocketStream if PHP's configured
        // openssl.cafile (e.g. /usr/local/etc/openssl@3/cert.pem after an OpenSSL upgrade) does not exist.
        try {
            $symfonyTransport = Mail::mailer('smtp')->getSymfonyTransport();
            if (method_exists($symfonyTransport, 'getStream')) {
                $stream = $symfonyTransport->getStream();
                if ($stream instanceof SocketStream) {
                    $streamOptions = $stream->getStreamOptions();
                    $cafile = self::resolveValidCaBundlePath();
                    if ($cafile !== null) {
                        $streamOptions['ssl']['cafile'] = $cafile;
                        $stream->setStreamOptions($streamOptions);
                    }
                }
            }
        } catch (\Throwable) {
            // Ignore stream option inspection errors on non-socket transports
        }
    }

    /**
     * Resolve a valid CA certificate bundle path on the host system if PHP's default openssl.cafile is missing.
     */
    public static function resolveValidCaBundlePath(): ?string
    {
        $locs = function_exists('openssl_get_cert_locations') ? openssl_get_cert_locations() : [];
        $iniCafile = $locs['ini_cafile'] ?? '';
        if ($iniCafile !== '' && is_file($iniCafile) && is_readable($iniCafile)) {
            return $iniCafile;
        }

        $defaultCafile = $locs['default_cert_file'] ?? '';
        if ($defaultCafile !== '' && is_file($defaultCafile) && is_readable($defaultCafile)) {
            return $defaultCafile;
        }

        $candidates = [
            '/usr/local/etc/ca-certificates/cert.pem',
            '/opt/homebrew/etc/ca-certificates/cert.pem',
            '/usr/local/etc/openssl@4/cert.pem',
            '/opt/homebrew/etc/openssl@4/cert.pem',
            '/usr/local/etc/openssl@3/cert.pem',
            '/opt/homebrew/etc/openssl@3/cert.pem',
            '/etc/ssl/cert.pem',
            '/etc/ssl/certs/ca-certificates.crt',
            '/etc/pki/tls/certs/ca-bundle.crt',
        ];

        foreach ($candidates as $candidate) {
            if (is_file($candidate) && is_readable($candidate)) {
                return $candidate;
            }
        }

        return null;
    }

    /**
     * Apply stored Cube AI settings from the database into runtime `config('cube.*')`.
     * Database settings take precedence when configured in the Settings UI, while falling back
     * to `.env` / `config/cube.php` defaults when DB fields are left empty.
     */
    public function applyCubeAiConfig(): void
    {
        if ($this->cube_ai_enabled !== null) {
            config(['cube.ai_enabled' => (bool) $this->cube_ai_enabled]);
        }

        $groqKey = trim((string) ($this->cube_groq_api_key ?? ''));
        $hasGroqSettings = $groqKey !== ''
            || $this->cube_groq_enabled === false
            || trim((string) ($this->cube_groq_model ?? '')) !== ''
            || $this->cube_groq_daily_limit !== null;
        if ($hasGroqSettings) {
            self::applyRuntimeCubeProvider('groq', [
                'enabled'     => (bool) ($this->cube_groq_enabled ?? true),
                'api_key'     => $groqKey !== '' ? $groqKey : (string) config('cube.providers.groq.api_key', ''),
                'model'       => trim((string) ($this->cube_groq_model ?: config('cube.providers.groq.model', 'llama-3.3-70b-versatile'))),
                'daily_limit' => $this->cube_groq_daily_limit !== null
                    ? (int) $this->cube_groq_daily_limit
                    : (int) config('cube.providers.groq.daily_limit', 250),
            ]);
        }

        $geminiKey = trim((string) ($this->cube_gemini_api_key ?? ''));
        $hasGeminiSettings = $geminiKey !== ''
            || $this->cube_gemini_enabled === false
            || trim((string) ($this->cube_gemini_model ?? '')) !== ''
            || $this->cube_gemini_daily_limit !== null;
        if ($hasGeminiSettings) {
            self::applyRuntimeCubeProvider('gemini', [
                'enabled'     => (bool) ($this->cube_gemini_enabled ?? true),
                'api_key'     => $geminiKey !== '' ? $geminiKey : (string) config('cube.providers.gemini.api_key', ''),
                'model'       => trim((string) ($this->cube_gemini_model ?: config('cube.providers.gemini.model', 'gemini-3.8-flash'))),
                'daily_limit' => $this->cube_gemini_daily_limit !== null
                    ? (int) $this->cube_gemini_daily_limit
                    : (int) config('cube.providers.gemini.daily_limit', 250),
            ]);
        }
    }

    /**
     * Configure a specific Cube AI provider ('groq' or 'gemini') at runtime.
     */
    public static function applyRuntimeCubeProvider(string $provider, array $options): void
    {
        if (! in_array($provider, ['groq', 'gemini'], true)) {
            return;
        }

        if (array_key_exists('enabled', $options)) {
            config(["cube.providers.{$provider}.enabled" => (bool) $options['enabled']]);
        }
        if (array_key_exists('api_key', $options)) {
            config(["cube.providers.{$provider}.api_key" => trim((string) $options['api_key'])]);
        }
        if (! empty($options['model'])) {
            config(["cube.providers.{$provider}.model" => trim((string) $options['model'])]);
        }
        if (array_key_exists('daily_limit', $options)) {
            config(["cube.providers.{$provider}.daily_limit" => max(0, min(1000, (int) $options['daily_limit']))]);
        }
    }

    /**
     * Apply stored WhatsApp API / Agent settings from the database into runtime `config('services.whatsapp.*')`.
     * Database settings take precedence when configured in the Settings UI, while falling back
     * to `.env` / `config/services.php` defaults when DB fields are left empty.
     */
    public function applyWhatsAppConfig(): bool
    {
        $countryCode = preg_replace('/\D+/', '', (string) ($this->whatsapp_default_country_code ?? '')) ?: '';
        if ($countryCode !== '') {
            config(['services.whatsapp.default_country_code' => $countryCode]);
        }

        if ($this->whatsapp_auto_fallback !== null) {
            config(['services.whatsapp.auto_fallback' => (bool) $this->whatsapp_auto_fallback]);
        }

        $hasDbTokenOrUrl = trim((string) ($this->whatsapp_access_token ?? '')) !== ''
            || trim((string) ($this->whatsapp_api_url ?? '')) !== ''
            || trim((string) ($this->whatsapp_phone_number_id ?? '')) !== '';

        if ($this->whatsapp_enabled) {
            self::applyRuntimeWhatsApp([
                'enabled'              => true,
                'provider'             => $this->whatsapp_provider ?: 'local_agent',
                'access_token'         => $this->whatsapp_access_token,
                'phone_number_id'      => $this->whatsapp_phone_number_id,
                'business_account_id'  => $this->whatsapp_business_account_id,
                'api_version'          => $this->whatsapp_api_version ?: 'v21.0',
                'api_url'              => $this->whatsapp_api_url,
                'default_country_code' => $countryCode !== '' ? $countryCode : '92',
                'template_name'        => $this->whatsapp_template_name,
                'template_language'    => $this->whatsapp_template_language ?: 'en_US',
                'auto_fallback'        => $this->whatsapp_auto_fallback ?? true,
            ]);

            return true;
        }

        if ($this->whatsapp_enabled === false && $hasDbTokenOrUrl) {
            config(['services.whatsapp.enabled' => false]);

            return false;
        }

        return ! empty(config('services.whatsapp.access_token'))
            || ! empty(config('services.whatsapp.api_url'));
    }

    /**
     * Configure Laravel's `services.whatsapp` configuration at runtime from an array of WhatsApp credentials.
     */
    public static function applyRuntimeWhatsApp(array $wa): void
    {
        $provider = strtolower(trim((string) ($wa['provider'] ?? 'local_agent')));
        $allowedProviders = [
            'local_agent',
            'waha',
            'evolution_api',
            'whapi_cloud',
            'wasender',
            'ultramsg',
            'green_api',
            'meta_cloud',
            'custom_http',
        ];
        if (! in_array($provider, $allowedProviders, true)) {
            $provider = 'local_agent';
        }

        $countryCode = preg_replace('/\D+/', '', (string) ($wa['default_country_code'] ?? '92')) ?: '92';
        $version = trim((string) ($wa['api_version'] ?? 'v21.0')) ?: 'v21.0';
        if (! str_starts_with($version, 'v') && preg_match('/^\d+(\.\d+)?$/', $version)) {
            $version = 'v' . $version;
        }

        config([
            'services.whatsapp.enabled'              => array_key_exists('enabled', $wa) ? (bool) $wa['enabled'] : true,
            'services.whatsapp.provider'             => $provider,
            'services.whatsapp.access_token'         => trim((string) ($wa['access_token'] ?? '')),
            'services.whatsapp.phone_number_id'      => trim((string) ($wa['phone_number_id'] ?? '')),
            'services.whatsapp.business_account_id'  => trim((string) ($wa['business_account_id'] ?? '')),
            'services.whatsapp.api_version'          => $version,
            'services.whatsapp.api_url'              => trim((string) ($wa['api_url'] ?? '')),
            'services.whatsapp.default_country_code' => $countryCode,
            'services.whatsapp.template_name'        => trim((string) ($wa['template_name'] ?? '')),
            'services.whatsapp.template_language'    => trim((string) ($wa['template_language'] ?? 'en_US')) ?: 'en_US',
            'services.whatsapp.auto_fallback'        => array_key_exists('auto_fallback', $wa) ? (bool) $wa['auto_fallback'] : true,
        ]);
    }
}
