# Changelog

All notable changes to **Open Claude Cowork** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `scripts/cowork_watchdog.ps1`, `scripts/mcp_watchdog.ps1`, `scripts/run_hidden.vbs` — local watchdogs that keep the backend on `:3001` alive (used by Spotify MCP), probe every MCP in `.mcp.json`, and prune stale auth-cache entries. Wired to scheduled tasks `CoworkBackendWatchdog` (5 min) and `MCPWatchdog` (2 min).
- `Motivate/` — daily motivational video generator (Electron app), with quote pipeline, one-click OAuth, all-platform publishing, and TikTok-first setup UI.
- Smilee visualizer improvements: lightning rate-limiting, refreshed FX header, fireworks, spectrum wreath, nebula, punchier beat.
- `custom-skills/web-video-presentation/` (skill #8) — turns slides + script into a self-contained narrated video for the web. Pipeline: storyboard → audio capture → render → mix → caption → MP4/WebM export. Reference at `references/AUDIO.md` (capture/cleanup/loudness/encode recipes, WCAG-aligned accessibility checks).
- `visualization/CHANGELOG.md`, `visualization/ARCHITECTURE.md`, `visualization/SECURITY.md` — Smillee now has the Standard Project Doc Set. `ARCHITECTURE.md` documents the four-layer offline-invariant enforcement (Chromium CL flags, renderer CSP, `webRequest.onBeforeRequest`, dead proxy). `SECURITY.md` defines an offline-invariant breach as a scope-1 vulnerability.
- `requirements.txt` — declares `pyyaml>=6.0` as a Python runtime dependency. `setup.sh` now installs it best-effort (warns rather than aborting if Python or pip is missing). Closes the regression class caught by ultra-review: folded-scalar YAML descriptions in SKILL.md silently broke matching when pyyaml was absent because the crawler's line-parser fallback returned `">"`.
- `scripts/test_validate_skills.py` — pytest suite (12 cases) covering every branch in `validate-skills.py`: kebab-case name regex, name/directory mismatch, missing/non-string description, `allowed-tools` list-vs-string rejection, missing-license warning, missing frontmatter, and folded-scalar parsing. Runs in CI before the validator itself so a test regression blocks the PR before `custom-skills/` is scanned.
- `custom-skills/web-video-presentation/references/AUDIO.md` "See also" section — cross-references the parent `SKILL.md`, the companion `remotion-best-practices` skill (which owns the slide-rendering side that AUDIO.md's narrations get muxed onto), and the three WCAG 2.1 success criteria already cited in the body.

### Changed
- Dev-time auto-reloader for the root Electron app swapped from `electron-reload` (`2.0.0-alpha.1`, abandoned 5 years) to `electron-reloader@^1.2.3`. Same `try/catch` + `NODE_ENV === 'development'` gating; ignore filter narrowed from `/server|node_modules/` to `[/server/]` since `electron-reloader` ignores `node_modules` and dot-files by default. The dependency was also moved from `dependencies` to `devDependencies` to match its actual lifecycle. `npm audit` clean.
- `scripts/mcp_watchdog.ps1` — `Ensure-Uv` pins the winget install to `--scope user`. Current winget default is per-user (no UAC), but the hidden-window watchdog can't answer a prompt if a future winget version flips that default. Tightens blast radius (user-site only) at the same time.
- `custom-skills/install-skill/SKILL.md` — dropped the static "Anthropic name → GitHub guess" table. Cached owner mappings rot fast (forks die, repos rename); the table guaranteed a future Claude would follow stale advice. The "always run `gh skill search` first" directive that lived at the bottom of the deleted section is now promoted into Step 2A and hardened: common-owner names are framed as search hints, never install destinations.
- `.github/workflows/skill-validate.yml` — now installs Python deps from `requirements.txt` (single source of truth) and adds a `Run validator unit tests` step before the validator. Path filters include `scripts/test_validate_skills.py` and `requirements.txt` so test-only or dep-only changes trigger CI.

### Fixed
- Watchdog verify window extended from ~12s to ~30s in both `cowork_watchdog.ps1` and `mcp_watchdog.ps1`. `npm run server` cold-start takes 20-25s on this box, so the previous window logged spurious `FAILED` lines while the backend was still coming up.
- Documentation: CHANGELOG, ARCHITECTURE, and SECURITY now list the full Express endpoint set (chat, settings, automation, `/mcp`) instead of only the three primary chat-flow endpoints — the security boundary is wider than the original doc claimed.
- `skill_crawler.py` `parse_frontmatter` — switched from line-based parsing to `yaml.safe_load` when pyyaml is available. The old parser only saw `description: >` and stored the literal `>` indicator character as the value, silently breaking keyword matching for three skills that already used folded scalars (`mcp-builder`, `install-skill`, `sentinel-architect`). All three now expose their full descriptions to matching (390-602 chars each). Falls back to the original line parser when pyyaml is missing so chat doesn't crash on a fresh clone before `setup.sh` runs. All values are stringified so downstream `.lower()`/`.strip()` calls don't choke on YAML booleans or lists.

### Removed
- `next1.md` — the single QUEUED watchdog-verification step it described was empirically completed by the watchdog itself at 2026-05-08 18:00 (`DOWN - backend not responding, restarting...` → `RESTARTED - backend healthy after 14s` → sustained `OK` lines). Handoff is no longer load-bearing.

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
