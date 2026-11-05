<?php

/**
 * Embedded Desktop HTTP Router for Karobar-App-ERP Windows .exe Runtime.
 * Serves static assets from /public directly and forwards application routes to /public/index.php.
 */

$uri = urldecode(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');
$publicDir = __DIR__ . '/../public';
$candidate = realpath($publicDir . $uri);

if (
    $uri !== '/'
    && $candidate !== false
    && str_starts_with($candidate, realpath($publicDir) ?: $publicDir)
    && is_file($candidate)
) {
    return false;
}

// Windows Desktop Fallback: Serve /storage/* directly from storage/app/public/* even when Windows symlinks are unavailable
if (str_starts_with($uri, '/storage/')) {
    $storagePublicDir = realpath(__DIR__ . '/../storage/app/public');
    $relativeStoragePath = ltrim(substr($uri, strlen('/storage/')), '/\\');
    if ($storagePublicDir !== false && $relativeStoragePath !== '') {
        $storageCandidate = realpath($storagePublicDir . DIRECTORY_SEPARATOR . $relativeStoragePath);
        if (
            $storageCandidate !== false
            && str_starts_with($storageCandidate, $storagePublicDir)
            && is_file($storageCandidate)
        ) {
            $ext = strtolower(pathinfo($storageCandidate, PATHINFO_EXTENSION));
            $mime = match ($ext) {
                'png'         => 'image/png',
                'jpg', 'jpeg' => 'image/jpeg',
                'webp'        => 'image/webp',
                'gif'         => 'image/gif',
                'svg'         => 'image/svg+xml',
                'pdf'         => 'application/pdf',
                default       => (function_exists('mime_content_type') ? (@mime_content_type($storageCandidate) ?: 'application/octet-stream') : 'application/octet-stream'),
            };
            header('Content-Type: ' . $mime);
            header('Content-Length: ' . filesize($storageCandidate));
            readfile($storageCandidate);
            exit;
        }
    }
}

$_SERVER['SCRIPT_NAME'] = '/index.php';
$_SERVER['SCRIPT_FILENAME'] = $publicDir . '/index.php';

require_once $publicDir . '/index.php';

