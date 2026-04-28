$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int f, int mask, out System.IntPtr col);
    int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice dev);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDevice {
    int Activate(ref System.Guid iid, int ctx, System.IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o);
    int OpenPropertyStore(int access, out System.IntPtr store);
    int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
    int GetState(out int state);
}
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
public class MMDeviceEnumerator { }
public class Def {
    public static string PlaybackId() {
        var en = (IMMDeviceEnumerator)(new MMDeviceEnumerator());
        IMMDevice d; en.GetDefaultAudioEndpoint(0, 0, out d);
        string id; d.GetId(out id); return id;
    }
    public static string CommsId() {
        var en = (IMMDeviceEnumerator)(new MMDeviceEnumerator());
        IMMDevice d; en.GetDefaultAudioEndpoint(0, 2, out d);
        string id; d.GetId(out id); return id;
    }
    public static string CaptureId() {
        var en = (IMMDeviceEnumerator)(new MMDeviceEnumerator());
        IMMDevice d; en.GetDefaultAudioEndpoint(1, 0, out d);
        string id; d.GetId(out id); return id;
    }
}
'@

function Name-From-Id {
    param([string]$Id)
    # IDs look like: {0.0.0.00000000}.{GUID}
    $guid = $Id -replace '^.*\{', '{' -replace '\}$', '}'
    $paths = @(
        "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Render\$guid\Properties",
        "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Capture\$guid\Properties"
    )
    foreach ($p in $paths) {
        $props = Get-ItemProperty $p -ErrorAction SilentlyContinue
        if ($props) {
            $n = $props.'{a45c254e-df1c-4efd-8020-67d146a850e0},2'
            if (-not $n) { $n = $props.'{b3f8fa53-0004-438e-9003-51a46e139bfc},6' }
            if ($n) { return $n }
        }
    }
    return "(unknown: $Id)"
}

Write-Host ""
Write-Host "=== DEFAULT DEVICES ===" -ForegroundColor Cyan
try {
    $pid  = [Def]::PlaybackId()
    $cid  = [Def]::CommsId()
    $capid = [Def]::CaptureId()
    Write-Host ("  Default Playback       : " + (Name-From-Id $pid))
    Write-Host ("  Default Communications : " + (Name-From-Id $cid))
    Write-Host ("  Default Capture (mic)  : " + (Name-From-Id $capid))
} catch {
    Write-Host ("  Error: " + $_.Exception.Message)
}

Write-Host ""
Write-Host "=== ENDPOINT VOLUMES (per-device, from registry) ===" -ForegroundColor Cyan
$renderRoot  = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Render'
$captureRoot = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Capture'
foreach ($pair in @(@{R=$renderRoot; K='RENDER'}, @{R=$captureRoot; K='CAPTURE'})) {
    Write-Host ("--- " + $pair.K + " ---") -ForegroundColor Yellow
    Get-ChildItem $pair.R | ForEach-Object {
        $props = Get-ItemProperty "$($_.PSPath)\Properties"
        $name = $props.'{a45c254e-df1c-4efd-8020-67d146a850e0},2'
        if (-not $name) { $name = "(unnamed)" }
        $state = (Get-ItemProperty $_.PSPath).DeviceState
        if ($state -ne 1) { return } # ACTIVE only
        # Volume level scalar is in FxProperties
        $fx = Get-ItemProperty "$($_.PSPath)\FxProperties" -ErrorAction SilentlyContinue
        [pscustomobject]@{
            Name = $name
            State = 'ACTIVE'
        }
    } | Format-Table -AutoSize
}

Write-Host ""
Write-Host "=== PER-APP VOLUMES (current session mixer) ===" -ForegroundColor Cyan
# Enumerate AudioSessions for default playback device
try {
    $sig2 = @'
using System.Runtime.InteropServices;
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDeviceEnumerator2 {
    int f1(int f, int mask, out System.IntPtr col);
    int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice2 dev);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDevice2 {
    int Activate(ref System.Guid iid, int ctx, System.IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o);
}
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
public class MMDeviceEnumerator2 { }
[Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IAudioSessionManager2 {
    int f1(System.Guid g, bool b, out System.IntPtr p);
    int f2(System.Guid g, bool b, out System.IntPtr p);
    int GetSessionEnumerator(out IAudioSessionEnumerator e);
}
[Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE9"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IAudioSessionEnumerator {
    int GetCount(out int c);
    int GetSession(int i, out IAudioSessionControl2 s);
}
[Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IAudioSessionControl2 {
    int f1(); int f2(); int f3(); int f4(); int f5();
    int f6([MarshalAs(UnmanagedType.LPWStr)] out string s);
    int f7(); int f8(); int f9();
    int GetProcessId(out int pid);
    int f11(); int f12();
}
public class Sessions {
    public static int[] GetProcessIds() {
        var en = (IMMDeviceEnumerator2)(new MMDeviceEnumerator2());
        IMMDevice2 d; en.GetDefaultAudioEndpoint(0, 0, out d);
        System.Guid iid = typeof(IAudioSessionManager2).GUID;
        object o; d.Activate(ref iid, 23, System.IntPtr.Zero, out o);
        var m = (IAudioSessionManager2)o;
        IAudioSessionEnumerator e; m.GetSessionEnumerator(out e);
        int count; e.GetCount(out count);
        var result = new System.Collections.Generic.List<int>();
        for (int i = 0; i < count; i++) {
            IAudioSessionControl2 s; e.GetSession(i, out s);
            int pid; s.GetProcessId(out pid);
            result.Add(pid);
        }
        return result.ToArray();
    }
}
'@
    Add-Type -TypeDefinition $sig2 -ErrorAction Stop
    $pids = [Sessions]::GetProcessIds()
    if ($pids) {
        foreach ($pp in $pids) {
            if ($pp -eq 0) { Write-Host "  (system sounds, PID 0)"; continue }
            $proc = Get-Process -Id $pp -ErrorAction SilentlyContinue
            if ($proc) {
                Write-Host ("  " + $proc.ProcessName + " (PID " + $pp + ")")
            } else {
                Write-Host ("  PID " + $pp + " (exited)")
            }
        }
    } else {
        Write-Host "  (no apps currently producing sound)"
    }
} catch {
    Write-Host ("  Could not enumerate sessions: " + $_.Exception.Message)
}

Write-Host ""
Write-Host "=== DONE ===" -ForegroundColor Green
