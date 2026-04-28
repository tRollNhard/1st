# Read-only sanity check. No changes made. Safe to run without admin.

function Get-EndpointGuids {
    param(
        [ValidateSet('Render','Capture')] $Flow,
        [string] $Pattern,
        [string] $Exclude = $null
    )
    $base = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\$Flow"
    if (-not (Test-Path $base)) { return @() }
    Get-ChildItem $base | ForEach-Object {
        $propsKey = Join-Path $_.PSPath 'Properties'
        if (-not (Test-Path $propsKey)) { return }
        $fn = (Get-ItemProperty $propsKey -Name '{a45c254e-df1c-4efd-8020-67d146a850e0},2' -ErrorAction SilentlyContinue).'{a45c254e-df1c-4efd-8020-67d146a850e0},2'
        $desc1 = (Get-ItemProperty $propsKey -Name '{b3f8fa53-0004-438e-9003-51a46e139bfc},6' -ErrorAction SilentlyContinue).'{b3f8fa53-0004-438e-9003-51a46e139bfc},6'
        $desc2 = (Get-ItemProperty $propsKey -Name '{a45c254e-df1c-4efd-8020-67d146a850e0},6' -ErrorAction SilentlyContinue).'{a45c254e-df1c-4efd-8020-67d146a850e0},6'
        $combined = "$fn $desc1 $desc2"
        if ($combined -match $Pattern -and (-not $Exclude -or $combined -notmatch $Exclude)) {
            [pscustomobject]@{ Guid = $_.PSChildName; Name = ("{0} ({1})" -f $fn, $desc1); Flow = $Flow }
        }
    }
}

Write-Host "=== Realtek endpoints that WILL be modified ===" -ForegroundColor Yellow
$out = Get-EndpointGuids -Flow Render  -Pattern 'Realtek'
$in  = Get-EndpointGuids -Flow Capture -Pattern 'Realtek' -Exclude 'Stereo Mix'
(@($out) + @($in)) | Format-Table Flow,Name,Guid -AutoSize

Write-Host "`n=== Endpoints that will NOT be touched (sanity check) ===" -ForegroundColor Yellow
$all = @()
foreach ($f in 'Render','Capture') {
    $base = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\$f"
    Get-ChildItem $base -ErrorAction SilentlyContinue | ForEach-Object {
        $propsKey = Join-Path $_.PSPath 'Properties'
        $fn = (Get-ItemProperty $propsKey -Name '{a45c254e-df1c-4efd-8020-67d146a850e0},2' -ErrorAction SilentlyContinue).'{a45c254e-df1c-4efd-8020-67d146a850e0},2'
        $all += [pscustomobject]@{ Flow = $f; Name = $fn }
    }
}
$all | Where-Object { $_.Name -notmatch 'Realtek' -or $_.Name -match 'Stereo Mix' } |
    Sort-Object Flow,Name | Format-Table -AutoSize

Write-Host "`n=== Camo endpoints that will be disabled ===" -ForegroundColor Yellow
Get-PnpDevice -Class AudioEndpoint | Where-Object { $_.FriendlyName -match 'Camo' } |
    Select-Object Status,FriendlyName | Format-Table -AutoSize
Get-PnpDevice -Class MEDIA | Where-Object { $_.FriendlyName -eq 'Camo' } |
    Select-Object Status,FriendlyName | Format-Table -AutoSize

Write-Host "`n=== HFP Bluetooth devices that will have mic-profile disabled ===" -ForegroundColor Yellow
Get-PnpDevice -Class MEDIA | Where-Object { $_.FriendlyName -match 'Hands-Free|HF Audio' } |
    Select-Object Status,FriendlyName | Format-Table -AutoSize

Write-Host "`n=== Jack-detection readout ===" -ForegroundColor Yellow
Get-PnpDevice -Class AudioEndpoint | Where-Object { $_.FriendlyName -match 'Headphone|Speakers' } | ForEach-Object {
    $m = [regex]::Match($_.InstanceId, '\{[0-9A-Fa-f\-]+\}$')
    if ($m.Success) {
        $guid = $m.Value
        $state = (Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Render\$guid" -Name DeviceState -ErrorAction SilentlyContinue).DeviceState
        $sn = switch ($state) { 1 { 'Active' } 2 { 'Disabled' } 4 { 'NotPresent' } 8 { 'Unplugged' } default { "raw=$state" } }
        Write-Host ("  {0,-40} pnp={1,-8} mmdev={2}" -f $_.FriendlyName, $_.Status, $sn)
    }
}
