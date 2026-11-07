<?php

namespace App\Services;

use App\Models\License;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class LicenseService
{
    /**
     * Pinned Vendor Master Public Key (Ed25519, 32 bytes in base64url).
     * Hardcoded in source code so deployments never need a key in .env,
     * and local .env tampering cannot replace the verification key.
     */
    public const MASTER_PUBLIC_KEY = 'Fo2gpFWlgBCUcUZ2hUfwCizcT8EwxsrTuFL10gNpC0w';

    /**
     * SHA-256 digest of the raw 32-byte Master Public Key for runtime integrity verification.
     */
    private const MASTER_PUBLIC_KEY_SHA256 = 'b4a91e9a0cc6aa627bd035e7a5407e9c9caffec2c9218cf8cdeb2f9bac0b5b27';

    /**
     * Canonical prefix for formatted Karobar license keys.
     */
    public const KEY_PREFIX = 'KRBL.';

    /**
     * Allowed clock drift tolerance in seconds (15 minutes for minor NTP adjustments).
     */
    public const CLOCK_SKEW_TOLERANCE = 900;

    private static ?string $cachedMachineId = null;
    private static ?string $testPublicKey = null;
    private static ?string $testMachineId = null;
    private static ?int $testCurrentTime = null;

    public static function b64uEncode(string $bin): string
    {
        return rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
    }

    public static function b64uDecode(string $txt): string
    {
        $r = strtr($txt, '-_', '+/');
        $pad = strlen($r) % 4;
        if ($pad) {
            $r .= str_repeat('=', 4 - $pad);
        }
        $decoded = base64_decode($r, true);
        return $decoded === false ? '' : $decoded;
    }

    /**
     * Test-only hooks (strictly gated by runningUnitTests()).
     */
    public static function setTestOverrides(?string $publicKey = null, ?string $machineId = null, ?int $currentTime = null): void
    {
        if (!app()->runningUnitTests()) {
            return;
        }
        self::$testPublicKey = $publicKey;
        self::$testMachineId = $machineId;
        self::$testCurrentTime = $currentTime;
        self::$cachedMachineId = null;
    }

    protected function currentTime(): int
    {
        if (app()->runningUnitTests() && self::$testCurrentTime !== null) {
            return self::$testCurrentTime;
        }
        return time();
    }

    /**
     * Return the raw 32-byte Ed25519 Master Public Key.
     * Never reads from .env so attackers cannot swap the public key.
     */
    public function getPublicKey(): string
    {
        if (app()->runningUnitTests() && self::$testPublicKey !== null) {
            return self::b64uDecode(self::$testPublicKey);
        }

        $raw = self::b64uDecode(self::MASTER_PUBLIC_KEY);
        if (
            strlen($raw) !== SODIUM_CRYPTO_SIGN_PUBLICKEYBYTES
            || !hash_equals(self::MASTER_PUBLIC_KEY_SHA256, hash('sha256', $raw))
        ) {
            throw new \RuntimeException('Master license public key integrity check failed.');
        }

        return $raw;
    }

    /**
     * Normalize a pasted license string (strips whitespace/newlines and optional KRBL. prefix).
     */
    public function normalizeLicenseKey(string $licenseKey, bool $withPrefix = false): string
    {
        $clean = preg_replace('/\s+/', '', trim($licenseKey)) ?? '';
        if (stripos($clean, self::KEY_PREFIX) === 0) {
            $clean = substr($clean, strlen(self::KEY_PREFIX));
        } elseif (stripos($clean, 'KRB-LIC-') === 0) {
            $clean = substr($clean, 8);
        }

        return $withPrefix ? (self::KEY_PREFIX . $clean) : $clean;
    }

    /**
     * Compute a deterministic, unforgeable hardware fingerprint for this machine.
     *
     * Unlike the legacy implementation (which generated random bytes once in .machine-id
     * and blindly trusted the file even when copied to another computer), this derives
     * the fingerprint deterministically from underlying hardware/OS identifiers and seals
     * the cache against the local OS/filesystem envelope.
     */
    public function computeMachineId(): string
    {
        if (app()->runningUnitTests() && self::$testMachineId !== null) {
            return self::$testMachineId;
        }

        if (self::$cachedMachineId !== null) {
            return self::$cachedMachineId;
        }

        $cachePath = storage_path('app/.machine-id');
        $envelope = $this->computeFastOsEnvelope();
        $envSig = hash_hmac('sha256', $envelope, 'KAROBAR-ENV-SIG-V2:' . self::MASTER_PUBLIC_KEY);

        if (is_file($cachePath)) {
            $raw = @file_get_contents($cachePath);
            $data = is_string($raw) ? json_decode($raw, true) : null;
            if (
                is_array($data)
                && !empty($data['id'])
                && !empty($data['env_sig'])
                && !empty($data['id_sig'])
                && hash_equals((string) $data['env_sig'], $envSig)
            ) {
                $expectedIdSig = hash_hmac(
                    'sha256',
                    $data['id'] . '|' . $envSig,
                    'KAROBAR-ID-SEAL-V2:' . self::MASTER_PUBLIC_KEY
                );
                if (hash_equals((string) $data['id_sig'], $expectedIdSig)) {
                    self::$cachedMachineId = (string) $data['id'];
                    return self::$cachedMachineId;
                }
            }
        }

        $basis = $this->probeHardwareBasis();
        $digest = strtoupper(hash_hmac('sha256', $basis, 'KAROBAR-HWID-V2:' . self::MASTER_PUBLIC_KEY));
        $formattedId = 'KRB-' . implode('-', str_split(substr($digest, 0, 16), 4));

        $idSig = hash_hmac('sha256', $formattedId . '|' . $envSig, 'KAROBAR-ID-SEAL-V2:' . self::MASTER_PUBLIC_KEY);
        @file_put_contents($cachePath, json_encode([
            'id' => $formattedId,
            'env_sig' => $envSig,
            'id_sig' => $idSig,
        ], JSON_UNESCAPED_SLASHES));

        self::$cachedMachineId = $formattedId;
        return $formattedId;
    }

    /**
     * Fast (0.01ms) in-process OS + filesystem envelope check to detect if the
     * application folder was moved or copied to a different machine/volume.
     */
    protected function computeFastOsEnvelope(): string
    {
        $statBase = @stat(base_path());
        $dev = $statBase['dev'] ?? 0;
        $ino = $statBase['ino'] ?? 0;

        return implode('|', [
            PHP_OS_FAMILY,
            php_uname('s'),
            php_uname('r'),
            php_uname('m'),
            gethostname() ?: 'local',
            $dev,
            $ino,
        ]);
    }

    /**
     * Deep hardware/OS identifier probe across macOS, Windows, and Linux.
     */
    protected function probeHardwareBasis(): string
    {
        $signals = [
            PHP_OS_FAMILY,
            php_uname('s'),
            php_uname('m'),
        ];

        $hwToken = '';

        if (PHP_OS_FAMILY === 'Darwin') {
            $out = @shell_exec('ioreg -rd1 -c IOPlatformExpertDevice 2>/dev/null');
            if (is_string($out) && $out !== '') {
                $uuid = '';
                $serial = '';
                if (preg_match('/"IOPlatformUUID"\s*=\s*"([^"]+)"/', $out, $m1)) {
                    $uuid = trim($m1[1]);
                }
                if (preg_match('/"IOPlatformSerialNumber"\s*=\s*"([^"]+)"/', $out, $m2)) {
                    $serial = trim($m2[1]);
                }
                if ($uuid !== '' || $serial !== '') {
                    $hwToken = "darwin:{$uuid}:{$serial}";
                }
            }
        } elseif (PHP_OS_FAMILY === 'Windows') {
            $winParts = [];
            $out = @shell_exec('reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid /reg:64 2>nul');
            if (!is_string($out) || !str_contains($out, 'MachineGuid')) {
                $out = @shell_exec('reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid 2>nul');
            }
            if (is_string($out) && preg_match('/MachineGuid\s+REG_SZ\s+([^\r\n]+)/i', $out, $m)) {
                $winParts[] = trim($m[1]);
            }
            $hwOut = @shell_exec('reg query "HKLM\\SYSTEM\\CurrentControlSet\\Control\\SystemInformation" /v ComputerHardwareId /reg:64 2>nul');
            if (!is_string($hwOut) || !str_contains($hwOut, 'ComputerHardwareId')) {
                $hwOut = @shell_exec('reg query "HKLM\\SYSTEM\\CurrentControlSet\\Control\\SystemInformation" /v ComputerHardwareId 2>nul');
            }
            if (is_string($hwOut) && preg_match('/ComputerHardwareId\s+REG_SZ\s+([^\r\n]+)/i', $hwOut, $mHw)) {
                $winParts[] = trim($mHw[1]);
            }
            if (!empty($winParts)) {
                $hwToken = 'win:' . implode(':', $winParts);
            }
        } elseif (PHP_OS_FAMILY === 'Linux') {
            foreach (['/etc/machine-id', '/var/lib/dbus/machine-id', '/sys/class/dmi/id/product_uuid'] as $file) {
                if (is_readable($file)) {
                    $val = trim((string) @file_get_contents($file));
                    if ($val !== '') {
                        $hwToken .= "linux:{$val}|";
                    }
                }
            }
        }

        if ($hwToken === '') {
            $statRoot = @stat(DIRECTORY_SEPARATOR);
            $rootDev = $statRoot['dev'] ?? 0;
            $hwToken = 'fallback:' . (gethostname() ?: php_uname('n')) . ':' . $rootDev;
        }

        $signals[] = $hwToken;

        return implode('|', $signals);
    }

    /**
     * Sign a license payload array with a raw 64-byte Ed25519 secret key and return a canonical KRBL. key string.
     */
    public function signPayload(array $payload, string $secretKeyRaw): string
    {
        if (strlen($secretKeyRaw) !== SODIUM_CRYPTO_SIGN_SECRETKEYBYTES) {
            throw new \InvalidArgumentException('Ed25519 secret key must be 64 raw bytes.');
        }

        $payloadJson = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if (!is_string($payloadJson) || $payloadJson === '') {
            throw new \RuntimeException('Failed to encode license payload to JSON.');
        }

        $sig = sodium_crypto_sign_detached($payloadJson, $secretKeyRaw);

        return self::KEY_PREFIX . self::b64uEncode($sig) . '.' . self::b64uEncode($payloadJson);
    }

    /**
     * Verify a raw license key string (signature, claims, monotonic clock, expiry, and pre-bound machine ID).
     *
     * @return array [bool valid, array|null payload, string|null reason]
     */
    public function verifyString(string $licenseKey, ?string $machineId = null, bool $requireMachineBinding = false): array
    {
        $normalized = $this->normalizeLicenseKey($licenseKey, false);

        if ($normalized === '' || !str_contains($normalized, '.')) {
            return [false, null, 'Malformed license'];
        }

        $parts = explode('.', $normalized, 3);
        if (count($parts) !== 2) {
            return [false, null, 'Malformed license'];
        }

        [$sigB64, $payloadB64] = $parts;
        $sig = self::b64uDecode($sigB64);
        $payloadJson = self::b64uDecode($payloadB64);

        if (strlen($sig) !== SODIUM_CRYPTO_SIGN_BYTES || $payloadJson === '') {
            return [false, null, 'Malformed license'];
        }

        $payload = json_decode($payloadJson, true);
        if (!is_array($payload)) {
            return [false, null, 'Invalid JSON payload'];
        }

        try {
            $ok = sodium_crypto_sign_verify_detached($sig, $payloadJson, $this->getPublicKey());
        } catch (\Throwable $e) {
            return [false, null, 'Bad signature'];
        }

        if (!$ok) {
            return [false, $payload, 'Bad signature'];
        }

        // Validate issuer and subject claims if present
        if (isset($payload['iss']) && !in_array($payload['iss'], ['Karobar', 'KarobarApp', 'YourCompany'], true)) {
            return [false, $payload, 'Invalid license issuer'];
        }
        if (isset($payload['sub']) && !in_array($payload['sub'], ['KarobarApp', 'karobar-pos', 'YourApp'], true)) {
            return [false, $payload, 'Invalid license product'];
        }

        $now = $this->currentTime();

        // Anti-clock-rollback: ensure system clock hasn't been rolled backward behind recorded High-Water Mark
        $highWaterMark = $this->getHighWaterMarkTimestamp();
        if ($highWaterMark > 0 && ($now + self::CLOCK_SKEW_TOLERANCE) < $highWaterMark) {
            return [false, $payload, 'System clock tampering detected. Please restore the correct date and time.'];
        }

        if (isset($payload['nbf']) && $payload['nbf'] !== null && ($now + self::CLOCK_SKEW_TOLERANCE) < (int) $payload['nbf']) {
            return [false, $payload, 'Not yet valid'];
        }

        if (isset($payload['exp']) && $payload['exp'] !== null && (int) $payload['exp'] > 0 && $now > (int) $payload['exp']) {
            return [false, $payload, 'Expired'];
        }

        if ($requireMachineBinding && empty($payload['machine'])) {
            return [false, $payload, 'License key is not bound to a Machine ID'];
        }

        // Always enforce signed machine binding if the license payload specifies a machine ID
        if (!empty($payload['machine'])) {
            $actualMachine = $machineId ?: $this->computeMachineId();
            if (!hash_equals(strtoupper(trim((string) $payload['machine'])), strtoupper(trim($actualMachine)))) {
                return [false, $payload, 'Wrong machine'];
            }
        }

        return [true, $payload, null];
    }

    /**
     * Verify and activate a license key, locking the activated record to this machine's hardware ID.
     * Does NOT pollute the database if the key is invalid.
     *
     * @return array [bool ok, array|null payload, string|null reason, License|null record]
     */
    public function activateLicenseKey(string $licenseKey, bool $requireMachineBinding = false): array
    {
        $machineId = $this->computeMachineId();
        [$ok, $payload, $reason] = $this->verifyString($licenseKey, $machineId, $requireMachineBinding);

        if (!$ok || !is_array($payload)) {
            return [false, $payload, $reason ?? 'Invalid license', null];
        }

        $canonicalKey = $this->normalizeLicenseKey($licenseKey, true);
        $now = Carbon::createFromTimestamp($this->currentTime());
        $activatedTs = $now->timestamp;

        $seal = $this->computeRowSeal($canonicalKey, $machineId, $activatedTs);
        $storedPayload = $payload;
        $storedPayload['_seal'] = $seal;

        $rec = DB::transaction(function () use ($canonicalKey, $storedPayload, $payload, $machineId, $now) {
            License::query()->delete();

            return License::create([
                'license_key' => $canonicalKey,
                'payload' => $storedPayload,
                'valid' => true,
                'reason' => null,
                'machine_hash' => $machineId,
                'activated_at' => $now,
                'expires_at' => !empty($payload['exp']) ? Carbon::createFromTimestamp((int) $payload['exp']) : null,
                'last_verified_at' => $now,
            ]);
        });

        $this->recordMonotonicTimestamp($activatedTs, $rec, true);

        return [true, $this->sanitizePayload($payload), null, $rec];
    }

    /**
     * Compute a hardware-bound cryptographic seal for the database row so that
     * manually editing `valid`, `expires_at`, or `machine_hash` in SQLite fails verification.
     */
    public function computeRowSeal(string $licenseKey, string $machineId, int $activatedTimestamp): string
    {
        $normalizedKey = $this->normalizeLicenseKey($licenseKey, false);
        $normalizedMachine = strtoupper(trim($machineId));
        $data = "{$normalizedKey}|{$normalizedMachine}|{$activatedTimestamp}";
        $sealKey = hash_hmac('sha256', $normalizedMachine, 'KAROBAR-ROW-SEAL-V2:' . self::MASTER_PUBLIC_KEY, true);

        return hash_hmac('sha256', $data, $sealKey);
    }

    /**
     * Verify that the database row was legitimately activated on this exact hardware.
     */
    public function verifyRowSeal(License $rec, string $currentMachineId): bool
    {
        if (empty($rec->machine_hash)) {
            return false;
        }

        if (!hash_equals(strtoupper(trim((string) $rec->machine_hash)), strtoupper(trim($currentMachineId)))) {
            return false;
        }

        $payload = is_array($rec->payload) ? $rec->payload : [];
        $storedSeal = $payload['_seal'] ?? null;
        if (!is_string($storedSeal) || $storedSeal === '') {
            return false;
        }

        $activatedTs = $rec->activated_at ? $rec->activated_at->timestamp : 0;
        $expectedSeal = $this->computeRowSeal((string) $rec->license_key, $currentMachineId, $activatedTs);

        return hash_equals($expectedSeal, $storedSeal);
    }

    /**
     * Remove internal seal fields before returning payload to API consumers.
     */
    public function sanitizePayload(?array $payload): ?array
    {
        if (!is_array($payload)) {
            return null;
        }
        unset($payload['_seal']);
        return $payload;
    }

    /**
     * Check current license status with full cryptographic, hardware-lock, and clock-tamper verification.
     */
    public function currentStatus(): array
    {
        $rec = License::latest('id')->first();
        if (!$rec) {
            return ['valid' => false, 'reason' => 'No license installed'];
        }

        $currentMachineId = $this->computeMachineId();
        [$ok, $payload, $reason] = $this->verifyString($rec->license_key, $currentMachineId);

        if ($ok) {
            if (!$this->verifyRowSeal($rec, $currentMachineId)) {
                $ok = false;
                $reason = 'Wrong machine';
            }
        }

        if ($ok) {
            $this->recordMonotonicTimestamp($this->currentTime(), $rec);
        }

        $cleanPayload = $this->sanitizePayload($payload);

        return [
            'valid' => $ok,
            'reason' => $reason,
            'payload' => $cleanPayload,
            'expires_at' => $cleanPayload['exp'] ?? null,
        ];
    }

    /**
     * Check license and auto-revoke if machine ID changed (software copied to new device).
     * Returns: [bool valid, string|null reason, bool wasRevoked]
     */
    public function checkAndAutoRevokeOnMachineChange(): array
    {
        $rec = License::latest('id')->first();
        if (!$rec) {
            return [false, 'No license installed', false];
        }

        $currentMachineId = $this->computeMachineId();
        [$ok, $payload, $reason] = $this->verifyString($rec->license_key, $currentMachineId);

        if ($ok && !$this->verifyRowSeal($rec, $currentMachineId)) {
            $ok = false;
            $reason = 'Wrong machine';
        }

        if (!$ok && $reason === 'Wrong machine') {
            $rec->delete();
            return [false, 'License revoked - software moved to new device', true];
        }

        return [$ok, $reason, false];
    }

    /**
     * Clear license if machine ID doesn't match (for login-time check).
     * Returns true if license was cleared.
     */
    public function clearLicenseIfMachineChanged(): bool
    {
        $rec = License::latest('id')->first();
        if (!$rec) {
            return false;
        }

        $currentMachineId = $this->computeMachineId();
        [$ok, , $reason] = $this->verifyString($rec->license_key, $currentMachineId);

        if ($ok && !$this->verifyRowSeal($rec, $currentMachineId)) {
            $ok = false;
            $reason = 'Wrong machine';
        }

        if (!$ok && $reason === 'Wrong machine') {
            $rec->delete();
            return true;
        }

        return false;
    }

    /**
     * Return the highest observed timestamp across the license table, monotonic clock ledger,
     * and recent system activity to detect system clock rollback attacks.
     */
    public function getHighWaterMarkTimestamp(): int
    {
        $maxTs = 0;
        $hasValidClockFile = false;

        // 1. Check HMAC-protected monotonic clock file (skip during unit tests for test isolation)
        if (!app()->runningUnitTests()) {
            $clockPath = storage_path('app/.license-clock');
            if (is_file($clockPath)) {
                $raw = @file_get_contents($clockPath);
                $data = is_string($raw) ? json_decode($raw, true) : null;
                if (is_array($data) && isset($data['ts'], $data['sig'])) {
                    $ts = (int) $data['ts'];
                    $expectedSig = hash_hmac('sha256', (string) $ts, 'KAROBAR-CLOCK-SEAL-V2:' . self::MASTER_PUBLIC_KEY);
                    if (hash_equals($expectedSig, (string) $data['sig']) && $ts > $maxTs) {
                        $maxTs = $ts;
                        $hasValidClockFile = true;
                    }
                }
            }
        }

        // 2. Check active license timestamps (and scan core tables only if clock file is missing or in unit tests)
        try {
            $rec = License::latest('id')->first();
            if ($rec) {
                if ($rec->activated_at && $rec->activated_at->timestamp > $maxTs) {
                    $maxTs = $rec->activated_at->timestamp;
                }
                if ($rec->last_verified_at && $rec->last_verified_at->timestamp > $maxTs) {
                    $maxTs = $rec->last_verified_at->timestamp;
                }
            }

            // 3. Check latest system-generated created_at in core tables when initializing clock or running tests
            if (!$hasValidClockFile || app()->runningUnitTests()) {
                foreach (['sale_invoices', 'purchase_invoices', 'payments', 'personal_access_tokens'] as $table) {
                    if (Schema::hasTable($table)) {
                        $latest = DB::table($table)->max('created_at');
                        if ($latest) {
                            $ts = strtotime((string) $latest);
                            if ($ts !== false && $ts > $maxTs) {
                                $maxTs = $ts;
                            }
                        }
                    }
                }
            }
        } catch (\Throwable $e) {
            // Ignore DB errors during early boot/migrations
        }

        return $maxTs;
    }

    /**
     * Advance the monotonic High-Water Mark clock when time moves forward.
     */
    public function recordMonotonicTimestamp(int $timestamp, ?License $rec = null, bool $force = false): void
    {
        if (!app()->runningUnitTests()) {
            $clockPath = storage_path('app/.license-clock');
            $existingTs = 0;
            if (is_file($clockPath)) {
                $raw = @file_get_contents($clockPath);
                $data = is_string($raw) ? json_decode($raw, true) : null;
                if (is_array($data) && isset($data['ts'])) {
                    $existingTs = (int) $data['ts'];
                }
            }

            if ($force || ($timestamp - $existingTs) >= 60) {
                $newTs = max($timestamp, $existingTs);
                $sig = hash_hmac('sha256', (string) $newTs, 'KAROBAR-CLOCK-SEAL-V2:' . self::MASTER_PUBLIC_KEY);
                @file_put_contents($clockPath, json_encode([
                    'ts' => $newTs,
                    'sig' => $sig,
                ], JSON_UNESCAPED_SLASHES));
            }
        }

        if ($rec) {
            $lastVerifiedTs = $rec->last_verified_at ? $rec->last_verified_at->timestamp : 0;
            if ($force || ($timestamp - $lastVerifiedTs) >= 300) {
                try {
                    $rec->update([
                        'last_verified_at' => Carbon::createFromTimestamp(max($timestamp, $lastVerifiedTs)),
                    ]);
                } catch (\Throwable $e) {
                    // Ignore read-only DB errors
                }
            }
        }
    }
}
