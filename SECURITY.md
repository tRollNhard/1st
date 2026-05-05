# Security Policy

## Supported versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a vulnerability

Please email **jwclarkladymae@gmail.com** with details. Use the subject line
`[SECURITY] open-claude-cowork: <one-line summary>`.

Please include, at minimum:

- A description of the issue and the affected component (`server/`, `renderer/`, `skill_crawler.py`, watchdogs, etc.).
- Reproduction steps or a minimal proof of concept.
- Versions, OS, Node version, and any relevant configuration.
- Your assessment of impact (confidentiality / integrity / availability).

**Do not** open a public GitHub issue for vulnerabilities.

## Response SLA

| Stage              | Target                                         |
| ------------------ | ---------------------------------------------- |
| Acknowledgement    | within **3 calendar days** of report           |
| Initial assessment | within **7 calendar days** of report           |
| Fix or mitigation  | within **30 calendar days** of report          |

If a fix is not feasible within 30 days (e.g. upstream-dependency issue), you
will receive a written status update at the 30-day mark with a revised target
and the reason for the slip.

## Scope

In scope:

- The Express server (`server/`) and its endpoints (`/api/chat`, `/api/providers`, `/api/abort`).
- The Electron main / preload bridge (`main.js`, `preload.js`).
- The renderer UI (`renderer/`) — XSS, output handling, content-security boundaries.
- `skill_crawler.py` — path handling, archive extraction, scoring code.
- The local watchdogs (`scripts/cowork_watchdog.ps1`, `scripts/mcp_watchdog.ps1`, `scripts/run_hidden.vbs`).
- Embedded Spotify MCP and the `.mcp.json` config surface.

Out of scope:

- Third-party MCP servers added by the user to `.mcp.json` — report those upstream.
- The Anthropic API or Composio API themselves — report to those vendors.
- Issues that require an attacker to already have local code-execution on the user's machine.
- Anything in `visualization/` (Smilee) — runs fully offline by hard project rule and accepts no network input.

## Disclosure

Coordinated disclosure preferred. Once a fix is shipped (or the 30-day window
elapses with a status update), the reporter is credited in `CHANGELOG.md`
under the relevant version's `### Security` section, unless they request
otherwise.
