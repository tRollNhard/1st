# Changelog

All notable changes to **Open Claude Cowork** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `scripts/cowork_watchdog.ps1`, `scripts/mcp_watchdog.ps1`, `scripts/run_hidden.vbs` — local watchdogs that keep the backend on `:3001` alive (used by Spotify MCP), probe every MCP in `.mcp.json`, and prune stale auth-cache entries. Wired to scheduled tasks `CoworkBackendWatchdog` (5 min) and `MCPWatchdog` (2 min).
- `Motivate/` — daily motivational video generator (Electron app), with quote pipeline, one-click OAuth, all-platform publishing, and TikTok-first setup UI.
- Smilee visualizer improvements: lightning rate-limiting, refreshed FX header, fireworks, spectrum wreath, nebula, punchier beat.

### Fixed
- Watchdog verify window extended from ~12s to ~30s in both `cowork_watchdog.ps1` and `mcp_watchdog.ps1`. `npm run server` cold-start takes 20-25s on this box, so the previous window logged spurious `FAILED` lines while the backend was still coming up.
- Documentation: CHANGELOG, ARCHITECTURE, and SECURITY now list the full Express endpoint set (chat, settings, automation, `/mcp`) instead of only the three primary chat-flow endpoints — the security boundary is wider than the original doc claimed.

### Security
- Smilee/visualization is and remains fully offline — no network calls under any circumstance.

## [1.0.0] - 2026-04-29

Initial public-style release. Capabilities present at this tag:

### Added
- **Electron desktop shell** with chat UI (`renderer/`, no framework), `main.js` Electron main process, and `preload.js` exposing a minimal `contextBridge` between renderer and the local Express server.
- **Express backend** (`server/index.js`, port 3001) with:
  - `/api/chat` (POST) — streamed text responses (Transfer-Encoding: chunked).
  - `/api/providers` (GET) — health/status.
  - `/api/abort` (POST) — cancel in-flight requests.
  - `/api/settings/status` (GET), `/api/settings/keys` (POST) — read/write `ANTHROPIC_API_KEY` and `COMPOSIO_API_KEY` in `.env` from the UI.
  - `/api/automation/status` (GET), `/api/automation/start|stop|configure` (POST) — control the social-media automation pipeline.
  - `/mcp` (mounted) — the embedded Spotify MCP router.
- **Claude provider** (`server/providers.js`) — Anthropic SDK integration with streaming, system-prompt skill injection, and an agentic Composio tool-call loop.
- **Composio integration** (`server/composio.js`) — optional: when `COMPOSIO_API_KEY` is set, tools are loaded and Claude can call them in a loop.
- **Skill crawler** (`skill_crawler.py`) — scans `SKILL.md` files plus `.zip` / `.skill` archives, scores them by keyword + synonym match, returns matches as JSON to `server/skills.js`.
- **Always-active skills** — `clarifying-questions`, `truthfinder` injected into every system prompt; conditional skills are matched per-message.
- **Per-chat history** — keyed by `chatId`, trimmed to 50 messages, auto-expires after 2 hours idle.
- **Spotify MCP** embedded in the Express server.
- **Sandbox launchers** — `claude-sandbox.wsb`, `make-sandbox-shortcut.ps1`.
- **Neon Visualizer / Smilee** — modular Vite-bundled architecture under `visualization/`.
- **Audio fix scripts** under `scripts/` (Realtek ALC269 endpoint configuration).
- **Bluetooth helpers** — `bt_check.ps1`, `bt_restore.ps1`.
- **Setup tooling** — `setup.sh` installs Composio CLI, configures API keys, runs `npm install`.

### Changed
- Reorganized audio fix scripts into `scripts/` subfolder; updated `launch.json` accordingly.

### Security
- XSS-safe rendering, input validation, allowlists, path-traversal hardening across the Express surface.

[Unreleased]: https://github.com/tRollNhard/open-claude-cowork/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/tRollNhard/open-claude-cowork/releases/tag/v1.0.0
