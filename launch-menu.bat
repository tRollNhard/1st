@echo off
REM =============================================
REM  SD CARD APP LAUNCHER — D: Drive
REM  Double-click to launch apps from your SD card
REM =============================================

set DRIVE=D:

title SD Card App Launcher — D:
color 1F

:MENU
cls
echo ================================================
echo        SD CARD APP LAUNCHER  ^(D: Drive^)
echo ================================================
echo.
echo   BROWSERS
echo     [1] Firefox
echo     [2] Chrome
echo.
echo   MEDIA PLAYERS
echo     [3] VLC Media Player
echo.
echo   DEV TOOLS
echo     [4] VS Code
echo     [5] Notepad++
echo.
echo   EMULATORS
echo     [6] RetroArch
echo     [7] Dolphin  (GameCube/Wii)
echo     [8] PCSX2    (PlayStation 2)
echo.
echo   OTHER
echo     [9] Open SD Card in File Explorer
echo     [0] Exit
echo.
echo ================================================

set /p CHOICE="Pick a number and press Enter: "

if "%CHOICE%"=="1" start "" "%DRIVE%\Browsers\FirefoxPortable\FirefoxPortable.exe"
if "%CHOICE%"=="2" start "" "%DRIVE%\Browsers\GoogleChromePortable\GoogleChromePortable.exe"
if "%CHOICE%"=="3" start "" "%DRIVE%\MediaPlayers\VLCPortable\VLCPortable.exe"
if "%CHOICE%"=="4" start "" "%DRIVE%\DevTools\VSCode-Portable\Code.exe"
if "%CHOICE%"=="5" start "" "%DRIVE%\DevTools\NotepadPP\NotepadPPPortable.exe"
if "%CHOICE%"=="6" start "" "%DRIVE%\Emulators\RetroArch\retroarch.exe"
if "%CHOICE%"=="7" start "" "%DRIVE%\Emulators\Dolphin\Dolphin.exe"
if "%CHOICE%"=="8" start "" "%DRIVE%\Emulators\PCSX2\pcsx2-qt.exe"
if "%CHOICE%"=="9" explorer "%DRIVE%\"
if "%CHOICE%"=="0" exit

goto MENU
