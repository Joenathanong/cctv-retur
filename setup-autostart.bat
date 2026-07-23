@echo off
REM Setup Windows Task Scheduler to auto-start CCTV system at login
SETLOCAL

set TASK_NAME=WarehouseCCTV
set SCRIPT_PATH=%~dp0start.bat

echo Mendaftarkan task scheduler: %TASK_NAME%

schtasks /Create /TN "%TASK_NAME%" /TR "\"%SCRIPT_PATH%\"" /SC ONLOGON /RU "%USERNAME%" /RL HIGHEST /F

IF ERRORLEVEL 1 (
    echo [ERROR] Gagal mendaftarkan task. Coba jalankan sebagai Administrator.
    pause
    exit /b 1
)

echo.
echo [OK] Task Scheduler berhasil didaftarkan.
echo      Program akan otomatis berjalan saat login Windows.
echo.
echo Untuk hapus auto-start:
echo   schtasks /Delete /TN "%TASK_NAME%" /F
pause
