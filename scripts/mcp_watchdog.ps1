# MCP watchdog
# Probes every configured MCP server, repairs what it can, and logs the rest.
# Runs every 5 min via the MCPWatchdog scheduled task.
#
# Repairs (all free, all local):
#   1. cowork backend on :3001 down  -> kill stale PIDs + restart `npm run server`
#   2. spotify MCP not speaking JSON-RPC -> restart cowork backend (host of /mcp)
#   3. stale entries in mcp-needs-auth-cache.json (>30 days) -> prune
#   4. Claude Desktop dialog killers — fix the recurring "MCP server failed" popups:
#      - Windows-MCP: ensure uv is on machine PATH (auto-install via winget)
#      - Filesystem / pdf-viewer: scan mcp.log for recent UtilityProcess spawn
#        timeouts and surface them in this log so we know which extension flaked
#
# Never spends money. Only HTTP probes to localhost and local file edits.

$ErrorActionPreference = 'SilentlyContinue'
$ProjectDir   = 'C:\Users\Jason W Clark\Desktop\claude projects'
$LogFile      = Join-Path $ProjectDir 'scripts\mcp_watchdog.log'
$McpConfig    = Join-Path $ProjectDir '.mcp.json'
$AuthCache    = Join-Path $env:USERPROFILE '.claude\mcp-needs-auth-cache.json'
$ClaudeMcpLog = Join-Path $env:APPDATA 'Claude\logs\mcp.log'
$BackendUrl   = 'http://localhost:3001/api/providers'
$StaleDays    = 30
# Claude Desktop extensions whose dialogs we want to silence
$WatchedExtensions = @('Windows-MCP','Filesystem','pdf-viewer')

function Write-Log($msg) {
    $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    Add-Content -Path $LogFile -Value $line
}

function Test-Backend {
    try {
        $r = Invoke-WebRequest -Uri $BackendUrl -TimeoutSec 5 -UseBasicParsing
        return ($r.StatusCode -eq 200)
    } catch { return $false }
}

function Restart-Backend {
    Write-Log "DOWN  - cowork backend, restarting"
    $pids = @()
    try {
        $conns = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction Stop
        $pids  = $conns | Select-Object -ExpandProperty OwningProcess -Unique
    } catch { }
    foreach ($p in $pids) {
        try { Stop-Process -Id $p -Force; Write-Log "  killed PID $p" } catch { }
    }

    $npmCmd = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
    if (-not $npmCmd) { $npmCmd = 'npm.cmd' }
    Start-Process -FilePath $npmCmd `
                  -ArgumentList 'run','server' `
                  -WorkingDirectory $ProjectDir `
                  -WindowStyle Hidden

    # `npm run server` cold-start can take 20-25s on this box; verify window
    # is 15 * 2s = 30s so a slow start doesn't get logged as FAILED.
    $up = $false
    for ($i = 0; $i -lt 15 -and -not $up; $i++) {
        Start-Sleep -Seconds 2
        $up = Test-Backend
    }
    if ($up) { Write-Log "  RESTARTED" } else { Write-Log "  FAILED to restart" }
    return $up
}

function Test-McpJsonRpc($url) {
    # MCP servers must answer a JSON-RPC `initialize` request. If they don't, the
    # spotify MCP is wedged even though port 3001 might still be 200.
    $body = @{
        jsonrpc = '2.0'
        id      = 1
        method  = 'initialize'
        params  = @{
            protocolVersion = '2024-11-05'
            capabilities    = @{}
            clientInfo      = @{ name = 'mcp-watchdog'; version = '1.0' }
        }
    } | ConvertTo-Json -Depth 6 -Compress
    try {
        $r = Invoke-WebRequest -Uri $url -Method POST `
            -ContentType 'application/json' `
            -Headers @{ 'Accept' = 'application/json, text/event-stream' } `
            -Body $body -TimeoutSec 6 -UseBasicParsing
        return ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500)
    } catch {
        # Some MCP servers return 405/406 on a single POST — that still means
        # "alive". Only treat connection failure / timeout as broken.
        $resp = $_.Exception.Response
        if ($resp -ne $null) { return $true }
        return $false
    }
}

function Get-McpServers {
    if (-not (Test-Path $McpConfig)) { return @() }
    try {
        $cfg = Get-Content $McpConfig -Raw | ConvertFrom-Json
        $names = @()
        if ($cfg.mcpServers) {
            $cfg.mcpServers.PSObject.Properties | ForEach-Object {
                $names += [pscustomobject]@{
                    name = $_.Name
                    type = $_.Value.type
                    url  = $_.Value.url
                }
            }
        }
        return $names
    } catch {
        Write-Log "WARN  - could not parse $McpConfig : $($_.Exception.Message)"
        return @()
    }
}

function Ensure-Uv {
    # Windows-MCP extension calls `uv` with no path qualifier. If it's missing
    # from machine PATH, Claude Desktop pops a "spawn uv ENOENT" dialog every
    # launch. Re-install via winget if the binary is gone.
    $machinePath = [System.Environment]::GetEnvironmentVariable('PATH','Machine')
    $userPath    = [System.Environment]::GetEnvironmentVariable('PATH','User')
    $combined    = "$machinePath;$userPath"
    $uvExe       = $null
    foreach ($p in $combined.Split(';')) {
        if (-not $p) { continue }
        $candidate = Join-Path $p 'uv.exe'
        if (Test-Path $candidate) { $uvExe = $candidate; break }
    }
    if ($uvExe) {
        Write-Log "OK    - uv on PATH ($uvExe)"
        return $true
    }
    Write-Log "DOWN  - uv missing from PATH (Windows-MCP will fail), installing"
    $winget = (Get-Command winget.exe -ErrorAction SilentlyContinue).Source
    if (-not $winget) { Write-Log "  FAILED - winget not available"; return $false }
    & $winget install --id=astral-sh.uv -e --accept-package-agreements --accept-source-agreements --silent 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { Write-Log "  RESTORED - uv installed"; return $true }
    Write-Log "  FAILED - winget exit $LASTEXITCODE"
    return $false
}

function Report-RecentExtensionErrors {
    # Surface "UtilityProcess spawn timeout" and other transport errors from
    # Claude Desktop's mcp.log within the last hour. We can't fix them from
    # here (Electron's 5s spawn timeout is hard-coded), but logging keeps a
    # paper trail so we know which extension is flaking.
    if (-not (Test-Path $ClaudeMcpLog)) { return }
    $cutoff = (Get-Date).AddHours(-1)
    try {
        $tail = Get-Content $ClaudeMcpLog -Tail 500 -ErrorAction Stop
    } catch { return }
    $recent = @{}
    foreach ($line in $tail) {
        if ($line -notmatch '^\s*(\S+)\s+\[error\]\s+\[([^\]]+)\]\s+(.+)$') { continue }
        $ts   = $matches[1]
        $name = $matches[2]
        $msg  = $matches[3]
        if ($WatchedExtensions -notcontains $name) { continue }
        try { $when = [DateTime]::Parse($ts) } catch { continue }
        if ($when -lt $cutoff) { continue }
        $key = "$name|$($msg -replace '\s+',' ')"
        if (-not $recent.ContainsKey($key)) { $recent[$key] = 0 }
        $recent[$key]++
    }
    foreach ($k in $recent.Keys) {
        $parts = $k -split '\|',2
        Write-Log "EXT   - [$($parts[0])] $($parts[1])  (x$($recent[$k]) in last hr)"
    }
}

function Prune-AuthCache {
    if (-not (Test-Path $AuthCache)) { return }
    try {
        $raw = Get-Content $AuthCache -Raw
        if (-not $raw) { return }
        $obj = $raw | ConvertFrom-Json
        $cutoffMs = ([DateTimeOffset](Get-Date).AddDays(-$StaleDays)).ToUnixTimeMilliseconds()
        $keep = New-Object PSObject
        $pruned = 0
        foreach ($prop in $obj.PSObject.Properties) {
            if ($prop.Value.timestamp -and $prop.Value.timestamp -lt $cutoffMs) {
                $pruned++
            } else {
                $keep | Add-Member -MemberType NoteProperty -Name $prop.Name -Value $prop.Value
            }
        }
        if ($pruned -gt 0) {
            $keep | ConvertTo-Json -Depth 6 -Compress | Set-Content $AuthCache -NoNewline
            Write-Log "PRUNE - removed $pruned stale auth-cache entries (>${StaleDays}d)"
        }
    } catch {
        Write-Log "WARN  - auth-cache prune failed: $($_.Exception.Message)"
    }
}

# === main ===

# 1. Ensure cowork backend (host of every http MCP in .mcp.json) is alive.
$backendOk = Test-Backend
if (-not $backendOk) {
    $backendOk = Restart-Backend
} else {
    Write-Log "OK    - cowork backend"
}

# 2. Probe each MCP listed in .mcp.json. Only http MCPs are probable from here.
$servers = Get-McpServers
foreach ($s in $servers) {
    if ($s.type -eq 'http' -and $s.url) {
        $alive = Test-McpJsonRpc $s.url
        if ($alive) {
            Write-Log "OK    - mcp[$($s.name)] $($s.url)"
        } else {
            Write-Log "DOWN  - mcp[$($s.name)] $($s.url)"
            # Anything hosted on :3001 is fixed by restarting the cowork backend.
            if ($s.url -like '*localhost:3001*' -or $s.url -like '*127.0.0.1:3001*') {
                if ($backendOk) { Restart-Backend | Out-Null }
            }
        }
    } else {
        Write-Log "SKIP  - mcp[$($s.name)] type=$($s.type) (only http probable)"
    }
}

# 3. Prune stale auth-cache entries that block re-auth flows.
Prune-AuthCache

# 4. Claude Desktop dialog killers.
Ensure-Uv | Out-Null
Report-RecentExtensionErrors
