# MCP watchdog
# Probes every configured MCP server, repairs what it can, and logs the rest.
# Runs every 5 min via the MCPWatchdog scheduled task.
#
# Repairs (all free, all local):
#   1. cowork backend on :3001 down  -> kill stale PIDs + restart `npm run server`
#   2. spotify MCP not speaking JSON-RPC -> restart cowork backend (host of /mcp)
#   3. stale entries in mcp-needs-auth-cache.json (>30 days) -> prune
#   4. Claude Desktop dialog killers — fix the recurring "MCP server failed" popups:
#      - Windows-MCP: ensure uv installed AND patch manifest.json to absolute path
#        (Claude Desktop spawns with explorer.exe's PATH frozen at logon, which
#         can lack the WinGet Links dir even after a fresh winget install. Hardcoding
#         the absolute path eliminates the PATH dependency entirely.)
#      - Filesystem: trim allowed_directories to drives that exist on this box.
#        Configuring nonexistent drives (G:..J:) or empty optical (F:) at startup
#        trips Electron's 5s UtilityProcess spawn cap.
#      - pdf-viewer: log only — disabled in Claude Desktop UI by user choice.
#
# Never spends money. Only HTTP probes to localhost and local file edits.

$ErrorActionPreference = 'SilentlyContinue'
$ProjectDir   = 'C:\Users\Jason W Clark\Desktop\claude projects'
$LogFile      = Join-Path $ProjectDir 'scripts\mcp_watchdog.log'
$McpConfig    = Join-Path $ProjectDir '.mcp.json'
$AuthCache    = Join-Path $env:USERPROFILE '.claude\mcp-needs-auth-cache.json'
$ClaudeMcpLog = Join-Path $env:APPDATA 'Claude\logs\mcp.log'
$ClaudeExtDir = Join-Path $env:APPDATA 'Claude\Claude Extensions'
$ClaudeExtSettingsDir = Join-Path $env:APPDATA 'Claude\Claude Extensions Settings'
$WindowsMcpManifest   = Join-Path $ClaudeExtDir 'ant.dir.cursortouch.windows-mcp\manifest.json'
$FilesystemSettings   = Join-Path $ClaudeExtSettingsDir 'ant.dir.ant.anthropic.filesystem.json'
$UvAbsolutePath       = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links\uv.exe'
$BackendUrl   = 'http://localhost:3001/api/providers'
$StaleDays    = 30
# Claude Desktop extensions whose dialogs we want to silence
$WatchedExtensions = @('Windows-MCP','Filesystem','pdf-viewer')

function Write-Log($msg) {
    $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    Add-Content -Path $LogFile -Value $line
}

function Write-JsonNoBom($path, $text) {
    # Windows PowerShell 5.1's `Set-Content -Encoding UTF8` writes a BOM, which
    # some strict JSON parsers (e.g. Node's stricter modes) reject. Write bytes
    # directly with a BOM-less UTF-8 encoder.
    $enc = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($path, $text, $enc)
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

function Ensure-WindowsMcpAbsoluteUv {
    # Even with uv on PATH, Claude Desktop's Node spawn often fails because
    # explorer.exe captured its PATH at logon — before the WinGet entry was
    # added — and Claude Desktop inherits that frozen copy. Force the manifest
    # to use the absolute path so the spawn is PATH-independent.
    if (-not (Test-Path $WindowsMcpManifest)) {
        Write-Log "SKIP  - Windows-MCP manifest not found"
        return
    }
    if (-not (Test-Path $UvAbsolutePath)) {
        Write-Log "SKIP  - uv.exe not at expected absolute path ($UvAbsolutePath)"
        return
    }
    try {
        $raw = Get-Content $WindowsMcpManifest -Raw -ErrorAction Stop
        $manifest = $raw | ConvertFrom-Json
    } catch {
        Write-Log "WARN  - could not parse Windows-MCP manifest: $($_.Exception.Message)"
        return
    }
    if (-not $manifest.server -or -not $manifest.server.mcp_config) {
        Write-Log "WARN  - Windows-MCP manifest schema unexpected (missing server.mcp_config)"
        return
    }
    $current = $manifest.server.mcp_config.command
    if ($current -eq $UvAbsolutePath) {
        Write-Log "OK    - Windows-MCP manifest pinned to absolute uv"
        return
    }
    $manifest.server.mcp_config.command = $UvAbsolutePath
    try {
        Write-JsonNoBom $WindowsMcpManifest ($manifest | ConvertTo-Json -Depth 32)
        Write-Log "FIX   - Windows-MCP manifest command set to $UvAbsolutePath (was '$current')"
    } catch {
        Write-Log "WARN  - failed to write Windows-MCP manifest: $($_.Exception.Message)"
    }
}

function Ensure-FilesystemDrivesTrimmed {
    # Filesystem extension's UtilityProcess spawn has a hard 5s cap. Listing
    # nonexistent or empty-optical drives at startup blows past it. Keep the
    # config to drives that actually have data (probed via Get-PSDrive).
    if (-not (Test-Path $FilesystemSettings)) { return }
    try {
        $raw = Get-Content $FilesystemSettings -Raw -ErrorAction Stop
        $settings = $raw | ConvertFrom-Json
    } catch {
        Write-Log "WARN  - could not parse Filesystem settings: $($_.Exception.Message)"
        return
    }
    if (-not $settings.userConfig -or -not $settings.userConfig.allowed_directories) {
        return
    }
    $current = @($settings.userConfig.allowed_directories)
    # Build the desired list from drives that exist AND have nonzero capacity.
    # An optical drive with no disc reports 0 used + 0 free — drop it.
    $desired = @()
    foreach ($d in (Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue)) {
        $cap = ($d.Used + $d.Free)
        if ($cap -gt 0) { $desired += ("{0}:\" -f $d.Name) }
    }
    if (-not $desired -or $desired.Count -eq 0) { return }
    # Normalize trailing slash + case on drive-root entries so 'c:/', 'C:\',
    # and 'C:' all compare equal. Sub-paths (e.g. 'C:\Users\foo') stay as-is
    # so they still trigger a rewrite to drive-root canonical form.
    $normCurrent = foreach ($p in $current) {
        if ($p -match '^([A-Za-z]):[\\/]?$') { '{0}:\' -f $matches[1].ToUpper() }
        else { $p }
    }
    # Compare sorted arrays; only rewrite if changed.
    $a = ($normCurrent | Sort-Object) -join '|'
    $b = ($desired | Sort-Object) -join '|'
    if ($a -eq $b) {
        Write-Log "OK    - Filesystem allowed_directories matches mounted drives ($($desired -join ', '))"
        return
    }
    $settings.userConfig.allowed_directories = $desired
    try {
        Write-JsonNoBom $FilesystemSettings ($settings | ConvertTo-Json -Depth 16)
        Write-Log "FIX   - Filesystem allowed_directories trimmed to mounted drives: $($desired -join ', ') (was: $($current -join ', '))"
    } catch {
        Write-Log "WARN  - failed to write Filesystem settings: $($_.Exception.Message)"
    }
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
Ensure-WindowsMcpAbsoluteUv
Ensure-FilesystemDrivesTrimmed
Report-RecentExtensionErrors
