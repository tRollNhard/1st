$ErrorActionPreference = 'Continue'
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Write-Host ("Elevated: {0}" -f $isAdmin) -ForegroundColor Cyan

# ---------- 1. Grant mic access to desktop apps ----------
Write-Host "`n[1/3] Granting microphone consent to desktop apps..." -ForegroundColor Yellow

$globalKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone'
New-Item -Path $globalKey -Force | Out-Null
Set-ItemProperty -Path $globalKey -Name 'Value' -Value 'Allow' -Type String
Write-Host "  Master 'desktop apps access mic' = Allow"

$nonPkg = Join-Path $globalKey 'NonPackaged'
New-Item -Path $nonPkg -Force | Out-Null

# Flip anything already present that isn't Allow
Get-ChildItem $nonPkg | ForEach-Object {
    $cur = (Get-ItemProperty $_.PSPath -Name Value -ErrorAction SilentlyContinue).Value
    $name = $_.PSChildName -replace '#','\'
    if ($cur -ne 'Allow') {
        try {
            Set-ItemProperty $_.PSPath -Name Value -Value 'Allow' -Type String -ErrorAction Stop
            Write-Host ("  Allowed: {0}" -f $name)
        } catch {
            Write-Host ("  FAILED: {0} ({1})" -f $name, $_.Exception.Message) -ForegroundColor Red
        }
    } else {
        Write-Host ("  Already Allow: {0}" -f $name) -ForegroundColor DarkGray
    }
}

# Pre-seed Allow for common mic apps (user told us these mattered)
$preSeed = @(
    'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    'C:\Program Files\Google\Chrome\Application\chrome.exe',
    "C:\Users\$env:USERNAME\AppData\Local\CapCut\Apps\8.1.1.3417\CapCut.exe",
    'C:\Windows\System32\VoiceAccess.exe',
    'C:\Windows\System32\rundll32.exe',
    'C:\Windows\SysWOW64\rundll32.exe'
)
# Pull exe paths from Uninstall registry (fast - no disk walk)
$uninstallRoots = @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall',
    'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall'
)
$wantMatch = 'chrome|edge|discord|zoom|teams|obs|slack|vlc|audacity|skype|webex|telegram|capcut|firefox|spotify|whatsapp'
foreach ($r in $uninstallRoots) {
    if (-not (Test-Path $r)) { continue }
    Get-ChildItem $r -ErrorAction SilentlyContinue | ForEach-Object {
        $props = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
        $disp = $props.DisplayName
        $loc  = $props.InstallLocation
        $icon = $props.DisplayIcon
        if ($disp -and ($disp -match $wantMatch) -and $icon -and ($icon -match '\.exe')) {
            $exe = ($icon -split ',')[0].Trim('"')
            if (Test-Path $exe) { $preSeed += $exe }
        }
    }
}
# Known fixed-path binaries
$preSeed += @(
    'C:\Windows\System32\svchost.exe',
    'C:\Windows\System32\WWAHost.exe'
)
$preSeed = $preSeed | Sort-Object -Unique

foreach ($exe in $preSeed) {
    $keyName = $exe -replace '\\','#'
    $keyPath = Join-Path $nonPkg $keyName
    New-Item -Path $keyPath -Force | Out-Null
    Set-ItemProperty -Path $keyPath -Name Value -Value 'Allow' -Type String
    # The LastUsedTimeStart/Stop values keep Windows from resetting consent later
    $ts = [BitConverter]::GetBytes((Get-Date).ToFileTime())
    Set-ItemProperty -Path $keyPath -Name LastUsedTimeStart -Value $ts -Type Binary -ErrorAction SilentlyContinue
    Set-ItemProperty -Path $keyPath -Name LastUsedTimeStop  -Value $ts -Type Binary -ErrorAction SilentlyContinue
    Write-Host ("  Seeded Allow: {0}" -f $exe)
}

Get-ChildItem $globalKey | Where-Object { $_.PSChildName -ne 'NonPackaged' } | ForEach-Object {
    $cur = (Get-ItemProperty $_.PSPath -Name Value -ErrorAction SilentlyContinue).Value
    if ([string]::IsNullOrEmpty($cur)) {
        Set-ItemProperty $_.PSPath -Name Value -Value 'Allow' -Type String
        Write-Host ("  Allowed (store): {0}" -f $_.PSChildName)
    }
}

# ---------- 2. Remove BLE HID devices stuck in failed-start (unrelated to Vizio) ----------
Write-Host "`n[2/3] Cleaning failed-start Bluetooth HID devices..." -ForegroundColor Yellow
Write-Host "  (Vizio devices are intentionally skipped.)" -ForegroundColor DarkGray
if ($isAdmin) {
    $bad = Get-PnpDevice | Where-Object {
        ($_.Problem -eq 10 -or $_.ProblemDescription -eq 'CM_PROB_FAILED_START') -and
        ($_.FriendlyName -notmatch 'Vizio|VIZIO')
    }
    if (-not $bad) { Write-Host "  Nothing to clean." }
    foreach ($d in $bad) {
        Write-Host ("  Removing: {0}" -f $d.FriendlyName)
        pnputil /remove-device "$($d.InstanceId)" /force 2>&1 | ForEach-Object { "    $_" | Write-Host }
    }
} else {
    Write-Host "  SKIPPED - needs admin. Use RUN_AS_ADMIN.bat." -ForegroundColor Red
}

# ---------- 3. Restart audio stack ----------
Write-Host "`n[3/3] Restarting audio services..." -ForegroundColor Yellow
if ($isAdmin) {
    Restart-Service -Name AudioEndpointBuilder -Force
    Start-Sleep -Seconds 1
    Restart-Service -Name Audiosrv -Force
    Write-Host "  Done."
} else {
    Write-Host "  SKIPPED - needs admin. Use RUN_AS_ADMIN.bat." -ForegroundColor Red
}

Write-Host "`nFinished. Test speakers and mic." -ForegroundColor Green
Write-Host "If speakers still act up, right-click volume icon -> Sound settings -> make sure 'Speakers (Realtek(R) Audio)' is the default output (not a Bluetooth device)." -ForegroundColor Green
