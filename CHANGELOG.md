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
- `scripts/test_skill_crawler.py` — pytest suite (15 cases) covering `skill_crawler.parse_frontmatter`. The crawler and validator have independent parsers, so the existing `test_validate_skills.py` didn't guard the actual bug-fix function. Cases include folded scalars (regression test for 8223c2f), block scalars, quoted strings with colons, YAML booleans/null, edge cases (missing/unterminated/empty frontmatter), and the no-pyyaml fallback path (via `monkeypatch`). Plus a parametrized integration test that confirms the four real folded-scalar skills (`mcp-builder`, `install-skill`, `sentinel-architect`, `web-video-presentation`) still expose their full descriptions.
- `.coveragerc` — coverage configuration scoped to the two test-targeted source files (`skill_crawler.py` and `scripts/validate-skills.py`). CI now reports pytest coverage on every PR (informational, not gating). Honest baseline: validator 61%, crawler 23% — the crawler is largely untested apart from `parse_frontmatter`.
- `scripts/conftest.py` — shared pytest configuration. Inserts the repo root onto `sys.path` so test files can `import skill_crawler` without per-file path manipulation. Replaces the previous `sys.path.insert` at the top of `test_skill_crawler.py`.
- `server/skill-sanitization.js` — pure module that hardens skill content before it reaches the system prompt. Exports `sanitizeSkillContent` (regex-redacts the top 5 injection idioms — "ignore previous instructions", "you are now (a different)", "new role:", "system: you", chat-template tokens like `<|im_start|>` — and caps each skill at 8KB), `escapeAttr` (strips `<>&"\n\r` and length-caps at 80 chars to neutralise name-field injection), and `wrapSkill` (renders content inside a random-fenced `<skill_${hex}>` XML envelope with `<skill_name>` + `<source>` + `<skill_content>` subtags, modelled on Anthropic's official multi-document XML pattern). No side effects, no SDK deps — safe to require from anywhere.
- `server/skill-sanitization.test.js` — node:test suite (18 cases, zero devDeps) covering each redaction pattern, the byte cap, attribute escaping, fence behaviour, name-field injection, source-path leakage, and the wrapper-escape attack (literal `</skill_content>` inside content stays inside the outer fence because the fence is unguessable per-request). New `npm test` script wires `node --test "server/**/*.test.js"`.

### Changed
- Dev-time auto-reloader for the root Electron app swapped from `electron-reload` (`2.0.0-alpha.1`, abandoned 5 years) to `electron-reloader@^1.2.3`. Same `try/catch` + `NODE_ENV === 'development'` gating; ignore filter narrowed from `/server|node_modules/` to `[/server/]` since `electron-reloader` ignores `node_modules` and dot-files by default. The dependency was also moved from `dependencies` to `devDependencies` to match its actual lifecycle. `npm audit` clean.
- `scripts/mcp_watchdog.ps1` — `Ensure-Uv` pins the winget install to `--scope user`. Current winget default is per-user (no UAC), but the hidden-window watchdog can't answer a prompt if a future winget version flips that default. Tightens blast radius (user-site only) at the same time.
- `custom-skills/install-skill/SKILL.md` — dropped the static "Anthropic name → GitHub guess" table. Cached owner mappings rot fast (forks die, repos rename); the table guaranteed a future Claude would follow stale advice. The "always run `gh skill search` first" directive that lived at the bottom of the deleted section is now promoted into Step 2A and hardened: common-owner names are framed as search hints, never install destinations.
- `.github/workflows/skill-validate.yml` — now installs Python deps from `requirements.txt` (single source of truth) and adds a `Run validator unit tests` step before the validator. Path filters include `scripts/test_validate_skills.py` and `requirements.txt` so test-only or dep-only changes trigger CI. Subsequently extended to also run `test_skill_crawler.py` and report `pytest-cov` coverage (informational); path filters now also include `skill_crawler.py`, `scripts/test_skill_crawler.py`, and `.coveragerc`.
- `server/providers.js` `buildSystemPrompt` — replaced the markdown-section skill rendering (`## [Always Active] {name}\n{content}`) with the random-fenced XML envelope from `server/skill-sanitization.js`. The wrapper instruction was rewritten from "Follow their guidance" (which granted skill content authority over user intent) to an explicit data-vs-instructions framing telling Claude to treat tag content as reference data only, ignore embedded directives, and not let skill text override the user request or the base system prompt. Pure helpers extracted to the new module so they can be unit-tested without dragging in the Anthropic SDK + Composio + Python crawler chain.

### Fixed
- Watchdog verify window extended from ~12s to ~30s in both `cowork_watchdog.ps1` and `mcp_watchdog.ps1`. `npm run server` cold-start takes 20-25s on this box, so the previous window logged spurious `FAILED` lines while the backend was still coming up.
- `scripts/test_skill_crawler.py` assertion tightening from the PR #6 retrospective review: (a) `test_yaml_boolean_stringified` now asserts the exact pre-lower string `"True"` instead of a loose `.lower() == "true"` that would have accepted any case; (b) the four-skill integration test replaces per-skill absolute length floors (300/300/500/400 chars) with a single loose 50-char sanity floor — the real regression signal is the indicator-char assertion, and the previous thresholds would have broken on routine wording trims; (c) the indicator-char assertion also rejects empty string.
- Documentation: CHANGELOG, ARCHITECTURE, and SECURITY now list the full Express endpoint set (chat, settings, automation, `/mcp`) instead of only the three primary chat-flow endpoints — the security boundary is wider than the original doc claimed.
- `skill_crawler.py` `parse_frontmatter` — switched from line-based parsing to `yaml.safe_load` when pyyaml is available. The old parser only saw `description: >` and stored the literal `>` indicator character as the value, silently breaking keyword matching for three skills that already used folded scalars (`mcp-builder`, `install-skill`, `sentinel-architect`). All three now expose their full descriptions to matching (390-602 chars each). Falls back to the original line parser when pyyaml is missing so chat doesn't crash on a fresh clone before `setup.sh` runs. All values are stringified so downstream `.lower()`/`.strip()` calls don't choke on YAML booleans or lists.
- Post-review cleanup of today's tightening pass (independent reviewer findings): (a) `setup.sh` Python-dep install now detects whether `python` is inside a virtualenv (`sys.prefix != sys.base_prefix`) and omits `--user` when it is, since `pip install --user` is rejected under venvs and would have silently failed to install pyyaml; the failure-message recovery command also matches the actual install flag used. (b) `.github/workflows/skill-validate.yml` `push:` paths block now includes `.github/workflows/skill-validate.yml` itself — workflow-only edits pushed to main will now correctly trigger the run. (c) `test_skill_crawler.py` indicator-char regression check uses `desc.strip()` so a future fallback-parser tweak that leaves trailing whitespace (`"> "`, `">\n"`) still gets caught.

### Removed
- `next1.md` — the single QUEUED watchdog-verification step it described was empirically completed by the watchdog itself at 2026-05-08 18:00 (`DOWN - backend not responding, restarting...` → `RESTARTED - backend healthy after 14s` → sustained `OK` lines). Handoff is no longer load-bearing.

### Security
- Smilee/visualization is and remains fully offline — no network calls under any circumstance.
- `server/providers.js` skill content now goes through three layers of defence before reaching Claude (closes item #6 from the 2026-05-11 outstanding-issues triage). Vector 1 (classic injection — `Ignore all previous instructions...` inside a SKILL.md) is partially neutralised by `sanitizeSkillContent`'s pattern redaction and the 8KB cap. Vector 2 (trust elevation via the old "Follow their guidance" framing — a malicious skill needed no injection idioms to dictate behaviour, it could just include assertive text) is killed by rewriting the wrapper header to explicit data/instruction separation. Vector 3 (name-field injection via attacker-controlled YAML frontmatter — a skill named `\n\n# SYSTEM OVERRIDE\n...` would break the markdown structure of the prompt) is killed by `escapeAttr` plus the move from markdown headers to XML subtags. The XML envelope itself uses a `crypto.randomBytes(8)` fence per request so a skill author cannot pre-write a matching closing tag to escape the wrapper. Patterns and approach drawn from Anthropic's prompt-engineering docs (XML structure, mitigate-jailbreaks), OWASP LLM01 cheat sheet (data-not-instructions framing), Microsoft's Spotlighting research (delimiter randomisation), and the 13-LLM delimiter-defence study (95%+ block rate on current-gen models when wrapped + framed correctly). Ceiling for layered defence against natural-language re-framing is still ~95-98%; a Haiku 4.5 pre-screen at skill-load time (cached by file hash) would raise it further and is deferred to v2.

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
