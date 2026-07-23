@echo off
echo =============================================
echo   Warehouse CCTV System - Installer
echo =============================================
echo.
echo Menjalankan installer via PowerShell...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
pause
