@echo off
REM Self-elevating audio fix launcher. Double-click and accept UAC.

net session >nul 2>&1
if %errorlevel% NEQ 0 (
    echo Requesting administrator privileges...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"
echo === Pass 0: make sure BT audio devices are enabled ===
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\bt_restore.ps1"
echo.
echo === Pass 1: nuke APO chain + restart audio stack + set Speakers as default ===
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\nuclear_audio_fix.ps1"
echo.
echo === Pass 2: mic consent + failed-start HID cleanup ===
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\audio_fix.ps1"
echo.
echo === Pass 3: deep fixes (Camo off, enhancements off, exclusive-mode off, 48kHz/24bit, Voice Access off) ===
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\audio_fix_deep.ps1"
echo.
echo === Pass 4: verify BT still enabled ===
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\bt_restore.ps1"
echo.
echo ==== Finished. Sony TV / Spotify NOT touched. BT devices preserved. Press any key. ====
pause >nul
