# Warehouse CCTV System - PowerShell Installer

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "Node.js : $(node -v)"
Write-Host "npm     : $(npm -v)"
Write-Host ""

# --- Backend ---
Write-Host "--- [1/3] Install backend dependencies ---" -ForegroundColor Cyan
Set-Location "$root\backend"
Write-Host "Dir: $PWD"
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] npm install backend gagal." -ForegroundColor Red
    Read-Host "Tekan Enter untuk keluar"
    exit 1
}
Write-Host "[OK] Backend selesai." -ForegroundColor Green

# --- Frontend ---
Write-Host ""
Write-Host "--- [2/3] Install frontend dependencies ---" -ForegroundColor Cyan
Set-Location "$root\frontend"
Write-Host "Dir: $PWD"
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] npm install frontend gagal." -ForegroundColor Red
    Read-Host "Tekan Enter untuk keluar"
    exit 1
}
Write-Host "[OK] Frontend selesai." -ForegroundColor Green

# --- Directories ---
Write-Host ""
Write-Host "--- [3/3] Membuat direktori recording ---" -ForegroundColor Cyan
$dirs = @(
    "D:\CCTV_Recording",
    "D:\CCTV_Recording\Export",
    "D:\CCTV_Recording\Database",
    "D:\CCTV_Recording\Logs",
    "D:\CCTV_Recording\Excel"
)
foreach ($d in $dirs) {
    if (-not (Test-Path $d)) {
        New-Item -ItemType Directory -Path $d -Force | Out-Null
        Write-Host "  Created: $d"
    } else {
        Write-Host "  Exists : $d"
    }
}

Write-Host ""
Write-Host "=============================================" -ForegroundColor Green
Write-Host "  Install selesai!" -ForegroundColor Green
Write-Host "  Langkah berikutnya:" -ForegroundColor Green
Write-Host "    1. Pastikan config\config.json sudah benar" -ForegroundColor Green
Write-Host "    2. Jalankan start.bat" -ForegroundColor Green
Write-Host "    3. Buka http://localhost:3000" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
