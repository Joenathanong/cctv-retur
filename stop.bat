@echo off
echo Menghentikan Warehouse CCTV System...

taskkill /FI "WINDOWTITLE eq CCTV-Backend*"  /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq CCTV-Frontend*" /F >nul 2>&1

REM Also kill any ffmpeg spawned by the backend
taskkill /IM ffmpeg.exe /F >nul 2>&1

echo Sistem dihentikan.
