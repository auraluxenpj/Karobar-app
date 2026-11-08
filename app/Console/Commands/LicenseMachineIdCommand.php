<?php

namespace App\Console\Commands;

use App\Services\LicenseService;
use Illuminate\Console\Command;

class LicenseMachineIdCommand extends Command
{
    protected $signature = 'license:machine-id
                            {--json : Output as JSON object}
                            {--out= : Optional file path to write the raw Machine ID string}';

    protected $description = 'Compute and output the deterministic hardware Machine ID for this computer';

    public function handle(LicenseService $licenseService): int
    {
        $machineId = $licenseService->computeMachineId();

        $outFile = trim((string) $this->option('out'));
        if ($outFile !== '') {
            $dir = dirname($outFile);
            if (!is_dir($dir)) {
                @mkdir($dir, 0755, true);
            }
            @file_put_contents($outFile, $machineId);
        }

        if ($this->option('json')) {
            $this->line(json_encode([
                'machine_id' => $machineId,
                'os_family'  => PHP_OS_FAMILY,
                'hostname'   => gethostname() ?: 'local',
            ], JSON_UNESCAPED_SLASHES));
            return self::SUCCESS;
        }

        $this->line($machineId);
        return self::SUCCESS;
    }
}

