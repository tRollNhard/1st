@echo off
REM Self-elevating launcher for audio_fix.ps1.
REM Double-click this file and accept the UAC prompt.

net session >nul 2>&1
if %errorlevel% NEQ 0 (
    echo Requesting administrator privileges...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"
echo === Pass 0: make sure BT audio devices are enabled ===
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0bt_restore.ps1"
echo.
echo === Pass 1: mic consent + failed-start HID cleanup + service restart ===
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0audio_fix.ps1"
echo.
echo === Pass 2: deep fixes (Camo off, enhancements off, exclusive-mode off, 48kHz/24bit, Voice Access off, BT kept on) ===
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0audio_fix_deep.ps1"
echo.
echo === Pass 3: verify BT still enabled ===
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0bt_restore.ps1"
echo.
echo ==== Finished. Sony TV / Spotify NOT touched. BT devices preserved. Press any key. ====
pause >nul
