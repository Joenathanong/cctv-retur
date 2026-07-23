# Download dan install FFmpeg ke C:\ffmpeg, tambah ke PATH
$ErrorActionPreference = "Stop"

$installDir = "C:\ffmpeg"
$zipUrl = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
$zipPath = "$env:TEMP\ffmpeg.zip"

Write-Host "=== Install FFmpeg ===" -ForegroundColor Cyan
Write-Host ""

# Cek apakah sudah ada
try {
    $ver = & ffmpeg -version 2>&1 | Select-Object -First 1
    Write-Host "[OK] FFmpeg sudah terinstall: $ver" -ForegroundColor Green
    Write-Host "Tidak perlu install ulang."
    Read-Host "Tekan Enter untuk keluar"
    exit 0
} catch {}

Write-Host "Mengunduh FFmpeg dari gyan.dev..."
Write-Host "URL: $zipUrl"
Write-Host "(Ukuran sekitar 80 MB, mohon tunggu...)"
Write-Host ""

# Download
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing

Write-Host "Download selesai. Mengekstrak..."

# Extract
if (Test-Path $installDir) {
    Remove-Item $installDir -Recurse -Force
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
$topFolder = ($zip.Entries[0].FullName -split '/')[0]
$zip.Dispose()

Expand-Archive -Path $zipPath -DestinationPath "C:\" -Force

# Rename extracted folder to C:\ffmpeg
$extracted = Get-ChildItem "C:\" -Directory | Where-Object { $_.Name -like "ffmpeg-*" } | Select-Object -First 1
if ($extracted) {
    Rename-Item $extracted.FullName $installDir -Force
}

$ffmpegBin = "$installDir\bin"
if (-not (Test-Path "$ffmpegBin\ffmpeg.exe")) {
    Write-Host "[ERROR] ffmpeg.exe tidak ditemukan di $ffmpegBin" -ForegroundColor Red
    Read-Host "Tekan Enter untuk keluar"
    exit 1
}

# Tambah ke System PATH
$currentPath = [Environment]::GetEnvironmentVariable("Path", "Machine")
if ($currentPath -notlike "*$ffmpegBin*") {
    [Environment]::SetEnvironmentVariable("Path", "$currentPath;$ffmpegBin", "Machine")
    Write-Host "PATH system diupdate: $ffmpegBin" -ForegroundColor Green
} else {
    Write-Host "PATH sudah mengandung $ffmpegBin" -ForegroundColor Yellow
}

# Juga update PATH di session ini dan di config
$env:PATH = "$env:PATH;$ffmpegBin"

# Update config.json ffmpeg path ke full path
$configPath = "$PSScriptRoot\config\config.json"
$cfg = Get-Content $configPath | ConvertFrom-Json
$cfg.ffmpeg.path = "$ffmpegBin\ffmpeg.exe"
$cfg | ConvertTo-Json -Depth 10 | Set-Content $configPath
Write-Host "config.json diupdate: ffmpeg.path = $ffmpegBin\ffmpeg.exe" -ForegroundColor Green

# Cleanup
Remove-Item $zipPath -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=== FFmpeg berhasil diinstall! ===" -ForegroundColor Green
Write-Host "Path: $ffmpegBin\ffmpeg.exe"
Write-Host ""
Write-Host "PENTING: Restart start.bat agar PATH baru aktif."
Read-Host "Tekan Enter untuk keluar"
