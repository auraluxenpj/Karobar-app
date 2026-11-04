<?php

namespace App\Services;

use App\Models\Setting;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;

class LocalWhatsAppAgentService
{
    public const DEFAULT_PORT = 3001;
    public const DEFAULT_HOST = '127.0.0.1';

    /**
     * Self-healing schema check: if the app was deployed to a new Laravel Herd machine
     * before `php artisan migrate` was run for the WhatsApp columns, automatically add them
     * so `Setting::save()` never triggers a 500 QueryException.
     */
    public function ensureWhatsAppSchema(): void
    {
        try {
            if (!Schema::hasTable('settings')) {
                return;
            }
            if (
                Schema::hasColumn('settings', 'whatsapp_enabled')
                && Schema::hasColumn('settings', 'whatsapp_access_token')
                && Schema::hasColumn('settings', 'share_paper_size')
                && Schema::hasColumn('settings', 'share_show_logo')
            ) {
                return;
            }

            Schema::table('settings', function (Blueprint $table) {
                if (!Schema::hasColumn('settings', 'whatsapp_enabled')) {
                    $table->boolean('whatsapp_enabled')->default(false);
                }
                if (!Schema::hasColumn('settings', 'whatsapp_provider')) {
                    $table->string('whatsapp_provider', 40)->nullable()->default('local_agent');
                }
                if (!Schema::hasColumn('settings', 'whatsapp_access_token')) {
                    $table->text('whatsapp_access_token')->nullable();
                }
                if (!Schema::hasColumn('settings', 'whatsapp_phone_number_id')) {
                    $table->string('whatsapp_phone_number_id', 120)->nullable();
                }
                if (!Schema::hasColumn('settings', 'whatsapp_business_account_id')) {
                    $table->string('whatsapp_business_account_id', 120)->nullable();
                }
                if (!Schema::hasColumn('settings', 'whatsapp_api_version')) {
                    $table->string('whatsapp_api_version', 20)->nullable()->default('v21.0');
                }
                if (!Schema::hasColumn('settings', 'whatsapp_api_url')) {
                    $table->string('whatsapp_api_url', 500)->nullable();
                }
                if (!Schema::hasColumn('settings', 'whatsapp_default_country_code')) {
                    $table->string('whatsapp_default_country_code', 10)->nullable()->default('92');
                }
                if (!Schema::hasColumn('settings', 'whatsapp_template_name')) {
                    $table->string('whatsapp_template_name', 120)->nullable();
                }
                if (!Schema::hasColumn('settings', 'whatsapp_template_language')) {
                    $table->string('whatsapp_template_language', 20)->nullable()->default('en_US');
                }
                if (!Schema::hasColumn('settings', 'whatsapp_auto_fallback')) {
                    $table->boolean('whatsapp_auto_fallback')->default(true);
                }
                if (!Schema::hasColumn('settings', 'share_paper_size')) {
                    $table->string('share_paper_size', 20)->nullable()->default('a4');
                }
                if (!Schema::hasColumn('settings', 'share_show_logo')) {
                    $table->boolean('share_show_logo')->default(true);
                }
            });
        } catch (Throwable) {
            // Ignore schema inspection/alter errors if DB is read-only or unavailable
        }
    }

    public function resolveSetting(?Setting $setting = null): ?Setting
    {
        $this->ensureWhatsAppSchema();

        if ($setting !== null) {
            return $setting;
        }

        try {
            if (!Schema::hasTable('settings')) {
                return null;
            }
            $existing = Setting::first();
            if ($existing) {
                return $existing;
            }

            return Setting::create([
                'store_name'   => 'Karobar App',
                'printer_type' => 'a4',
            ]);
        } catch (Throwable) {
            return null;
        }
    }

    public function resolveAgentUrl(?Setting $setting = null): string
    {
        $setting = $this->resolveSetting($setting);
        $configured = trim((string) ($setting?->whatsapp_api_url ?: config('services.whatsapp.api_url', '')));

        if ($configured !== '' && (str_contains($configured, '127.0.0.1') || str_contains($configured, 'localhost'))) {
            $parsed = parse_url($configured);
            $scheme = $parsed['scheme'] ?? 'http';
            $host = $parsed['host'] ?? self::DEFAULT_HOST;
            $port = $parsed['port'] ?? self::DEFAULT_PORT;

            return "{$scheme}://{$host}:{$port}";
        }

        return 'http://' . self::DEFAULT_HOST . ':' . self::DEFAULT_PORT;
    }

    public function ensureApiKey(?Setting $setting = null): string
    {
        $setting = $this->resolveSetting($setting);
        $existing = trim((string) ($setting?->whatsapp_access_token ?: config('services.whatsapp.access_token', '')));

        if ($existing !== '') {
            return $existing;
        }

        $generated = 'karobar_wa_' . Str::random(24);
        if ($setting) {
            try {
                if (Schema::hasColumn('settings', 'whatsapp_access_token')) {
                    $setting->whatsapp_access_token = $generated;
                    $setting->save();
                }
            } catch (Throwable) {
                // Ignore if column or table is temporarily locked
            }
        }

        return $generated;
    }

    /**
     * Query the local Node.js Baileys WhatsApp Agent status.
     */
    public function status(?Setting $setting = null): array
    {
        $setting = $this->resolveSetting($setting);
        $baseUrl = $this->resolveAgentUrl($setting);
        $apiKey = $this->ensureApiKey($setting);

        try {
            $response = Http::timeout(2)
                ->connectTimeout(1)
                ->acceptJson()
                ->withHeaders(['X-Api-Key' => $apiKey])
                ->get($baseUrl . '/status');

            if ($response->successful()) {
                $data = $response->json() ?: [];

                return array_merge($data, [
                    'ok'            => true,
                    'agent_running' => true,
                    'agent_url'     => $baseUrl,
                    'api_key'       => $apiKey,
                ]);
            }
        } catch (Throwable) {
            // Agent process is not running on port 3001
        }

        return [
            'ok'            => true,
            'agent_running' => false,
            'status'        => 'stopped',
            'qr_data_url'   => null,
            'pairing_code'  => null,
            'user'          => null,
            'last_error'    => $this->readRecentAgentError(),
            'agent_url'     => $baseUrl,
            'api_key'       => $apiKey,
        ];
    }

    /**
     * Start the built-in Node.js WhatsApp Agent in the background if not already running,
     * and persist the local_agent configuration in Settings.
     */
    public function start(?Setting $setting = null): array
    {
        $setting = $this->resolveSetting($setting);
        $baseUrl = $this->resolveAgentUrl($setting);
        $apiKey = $this->ensureApiKey($setting);

        // Save local_agent settings automatically if columns exist
        if ($setting) {
            try {
                if (Schema::hasColumn('settings', 'whatsapp_enabled')) {
                    $setting->whatsapp_enabled = true;
                    $setting->whatsapp_provider = 'local_agent';
                    $setting->whatsapp_api_url = $baseUrl;
                    $setting->whatsapp_access_token = $apiKey;
                    $setting->save();
                }
            } catch (Throwable) {
                // Continue even if settings table save fails
            }
        }

        $current = $this->status($setting);
        if (!empty($current['agent_running'])) {
            if (in_array($current['status'] ?? '', ['disconnected', 'error'], true)) {
                try {
                    Http::timeout(2)
                        ->connectTimeout(1)
                        ->withHeaders(['X-Api-Key' => $apiKey])
                        ->post($baseUrl . '/restart');
                    usleep(400000);
                } catch (Throwable) {
                    // ignore
                }
            }

            return $this->status($setting);
        }

        $scriptPath = base_path('scripts/whatsapp-agent.mjs');
        $spawnerPath = base_path('scripts/whatsapp-agent-spawn.cjs');

        if (!is_file($scriptPath)) {
            throw new RuntimeException("Built-in WhatsApp Agent script not found at {$scriptPath}");
        }

        if (!is_dir(base_path('node_modules/@whiskeysockets/baileys'))) {
            throw new RuntimeException(
                "Node.js WhatsApp packages (@whiskeysockets/baileys) are missing on this server. "
                . "Please open a terminal in your project folder (" . base_path() . ") and run: npm install"
            );
        }

        $nodeBinary = $this->resolveNodeBinary();
        if ($nodeBinary === '') {
            throw new RuntimeException(
                "Node.js executable could not be found by Laravel Herd / PHP. "
                . "Please ensure Node.js is installed (in Herd -> Node or https://nodejs.org) or set WHATSAPP_NODE_BINARY in your .env file."
            );
        }

        $parsed = parse_url($baseUrl);
        $port = (int) ($parsed['port'] ?? self::DEFAULT_PORT);
        $host = (string) ($parsed['host'] ?? self::DEFAULT_HOST);
        $logFile = storage_path('logs/whatsapp-agent.log');
        $storageDir = storage_path('app/whatsapp-agent');

        if (!is_dir(dirname($logFile))) {
            @mkdir(dirname($logFile), 0755, true);
        }
        if (!is_dir($storageDir)) {
            @mkdir($storageDir, 0755, true);
        }

        // Clear stale error log before starting fresh
        @file_put_contents($logFile, '');

        $this->spawnDetachedAgent(
            nodeBinary: $nodeBinary,
            spawnerPath: $spawnerPath,
            scriptPath: $scriptPath,
            logFile: $logFile,
            storageDir: $storageDir,
            host: $host,
            port: $port,
            apiKey: $apiKey
        );

        // Poll up to 4 seconds for the HTTP server & QR generation to become ready
        for ($i = 0; $i < 16; $i++) {
            usleep(250000);
            $check = $this->status($setting);
            if (!empty($check['agent_running'])) {
                if (in_array($check['status'] ?? '', ['qr_ready', 'connected'], true) || $i >= 8) {
                    return $check;
                }
            }
        }

        $finalStatus = $this->status($setting);
        if (empty($finalStatus['agent_running'])) {
            $logErr = $this->readRecentAgentError();
            $detail = $logErr ? " Details: {$logErr}" : '';
            throw new RuntimeException(
                "Could not start the local WhatsApp Agent using Node ({$nodeBinary}).{$detail}"
            );
        }

        return $finalStatus;
    }

    /**
     * Spawn the background Node.js WhatsApp Agent without holding any PHP-FPM / PHP-CGI / Laravel Herd
     * file descriptors open on Windows, macOS, or Linux.
     */
    protected function spawnDetachedAgent(
        string $nodeBinary,
        string $spawnerPath,
        string $scriptPath,
        string $logFile,
        string $storageDir,
        string $host,
        int $port,
        string $apiKey
    ): void {
        $nodeDir = dirname($nodeBinary);
        $pathSep = DIRECTORY_SEPARATOR === '\\' ? ';' : ':';
        $currentPath = getenv('PATH') ?: ($_SERVER['PATH'] ?? '');
        $mergedPath = $nodeDir . ($currentPath !== '' ? $pathSep . $currentPath : '');

        $env = array_merge($_ENV, [
            'PATH'                       => $mergedPath,
            'WHATSAPP_AGENT_PORT'        => (string) $port,
            'WHATSAPP_AGENT_HOST'        => $host,
            'WHATSAPP_AGENT_API_KEY'     => $apiKey,
            'WHATSAPP_AGENT_STORAGE_DIR' => $storageDir,
            'NODE_NO_WARNINGS'           => '1',
        ]);

        // Preserve Windows system environment variables required by Node.js networking & winsock
        if (DIRECTORY_SEPARATOR === '\\') {
            foreach (['SystemRoot', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP'] as $winVar) {
                $val = getenv($winVar) ?: ($_SERVER[$winVar] ?? null);
                if ($val !== null && $val !== false && $val !== '') {
                    $env[$winVar] = (string) $val;
                }
            }
            if (empty($env['SystemRoot']) && is_dir('C:\\Windows')) {
                $env['SystemRoot'] = 'C:\\Windows';
            }
        } else {
            $home = getenv('HOME') ?: ($_SERVER['HOME'] ?? '');
            if ($home !== '') {
                $env['HOME'] = $home;
            }
        }

        // Preferred method: proc_open with bypass_shell + whatsapp-agent-spawn.cjs (exits in <30ms, zero pipe hang on Herd Windows/macOS)
        if (function_exists('proc_open') && is_file($spawnerPath)) {
            $descriptors = [
                0 => ['pipe', 'r'],
                1 => ['pipe', 'w'],
                2 => ['pipe', 'w'],
            ];
            $options = DIRECTORY_SEPARATOR === '\\' ? ['bypass_shell' => true] : [];
            $process = @proc_open(
                [$nodeBinary, $spawnerPath, $scriptPath, $logFile],
                $descriptors,
                $pipes,
                base_path(),
                $env,
                $options
            );

            if (is_resource($process)) {
                foreach ($pipes as $pipe) {
                    if (is_resource($pipe)) {
                        @fclose($pipe);
                    }
                }
                @proc_close($process);
                return;
            }
        }

        // Fallback if proc_open is disabled in php.ini
        if (DIRECTORY_SEPARATOR === '\\') {
            putenv("WHATSAPP_AGENT_PORT={$port}");
            putenv("WHATSAPP_AGENT_HOST={$host}");
            putenv("WHATSAPP_AGENT_API_KEY={$apiKey}");
            putenv("WHATSAPP_AGENT_STORAGE_DIR={$storageDir}");

            if (is_file($spawnerPath)) {
                $cmd = sprintf(
                    '""%s" "%s" "%s" "%s""',
                    $nodeBinary,
                    $spawnerPath,
                    $scriptPath,
                    $logFile
                );
                @exec($cmd);
            }
        } else {
            $cmd = sprintf(
                'PATH=%s:$PATH WHATSAPP_AGENT_PORT=%d WHATSAPP_AGENT_HOST=%s WHATSAPP_AGENT_API_KEY=%s WHATSAPP_AGENT_STORAGE_DIR=%s nohup %s %s >> %s 2>&1 </dev/null &',
                escapeshellarg($nodeDir),
                $port,
                escapeshellarg($host),
                escapeshellarg($apiKey),
                escapeshellarg($storageDir),
                escapeshellarg($nodeBinary),
                escapeshellarg($scriptPath),
                escapeshellarg($logFile)
            );
            @exec($cmd);
        }
    }

    /**
     * Request an 8-digit phone number pairing code from the built-in agent.
     */
    public function requestPairingCode(string $rawPhone, ?Setting $setting = null): array
    {
        $setting = $this->resolveSetting($setting);
        $status = $this->status($setting);

        if (empty($status['agent_running'])) {
            $status = $this->start($setting);
        }

        $baseUrl = $this->resolveAgentUrl($setting);
        $apiKey = $this->ensureApiKey($setting);
        $defaultCountryCode = (string) ($setting?->whatsapp_default_country_code ?: '92');

        $normalizedPhone = app(DocumentShareService::class)->normalizePhone($rawPhone, $defaultCountryCode);
        if (!$normalizedPhone) {
            throw new RuntimeException('Please enter a valid WhatsApp phone number (e.g. 0300-1234567).');
        }

        $response = Http::timeout(15)
            ->acceptJson()
            ->asJson()
            ->withHeaders(['X-Api-Key' => $apiKey])
            ->post($baseUrl . '/pair-code', [
                'phone' => $normalizedPhone,
            ]);

        $json = $response->json() ?: [];
        if ($response->failed() || empty($json['ok'])) {
            throw new RuntimeException($json['message'] ?? 'Failed to request 8-digit pairing code from WhatsApp.');
        }

        return $json;
    }

    /**
     * Unlink the currently connected WhatsApp account and generate a fresh QR code.
     */
    public function logout(?Setting $setting = null): array
    {
        $setting = $this->resolveSetting($setting);
        $baseUrl = $this->resolveAgentUrl($setting);
        $apiKey = $this->ensureApiKey($setting);

        try {
            $response = Http::timeout(10)
                ->acceptJson()
                ->withHeaders(['X-Api-Key' => $apiKey])
                ->post($baseUrl . '/logout');

            if ($response->successful()) {
                usleep(800000);

                return $this->status($setting);
            }
        } catch (Throwable) {
            // If agent wasn't running, clear auth folder directly
        }

        $authDir = storage_path('app/whatsapp-agent/auth');
        if (is_dir($authDir)) {
            $files = glob($authDir . '/*') ?: [];
            foreach ($files as $file) {
                if (is_file($file)) {
                    @unlink($file);
                }
            }
        }

        return $this->status($setting);
    }

    /**
     * Stop the background Node.js WhatsApp Agent process.
     */
    public function stop(?Setting $setting = null): array
    {
        $setting = $this->resolveSetting($setting);
        $baseUrl = $this->resolveAgentUrl($setting);
        $apiKey = $this->ensureApiKey($setting);

        try {
            Http::timeout(3)
                ->acceptJson()
                ->withHeaders(['X-Api-Key' => $apiKey])
                ->post($baseUrl . '/shutdown');
            usleep(300000);
        } catch (Throwable) {
            // Already stopped
        }

        return $this->status($setting);
    }

    /**
     * Locate the Node.js executable across Laravel Herd (macOS & Windows), Homebrew, NVM, FNM, Volta, Laragon, and system paths.
     */
    public function resolveNodeBinary(): string
    {
        $envBinary = trim((string) (getenv('WHATSAPP_NODE_BINARY') ?: getenv('NODE_BINARY') ?: env('WHATSAPP_NODE_BINARY', '')));
        if ($envBinary !== '' && is_file($envBinary)) {
            return $envBinary;
        }

        $candidates = [];

        if (DIRECTORY_SEPARATOR === '\\') {
            // Windows: Laravel Herd, standard Node.js installer, NVM for Windows, FNM, Laragon
            $userProfile = getenv('USERPROFILE') ?: ($_SERVER['USERPROFILE'] ?? '');
            $appData = getenv('APPDATA') ?: ($_SERVER['APPDATA'] ?? '');
            $localAppData = getenv('LOCALAPPDATA') ?: ($_SERVER['LOCALAPPDATA'] ?? '');

            $winPatterns = array_filter([
                $userProfile ? $userProfile . '\\.config\\herd\\bin\\nvm\\*\\node.exe' : null,
                $userProfile ? $userProfile . '\\.config\\herd\\bin\\node.exe' : null,
                'C:\\Users\\*\\.config\\herd\\bin\\nvm\\*\\node.exe',
                'C:\\Users\\*\\.config\\herd\\bin\\node.exe',
                'C:\\Program Files\\nodejs\\node.exe',
                'C:\\Program Files (x86)\\nodejs\\node.exe',
                $localAppData ? $localAppData . '\\Programs\\nodejs\\node.exe' : null,
                'C:\\Users\\*\\AppData\\Local\\Programs\\nodejs\\node.exe',
                $appData ? $appData . '\\nvm\\*\\node.exe' : null,
                'C:\\Users\\*\\AppData\\Roaming\\nvm\\*\\node.exe',
                'C:\\nvm4w\\nodejs\\node.exe',
                'C:\\laragon\\bin\\nodejs\\node-*\\node.exe',
            ]);

            foreach ($winPatterns as $pattern) {
                if (str_contains($pattern, '*')) {
                    $matches = glob($pattern) ?: [];
                    if (!empty($matches)) {
                        rsort($matches, SORT_NATURAL);
                        array_push($candidates, ...$matches);
                    }
                } else {
                    $candidates[] = $pattern;
                }
            }

            foreach ($candidates as $candidate) {
                if (is_file($candidate)) {
                    return $candidate;
                }
            }

            if (function_exists('exec')) {
                $out = [];
                @exec('where.exe node 2>NUL', $out);
                foreach ($out as $line) {
                    $line = trim($line);
                    if ($line !== '' && is_file($line)) {
                        return $line;
                    }
                }
            }

            return '';
        }

        // macOS & Linux: Laravel Herd NVM, Homebrew, NVM, FNM, Volta, system paths
        $home = getenv('HOME') ?: ($_SERVER['HOME'] ?? '');
        $unixPatterns = array_filter([
            $home ? $home . '/Library/Application Support/Herd/config/nvm/versions/node/*/bin/node' : null,
            '/Users/*/Library/Application Support/Herd/config/nvm/versions/node/*/bin/node',
            $home ? $home . '/Library/Application Support/Herd/bin/node' : null,
            '/Users/*/Library/Application Support/Herd/bin/node',
            $home ? $home . '/.nvm/versions/node/*/bin/node' : null,
            '/Users/*/.nvm/versions/node/*/bin/node',
            $home ? $home . '/.fnm/node-versions/*/installation/bin/node' : null,
            '/Users/*/.fnm/node-versions/*/installation/bin/node',
            $home ? $home . '/.volta/bin/node' : null,
            '/Users/*/.volta/bin/node',
            '/opt/homebrew/bin/node',
            '/opt/homebrew/opt/node*/bin/node',
            '/usr/local/bin/node',
            '/usr/bin/node',
        ]);

        foreach ($unixPatterns as $pattern) {
            if (str_contains($pattern, '*')) {
                $matches = glob($pattern) ?: [];
                if (!empty($matches)) {
                    rsort($matches, SORT_NATURAL);
                    array_push($candidates, ...$matches);
                }
            } else {
                $candidates[] = $pattern;
            }
        }

        foreach ($candidates as $candidate) {
            if (is_file($candidate) && is_executable($candidate)) {
                return $candidate;
            }
        }

        if (function_exists('exec')) {
            $out = [];
            @exec('command -v node 2>/dev/null', $out);
            $found = trim($out[0] ?? '');
            if ($found !== '' && is_file($found) && is_executable($found)) {
                return $found;
            }
        }

        return '';
    }

    /**
     * Read the last non-empty error line from storage/logs/whatsapp-agent.log if the agent failed to start.
     */
    protected function readRecentAgentError(): ?string
    {
        $logFile = storage_path('logs/whatsapp-agent.log');
        if (!is_file($logFile)) {
            return null;
        }

        try {
            $content = trim((string) @file_get_contents($logFile));
            if ($content === '') {
                return null;
            }
            $lines = array_values(array_filter(
                preg_split('/\r\n|\r|\n/', $content) ?: [],
                fn (string $line) => trim($line) !== '' && !str_contains($line, '[WhatsApp Agent] Listening on')
            ));
            if (empty($lines)) {
                return null;
            }

            return Str::limit(end($lines), 240);
        } catch (Throwable) {
            return null;
        }
    }
}
