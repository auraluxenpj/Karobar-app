<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class BackupSchedule extends Model
{
    use HasFactory;

    protected $fillable = [
        'is_automated',
        'frequency',
        'time_of_day',
        'day_of_week',
        'day_of_month',
        'backup_type',
        'retention_days',
        'max_backups_keep',
        'custom_backup_path',
        'storage_destination',
        'destination_config',
        'notify_on_failure',
        'notification_email',
        'last_run_at',
        'last_run_status',
        'last_error_message',
    ];

    protected $casts = [
        'is_automated' => 'boolean',
        'notify_on_failure' => 'boolean',
        'destination_config' => 'array',
        'retention_days' => 'integer',
        'max_backups_keep' => 'integer',
        'day_of_week' => 'integer',
        'day_of_month' => 'integer',
        'last_run_at' => 'datetime',
    ];

    /**
     * Get or create the singleton backup schedule record
     */
    public static function getSchedule(): self
    {
        $defaults = [
            'is_automated' => false,
            'frequency' => 'daily',
            'time_of_day' => '02:00',
            'day_of_week' => 0,
            'day_of_month' => 1,
            'backup_type' => 'full',
            'retention_days' => 30,
            'max_backups_keep' => 10,
            'custom_backup_path' => null,
            'storage_destination' => 'local',
            'destination_config' => [],
            'notify_on_failure' => true,
            'notification_email' => null,
            'last_run_status' => 'none',
        ];

        try {
            return static::firstOrCreate([], $defaults);
        } catch (\Throwable) {
            try {
                app(\App\Services\BackupService::class)->ensureBackupSchema();
                return static::firstOrCreate([], $defaults);
            } catch (\Throwable) {
                return new static($defaults);
            }
        }
    }
}

