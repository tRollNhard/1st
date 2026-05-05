# Cowork backend watchdog
# Pings localhost:3001 and restarts `npm run server` if it's not responding.
# Logs to scripts/cowork_watchdog.log so you can see when it acts.

$ErrorActionPreference = 'SilentlyContinue'
$ProjectDir = 'C:\Users\Jason W Clark\Desktop\claude projects'
$LogFile    = Join-Path $ProjectDir 'scripts\cowork_watchdog.log'
$HealthUrl  = 'http://localhost:3001/api/providers'

function Write-Log($msg) {
    $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    Add-Content -Path $LogFile -Value $line
}

# Health probe
$alive = $false
try {
    $r = Invoke-WebRequest -Uri $HealthUrl -TimeoutSec 5 -UseBasicParsing
    if ($r.StatusCode -eq 200) { $alive = $true }
} catch { }

if ($alive) {
    Write-Log "OK - backend responding on 3001"
    exit 0
}

Write-Log "DOWN - backend not responding, restarting..."

# Kill any orphaned node processes still bound to 3001
$pids = @()
try {
    $conns = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction Stop
    $pids  = $conns | Select-Object -ExpandProperty OwningProcess -Unique
} catch { }
foreach ($p in $pids) {
    try { Stop-Process -Id $p -Force; Write-Log "killed PID $p" } catch { }
}

# Launch fresh backend, detached, no visible window
$npmCmd = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if (-not $npmCmd) { $npmCmd = 'npm.cmd' }

Start-Process -FilePath $npmCmd `
              -ArgumentList 'run','server' `
              -WorkingDirectory $ProjectDir `
              -WindowStyle Hidden

Start-Sleep -Seconds 4

# Verify it came back up.
# `npm run server` cold-start can take 20-25s on this box, so the verify
# window is ~30s of probes (15 * 2s) on top of the 4s head-start above.
# Shorter windows logged spurious FAILED while the backend was still starting.
$retry = 0
$up = $false
while ($retry -lt 15 -and -not $up) {
    Start-Sleep -Seconds 2
    try {
        $r = Invoke-WebRequest -Uri $HealthUrl -TimeoutSec 3 -UseBasicParsing
        if ($r.StatusCode -eq 200) { $up = $true }
    } catch { }
    $retry++
}

if ($up) { Write-Log "RESTARTED - backend healthy after $($retry*2 + 4)s" }
else     { Write-Log "FAILED - backend still not responding after restart attempt" }
