Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
[ComImport,Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int a, int b, out IntPtr c);
    int GetDefaultAudioEndpoint(int flow, int role, out IntPtr pp);
    int GetDevice(string id, out IntPtr pp);
    int RegisterEndpointNotificationCallback(IntPtr p);
    int UnregisterEndpointNotificationCallback(IntPtr p);
}
'@ -Language CSharp 2>&1
Write-Host "compiled ok"
