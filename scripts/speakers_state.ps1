Write-Host '=== All render endpoints DeviceState ==='
$base = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Render'
Get-ChildItem $base | ForEach-Object {
    $props = $_.PSPath + '\Properties'
    $fn = (Get-ItemProperty $props -ErrorAction SilentlyContinue).'{a45c254e-df1c-4efd-8020-67d146a850e0},2'
    $dn = (Get-ItemProperty $props -ErrorAction SilentlyContinue).'{b3f8fa53-0004-438e-9003-51a46e139bfc},6'
    $state = $_.GetValue('DeviceState')
    $stateStr = switch ($state) { 1 {'Active'} 2 {'Disabled'} 4 {'NotPresent'} 8 {'Unplugged'} default {"Unknown($state)"} }
    Write-Host "  [$stateStr] $fn ($dn) -- $($_.PSChildName)"
}

Write-Host ''
Write-Host '=== Default console/multimedia/comms device ==='
# The default device is stored in the endpoint's role keys
$base2 = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Render'
Get-ChildItem $base2 | ForEach-Object {
    $rolePath = $_.PSPath
    $softPath = $_.PSPath + '\FxProperties'
    $fn = (Get-ItemProperty ($_.PSPath + '\Properties') -ErrorAction SilentlyContinue).'{a45c254e-df1c-4efd-8020-67d146a850e0},2'
    # Role key {2f3593da-9c7a-45e1-8a8c-68da5e0ef6b8},0 = default role flag
    $roleVal = (Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue).'{2f3593da-9c7a-45e1-8a8c-68da5e0ef6b8},0'
    if ($roleVal) {
        Write-Host "  ROLE: $fn = $roleVal"
    }
}

Write-Host ''
Write-Host '=== Windows Sound output device (via COM / SndVol preference) ==='
$pref = Get-ItemProperty 'HKCU:\SOFTWARE\Microsoft\Multimedia\Audio\DeviceCmds' -ErrorAction SilentlyContinue
if ($pref) { $pref | Format-List * }
else { Write-Host '  (no DeviceCmds key)' }

Write-Host ''
Write-Host '=== Speakers endpoint DisableEnhancements ==='
$spkGuid = '{7390bb38-649b-4a24-b81a-2c0a42d8e7df}'
$fxPath = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Render\$spkGuid\FxProperties"
if (Test-Path $fxPath) {
    Get-ItemProperty $fxPath | Select-Object -Property * | Format-List
} else {
    Write-Host "  No FxProperties key"
}
