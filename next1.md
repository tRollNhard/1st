QUEUED:
- Verify CoworkBackendWatchdog actually heals a downed backend.
  Steps:
    1. Tail the log: Get-Content "scripts\cowork_watchdog.log" -Tail 5
    2. Confirm at least one "OK - backend responding on 3001" entry from after 2026-05-02 00:34 (first scheduled fire).
    3. Induce a failure: Stop-Process -Name node -Force  (or kill PID listening on 3001).
    4. Wait <=5 min for the next scheduled run; tail log again.
    5. Expect a "DOWN" line followed by "RESTARTED - backend healthy after Ns".
    6. If FAILED line appears instead, debug from log + Get-ScheduledTaskInfo -TaskName CoworkBackendWatchdog (LastTaskResult should be 0).

DONE 2026-05-02:
- bug-hunting-checklist.md — 11-section bug bounty quick-reference at project root
- subdomain_takeover_check.py — detection-only scanner (~25 service fingerprints), passive enum via crt.sh + HackerTarget
- ~/.claude.json — removed broken a2a-platform MCP entry (had REPLACE_WITH_YOUR_KEY placeholder)
- Cowork backend started, npm run server, port 3001 responding
- scripts/cowork_watchdog.ps1 — health-check + auto-restart watchdog
- Windows Scheduled Task "CoworkBackendWatchdog" registered, every 5 min, hidden window, current user
