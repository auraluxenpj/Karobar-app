<?php

namespace Tests\Feature;

use App\Models\BackupLog;
use App\Models\BackupSchedule;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class AutomatedBackupAndOffsiteStorageTest extends TestCase
{
    use RefreshDatabase;

    protected User $adminUser;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware(\App\Http\Middleware\EnsureLicensed::class);

        // Seed roles & permissions with sanctum guard
        $role = Role::firstOrCreate(['name' => 'Admin', 'guard_name' => 'sanctum']);
        $perms = ['backup.view', 'backup.create', 'backup.restore', 'backup.delete', 'backup.upload'];
        foreach ($perms as $p) {
            $perm = Permission::firstOrCreate(['name' => $p, 'guard_name' => 'sanctum']);
            $role->givePermissionTo($perm);
        }

        $this->adminUser = User::forceCreate([
            'name' => 'Admin User',
            'email' => 'admin@karobar.test',
            'password' => bcrypt('password123'),
        ]);
        $this->adminUser->assignRole($role);
    }

    public function test_can_fetch_backup_schedule_and_stats(): void
    {
        $response = $this->actingAs($this->adminUser)
            ->getJson('/api/backups/schedule');

        $response->assertStatus(200)
            ->assertJsonStructure([
                'schedule' => [
                    'id',
                    'is_automated',
                    'frequency',
                    'time_of_day',
                    'custom_backup_path',
                    'storage_destination',
                ],
            ]);
    }

    public function test_can_update_backup_schedule_settings(): void
    {
        $testPath = sys_get_temp_dir() . '/karobar_test_backups_' . time();

        $payload = [
            'is_automated' => true,
            'frequency' => 'weekly',
            'time_of_day' => '03:30',
            'day_of_week' => 1,
            'day_of_month' => 1,
            'backup_type' => 'database',
            'retention_days' => 45,
            'max_backups_keep' => 15,
            'storage_destination' => 'custom_folder',
            'custom_backup_path' => $testPath,
            'notify_on_failure' => true,
            'notification_email' => 'alerts@karobar.test',
        ];

        $response = $this->actingAs($this->adminUser)
            ->postJson('/api/backups/schedule', $payload);

        $response->assertStatus(200)
            ->assertJson([
                'message' => 'Backup schedule and storage settings updated successfully',
            ]);

        $this->assertDatabaseHas('backup_schedules', [
            'is_automated' => true,
            'frequency' => 'weekly',
            'time_of_day' => '03:30',
            'storage_destination' => 'custom_folder',
            'custom_backup_path' => $testPath,
            'retention_days' => 45,
            'max_backups_keep' => 15,
        ]);
    }

    public function test_can_test_local_storage_destination(): void
    {
        $response = $this->actingAs($this->adminUser)
            ->postJson('/api/backups/test-destination', [
                'destination' => 'local',
            ]);

        $response->assertStatus(200)
            ->assertJson([
                'success' => true,
                'writable' => true,
            ]);
    }

    public function test_can_test_custom_folder_storage_destination(): void
    {
        $tempDir = sys_get_temp_dir() . '/karobar_folder_test_' . uniqid();

        $response = $this->actingAs($this->adminUser)
            ->postJson('/api/backups/test-destination', [
                'destination' => 'custom_folder',
                'custom_backup_path' => $tempDir,
            ]);

        $response->assertStatus(200)
            ->assertJson([
                'success' => true,
                'path' => $tempDir,
                'writable' => true,
            ]);

        // Clean up
        if (File::exists($tempDir)) {
            File::deleteDirectory($tempDir);
        }
    }

    public function test_can_browse_directories(): void
    {
        $response = $this->actingAs($this->adminUser)
            ->getJson('/api/backups/browse-directories');

        $response->assertStatus(200)
            ->assertJsonStructure([
                'current_path',
                'shortcuts',
                'directories',
            ]);
    }

    public function test_can_create_directory(): void
    {
        $tempParent = sys_get_temp_dir() . '/karobar_parent_' . uniqid();
        File::makeDirectory($tempParent, 0755, true, true);

        $response = $this->actingAs($this->adminUser)
            ->postJson('/api/backups/create-directory', [
                'parent_path' => $tempParent,
                'folder_name' => 'MyKarobarBackups',
            ]);

        $response->assertStatus(201)
            ->assertJson([
                'message' => 'Folder created successfully.',
            ]);

        $this->assertDirectoryExists($tempParent . DIRECTORY_SEPARATOR . 'MyKarobarBackups');

        File::deleteDirectory($tempParent);
    }

    public function test_scheduled_artisan_command_respects_disabled_state_unless_forced(): void
    {
        $schedule = BackupSchedule::getSchedule();
        $schedule->update(['is_automated' => false]);

        $exitCode = Artisan::call('backup:run-scheduled');
        $this->assertEquals(0, $exitCode);

        // Forced execution should run
        $forceExit = Artisan::call('backup:run-scheduled', ['--force' => true]);
        $this->assertEquals(0, $forceExit);

        $this->assertDatabaseHas('backup_logs', [
            'is_automated' => true,
            'status' => 'completed',
        ]);
    }

    public function test_backup_is_copied_to_custom_folder_when_configured(): void
    {
        $customDir = sys_get_temp_dir() . '/karobar_custom_archive_test_' . uniqid();
        File::makeDirectory($customDir, 0755, true, true);

        $schedule = BackupSchedule::getSchedule();
        $schedule->update([
            'is_automated' => true,
            'storage_destination' => 'custom_folder',
            'custom_backup_path' => $customDir,
        ]);

        $exitCode = Artisan::call('backup:run-scheduled', ['--force' => true]);
        $this->assertEquals(0, $exitCode);

        $backup = BackupLog::where('is_automated', true)
            ->where('status', 'completed')
            ->orderByDesc('id')
            ->first();

        $this->assertNotNull($backup);
        $this->assertEquals('custom_folder', $backup->storage_destination);
        $this->assertEquals('success', $backup->remote_status);
        $this->assertNotNull($backup->remote_path);
        $this->assertFileExists($backup->remote_path);

        // Verify the file is in our customDir
        $this->assertStringStartsWith($customDir, $backup->remote_path);

        // Clean up
        if (File::exists($customDir)) {
            File::deleteDirectory($customDir);
        }
    }

    public function test_backup_restore_actually_reverts_database_changes(): void
    {
        // 1. Create a database backup
        $response = $this->actingAs($this->adminUser)
            ->postJson('/api/backups', [
                'type' => 'database',
            ]);

        $response->assertStatus(201);
        $backupId = $response->json('backup.id');

        $initialCustomerCount = \App\Models\Customer::count();

        // 2. Perform an action that mutates the database (create a new customer)
        \App\Models\Customer::forceCreate([
            'name' => 'Newly Added Customer After Backup',
            'phone' => '03009999999',
            'address' => 'Test Address',
        ]);

        $this->assertEquals($initialCustomerCount + 1, \App\Models\Customer::count());

        // 3. Restore from the backup taken before the new customer was created
        $restoreResponse = $this->actingAs($this->adminUser)
            ->postJson("/api/backups/{$backupId}/restore", [
                'password' => 'password123',
            ]);

        $restoreResponse->assertStatus(200);

        // 4. Verify that the newly added customer was reverted and database is back to initial count
        $this->assertEquals($initialCustomerCount, \App\Models\Customer::count());
        $this->assertDatabaseMissing('customers', [
            'name' => 'Newly Added Customer After Backup',
        ]);
    }

    public function test_full_backup_and_restore_with_single_quotes_and_semicolons(): void
    {
        \App\Models\Customer::forceCreate([
            'name' => "Owner's Special Pharmacy; Branch #1",
            'phone' => '03001112233',
            'address' => "123 St; Apt 'B'",
        ]);

        $response = $this->actingAs($this->adminUser)
            ->postJson('/api/backups', [
                'type' => 'full',
            ]);

        $response->assertStatus(201)
            ->assertJsonPath('backup.status', 'completed')
            ->assertJsonPath('backup.type', 'full');

        $backupId = $response->json('backup.id');

        // Mutate customer after backup
        \App\Models\Customer::where('phone', '03001112233')->delete();
        $this->assertDatabaseMissing('customers', ['phone' => '03001112233']);

        // Restore full backup
        $restoreResponse = $this->actingAs($this->adminUser)
            ->postJson("/api/backups/{$backupId}/restore", [
                'password' => 'password123',
            ]);

        $restoreResponse->assertStatus(200);

        $this->assertDatabaseHas('customers', [
            'name' => "Owner's Special Pharmacy; Branch #1",
            'phone' => '03001112233',
        ]);
    }

    public function test_pure_php_zip_fallback_writes_and_reads_valid_archive_without_ext_zip(): void
    {
        $service = app(\App\Services\BackupService::class);
        $tempZip = sys_get_temp_dir() . '/karobar_pure_zip_test_' . uniqid() . '.zip';

        $expectedEntries = [
            'manifest.json' => json_encode(['type' => 'full', 'version' => '1.0']),
            'settings.json' => json_encode(['data' => ['company_name' => 'Karobar Herd Store']]),
            'database/database.sql.gz' => gzencode("-- SQL dump content\nSELECT 1;", 6),
        ];

        $service->writePurePhpZipArchive($tempZip, $expectedEntries);
        $this->assertFileExists($tempZip);
        $this->assertGreaterThan(0, filesize($tempZip));

        $readBack = $service->readPurePhpZipArchiveEntries($tempZip, false);
        $this->assertEquals($expectedEntries['manifest.json'], $readBack['manifest.json']);
        $this->assertEquals($expectedEntries['settings.json'], $readBack['settings.json']);
        $this->assertEquals($expectedEntries['database/database.sql.gz'], $readBack['database/database.sql.gz']);

        @unlink($tempZip);
    }

    public function test_self_healing_schema_and_unreachable_foreign_host_path_fallback(): void
    {
        // Simulate a Herd deployment where backup_schedules was not migrated yet or has a foreign machine path
        \Illuminate\Support\Facades\Schema::dropIfExists('backup_schedules');

        $response = $this->actingAs($this->adminUser)
            ->postJson('/api/backups', [
                'type' => 'full',
                'custom_backup_path' => '/Users/nonexistent_foreign_machine_user_99999/Downloads',
            ]);

        $response->assertStatus(201)
            ->assertJsonPath('backup.status', 'completed')
            ->assertJsonPath('backup.storage_destination', 'local');
    }

    public function test_file_backed_sqlite_wal_mmap_restore_with_concurrent_worker_does_not_corrupt_database(): void
    {
        $tempDbFile = sys_get_temp_dir() . '/karobar_wal_restore_test_' . uniqid() . '.sqlite';
        copy(database_path('database.sqlite'), $tempDbFile);

        $originalDbConfig = config('database.connections.sqlite.database');
        $concurrentWorkerPdo = null;
        $createdBackupFilename = null;

        try {
            while (DB::connection('sqlite')->transactionLevel() > 0) {
                DB::connection('sqlite')->rollBack();
            }
            // Switch Laravel's sqlite connection to the file-backed SQLite database in WAL + mmap mode
            config(['database.connections.sqlite.database' => $tempDbFile]);
            DB::purge('sqlite');
            DB::reconnect('sqlite');
            DB::connection('sqlite')->statement('PRAGMA journal_mode = WAL;');
            DB::connection('sqlite')->statement('PRAGMA synchronous = NORMAL;');
            DB::connection('sqlite')->statement('PRAGMA mmap_size = 268435456;');

            // Ensure adminUser with restore/create/view permissions exists in this file-backed DB
            app(\Spatie\Permission\PermissionRegistrar::class)->forgetCachedPermissions();
            $role = Role::firstOrCreate(['name' => 'Admin', 'guard_name' => 'sanctum']);
            foreach (['backup.view', 'backup.create', 'backup.restore', 'backup.delete', 'backup.upload'] as $p) {
                $perm = Permission::firstOrCreate(['name' => $p, 'guard_name' => 'sanctum']);
                $role->givePermissionTo($perm);
            }
            $fileAdmin = User::firstOrCreate(
                ['email' => 'wal_admin@karobar.test'],
                ['name' => 'WAL Admin', 'password' => bcrypt('password123')]
            );
            $fileAdmin->assignRole($role);

            \App\Models\Customer::forceCreate([
                'name' => 'Pre-Backup WAL Customer',
                'phone' => '03005556677',
                'address' => 'WAL Mode Street',
            ]);

            // 1. Create a full backup from the file-backed WAL database
            $createRes = $this->actingAs($fileAdmin)
                ->postJson('/api/backups', ['type' => 'full']);
            $createRes->assertStatus(201);
            $backupId = $createRes->json('backup.id');
            $createdBackupFilename = $createRes->json('backup.filename');

            // 2. Open a second concurrent PDO connection in WAL + mmap mode (simulating PHP worker #2 / schedule:work)
            $concurrentWorkerPdo = new \PDO('sqlite:' . $tempDbFile);
            $concurrentWorkerPdo->setAttribute(\PDO::ATTR_ERRMODE, \PDO::ERRMODE_EXCEPTION);
            $concurrentWorkerPdo->exec('PRAGMA journal_mode = WAL;');
            $concurrentWorkerPdo->exec('PRAGMA mmap_size = 268435456;');
            $concurrentWorkerPdo->exec("INSERT INTO customers (name, phone, address, created_at, updated_at) VALUES ('Post-Backup Concurrent Worker Customer', '03008889999', 'Worker Addr', datetime('now'), datetime('now'))");

            $this->assertDatabaseHas('customers', ['phone' => '03008889999']);

            // 3. Restore the full backup while the concurrent worker connection is still open and memory-mapped
            $restoreRes = $this->actingAs($fileAdmin)
                ->postJson("/api/backups/{$backupId}/restore", [
                    'password' => 'password123',
                ]);
            $restoreRes->assertStatus(200);

            // 4. Verify database integrity on both Laravel's connection and the concurrent worker connection
            $laravelIntegrity = DB::connection('sqlite')->selectOne('PRAGMA integrity_check;');
            $this->assertEquals('ok', $laravelIntegrity->integrity_check ?? null);

            $workerIntegrity = $concurrentWorkerPdo->query('PRAGMA integrity_check;')->fetchColumn();
            $this->assertEquals('ok', $workerIntegrity);

            // 5. Verify post-backup mutation was reverted and pre-backup customer + backup_logs remain intact
            $this->assertDatabaseHas('customers', ['phone' => '03005556677']);
            $this->assertDatabaseMissing('customers', ['phone' => '03008889999']);

            // 6. Verify subsequent API calls succeed without 500 Server Error
            $listRes = $this->actingAs($fileAdmin)->getJson('/api/backups');
            $listRes->assertStatus(200);
        } finally {
            $concurrentWorkerPdo = null;
            config(['database.connections.sqlite.database' => $originalDbConfig]);
            DB::purge('sqlite');
            DB::reconnect('sqlite');
            \Illuminate\Foundation\Testing\RefreshDatabaseState::$migrated = false;

            if ($createdBackupFilename) {
                @unlink(storage_path('app/backups/' . $createdBackupFilename . '.zip'));
            }

            foreach (glob($tempDbFile . '*') ?: [] as $f) {
                @unlink($f);
            }
        }
    }
}
