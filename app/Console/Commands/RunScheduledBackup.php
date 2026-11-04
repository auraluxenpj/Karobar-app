<?php

namespace App\Console\Commands;

use App\Models\BackupSchedule;
use App\Services\BackupService;
use Carbon\Carbon;
use Exception;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class RunScheduledBackup extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'backup:run-scheduled {--force : Force execute backup regardless of schedule time}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Execute automated backup according to BackupSchedule settings and mirror to custom folder if configured';

    /**
     * Execute the console command.
     */
    public function handle(BackupService $backupService): int
    {
        $schedule = BackupSchedule::getSchedule();

        if (!$schedule->is_automated && !$this->option('force')) {
            $this->info('Automated backup is disabled in system settings. Use --force to override.');
            return self::SUCCESS;
        }

        $now = Carbon::now();

        // Check frequency and time of day if not forced
        if (!$this->option('force')) {
            if (!$this->isDue($schedule, $now)) {
                $this->info("Backup is not due at this time (Configured time: {$schedule->time_of_day}, frequency: {$schedule->frequency}).");
                return self::SUCCESS;
            }
        }

        $customPath = ($schedule->storage_destination === 'custom_folder' && !empty($schedule->custom_backup_path))
            ? $schedule->custom_backup_path
            : null;
        $destDesc = $customPath ?: 'Default storage';
        $this->info("Starting scheduled backup (Type: {$schedule->backup_type}, Destination: {$destDesc})...");

        try {
            $backup = $backupService->createBackup(
                type: $schedule->backup_type ?? 'full',
                userId: null,
                isAutomated: true,
                customBackupPath: $customPath
            );

            $schedule->update([
                'last_run_at' => $now,
                'last_run_status' => 'success',
                'last_error_message' => null,
            ]);

            $this->info("Backup {$backup->filename} completed successfully.");
            Log::info("Automated scheduled backup completed: {$backup->filename}");

            return self::SUCCESS;

        } catch (\Throwable $e) {
            $errorMessage = $e->getMessage();
            $this->error("Scheduled backup failed: {$errorMessage}");
            Log::error("Scheduled backup execution failed: {$errorMessage}");

            $schedule->update([
                'last_run_at' => $now,
                'last_run_status' => 'failed',
                'last_error_message' => $errorMessage,
            ]);

            return self::FAILURE;
        }
    }

    /**
     * Check if backup is due based on schedule rules
     */
    protected function isDue(BackupSchedule $schedule, Carbon $now): bool
    {
        // Parse time_of_day (e.g. "02:00")
        $targetTime = $schedule->time_of_day ?? '02:00';
        [$targetHour, $targetMinute] = explode(':', str_pad($targetTime, 5, '0', STR_PAD_LEFT));

        // When scheduled hourly via cron, match hour:
        if ((int)$now->format('H') !== (int)$targetHour) {
            return false;
        }

        // Prevent running multiple times in same day if already succeeded today
        if ($schedule->last_run_at && $schedule->last_run_status === 'success') {
            if ($schedule->last_run_at->isToday()) {
                return false;
            }
        }

        // Frequency checks
        return match ($schedule->frequency) {
            'weekly' => (int)$now->dayOfWeek === (int)($schedule->day_of_week ?? 0),
            'monthly' => (int)$now->day === (int)($schedule->day_of_month ?? 1),
            default => true, // daily
        };
    }
}

