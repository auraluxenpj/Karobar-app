<?php

namespace App\Console\Commands;

use App\Services\LicenseService;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

class LicenseIssueCommand extends Command
{
    protected $signature = 'license:issue
                            {--machine= : Target hardware Machine ID (e.g. KRB-XXXX-XXXX-XXXX-XXXX) to permanently bind this key}
                            {--name=Karobar Licensed Store : Customer / Store Name}
                            {--edition=Professional : License Edition (Standard, Professional, Enterprise)}
                            {--days=365 : Validity in days (use 0 or --lifetime for never-expiring license)}
                            {--lifetime : Issue a lifetime license (no expiration)}
                            {--seats=1 : Number of licensed seats/terminals}
                            {--lid= : Custom License ID (auto-generated if omitted)}
                            {--secret-key= : Vendor 64-byte Ed25519 Secret Key in base64url (or set KAROBAR_LICENSE_SECRET_KEY in .env)}
                            {--allow-unbound : Allow issuing an unbound key without --machine}
                            {--generate-keypair : Generate a new Ed25519 Master Keypair and exit}
                            {--json : Output result as JSON}';

    protected $description = 'Issue an Ed25519-signed, hardware-bound Karobar license key (KRBL.<sig>.<payload>) for a specific client Machine ID';

    public function handle(LicenseService $licenseService): int
    {
        if ($this->option('generate-keypair')) {
            $kp = sodium_crypto_sign_keypair();
            $sec = sodium_crypto_sign_secretkey($kp);
            $pub = sodium_crypto_sign_publickey($kp);
            $pubB64u = LicenseService::b64uEncode($pub);
            $secB64u = LicenseService::b64uEncode($sec);
            $pubSha256 = hash('sha256', $pub);

            if ($this->option('json')) {
                $this->line(json_encode([
                    'public_key'        => $pubB64u,
                    'public_key_sha256' => $pubSha256,
                    'secret_key'        => $secB64u,
                ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
                return self::SUCCESS;
            }

            $this->info('Generated New Ed25519 License Keypair:');
            $this->line('MASTER_PUBLIC_KEY        : ' . $pubB64u);
            $this->line('MASTER_PUBLIC_KEY_SHA256 : ' . $pubSha256);
            $this->line('KAROBAR_LICENSE_SECRET_KEY (Keep Secret!): ' . $secB64u);
            return self::SUCCESS;
        }

        $machine = strtoupper(trim((string) $this->option('machine')));
        if ($machine === '' && !$this->option('allow-unbound')) {
            $this->error('A target --machine=KRB-XXXX-XXXX-XXXX-XXXX is required so this license key is permanently bound to a single machine.');
            return self::FAILURE;
        }

        if ($machine !== '' && !preg_match('/^KRB-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/', $machine)) {
            $this->error("Invalid Machine ID format '{$machine}'. Expected format: KRB-XXXX-XXXX-XXXX-XXXX");
            return self::FAILURE;
        }

        $secretB64u = trim((string) ($this->option('secret-key') ?: env('KAROBAR_LICENSE_SECRET_KEY', '')));
        if ($secretB64u === '') {
            $siblingKeygen = dirname(base_path()) . DIRECTORY_SEPARATOR . 'Karobar-License-Generator' . DIRECTORY_SEPARATOR . 'keygen.php';
            if (is_file($siblingKeygen)) {
                $keygenSrc = (string) @file_get_contents($siblingKeygen);
                if (preg_match("/MASTER_SECRET_B64U\s*=\s*'([^']+)'/", $keygenSrc, $m)) {
                    $secretB64u = trim($m[1]);
                }
            }
        }
        if ($secretB64u === '') {
            $this->error('Missing Ed25519 secret key. Pass --secret-key=<base64url> or set KAROBAR_LICENSE_SECRET_KEY in your vendor .env file.');
            return self::FAILURE;
        }

        $secretRaw = LicenseService::b64uDecode($secretB64u);
        if (strlen($secretRaw) === SODIUM_CRYPTO_SIGN_SEEDBYTES) {
            $kp = sodium_crypto_sign_seed_keypair($secretRaw);
            $secretRaw = sodium_crypto_sign_secretkey($kp);
        }

        if (strlen($secretRaw) !== SODIUM_CRYPTO_SIGN_SECRETKEYBYTES) {
            $this->error('Invalid Ed25519 secret key length (must be 64 bytes or a 32-byte seed in base64url).');
            return self::FAILURE;
        }

        $now = time();
        $days = (int) $this->option('days');
        $isLifetime = (bool) $this->option('lifetime') || $days <= 0;
        $exp = $isLifetime ? null : ($now + ($days * 86400));
        $lid = trim((string) $this->option('lid')) ?: ('LIC-' . date('Ymd') . '-' . strtoupper(Str::random(4)));

        $payload = [
            'iss'      => 'Karobar',
            'sub'      => 'KarobarApp',
            'ver'      => 2,
            'lid'      => $lid,
            'name'     => trim((string) $this->option('name')) ?: 'Karobar Licensed Store',
            'Edition'  => trim((string) $this->option('edition')) ?: 'Professional',
            'features' => ['core', 'pos', 'inventory', 'accounting', 'hr', 'reports', 'whatsapp', 'cube_ai'],
            'seats'    => max(1, (int) $this->option('seats')),
            'iat'      => $now,
            'nbf'      => null,
            'exp'      => $exp,
        ];

        if ($machine !== '') {
            $payload['machine'] = $machine;
        }

        $licenseKey = $licenseService->signPayload($payload, $secretRaw);

        if ($this->option('json')) {
            $this->line(json_encode([
                'ok'          => true,
                'license_key' => $licenseKey,
                'payload'     => $payload,
            ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
            return self::SUCCESS;
        }

        $this->info('License Key Issued Successfully:');
        $this->line('--------------------------------------------------------------------------------');
        $this->line($licenseKey);
        $this->line('--------------------------------------------------------------------------------');
        $this->line('Store Name : ' . $payload['name']);
        $this->line('Edition    : ' . $payload['Edition']);
        $this->line('Machine ID : ' . ($payload['machine'] ?? 'UNBOUND'));
        $this->line('Expires    : ' . ($exp ? date('Y-m-d H:i:s', $exp) : 'Lifetime (Never)'));

        return self::SUCCESS;
    }
}

