@echo off
echo =============================================
echo   Warehouse CCTV System - Starting
echo =============================================
echo.

REM Kill proses lama di port 3001 dan 3000 jika ada
echo Membersihkan proses lama...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001 "') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 "') do taskkill /PID %%a /F >nul 2>&1
timeout /t 2 /nobreak >nul

REM Buka firewall port 3000 dan 3001 (jalankan sekali, skip jika sudah ada)
netsh advfirewall firewall show rule name="CCTV-Frontend-3000" >nul 2>&1
if errorlevel 1 (
    echo Menambahkan aturan firewall untuk port 3000 dan 3001...
    netsh advfirewall firewall add rule name="CCTV-Frontend-3000" dir=in action=allow protocol=TCP localport=3000 >nul 2>&1
    netsh advfirewall firewall add rule name="CCTV-Backend-3001"  dir=in action=allow protocol=TCP localport=3001 >nul 2>&1
    echo Firewall OK.
)

REM Dapatkan IP jaringan mini PC
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4" ^| findstr /v "127.0.0.1"') do (
    set LOCALIP=%%a
    goto :gotip
)
:gotip
set LOCALIP=%LOCALIP: =%

REM Start backend
echo [Backend] Starting on port 3001...
start "CCTV-Backend" cmd /k "cd /d "%~dp0backend" && node src/app.js"

echo Menunggu backend siap (5 detik)...
timeout /t 5 /nobreak >nul

REM Start frontend (listen semua interface agar bisa diakses dari jaringan)
echo [Frontend] Starting on port 3000...
start "CCTV-Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo =============================================
echo   Sistem berjalan!
echo.
echo   Di Mini PC ini:
echo   Dashboard : http://localhost:3000
echo   API       : http://localhost:3001/health
echo.
echo   Dari PC lain di jaringan:
echo   Dashboard : http://%LOCALIP%:3000
echo   API       : http://%LOCALIP%:3001/health
echo.
echo   Tutup window CCTV-Backend / CCTV-Frontend
echo   untuk menghentikan sistem.
echo =============================================
pause
