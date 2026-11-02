<?php

namespace App\Services;

use App\Models\BackupLog;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use ZipArchive;

class BackupService
{
    protected $backupPath;
    protected $maxBackups = 10;
    protected $retentionDays = 30;

    public function __construct()
    {
        $this->backupPath = storage_path('app/backups');
        $this->ensureBackupDirectoryExists();
    }

    /**
     * Ensure backup directory exists
     */
    protected function ensureBackupDirectoryExists(): void
    {
        if (!File::exists($this->backupPath)) {
            File::makeDirectory($this->backupPath, 0755, true);
        }
    }

    /**
     * Get full path for a backup file
     */
    protected function getBackupFilePath(string $filename, string $type): string
    {
        $extension = match($type) {
            'full' => 'zip',
            'settings' => 'json',
            default => 'sql.gz',
        };
        return $this->backupPath . '/' . $filename . '.' . $extension;
    }

    /**
     * Create a new backup
     */
    public function createBackup(string $type, ?int $userId = null, bool $isAutomated = false, ?string $customBackupPath = null): BackupLog
    {
        $timestamp = now()->format('Y-m-d_His');
        $filename = "backup_{$type}_{$timestamp}";
        
        $schedule = \App\Models\BackupSchedule::getSchedule();
        $destinationPath = $customBackupPath ?? $schedule->custom_backup_path;
        $destinationType = !empty($destinationPath) ? 'custom_folder' : 'local';

        $backupLog = BackupLog::create([
            'filename' => $filename,
            'type' => $type,
            'size' => 0,
            'path' => '',
            'created_by' => $userId,
            'is_automated' => $isAutomated,
            'storage_destination' => $destinationType,
            'remote_status' => !empty($destinationPath) ? 'pending' : 'skipped',
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
            if (!empty($destinationPath)) {
                $this->copyToCustomFolder($backupLog, $destinationPath);
            }
            
            // Clean up old backups based on retention settings
            $this->cleanupOldBackups();

            return $backupLog;

        } catch (\Exception $e) {
            $backupLog->update([
                'status' => 'failed',
                'error_message' => $e->getMessage(),
            ]);
            
            throw $e;
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
     * Quote a string value safely for SQL dump generation using PDO::quote().
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
        } catch (\Throwable $e) {
            // Fall through to manual escaping
        }

        return "'" . str_replace(
            ["\\", "\0", "\n", "\r", "'", '"', "\x1a"],
            ["\\\\", "\\0", "\\n", "\\r", "\\'", '\\"', "\\Z"],
            $value
        ) . "'";
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
                throw new \Exception("The destination folder [{$destinationDir}] is not writable. Please check folder permissions.");
            }

            $localFile = $this->getBackupFilePath($backupLog->filename, $backupLog->type);
            if (!File::exists($localFile)) {
                throw new \Exception("Source backup file [{$localFile}] not found.");
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
            $schedule = \App\Models\BackupSchedule::getSchedule();
            $maxKeep = $schedule->max_backups_keep ?? $this->maxBackups;
            $retentionDays = $schedule->retention_days ?? $this->retentionDays;
            $this->pruneCustomFolder($destinationDir, $maxKeep, $retentionDays);

        } catch (\Exception $e) {
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
            return filemtime($b) <=> filemtime($a);
        });

        $expiredTimestamp = now()->subDays($retentionDays)->timestamp;

        foreach ($files as $index => $filepath) {
            $mtime = filemtime($filepath);
            if ($index >= $maxKeep || $mtime < $expiredTimestamp) {
                @unlink($filepath);
            }
        }
    }

    /**
     * Create database-only backup
     */
    protected function createDatabaseBackup(BackupLog $backupLog): void
    {
        $filepath = $this->getBackupFilePath($backupLog->filename, 'database');
        
        // Get database connection config
        $driver = config('database.default');
        $config = config("database.connections.$driver");
        
        $sqlContent = '';
        
        if ($driver === 'sqlite' && !empty($config['database']) && file_exists($config['database'])) {
            // For SQLite file on disk, copy the raw binary database file content directly without text headers
            $dbPath = $config['database'];
            $sqlContent = file_get_contents($dbPath);
        } else {
            // For in-memory SQLite (:memory:), MySQL, MariaDB, or PostgreSQL, generate SQL dump
            $sqlContent = $this->generateSqlDump();
        }
        
        // Compress with gzip
        $gzContent = gzencode($sqlContent, 9);
        file_put_contents($filepath, $gzContent);
        
        $backupLog->update([
            'path' => 'backups/' . basename($filepath),
            'size' => filesize($filepath),
            'status' => 'completed',
            'metadata' => [
                'database' => config('database.database'),
                'driver' => $driver,
                'compressed' => true,
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
     * Generate MySQL dump
     */
    protected function generateMysqlDump(): string
    {
        $output = "-- Pharmacy ERP Database Backup\n";
        $output .= "-- Generated: " . now()->toIso8601String() . "\n";
        $output .= "-- Database: " . (config('database.database') ?? 'unknown') . "\n\n";
        
        // Get all tables
        $tables = DB::select('SHOW TABLES');
        $tablePrefix = config('database.connections.mysql.prefix', '');
        $key = 'Tables_in_' . (config('database.database') ?? 'database');
        
        foreach ($tables as $table) {
            $tableName = $table->$key;
            if ($tablePrefix && !str_starts_with($tableName, $tablePrefix)) {
                continue;
            }
            
            $output .= "\n-- Table structure for `$tableName`\n";
            $output .= "DROP TABLE IF EXISTS `$tableName`;\n";
            
            // Get create statement
            try {
                $createResult = DB::select("SHOW CREATE TABLE `$tableName`");
                if (!empty($createResult)) {
                    $createRow = (array) $createResult[0];
                    $createSql = array_values($createRow)[1];
                    $output .= $createSql . ";\n\n";
                }
            } catch (\Exception $e) {
                $output .= "-- Could not get CREATE TABLE structure\n\n";
            }
            
            // Get table data
            try {
                $rows = DB::table($tableName)->get();
                if ($rows->isNotEmpty()) {
                    $output .= "-- Dumping data for `$tableName`\n";
                    
                    $columns = DB::getSchemaBuilder()->getColumnListing($tableName);
                    $columnList = '`' . implode('`, `', $columns) . '`';
                    
                    foreach ($rows as $row) {
                        $values = [];
                        foreach ($columns as $col) {
                            $value = $row->$col;
                            if ($value === null) {
                                $values[] = 'NULL';
                            } elseif (is_bool($value)) {
                                $values[] = $value ? '1' : '0';
                            } elseif (is_numeric($value)) {
                                $values[] = $value;
                            } elseif (is_string($value)) {
                                $values[] = $this->quoteSqlValue($value);
                            } else {
                                $values[] = $this->quoteSqlValue((string) json_encode($value));
                            }
                        }
                        $output .= "INSERT INTO `$tableName` ($columnList) VALUES (" . implode(', ', $values) . ");\n";
                    }
                    $output .= "\n";
                }
            } catch (\Exception $e) {
                $output .= "-- Could not dump table data: " . $e->getMessage() . "\n\n";
            }
        }
        
        return $output;
    }

    /**
     * Generate PostgreSQL dump
     */
    protected function generatePgsqlDump(): string
    {
        $output = "-- Pharmacy ERP Database Backup (PostgreSQL)\n";
        $output .= "-- Generated: " . now()->toIso8601String() . "\n\n";
        
        try {
            $tables = DB::select("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
            
            foreach ($tables as $table) {
                $tableName = $table->tablename;
                $output .= "-- Table: $tableName\n\n";
                
                try {
                    $rows = DB::table($tableName)->get();
                    if ($rows->isNotEmpty()) {
                        $columns = DB::getSchemaBuilder()->getColumnListing($tableName);
                        $columnList = '"' . implode('", "', $columns) . '"';
                        
                        foreach ($rows as $row) {
                            $values = [];
                            foreach ($columns as $col) {
                                $value = $row->$col;
                                if ($value === null) {
                                    $values[] = 'NULL';
                                } elseif (is_bool($value)) {
                                    $values[] = $value ? 'TRUE' : 'FALSE';
                                } elseif (is_numeric($value)) {
                                    $values[] = $value;
                                } else {
                                    $values[] = "'" . str_replace("'", "''", $value) . "'";
                                }
                            }
                            $output .= "INSERT INTO \"$tableName\" ($columnList) VALUES (" . implode(', ', $values) . ");\n";
                        }
                        $output .= "\n";
                    }
                } catch (\Exception $e) {
                    $output .= "-- Could not dump table data: " . $e->getMessage() . "\n\n";
                }
            }
        } catch (\Exception $e) {
            $output .= "-- Could not get tables: " . $e->getMessage() . "\n";
        }
        
        return $output;
    }

    /**
     * Generate generic SQL dump
     */
    protected function generateGenericDump(): string
    {
        $output = "-- Pharmacy ERP Database Backup\n";
        $output .= "-- Generated: " . now()->toIso8601String() . "\n\n";
        
        try {
            $tables = DB::select("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'migrations'");
            
            foreach ($tables as $table) {
                $tableName = $table->name;
                $output .= "-- Table: $tableName\n";
                $output .= "DELETE FROM `$tableName`;\n";
                
                try {
                    $rows = DB::table($tableName)->get();
                    if ($rows->isNotEmpty()) {
                        $columns = DB::getSchemaBuilder()->getColumnListing($tableName);
                        $columnList = '`' . implode('`, `', $columns) . '`';
                        
                        foreach ($rows as $row) {
                            $values = [];
                            foreach ($columns as $col) {
                                $value = $row->$col;
                                if ($value === null) {
                                    $values[] = 'NULL';
                                } elseif (is_bool($value)) {
                                    $values[] = $value ? '1' : '0';
                                } elseif (is_numeric($value)) {
                                    $values[] = $value;
                                } elseif (is_string($value)) {
                                    $values[] = "'" . addslashes($value) . "'";
                                } else {
                                    $values[] = "'" . addslashes(json_encode($value)) . "'";
                                }
                            }
                            $output .= "INSERT INTO `$tableName` ($columnList) VALUES (" . implode(', ', $values) . ");\n";
                        }
                        $output .= "\n";
                    }
                } catch (\Exception $e) {
                    $output .= "-- Could not dump table data: " . $e->getMessage() . "\n\n";
                }
            }
        } catch (\Exception $e) {
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
        
        file_put_contents($filepath, json_encode($backupData, JSON_PRETTY_PRINT));
        
        $backupLog->update([
            'path' => 'backups/' . basename($filepath),
            'size' => filesize($filepath),
            'status' => 'completed',
            'metadata' => [
                'settings_backup' => true,
            ],
        ]);
    }

    /**
     * Create full backup (database + settings + files)
     */
    protected function createFullBackup(BackupLog $backupLog): void
    {
        $filepath = $this->getBackupFilePath($backupLog->filename, 'full');
        
        $zip = new ZipArchive();
        
        if ($zip->open($filepath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            throw new \Exception('Could not create zip archive');
        }
        
        // Add database backup
        $dbFilename = "database.sql.gz";
        $tempDbPath = $this->backupPath . '/temp_db_' . time() . '.sql.gz';
        
        $driver = config('database.default');
        
        $dbContent = '';
        if ($driver === 'sqlite') {
            $config = config('database.connections.sqlite');
            if (!empty($config['database']) && file_exists($config['database'])) {
                $dbPath = $config['database'];
                $dbContent = file_get_contents($dbPath);
            } else {
                $dbContent = $this->generateSqlDump();
            }
        } else {
            $dbContent = $this->generateSqlDump();
        }
        
        if (!empty($dbContent)) {
            $gzContent = gzencode($dbContent, 9);
            file_put_contents($tempDbPath, $gzContent);
            if (file_exists($tempDbPath)) {
                $zip->addFile($tempDbPath, 'database/' . $dbFilename);
            }
        }
        
        // Add settings backup
        $settings = \App\Models\Setting::first();
        $settingsData = [
            'generated_at' => now()->toIso8601String(),
            'type' => 'settings',
            'version' => '1.0',
            'data' => $settings ? $settings->toArray() : null,
        ];
        $zip->addFromString('settings.json', json_encode($settingsData, JSON_PRETTY_PRINT));
        
        // Add logo files if exist
        if ($settings && $settings->logo_path) {
            $fullLogoPath = storage_path('app/public/' . $settings->logo_path);
            if (file_exists($fullLogoPath)) {
                $zip->addFile($fullLogoPath, 'files/' . basename($settings->logo_path));
            }
        }
        
        // Add manifest
        $manifest = [
            'generated_at' => now()->toIso8601String(),
            'type' => 'full',
            'version' => '1.0',
            'database_driver' => $driver,
            'database_backup' => 'database/' . $dbFilename,
            'settings_backup' => 'settings.json',
            'files_included' => !empty($settings?->logo_path),
        ];
        
        $zip->addFromString('manifest.json', json_encode($manifest, JSON_PRETTY_PRINT));
        $zip->close();
        
        // Clean up temp file
        if (file_exists($tempDbPath)) {
            unlink($tempDbPath);
        }
        
        $backupLog->update([
            'path' => 'backups/' . basename($filepath),
            'size' => filesize($filepath),
            'status' => 'completed',
            'metadata' => [
                'database_backup' => $dbFilename,
                'settings_backup' => true,
                'files_included' => !empty($settings?->logo_path),
            ],
        ]);
    }

    /**
     * List all backups
     */
    public function listBackups(): array
    {
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
                    'is_automated' => (bool)$backup->is_automated,
                    'storage_destination' => $backup->storage_destination ?? 'local',
                    'remote_path' => $backup->remote_path,
                    'remote_status' => $backup->remote_status ?? 'skipped',
                    'remote_error' => $backup->remote_error,
                    'created_at' => $backup->created_at,
                    'created_at_formatted' => $backup->created_at->format('M d, Y h:i A'),
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
        
        $filepath = $this->getBackupFilePath($backup->filename, $backup->type);
        if (!file_exists($filepath)) {
            return null;
        }
        
        // Temporarily add the full_path property
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
        $backup = BackupLog::find($id);
        
        if (!$backup || !in_array($backup->status, ['completed', 'restored', 'pending'])) {
            throw new \Exception('Backup not found or invalid');
        }
        
        // Verify password
        $user = Auth::user();
        if (!$user || !\Illuminate\Support\Facades\Hash::check($password, $user->password)) {
            throw new \Exception('Invalid password');
        }
        
        $filepath = $this->getBackupFilePath($backup->filename, $backup->type);
        if (!file_exists($filepath)) {
            throw new \Exception('Backup file not found');
        }
        
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
            
            // Update backup log status if it exists in restored database
            try {
                BackupLog::where('id', $backup->id)->update([
                    'status' => 'restored',
                ]);
            } catch (\Exception $ignored) {
                // Ignore if the backup record was created after the restored snapshot
            }
            
            return true;
            
        } catch (\Exception $e) {
            try {
                $backup->update([
                    'status' => 'failed',
                    'error_message' => 'Restore failed: ' . $e->getMessage(),
                ]);
            } catch (\Exception $ignored) {}
            
            throw new \Exception('Restore failed: ' . $e->getMessage());
        }
    }

    /**
     * Restore database from backup
     */
    protected function restoreDatabaseBackup(string $filepath): void
    {
        // Decompress
        $compressed = file_get_contents($filepath);
        $sqlContent = @gzdecode($compressed);
        
        if ($sqlContent === false) {
            $sqlContent = $compressed;
        }

        if (empty($sqlContent)) {
            throw new \Exception('Failed to read or decompress backup file');
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
        } catch (\Throwable $ignored) {
        }
        
        $driver = config('database.default');
        
        if ($driver === 'sqlite') {
            $config = config('database.connections.sqlite');
            $dbPath = $config['database'] ?? null;
            if (!$dbPath) {
                throw new \Exception('SQLite database path is not configured.');
            }
            
            // Check if this backup contains a raw binary SQLite database and target is a file on disk
            // (even if an older backup had a text header prepended, locate "SQLite format 3")
            $sqliteMagicPos = strpos($sqlContent, 'SQLite format 3');
            
            if ($sqliteMagicPos !== false && $dbPath !== ':memory:') {
                $rawDbContent = substr($sqlContent, $sqliteMagicPos);
                
                // Disconnect SQLite PDO to release active file locks
                DB::disconnect('sqlite');
                DB::purge('sqlite');

                // Safety backup of current database
                if (file_exists($dbPath)) {
                    @copy($dbPath, $dbPath . '.bak.' . time());
                }

                // Remove WAL journal files if present to prevent stale transaction replay
                if (file_exists($dbPath . '-wal')) {
                    @unlink($dbPath . '-wal');
                }
                if (file_exists($dbPath . '-shm')) {
                    @unlink($dbPath . '-shm');
                }

                $written = file_put_contents($dbPath, $rawDbContent);
                if ($written === false) {
                    throw new \Exception("Failed to write to database file [{$dbPath}]. Check file permissions.");
                }

                // Reconnect to restored database
                DB::purge('sqlite');
                DB::reconnect('sqlite');

                $this->reconcileLicenseAfterRestore($preservedLicenseAttributes);
                return;
            } else {
                // SQL statements
                $this->executeSqlStatements($sqlContent, $dbPath);
            }
        } else {
            // For MySQL/PostgreSQL, execute SQL statements
            $this->executeSqlStatements($sqlContent);
        }

        $this->reconcileLicenseAfterRestore($preservedLicenseAttributes);
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
        } catch (\Throwable $ignored) {
        }
    }

    /**
     * Execute SQL statements
     */
    protected function executeSqlStatements(string $sqlContent, ?string $dbPath = null): void
    {
        $driver = config('database.default');

        if ($driver === 'sqlite') {
            DB::statement('PRAGMA foreign_keys = OFF;');
        } elseif ($driver === 'mysql') {
            DB::statement('SET FOREIGN_KEY_CHECKS = 0;');
        }

        // Remove comments
        $lines = explode("\n", $sqlContent);
        $cleanLines = [];
        foreach ($lines as $line) {
            $trimmed = trim($line);
            if (!str_starts_with($trimmed, '--') && !str_starts_with($trimmed, '/*') && !empty($trimmed)) {
                $cleanLines[] = $line;
            }
        }
        $cleanSql = implode("\n", $cleanLines);
        
        // Split by semicolons
        $statements = array_filter(array_map('trim', explode(";\n", $cleanSql)));
        if (empty($statements)) {
            $statements = array_filter(array_map('trim', explode(';', $cleanSql)));
        }
        
        // Validate all statements before executing any of them
        foreach ($statements as $statement) {
            $trimmedStmt = trim($statement);
            if ($trimmedStmt === '') {
                continue;
            }
            if (preg_match('/\b(ATTACH\s+DATABASE|INTO\s+(OUTFILE|DUMPFILE)|LOAD_FILE\s*\(|COPY\s+.*\s+TO\s+PROGRAM)\b/i', $trimmedStmt)) {
                throw new \Exception('Unsafe SQL statement detected in backup file.');
            }
        }

        DB::transaction(function () use ($statements) {
            foreach ($statements as $statement) {
                $statement = trim($statement);
                if (!empty($statement)) {
                    try {
                        DB::unprepared($statement);
                    } catch (\Exception $e) {
                        Log::warning('SQL execution warning: ' . $e->getMessage());
                    }
                }
            }
        });

        if ($driver === 'sqlite') {
            DB::statement('PRAGMA foreign_keys = ON;');
        } elseif ($driver === 'mysql') {
            DB::statement('SET FOREIGN_KEY_CHECKS = 1;');
        }
    }

    /**
     * Filter settings backup payload against actual settings table columns.
     */
    protected function filterRestoredSettingsAttributes(array $raw): array
    {
        $columns = \Illuminate\Support\Facades\Schema::hasTable('settings')
            ? \Illuminate\Support\Facades\Schema::getColumnListing('settings')
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
        $data = json_decode($content, true);
        
        if (!$data || !isset($data['data']) || !is_array($data['data'])) {
            throw new \Exception('Invalid settings backup format');
        }
        
        $settings = \App\Models\Setting::firstOrCreate(['id' => 1]);
        $filtered = $this->filterRestoredSettingsAttributes($data['data']);
        if (!empty($filtered)) {
            $settings->forceFill($filtered)->save();
        }
    }

    /**
     * Restore full backup
     */
    protected function restoreFullBackup(string $filepath): void
    {
        $zip = new ZipArchive();
        if ($zip->open($filepath) !== true) {
            throw new \Exception('Could not open backup zip file');
        }

        // Prevent Zip Slip path traversal prior to extraction
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $entryName = $zip->getNameIndex($i);
            if (
                $entryName === false
                || str_contains($entryName, "\0")
                || preg_match('#(^|[\\\\/])\.\.([\\\\/]|$)#', $entryName)
                || str_starts_with($entryName, '/')
                || str_starts_with($entryName, '\\')
                || str_contains($entryName, ':')
            ) {
                $zip->close();
                throw new \Exception('Unsafe file path detected inside backup archive.');
            }
        }
        
        // Extract to temp directory
        $tempDir = $this->backupPath . '/temp_restore_' . time();
        File::makeDirectory($tempDir, 0755, true);
        
        $zip->extractTo($tempDir);
        $zip->close();
        
        // Restore database
        $dbBackupPath = $tempDir . '/database/database.sql.gz';
        if (file_exists($dbBackupPath)) {
            $this->restoreDatabaseBackup($dbBackupPath);
        }
        
        // Restore settings
        $settingsPath = $tempDir . '/settings.json';
        if (file_exists($settingsPath)) {
            $content = file_get_contents($settingsPath);
            $data = json_decode($content, true);
            
            if ($data && isset($data['data']) && is_array($data['data'])) {
                $settings = \App\Models\Setting::firstOrCreate(['id' => 1]);
                $filtered = $this->filterRestoredSettingsAttributes($data['data']);
                if (!empty($filtered)) {
                    $settings->forceFill($filtered)->save();
                }
            }
        }
        
        // Clean up temp directory
        File::deleteDirectory($tempDir);
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
        
        // Delete file
        $filepath = $this->getBackupFilePath($backup->filename, $backup->type);
        if (file_exists($filepath)) {
            unlink($filepath);
        }
        
        // Delete record
        $backup->delete();
        
        return true;
    }

    /**
     * Clean up old backups
     */
    protected function cleanupOldBackups(): void
    {
        $schedule = \App\Models\BackupSchedule::getSchedule();
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

        // Check file size
        if ($file->getSize() > $maxSize) {
            $errors[] = 'File size exceeds maximum limit of 500MB';
        }

        // Check extension
        $extension = strtolower($file->getClientOriginalExtension());
        if (!in_array($extension, $allowedExtensions)) {
            $errors[] = 'Invalid file extension. Allowed: .zip, .sql.gz, .gz, .json';
        }

        // For ZIP files, try to validate structure
        if ($extension === 'zip') {
            $zip = new ZipArchive();
            if ($zip->open($file->getPathname()) === true) {
                // Check for required files
                $hasManifest = false;
                $hasDatabase = false;
                $hasSettings = false;

                for ($i = 0; $i < $zip->numFiles; $i++) {
                    $name = $zip->getNameIndex($i);
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

                $zip->close();
            } else {
                $errors[] = 'Cannot open ZIP file. File may be corrupted.';
            }
        }

        // For gz files, try to decompress
        if (in_array($extension, ['gz', 'sql.gz'])) {
            $content = file_get_contents($file->getPathname(), false, null, 0, 100);
            if (substr($content, 0, 2) !== "\x1f\x8b") {
                $errors[] = 'Invalid GZIP format. File may be corrupted.';
            }
        }

        // For json files, validate JSON structure
        if ($extension === 'json') {
            $content = file_get_contents($file->getPathname());
            $data = json_decode($content, true);
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
        $extension = strtolower($file->getClientOriginalExtension());
        $timestamp = now()->format('Y-m-d_His');
        $filename = "backup_uploaded_{$timestamp}";

        // Determine backup type from file
        $type = 'database';
        if ($extension === 'zip') {
            $type = 'full';
        } elseif ($extension === 'json') {
            $type = 'settings';
        }

        // Create backup log entry
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

            // Move uploaded file to backup directory
            $file->move(dirname($filepath), basename($filepath));

            // For ZIP files, verify structure
            if ($type === 'full') {
                $zip = new ZipArchive();
                if ($zip->open($filepath) !== true) {
                    throw new \Exception('Cannot open uploaded ZIP file');
                }

                // Extract manifest to get metadata
                $manifestContent = $zip->getFromName('manifest.json');
                if ($manifestContent) {
                    $manifest = json_decode($manifestContent, true);
                    if ($manifest) {
                        $backupLog->update([
                            'metadata' => array_merge(
                                $backupLog->metadata ?? [],
                                ['manifest' => $manifest]
                            ),
                        ]);
                    }
                }
                $zip->close();
            }

            // For .gz or .sql.gz files, verify it's valid gzip
            if (in_array($extension, ['gz', 'sql.gz'])) {
                $compressed = file_get_contents($filepath);
                $testDecompress = gzdecode($compressed);
                if ($testDecompress === false) {
                    throw new \Exception('Invalid gzip file format. The file may be corrupted or not a valid gzip archive.');
                }
            }

            $backupLog->update([
                'path' => 'backups/' . basename($filepath),
                'status' => 'completed',
            ]);

            return $backupLog;

        } catch (\Exception $e) {
            $backupLog->update([
                'status' => 'failed',
                'error_message' => $e->getMessage(),
            ]);

            // Clean up uploaded file
            $filepath = $this->getBackupFilePath($filename, $type);
            if (file_exists($filepath)) {
                unlink($filepath);
            }

            throw $e;
        }
    }

    /**
     * Restore from a file path
     */
    public function restoreFromFile(string $filepath, string $password): bool
    {
        // Verify password
        $user = Auth::user();
        if (!$user || !\Illuminate\Support\Facades\Hash::check($password, $user->password)) {
            throw new \Exception('Invalid password');
        }

        if (!file_exists($filepath)) {
            throw new \Exception('Backup file not found');
        }

        $extension = strtolower(pathinfo($filepath, PATHINFO_EXTENSION));

        try {
            // Determine backup type from file extension
            if ($extension === 'zip') {
                $this->restoreFullBackup($filepath);
            } elseif ($extension === 'json') {
                $this->restoreSettingsBackup($filepath);
            } else {
                // Assume gzip SQL backup
                $this->restoreDatabaseBackup($filepath);
            }

            return true;

        } catch (\Exception $e) {
            throw new \Exception('Restore failed: ' . $e->getMessage());
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

