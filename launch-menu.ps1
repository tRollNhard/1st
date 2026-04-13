# =============================================
#  SD CARD APP LAUNCHER (PowerShell) — D: Drive
#  Right-click -> "Run with PowerShell" to start
# =============================================

$Drive = "D:"

$Apps = @{
    "1" = "$Drive\Browsers\FirefoxPortable\FirefoxPortable.exe"
    "2" = "$Drive\Browsers\GoogleChromePortable\GoogleChromePortable.exe"
    "3" = "$Drive\MediaPlayers\VLCPortable\VLCPortable.exe"
    "4" = "$Drive\DevTools\VSCode-Portable\Code.exe"
    "5" = "$Drive\DevTools\NotepadPP\NotepadPPPortable.exe"
    "6" = "$Drive\Emulators\RetroArch\retroarch.exe"
    "7" = "$Drive\Emulators\Dolphin\Dolphin.exe"
    "8" = "$Drive\Emulators\PCSX2\pcsx2-qt.exe"
}

function Show-Menu {
    Clear-Host
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host "      SD CARD APP LAUNCHER  (D: Drive)" -ForegroundColor White
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  BROWSERS" -ForegroundColor Yellow
    Write-Host "    [1] Firefox"
    Write-Host "    [2] Chrome"
    Write-Host ""
    Write-Host "  MEDIA PLAYERS" -ForegroundColor Yellow
    Write-Host "    [3] VLC Media Player"
    Write-Host ""
    Write-Host "  DEV TOOLS" -ForegroundColor Yellow
    Write-Host "    [4] VS Code"
    Write-Host "    [5] Notepad++"
    Write-Host ""
    Write-Host "  EMULATORS" -ForegroundColor Yellow
    Write-Host "    [6] RetroArch"
    Write-Host "    [7] Dolphin (GameCube/Wii)"
    Write-Host "    [8] PCSX2 (PlayStation 2)"
    Write-Host ""
    Write-Host "  OTHER" -ForegroundColor Yellow
    Write-Host "    [9] Open SD Card in File Explorer"
    Write-Host "    [0] Exit"
    Write-Host ""
    Write-Host "================================================" -ForegroundColor Cyan
}

do {
    Show-Menu
    $Choice = Read-Host "Pick a number and press Enter"

    if ($Choice -eq "0") {
        Write-Host "Goodbye!" -ForegroundColor Green
        break
    }
    elseif ($Choice -eq "9") {
        Start-Process explorer $Drive
    }
    elseif ($Apps.ContainsKey($Choice)) {
        $AppPath = $Apps[$Choice]
        if (Test-Path $AppPath) {
            Start-Process $AppPath
            Write-Host "Launching..." -ForegroundColor Green
        }
        else {
            Write-Host "Not found: $AppPath" -ForegroundColor Red
            Write-Host "Check that the app is installed in the right folder." -ForegroundColor Yellow
        }
    }
    else {
        Write-Host "Invalid choice. Try again." -ForegroundColor Red
    }

    Start-Sleep -Seconds 1
} while ($true)
