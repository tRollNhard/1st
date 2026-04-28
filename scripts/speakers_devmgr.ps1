# Check Realtek audio device in Device Manager
Write-Host '=== Realtek Audio Device Manager Status ==='
$realtekDev = Get-PnpDevice | Where-Object { $_.FriendlyName -match 'Realtek' -or $_.InstanceId -match 'VEN_10EC' }
$realtekDev | Format-Table FriendlyName, Status, Class, InstanceId -AutoSize

Write-Host ''
Write-Host '=== All MEDIA class devices ==='
Get-PnpDevice -Class MEDIA | Format-Table FriendlyName, Status, Problem, InstanceId -AutoSize

Write-Host ''
Write-Host '=== Current Default Playback Device (via COM) ==='
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

[ComImport]
[Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
    int NotImpl1();
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IntPtr ppEndpoint);
}
'@ -ErrorAction SilentlyContinue

# Simpler: use Windows.Media.Devices namespace
try {
    $type = [Windows.Media.Devices.MediaDevice, Windows.Media, ContentType=WindowsRuntime]
    Write-Host "Default render ID: $([Windows.Media.Devices.MediaDevice]::GetDefaultAudioRenderId([Windows.Media.Devices.AudioDeviceRole]::Default))"
} catch {
    Write-Host "(Windows.Media approach failed: $_)"
}

# Also check via SoundVolumeView alternative
Write-Host ''
Write-Host '=== Audio endpoint states via WMI ==='
Get-WmiObject -Class Win32_SoundDevice | Select-Object Name, Status, DeviceID, Manufacturer | Format-Table -AutoSize

Write-Host ''
Write-Host '=== Check if speakers is set as default in user policy ==='
$policyPath = 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Audio'
if (Test-Path $policyPath) {
    Get-ItemProperty $policyPath | Format-List *
} else {
    Write-Host '  No Audio policy key'
}
