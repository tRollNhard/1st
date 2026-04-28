$ErrorActionPreference = 'Continue'
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Write-Host "NEEDS ADMIN" -ForegroundColor Red; exit 1 }

$speakersGuid = '{7390bb38-649b-4a24-b81a-2c0a42d8e7df}'
$fxPath = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Render\$speakersGuid\FxProperties"
$epRoot = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Render\$speakersGuid"

# 1. Nuke ALL APO entries  -  every property whose name starts with one of these GUIDs
Write-Host "[1] Removing Realtek APO chain entries..." -ForegroundColor Yellow
$apoGuids = '{d04e05a6','{d3993a3f','{62dc1a93','{9c119480'
$removed = 0
(Get-Item $fxPath -ErrorAction SilentlyContinue).Property | Where-Object {
    $n = $_; $apoGuids | Where-Object { $n -like "$_*" }
} | ForEach-Object {
    Remove-ItemProperty -Path $fxPath -Name $_ -ErrorAction SilentlyContinue
    Write-Host "  removed: $_"
    $removed++
}
Write-Host "  $removed entries removed."
Set-ItemProperty -Path $epRoot -Name 'DisableEnhancements' -Value 1 -Type DWord -ErrorAction SilentlyContinue

# 2. Restart audio stack
Write-Host "[2] Restarting audio services..." -ForegroundColor Yellow
Stop-Service AudioEndpointBuilder -Force -ErrorAction SilentlyContinue
Stop-Service Audiosrv -Force -ErrorAction SilentlyContinue
Start-Sleep 3
Start-Service AudioEndpointBuilder -ErrorAction SilentlyContinue
Start-Sleep 1
Start-Service Audiosrv -ErrorAction SilentlyContinue
Start-Sleep 2
Write-Host "  $(((Get-Service Audiosrv).Status))"

# 3. Set Speakers as default
Write-Host "[3] Setting Speakers as default..." -ForegroundColor Yellow
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public class PC2 {
    [ComImport,Guid("870AF99C-171D-4F9E-AF0D-E63DF40C2BC9")] class Client {}
    [ComImport,Guid("F8679F50-850A-41CF-9C72-430F290290C8"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IPolicyConfig {
        int a(string d,IntPtr p); int b(string d,bool x,IntPtr p); int c(string d);
        int e(string d,IntPtr p,IntPtr m); int f(string d,bool x,IntPtr dp,IntPtr mp);
        int g(string d,IntPtr p); int h(string d,IntPtr m); int i(string d,IntPtr m);
        int j(string d,bool x,IntPtr k,IntPtr v); int k(string d,bool x,IntPtr kk,IntPtr v);
        int SetDefaultEndpoint(string d, uint r);
        int l(string d,bool v);
    }
    public static void Set(string id) {
        var c = (IPolicyConfig)(object)(new Client());
        c.SetDefaultEndpoint(id,0); c.SetDefaultEndpoint(id,1); c.SetDefaultEndpoint(id,2);
    }
}
'@ -Language CSharp
[PC2]::Set("{0.0.0.00000000}.$speakersGuid")
Write-Host "  Done."
Write-Host "`nFinished. Test speakers now." -ForegroundColor Green
