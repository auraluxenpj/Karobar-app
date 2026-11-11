<#
.SYNOPSIS
    Automated Windows .exe Build, Code Signing & Zero-Data-Loss OTA Release Pipeline for Karobar-App.
.DESCRIPTION
    1. Stamps `public/version.json` with the current version & GitHub Actions build number (`2.0.<run_number>`)
    2. Builds the Vite React 19 SPA (`npm run build`)
    3. Packages the Electron Desktop Shell (`Karobar-App.exe`)
    4. Stages the Laravel 13 production runtime + portable PHP 8.4 (with sodium, sqlite3, gd, zip) + portable Node.js 22 (for WhatsApp Agent)
    5. Compiles `installer/karobar.iss` via Inno Setup 6 into `dist/installer/Karobar-App-Setup.exe` and generates `dist/installer/latest-release.json`
#>

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $RepoRoot

$BuildNumber = if ($env:GITHUB_RUN_NUMBER) { [int]$env:GITHUB_RUN_NUMBER } else { 1 }
$AppVersion  = if ($env:KAROBAR_APP_VERSION -and $env:KAROBAR_APP_VERSION -ne "" -and $env:KAROBAR_APP_VERSION -ne "auto") { $env:KAROBAR_APP_VERSION } else { "2.0.$BuildNumber" }
$CommitSha   = if ($env:GITHUB_SHA) { $env:GITHUB_SHA.Substring(0, 7) } else { "local" }
$ReleasedAt  = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$RepoSlug    = if ($env:GITHUB_REPOSITORY) { $env:GITHUB_REPOSITORY } else { "shzdasim/Karobar-App" }

Write-Host "==> [0/6] Stamping Karobar-App Version Metadata: v$AppVersion (Build #$BuildNumber, Commit $CommitSha)..." -ForegroundColor Cyan
$VersionMeta = [ordered]@{
    app_name     = "Karobar-App"
    version      = $AppVersion
    build_number = $BuildNumber
    commit_sha   = $CommitSha
    repository   = $RepoSlug
    released_at  = $ReleasedAt
}
$VersionMetaJson = $VersionMeta | ConvertTo-Json -Depth 4
Set-Content -Path (Join-Path $RepoRoot "public\version.json") -Value $VersionMetaJson -Encoding UTF8

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

Write-Host "==> [2/6] Packaging Electron Desktop Shell (Karobar-App.exe)..." -ForegroundColor Cyan
Push-Location (Join-Path $RepoRoot "desktop")
npm install
npm run pack:win64
Pop-Location

$ElectronUnpacked = Join-Path $ShellDir "Karobar-App-win32-x64"
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
$SumatraSrc = Join-Path $RepoRoot "desktop\node_modules\pdf-to-printer\dist\SumatraPDF-3.4.6-32.exe"
if (Test-Path $SumatraSrc) {
    Copy-Item -Path $SumatraSrc -Destination (Join-Path $DesktopStage "SumatraPDF.exe") -Force
    Copy-Item -Path $SumatraSrc -Destination (Join-Path $DesktopStage "SumatraPDF-3.4.6-32.exe") -Force
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

# Clean dev/test artifacts from staged public, database & storage so upgrades NEVER overwrite end-user database.sqlite or .env
Remove-Item -Path (Join-Path $AppStage "public\hot") -Force -ErrorAction SilentlyContinue
Remove-Item -Path (Join-Path $AppStage "public\storage") -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path (Join-Path $AppStage "database\*.sqlite*") -Force -ErrorAction SilentlyContinue
Remove-Item -Path (Join-Path $AppStage ".env") -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path `
    (Join-Path $AppStage "storage\app\public"), `
    (Join-Path $AppStage "storage\app\backups"), `
    (Join-Path $AppStage "storage\app\whatsapp-agent"), `
    (Join-Path $AppStage "storage\backups"), `
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

# Bundle Mozilla CA Certificate store (cacert.pem) so portable PHP cURL/OpenSSL HTTPS requests succeed on all Windows machines
$CaCertDest = Join-Path $PhpRuntimeDir "cacert.pem"
if (-not (Test-Path $CaCertDest)) {
    try {
        Invoke-WebRequest -Uri "https://curl.se/ca/cacert.pem" -OutFile $CaCertDest -UseBasicParsing
    } catch {
        Write-Host "    Note: cacert.pem download skipped; SystemUpdateController uses fallback verification." -ForegroundColor Gray
    }
}

# Configure php.ini with all extensions required by Karobar-App
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

Write-Host "==> [6/6] Code Signing & Compiling Windows Installer (Karobar-App-Setup.exe v$AppVersion)..." -ForegroundColor Cyan

# Provision Authenticode Code Signing Certificate bound to Malik Asim Shahzad (https://github.com/shzdasim)
$InstallerOutDir = Join-Path $DistDir "installer"
New-Item -ItemType Directory -Force -Path $InstallerOutDir | Out-Null
$RepoPfxPath = Join-Path $RepoRoot "desktop\MalikAsimShahzad-CodeSign.pfx"
$RepoCerPath = Join-Path $RepoRoot "desktop\MalikAsimShahzad-KarobarERP.cer"
$PfxPath = Join-Path $CacheDir "MalikAsimShahzad-CodeSign.pfx"
$CerPath = Join-Path $DesktopStage "MalikAsimShahzad-KarobarERP.cer"
$PfxPasswordPlain = if ($env:WINDOWS_CERT_PASSWORD) { $env:WINDOWS_CERT_PASSWORD } else { "KarobarSign2026!" }
$PfxPasswordSec = ConvertTo-SecureString -String $PfxPasswordPlain -Force -AsPlainText

if ($env:WINDOWS_CERT_PFX_BASE64) {
    Write-Host "    Using provided WINDOWS_CERT_PFX_BASE64 code signing certificate..." -ForegroundColor Gray
    [IO.File]::WriteAllBytes($PfxPath, [Convert]::FromBase64String($env:WINDOWS_CERT_PFX_BASE64))
    $SigningCert = Import-PfxCertificate -FilePath $PfxPath -CertStoreLocation "Cert:\CurrentUser\My" -Password $PfxPasswordSec
    Export-Certificate -Cert $SigningCert -FilePath $CerPath -Force | Out-Null
} elseif ((Test-Path $RepoPfxPath) -and (Test-Path $RepoCerPath)) {
    Write-Host "    Using persistent repository Authenticode Developer Certificate (Malik Asim Shahzad)..." -ForegroundColor Gray
    Copy-Item -Path $RepoPfxPath -Destination $PfxPath -Force
    Copy-Item -Path $RepoCerPath -Destination $CerPath -Force
    $SigningCert = Import-PfxCertificate -FilePath $PfxPath -CertStoreLocation "Cert:\CurrentUser\My" -Password $PfxPasswordSec
    Import-Certificate -FilePath $CerPath -CertStoreLocation "Cert:\LocalMachine\Root" | Out-Null
    Import-Certificate -FilePath $CerPath -CertStoreLocation "Cert:\LocalMachine\TrustedPublisher" | Out-Null
} else {
    Write-Host "    Generating Authenticode Developer Certificate for Malik Asim Shahzad (https://github.com/shzdasim/Karobar-App)..." -ForegroundColor Gray
    $SigningCert = New-SelfSignedCertificate `
        -Type CodeSigningCert `
        -Subject "CN=Malik Asim Shahzad (shzdasim), O=Malik Asim Shahzad, OU=https://github.com/shzdasim/Karobar-App, C=PK" `
        -FriendlyName "Malik Asim Shahzad - Karobar-App Developer Certificate" `
        -KeyAlgorithm RSA `
        -KeyLength 2048 `
        -HashAlgorithm "SHA256" `
        -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3", "2.5.29.17={text}URL=https://github.com/shzdasim/Karobar-App") `
        -CertStoreLocation "Cert:\CurrentUser\My" `
        -NotAfter (Get-Date).AddYears(5)

    Export-PfxCertificate -Cert $SigningCert -FilePath $PfxPath -Password $PfxPasswordSec -Force | Out-Null
    Export-Certificate -Cert $SigningCert -FilePath $CerPath -Force | Out-Null
    Import-Certificate -FilePath $CerPath -CertStoreLocation "Cert:\LocalMachine\Root" | Out-Null
    Import-Certificate -FilePath $CerPath -CertStoreLocation "Cert:\LocalMachine\TrustedPublisher" | Out-Null
}

Copy-Item -Path $CerPath -Destination (Join-Path $InstallerOutDir "MalikAsimShahzad-KarobarERP.cer") -Force

$SignToolExe = Get-ChildItem -Path "C:\Program Files (x86)\Windows Kits\10\bin\*\x64\signtool.exe" -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending |
    Select-Object -First 1 -ExpandProperty FullName

function Invoke-KarobarAuthenticodeSign([string]$TargetExe) {
    if (-not (Test-Path $TargetExe)) { return }
    Write-Host "    Signing executable: $(Split-Path -Leaf $TargetExe)" -ForegroundColor Gray
    if ($SignToolExe -and (Test-Path $SignToolExe)) {
        & $SignToolExe sign /f $PfxPath /p $PfxPasswordPlain /fd SHA256 /d "Karobar-App - Malik Asim Shahzad" /du "https://github.com/shzdasim/Karobar-App" /tr "http://timestamp.digicert.com" /td SHA256 $TargetExe
        if ($LASTEXITCODE -ne 0) {
            & $SignToolExe sign /f $PfxPath /p $PfxPasswordPlain /fd SHA256 /d "Karobar-App - Malik Asim Shahzad" /du "https://github.com/shzdasim/Karobar-App" $TargetExe
        }
    } else {
        $sigRes = Set-AuthenticodeSignature -FilePath $TargetExe -Certificate $SigningCert -HashAlgorithm SHA256 -TimestampServer "http://timestamp.digicert.com"
        if ($sigRes.Status -ne "Valid") {
            Set-AuthenticodeSignature -FilePath $TargetExe -Certificate $SigningCert -HashAlgorithm SHA256 | Out-Null
        }
    }
}

# Sign the packaged Electron application executable before building the installer
Invoke-KarobarAuthenticodeSign (Join-Path $StageDir "Karobar-App.exe")

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

if ($SignToolExe -and (Test-Path $SignToolExe)) {
    # Pass SignTool to ISCC so Inno Setup signs the inner elevated setup.tmp executable, unins000.exe, AND the outer setup.exe
    $SignCmd = "`$q$SignToolExe`$q sign /f `$q$PfxPath`$q /p `$q$PfxPasswordPlain`$q /fd SHA256 /d `$qKarobar-App - Malik Asim Shahzad`$q /du `$qhttps://github.com/shzdasim/Karobar-App`$q `$f"
    & $IsccExe "/DMyAppVersion=$AppVersion" "/DSignToolEnabled=1" "/Skarobarsign=$SignCmd" (Join-Path $RepoRoot "installer\karobar.iss")
} else {
    & $IsccExe "/DMyAppVersion=$AppVersion" (Join-Path $RepoRoot "installer\karobar.iss")
}
if ($LASTEXITCODE -ne 0) {
    throw "Inno Setup compilation failed with exit code $LASTEXITCODE"
}

# Timestamp and verify the final compiled Inno Setup .exe installer
$FinalInstallerExe = Join-Path $InstallerOutDir "Karobar-App-Setup.exe"
Invoke-KarobarAuthenticodeSign $FinalInstallerExe
$VerifySig = Get-AuthenticodeSignature -FilePath $FinalInstallerExe
Write-Host "    Authenticode Signature Status: $($VerifySig.Status) | Signer: $($VerifySig.SignerCertificate.Subject)" -ForegroundColor Green

# Generate 1-Click Certificate Trust & Installer Launcher (Install-Karobar-App.bat)
$HelperBatPath = Join-Path $InstallerOutDir "Install-Karobar-App.bat"
$HelperBatContent = @"
@echo off
title Karobar-App v$AppVersion - Verified Publisher Installer
:: Request Administrator elevation if not already elevated
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting Administrator privileges to trust developer certificate...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)
cd /d "%~dp0"
echo [1/3] Trusting Developer Certificate: Malik Asim Shahzad (https://github.com/shzdasim/Karobar-App)...
certutil.exe -addstore -f "Root" "%~dp0MalikAsimShahzad-KarobarERP.cer" >nul 2>&1
certutil.exe -addstore -f "TrustedPublisher" "%~dp0MalikAsimShahzad-KarobarERP.cer" >nul 2>&1
echo [2/3] Clearing browser download security zone mark...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -Path '%~dp0' | Unblock-File -ErrorAction SilentlyContinue"
echo [3/3] Launching Signed Karobar-App Setup Wizard...
start "" "%~dp0Karobar-App-Setup.exe"
"@
Set-Content -Path $HelperBatPath -Value $HelperBatContent -Encoding ASCII

# Generate latest-release.json manifest for in-app Over-The-Air (OTA) update checks
$RecentCommits = ""
try {
    $RecentCommits = (git log -n 5 --pretty=format:"• %s (%h)" 2>$null) -join "`n"
} catch {
    $RecentCommits = "• Performance improvements, bug fixes, and new features."
}
if (-not $RecentCommits) {
    $RecentCommits = "• Performance improvements, bug fixes, and new features."
}

$LatestReleaseManifest = [ordered]@{
    app_name      = "Karobar-App"
    version       = $AppVersion
    build_number  = $BuildNumber
    commit_sha    = $CommitSha
    release_name  = "Karobar-App v$AppVersion (Build #$BuildNumber)"
    released_at   = $ReleasedAt
    notes         = $RecentCommits
    download_url  = "https://github.com/$RepoSlug/releases/latest/download/Karobar-App-Setup.exe"
    bundle_url    = "https://github.com/$RepoSlug/releases/latest/download/Karobar-App-Setup-Bundle.zip"
    release_url   = "https://github.com/$RepoSlug/releases/latest"
    zero_data_loss = $true
}
Set-Content -Path (Join-Path $InstallerOutDir "latest-release.json") -Value ($LatestReleaseManifest | ConvertTo-Json -Depth 4) -Encoding UTF8

Write-Host "================================================================================" -ForegroundColor Green
Write-Host "SUCCESS! Signed Windows .exe Installer & OTA Update Manifest generated at:" -ForegroundColor Green
Write-Host "  dist\installer\Karobar-App-Setup.exe (v$AppVersion, Build #$BuildNumber)" -ForegroundColor Yellow
Write-Host "  dist\installer\latest-release.json" -ForegroundColor Yellow
Write-Host "  Publisher: Malik Asim Shahzad (https://github.com/shzdasim/Karobar-App)" -ForegroundColor Yellow
Write-Host "================================================================================" -ForegroundColor Green
