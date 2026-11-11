<?php

namespace App\Services;

use App\Models\BackupLog;
use App\Models\BackupSchedule;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Throwable;
use ZipArchive;

class BackupService
{
    protected string $backupPath;
    protected int $maxBackups = 10;
    protected int $retentionDays = 30;

    /**
     * Ephemeral runtime tables whose rows should not be dumped or clobbered during SQL statement backups/restores.
     */
    protected array $ephemeralTables = [
        'sessions',
        'cache',
        'cache_locks',
        'jobs',
        'job_batches',
    ];

    public function __construct()
    {
        $this->backupPath = storage_path('app/backups');
        $this->ensureBackupDirectoryExists();
        $this->ensureBackupSchema();
    }

    /**
     * Ensure backup directory exists
     */
    protected function ensureBackupDirectoryExists(): void
    {
        try {
            if (!File::exists($this->backupPath)) {
                File::makeDirectory($this->backupPath, 0755, true, true);
            }
        } catch (Throwable $e) {
            Log::warning('Could not create default backup directory: ' . $e->getMessage());
        }
    }

    /**
     * Self-healing schema check: ensures backup_logs and backup_schedules tables and all
     * newer columns exist even when deployed on a Laravel Herd instance before running
     * migrations or immediately after restoring an older database snapshot.
     */
    public function ensureBackupSchema(): void
    {
        try {
            if (!Schema::hasTable('backup_logs')) {
                Schema::create('backup_logs', function (Blueprint $table) {
                    $table->id();
                    $table->string('filename')->unique();
                    $table->string('type');
                    $table->unsignedBigInteger('size')->default(0);
                    $table->string('path')->default('');
                    $table->json('metadata')->nullable();
                    $table->string('created_by')->nullable();
                    $table->boolean('is_automated')->default(false);
                    $table->string('storage_destination', 30)->default('local');
                    $table->string('remote_path')->nullable();
                    $table->string('remote_file_id')->nullable();
                    $table->string('remote_status', 30)->default('skipped');
                    $table->text('remote_error')->nullable();
                    $table->string('status', 30)->default('pending');
                    $table->text('error_message')->nullable();
                    $table->timestamps();
                    $table->timestamp('expires_at')->nullable();
                });
            } else {
                $missingLogColumns = [];
                foreach (['is_automated', 'storage_destination', 'remote_path', 'remote_file_id', 'remote_status', 'remote_error'] as $col) {
                    if (!Schema::hasColumn('backup_logs', $col)) {
                        $missingLogColumns[] = $col;
                    }
                }

                if (!empty($missingLogColumns)) {
                    Schema::table('backup_logs', function (Blueprint $table) use ($missingLogColumns) {
                        if (in_array('is_automated', $missingLogColumns, true)) {
                            $table->boolean('is_automated')->default(false);
                        }
                        if (in_array('storage_destination', $missingLogColumns, true)) {
                            $table->string('storage_destination', 30)->default('local');
                        }
                        if (in_array('remote_path', $missingLogColumns, true)) {
                            $table->string('remote_path')->nullable();
                        }
                        if (in_array('remote_file_id', $missingLogColumns, true)) {
                            $table->string('remote_file_id')->nullable();
                        }
                        if (in_array('remote_status', $missingLogColumns, true)) {
                            $table->string('remote_status', 30)->default('skipped');
                        }
                        if (in_array('remote_error', $missingLogColumns, true)) {
                            $table->text('remote_error')->nullable();
                        }
                    });
                }
            }

            if (!Schema::hasTable('backup_schedules')) {
                Schema::create('backup_schedules', function (Blueprint $table) {
                    $table->id();
                    $table->boolean('is_automated')->default(false);
                    $table->string('frequency', 20)->default('daily');
                    $table->string('time_of_day', 10)->default('02:00');
                    $table->unsignedTinyInteger('day_of_week')->nullable()->default(0);
                    $table->unsignedTinyInteger('day_of_month')->nullable()->default(1);
                    $table->string('backup_type', 20)->default('full');
                    $table->unsignedInteger('retention_days')->default(30);
                    $table->unsignedInteger('max_backups_keep')->default(10);
                    $table->string('custom_backup_path', 500)->nullable();
                    $table->string('storage_destination', 30)->default('local');
                    $table->json('destination_config')->nullable();
                    $table->boolean('notify_on_failure')->default(true);
                    $table->string('notification_email')->nullable();
                    $table->timestamp('last_run_at')->nullable();
                    $table->string('last_run_status', 20)->default('none');
                    $table->text('last_error_message')->nullable();
                    $table->timestamps();
                });
            } elseif (!Schema::hasColumn('backup_schedules', 'custom_backup_path')) {
                Schema::table('backup_schedules', function (Blueprint $table) {
                    $table->string('custom_backup_path', 500)->nullable();
                });
            }
        } catch (Throwable $e) {
            // Ignore schema inspection/alter errors when DB connection is unavailable
        }
    }

    /**
     * Get full path for a backup file
     */
    protected function getBackupFilePath(string $filename, string $type): string
    {
        $extension = match ($type) {
            'full' => 'zip',
            'settings' => 'json',
            default => 'sql.gz',
        };
        return $this->backupPath . '/' . $filename . '.' . $extension;
    }

    /**
     * Resolve the existing file path on disk for a BackupLog record across default storage,
     * relative storage paths, and custom backup folders.
     */
    public function resolveExistingBackupFilePath(BackupLog $backup): ?string
    {
        $candidates = [
            $this->getBackupFilePath($backup->filename, $backup->type),
        ];

        if (!empty($backup->path)) {
            $candidates[] = storage_path('app/' . ltrim($backup->path, '/\\'));
            $candidates[] = $this->backupPath . '/' . basename($backup->path);
        }

        if (!empty($backup->remote_path)) {
            $candidates[] = $backup->remote_path;
        }

        foreach (array_unique(array_filter($candidates)) as $candidate) {
            if (is_file($candidate) && is_readable($candidate)) {
                return $candidate;
            }
        }

        return null;
    }

    /**
     * Generate a unique backup filename that will not collide with backup_logs.filename unique constraint.
     */
    protected function generateUniqueBackupFilename(string $type, string $prefix = 'backup'): string
    {
        $timestamp = now()->format('Y-m-d_His');
        $base = "{$prefix}_{$type}_{$timestamp}";
        $filename = $base;
        $counter = 1;

        try {
            while (BackupLog::where('filename', $filename)->exists()) {
                $filename = "{$base}_{$counter}";
                $counter++;
            }
        } catch (Throwable) {
            // Ignore if table check fails
        }

        return $filename;
    }

    /**
     * Check whether a configured custom backup path belongs to a foreign machine/OS user
     * that cannot exist on the current host (e.g. a macOS /Users/otheruser path when running on Windows
     * or on a different macOS user account).
     */
    public function isReachableHostPath(?string $path): bool
    {
        $trimmed = trim((string) $path);
        if ($trimmed === '') {
            return false;
        }

        $isWindows = strtoupper(substr(PHP_OS, 0, 3)) === 'WIN';

        // Unix absolute path on Windows or Windows drive path on Unix
        if ($isWindows && str_starts_with($trimmed, '/Users/')) {
            return false;
        }
        if (!$isWindows && preg_match('/^[A-Za-z]:[\\\\\/]/', $trimmed)) {
            return false;
        }

        // On macOS, /Users/<username>/... cannot be created if /Users/<username> does not exist
        if (!$isWindows && preg_match('#^/Users/([^/]+)(/.*)?$#', $trimmed, $m)) {
            $userRoot = '/Users/' . $m[1];
            if (!is_dir($userRoot)) {
                return false;
            }
        }

        // On Windows, C:\Users\<username>\... cannot be created if C:\Users\<username> does not exist
        if ($isWindows && preg_match('#^([A-Za-z]:[\\\\/]Users[\\\\/][^\\\\/]+)([\\\\/].*)?$#i', $trimmed, $m)) {
            if (!is_dir($m[1])) {
                return false;
            }
        }

        return true;
    }

    /**
     * Create a new backup
     */
    public function createBackup(string $type, ?int $userId = null, bool $isAutomated = false, ?string $customBackupPath = null): BackupLog
    {
        @set_time_limit(300);
        @ini_set('memory_limit', '512M');

        $this->ensureBackupDirectoryExists();
        $this->ensureBackupSchema();

        $filename = $this->generateUniqueBackupFilename($type);

        $schedule = BackupSchedule::getSchedule();
        $configuredSchedulePath = ($schedule->storage_destination === 'custom_folder')
            ? $schedule->custom_backup_path
            : null;

        $destinationPath = $customBackupPath !== null
            ? trim($customBackupPath)
            : trim((string) $configuredSchedulePath);

        if ($destinationPath !== '' && !$this->isReachableHostPath($destinationPath)) {
            Log::warning("Skipping unreachable custom backup path from another host: {$destinationPath}");
            $destinationPath = '';
        }

        $destinationType = $destinationPath !== '' ? 'custom_folder' : 'local';

        $backupLog = BackupLog::create([
            'filename' => $filename,
            'type' => $type,
            'size' => 0,
            'path' => '',
            'created_by' => $userId,
            'is_automated' => $isAutomated,
            'storage_destination' => $destinationType,
            'remote_status' => $destinationPath !== '' ? 'pending' : 'skipped',
            'status' => 'pending',
        ]);

        try {
            switch ($type) {
                case 'database':
                    $this->createDatabaseBackup($backupLog);
                    break;
                case 'settings':
                    $this->createSettingsBackup($backupLog);
                    break;
                case 'full':
                default:
                    $this->createFullBackup($backupLog);
                    break;
            }

            $backupLog->refresh();

            // Copy to user's custom backup folder if configured
            if ($destinationPath !== '') {
                $this->copyToCustomFolder($backupLog, $destinationPath);
            }

            // Clean up old backups based on retention settings
            $this->cleanupOldBackups();

            return $backupLog;

        } catch (Throwable $e) {
            Log::error('Backup creation failed: ' . $e->getMessage(), [
                'type' => $type,
                'exception' => get_class($e),
                'file' => $e->getFile(),
                'line' => $e->getLine(),
            ]);

            try {
                $backupLog->update([
                    'status' => 'failed',
                    'error_message' => $e->getMessage(),
                ]);
            } catch (Throwable) {
            }

            throw new \RuntimeException($e->getMessage(), (int) $e->getCode(), $e);
        }
    }

    /**
     * Validate that a custom backup or browse directory path is safe and outside application source/webroot and OS system directories.
     */
    public function assertSafeBackupDirectory(string $path): void
    {
        $trimmed = trim($path);
        if ($trimmed === '') {
            return;
        }

        if (str_contains($trimmed, "\0") || preg_match('#(^|[\\\\/])\.\.([\\\\/]|$)#', $trimmed)) {
            throw new \InvalidArgumentException('Backup path cannot contain directory traversal sequences.');
        }

        $resolved = $this->resolvePathForValidation($trimmed);
        $normalized = rtrim(str_replace('\\', '/', $resolved), '/');
        $normalizedLower = strtolower($normalized);

        $defaultBackupDir = rtrim(str_replace('\\', '/', realpath($this->backupPath) ?: $this->backupPath), '/');
        $defaultBackupLower = strtolower($defaultBackupDir);

        // Always allow the default storage/app/backups directory and its subdirectories
        if ($normalizedLower === $defaultBackupLower || str_starts_with($normalizedLower, $defaultBackupLower . '/')) {
            return;
        }

        $publicDir = rtrim(str_replace('\\', '/', realpath(public_path()) ?: public_path()), '/');
        $publicLower = strtolower($publicDir);
        if ($normalizedLower === $publicLower || str_starts_with($normalizedLower, $publicLower . '/')) {
            throw new \InvalidArgumentException('Backup path cannot be inside the public web root.');
        }

        $baseDir = rtrim(str_replace('\\', '/', realpath(base_path()) ?: base_path()), '/');
        $baseLower = strtolower($baseDir);
        if ($normalizedLower === $baseLower || str_starts_with($normalizedLower, $baseLower . '/')) {
            throw new \InvalidArgumentException('Backup path cannot be inside the application source directory.');
        }

        $blockedRoots = [
            '/etc',
            '/private/etc',
            '/bin',
            '/sbin',
            '/usr',
            '/system',
            '/library',
            '/var/root',
            '/proc',
            '/sys',
            '/dev',
            'c:/windows',
            'c:/program files',
            'c:/program files (x86)',
        ];

        foreach ($blockedRoots as $root) {
            if ($normalizedLower === $root || str_starts_with($normalizedLower, $root . '/')) {
                throw new \InvalidArgumentException('Backup path cannot be inside a protected operating system directory.');
            }
        }
    }

    /**
     * Resolve a path (even if the leaf folders do not yet exist) by resolving the nearest existing ancestor.
     */
    protected function resolvePathForValidation(string $path): string
    {
        $real = @realpath($path);
        if ($real !== false) {
            return $real;
        }

        $parts = [];
        $current = $path;
        $maxDepth = 40;

        while ($maxDepth-- > 0) {
            $parent = dirname($current);
            if ($parent === $current || $parent === '.' || $parent === '') {
                break;
            }
            array_unshift($parts, basename($current));
            $parentReal = @realpath($parent);
            if ($parentReal !== false) {
                return rtrim($parentReal, DIRECTORY_SEPARATOR . '/\\')
                    . DIRECTORY_SEPARATOR
                    . implode(DIRECTORY_SEPARATOR, $parts);
            }
            $current = $parent;
        }

        return $path;
    }

    /**
     * Quote a string value safely for MySQL dump generation using PDO::quote().
     */
    protected function quoteSqlValue(string $value): string
    {
        try {
            $pdo = DB::connection()->getPdo();
            if ($pdo) {
                $quoted = $pdo->quote($value);
                if ($quoted !== false) {
                    return $quoted;
                }
            }
        } catch (Throwable) {
            // Fall through to manual escaping
        }

        return "'" . str_replace(
            ["\\", "\0", "\n", "\r", "'", '"', "\x1a"],
            ["\\\\", "\\0", "\\n", "\\r", "''", '\\"', "\\Z"],
            $value
        ) . "'";
    }

    /**
     * Quote a string literal according to standard SQL / SQLite rules (single quotes doubled).
     */
    protected function quoteStandardSqlString(string $value): string
    {
        return "'" . str_replace("'", "''", $value) . "'";
    }

    /**
     * Copy backup archive to custom local / network / drive folder
     */
    public function copyToCustomFolder(BackupLog $backupLog, string $destinationDir): void
    {
        $destinationDir = trim($destinationDir);
        if (empty($destinationDir)) {
            return;
        }

        try {
            $this->assertSafeBackupDirectory($destinationDir);

            if (!File::exists($destinationDir)) {
                File::makeDirectory($destinationDir, 0755, true, true);
            }

            if (!is_writable($destinationDir)) {
                throw new \RuntimeException("The destination folder [{$destinationDir}] is not writable. Please check folder permissions.");
            }

            $localFile = $this->getBackupFilePath($backupLog->filename, $backupLog->type);
            if (!File::exists($localFile)) {
                throw new \RuntimeException("Source backup file [{$localFile}] not found.");
            }

            $targetFile = rtrim($destinationDir, DIRECTORY_SEPARATOR . '/\\') . DIRECTORY_SEPARATOR . basename($localFile);
            File::copy($localFile, $targetFile);

            $backupLog->update([
                'storage_destination' => 'custom_folder',
                'remote_path' => $targetFile,
                'remote_status' => 'success',
                'remote_error' => null,
            ]);

            // Prune old backups in the custom folder
            $schedule = BackupSchedule::getSchedule();
            $maxKeep = $schedule->max_backups_keep ?? $this->maxBackups;
            $retentionDays = $schedule->retention_days ?? $this->retentionDays;
            $this->pruneCustomFolder($destinationDir, $maxKeep, $retentionDays);

        } catch (Throwable $e) {
            Log::error("Copying backup to custom folder failed: " . $e->getMessage());
            $backupLog->update([
                'storage_destination' => 'custom_folder',
                'remote_status' => 'failed',
                'remote_error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Prune old backup files in the custom folder according to retention rules
     */
    public function pruneCustomFolder(string $destinationDir, int $maxKeep, int $retentionDays): void
    {
        if (!File::isDirectory($destinationDir)) {
            return;
        }

        $files = File::glob(rtrim($destinationDir, DIRECTORY_SEPARATOR . '/\\') . DIRECTORY_SEPARATOR . 'backup_*');
        if (empty($files)) {
            return;
        }

        // Sort files by modified time descending (newest first)
        usort($files, function ($a, $b) {
            return @filemtime($b) <=> @filemtime($a);
        });

        $expiredTimestamp = now()->subDays($retentionDays)->timestamp;

        foreach ($files as $index => $filepath) {
            $mtime = @filemtime($filepath);
            if ($index >= $maxKeep || ($mtime !== false && $mtime < $expiredTimestamp)) {
                @unlink($filepath);
            }
        }
    }

    /**
     * Resolve the SQLite database file path across CLI, PHP-FPM, and Laravel Herd environments.
     */
    protected function resolveSqliteDatabasePath(): ?string
    {
        $config = config('database.connections.sqlite', []);
        $candidates = array_filter([
            $config['database'] ?? null,
             rescue(fn () => DB::connection('sqlite')->getDatabaseName(), null, false),
            database_path('database.sqlite'),
        ]);

        foreach ($candidates as $candidate) {
            if ($candidate === ':memory:') {
                return ':memory:';
            }
            if (is_file($candidate)) {
                return realpath($candidate) ?: $candidate;
            }
            $fromBase = base_path($candidate);
            if (is_file($fromBase)) {
                return realpath($fromBase) ?: $fromBase;
            }
            $fromDb = database_path($candidate);
            if (is_file($fromDb)) {
                return realpath($fromDb) ?: $fromDb;
            }
        }

        return $config['database'] ?? null;
    }

    /**
     * Read a consistent binary snapshot of a file-backed SQLite database (including any active WAL pages).
     */
    protected function readSqliteDatabaseContent(string $dbPath): string
    {
        $snapshotPath = $this->backupPath . '/temp_sqlite_snapshot_' . uniqid('', true) . '.sqlite';

        try {
            if (file_exists($snapshotPath)) {
                @unlink($snapshotPath);
            }

            // SQLite 3.27+ VACUUM INTO creates a transactionally consistent, checkpointed single-file copy
            $escapedSnapshot = str_replace("'", "''", $snapshotPath);
            DB::connection('sqlite')->statement("VACUUM INTO '{$escapedSnapshot}'");

            if (is_file($snapshotPath) && filesize($snapshotPath) > 0) {
                $content = file_get_contents($snapshotPath);
                @unlink($snapshotPath);
                if ($content !== false && $content !== '') {
                    return $content;
                }
            }
        } catch (Throwable) {
            if (file_exists($snapshotPath)) {
                @unlink($snapshotPath);
            }
        }

        // Second strategy: SQLite3 Online Backup API (atomic across active WAL connections)
        if (class_exists(\SQLite3::class)) {
            $srcDb = null;
            $dstDb = null;
            try {
                if (file_exists($snapshotPath)) {
                    @unlink($snapshotPath);
                }
                $srcDb = new \SQLite3($dbPath, SQLITE3_OPEN_READONLY);
                $srcDb->busyTimeout(15000);
                $dstDb = new \SQLite3($snapshotPath, SQLITE3_OPEN_READWRITE | SQLITE3_OPEN_CREATE);
                $dstDb->busyTimeout(15000);
                if ($srcDb->backup($dstDb)) {
                    $dstDb->close();
                    $dstDb = null;
                    $srcDb->close();
                    $srcDb = null;
                    if (is_file($snapshotPath) && filesize($snapshotPath) > 0) {
                        $content = file_get_contents($snapshotPath);
                        @unlink($snapshotPath);
                        if ($content !== false && $content !== '') {
                            return $content;
                        }
                    }
                }
            } catch (Throwable) {
                // Fall through to checkpoint + file read
            } finally {
                if ($dstDb instanceof \SQLite3) {
                    @$dstDb->close();
                }
                if ($srcDb instanceof \SQLite3) {
                    @$srcDb->close();
                }
                if (file_exists($snapshotPath)) {
                    @unlink($snapshotPath);
                }
            }
        }

        // Fallback: checkpoint WAL fully then read file bytes directly
        try {
            DB::connection('sqlite')->statement('PRAGMA wal_checkpoint(FULL);');
        } catch (Throwable) {
        }

        $content = @file_get_contents($dbPath);
        if ($content === false || $content === '') {
            return $this->generateSqlDump();
        }

        return $content;
    }

    /**
     * Resolve active database name for metadata and SQL dump headers.
     */
    protected function resolveDatabaseName(): string
    {
        $driver = config('database.default', 'sqlite');
        try {
            $name = DB::connection()->getDatabaseName();
            if (!empty($name)) {
                return (string) $name;
            }
        } catch (Throwable) {
        }

        return (string) (config("database.connections.{$driver}.database") ?? config('database.database') ?? 'karobar');
    }

    /**
     * Create database-only backup
     */
    protected function createDatabaseBackup(BackupLog $backupLog): void
    {
        $filepath = $this->getBackupFilePath($backupLog->filename, 'database');
        $driver = config('database.default');

        $sqlitePath = $driver === 'sqlite' ? $this->resolveSqliteDatabasePath() : null;

        if ($driver === 'sqlite' && $sqlitePath && $sqlitePath !== ':memory:' && is_file($sqlitePath)) {
            $sqlContent = $this->readSqliteDatabaseContent($sqlitePath);
        } else {
            $sqlContent = $this->generateSqlDump();
        }

        if ($sqlContent === '') {
            throw new \RuntimeException('Database dump produced empty content.');
        }

        $gzContent = function_exists('gzencode') ? gzencode($sqlContent, 6) : $sqlContent;
        if ($gzContent === false) {
            throw new \RuntimeException('Failed to compress database backup.');
        }

        if (file_put_contents($filepath, $gzContent) === false) {
            throw new \RuntimeException("Failed to write database backup file to [{$filepath}]. Check storage permissions.");
        }

        clearstatcache(true, $filepath);

        $backupLog->update([
            'path' => 'backups/' . basename($filepath),
            'size' => (int) @filesize($filepath),
            'status' => 'completed',
            'metadata' => [
                'database' => basename($this->resolveDatabaseName()),
                'driver' => $driver,
                'compressed' => function_exists('gzencode'),
            ],
        ]);
    }

    /**
     * Generate SQL dump
     */
    protected function generateSqlDump(): string
    {
        $driver = config('database.default');

        if ($driver === 'mysql' || $driver === 'mariadb') {
            return $this->generateMysqlDump();
        } elseif ($driver === 'pgsql') {
            return $this->generatePgsqlDump();
        }

        return $this->generateGenericDump();
    }

    /**
     * Generate MySQL / MariaDB dump safely across any database name on Laravel Herd / standard MySQL.
     */
    protected function generateMysqlDump(): string
    {
        $driver = config('database.default', 'mysql');
        $dbName = $this->resolveDatabaseName();

        $output = "-- Karobar ERP Database Backup (MySQL/MariaDB)\n";
        $output .= "-- Generated: " . now()->toIso8601String() . "\n";
        $output .= "-- Database: " . $dbName . "\n\n";
        $output .= "SET FOREIGN_KEY_CHECKS = 0;\n";
        $output .= "SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';\n\n";

        try {
            $tables = DB::select("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
        } catch (Throwable) {
            $tables = DB::select('SHOW TABLES');
        }

        $tablePrefix = (string) config("database.connections.{$driver}.prefix", '');

        foreach ($tables as $table) {
            $rowValues = array_values((array) $table);
            $tableName = $rowValues[0] ?? null;
            if (!is_string($tableName) || $tableName === '') {
                continue;
            }

            if ($tablePrefix !== '' && !str_starts_with($tableName, $tablePrefix)) {
                continue;
            }

            $output .= "\n-- Table structure for `{$tableName}`\n";
            $output .= "DROP TABLE IF EXISTS `{$tableName}`;\n";

            try {
                $createResult = DB::select("SHOW CREATE TABLE `{$tableName}`");
                if (!empty($createResult)) {
                    $createRow = (array) $createResult[0];
                    $createSql = $createRow['Create Table'] ?? (array_values($createRow)[1] ?? null);
                    if (is_string($createSql) && $createSql !== '') {
                        $output .= $createSql . ";\n\n";
                    }
                }
            } catch (Throwable $e) {
                $output .= "-- Could not get CREATE TABLE structure: " . $e->getMessage() . "\n\n";
            }

            if (in_array($tableName, $this->ephemeralTables, true)) {
                continue;
            }

            try {
                $columns = DB::getSchemaBuilder()->getColumnListing($tableName);
                if (empty($columns)) {
                    continue;
                }

                $columnList = '`' . implode('`, `', $columns) . '`';
                $hasHeader = false;

                DB::table($tableName)->orderBy($columns[0])->chunk(250, function ($rows) use (&$output, &$hasHeader, $tableName, $columns, $columnList) {
                    if ($rows->isEmpty()) {
                        return;
                    }

                    if (!$hasHeader) {
                        $output .= "-- Dumping data for `{$tableName}`\n";
                        $hasHeader = true;
                    }

                    $tuples = [];
                    foreach ($rows as $row) {
                        $rowArr = (array) $row;
                        $values = [];
                        foreach ($columns as $col) {
                            $value = $rowArr[$col] ?? null;
                            if ($value === null) {
                                $values[] = 'NULL';
                            } elseif (is_bool($value)) {
                                $values[] = $value ? '1' : '0';
                            } elseif (is_int($value) || is_float($value)) {
                                $values[] = (string) $value;
                            } elseif (is_string($value)) {
                                $values[] = $this->quoteSqlValue($value);
                            } else {
                                $values[] = $this->quoteSqlValue((string) json_encode($value));
                            }
                        }
                        $tuples[] = '(' . implode(', ', $values) . ')';

                        if (count($tuples) >= 100) {
                            $output .= "INSERT INTO `{$tableName}` ({$columnList}) VALUES " . implode(",\n", $tuples) . ";\n";
                            $tuples = [];
                        }
                    }

                    if (!empty($tuples)) {
                        $output .= "INSERT INTO `{$tableName}` ({$columnList}) VALUES " . implode(",\n", $tuples) . ";\n";
                    }
                });

                if ($hasHeader) {
                    $output .= "\n";
                }
            } catch (Throwable $e) {
                $output .= "-- Could not dump table data for {$tableName}: " . $e->getMessage() . "\n\n";
            }
        }

        $output .= "\nSET FOREIGN_KEY_CHECKS = 1;\n";

        return $output;
    }

    /**
     * Generate PostgreSQL dump
     */
    protected function generatePgsqlDump(): string
    {
        $output = "-- Karobar ERP Database Backup (PostgreSQL)\n";
        $output .= "-- Generated: " . now()->toIso8601String() . "\n\n";

        try {
            $tables = DB::select("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");

            foreach ($tables as $table) {
                $tableName = $table->tablename ?? null;
                if (!$tableName || in_array($tableName, $this->ephemeralTables, true)) {
                    continue;
                }

                $output .= "-- Table: {$tableName}\n\n";

                try {
                    $columns = DB::getSchemaBuilder()->getColumnListing($tableName);
                    if (empty($columns)) {
                        continue;
                    }

                    $columnList = '"' . implode('", "', $columns) . '"';
                    $rows = DB::table($tableName)->get();

                    foreach ($rows as $row) {
                        $rowArr = (array) $row;
                        $values = [];
                        foreach ($columns as $col) {
                            $value = $rowArr[$col] ?? null;
                            if ($value === null) {
                                $values[] = 'NULL';
                            } elseif (is_bool($value)) {
                                $values[] = $value ? 'TRUE' : 'FALSE';
                            } elseif (is_int($value) || is_float($value)) {
                                $values[] = (string) $value;
                            } else {
                                $values[] = $this->quoteStandardSqlString((string) $value);
                            }
                        }
                        $output .= "INSERT INTO \"{$tableName}\" ({$columnList}) VALUES (" . implode(', ', $values) . ");\n";
                    }
                    $output .= "\n";
                } catch (Throwable $e) {
                    $output .= "-- Could not dump table data: " . $e->getMessage() . "\n\n";
                }
            }
        } catch (Throwable $e) {
            $output .= "-- Could not get tables: " . $e->getMessage() . "\n";
        }

        return $output;
    }

    /**
     * Generate generic SQLite SQL dump (for :memory: SQLite or fallback).
     */
    protected function generateGenericDump(): string
    {
        $output = "-- Karobar ERP Database Backup\n";
        $output .= "-- Generated: " . now()->toIso8601String() . "\n\n";

        try {
            $tables = DB::select("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'migrations'");

            foreach ($tables as $table) {
                $tableName = $table->name ?? null;
                if (!$tableName || in_array($tableName, $this->ephemeralTables, true)) {
                    continue;
                }

                $output .= "-- Table: {$tableName}\n";
                $output .= "DELETE FROM `{$tableName}`;\n";

                try {
                    $columns = DB::getSchemaBuilder()->getColumnListing($tableName);
                    if (empty($columns)) {
                        continue;
                    }

                    $columnList = '`' . implode('`, `', $columns) . '`';
                    $rows = DB::table($tableName)->get();

                    if ($rows->isNotEmpty()) {
                        foreach ($rows as $row) {
                            $rowArr = (array) $row;
                            $values = [];
                            foreach ($columns as $col) {
                                $value = $rowArr[$col] ?? null;
                                if ($value === null) {
                                    $values[] = 'NULL';
                                } elseif (is_bool($value)) {
                                    $values[] = $value ? '1' : '0';
                                } elseif (is_int($value) || is_float($value)) {
                                    $values[] = (string) $value;
                                } elseif (is_string($value)) {
                                    $values[] = $this->quoteStandardSqlString($value);
                                } else {
                                    $values[] = $this->quoteStandardSqlString((string) json_encode($value));
                                }
                            }
                            $output .= "INSERT INTO `{$tableName}` ({$columnList}) VALUES (" . implode(', ', $values) . ");\n";
                        }
                        $output .= "\n";
                    }
                } catch (Throwable $e) {
                    $output .= "-- Could not dump table data: " . $e->getMessage() . "\n\n";
                }
            }
        } catch (Throwable $e) {
            $output .= "-- Could not get tables: " . $e->getMessage() . "\n";
        }

        return $output;
    }

    /**
     * Create settings-only backup
     */
    protected function createSettingsBackup(BackupLog $backupLog): void
    {
        $filepath = $this->getBackupFilePath($backupLog->filename, 'settings');

        $settings = \App\Models\Setting::first();

        $backupData = [
            'generated_at' => now()->toIso8601String(),
            'type' => 'settings',
            'version' => '1.0',
            'data' => $settings ? $settings->toArray() : null,
        ];

        $written = file_put_contents($filepath, json_encode($backupData, JSON_PRETTY_PRINT));
        if ($written === false) {
            throw new \RuntimeException("Failed to write settings backup file to [{$filepath}]. Check storage permissions.");
        }

        clearstatcache(true, $filepath);

        $backupLog->update([
            'path' => 'backups/' . basename($filepath),
            'size' => (int) @filesize($filepath),
            'status' => 'completed',
            'metadata' => [
                'settings_backup' => true,
            ],
        ]);
    }

    /**
     * Create full backup (database + settings + files).
     * Works with ZipArchive when ext-zip is enabled, and automatically falls back to a
     * pure-PHP PKZIP archive builder when ext-zip is not enabled on Laravel Herd.
     */
    protected function createFullBackup(BackupLog $backupLog): void
    {
        $filepath = $this->getBackupFilePath($backupLog->filename, 'full');
        $dbFilename = 'database.sql.gz';
        $driver = config('database.default');

        $sqlitePath = $driver === 'sqlite' ? $this->resolveSqliteDatabasePath() : null;

        if ($driver === 'sqlite' && $sqlitePath && $sqlitePath !== ':memory:' && is_file($sqlitePath)) {
            $dbContent = $this->readSqliteDatabaseContent($sqlitePath);
        } else {
            $dbContent = $this->generateSqlDump();
        }

        $entries = [];

        if ($dbContent !== '') {
            $gzContent = function_exists('gzencode') ? gzencode($dbContent, 6) : $dbContent;
            if ($gzContent !== false) {
                $entries['database/' . $dbFilename] = $gzContent;
            }
        }

        $settings = \App\Models\Setting::first();
        $settingsData = [
            'generated_at' => now()->toIso8601String(),
            'type' => 'settings',
            'version' => '1.0',
            'data' => $settings ? $settings->toArray() : null,
        ];
        $entries['settings.json'] = (string) json_encode($settingsData, JSON_PRETTY_PRINT);

        $hasLogoFile = false;
        if ($settings && $settings->logo_path) {
            $fullLogoPath = storage_path('app/public/' . ltrim($settings->logo_path, '/\\'));
            if (is_file($fullLogoPath)) {
                $logoBytes = @file_get_contents($fullLogoPath);
                if ($logoBytes !== false) {
                    $entries['files/' . basename($settings->logo_path)] = $logoBytes;
                    $hasLogoFile = true;
                }
            }
        }

        $manifest = [
            'generated_at' => now()->toIso8601String(),
            'type' => 'full',
            'version' => '1.0',
            'database_driver' => $driver,
            'database_backup' => 'database/' . $dbFilename,
            'settings_backup' => 'settings.json',
            'files_included' => $hasLogoFile,
        ];
        $entries['manifest.json'] = (string) json_encode($manifest, JSON_PRETTY_PRINT);

        $this->writeZipArchiveEntries($filepath, $entries);

        clearstatcache(true, $filepath);
        if (!is_file($filepath) || (int) @filesize($filepath) === 0) {
            throw new \RuntimeException('Failed to create full backup ZIP archive.');
        }

        $backupLog->update([
            'path' => 'backups/' . basename($filepath),
            'size' => (int) @filesize($filepath),
            'status' => 'completed',
            'metadata' => [
                'database_backup' => $dbFilename,
                'settings_backup' => true,
                'files_included' => $hasLogoFile,
            ],
        ]);
    }

    /**
     * Write a map of [entryName => binaryContent] to a .zip file using ZipArchive if available,
     * or pure-PHP PKZIP format if ext-zip is not installed/enabled on Laravel Herd.
     */
    public function writeZipArchiveEntries(string $filepath, array $entries): void
    {
        $dir = dirname($filepath);
        if (!File::exists($dir)) {
            File::makeDirectory($dir, 0755, true, true);
        }

        if (class_exists(ZipArchive::class)) {
            try {
                $zip = new ZipArchive();
                if ($zip->open($filepath, ZipArchive::CREATE | ZipArchive::OVERWRITE) === true) {
                    foreach ($entries as $entryName => $content) {
                        $zip->addFromString($entryName, (string) $content);
                    }
                    if ($zip->close() && is_file($filepath) && filesize($filepath) > 0) {
                        return;
                    }
                }
            } catch (Throwable) {
                // Fall through to pure-PHP PKZIP builder
            }
        }

        $this->writePurePhpZipArchive($filepath, $entries);
    }

    /**
     * Pure-PHP PKZIP writer (requires zero extensions beyond core PHP).
     */
    public function writePurePhpZipArchive(string $filepath, array $entries): void
    {
        $fh = @fopen($filepath, 'wb');
        if ($fh === false) {
            throw new \RuntimeException("Cannot open [{$filepath}] for writing ZIP archive.");
        }

        $centralDirectory = '';
        $offset = 0;
        $entryCount = 0;
        $canDeflate = function_exists('gzdeflate');

        try {
            foreach ($entries as $rawName => $content) {
                $name = ltrim(str_replace('\\', '/', (string) $rawName), '/');
                $data = (string) $content;
                $uncompressedSize = strlen($data);
                $crc = crc32($data);

                if ($canDeflate && $uncompressedSize > 0) {
                    $compressedData = gzdeflate($data, 6);
                    if ($compressedData !== false && strlen($compressedData) < $uncompressedSize) {
                        $method = 8; // Deflate
                    } else {
                        $compressedData = $data;
                        $method = 0; // Store
                    }
                } else {
                    $compressedData = $data;
                    $method = 0; // Store
                }

                $compressedSize = strlen($compressedData);
                $nameLength = strlen($name);

                // Local file header (signature 0x04034b50)
                $localHeader = pack(
                    'VvvvvvVVVvv',
                    0x04034b50,
                    20, // version needed to extract (2.0)
                    0,  // general purpose bit flag
                    $method,
                    0,  // last mod file time
                    0,  // last mod file date
                    $crc,
                    $compressedSize,
                    $uncompressedSize,
                    $nameLength,
                    0   // extra field length
                ) . $name;

                fwrite($fh, $localHeader);
                if ($compressedSize > 0) {
                    fwrite($fh, $compressedData);
                }

                // Central directory file header (signature 0x02014b50)
                $centralDirectory .= pack(
                    'VvvvvvvVVVvvvvvVV',
                    0x02014b50,
                    20, // version made by
                    20, // version needed to extract
                    0,  // general purpose bit flag
                    $method,
                    0,  // last mod file time
                    0,  // last mod file date
                    $crc,
                    $compressedSize,
                    $uncompressedSize,
                    $nameLength,
                    0,  // extra field length
                    0,  // file comment length
                    0,  // disk number start
                    0,  // internal file attributes
                    32, // external file attributes (archive bit)
                    $offset
                ) . $name;

                $offset += strlen($localHeader) + $compressedSize;
                $entryCount++;
            }

            // End of central directory record (signature 0x06054b50)
            $eocd = pack(
                'VvvvvVVv',
                0x06054b50,
                0,
                0,
                $entryCount,
                $entryCount,
                strlen($centralDirectory),
                $offset,
                0
            );

            fwrite($fh, $centralDirectory);
            fwrite($fh, $eocd);
        } finally {
            fclose($fh);
        }
    }

    /**
     * Read all entries [entryName => uncompressedContent] from a .zip file using ZipArchive
     * or pure-PHP PKZIP reader fallback.
     */
    public function readZipArchiveEntries(string $filepath, bool $namesOnly = false): array
    {
        if (!is_file($filepath)) {
            throw new \RuntimeException('Could not open backup zip file.');
        }

        if (class_exists(ZipArchive::class)) {
            $zip = new ZipArchive();
            if ($zip->open($filepath) === true) {
                $entries = [];
                for ($i = 0; $i < $zip->numFiles; $i++) {
                    $name = $zip->getNameIndex($i);
                    if ($name === false) {
                        continue;
                    }
                    $this->assertSafeZipEntryName($name);
                    if (str_ends_with($name, '/')) {
                        continue;
                    }
                    $entries[$name] = $namesOnly ? true : (string) $zip->getFromIndex($i);
                }
                $zip->close();
                return $entries;
            }
        }

        return $this->readPurePhpZipArchiveEntries($filepath, $namesOnly);
    }

    /**
     * Pure-PHP PKZIP reader for listing and extracting ZIP entries without ext-zip.
     */
    public function readPurePhpZipArchiveEntries(string $filepath, bool $namesOnly = false): array
    {
        $raw = @file_get_contents($filepath);
        if ($raw === false || strlen($raw) < 22 || substr($raw, 0, 4) !== "PK\x03\x04") {
            throw new \RuntimeException('Cannot open ZIP file. File may be corrupted.');
        }

        $entries = [];
        $len = strlen($raw);
        $pos = 0;

        while ($pos + 30 <= $len) {
            $sig = substr($raw, $pos, 4);
            if ($sig === "PK\x01\x02" || $sig === "PK\x05\x06") {
                // Reached central directory
                break;
            }
            if ($sig !== "PK\x03\x04") {
                throw new \RuntimeException('Invalid local header inside ZIP archive.');
            }

            $header = unpack('vversion/vflag/vmethod/vtime/vdate/Vcrc/VcompSize/VuncompSize/vnameLen/vextraLen', substr($raw, $pos + 4, 26));
            $nameLen = $header['nameLen'];
            $extraLen = $header['extraLen'];
            $compSize = $header['compSize'];
            $method = $header['method'];

            $namePos = $pos + 30;
            $entryName = substr($raw, $namePos, $nameLen);
            $this->assertSafeZipEntryName($entryName);

            $dataPos = $namePos + $nameLen + $extraLen;
            if ($dataPos + $compSize > $len) {
                throw new \RuntimeException('Truncated ZIP archive entry.');
            }

            if (!str_ends_with($entryName, '/')) {
                if ($namesOnly) {
                    $entries[$entryName] = true;
                } else {
                    $compData = substr($raw, $dataPos, $compSize);
                    if ($method === 0) {
                        $entries[$entryName] = $compData;
                    } elseif ($method === 8) {
                        $inflated = @gzinflate($compData);
                        if ($inflated === false) {
                            throw new \RuntimeException("Failed to decompress ZIP entry [{$entryName}].");
                        }
                        $entries[$entryName] = $inflated;
                    } else {
                        throw new \RuntimeException("Unsupported ZIP compression method [{$method}].");
                    }
                }
            }

            $pos = $dataPos + $compSize;
        }

        return $entries;
    }

    /**
     * Validate a ZIP entry name against Zip-Slip path traversal attacks.
     */
    protected function assertSafeZipEntryName(string $entryName): void
    {
        if (
            $entryName === ''
            || str_contains($entryName, "\0")
            || preg_match('#(^|[\\\\/])\.\.([\\\\/]|$)#', $entryName)
            || str_starts_with($entryName, '/')
            || str_starts_with($entryName, '\\')
            || str_contains($entryName, ':')
        ) {
            throw new \RuntimeException('Unsafe file path detected inside backup archive.');
        }
    }

    /**
     * List all backups
     */
    public function listBackups(): array
    {
        $this->ensureBackupSchema();

        return BackupLog::orderByDesc('created_at')
            ->get()
            ->map(function ($backup) {
                return [
                    'id' => $backup->id,
                    'filename' => $backup->filename,
                    'type' => $backup->type,
                    'type_label' => $backup->type_label,
                    'size' => $backup->size,
                    'formatted_size' => $backup->formatted_size,
                    'status' => $backup->status,
                    'is_automated' => (bool) $backup->is_automated,
                    'storage_destination' => $backup->storage_destination ?? 'local',
                    'remote_path' => $backup->remote_path,
                    'remote_status' => $backup->remote_status ?? 'skipped',
                    'remote_error' => $backup->remote_error,
                    'created_at' => $backup->created_at,
                    'created_at_formatted' => $backup->created_at ? $backup->created_at->format('M d, Y h:i A') : '',
                    'error_message' => $backup->error_message,
                    'metadata' => $backup->metadata,
                ];
            })
            ->toArray();
    }

    /**
     * Get backup for download
     */
    public function getBackupForDownload(int $id): ?BackupLog
    {
        $backup = BackupLog::find($id);

        if (!$backup || !in_array($backup->status, ['completed', 'restored', 'pending'])) {
            return null;
        }

        $filepath = $this->resolveExistingBackupFilePath($backup);
        if (!$filepath) {
            return null;
        }

        $backup->full_path = $filepath;

        return $backup;
    }

    /**
     * Download backup file
     */
    public function getDownloadPath(int $id): ?string
    {
        $backup = $this->getBackupForDownload($id);

        return $backup?->full_path;
    }

    /**
     * Restore from backup
     */
    public function restoreBackup(int $id, string $password): bool
    {
        @set_time_limit(300);
        @ini_set('memory_limit', '512M');

        $backup = BackupLog::find($id);

        if (!$backup || !in_array($backup->status, ['completed', 'restored', 'pending'])) {
            throw new \RuntimeException('Backup not found or invalid');
        }

        // Verify password
        $user = Auth::user();
        if (!$user || !\Illuminate\Support\Facades\Hash::check($password, $user->password)) {
            throw new \RuntimeException('Invalid password');
        }

        $filepath = $this->resolveExistingBackupFilePath($backup);
        if (!$filepath) {
            throw new \RuntimeException('Backup file not found');
        }

        $backupId = $backup->id;
        $backupFilename = $backup->filename;

        try {
            switch ($backup->type) {
                case 'database':
                    $this->restoreDatabaseBackup($filepath);
                    break;
                case 'settings':
                    $this->restoreSettingsBackup($filepath);
                    break;
                case 'full':
                    $this->restoreFullBackup($filepath);
                    break;
            }

            // Ensure backup tables still have all current columns after restoring an older snapshot
            $this->ensureBackupSchema();

            try {
                BackupLog::where('id', $backupId)
                    ->orWhere('filename', $backupFilename)
                    ->update([
                        'status' => 'restored',
                        'error_message' => null,
                    ]);
            } catch (Throwable) {
                // Ignore if the backup record was created after the restored snapshot
            }

            return true;

        } catch (Throwable $e) {
            Log::error('Backup restore failed: ' . $e->getMessage(), [
                'backup_id' => $backupId,
                'filename' => $backupFilename,
                'type' => $backup->type,
                'exception' => get_class($e),
                'file' => $e->getFile(),
                'line' => $e->getLine(),
            ]);

            try {
                $this->ensureBackupSchema();
                BackupLog::where('id', $backupId)
                    ->orWhere('filename', $backupFilename)
                    ->update([
                        'status' => 'failed',
                        'error_message' => 'Restore failed: ' . $e->getMessage(),
                    ]);
            } catch (Throwable) {
            }

            throw new \RuntimeException('Restore failed: ' . $e->getMessage(), (int) $e->getCode(), $e);
        }
    }

    /**
     * Restore database from backup
     */
    protected function restoreDatabaseBackup(string $filepath): void
    {
        $compressed = file_get_contents($filepath);
        if ($compressed === false || $compressed === '') {
            throw new \RuntimeException('Failed to read backup file');
        }

        $sqlContent = @gzdecode($compressed);
        if ($sqlContent === false) {
            $sqlContent = $compressed;
        }

        if (empty($sqlContent)) {
            throw new \RuntimeException('Failed to read or decompress backup file');
        }

        // Preserve this machine's currently valid license across database restores
        // while preventing foreign backups from smuggling a license onto an unlicensed machine.
        $preservedLicenseAttributes = null;
        try {
            $licenseService = app(\App\Services\LicenseService::class);
            if (($licenseService->currentStatus()['valid'] ?? false) === true) {
                $currentLicense = \App\Models\License::latest('id')->first();
                if ($currentLicense) {
                    $preservedLicenseAttributes = $currentLicense->getAttributes();
                    unset($preservedLicenseAttributes['id']);
                }
            }
        } catch (Throwable) {
        }

        // Preserve active user accounts, sessions & tokens so the user stays logged in and their current password is not reverted after restore
        $preservedUsers = [];
        $preservedSessions = [];
        $preservedTokens = [];
        $preservedBackupLogs = [];
        $preservedBackupSchedules = [];
        try {
            if (Schema::hasTable('users')) {
                $preservedUsers = DB::table('users')->get()->map(fn ($r) => (array) $r)->all();
            }
            if (Schema::hasTable('sessions')) {
                $preservedSessions = DB::table('sessions')->get()->map(fn ($r) => (array) $r)->all();
            }
            if (Schema::hasTable('personal_access_tokens')) {
                $preservedTokens = DB::table('personal_access_tokens')->get()->map(fn ($r) => (array) $r)->all();
            }
            if (Schema::hasTable('backup_logs')) {
                $preservedBackupLogs = DB::table('backup_logs')->get()->map(fn ($r) => (array) $r)->all();
            }
            if (Schema::hasTable('backup_schedules')) {
                $preservedBackupSchedules = DB::table('backup_schedules')->get()->map(fn ($r) => (array) $r)->all();
            }
        } catch (Throwable) {
        }

        $driver = config('database.default');

        if ($driver === 'sqlite') {
            $dbPath = $this->resolveSqliteDatabasePath();
            if (!$dbPath) {
                throw new \RuntimeException('SQLite database path is not configured.');
            }

            // Check if this backup contains a raw binary SQLite database and target is a file on disk
            $sqliteMagicPos = strpos($sqlContent, 'SQLite format 3');

            if ($sqliteMagicPos !== false && $dbPath !== ':memory:') {
                $rawDbContent = substr($sqlContent, $sqliteMagicPos);
                if (strlen($rawDbContent) < 100) {
                    throw new \RuntimeException('The backup database snapshot is truncated or invalid.');
                }

                $this->ensureBackupDirectoryExists();
                $tempRestoreSqlite = $this->backupPath . '/temp_restore_src_' . uniqid('', true) . '.sqlite';
                if (@file_put_contents($tempRestoreSqlite, $rawDbContent) === false) {
                    throw new \RuntimeException('Failed to stage temporary SQLite database for restore.');
                }

                // Validate integrity of the staged backup snapshot before touching the live database
                if (class_exists(\SQLite3::class)) {
                    $checkDb = null;
                    try {
                        $checkDb = new \SQLite3($tempRestoreSqlite, SQLITE3_OPEN_READONLY);
                        $checkDb->busyTimeout(5000);
                        $integrity = $checkDb->querySingle('PRAGMA quick_check;');
                        $checkDb->close();
                        $checkDb = null;
                        if ($integrity !== 'ok') {
                            @unlink($tempRestoreSqlite);
                            throw new \RuntimeException("Backup database snapshot failed integrity check ({$integrity}).");
                        }
                    } catch (Throwable $checkErr) {
                        if ($checkDb instanceof \SQLite3) {
                            @$checkDb->close();
                        }
                        @unlink($tempRestoreSqlite);
                        throw new \RuntimeException('Invalid or corrupted SQLite backup snapshot: ' . $checkErr->getMessage(), 0, $checkErr);
                    }
                }

                // Create a safety backup of the current live database and prune old .bak.* files
                if (file_exists($dbPath)) {
                    $safetyBackupPath = $dbPath . '.bak.' . time();
                    @copy($dbPath, $safetyBackupPath);
                    $this->pruneDatabaseSafetyBackups($dbPath, 3);
                }

                // Disable memory-mapped I/O on the current connection before disconnecting
                try {
                    DB::connection('sqlite')->statement('PRAGMA mmap_size = 0;');
                } catch (Throwable) {
                }

                DB::disconnect('sqlite');
                DB::purge('sqlite');
                if (function_exists('gc_collect_cycles')) {
                    gc_collect_cycles();
                }

                // Restore atomically using SQLite's ACID Online Backup API (\SQLite3::backup).
                // IMPORTANT: Never unlink -wal or -shm or overwrite $dbPath via file_put_contents while
                // other PHP workers or background processes have the WAL database open and memory-mapped,
                // as that violates SQLite's WAL locking protocol and corrupts the database.
                $restoredViaOnlineBackup = false;
                if (class_exists(\SQLite3::class)) {
                    $srcDb = null;
                    $dstDb = null;
                    try {
                        $srcDb = new \SQLite3($tempRestoreSqlite, SQLITE3_OPEN_READONLY);
                        $srcDb->busyTimeout(30000);

                        $dstDb = new \SQLite3($dbPath, SQLITE3_OPEN_READWRITE | SQLITE3_OPEN_CREATE);
                        $dstDb->busyTimeout(30000);
                        @$dstDb->exec('PRAGMA mmap_size = 0;');

                        if (!$srcDb->backup($dstDb)) {
                            throw new \RuntimeException('SQLite online backup failed: ' . $dstDb->lastErrorMsg());
                        }

                        // Checkpoint and truncate the WAL file cleanly through SQLite's locking protocol
                        @$dstDb->exec('PRAGMA wal_checkpoint(TRUNCATE);');
                        $dstDb->close();
                        $dstDb = null;
                        $srcDb->close();
                        $srcDb = null;
                        $restoredViaOnlineBackup = true;
                    } catch (Throwable $sqliteErr) {
                        if ($dstDb instanceof \SQLite3) {
                            @$dstDb->close();
                        }
                        if ($srcDb instanceof \SQLite3) {
                            @$srcDb->close();
                        }
                        @unlink($tempRestoreSqlite);
                        throw new \RuntimeException("Failed to restore SQLite database [{$dbPath}]: " . $sqliteErr->getMessage(), 0, $sqliteErr);
                    }
                }

                @unlink($tempRestoreSqlite);

                if (!$restoredViaOnlineBackup) {
                    if (@file_put_contents($dbPath, $rawDbContent) === false) {
                        throw new \RuntimeException("Failed to write to database file [{$dbPath}]. Check file permissions.");
                    }
                }

                // Reconnect to restored database
                DB::purge('sqlite');
                DB::reconnect('sqlite');

                $this->finalizePostDatabaseRestore(
                    $preservedBackupLogs,
                    $preservedBackupSchedules,
                    $preservedSessions,
                    $preservedTokens,
                    $preservedLicenseAttributes,
                    true,
                    $preservedUsers
                );
                return;
            } else {
                // SQL statements
                $this->executeSqlStatements($sqlContent, $dbPath);
            }
        } else {
            // For MySQL/MariaDB/PostgreSQL, execute SQL statements
            $this->executeSqlStatements($sqlContent);
        }

        $this->finalizePostDatabaseRestore(
            $preservedBackupLogs,
            $preservedBackupSchedules,
            $preservedSessions,
            $preservedTokens,
            $preservedLicenseAttributes,
            false,
            $preservedUsers
        );
    }

    /**
     * Prune old database.sqlite.bak.* safety files so disk space does not grow unbounded.
     */
    protected function pruneDatabaseSafetyBackups(string $dbPath, int $maxKeep = 3): void
    {
        try {
            $pattern = $dbPath . '.bak.*';
            $files = glob($pattern);
            if (!is_array($files) || count($files) <= $maxKeep) {
                return;
            }

            usort($files, fn ($a, $b) => (@filemtime($b) ?: 0) <=> (@filemtime($a) ?: 0));
            foreach (array_slice($files, $maxKeep) as $oldBak) {
                @unlink($oldBak);
            }
        } catch (Throwable) {
        }
    }

    /**
     * Run post-restore schema reconciliation, pending migrations, and state preservation.
     */
    protected function finalizePostDatabaseRestore(
        array $preservedBackupLogs,
        array $preservedBackupSchedules,
        array $preservedSessions,
        array $preservedTokens,
        ?array $preservedLicenseAttributes,
        bool $runPendingMigrations = false,
        array $preservedUsers = []
    ): void {
        if ($runPendingMigrations) {
            try {
                \Illuminate\Support\Facades\Artisan::call('migrate', ['--force' => true]);
            } catch (Throwable $e) {
                Log::warning('Post-restore migration warning: ' . $e->getMessage());
            }
        }

        $this->ensureBackupSchema();
        $this->restorePreservedBackupMetadata($preservedBackupLogs, $preservedBackupSchedules);
        $this->restorePreservedAuthState($preservedSessions, $preservedTokens, $preservedUsers);
        $this->reconcileLicenseAfterRestore($preservedLicenseAttributes);

        try {
            if (class_exists(\Spatie\Permission\PermissionRegistrar::class)) {
                app(\Spatie\Permission\PermissionRegistrar::class)->forgetCachedPermissions();
            }
        } catch (Throwable) {
        }
    }

    /**
     * Preserve backup_logs and backup_schedules records across a database snapshot restore
     * so backups taken after the restored snapshot (or the snapshot's own pending record) are not lost,
     * and old deleted backups from the historical snapshot do not reappear as broken entries.
     */
    protected function restorePreservedBackupMetadata(array $preservedBackupLogs, array $preservedBackupSchedules): void
    {
        try {
            if (!empty($preservedBackupLogs) && Schema::hasTable('backup_logs')) {
                $columns = Schema::getColumnListing('backup_logs');
                $allowedKeys = array_flip($columns);

                DB::table('backup_logs')->delete();

                foreach ($preservedBackupLogs as $logRow) {
                    if (empty($logRow['filename'])) {
                        continue;
                    }
                    $filtered = array_intersect_key($logRow, $allowedKeys);
                    $type = (string) ($logRow['type'] ?? 'full');
                    $expectedFile = $this->getBackupFilePath((string) $logRow['filename'], $type);

                    if (($filtered['status'] ?? '') === 'pending' && is_file($expectedFile) && filesize($expectedFile) > 0) {
                        $filtered['status'] = 'completed';
                        $filtered['size'] = (int) @filesize($expectedFile);
                        $filtered['path'] = 'backups/' . basename($expectedFile);
                    }

                    DB::table('backup_logs')->updateOrInsert(
                        ['filename' => $logRow['filename']],
                        $filtered
                    );
                }
            }

            if (!empty($preservedBackupSchedules) && Schema::hasTable('backup_schedules')) {
                $schedColumns = Schema::getColumnListing('backup_schedules');
                $allowedSchedKeys = array_flip(array_diff($schedColumns, ['id']));
                $firstSchedule = $preservedBackupSchedules[0] ?? null;

                if (is_array($firstSchedule)) {
                    $filteredSched = array_intersect_key($firstSchedule, $allowedSchedKeys);
                    $existing = DB::table('backup_schedules')->orderBy('id')->first();
                    if ($existing) {
                        DB::table('backup_schedules')->where('id', $existing->id)->update($filteredSched);
                    } else {
                        DB::table('backup_schedules')->insert($filteredSched);
                    }
                }
            }
        } catch (Throwable $e) {
            Log::warning('Could not restore preserved backup metadata: ' . $e->getMessage());
        }
    }

    /**
     * Restore active user accounts, sessions, and personal access tokens after a database restore.
     */
    protected function restorePreservedAuthState(array $preservedSessions, array $preservedTokens, array $preservedUsers = []): void
    {
        try {
            if (!empty($preservedUsers) && Schema::hasTable('users')) {
                $userColumns = array_flip(Schema::getColumnListing('users'));
                foreach ($preservedUsers as $userRow) {
                    if (!empty($userRow['id'])) {
                        $filtered = array_intersect_key($userRow, $userColumns);
                        DB::table('users')->updateOrInsert(['id' => $userRow['id']], $filtered);
                    }
                }
            }
            if (!empty($preservedSessions) && Schema::hasTable('sessions')) {
                $sessionColumns = array_flip(Schema::getColumnListing('sessions'));
                foreach ($preservedSessions as $sessionRow) {
                    if (!empty($sessionRow['id'])) {
                        $filtered = array_intersect_key($sessionRow, $sessionColumns);
                        DB::table('sessions')->updateOrInsert(['id' => $sessionRow['id']], $filtered);
                    }
                }
            }
            if (!empty($preservedTokens) && Schema::hasTable('personal_access_tokens')) {
                $tokenColumns = array_flip(Schema::getColumnListing('personal_access_tokens'));
                foreach ($preservedTokens as $tokenRow) {
                    if (!empty($tokenRow['token'])) {
                        $filtered = array_intersect_key($tokenRow, $tokenColumns);
                        $withoutId = $filtered;
                        unset($withoutId['id']);
                        DB::table('personal_access_tokens')->updateOrInsert(['token' => $tokenRow['token']], $withoutId);
                    }
                }
            }
        } catch (Throwable) {
        }
    }

    /**
     * Ensure that restoring an old backup on a validly licensed machine preserves its active license,
     * and restoring a foreign machine's backup on a new machine revokes the mismatched license.
     */
    protected function reconcileLicenseAfterRestore(?array $preservedLicenseAttributes): void
    {
        try {
            $licenseService = app(\App\Services\LicenseService::class);
            $licenseService->clearLicenseIfMachineChanged();

            if ($preservedLicenseAttributes !== null && !($licenseService->currentStatus()['valid'] ?? false)) {
                \App\Models\License::query()->delete();
                DB::table('licenses')->insert($preservedLicenseAttributes);
            }
        } catch (Throwable) {
        }
    }

    /**
     * Split a SQL dump into individual statements while respecting quoted string literals and SQL comments.
     */
    public function splitSqlStatements(string $sqlContent): array
    {
        $statements = [];
        $current = '';
        $length = strlen($sqlContent);
        $inSingle = false;
        $inDouble = false;
        $inBacktick = false;
        $inLineComment = false;
        $inBlockComment = false;

        for ($i = 0; $i < $length; $i++) {
            $ch = $sqlContent[$i];
            $next = $i + 1 < $length ? $sqlContent[$i + 1] : '';

            if ($inLineComment) {
                if ($ch === "\n") {
                    $inLineComment = false;
                }
                continue;
            }

            if ($inBlockComment) {
                if ($ch === '*' && $next === '/') {
                    $inBlockComment = false;
                    $i++;
                }
                continue;
            }

            if (!$inSingle && !$inDouble && !$inBacktick) {
                if ($ch === '-' && $next === '-') {
                    $inLineComment = true;
                    $i++;
                    continue;
                }
                if ($ch === '/' && $next === '*') {
                    $inBlockComment = true;
                    $i++;
                    continue;
                }
            }

            if ($ch === "'" && !$inDouble && !$inBacktick) {
                if ($inSingle) {
                    // Check for doubled single quote ''
                    if ($next === "'") {
                        $current .= "''";
                        $i++;
                        continue;
                    }
                    // Check for backslash-escaped quote \'
                    $backslashes = 0;
                    $k = $i - 1;
                    while ($k >= 0 && $sqlContent[$k] === '\\') {
                        $backslashes++;
                        $k--;
                    }
                    if ($backslashes % 2 === 1) {
                        $current .= $ch;
                        continue;
                    }
                    $inSingle = false;
                } else {
                    $inSingle = true;
                }
                $current .= $ch;
                continue;
            }

            if ($ch === '"' && !$inSingle && !$inBacktick) {
                if ($inDouble && $next === '"') {
                    $current .= '""';
                    $i++;
                    continue;
                }
                $inDouble = !$inDouble;
                $current .= $ch;
                continue;
            }

            if ($ch === '`' && !$inSingle && !$inDouble) {
                $inBacktick = !$inBacktick;
                $current .= $ch;
                continue;
            }

            if ($ch === ';' && !$inSingle && !$inDouble && !$inBacktick) {
                $trimmed = trim($current);
                if ($trimmed !== '') {
                    $statements[] = $trimmed;
                }
                $current = '';
                continue;
            }

            $current .= $ch;
        }

        $trimmed = trim($current);
        if ($trimmed !== '') {
            $statements[] = $trimmed;
        }

        return $statements;
    }

    /**
     * Execute SQL statements
     */
    protected function executeSqlStatements(string $sqlContent, ?string $dbPath = null): void
    {
        $driver = config('database.default');

        if ($driver === 'sqlite') {
            DB::statement('PRAGMA foreign_keys = OFF;');
        } elseif ($driver === 'mysql' || $driver === 'mariadb') {
            DB::statement('SET FOREIGN_KEY_CHECKS = 0;');
        }

        $statements = $this->splitSqlStatements($sqlContent);

        // Validate all statements before executing any of them
        foreach ($statements as $statement) {
            $trimmedStmt = trim($statement);
            if ($trimmedStmt === '') {
                continue;
            }
            if (preg_match('/\b(ATTACH\s+DATABASE|INTO\s+(OUTFILE|DUMPFILE)|LOAD_FILE\s*\(|COPY\s+.*\s+TO\s+PROGRAM)\b/i', $trimmedStmt)) {
                throw new \RuntimeException('Unsafe SQL statement detected in backup file.');
            }
        }

        DB::transaction(function () use ($statements, $driver) {
            foreach ($statements as $statement) {
                $statement = trim($statement);
                if ($statement === '') {
                    continue;
                }

                // Normalize legacy backslash-escaped quotes when executing on SQLite
                if ($driver === 'sqlite' && str_contains($statement, "\\'")) {
                    $statement = str_replace("\\'", "''", $statement);
                }

                try {
                    DB::unprepared($statement);
                } catch (Throwable $e) {
                    Log::warning('SQL execution warning: ' . $e->getMessage());
                }
            }
        });

        if ($driver === 'sqlite') {
            DB::statement('PRAGMA foreign_keys = ON;');
        } elseif ($driver === 'mysql' || $driver === 'mariadb') {
            DB::statement('SET FOREIGN_KEY_CHECKS = 1;');
        }
    }

    /**
     * Filter settings backup payload against actual settings table columns.
     */
    protected function filterRestoredSettingsAttributes(array $raw): array
    {
        $columns = Schema::hasTable('settings')
            ? Schema::getColumnListing('settings')
            : [];
        $excluded = ['id', 'created_at', 'updated_at'];
        $allowed = array_diff($columns, $excluded);

        return array_intersect_key($raw, array_flip($allowed));
    }

    /**
     * Restore settings from backup
     */
    protected function restoreSettingsBackup(string $filepath): void
    {
        $content = file_get_contents($filepath);
        $data = json_decode((string) $content, true);

        if (!$data || !isset($data['data']) || !is_array($data['data'])) {
            throw new \RuntimeException('Invalid settings backup format');
        }

        $settings = \App\Models\Setting::firstOrCreate(['id' => 1]);
        $filtered = $this->filterRestoredSettingsAttributes($data['data']);
        if (!empty($filtered)) {
            $settings->forceFill($filtered)->save();
        }
    }

    /**
     * Restore full backup (supports both ZipArchive and pure-PHP ZIP extraction fallback)
     */
    protected function restoreFullBackup(string $filepath): void
    {
        $entries = $this->readZipArchiveEntries($filepath, false);

        $tempDir = $this->backupPath . '/temp_restore_' . uniqid('', true);
        File::makeDirectory($tempDir, 0755, true, true);

        try {
            foreach ($entries as $entryName => $content) {
                $this->assertSafeZipEntryName($entryName);
                $targetPath = $tempDir . '/' . ltrim(str_replace('\\', '/', $entryName), '/');
                $targetDir = dirname($targetPath);
                if (!File::exists($targetDir)) {
                    File::makeDirectory($targetDir, 0755, true, true);
                }
                file_put_contents($targetPath, $content);
            }

            // Restore database
            $dbBackupPath = $tempDir . '/database/database.sql.gz';
            if (!file_exists($dbBackupPath) && is_dir($tempDir . '/database')) {
                $dbCandidates = glob($tempDir . '/database/*');
                if (!empty($dbCandidates) && is_file($dbCandidates[0])) {
                    $dbBackupPath = $dbCandidates[0];
                }
            }
            if (file_exists($dbBackupPath)) {
                $this->restoreDatabaseBackup($dbBackupPath);
            }

            // Restore settings
            $settingsPath = $tempDir . '/settings.json';
            if (file_exists($settingsPath)) {
                $content = file_get_contents($settingsPath);
                $data = json_decode((string) $content, true);

                if ($data && isset($data['data']) && is_array($data['data'])) {
                    $settings = \App\Models\Setting::firstOrCreate(['id' => 1]);
                    $filtered = $this->filterRestoredSettingsAttributes($data['data']);
                    if (!empty($filtered)) {
                        $settings->forceFill($filtered)->save();
                    }
                }
            }

            // Restore bundled logo / media files if present in the archive
            $filesDir = $tempDir . '/files';
            if (is_dir($filesDir)) {
                $settings = \App\Models\Setting::first();
                $logoRelDir = ($settings && !empty($settings->logo_path))
                    ? dirname(ltrim($settings->logo_path, '/\\'))
                    : 'logos';
                if ($logoRelDir === '.' || $logoRelDir === '') {
                    $logoRelDir = 'logos';
                }
                $publicDestDir = storage_path('app/public/' . $logoRelDir);
                if (!File::exists($publicDestDir)) {
                    File::makeDirectory($publicDestDir, 0755, true, true);
                }
                foreach (glob($filesDir . '/*') ?: [] as $extractedFile) {
                    if (is_file($extractedFile)) {
                        @copy($extractedFile, $publicDestDir . '/' . basename($extractedFile));
                    }
                }
            }
        } finally {
            File::deleteDirectory($tempDir);
        }
    }

    /**
     * Delete backup
     */
    public function deleteBackup(int $id): bool
    {
        $backup = BackupLog::find($id);

        if (!$backup) {
            return false;
        }

        $filepath = $this->resolveExistingBackupFilePath($backup)
            ?? $this->getBackupFilePath($backup->filename, $backup->type);
        if (file_exists($filepath)) {
            @unlink($filepath);
        }

        $backup->delete();

        return true;
    }

    /**
     * Clean up old backups
     */
    protected function cleanupOldBackups(): void
    {
        $schedule = BackupSchedule::getSchedule();
        $maxKeep = $schedule->max_backups_keep ?? $this->maxBackups;
        $retentionDays = $schedule->retention_days ?? $this->retentionDays;

        // Remove by count
        $backups = BackupLog::orderByDesc('created_at')->skip($maxKeep)->take(100)->get();

        foreach ($backups as $backup) {
            $filepath = $this->getBackupFilePath($backup->filename, $backup->type);
            if (file_exists($filepath)) {
                @unlink($filepath);
            }
            $backup->delete();
        }

        // Remove by age
        $expiredDate = now()->subDays($retentionDays);
        $oldBackups = BackupLog::where('created_at', '<', $expiredDate)->get();

        foreach ($oldBackups as $backup) {
            $filepath = $this->getBackupFilePath($backup->filename, $backup->type);
            if (file_exists($filepath)) {
                @unlink($filepath);
            }
            $backup->delete();
        }
    }

    /**
     * Validate uploaded backup file
     */
    public function validateUploadedBackup(UploadedFile $file): array
    {
        $maxSize = 500 * 1024 * 1024; // 500MB
        $allowedExtensions = ['zip', 'sql.gz', 'gz', 'json'];

        $errors = [];

        if ($file->getSize() > $maxSize) {
            $errors[] = 'File size exceeds maximum limit of 500MB';
        }

        $extension = strtolower($file->getClientOriginalExtension());
        if (!in_array($extension, $allowedExtensions)) {
            $errors[] = 'Invalid file extension. Allowed: .zip, .sql.gz, .gz, .json';
        }

        // For ZIP files, validate structure (supports ZipArchive and pure-PHP fallback)
        if ($extension === 'zip') {
            try {
                $entries = $this->readZipArchiveEntries($file->getPathname(), true);
                $hasManifest = false;
                $hasDatabase = false;
                $hasSettings = false;

                foreach (array_keys($entries) as $name) {
                    if (str_ends_with($name, 'manifest.json')) {
                        $hasManifest = true;
                    }
                    if (str_contains($name, 'database/')) {
                        $hasDatabase = true;
                    }
                    if (str_ends_with($name, 'settings.json')) {
                        $hasSettings = true;
                    }
                }

                if (!$hasManifest && !$hasDatabase && !$hasSettings) {
                    $errors[] = 'Invalid ZIP structure. Missing required backup files.';
                }
            } catch (Throwable) {
                $errors[] = 'Cannot open ZIP file. File may be corrupted.';
            }
        }

        // For gz files, verify GZIP magic bytes
        if (in_array($extension, ['gz', 'sql.gz'])) {
            $content = @file_get_contents($file->getPathname(), false, null, 0, 100);
            if ($content === false || substr($content, 0, 2) !== "\x1f\x8b") {
                $errors[] = 'Invalid GZIP format. File may be corrupted.';
            }
        }

        // For json files, validate JSON structure
        if ($extension === 'json') {
            $content = @file_get_contents($file->getPathname());
            $data = json_decode((string) $content, true);
            if ($data === null || !isset($data['data'])) {
                $errors[] = 'Invalid JSON settings backup format.';
            }
        }

        return [
            'valid' => empty($errors),
            'errors' => $errors,
        ];
    }

    /**
     * Upload and process backup file
     */
    public function uploadBackup(UploadedFile $file, ?int $userId = null): BackupLog
    {
        @set_time_limit(300);
        @ini_set('memory_limit', '512M');

        $this->ensureBackupDirectoryExists();
        $this->ensureBackupSchema();

        $extension = strtolower($file->getClientOriginalExtension());

        $type = 'database';
        if ($extension === 'zip') {
            $type = 'full';
        } elseif ($extension === 'json') {
            $type = 'settings';
        }

        $filename = $this->generateUniqueBackupFilename($type, 'backup_uploaded');

        $backupLog = BackupLog::create([
            'filename' => $filename,
            'type' => $type,
            'size' => $file->getSize(),
            'path' => '',
            'created_by' => $userId,
            'status' => 'pending',
            'metadata' => [
                'uploaded' => true,
                'original_name' => $file->getClientOriginalName(),
            ],
        ]);

        try {
            $filepath = $this->getBackupFilePath($filename, $type);

            $file->move(dirname($filepath), basename($filepath));

            if ($type === 'full') {
                $entries = $this->readZipArchiveEntries($filepath, false);
                $manifestContent = $entries['manifest.json'] ?? null;
                if ($manifestContent) {
                    $manifest = json_decode((string) $manifestContent, true);
                    if ($manifest) {
                        $backupLog->update([
                            'metadata' => array_merge(
                                $backupLog->metadata ?? [],
                                ['manifest' => $manifest]
                            ),
                        ]);
                    }
                }
            }

            if (in_array($extension, ['gz', 'sql.gz'])) {
                $compressed = file_get_contents($filepath);
                $testDecompress = @gzdecode((string) $compressed);
                if ($testDecompress === false) {
                    throw new \RuntimeException('Invalid gzip file format. The file may be corrupted or not a valid gzip archive.');
                }
            }

            $backupLog->update([
                'path' => 'backups/' . basename($filepath),
                'status' => 'completed',
            ]);

            return $backupLog;

        } catch (Throwable $e) {
            try {
                $backupLog->update([
                    'status' => 'failed',
                    'error_message' => $e->getMessage(),
                ]);
            } catch (Throwable) {
            }

            $filepath = $this->getBackupFilePath($filename, $type);
            if (file_exists($filepath)) {
                @unlink($filepath);
            }

            throw new \RuntimeException($e->getMessage(), (int) $e->getCode(), $e);
        }
    }

    /**
     * Restore from a file path
     */
    public function restoreFromFile(string $filepath, string $password): bool
    {
        @set_time_limit(300);
        @ini_set('memory_limit', '512M');

        $user = Auth::user();
        if (!$user || !\Illuminate\Support\Facades\Hash::check($password, $user->password)) {
            throw new \RuntimeException('Invalid password');
        }

        if (!file_exists($filepath)) {
            throw new \RuntimeException('Backup file not found');
        }

        $extension = strtolower(pathinfo($filepath, PATHINFO_EXTENSION));

        try {
            if ($extension === 'zip') {
                $this->restoreFullBackup($filepath);
            } elseif ($extension === 'json') {
                $this->restoreSettingsBackup($filepath);
            } else {
                $this->restoreDatabaseBackup($filepath);
            }

            return true;

        } catch (Throwable $e) {
            throw new \RuntimeException('Restore failed: ' . $e->getMessage(), (int) $e->getCode(), $e);
        }
    }

    /**
     * Get backup type from file
     */
    public function getBackupTypeFromFile(string $filepath): string
    {
        $extension = strtolower(pathinfo($filepath, PATHINFO_EXTENSION));

        if ($extension === 'zip') {
            return 'full';
        } elseif ($extension === 'json') {
            return 'settings';
        }

        return 'database';
    }
}
