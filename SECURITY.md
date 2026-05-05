# Security Policy

## Reporting a Vulnerability

Email: **jwclarkladymae@gmail.com**

Please do not open public GitHub issues for security vulnerabilities.

## Response SLA

| Severity | First response | Mitigation | Fix |
|---|---|---|---|
| Critical | 3 days | 7 days | 30 days |
| High | 7 days | 14 days | 30 days |
| Medium / Low | 14 days | 30 days | 60 days |

## Scope

This policy covers:
- The Open Claude Cowork Electron app (this repo)
- The published agent skills under `custom-skills/`
- The skill_crawler.py auto-matcher

## Out of Scope

- Third-party skills installed via `gh skill install` (under `.agents/`) — review and report to their respective maintainers
- Composio-routed tool execution — report to Composio
- The Anthropic SDK and Claude API — report to Anthropic

## Skill Safety Notes

Skills installed via `gh skill install` are **not verified by GitHub**. Always:
1. Run `gh skill preview <repo> <skill>` before install
2. Review the SKILL.md for prompt-injection or shell-out patterns
3. Audit any scripts the skill references

The truthfinder skill in this repo is always-active during web search to classify sites as SAFE / CAUTION / RISKY / BLOCKED before content is read or cited.

## Known Hardening Status

- `.env` and `.env.*` are gitignored (with `.env.example` exception)
- `.agents/` (gh skill install target) is gitignored
- API keys read from `process.env`, never committed
- Spotify OAuth tokens gitignored at `spotify-mcp/tokens.json`
- Scheduled task locks gitignored
