@echo off
setlocal
cd /d "%~dp0"
echo ================================================
echo Junior School Learning Hub - Private PDF Upload
echo ================================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Please install the LTS version from https://nodejs.org/ and run this file again.
  echo.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run-premium-upload.ps1"
echo.
pause
