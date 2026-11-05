<#
.SYNOPSIS
    Automated Windows .exe Build & Inno Setup Packaging Pipeline for Karobar-App-ERP-v2.
.DESCRIPTION
    1. Builds the Vite React 19 SPA (`npm run build`)
    2. Packages the Electron Desktop Shell (`KarobarERP.exe`)
    3. Stages the Laravel 13 production runtime + portable PHP 8.3 (with sodium, sqlite3, gd, zip) + portable Node.js 22 (for WhatsApp Agent)
    4. Compiles `installer/karobar.iss` via Inno Setup 6 into `dist/installer/Karobar-ERP-Setup-v2.0.0.exe`
#>

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $RepoRoot

$DistDir    = Join-Path $RepoRoot "dist"
$CacheDir   = Join-Path $DistDir "cache"
$ShellDir   = Join-Path $DistDir "win-shell"
$StageDir   = Join-Path $DistDir "stage"
$AppStage   = Join-Path $StageDir "app"

New-Item -ItemType Directory -Force -Path $CacheDir, $StageDir | Out-Null

Write-Host "==> [1/6] Building Frontend Assets (Cube Knowledge + Vite Production Bundle)..." -ForegroundColor Cyan
npm ci
npm run build
npm prune --omit=dev

Write-Host "==> [2/6] Packaging Electron Desktop Shell (KarobarERP.exe)..." -ForegroundColor Cyan
Push-Location (Join-Path $RepoRoot "desktop")
npm install
npm run pack:win64
Pop-Location

$ElectronUnpacked = Join-Path $ShellDir "KarobarERP-win32-x64"
if (-not (Test-Path $ElectronUnpacked)) {
    throw "Electron shell build failed: $ElectronUnpacked not found."
}

if (Test-Path $StageDir) {
    Remove-Item -Recurse -Force $StageDir
}
New-Item -ItemType Directory -Force -Path $StageDir, $AppStage | Out-Null
Copy-Item -Path "$ElectronUnpacked\*" -Destination $StageDir -Recurse -Force

Write-Host "==> [3/6] Staging Laravel Production Files into dist/stage/app..." -ForegroundColor Cyan
$CopyDirs = @("app", "bootstrap", "config", "database", "public", "resources", "routes", "scripts", "vendor")
foreach ($dir in $CopyDirs) {
    $src = Join-Path $RepoRoot $dir
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination (Join-Path $AppStage $dir) -Recurse -Force
    }
}

# Stage desktop runtime scripts (excluding desktop/node_modules)
$DesktopStage = Join-Path $AppStage "desktop"
New-Item -ItemType Directory -Force -Path $DesktopStage | Out-Null
foreach ($dFile in @("router.php", "main.cjs", "preload.cjs", "splash.html", "package.json", "icon.ico", "icon.png")) {
    $dSrc = Join-Path $RepoRoot "desktop\$dFile"
    if (Test-Path $dSrc) {
        Copy-Item -Path $dSrc -Destination (Join-Path $DesktopStage $dFile) -Force
    }
}

$CopyFiles = @("artisan", "composer.json", "composer.lock", "package.json", ".env.example")
foreach ($file in $CopyFiles) {
    $src = Join-Path $RepoRoot $file
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination (Join-Path $AppStage $file) -Force
    }
}

# Copy production WhatsApp agent node_modules (@whiskeysockets/baileys, pino, qrcode)
$WaModulesDir = Join-Path $AppStage "node_modules"
New-Item -ItemType Directory -Force -Path $WaModulesDir | Out-Null
Copy-Item -Path (Join-Path $RepoRoot "node_modules\*") -Destination $WaModulesDir -Recurse -Force

# Clean dev/test artifacts from staged public, database & storage
Remove-Item -Path (Join-Path $AppStage "public\hot") -Force -ErrorAction SilentlyContinue
Remove-Item -Path (Join-Path $AppStage "public\storage") -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path (Join-Path $AppStage "database\*.sqlite*") -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path `
    (Join-Path $AppStage "storage\app\public"), `
    (Join-Path $AppStage "storage\app\backups"), `
    (Join-Path $AppStage "storage\app\whatsapp-agent"), `
    (Join-Path $AppStage "storage\framework\cache"), `
    (Join-Path $AppStage "storage\framework\sessions"), `
    (Join-Path $AppStage "storage\framework\views"), `
    (Join-Path $AppStage "storage\logs"), `
    (Join-Path $AppStage "bootstrap\cache") | Out-Null

Write-Host "==> [4/6] Provisioning Portable PHP 8.4 Win64 Runtime (with sodium, sqlite3, gd, zip)..." -ForegroundColor Cyan
$PhpRuntimeDir = Join-Path $AppStage "runtime\php"
New-Item -ItemType Directory -Force -Path $PhpRuntimeDir | Out-Null

$LocalPhpCmd = Get-Command "php.exe" -ErrorAction SilentlyContinue
$LocalPhpDir = if ($LocalPhpCmd) { Split-Path -Parent $LocalPhpCmd.Source } else { $null }
$IsPhp84Plus = if ($LocalPhpCmd) { (& $LocalPhpCmd.Source -r "echo (int)(PHP_VERSION_ID >= 80401);") -eq "1" } else { $false }

if ($LocalPhpDir -and $IsPhp84Plus -and (Test-Path (Join-Path $LocalPhpDir "ext\php_sodium.dll"))) {
    Write-Host "    Using host PHP 8.4+ installation from: $LocalPhpDir" -ForegroundColor Gray
    Copy-Item -Path "$LocalPhpDir\*" -Destination $PhpRuntimeDir -Recurse -Force
} else {
    $PhpZipUrl = $env:KAROBAR_PHP_WIN64_URL
    if (-not $PhpZipUrl) {
        $PhpZipUrl = "https://windows.php.net/downloads/releases/archives/php-8.4.4-nts-Win32-vs17-x64.zip"
    }
    $PhpZipPath = Join-Path $CacheDir "php-8.4-win64.zip"
    if (-not (Test-Path $PhpZipPath)) {
        Invoke-WebRequest -Uri $PhpZipUrl -OutFile $PhpZipPath -Headers @{ "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } -UseBasicParsing
    }
    Expand-Archive -Path $PhpZipPath -DestinationPath $PhpRuntimeDir -Force
}

# Bundle VC++ runtime DLLs alongside php.exe so fresh Windows 10/11 PCs work without VC++ Redistributable pre-installed
foreach ($vcDll in @("vcruntime140.dll", "vcruntime140_1.dll", "msvcp140.dll")) {
    $sysDll = Join-Path $env:SystemRoot "System32\$vcDll"
    $destDll = Join-Path $PhpRuntimeDir $vcDll
    if ((Test-Path $sysDll) -and (-not (Test-Path $destDll))) {
        Copy-Item -Path $sysDll -Destination $destDll -Force
    }
}

# Configure php.ini with all extensions required by Karobar-App-ERP-v2
$PhpIni = @"
[PHP]
engine = On
short_open_tag = Off
memory_limit = 512M
max_execution_time = 120
upload_max_filesize = 64M
post_max_size = 64M
variables_order = "EGPCS"
extension_dir = "ext"
extension=curl
extension=fileinfo
extension=gd
extension=mbstring
extension=openssl
extension=pdo_sqlite
extension=sodium
extension=sqlite3
extension=zip
zend_extension=opcache
opcache.enable=1
opcache.enable_cli=1
"@
Set-Content -Path (Join-Path $PhpRuntimeDir "php.ini") -Value $PhpIni -Encoding UTF8

# Self-test isolated pre-install Machine ID detection (simulating Inno Setup {tmp} extraction)
$PrecheckTestDir = Join-Path $CacheDir "precheck-self-test"
if (Test-Path $PrecheckTestDir) { Remove-Item -Recurse -Force $PrecheckTestDir }
New-Item -ItemType Directory -Force -Path $PrecheckTestDir | Out-Null
foreach ($f in @("php.exe", "php8.dll", "php8ts.dll", "libsodium.dll", "vcruntime140.dll", "vcruntime140_1.dll", "msvcp140.dll")) {
    $p = Join-Path $PhpRuntimeDir $f
    if (Test-Path $p) { Copy-Item -Path $p -Destination (Join-Path $PrecheckTestDir $f) -Force }
}
Copy-Item -Path (Join-Path $PhpRuntimeDir "ext\php_sodium.dll") -Destination (Join-Path $PrecheckTestDir "php_sodium.dll") -Force
Copy-Item -Path (Join-Path $RepoRoot "installer\precheck.php") -Destination (Join-Path $PrecheckTestDir "precheck.php") -Force

$TestMidOut = Join-Path $PrecheckTestDir "machine-id.txt"
& (Join-Path $PrecheckTestDir "php.exe") -n -d extension_dir="$PrecheckTestDir" -d extension=sodium (Join-Path $PrecheckTestDir "precheck.php") machine-id $TestMidOut
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $TestMidOut)) {
    throw "Pre-install Machine ID self-test failed with exit code $LASTEXITCODE"
}
$DetectedTestMid = (Get-Content $TestMidOut -Raw).Trim()
Write-Host "    Verified Pre-Install Machine ID Engine: $DetectedTestMid" -ForegroundColor Green
if ($DetectedTestMid -notmatch "^KRB-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$") {
    throw "Invalid Machine ID format from precheck self-test: $DetectedTestMid"
}

Write-Host "==> [5/6] Provisioning Portable Node.js 22 LTS Win64 Runtime (for Local WhatsApp Agent)..." -ForegroundColor Cyan
$NodeRuntimeDir = Join-Path $AppStage "runtime\node"
New-Item -ItemType Directory -Force -Path $NodeRuntimeDir | Out-Null

$LocalNodeCmd = Get-Command "node.exe" -ErrorAction SilentlyContinue
if ($LocalNodeCmd -and (Test-Path $LocalNodeCmd.Source)) {
    Write-Host "    Using host Node.js binary from: $($LocalNodeCmd.Source)" -ForegroundColor Gray
    Copy-Item -Path $LocalNodeCmd.Source -Destination (Join-Path $NodeRuntimeDir "node.exe") -Force
} else {
    $NodeZipUrl = "https://nodejs.org/dist/v22.13.1/node-v22.13.1-win-x64.zip"
    $NodeZipPath = Join-Path $CacheDir "node-v22-win-x64.zip"
    if (-not (Test-Path $NodeZipPath)) {
        Invoke-WebRequest -Uri $NodeZipUrl -OutFile $NodeZipPath -UseBasicParsing
    }
    $NodeExtractTmp = Join-Path $CacheDir "node-extract"
    if (Test-Path $NodeExtractTmp) { Remove-Item -Recurse -Force $NodeExtractTmp }
    Expand-Archive -Path $NodeZipPath -DestinationPath $NodeExtractTmp -Force
    $NodeBinFile = Get-ChildItem -Path $NodeExtractTmp -Filter "node.exe" -Recurse | Select-Object -First 1
    Copy-Item -Path $NodeBinFile.FullName -Destination (Join-Path $NodeRuntimeDir "node.exe") -Force
}

Write-Host "==> [6/6] Compiling Windows Installer (Karobar-ERP-Setup-v2.0.0.exe) via Inno Setup 6..." -ForegroundColor Cyan
$IsccCandidates = @(
    "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
    "C:\Program Files\Inno Setup 6\ISCC.exe",
    "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
)
$IsccExe = $IsccCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $IsccExe) {
    $IsccExe = (Get-Command "ISCC.exe" -ErrorAction SilentlyContinue).Source
}
if (-not $IsccExe -and (Get-Command "choco.exe" -ErrorAction SilentlyContinue)) {
    Write-Host "    Installing Inno Setup 6 via Chocolatey..." -ForegroundColor Gray
    choco install innosetup -y --no-progress
    $IsccExe = $IsccCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $IsccExe) {
    throw "Inno Setup 6 (ISCC.exe) not found. Install via: winget install JRSoftware.InnoSetup"
}

& $IsccExe (Join-Path $RepoRoot "installer\karobar.iss")
if ($LASTEXITCODE -ne 0) {
    throw "Inno Setup compilation failed with exit code $LASTEXITCODE"
}

Write-Host "================================================================================" -ForegroundColor Green
Write-Host "SUCCESS! Windows .exe Installer generated at:" -ForegroundColor Green
Write-Host "  dist\installer\Karobar-ERP-Setup-v2.0.0.exe" -ForegroundColor Yellow
Write-Host "================================================================================" -ForegroundColor Green

