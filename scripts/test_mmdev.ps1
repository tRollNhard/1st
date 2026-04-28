Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public class MMTest {
    [ComImport,Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class DevEnum {}
    [ComImport,Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceEnumerator {
        int EnumAudioEndpoints(int a, int b, out IntPtr c);
        int GetDefaultAudioEndpoint(int flow, int role, out IntPtr pp);
        int GetDevice(string id, out IntPtr pp);
        int RegisterEndpointNotificationCallback(IntPtr p);
        int UnregisterEndpointNotificationCallback(IntPtr p);
    }
    [ComImport,Guid("D666063F-1587-4E43-81F1-B948E807363F"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDevice {
        int Activate(ref Guid g, int c, IntPtr p, out IntPtr pp);
        int OpenPropertyStore(int a, out IntPtr pp);
        int GetId(out string id);
        int GetState(out int s);
    }
    public static string GetDefault(int role) {
        try {
            var e = (IMMDeviceEnumerator)(object)(new DevEnum());
            IntPtr pp;
            if (e.GetDefaultAudioEndpoint(0, role, out pp) != 0) return "NONE";
            var d = (IMMDevice)Marshal.GetObjectForIUnknown(pp);
            string id; d.GetId(out id);
            Marshal.ReleaseComObject(d); Marshal.Release(pp);
            return id;
        } catch (Exception ex) { return "ERR:" + ex.Message; }
    }
}
'@ -Language CSharp
Write-Host "Console   : $([MMTest]::GetDefault(0))"
Write-Host "Multimedia: $([MMTest]::GetDefault(1))"
