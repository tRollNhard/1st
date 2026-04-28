$ErrorActionPreference = 'SilentlyContinue'

Write-Host "==== Realtek driver info ===="
$realtek = Get-PnpDevice -Class MEDIA | Where-Object { $_.InstanceId -like '*VEN_10EC*DEV_0269*' } | Select-Object -First 1
if ($realtek) {
    Get-PnpDeviceProperty -InstanceId $realtek.InstanceId -KeyName DEVPKEY_Device_DriverVersion,DEVPKEY_Device_DriverDate,DEVPKEY_Device_DriverProvider |
        Format-Table KeyName,Data -AutoSize -Wrap
}

Write-Host "`n==== Per-app microphone consent (Store apps) ===="
$p = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone'
if (Test-Path $p) {
    Get-ChildItem $p | ForEach-Object {
        $val = (Get-ItemProperty $_.PSPath -Name Value).Value
        [pscustomobject]@{ App = $_.PSChildName; Mic = $val }
    } | Format-Table -AutoSize
}

Write-Host "`n==== Per-app microphone consent (Desktop apps) ===="
$p2 = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone\NonPackaged'
if (Test-Path $p2) {
    Get-ChildItem $p2 | ForEach-Object {
        $val = (Get-ItemProperty $_.PSPath -Name Value).Value
        [pscustomobject]@{ App = ($_.PSChildName -replace '#','\'); Mic = $val }
    } | Format-Table -AutoSize -Wrap
}

Write-Host "`n==== Global mic privacy toggles ===="
$priv = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone'
if (Test-Path $priv) { (Get-ItemProperty $priv).Value | Write-Host }
$priv2 = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\DeviceAccess\Global\{2EEF81BE-33FA-4800-9670-1CD474972C3F}'
if (Test-Path $priv2) { "CU global: " + (Get-ItemProperty $priv2).Value | Write-Host }

Write-Host "`n==== Any devices with a problem code ===="
Get-PnpDevice | Where-Object { $_.Problem -ne 0 -and $_.Problem -ne $null } |
    Select-Object Status,Class,FriendlyName,Problem,ProblemDescription |
    Format-Table -AutoSize -Wrap

Write-Host "`n==== Stale/unknown audio endpoints ===="
Get-PnpDevice -Class AudioEndpoint | Where-Object { $_.Status -ne 'OK' } |
    Select-Object Status,FriendlyName,InstanceId |
    Format-Table -AutoSize -Wrap
