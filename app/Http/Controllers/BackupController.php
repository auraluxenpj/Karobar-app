<?php

namespace App\Http\Controllers;

use App\Models\BackupLog;
use App\Models\BackupSchedule;
use App\Services\BackupService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\File;
use Illuminate\Validation\Rule;

class BackupController extends Controller
{
    protected BackupService $backupService;

    public function __construct(BackupService $backupService)
    {
        $this->backupService = $backupService;
    }

    /**
     * List all backups
     * GET /api/backups
     */
    public function index()
    {
        $this->authorize('view', BackupLog::class);
        
        $backups = $this->backupService->listBackups();
        
        return response()->json([
            'backups' => $backups,
            'total' => count($backups),
        ]);
    }

    /**
     * Create a new backup
     * POST /api/backups
     */
    public function store(Request $request)
    {
        $this->authorize('create', BackupLog::class);
        
        $validated = $request->validate([
            'type' => ['required', Rule::in(['full', 'database', 'settings'])],
            'custom_backup_path' => ['nullable', 'string', 'max:500'],
        ]);

        if (!empty($validated['custom_backup_path'])) {
            try {
                $this->backupService->assertSafeBackupDirectory($validated['custom_backup_path']);
            } catch (\InvalidArgumentException $e) {
                return response()->json([
                    'message' => $e->getMessage(),
                    'errors' => ['custom_backup_path' => [$e->getMessage()]],
                ], 422);
            }
        }
        
        $userId = Auth::id() !== null ? (int) Auth::id() : null;
        
        try {
            $backup = $this->backupService->createBackup(
                type: $validated['type'],
                userId: $userId,
                isAutomated: false,
                customBackupPath: $validated['custom_backup_path'] ?? null
            );
            
            return response()->json([
                'message' => 'Backup created successfully',
                'backup' => [
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
                    'created_at' => $backup->created_at->format('M d, Y h:i A'),
                ],
            ], 201);
            
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to create backup',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Download a backup
     * GET /api/backups/{id}/download
     */
    public function download(int $id)
    {
        $this->authorize('view', BackupLog::class);
        
        $backup = BackupLog::find($id);
        
        if (!$backup || !in_array($backup->status, ['completed', 'restored', 'pending'])) {
            return response()->json([
                'message' => 'Backup not found or unavailable',
            ], 404);
        }
        
        $filepath = $this->backupService->getDownloadPath($id);
        
        if (!$filepath || !file_exists($filepath)) {
            return response()->json([
                'message' => 'Backup file not found',
            ], 404);
        }
        
        // Determine file extension based on backup type
        $extension = match($backup->type) {
            'full' => 'zip',
            'settings' => 'json',
            default => 'sql.gz',
        };
        
        $filename = $backup->filename . '.' . $extension;
        
        return response()->download($filepath, $filename, [
            'Content-Type' => 'application/octet-stream',
        ]);
    }

    /**
     * Restore from backup
     * POST /api/backups/{id}/restore
     */
    public function restore(Request $request, int $id)
    {
        $this->authorize('restore', BackupLog::class);
        
        $validated = $request->validate([
            'password' => ['required', 'string', 'min:6'],
        ]);
        
        try {
            $this->backupService->restoreBackup($id, $validated['password']);
            
            return response()->json([
                'message' => 'Backup restored successfully. Please refresh the page.',
            ]);
            
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Restore failed',
                'error' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Delete a backup
     * DELETE /api/backups/{id}
     */
    public function destroy(int $id)
    {
        $this->authorize('delete', BackupLog::class);
        
        $deleted = $this->backupService->deleteBackup($id);
        
        if (!$deleted) {
            return response()->json([
                'message' => 'Backup not found',
            ], 404);
        }
        
        return response()->json([
            'message' => 'Backup deleted successfully',
        ]);
    }

    /**
     * Get backup statistics
     * GET /api/backups/stats
     */
    public function stats()
    {
        $this->authorize('view', BackupLog::class);
        
        $totalBackups = BackupLog::count();
        $completedBackups = BackupLog::where('status', 'completed')->count();
        $failedBackups = BackupLog::where('status', 'failed')->count();
        
        $totalSize = (int) BackupLog::where('status', 'completed')->sum('size');
        
        $lastBackup = BackupLog::where('status', 'completed')
            ->orderByDesc('created_at')
            ->first();
        
        return response()->json([
            'total_backups' => $totalBackups,
            'completed_backups' => $completedBackups,
            'failed_backups' => $failedBackups,
            'total_size' => $totalSize,
            'formatted_total_size' => $this->formatBytes($totalSize),
            'last_backup_at' => $lastBackup?->created_at?->format('M d, Y h:i A'),
            'schedule' => BackupSchedule::getSchedule(),
        ]);
    }

    /**
     * Format bytes to human readable
     */
    protected function formatBytes(int $bytes): string
    {
        if ($bytes === 0) return '0 B';
        
        $units = ['B', 'KB', 'MB', 'GB'];
        $i = floor(log($bytes, 1024));
        
        return round($bytes / pow(1024, $i), 2) . ' ' . $units[$i];
    }

    /**
     * Validate an uploaded backup file
     * POST /api/backups/upload/validate
     */
    public function validateUpload(Request $request)
    {
        $this->authorize('upload', BackupLog::class);

        $request->validate([
            'file' => ['required', 'file'],
        ]);

        try {
            $validation = $this->backupService->validateUploadedBackup($request->file('file'));

            return response()->json([
                'valid' => $validation['valid'],
                'errors' => $validation['errors'],
            ]);

        } catch (\Exception $e) {
            return response()->json([
                'valid' => false,
                'errors' => [$e->getMessage()],
            ], 422);
        }
    }

    /**
     * Upload a backup file
     * POST /api/backups/upload
     */
    public function upload(Request $request)
    {
        $this->authorize('upload', BackupLog::class);

        $validator = \Illuminate\Support\Facades\Validator::make($request->all(), [
            'file' => ['required', 'file', 'max:512000'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation failed',
                'errors' => $validator->errors()->all(),
            ], 422);
        }

        $backupValidation = $this->backupService->validateUploadedBackup($request->file('file'));
        if (empty($backupValidation['valid'])) {
            return response()->json([
                'message' => 'Invalid backup file',
                'errors'  => $backupValidation['errors'] ?? ['Invalid backup archive format.'],
            ], 422);
        }

        $userId = Auth::id() !== null ? (int) Auth::id() : null;

        try {
            $backup = $this->backupService->uploadBackup($request->file('file'), $userId);

            return response()->json([
                'message' => 'Backup uploaded successfully',
                'backup' => [
                    'id' => $backup->id,
                    'filename' => $backup->filename,
                    'type' => $backup->type,
                    'type_label' => $backup->type_label,
                    'size' => $backup->size,
                    'formatted_size' => $backup->formatted_size,
                    'status' => $backup->status,
                    'created_at' => $backup->created_at->format('M d, Y h:i A'),
                    'original_name' => $backup->metadata['original_name'] ?? null,
                ],
            ], 201);

        } catch (\Illuminate\Database\QueryException $e) {
            return response()->json([
                'message' => 'Database error during upload',
                'error' => 'A backup with a similar filename may already exist. Please try again.',
            ], 422);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to upload backup',
                'error' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Restore from an uploaded backup file
     * POST /api/backups/upload/restore
     */
    public function restoreFromUpload(Request $request)
    {
        $this->authorize('restore', BackupLog::class);

        $request->validate([
            'file_id' => ['required', 'integer', 'exists:backup_logs,id'],
            'password' => ['required', 'string', 'min:6'],
        ]);

        try {
            $backup = BackupLog::find($request->file_id);

            if (!$backup || !in_array($backup->status, ['completed', 'restored', 'pending'])) {
                return response()->json([
                    'message' => 'Backup file not found or unavailable',
                ], 404);
            }

            $filepath = $this->backupService->getDownloadPath($backup->id);

            if (!$filepath || !file_exists($filepath)) {
                return response()->json([
                    'message' => 'Backup file not found on server',
                ], 404);
            }

            $this->backupService->restoreFromFile($filepath, $request->password);

            // Update backup log status
            $backup->update([
                'status' => 'restored',
            ]);

            return response()->json([
                'message' => 'Backup restored successfully. Please refresh the page.',
            ]);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Restore failed',
                'error' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Get automated backup schedule & cloud storage settings
     * GET /api/backups/schedule
     */
    public function getSchedule()
    {
        $this->authorize('view', BackupLog::class);

        return response()->json([
            'schedule' => BackupSchedule::getSchedule(),
        ]);
    }

    /**
     * Update automated backup schedule & storage settings
     * POST /api/backups/schedule
     */
    public function updateSchedule(Request $request)
    {
        $this->authorize('create', BackupLog::class);

        $validated = $request->validate([
            'is_automated' => ['required', 'boolean'],
            'frequency' => ['required', Rule::in(['daily', 'weekly', 'monthly'])],
            'time_of_day' => ['required', 'string', 'regex:/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/'],
            'day_of_week' => ['nullable', 'integer', 'between:0,6'],
            'day_of_month' => ['nullable', 'integer', 'between:1,28'],
            'backup_type' => ['required', Rule::in(['full', 'database', 'settings'])],
            'retention_days' => ['required', 'integer', 'min:1', 'max:365'],
            'max_backups_keep' => ['required', 'integer', 'min:1', 'max:100'],
            'custom_backup_path' => ['nullable', 'string', 'max:500'],
            'storage_destination' => ['required', Rule::in(['local', 'custom_folder'])],
            'destination_config' => ['nullable', 'array'],
            'notify_on_failure' => ['required', 'boolean'],
            'notification_email' => ['nullable', 'email'],
        ]);

        if (!empty($validated['custom_backup_path'])) {
            try {
                $this->backupService->assertSafeBackupDirectory($validated['custom_backup_path']);
            } catch (\InvalidArgumentException $e) {
                return response()->json([
                    'message' => $e->getMessage(),
                    'errors' => ['custom_backup_path' => [$e->getMessage()]],
                ], 422);
            }
        }

        $schedule = BackupSchedule::getSchedule();
        $schedule->update($validated);

        return response()->json([
            'message' => 'Backup schedule and storage settings updated successfully',
            'schedule' => $schedule->fresh(),
        ]);
    }

    /**
     * Test accessibility and write permissions for a storage destination folder
     * POST /api/backups/test-destination
     */
    public function testDestination(Request $request)
    {
        $this->authorize('create', BackupLog::class);

        $validated = $request->validate([
            'destination' => ['sometimes', Rule::in(['local', 'custom_folder'])],
            'custom_backup_path' => ['nullable', 'string', 'max:500'],
        ]);

        $destination = $validated['destination'] ?? 'local';
        $customPath = trim($validated['custom_backup_path'] ?? '');

        // If local storage or empty custom path is specified
        if ($destination === 'local' && empty($customPath)) {
            $defaultPath = storage_path('app/backups');
            if (!File::exists($defaultPath)) {
                File::makeDirectory($defaultPath, 0755, true, true);
            }

            $isWritable = is_writable($defaultPath);
            $freeBytes = @disk_free_space($defaultPath);
            $freeSpaceFormatted = $freeBytes !== false ? $this->formatBytes((int)$freeBytes) : 'Unknown';

            return response()->json([
                'success' => $isWritable,
                'path' => $defaultPath,
                'writable' => $isWritable,
                'free_space' => $freeSpaceFormatted,
                'message' => $isWritable 
                    ? "Default storage folder is ready and writable ({$freeSpaceFormatted} free)."
                    : "Default storage folder is not writable. Please check server permissions.",
            ], $isWritable ? 200 : 422);
        }

        // Test custom backup path
        if (empty($customPath)) {
            return response()->json([
                'success' => false,
                'message' => 'Please enter a valid folder path to test.',
            ], 422);
        }

        try {
            $this->backupService->assertSafeBackupDirectory($customPath);

            if (!File::exists($customPath)) {
                File::makeDirectory($customPath, 0755, true, true);
            }

            if (!File::isDirectory($customPath)) {
                return response()->json([
                    'success' => false,
                    'path' => $customPath,
                    'message' => "The specified path is not a valid directory: {$customPath}",
                ], 422);
            }

            if (!is_writable($customPath)) {
                return response()->json([
                    'success' => false,
                    'path' => $customPath,
                    'message' => "Folder exists but is NOT writable. Please check folder permissions.",
                ], 422);
            }

            // Test writing and deleting a temporary probe file
            $probeFile = rtrim($customPath, DIRECTORY_SEPARATOR . '/\\') . DIRECTORY_SEPARATOR . '.karobar_probe_' . time() . '.tmp';
            File::put($probeFile, 'karobar_write_test');
            if (File::exists($probeFile)) {
                File::delete($probeFile);
            }

            $freeBytes = @disk_free_space($customPath);
            $freeSpaceFormatted = $freeBytes !== false ? $this->formatBytes((int)$freeBytes) : 'Available';

            return response()->json([
                'success' => true,
                'path' => $customPath,
                'writable' => true,
                'free_space' => $freeSpaceFormatted,
                'message' => "Folder is accessible, writable, and ready for backups ({$freeSpaceFormatted} free).",
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'path' => $customPath,
                'message' => "Failed to access folder: " . $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Browse local/server directories for backup destination
     * GET /api/backups/browse-directories
     */
    public function browseDirectories(Request $request)
    {
        $this->authorize('create', BackupLog::class);

        $requestedPath = $request->query('path');
        $isWindows = strtoupper(substr(PHP_OS, 0, 3)) === 'WIN';

        // Useful quick shortcut locations
        $shortcuts = [];
        $home = getenv('HOME') ?: getenv('USERPROFILE');
        if ($home && is_dir($home)) {
            $shortcuts[] = ['name' => 'Home', 'path' => $home, 'type' => 'home'];
            $desktop = $home . DIRECTORY_SEPARATOR . 'Desktop';
            if (is_dir($desktop)) {
                $shortcuts[] = ['name' => 'Desktop', 'path' => $desktop, 'type' => 'desktop'];
            }
            $documents = $home . DIRECTORY_SEPARATOR . 'Documents';
            if (is_dir($documents)) {
                $shortcuts[] = ['name' => 'Documents', 'path' => $documents, 'type' => 'documents'];
            }
            $downloads = $home . DIRECTORY_SEPARATOR . 'Downloads';
            if (is_dir($downloads)) {
                $shortcuts[] = ['name' => 'Downloads', 'path' => $downloads, 'type' => 'downloads'];
            }
        }

        // External drives & system mount shortcuts
        if ($isWindows) {
            foreach (range('C', 'Z') as $letter) {
                $drive = $letter . ':\\';
                if (@is_dir($drive)) {
                    $shortcuts[] = ['name' => "Drive ({$letter}:)", 'path' => $drive, 'type' => 'drive'];
                }
            }
        } else {
            if (is_dir('/Volumes')) {
                $shortcuts[] = ['name' => 'External Drives (/Volumes)', 'path' => '/Volumes', 'type' => 'drive'];
            }
            if (is_dir('/media')) {
                $shortcuts[] = ['name' => 'Media Mounts (/media)', 'path' => '/media', 'type' => 'drive'];
            }
            if (is_dir('/mnt')) {
                $shortcuts[] = ['name' => 'System Mounts (/mnt)', 'path' => '/mnt', 'type' => 'drive'];
            }
        }

        // App default storage
        $defaultStorage = storage_path('app/backups');
        if (!File::exists($defaultStorage)) {
            File::makeDirectory($defaultStorage, 0755, true, true);
        }
        $shortcuts[] = ['name' => 'Default App Storage', 'path' => $defaultStorage, 'type' => 'app'];

        if ($requestedPath !== null && trim((string) $requestedPath) !== '') {
            try {
                $this->backupService->assertSafeBackupDirectory((string) $requestedPath);
            } catch (\InvalidArgumentException $e) {
                return response()->json([
                    'message' => $e->getMessage(),
                ], 422);
            }
        }

        // Determine target path
        $currentPath = $requestedPath ? realpath($requestedPath) : null;
        if (!$currentPath || !is_dir($currentPath)) {
            $schedule = BackupSchedule::getSchedule();
            if ($schedule->custom_backup_path && is_dir($schedule->custom_backup_path)) {
                $currentPath = realpath($schedule->custom_backup_path);
            } elseif ($home && is_dir($home)) {
                $currentPath = $home;
            } else {
                $currentPath = $defaultStorage;
            }
        }

        // List directories
        $directories = [];
        try {
            $items = @scandir($currentPath);
            if ($items !== false) {
                foreach ($items as $item) {
                    if ($item === '.' || $item === '..') continue;
                    if (str_starts_with($item, '.') && !str_starts_with($item, '.karobar')) continue;

                    $fullPath = rtrim($currentPath, DIRECTORY_SEPARATOR . '/\\') . DIRECTORY_SEPARATOR . $item;
                    if (@is_dir($fullPath)) {
                        $directories[] = [
                            'name' => $item,
                            'path' => $fullPath,
                            'is_writable' => @is_writable($fullPath),
                        ];
                    }
                }
            }
            usort($directories, fn($a, $b) => strcasecmp($a['name'], $b['name']));
        } catch (\Exception $e) {
            // Suppress error
        }

        $parentPath = dirname($currentPath);
        $hasParent = $parentPath && $parentPath !== $currentPath && is_dir($parentPath);
        $isWritable = @is_writable($currentPath);
        $freeBytes = @disk_free_space($currentPath);

        return response()->json([
            'current_path' => $currentPath,
            'parent_path' => $hasParent ? $parentPath : null,
            'is_writable' => $isWritable,
            'free_space' => $freeBytes !== false ? $this->formatBytes((int)$freeBytes) : null,
            'shortcuts' => $shortcuts,
            'directories' => $directories,
        ]);
    }

    /**
     * Create a new folder on the host/server filesystem
     * POST /api/backups/create-directory
     */
    public function createDirectory(Request $request)
    {
        $this->authorize('create', BackupLog::class);

        $validated = $request->validate([
            'parent_path' => ['required', 'string'],
            'folder_name' => ['required', 'string', 'max:100', 'regex:/^[a-zA-Z0-9_\-\s]+$/'],
        ]);

        try {
            $this->backupService->assertSafeBackupDirectory($validated['parent_path']);
        } catch (\InvalidArgumentException $e) {
            return response()->json([
                'message' => $e->getMessage(),
            ], 422);
        }

        $parent = realpath($validated['parent_path']);
        if (!$parent || !is_dir($parent)) {
            return response()->json([
                'message' => 'Parent directory does not exist.',
            ], 422);
        }

        if (!is_writable($parent)) {
            return response()->json([
                'message' => 'Permission denied: Cannot create folder in this directory.',
            ], 422);
        }

        $newFolder = rtrim($parent, DIRECTORY_SEPARATOR . '/\\') . DIRECTORY_SEPARATOR . trim($validated['folder_name']);
        try {
            $this->backupService->assertSafeBackupDirectory($newFolder);
        } catch (\InvalidArgumentException $e) {
            return response()->json([
                'message' => $e->getMessage(),
            ], 422);
        }
        if (File::exists($newFolder)) {
            return response()->json([
                'message' => 'Folder already exists.',
                'path' => $newFolder,
            ], 200);
        }

        File::makeDirectory($newFolder, 0755, true, true);

        return response()->json([
            'message' => 'Folder created successfully.',
            'path' => $newFolder,
        ], 201);
    }

    /**
     * Trigger manual execution of scheduled backup job immediately
     * POST /api/backups/run-now
     */
    public function runScheduledNow()
    {
        $this->authorize('create', BackupLog::class);

        try {
            $exitCode = Artisan::call('backup:run-scheduled', ['--force' => true]);

            if ($exitCode === 0) {
                return response()->json([
                    'message' => 'Scheduled backup job executed successfully.',
                    'schedule' => BackupSchedule::getSchedule(),
                ]);
            }

            return response()->json([
                'message' => 'Scheduled backup execution completed with warnings.',
                'output' => Artisan::output(),
            ], 500);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Scheduled backup execution failed',
                'error' => $e->getMessage(),
            ], 500);
        }
    }
}

