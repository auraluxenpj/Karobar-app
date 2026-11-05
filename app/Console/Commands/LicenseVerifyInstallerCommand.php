<?php

namespace App\Console\Commands;

use App\Services\LicenseService;
use Illuminate\Console\Command;

class LicenseVerifyInstallerCommand extends Command
{
    protected $signature = 'license:verify-installer
                            {--key= : Raw license key string (KRBL....)}
                            {--key-file= : Path to file containing the pasted license key}
                            {--seal-out= : Path to write the cryptographically verified installer seal JSON}
                            {--error-out= : Optional path to write human-readable error message for Inno Setup}
                            {--allow-unbound : Allow keys that do not specify a machine ID in payload}
                            {--json : Output verification result as JSON}';

    protected $description = 'Verify a license key against this machine\'s hardware fingerprint during the Windows .exe pre-installation wizard';

    public function handle(LicenseService $licenseService): int
    {
        $key = trim((string) $this->option('key'));
        $keyFile = trim((string) $this->option('key-file'));

        if ($key === '' && $keyFile !== '' && is_file($keyFile)) {
            $key = trim((string) @file_get_contents($keyFile));
        }

        $machineId = $licenseService->computeMachineId();
        $requireMachineBinding = !$this->option('allow-unbound');

        if ($key === '') {
            return $this->failVerification(
                'Please enter a valid Karobar license key.',
                $machineId
            );
        }

        [$ok, $payload, $reason] = $licenseService->verifyString($key, $machineId, $requireMachineBinding);

        if (!$ok || !is_array($payload)) {
            $friendly = match ($reason) {
                'Wrong machine' => "This license key is bound to a different computer and cannot be used on this machine (Your Machine ID: {$machineId}).",
                'License key is not bound to a Machine ID' => "This license key is not bound to a Machine ID. Please request a machine-bound license key for Machine ID: {$machineId}.",
                'Expired' => 'This license key has expired. Please contact support for a renewal key.',
                'Bad signature', 'Malformed license', 'Invalid JSON payload' => 'Invalid or corrupted license key. Please copy the entire KRBL. license string carefully.',
                default => $reason ?: 'License key verification failed.',
            };

            return $this->failVerification($friendly, $machineId, $reason);
        }

        $canonicalKey = $licenseService->normalizeLicenseKey($key, true);
        $verifiedAt = time();
        $sealSig = $licenseService->computeRowSeal($canonicalKey, $machineId, $verifiedAt);

        $sealData = [
            'ok'           => true,
            'license_key'  => $canonicalKey,
            'machine_id'   => $machineId,
            'verified_at'  => $verifiedAt,
            'seal'         => $sealSig,
            'payload'      => $licenseService->sanitizePayload($payload),
        ];

        $sealOut = trim((string) $this->option('seal-out'));
        if ($sealOut !== '') {
            $dir = dirname($sealOut);
            if (!is_dir($dir)) {
                @mkdir($dir, 0755, true);
            }
            @file_put_contents($sealOut, json_encode($sealData, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
        }

        $errorOut = trim((string) $this->option('error-out'));
        if ($errorOut !== '' && is_file($errorOut)) {
            @unlink($errorOut);
        }

        if ($this->option('json')) {
            $this->line(json_encode($sealData, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
        } else {
            $storeName = $payload['name'] ?? 'Licensed Store';
            $edition = $payload['Edition'] ?? 'Professional';
            $this->info("VERIFIED: {$storeName} ({$edition}) bound to {$machineId}");
        }

        return self::SUCCESS;
    }

    protected function failVerification(string $friendlyMessage, string $machineId, ?string $code = null): int
    {
        $errorOut = trim((string) $this->option('error-out'));
        if ($errorOut !== '') {
            $dir = dirname($errorOut);
            if (!is_dir($dir)) {
                @mkdir($dir, 0755, true);
            }
            @file_put_contents($errorOut, $friendlyMessage);
        }

        if ($this->option('json')) {
            $this->line(json_encode([
                'ok'         => false,
                'machine_id' => $machineId,
                'reason'     => $code ?? $friendlyMessage,
                'message'    => $friendlyMessage,
            ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
        } else {
            $this->error($friendlyMessage);
        }

        return self::FAILURE;
    }
}

