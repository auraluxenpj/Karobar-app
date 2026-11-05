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
}

