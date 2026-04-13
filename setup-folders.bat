@echo off
REM =============================================
REM  SD CARD FOLDER SETUP — D: Drive
REM  Run this once to create all app folders
REM =============================================

set DRIVE=D:

echo Creating folder structure on %DRIVE%...
echo.

mkdir "%DRIVE%\PortableApps\Platform"
mkdir "%DRIVE%\PortableApps\Standalone"
mkdir "%DRIVE%\Browsers"
mkdir "%DRIVE%\MediaPlayers"
mkdir "%DRIVE%\DevTools\VSCode-Portable"
mkdir "%DRIVE%\DevTools\NotepadPP"
mkdir "%DRIVE%\DevTools\NodeJS"
mkdir "%DRIVE%\DevTools\Python"
mkdir "%DRIVE%\DevTools\Git"
mkdir "%DRIVE%\Emulators\RetroArch"
mkdir "%DRIVE%\Emulators\Dolphin"
mkdir "%DRIVE%\Emulators\PCSX2"
mkdir "%DRIVE%\Games\ROMs\SNES"
mkdir "%DRIVE%\Games\ROMs\GBA"
mkdir "%DRIVE%\Games\ROMs\N64"
mkdir "%DRIVE%\Games\ROMs\PS2"
mkdir "%DRIVE%\AppData"
mkdir "%DRIVE%\Launchers"

echo.
echo Done! Folder structure created on %DRIVE%
echo.
echo Next steps:
echo   1. Copy launch-menu.bat and launch-menu.ps1 to %DRIVE%\Launchers\
echo   2. Install portable apps into their matching folders
echo   3. Double-click %DRIVE%\Launchers\launch-menu.bat to launch apps
echo.
pause
