$ErrorActionPreference = 'Continue'
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Write-Host "Needs admin. Use RUN_AS_ADMIN.bat." -ForegroundColor Red; exit 1 }

$speakersGuid     = '{7390bb38-649b-4a24-b81a-2c0a42d8e7df}'
$speakersDeviceId = '{0.0.0.00000000}.' + $speakersGuid
$fxPath           = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Render\$speakersGuid\FxProperties"

# --- 1. Nuke ALL Realtek APO chain entries from Speakers FxProperties ---
# These key GUIDs register APO DLLs into audiodg.exe. Leftover indices cause silent render failure.
Write-Host "`n[1/4] Clearing ALL Realtek APO entries from Speakers FxProperties..." -ForegroundColor Yellow

$apoGuids = @(
    '{d04e05a6-594b-4fb6-a80d-01af5eed7d1d}',  # StreamEffect
    '{d3993a3f-99c2-4402-b5ec-a92a0367664b}',  # ModeEffect
    '{62dc1a93-ae24-464c-a43e-452f824c4250}',  # EndpointEffect
    '{9c119480-ddc2-4954-a150-5bd240d454ad}'   # Realtek misc APO
)

if (Test-Path $fxPath) {
    $props = Get-ItemProperty $fxPath
    $props.PSObject.Properties | Where-Object {
        $name = $_.Name
        $apoGuids | Where-Object { $name -like "$_*" }
    } | ForEach-Object {
        Remove-ItemProperty -Path $fxPath -Name $_.Name -ErrorAction SilentlyContinue
        Write-Host ("  Removed: {0}" -f $_.Name)
    }
    # Lock out re-enablement
    Set-ItemProperty -Path $fxPath -Name '{e0a941a1-c5a7-4be0-9e2d-2a1b2f3a4d5c},3' -Value 1 -Type DWord -ErrorAction SilentlyContinue
    Write-Host "  APO chain cleared."
} else {
    Write-Host "  FxProperties key not found  -  skipping." -ForegroundColor DarkGray
}

# Also set DisableEnhancements at endpoint root level
$epRoot = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Render\$speakersGuid"
Set-ItemProperty -Path $epRoot -Name 'DisableEnhancements' -Value 1 -Type DWord -ErrorAction SilentlyContinue
Write-Host "  DisableEnhancements=1 confirmed."

# --- 2. Restart audio services so audiodg.exe picks up the clean APO state ---
Write-Host "`n[2/4] Restarting audio services..." -ForegroundColor Yellow
Stop-Service -Name AudioEndpointBuilder -Force -ErrorAction SilentlyContinue
Stop-Service -Name Audiosrv -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Start-Service -Name AudioEndpointBuilder -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
Start-Service -Name Audiosrv -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Write-Host "  Audio services restarted."

# --- 3. Set Speakers as default via PolicyConfig COM ---
Write-Host "`n[3/4] Setting Speakers (Realtek) as default output..." -ForegroundColor Yellow

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public class PolicyCfg {
    [ComImport, Guid("870AF99C-171D-4F9E-AF0D-E63DF40C2BC9")]
    private class CPolicyConfigClient {}

    [ComImport, Guid("F8679F50-850A-41CF-9C72-430F290290C8"),
     InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IPolicyConfig {
        int GetMixFormat(string d, IntPtr p);
        int GetDeviceFormat(string d, bool b, IntPtr p);
        int ResetDeviceFormat(string d);
        int SetDeviceFormat(string d, IntPtr e, IntPtr m);
        int GetProcessingPeriod(string d, bool b, IntPtr dp, IntPtr mp);
        int SetProcessingPeriod(string d, IntPtr p);
        int GetShareMode(string d, IntPtr m);
        int SetShareMode(string d, IntPtr m);
        int GetPropertyValue(string d, bool b, IntPtr k, IntPtr v);
        int SetPropertyValue(string d, bool b, IntPtr k, IntPtr v);
        int SetDefaultEndpoint(string d, uint r);
        int SetEndpointVisibility(string d, bool v);
    }

    public static void SetDefault(string deviceId) {
        var c = (IPolicyConfig)(object)(new CPolicyConfigClient());
        c.SetDefaultEndpoint(deviceId, 0);
        c.SetDefaultEndpoint(deviceId, 1);
        c.SetDefaultEndpoint(deviceId, 2);
    }
}

public class MMAudio {
    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    private class MMDeviceEnumerator {}

    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"),
     InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDeviceEnumerator {
        int EnumAudioEndpoints(int flow, int mask, out IntPtr ppDevices);
        int GetDefaultAudioEndpoint(int flow, int role, out IntPtr ppEndpoint);
        int GetDevice(string id, out IntPtr ppDevice);
        int RegisterEndpointNotificationCallback(IntPtr pClient);
        int UnregisterEndpointNotificationCallback(IntPtr pClient);
    }

    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"),
     InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDevice {
        int Activate(ref Guid iid, int ctx, IntPtr pParams, out IntPtr ppIface);
        int OpenPropertyStore(int access, out IntPtr ppProps);
        int GetId(out string ppstrId);
        int GetState(out int pdwState);
    }

    public static string GetDefaultRenderDeviceId(int role) {
        try {
            var e = (IMMDeviceEnumerator)(object)(new MMDeviceEnumerator());
            IntPtr ppDev;
            int hr = e.GetDefaultAudioEndpoint(0, role, out ppDev);
            if (hr != 0) return "NONE (hr=0x" + hr.ToString("X8") + ")";
            var dev = (IMMDevice)System.Runtime.InteropServices.Marshal.GetObjectForIUnknown(ppDev);
            string id; dev.GetId(out id);
            System.Runtime.InteropServices.Marshal.ReleaseComObject(dev);
            System.Runtime.InteropServices.Marshal.Release(ppDev);
            return id;
        } catch (Exception ex) { return "ERROR: " + ex.Message; }
    }
}
'@ -Language CSharp

[PolicyCfg]::SetDefault($speakersDeviceId)
Write-Host "  SetDefaultEndpoint called."

# --- 4. Verify via IMMDeviceEnumerator ---
Write-Host "`n[4/4] Verifying default device via IMMDeviceEnumerator..." -ForegroundColor Yellow
$console = [MMAudio]::GetDefaultRenderDeviceId(0)
$multi   = [MMAudio]::GetDefaultRenderDeviceId(1)
$comms   = [MMAudio]::GetDefaultRenderDeviceId(2)
Write-Host ("  Console       : {0}" -f $console)
Write-Host ("  Multimedia    : {0}" -f $multi)
Write-Host ("  Communications: {0}" -f $comms)

$speakersId = '{0.0.0.00000000}.' + $speakersGuid
if ($console -like "*$speakersGuid*") {
    Write-Host "`nSUCCESS - Speakers confirmed as default. Test audio now." -ForegroundColor Green
} else {
    Write-Host "`nWARNING  -  Default not showing Speakers GUID. May need a reboot." -ForegroundColor Red
    Write-Host "Try: right-click volume icon ??? Sound settings ??? set Speakers (Realtek) as default." -ForegroundColor Yellow
}
