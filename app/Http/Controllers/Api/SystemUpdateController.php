<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

class SystemUpdateController extends Controller
{
    /**
     * Return local Karobar-App version and build metadata.
     */
    public function version(): JsonResponse
    {
        return response()->json([
            'ok' => true,
            ...$this->readLocalVersion(),
        ]);
    }

    /**
     * Check GitHub Releases (shzdasim/Karobar-App) for a newer build.
     */
    public function checkUpdate(Request $request): JsonResponse
    {
        $local = $this->readLocalVersion();
        $repo = $local['repository'] ?: 'shzdasim/Karobar-App';
        $force = $request->boolean('force');

        $cacheKey = 'karobar_latest_release_check_' . md5($repo . '_' . $local['version'] . '_' . $local['build_number']);
        if ($force) {
            Cache::forget($cacheKey);
        }

        $remote = Cache::remember($cacheKey, now()->addMinutes(5), function () use ($repo) {
            return $this->fetchRemoteReleaseMetadata($repo);
        });

        if (!$remote) {
            return response()->json([
                'ok'               => false,
                'offline_or_error' => true,
                'update_available' => false,
                'current_version'  => $local['version'],
                'current_build'    => $local['build_number'],
                'app_name'         => $local['app_name'],
                'message'          => 'Unable to reach GitHub Releases right now.',
            ]);
        }

        $isNewer = $this->isRemoteReleaseNewer($local, $remote);

        return response()->json([
            'ok'               => true,
            'update_available' => $isNewer,
            'app_name'         => 'Karobar-App',
            'current_version'  => $local['version'],
            'current_build'    => (int) $local['build_number'],
            'current_commit'   => $local['commit_sha'],
            'latest_version'   => $remote['version'],
            'latest_build'     => (int) $remote['build_number'],
            'latest_commit'    => $remote['commit_sha'],
            'release_name'     => $remote['release_name'],
            'released_at'      => $remote['released_at'],
            'notes'            => $remote['notes'],
            'download_url'     => $remote['download_url'],
            'bundle_url'       => $remote['bundle_url'],
            'release_url'      => $remote['release_url'],
            'zero_data_loss'   => true,
        ]);
    }

    /**
     * @return array{app_name: string, version: string, build_number: int, commit_sha: string, repository: string, released_at: string}
     */
    public function readLocalVersion(): array
    {
        $defaults = [
            'app_name'     => 'Karobar-App',
            'version'      => '2.0.1',
            'build_number' => 1,
            'commit_sha'   => 'local',
            'repository'   => 'shzdasim/Karobar-App',
            'released_at'  => '2026-04-17T00:00:00Z',
        ];

        $versionPath = public_path('version.json');
        if (!is_file($versionPath)) {
            return $defaults;
        }

        $decoded = json_decode((string) @file_get_contents($versionPath), true);
        if (!is_array($decoded)) {
            return $defaults;
        }

        return [
            'app_name'     => (string) ($decoded['app_name'] ?? $defaults['app_name']),
            'version'      => ltrim((string) ($decoded['version'] ?? $defaults['version']), 'vV'),
            'build_number' => (int) ($decoded['build_number'] ?? $defaults['build_number']),
            'commit_sha'   => (string) ($decoded['commit_sha'] ?? $defaults['commit_sha']),
            'repository'   => (string) ($decoded['repository'] ?? $defaults['repository']),
            'released_at'  => (string) ($decoded['released_at'] ?? $defaults['released_at']),
        ];
    }

    protected function githubGet(string $url, array $headers = []): ?\Illuminate\Http\Client\Response
    {
        $defaultHeaders = array_merge([
            'User-Agent' => 'Karobar-App-Updater/2.0',
        ], $headers);

        // 1. Try with standard TLS verification first
        try {
            $resp = Http::timeout(6)
                ->withHeaders($defaultHeaders)
                ->get($url);
            if ($resp->successful()) {
                return $resp;
            }
        } catch (\Throwable) {
            // Portable PHP on Windows may lack curl.cainfo (cURL error 60); retry without local CA file requirement
        }

        // 2. Fallback for Windows portable PHP runtime where curl.cainfo is not pre-populated
        try {
            $resp = Http::timeout(6)
                ->withoutVerifying()
                ->withHeaders($defaultHeaders)
                ->get($url);
            if ($resp->successful()) {
                return $resp;
            }
        } catch (\Throwable) {
            return null;
        }

        return null;
    }

    protected function fetchRemoteReleaseMetadata(string $repo): ?array
    {
        // 1. Try fast manifest asset: latest-release.json from the latest GitHub Release
        try {
            $manifestUrl = "https://github.com/{$repo}/releases/latest/download/latest-release.json";
            $resp = $this->githubGet($manifestUrl, [
                'Accept' => 'application/json',
            ]);

            if ($resp && $resp->successful()) {
                $data = $resp->json();
                if (is_array($data) && !empty($data['version'])) {
                    return [
                        'version'      => ltrim((string) $data['version'], 'vV'),
                        'build_number' => (int) ($data['build_number'] ?? 0),
                        'commit_sha'   => (string) ($data['commit_sha'] ?? ''),
                        'release_name' => (string) ($data['release_name'] ?? ('Karobar-App v' . ltrim((string) $data['version'], 'vV'))),
                        'released_at'  => (string) ($data['released_at'] ?? ''),
                        'notes'        => (string) ($data['notes'] ?? 'Performance improvements, bug fixes, and new features.'),
                        'download_url' => (string) ($data['download_url'] ?? "https://github.com/{$repo}/releases/latest/download/Karobar-App-Setup.exe"),
                        'bundle_url'   => (string) ($data['bundle_url'] ?? "https://github.com/{$repo}/releases/latest/download/Karobar-App-Setup-Bundle.zip"),
                        'release_url'  => (string) ($data['release_url'] ?? "https://github.com/{$repo}/releases/latest"),
                    ];
                }
            }
        } catch (\Throwable) {
            // Fall through to GitHub REST API
        }

        // 2. Fallback to GitHub Releases REST API
        try {
            $apiUrl = "https://api.github.com/repos/{$repo}/releases/latest";
            $resp = $this->githubGet($apiUrl, [
                'Accept' => 'application/vnd.github+json',
            ]);

            if (!$resp || !$resp->successful()) {
                return null;
            }

            $release = $resp->json();
            if (!is_array($release) || empty($release['tag_name'])) {
                return null;
            }

            $tagName = (string) $release['tag_name'];
            $cleanVersion = ltrim($tagName, 'vV');
            $buildNumber = 0;
            if (preg_match('/^2\.0\.(\d+)$/', $cleanVersion, $m)) {
                $buildNumber = (int) $m[1];
            } elseif (preg_match('/-(\d+)$/', $tagName, $m)) {
                $buildNumber = (int) $m[1];
            }

            $downloadUrl = "https://github.com/{$repo}/releases/latest/download/Karobar-App-Setup.exe";
            $bundleUrl = "https://github.com/{$repo}/releases/latest/download/Karobar-App-Setup-Bundle.zip";

            foreach (($release['assets'] ?? []) as $asset) {
                $assetName = (string) ($asset['name'] ?? '');
                $browserUrl = (string) ($asset['browser_download_url'] ?? '');
                if ($browserUrl !== '' && in_array($assetName, ['Karobar-App-Setup.exe', 'Karobar-App-ERP-Setup.exe'], true)) {
                    $downloadUrl = $browserUrl;
                }
                if ($browserUrl !== '' && in_array($assetName, ['Karobar-App-Setup-Bundle.zip', 'Karobar-App-ERP-Setup-Bundle.zip'], true)) {
                    $bundleUrl = $browserUrl;
                }
            }

            return [
                'version'      => $cleanVersion,
                'build_number' => $buildNumber,
                'commit_sha'   => substr((string) ($release['target_commitish'] ?? ''), 0, 7),
                'release_name' => (string) ($release['name'] ?? "Karobar-App v{$cleanVersion}"),
                'released_at'  => (string) ($release['published_at'] ?? ''),
                'notes'        => trim((string) ($release['body'] ?? 'New Karobar-App release available.')),
                'download_url' => $downloadUrl,
                'bundle_url'   => $bundleUrl,
                'release_url'  => (string) ($release['html_url'] ?? "https://github.com/{$repo}/releases/latest"),
            ];
        } catch (\Throwable) {
            return null;
        }
    }

    protected function isRemoteReleaseNewer(array $local, array $remote): bool
    {
        $localBuild = (int) ($local['build_number'] ?? 0);
        $remoteBuild = (int) ($remote['build_number'] ?? 0);

        if ($remoteBuild > 0 && $localBuild > 0 && $remoteBuild !== $localBuild) {
            return $remoteBuild > $localBuild;
        }

        $localVer = ltrim((string) ($local['version'] ?? '0.0.0'), 'vV');
        $remoteVer = ltrim((string) ($remote['version'] ?? '0.0.0'), 'vV');

        if (version_compare($remoteVer, $localVer, '>')) {
            return true;
        }

        return false;
    }

    protected function progressFilePath(): string
    {
        return storage_path('app/update-progress.json');
    }

    protected function writeUpdateProgress(array $state): void
    {
        try {
            @file_put_contents(
                $this->progressFilePath(),
                json_encode(array_merge(['ok' => true, 'updated_at' => time()], $state), JSON_UNESCAPED_SLASHES)
            );
        } catch (\Throwable) {
            // ignore
        }
    }

    /**
     * Return live download & installation progress for in-app update.
     */
    public function updateProgress(): JsonResponse
    {
        $path = $this->progressFilePath();
        if (!is_file($path)) {
            return response()->json([
                'ok'           => true,
                'status'       => 'idle',
                'percent'      => 0,
                'downloadedMB' => null,
                'totalMB'      => null,
                'message'      => '',
            ]);
        }

        $data = json_decode((string) @file_get_contents($path), true);
        if (!is_array($data)) {
            return response()->json([
                'ok'      => true,
                'status'  => 'idle',
                'percent' => 0,
                'message' => '',
            ]);
        }

        return response()->json($data);
    }

    /**
     * Download Karobar-App-Setup.exe inside the application and launch the elevated silent updater.
     */
    public function installUpdate(Request $request): JsonResponse
    {
        @set_time_limit(0);
        @ignore_user_abort(true);

        $downloadUrl = (string) ($request->input('download_url')
            ?: 'https://github.com/shzdasim/Karobar-App/releases/latest/download/Karobar-App-Setup.exe');
        $versionLabel = preg_replace('/[^a-zA-Z0-9._-]/', '', (string) ($request->input('version') ?: 'latest'));

        $tempDir = sys_get_temp_dir();
        $installerPath = $tempDir . DIRECTORY_SEPARATOR . "Karobar-App-Setup-{$versionLabel}.exe";
        if (is_file($installerPath) && !@unlink($installerPath)) {
            $installerPath = $tempDir . DIRECTORY_SEPARATOR . "Karobar-App-Setup-{$versionLabel}-" . time() . ".exe";
        }

        $this->writeUpdateProgress([
            'status'       => 'starting',
            'percent'      => 3,
            'downloadedMB' => '0.0',
            'totalMB'      => null,
            'message'      => 'Connecting to GitHub Releases in-app downloader…',
        ]);

        try {
            $fp = @fopen($installerPath, 'wb');
            if (!$fp) {
                throw new \RuntimeException('Unable to create temporary update installer file.');
            }

            $lastWriteMs = 0.0;
            $ch = curl_init($downloadUrl);
            curl_setopt_array($ch, [
                CURLOPT_FILE             => $fp,
                CURLOPT_FOLLOWLOCATION   => true,
                CURLOPT_MAXREDIRS        => 10,
                CURLOPT_TIMEOUT          => 900,
                CURLOPT_CONNECTTIMEOUT   => 20,
                CURLOPT_SSL_VERIFYPEER   => false,
                CURLOPT_SSL_VERIFYHOST   => 0,
                CURLOPT_USERAGENT        => 'Karobar-App-InApp-Updater/2.0',
                CURLOPT_HTTPHEADER       => ['Accept: application/octet-stream,*/*'],
                CURLOPT_NOPROGRESS       => false,
                CURLOPT_PROGRESSFUNCTION => function ($resource, $downloadSize, $downloaded) use (&$lastWriteMs) {
                    $nowMs = microtime(true) * 1000;
                    if (($nowMs - $lastWriteMs) < 250 && $downloaded < $downloadSize) {
                        return 0;
                    }
                    $lastWriteMs = $nowMs;
                    $dlMb = number_format($downloaded / (1024 * 1024), 1, '.', '');
                    $totMb = $downloadSize > 0 ? number_format($downloadSize / (1024 * 1024), 1, '.', '') : null;
                    $pct = $downloadSize > 0
                        ? min(98, max(4, (int) round(($downloaded / $downloadSize) * 100)))
                        : 50;

                    $this->writeUpdateProgress([
                        'status'       => 'downloading',
                        'percent'      => $pct,
                        'downloadedMB' => $dlMb,
                        'totalMB'      => $totMb,
                        'message'      => $totMb
                            ? "Downloading update in app ({$dlMb} MB / {$totMb} MB)…"
                            : "Downloading update in app ({$dlMb} MB)…",
                    ]);
                    return 0;
                },
            ]);

            $ok = curl_exec($ch);
            $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlErr = curl_error($ch);
            curl_close($ch);
            fclose($fp);

            if (!$ok || $httpCode !== 200 || !is_file($installerPath) || filesize($installerPath) < 5 * 1024 * 1024) {
                // Fallback to Windows curl.exe -L -k
                $cmd = sprintf(
                    'curl.exe -L -k --fail --silent --show-error -o %s %s 2>&1',
                    escapeshellarg($installerPath),
                    escapeshellarg($downloadUrl)
                );
                @exec($cmd, $out, $code);
                if ($code !== 0 || !is_file($installerPath) || filesize($installerPath) < 5 * 1024 * 1024) {
                    throw new \RuntimeException($curlErr ?: "Download failed (HTTP {$httpCode}).");
                }
            }

            $this->writeUpdateProgress([
                'status'  => 'installing',
                'percent' => 100,
                'message' => 'Launching Karobar-App installer & restarting…',
            ]);

            if (PHP_OS_FAMILY === 'Windows') {
                $installDir = dirname(base_path());
                $appExePath = $installDir . DIRECTORY_SEPARATOR . 'Karobar-App.exe';
                if (!is_file($appExePath)) {
                    $installDir = 'C:\\Program Files\\Karobar-App';
                    $appExePath = $installDir . '\\Karobar-App.exe';
                }

                $batPath = $tempDir . DIRECTORY_SEPARATOR . 'karobar-apply-update.bat';
                $batLines = [
                    '@echo off',
                    "title Karobar-App Software Updater (v{$versionLabel})",
                    'echo ==========================================================================',
                    "echo   Karobar-App v{$versionLabel} — Zero-Data-Loss Automatic Software Update",
                    'echo   Closing running Karobar-App processes before applying update...',
                    'echo ==========================================================================',
                    'timeout /t 2 /nobreak >nul',
                    'taskkill /F /IM "Karobar-App.exe" >nul 2>&1',
                    'taskkill /F /IM "KarobarERP.exe" >nul 2>&1',
                    'timeout /t 1 /nobreak >nul',
                    'echo.',
                    "echo [1/3] Installing Karobar-App v{$versionLabel} update (100%% database & license preserved)...",
                    "\"{$installerPath}\" /SILENT /SUPPRESSMSGBOXES /NORESTART /CLOSEAPPLICATIONS /FORCECLOSEAPPLICATIONS /UPGRADE=1 \"/DIR={$installDir}\"",
                    'echo.',
                    'echo [2/3] Applying database migrations and permission sync...',
                    "if exist \"{$installDir}\\app\\runtime\\php\\php.exe\" (",
                    "  pushd \"{$installDir}\\app\"",
                    "  \"{$installDir}\\app\\runtime\\php\\php.exe\" artisan karobar:install --upgrade-only --cleanup-temp >nul 2>&1",
                    '  popd',
                    ')',
                    'echo.',
                    'echo [3/3] Relaunching Karobar-App...',
                    'tasklist /FI "IMAGENAME eq Karobar-App.exe" 2>NUL | find /I /N "Karobar-App.exe">NUL',
                    'if "%ERRORLEVEL%" neq "0" (',
                    "  if exist \"{$appExePath}\" (",
                    "    start \"\" \"{$appExePath}\"",
                    '  )',
                    ')',
                    'exit /b 0',
                ];
                @file_put_contents($batPath, implode("\r\n", $batLines));

                $escapedBat = str_replace("'", "''", $batPath);
                $escapedExe = str_replace("'", "''", $installerPath);
                $escapedDir = str_replace("'", "''", $installDir);
                $psCmd = "try { Start-Process -FilePath '{$escapedBat}' -Verb RunAs -WindowStyle Normal -ErrorAction Stop } catch { Start-Process -FilePath '{$escapedExe}' -ArgumentList '/SILENT','/SUPPRESSMSGBOXES','/NORESTART','/CLOSEAPPLICATIONS','/FORCECLOSEAPPLICATIONS','/UPGRADE=1','/DIR={$escapedDir}' }";

                $launchCmd = 'start "" /B powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "' . $psCmd . '"';
                @pclose(@popen($launchCmd, 'r'));
            }

            return response()->json([
                'ok'             => true,
                'installing'     => true,
                'installer_path' => $installerPath,
            ]);
        } catch (\Throwable $e) {
            $this->writeUpdateProgress([
                'status'  => 'error',
                'percent' => 0,
                'message' => $e->getMessage() ?: 'Failed to download update in app.',
            ]);

            return response()->json([
                'ok'      => false,
                'message' => $e->getMessage() ?: 'Failed to download update in app.',
            ], 500);
        }
    }
}

