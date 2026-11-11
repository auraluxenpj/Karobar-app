<?php

namespace App\Http\Controllers;

use App\Models\Setting;
use App\Services\SqliteImportService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Throwable;

class SqliteImportController extends Controller
{
    protected SqliteImportService $importService;

    /**
     * Special Software Admin Master Password required to unlock the SQLite Import Studio.
     */
    private const SOFTWARE_ADMIN_PASSWORD = 'Malik9196.';

    public function __construct(SqliteImportService $importService)
    {
        $this->importService = $importService;
    }

    /**
     * Ensure the current authenticated user is at least an Application Admin (Store Admin).
     * Non-admin users (Cashiers, Salesmen, Managers without Admin role) are strictly denied.
     */
    protected function authorizeApplicationAdmin(Request $request): void
    {
        $user = $request->user();
        if (!$user) {
            abort(401);
        }

        $isAdmin = false;
        try {
            if (
                method_exists($user, 'hasRole') &&
                ($user->hasRole('Admin') || $user->hasRole('Super Admin') || $user->hasRole('admin') || $user->hasRole('super-admin'))
            ) {
                $isAdmin = true;
            }
        } catch (Throwable) {
        }

        if (!$isAdmin) {
            abort(403, 'Access denied. Only an Application Administrator can view the SQLite Import lock gate.');
        }
    }

    /**
     * Constant-time check against the Software Admin master password ("Malik9196.").
     */
    protected function isValidSoftwareAdminPassword(string $input): bool
    {
        if ($input === '') {
            return false;
        }
        $expectedHash = hash('sha256', self::SOFTWARE_ADMIN_PASSWORD);
        return hash_equals($expectedHash, hash('sha256', $input))
            || hash_equals($expectedHash, hash('sha256', trim($input)));
    }

    /**
     * Generate a stateless HMAC-signed unlock token bound to the current user ID and date.
     */
    public function generateSoftwareAdminToken(int $userId, ?string $dateStr = null): string
    {
        $date = $dateStr ?: now()->format('Y-m-d');
        $secret = (string) (config('app.key') ?: 'karobar-sw-admin-secret');
        $sig = hash_hmac('sha256', "sqlite_import_sw_admin|{$userId}|{$date}", $secret);
        return base64_encode("{$userId}|{$date}|{$sig}");
    }

    /**
     * Verify a stateless HMAC-signed Software Admin unlock token (accepts today or yesterday across midnight).
     */
    protected function verifySoftwareAdminToken(?string $token, int $userId): bool
    {
        if (!$token) {
            return false;
        }

        $todayToken = $this->generateSoftwareAdminToken($userId, now()->format('Y-m-d'));
        $yesterdayToken = $this->generateSoftwareAdminToken($userId, now()->subDay()->format('Y-m-d'));

        return hash_equals($todayToken, $token) || hash_equals($yesterdayToken, $token);
    }

    /**
     * Verify that the user is an Application Admin AND has unlocked the Software Admin gate ("Malik9196.").
     */
    protected function authorizeSqliteImport(Request $request): void
    {
        $this->authorizeApplicationAdmin($request);

        $user = $request->user();
        $userId = (int) $user->id;

        $unlockToken = trim((string) (
            $request->header('X-Software-Admin-Token')
            ?: $request->input('software_admin_token')
            ?: ''
        ));

        if ($unlockToken !== '' && $this->verifySoftwareAdminToken($unlockToken, $userId)) {
            return;
        }

        $directPassword = (string) (
            $request->header('X-Software-Admin-Password')
            ?: $request->input('software_admin_password')
            ?: ''
        );

        if ($directPassword !== '' && $this->isValidSoftwareAdminPassword($directPassword)) {
            return;
        }

        abort(response()->json([
            'message'               => 'Software Admin authorization required. Please unlock with the Software Admin password.',
            'software_admin_locked' => true,
        ], 403));
    }

    /**
     * Unlock the SQLite Import Studio using the Software Admin special password ("Malik9196.").
     * POST /api/settings/sqlite-import/unlock
     */
    public function unlock(Request $request)
    {
        $this->authorizeApplicationAdmin($request);

        $password = (string) ($request->input('password') ?? $request->input('software_admin_password') ?? '');

        if (!$this->isValidSoftwareAdminPassword($password)) {
            return response()->json([
                'ok'      => false,
                'message' => 'Invalid Software Admin password. Access is restricted to Software Administrators.',
                'errors'  => [
                    'password' => ['Invalid Software Admin password.'],
                ],
            ], 422);
        }

        $user = $request->user();
        $unlockToken = $this->generateSoftwareAdminToken((int) $user->id);

        return response()->json([
            'ok'           => true,
            'unlock_token' => $unlockToken,
            'message'      => 'Software Admin access unlocked.',
        ], 200);
    }

    /**
     * Upload or stage a SQLite database file and inspect its schema, tables, columns, and sample rows.
     * POST /api/settings/sqlite-import/upload
     */
    public function uploadAndInspect(Request $request)
    {
        $this->authorizeSqliteImport($request);

        $uploadedFile = $request->file('file') ?: $request->file('database_file');
        $filePath = trim((string) ($request->input('file_path') ?: $request->input('local_file_path') ?: ''));

        if (!$uploadedFile && $filePath === '') {
            return response()->json([
                'message' => 'Please provide a SQLite database file or local file path.',
                'errors'  => [
                    'database_file' => ['Please select a valid SQLite database file to upload.'],
                ],
            ], 422);
        }

        try {
            if ($uploadedFile) {
                $staged = $this->importService->storeUploadedSqlite($uploadedFile);
            } else {
                $staged = $this->importService->stageSqliteFromFile($filePath);
            }

            $inspection = $this->importService->inspectAndProposeMapping($staged['token']);

            return response()->json($this->formatInspectionResponse($inspection), 200);
        } catch (Throwable $e) {
            return response()->json([
                'message' => $e->getMessage(),
                'error'   => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Dynamically preview a custom (source_table -> target_table) pairing and custom column mapping.
     * POST /api/settings/sqlite-import/preview-table
     */
    public function previewTable(Request $request)
    {
        $this->authorizeSqliteImport($request);

        $token = trim((string) ($request->input('token') ?: $request->input('session_token') ?: ''));
        $sourceTable = trim((string) $request->input('source_table', ''));
        $targetTable = trim((string) $request->input('target_table', ''));

        if ($token === '' || $sourceTable === '' || $targetTable === '') {
            return response()->json([
                'message' => 'Session token, source_table, and target_table are required.',
            ], 422);
        }

        $columnMap = $this->normalizeColumnMapInput(
            $request->input('column_map', []),
            $request->input('custom_columns', []),
            $request->input('custom_defaults', [])
        );

        try {
            $analysis = $this->importService->previewTableMapping(
                $token,
                $sourceTable,
                $targetTable,
                $columnMap
            );

            $formattedMappings = array_map(function (array $cm) {
                return array_merge($cm, [
                    'strategy'             => $cm['match_type'] ?? 'exact',
                    'fallback_description' => $cm['synthesis_note'] ?? '',
                ]);
            }, $analysis['column_mappings'] ?? []);

            return response()->json([
                'analysis'                => $analysis,
                'source_table'            => $analysis['source_table'],
                'target_table'            => $analysis['target_table'],
                'column_mappings'         => $formattedMappings,
                'unmapped_source_columns' => $analysis['unmapped_source_columns'] ?? [],
                'sample_rows'             => $analysis['preview_rows'] ?? [],
                'preview_rows'            => $analysis['preview_rows'] ?? [],
                'stats'                   => [
                    'matched_columns_count' => $analysis['matched_columns_count'] ?? 0,
                    'total_target_columns'  => $analysis['total_target_columns'] ?? 0,
                ],
            ]);
        } catch (Throwable $e) {
            return response()->json([
                'message' => $e->getMessage(),
                'error'   => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Execute the intelligent SQLite import.
     * POST /api/settings/sqlite-import/commit
     */
    public function commit(Request $request)
    {
        $this->authorizeSqliteImport($request);

        $token = trim((string) ($request->input('token') ?: $request->input('session_token') ?: ''));
        $password = (string) $request->input('password', '');
        $nestedOptions = is_array($request->input('options')) ? $request->input('options') : [];
        $mode = (string) ($nestedOptions['mode'] ?? $request->input('mode', 'merge'));

        if ($token === '') {
            return response()->json([
                'message' => 'Valid import session token is required.',
            ], 422);
        }

        if ($mode === 'replace' && strlen(trim($password)) < 4) {
            return response()->json([
                'message' => 'Please enter your current account password to confirm Replace mode import.',
                'errors'  => [
                    'password' => ['Please enter your current account password.'],
                ],
            ], 422);
        }

        $rawTables = $nestedOptions['tables'] ?? $request->input('tables', []);

        $normalizedTables = [];
        if (is_array($rawTables)) {
            foreach ($rawTables as $srcTbl => $cfg) {
                if (!is_array($cfg)) {
                    continue;
                }
                $colMap = $this->normalizeColumnMapInput(
                    $cfg['column_map'] ?? [],
                    $cfg['columns'] ?? [],
                    $cfg['defaults'] ?? []
                );
                $normalizedTables[$srcTbl] = [
                    'enabled'      => (bool) ($cfg['enabled'] ?? true),
                    'target_table' => $cfg['target_table'] ?? null,
                    'column_map'   => $colMap,
                ];
            }
        }

        $options = [
            'password'          => $password,
            'mode'              => $mode,
            'conflict_policy'   => $nestedOptions['conflict_policy'] ?? $request->input('conflict_policy', 'upsert'),
            'create_backup'     => (bool) ($nestedOptions['create_backup'] ?? $request->input('create_backup', true)),
            'reconcile_batches' => (bool) ($nestedOptions['reconcile_batches'] ?? $request->input('reconcile_batches', true)),
            'tables'            => $normalizedTables,
        ];

        try {
            $userId = $request->user()?->id ? (int) $request->user()->id : (Auth::id() !== null ? (int) Auth::id() : null);
            $result = $this->importService->executeImport($token, $options, $userId);

            // Build keyed table stats for the UI audit table
            $tablesBySource = [];
            foreach ($result['tables'] ?? [] as $tReport) {
                $tablesBySource[$tReport['source_table']] = [
                    'target_table' => $tReport['target_table'],
                    'source_rows'  => ($tReport['inserted'] ?? 0) + ($tReport['updated'] ?? 0) + ($tReport['skipped'] ?? 0),
                    'inserted'     => $tReport['inserted'] ?? 0,
                    'updated'      => $tReport['updated'] ?? 0,
                    'skipped'      => $tReport['skipped'] ?? 0,
                    'warnings'     => $tReport['warnings'] ?? [],
                ];
            }

            $result['stats'] = [
                'total_inserted' => $result['totals']['inserted'] ?? 0,
                'total_updated'  => $result['totals']['updated'] ?? 0,
                'total_skipped'  => $result['totals']['skipped'] ?? 0,
                'safety_backup'  => $result['safety_backup']['filename'] ?? null,
                'reconciliation' => $result['reconciliation'] ?? [],
                'tables'         => $tablesBySource,
            ];

            return response()->json($result, 200);
        } catch (Throwable $e) {
            return response()->json([
                'message' => $e->getMessage(),
                'error'   => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Clean up a staged SQLite import session.
     * DELETE /api/settings/sqlite-import/{token}
     */
    public function cancel(Request $request, string $token)
    {
        $this->authorizeSqliteImport($request);

        $this->importService->cleanupStagedSession($token);

        return response()->json([
            'message' => 'Import session cancelled and temporary files removed.',
        ]);
    }

    /**
     * Normalize column mapping overrides whether provided as `column_map` or `custom_columns` + `custom_defaults`.
     */
    protected function normalizeColumnMapInput(array $columnMap, array $customColumns, array $customDefaults): array
    {
        $normalized = $columnMap;

        foreach ($customColumns as $targetCol => $sourceCol) {
            $src = is_string($sourceCol) ? trim($sourceCol) : '';
            $def = $customDefaults[$targetCol] ?? null;
            $normalized[$targetCol] = [
                'source_column' => $src !== '' ? $src : '__skip__',
                'default_value' => $def,
            ];
        }

        foreach ($customDefaults as $targetCol => $defVal) {
            if (!isset($normalized[$targetCol])) {
                $normalized[$targetCol] = [
                    'source_column' => null,
                    'default_value' => $defVal,
                ];
            }
        }

        return $normalized;
    }

    /**
     * Enrich the inspection payload so both the UI component and API consumers have rich normalized fields.
     */
    protected function formatInspectionResponse(array $inspection): array
    {
        $importableTables = [];
        foreach ($inspection['tables'] ?? [] as $tbl) {
            $analysis = $tbl['analysis'] ?? [];
            $colMappings = array_map(function (array $cm) {
                return array_merge($cm, [
                    'strategy'             => $cm['match_type'] ?? 'exact',
                    'fallback_description' => $cm['synthesis_note'] ?? '',
                ]);
            }, $analysis['column_mappings'] ?? []);

            $srcColNames = array_map(
                fn ($c) => is_array($c) ? (string) ($c['name'] ?? '') : (string) $c,
                $tbl['source_columns'] ?? []
            );

            $importableTables[] = array_merge($tbl, [
                'match_type'              => $tbl['match_method'] ?? 'unmapped',
                'confidence'              => ($tbl['match_method'] ?? '') === 'exact' ? 100 : (($tbl['match_method'] ?? '') === 'alias' ? 95 : 80),
                'stage'                   => $tbl['dependency_stage'] ?? 6,
                'source_columns'          => $srcColNames,
                'source_columns_meta'     => $tbl['source_columns'] ?? [],
                'column_mappings'         => $colMappings,
                'unmapped_source_columns' => $analysis['unmapped_source_columns'] ?? [],
                'sample_rows'             => !empty($analysis['preview_rows']) ? $analysis['preview_rows'] : ($tbl['sample_rows'] ?? []),
            ]);
        }

        $userPreview = array_map(function (array $u) {
            return array_merge($u, [
                'old_user_id'       => $u['source_id'] ?? 0,
                'old_name'          => $u['source_name'] ?? '',
                'old_email'         => $u['source_email'] ?? '',
                'mapped_to_user_id' => $u['target_id'] ?? 1,
                'strategy'          => $u['match_type'] ?? 'fallback_admin',
            ]);
        }, $inspection['user_remap_preview'] ?? []);

        $summary = array_merge($inspection['summary'] ?? [], [
            'matched_tables_count' => $inspection['summary']['auto_matched_count'] ?? 0,
            'total_rows_to_import' => $inspection['summary']['total_importable_rows'] ?? 0,
        ]);

        return array_merge($inspection, [
            'message'                 => 'SQLite database analyzed successfully.',
            'session_token'           => $inspection['session']['token'] ?? '',
            'file_name'               => $inspection['session']['original_name'] ?? 'database.sqlite',
            'summary'                 => $summary,
            'importable_tables'       => $importableTables,
            'available_target_tables' => $inspection['target_catalog'] ?? [],
            'user_remapping'          => [
                'source_users_count' => count($userPreview),
                'preview'            => $userPreview,
            ],
        ]);
    }
}
