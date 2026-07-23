@echo off
echo Building Next.js frontend for production...
cd /d "%~dp0frontend"
npm run build
IF ERRORLEVEL 1 (
    echo [ERROR] Build gagal.
    pause
    exit /b 1
)
echo Build selesai! Jalankan start.bat untuk memulai dalam production mode.
pause
