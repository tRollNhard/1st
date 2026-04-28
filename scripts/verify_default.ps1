Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public class MMAudio2 {
    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    private class MMDeviceEnumerator {}

    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"),
     InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDeviceEnumerator {
        int EnumAudioEndpoints(int flow, int mask, out IntPtr pp);
        int GetDefaultAudioEndpoint(int flow, int role, out IntPtr pp);
        int GetDevice(string id, out IntPtr pp);
        int RegisterEndpointNotificationCallback(IntPtr p);
        int UnregisterEndpointNotificationCallback(IntPtr p);
    }

    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"),
     InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDevice {
        int Activate(ref Guid iid, int ctx, IntPtr p, out IntPtr pp);
        int OpenPropertyStore(int access, out IntPtr pp);
        int GetId(out string id);
        int GetState(out int state);
    }

    public static string GetDefault(int role) {
        try {
            var e = (IMMDeviceEnumerator)(object)(new MMDeviceEnumerator());
            IntPtr pp; int hr = e.GetDefaultAudioEndpoint(0, role, out pp);
            if (hr != 0) return "NONE hr=0x" + hr.ToString("X8");
            var d = (IMMDevice)Marshal.GetObjectForIUnknown(pp);
            string id; d.GetId(out id);
            Marshal.ReleaseComObject(d); Marshal.Release(pp);
            return id;
        } catch (Exception ex) { return "ERROR: " + ex.Message; }
    }
}
'@ -Language CSharp

$c = [MMAudio2]::GetDefault(0)
$m = [MMAudio2]::GetDefault(1)
Write-Host "Console    : $c"
Write-Host "Multimedia : $m"
$svcAudio = (Get-Service Audiosrv).Status
$svcAEB   = (Get-Service AudioEndpointBuilder).Status
Write-Host "Audiosrv   : $svcAudio"
Write-Host "AEB        : $svcAEB"
