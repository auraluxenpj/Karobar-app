<?php

/**
 * Standalone Pre-Install Hardware Fingerprint & Ed25519 License Verifier for Inno Setup.
 * Runs in <30ms from {tmp}\krb-verify before application extraction begins.
 * Matches App\Services\LicenseService byte-for-byte.
 */

const MASTER_PUBLIC_KEY = 'Fo2gpFWlgBCUcUZ2hUfwCizcT8EwxsrTuFL10gNpC0w';
const MASTER_PUBLIC_KEY_SHA256 = 'b4a91e9a0cc6aa627bd035e7a5407e9c9caffec2c9218cf8cdeb2f9bac0b5b27';
const KEY_PREFIX = 'KRBL.';
const CLOCK_SKEW_TOLERANCE = 900;

function b64uDecode(string $txt): string
{
    $r = strtr($txt, '-_', '+/');
    $pad = strlen($r) % 4;
    if ($pad) {
        $r .= str_repeat('=', 4 - $pad);
    }
    $decoded = base64_decode($r, true);
    return $decoded === false ? '' : $decoded;
}

function computeMachineId(): string
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
    $basis = implode('|', $signals);
    $digest = strtoupper(hash_hmac('sha256', $basis, 'KAROBAR-HWID-V2:' . MASTER_PUBLIC_KEY));

    return 'KRB-' . implode('-', str_split(substr($digest, 0, 16), 4));
}

$action = $argv[1] ?? 'machine-id';
$machineId = computeMachineId();

if ($action === 'machine-id') {
    $outFile = $argv[2] ?? '';
    if ($outFile !== '') {
        @file_put_contents($outFile, $machineId);
    }
    echo $machineId;
    exit(0);
}

if ($action === 'verify') {
    $keyFile = $argv[2] ?? '';
    $sealOut = $argv[3] ?? '';
    $errorOut = $argv[4] ?? '';

    $fail = function (string $msg) use ($errorOut): never {
        if ($errorOut !== '') {
            @file_put_contents($errorOut, $msg);
        }
        fwrite(STDERR, $msg . PHP_EOL);
        exit(1);
    };

    $rawKey = $keyFile !== '' && is_file($keyFile) ? trim((string) @file_get_contents($keyFile)) : '';
    $clean = preg_replace('/\s+/', '', $rawKey) ?? '';
    if (stripos($clean, KEY_PREFIX) === 0) {
        $clean = substr($clean, strlen(KEY_PREFIX));
    } elseif (stripos($clean, 'KRB-LIC-') === 0) {
        $clean = substr($clean, 8);
    }

    if ($clean === '' || !str_contains($clean, '.')) {
        $fail('Malformed license key. Please paste the complete KRBL. license string.');
    }

    $parts = explode('.', $clean, 3);
    if (count($parts) !== 2) {
        $fail('Malformed license key format.');
    }

    [$sigB64, $payloadB64] = $parts;
    $sig = b64uDecode($sigB64);
    $payloadJson = b64uDecode($payloadB64);
    $pubKey = b64uDecode(MASTER_PUBLIC_KEY);

    if (strlen($pubKey) !== SODIUM_CRYPTO_SIGN_PUBLICKEYBYTES || !hash_equals(MASTER_PUBLIC_KEY_SHA256, hash('sha256', $pubKey))) {
        $fail('Master public key integrity check failed.');
    }

    if (strlen($sig) !== SODIUM_CRYPTO_SIGN_BYTES || $payloadJson === '') {
        $fail('Invalid cryptographic signature or payload encoding.');
    }

    if (!sodium_crypto_sign_verify_detached($sig, $payloadJson, $pubKey)) {
        $fail('License signature verification failed. This license key is invalid or has been altered.');
    }

    $payload = json_decode($payloadJson, true);
    if (!is_array($payload)) {
        $fail('Invalid license payload.');
    }

    $now = time();
    if (isset($payload['nbf']) && $payload['nbf'] !== null && ($now + CLOCK_SKEW_TOLERANCE) < (int) $payload['nbf']) {
        $fail('This license key is not yet valid (check your system date and time).');
    }
    if (isset($payload['exp']) && $payload['exp'] !== null && (int) $payload['exp'] > 0 && $now > (int) $payload['exp']) {
        $fail('This license key has expired.');
    }

    if (empty($payload['machine'])) {
        $fail("This license key is not bound to a Machine ID. Please request a key bound to Machine ID: {$machineId}");
    }

    if (!hash_equals(strtoupper(trim((string) $payload['machine'])), strtoupper(trim($machineId)))) {
        $fail("This license key is bound to another computer ({$payload['machine']}) and can never be used on this machine (Your Machine ID: {$machineId}).");
    }

    $canonicalKey = KEY_PREFIX . $clean;
    if ($sealOut !== '') {
        @file_put_contents($sealOut, json_encode([
            'ok'          => true,
            'license_key' => $canonicalKey,
            'machine_id'  => $machineId,
            'verified_at' => $now,
            'payload'     => $payload,
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
    }

    if ($errorOut !== '' && is_file($errorOut)) {
        @unlink($errorOut);
    }

    exit(0);
}

