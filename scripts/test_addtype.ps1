Write-Host "start"
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public class TestCOM {
    [ComImport,Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class DevEnum {}
    public static string Hello() { return "ok"; }
}
'@ -Language CSharp
Write-Host ("result: {0}" -f [TestCOM]::Hello())
