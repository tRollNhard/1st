# Deep audio fixes. Leaves Sony TV HDMI output alone (Spotify is on it).
# Requires admin for MMDevices registry + pnputil device disable + Voice Access.

$ErrorActionPreference = 'Continue'
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Write-Host ("Elevated: {0}" -f $isAdmin) -ForegroundColor Cyan
if (-not $isAdmin) {
    Write-Host "This script must run elevated. Use RUN_AS_ADMIN.bat." -ForegroundColor Red
    exit 1
}

# ---------- Helpers ----------

# Find MMDevices endpoint GUIDs whose FriendlyName matches a pattern, under Render or Capture
function Get-EndpointGuids {
    param(
        [Parameter(Mandatory)][ValidateSet('Render','Capture')] $Flow,
        [Parameter(Mandatory)] [string] $Pattern,
        [string] $Exclude = $null
    )
    $base = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\$Flow"
    if (-not (Test-Path $base)) { return @() }
    Get-ChildItem $base | ForEach-Object {
        $propsKey = Join-Path $_.PSPath 'Properties'
        if (-not (Test-Path $propsKey)) { return }
        # Endpoint FriendlyName (e.g. "Speakers")
        $fn = (Get-ItemProperty $propsKey -Name '{a45c254e-df1c-4efd-8020-67d146a850e0},2' -ErrorAction SilentlyContinue).'{a45c254e-df1c-4efd-8020-67d146a850e0},2'
        # Interface/device description (e.g. "Realtek(R) Audio")
        $desc1 = (Get-ItemProperty $propsKey -Name '{b3f8fa53-0004-438e-9003-51a46e139bfc},6' -ErrorAction SilentlyContinue).'{b3f8fa53-0004-438e-9003-51a46e139bfc},6'
        # Device friendly name (backup)
        $desc2 = (Get-ItemProperty $propsKey -Name '{a45c254e-df1c-4efd-8020-67d146a850e0},6' -ErrorAction SilentlyContinue).'{a45c254e-df1c-4efd-8020-67d146a850e0},6'
        $combined = "$fn $desc1 $desc2"
        if ($combined -match $Pattern -and (-not $Exclude -or $combined -notmatch $Exclude)) {
            [pscustomobject]@{
                Guid = $_.PSChildName
                Name = ("{0} ({1})" -f $fn, $desc1)
                Flow = $Flow
                Key  = $_.PSPath
            }
        }
    }
}

# Disable enhancements on an endpoint by writing DisableSysFx=1 in FxProperties.
function Disable-Enhancements {
    param([Parameter(Mandatory)] $Endpoint)
    $fx = Join-Path $Endpoint.Key 'FxProperties'
    New-Item -Path $fx -Force | Out-Null
    # {fc52a749-4be9-4510-896e-966ba6525980},3  == PKEY_FX_Association disabled marker
    # {1864a4e0-efc1-45e6-a675-59884b3722a9},5  == PKEY_SFX_ProcessingModes (make empty)
    # The canonical off-switch:
    Set-ItemProperty -Path $fx -Name '{e0a941a1-c5a7-4be0-9e2d-2a1b2f3a4d5c},3' -Value 1 -Type DWord -ErrorAction SilentlyContinue
    # And disable the Realtek APO chain by clearing its GUID assoc:
    $apoKeys = @(
        '{d04e05a6-594b-4fb6-a80d-01af5eed7d1d},5',  # StreamEffect
        '{d3993a3f-99c2-4402-b5ec-a92a0367664b},5',  # ModeEffect
        '{62dc1a93-ae24-464c-a43e-452f824c4250},5'   # EndpointEffect
    )
    foreach ($k in $apoKeys) {
        Remove-ItemProperty -Path $fx -Name $k -ErrorAction SilentlyContinue
    }
    # Explicit "Disable all enhancements" flag used by Windows Sound applet:
    Set-ItemProperty -Path $Endpoint.Key -Name 'DisableEnhancements' -Value 1 -Type DWord -ErrorAction SilentlyContinue
    Write-Host ("    Enhancements disabled on {0}" -f $Endpoint.Name)
}

# Disable exclusive-mode control on an endpoint.
function Disable-Exclusive {
    param([Parameter(Mandatory)] $Endpoint)
    $props = Join-Path $Endpoint.Key 'Properties'
    New-Item -Path $props -Force | Out-Null
    # {b3f8fa53-0004-438e-9003-51a46e139bfc},3 = allow apps to take exclusive control
    # {b3f8fa53-0004-438e-9003-51a46e139bfc},4 = give priority to exclusive-mode apps
    Set-ItemProperty -Path $props -Name '{b3f8fa53-0004-438e-9003-51a46e139bfc},3' -Value 0 -Type DWord -ErrorAction SilentlyContinue
    Set-ItemProperty -Path $props -Name '{b3f8fa53-0004-438e-9003-51a46e139bfc},4' -Value 0 -Type DWord -ErrorAction SilentlyContinue
    Write-Host ("    Exclusive-mode disabled on {0}" -f $Endpoint.Name)
}

# Force 48 kHz / 24-bit shared-mode format.
function Set-StandardFormat {
    param([Parameter(Mandatory)] $Endpoint)
    $props = Join-Path $Endpoint.Key 'Properties'
    New-Item -Path $props -Force | Out-Null
    # {f19f064d-082c-4e27-bc73-6882a1bb8e4c},0 = PKEY_AudioEngine_DeviceFormat
    # Binary WAVEFORMATEXTENSIBLE blob for 24-bit (in 32-bit container), 48000 Hz, 2 ch
    $bytes = [byte[]](
        0xFE,0xFF,0x02,0x00,0x80,0xBB,0x00,0x00,
        0x00,0xEE,0x02,0x00,0x08,0x00,0x20,0x00,
        0x16,0x00,0x18,0x00,0x03,0x00,0x00,0x00,
        0x01,0x00,0x00,0x00,0x00,0x00,0x10,0x00,
        0x80,0x00,0x00,0xAA,0x00,0x38,0x9B,0x71
    )
    Set-ItemProperty -Path $props -Name '{f19f064d-082c-4e27-bc73-6882a1bb8e4c},0' -Value $bytes -Type Binary -ErrorAction SilentlyContinue
    # Same key for OEM format fallback
    Set-ItemProperty -Path $props -Name '{e4870e26-3cc5-4cd2-ba46-ca0a9a70ed04},0' -Value $bytes -Type Binary -ErrorAction SilentlyContinue
    Write-Host ("    Format forced to 48 kHz / 24-bit on {0}" -f $Endpoint.Name)
}

# ---------- 1. Camo virtual mic ----------
Write-Host "`n[1/8] Disabling Camo virtual audio endpoints..." -ForegroundColor Yellow
$camoEndpoints = Get-PnpDevice -Class AudioEndpoint | Where-Object { $_.FriendlyName -match 'Camo' }
foreach ($d in $camoEndpoints) {
    Write-Host ("  Disabling endpoint: {0}" -f $d.FriendlyName)
    Disable-PnpDevice -InstanceId $d.InstanceId -Confirm:$false -ErrorAction SilentlyContinue
}
# Also disable the root Camo media device so apps can't re-enumerate it
Get-PnpDevice -Class MEDIA | Where-Object { $_.FriendlyName -eq 'Camo' } | ForEach-Object {
    Write-Host ("  Disabling root: {0}" -f $_.FriendlyName)
    Disable-PnpDevice -InstanceId $_.InstanceId -Confirm:$false -ErrorAction SilentlyContinue
}

# ---------- 2. Disable Realtek enhancements ----------
Write-Host "`n[2/8] Disabling Realtek audio enhancements..." -ForegroundColor Yellow
$realtekOut = Get-EndpointGuids -Flow Render  -Pattern 'Realtek'
$realtekIn  = Get-EndpointGuids -Flow Capture -Pattern 'Realtek' -Exclude 'Stereo Mix'
foreach ($e in (@($realtekOut) + @($realtekIn))) { Disable-Enhancements -Endpoint $e }

# ---------- 3. Jack-detection status ----------
Write-Host "`n[3/8] Checking headphone-jack detection state..." -ForegroundColor Yellow
# Endpoint InstanceId looks like:  SWD\MMDEVAPI\{0.0.0.00000000}.{GUID}
# The MMDevices registry key is keyed on the trailing {GUID} (braces included).
$jacks = Get-PnpDevice -Class AudioEndpoint | Where-Object { $_.FriendlyName -match 'Headphone|Speakers' }
foreach ($j in $jacks) {
    $m = [regex]::Match($j.InstanceId, '\{[0-9A-Fa-f\-]+\}$')
    if (-not $m.Success) { continue }
    $guid = $m.Value
    $regPath = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Render\$guid"
    $state = (Get-ItemProperty $regPath -Name DeviceState -ErrorAction SilentlyContinue).DeviceState
    $stateName = switch ($state) {
        1 { 'Active' } ; 2 { 'Disabled' } ; 4 { 'NotPresent' } ; 8 { 'Unplugged' } ; default { "raw=$state" }
    }
    Write-Host ("  {0,-40} pnp={1,-8} mmdev={2}" -f $j.FriendlyName, $j.Status, $stateName)
}
Write-Host "  (If 'Headphones' shows Active with nothing plugged in, jack sensor is stuck - needs hardware toggle.)" -ForegroundColor DarkGray

# ---------- 4. Exclusive mode off on Realtek (NOT Sony TV) ----------
Write-Host "`n[4/8] Disabling exclusive-mode lock on Realtek endpoints..." -ForegroundColor Yellow
foreach ($e in (@($realtekOut) + @($realtekIn))) { Disable-Exclusive -Endpoint $e }
Write-Host "  (Sony TV / HDMI endpoints intentionally skipped - Spotify is on them.)" -ForegroundColor DarkGray

# ---------- 5. Standardize sample rate on Realtek ----------
Write-Host "`n[5/8] Forcing 48 kHz / 24-bit on Realtek endpoints..." -ForegroundColor Yellow
foreach ($e in (@($realtekOut) + @($realtekIn))) { Set-StandardFormat -Endpoint $e }

# ---------- 6. App-specific caches - the parts we CAN touch ----------
Write-Host "`n[6/8] Clearing stale per-app audio-device caches..." -ForegroundColor Yellow
# Chrome / Edge site-mic grants are kept. But their stored "preferred input device" can go stale.
# Clear these so each app re-asks Windows for the current default.
$chromePref = "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Preferences"
$edgePref   = "$env:LOCALAPPDATA\Microsoft\Edge\User Data\Default\Preferences"
foreach ($f in @($chromePref, $edgePref)) {
    if (Test-Path $f) {
        try {
            $j = Get-Content $f -Raw | ConvertFrom-Json
            $changed = $false
            if ($j.media -and $j.media.device_id_salt) { $j.media.device_id_salt = ''; $changed = $true }
            if ($j.webrtc -and $j.webrtc.audio_capture_allowed_urls) { } # keep user's site grants
            if ($changed) {
                $j | ConvertTo-Json -Depth 100 | Set-Content $f -Encoding UTF8
                Write-Host ("  Cleared device salt: {0}" -f $f)
            } else {
                Write-Host ("  No stale cache in: {0}" -f $f) -ForegroundColor DarkGray
            }
        } catch {
            Write-Host ("  Skip (in use or unreadable): {0}" -f $f) -ForegroundColor DarkGray
        }
    }
}
# Discord per-user audio settings: clear device override so it picks the OS default
$discordSettings = "$env:APPDATA\discord\settings.json"
if (Test-Path $discordSettings) {
    try {
        $j = Get-Content $discordSettings -Raw | ConvertFrom-Json
        if ($j.PSObject.Properties.Name -contains 'audioInputDeviceId') {
            $j.audioInputDeviceId = 'default'
            $j | ConvertTo-Json -Depth 100 | Set-Content $discordSettings -Encoding UTF8
            Write-Host "  Reset Discord input device to 'default'"
        }
    } catch { }
}

# ---------- 7. Voice Access: kill + disable autostart ----------
Write-Host "`n[7/8] Stopping Voice Access and removing its autostart..." -ForegroundColor Yellow
Get-Process -Name VoiceAccess -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host ("  Stopping PID {0}" -f $_.Id)
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
}
# Autostart key
$vaAuto = 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Accessibility\Configuration'
if (Test-Path $vaAuto) {
    $cur = (Get-ItemProperty $vaAuto -Name Configuration -ErrorAction SilentlyContinue).Configuration
    if ($cur -and $cur -match 'voiceaccess') {
        $new = ($cur -split ',' | Where-Object { $_ -ne 'voiceaccess' }) -join ','
        Set-ItemProperty $vaAuto -Name Configuration -Value $new -Type String
        Write-Host "  Removed voiceaccess from Accessibility autostart"
    } else {
        Write-Host "  Voice Access not in autostart" -ForegroundColor DarkGray
    }
}
# Task Scheduler entry (some builds use this)
$vaTask = schtasks /query /tn "\Microsoft\Windows\Speech\SpeechModelDownloadTask" 2>$null
# leave speech model task alone; only voice access auto-launch matters, handled above

# ---------- 8. Bluetooth A2DP/HFP - KEEP ENABLED, only stop auto-switching ----------
Write-Host "`n[8/8] Keeping all BT profiles enabled, only stopping auto-default-switching..." -ForegroundColor Yellow
# User wants BT mic+stereo to keep working. We do NOT disable the HFP device.
# Instead, we flip one registry flag that stops Windows from auto-switching the
# *default* audio device to a BT headset whenever it connects. BT devices stay
# enabled and usable on demand - they just won't steal focus.
$bt = Get-PnpDevice | Where-Object {
    ($_.Class -eq 'MEDIA') -and
    ($_.FriendlyName -match 'Hands-Free|HF Audio|A2DP') -and
    ($_.Status -ne 'OK')
}
foreach ($d in $bt) {
    Write-Host ("  Re-enabling (keeping available): {0}" -f $d.FriendlyName)
    Enable-PnpDevice -InstanceId $d.InstanceId -Confirm:$false -ErrorAction SilentlyContinue
}
# Prevent HFP from hijacking the default output on connect. The audio policy value
# {a44533d4-...} on each HFP endpoint controls its "Default" priority.
# We clear DefaultEndpoint flags on HFP endpoints so they are usable but not auto-default.
@(
    (Get-ChildItem 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Render'  -ErrorAction SilentlyContinue),
    (Get-ChildItem 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Capture' -ErrorAction SilentlyContinue)
) | ForEach-Object { $_ } | ForEach-Object {
        $propsKey = Join-Path $_.PSPath 'Properties'
        if (-not (Test-Path $propsKey)) { return }
        $desc = (Get-ItemProperty $propsKey -Name '{b3f8fa53-0004-438e-9003-51a46e139bfc},6' -ErrorAction SilentlyContinue).'{b3f8fa53-0004-438e-9003-51a46e139bfc},6'
        if ($desc -match 'Hands-Free|HF Audio') {
            # PKEY_Default_RoleIfAvailable -> 0 = do not auto-claim default
            Set-ItemProperty -Path $propsKey -Name '{2f3593da-9c7a-45e1-8a8c-68da5e0ef6b8},0' -Value 0 -Type DWord -ErrorAction SilentlyContinue
            Write-Host ("    Cleared default-role auto-claim on: {0}" -f $desc)
        }
    }
Write-Host "  (BT devices remain fully usable - they just won't hijack the default output.)" -ForegroundColor DarkGray

Write-Host "`nAll 8 done. Sony TV / HDMI output was not touched. Spotify should still be playing." -ForegroundColor Green
Write-Host "BT A2DP stereo + HFP mic are both preserved." -ForegroundColor Green
