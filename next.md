# Next session — pick up here

**Updated**: 2026-05-05 — accessibility review done on this file, 3 fixes queued.

## ⚡ Resume here — accessibility fixes for next.md

Ran `/design:accessibility-review next.md`. WCAG 2.1 AA scoped to what applies to a markdown handoff note. Three fixes queued, ~2 min of editing:

1. **Bare URLs → descriptive markdown links** (2.4.4 Link Purpose, 🟡 Major)
   - Line 7: `https://github.com/tRollNhard/1st/pull/1` → `[PR #1 on GitHub](https://github.com/tRollNhard/1st/pull/1)`
   - Line 50: `https://github.com/tRollNhard/1st/settings/rules` → `[Repo rulesets settings](https://github.com/tRollNhard/1st/settings/rules)`
   - Line 54: `https://github.com/tRollNhard/1st/settings/security_analysis` → `[Code security settings](https://github.com/tRollNhard/1st/settings/security_analysis)`

2. **Reword `⏳ Web UI` status cell** (3.3.2 Labels, 🟢 Minor)
   - Line 27 review-items table, item #6 status column: change `⏳ **Web UI** — Jason to do` to `⏳ Pending (manual web-UI step) — Jason to do` so the status reads cleanly out of context.

3. **(Optional, AAA — skip for internal doc)** Expand abbreviations on first use (PR, CI, MCP, SLA, SDK, BRAIN). Only worth doing if this doc ever ships externally.

**Skip the rest** — heading hierarchy, table structure, list semantics, and emoji-with-text status indicators all pass. Color contrast and keyboard nav are N/A (markdown source, renderer-owned).

After applying #1 and #2, commit as `docs(next): a11y — descriptive link text and clearer status label`.

---

## Prior state (still accurate below)

## Current state — branch `claude/focused-faraday-6d1967` (HEAD: e85f9e5)

PR #1 open: [PR #1 on GitHub](https://github.com/tRollNhard/1st/pull/1) — 6 commits, **approved** with all fixable review items resolved.

### Commits in PR (in order)

1. `289c80a` — Add license to skills, consolidate bt-device-manager, gitignore .agents
2. `975194d` — Add SECURITY.md (jwclarkladymae@ + 3/7/30 SLA)
3. `ba137c0` — Add install-skill (universal plugin installer)
4. `d178941` — skill_crawler: scan ~/.claude/skills and .agents/skills
5. `cf72360` — install-skill: genericize "Jason"/"tRollNhard" for public publish
6. `e85f9e5` — Review follow-ups: CI validation, dedup, scope, Windows path

### Review items — final status

| # | Severity | Issue | Status |
|---|---|---|---|
| 1 | High | Privacy leak | ✅ Fixed (cf72360) |
| 2 | Medium | skill_crawler dedup | ✅ Fixed (e85f9e5 — resolved-path dedup + precedence ordering) |
| 3 | Medium | scan-time caching | ⏭️ Skipped (premature without measured cost) |
| 4 | Low | SECURITY scope drift | ✅ Fixed (e85f9e5) |
| 5 | Low | No CI dry-run | ✅ Fixed (e85f9e5 — scripts/validate-skills.py + .github/workflows/skill-validate.yml) |
| 6 | Watch | Tag protection ruleset | ⏳ Pending (manual web-UI step) — Jason to do |
| 7 | Low | Windows path clarity | ✅ Fixed (e85f9e5) |

### Skills installed via gh skill (in `.agents/skills/`, gitignored)

- `mxyhi/ok-skills electron` (318★) — Electron app automation via CDP
- `Starchild-ai-agent/official-skills composio` (11★) — Composio Gateway patterns
- `RaheesAhmed/SajiCode superpowers v1.0.4` (66★) — analyze→plan→implement→verify workflow

### Skills installed globally via npx

- `get-shit-done-cc@1.40.0` (TÂCHES) — 65 skills + 9 hooks at `~/.claude/skills/`. Restart Claude Code CLI then `/gsd-new-project`.

### skill_crawler.py now sees 407 skills (dedup'd, was ~112 originally)

## Verification done

- `python scripts/validate-skills.py custom-skills` → **OK: validated 7 skill(s)**
- `gh skill publish custom-skills --dry-run` → **Dry run complete**
- `python skill_crawler.py --list` → 407 skills loaded clean

## Remaining steps to ship v0.1.0

1. **Web UI — tag protection**: [Repo rulesets settings](https://github.com/tRollNhard/1st/settings/rules)
   - New tag ruleset, pattern `v*`
   - Restrict deletions, restrict updates → immutable releases

2. **Web UI — security toggles**: [Code security settings](https://github.com/tRollNhard/1st/settings/security_analysis)
   - Secret scanning ✓
   - Push protection ✓
   - Dependabot alerts ✓

3. **Merge PR #1**: `gh pr merge 1 --squash --delete-branch` (or web UI)

4. **Switch to main + pull**:
   - From a non-worktree clone, or open a fresh worktree on `main`
   - `git checkout main && git pull`

5. **Publish**: `gh skill publish custom-skills --tag v0.1.0`

## Auth state

- `gh auth status` → logged in as `tRollNhard`, scopes `gist, read:org, repo`, token in keyring
- pyyaml installed via pip (needed for scripts/validate-skills.py locally; CI installs it from scratch)
- No Adobe / Canva / Figma vendor MCPs wired into Cowork's `.mcp.json`

## Memory rules respected

- next.md queued for auto-load (per `feedback_read_next.md`)
- `Standard Project Doc Set` — SECURITY.md ✓, CHANGELOG.md and ARCHITECTURE.md still missing (follow-up)
- `Verified Improvements Only` — all changes confirmed by dry-run + validator before push

## Quick re-orient prompt

> "Read next.md and continue. PR #1 is fully approved (6 commits, all fixable items resolved). Ready to merge once tag protection + security toggles are enabled in the web UI. Then publish v0.1.0."

## Open follow-ups (post v0.1.0)

- CHANGELOG.md and ARCHITECTURE.md per memory rule `Standard Project Doc Set`
- Cache layer for skill_crawler if startup latency becomes noticeable
- Add `bt-device-manager` `always_active: false` for explicitness (cosmetic)
