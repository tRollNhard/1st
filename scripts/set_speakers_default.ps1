$ErrorActionPreference = 'Continue'

# Speakers (Realtek) GUID confirmed: {7390bb38-649b-4a24-b81a-2c0a42d8e7df}
$speakersGuid     = '{7390bb38-649b-4a24-b81a-2c0a42d8e7df}'
$speakersDeviceId = '{0.0.0.00000000}.' + $speakersGuid

# Check if any non-Realtek render endpoint is currently Active (DeviceState=1).
# If one is, the user is intentionally using it (BT headset, HDMI, etc.) - leave it alone.
$renderBase = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Render'
$activeBtOrOther = Get-ChildItem $renderBase | Where-Object {
    $guid  = $_.PSChildName
    $state = $_.GetValue('DeviceState')
    if ($state -ne 1) { return $false }           # not Active
    if ($guid -eq $speakersGuid) { return $false } # that's us
    # Also skip the 2nd Realtek output jack
    $fn = (Get-ItemProperty (Join-Path $_.PSPath 'Properties') -ErrorAction SilentlyContinue).'{a45c254e-df1c-4efd-8020-67d146a850e0},2'
    $fn -notmatch 'Realtek'                        # true = a non-Realtek device is Active
}

if ($activeBtOrOther) {
    $names = $activeBtOrOther | ForEach-Object {
        (Get-ItemProperty (Join-Path $_.PSPath 'Properties') -ErrorAction SilentlyContinue).'{a45c254e-df1c-4efd-8020-67d146a850e0},2'
    }
    Write-Host ("Active non-Realtek device(s) found: {0} - leaving default alone." -f ($names -join ', ')) -ForegroundColor Cyan
    exit 0
}

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public class PolicyConfigHelper {
    [ComImport, Guid("870AF99C-171D-4F9E-AF0D-E63DF40C2BC9")]
    private class CPolicyConfigClient { }

    [ComImport, Guid("F8679F50-850A-41CF-9C72-430F290290C8"),
     InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IPolicyConfig {
        int GetMixFormat(string pwstrDevice, IntPtr ppFormat);
        int GetDeviceFormat(string pwstrDevice, bool bDefault, IntPtr ppFormat);
        int ResetDeviceFormat(string pwstrDevice);
        int SetDeviceFormat(string pwstrDevice, IntPtr pEndpointFormat, IntPtr pMixFormat);
        int GetProcessingPeriod(string pwstrDevice, bool bDefault, IntPtr pDefaultPeriod, IntPtr pMinPeriod);
        int SetProcessingPeriod(string pwstrDevice, IntPtr pPeriod);
        int GetShareMode(string pwstrDevice, IntPtr pMode);
        int SetShareMode(string pwstrDevice, IntPtr pMode);
        int GetPropertyValue(string pwstrDevice, bool bFxStore, IntPtr key, IntPtr pv);
        int SetPropertyValue(string pwstrDevice, bool bFxStore, IntPtr key, IntPtr pv);
        int SetDefaultEndpoint(string pwstrDevice, uint eRole);
        int SetEndpointVisibility(string pwstrDevice, bool bVisible);
    }

    public static void SetDefaultDevice(string deviceId) {
        var config = (IPolicyConfig)(object)(new CPolicyConfigClient());
        config.SetDefaultEndpoint(deviceId, 0);
        config.SetDefaultEndpoint(deviceId, 1);
        config.SetDefaultEndpoint(deviceId, 2);
    }
}
'@ -Language CSharp

Write-Host "No active BT/other device - restoring Speakers (Realtek) as default." -ForegroundColor Yellow
[PolicyConfigHelper]::SetDefaultDevice($speakersDeviceId)
Write-Host "Done." -ForegroundColor Green
