"""
crawler.py — Sentinel Architect's eyes on the skill directory.

Walks every known skill location, reads SKILL.md frontmatter, records last-modified
time + version tag, and emits a JSON map the Sentinel uses to decide what to
audit or refactor next.

Usage:
    python crawler.py               # Human-readable table
    python crawler.py --json        # JSON output for Sentinel to consume
    python crawler.py --root PATH   # Override default skills root
"""

import os
import sys
import re
import json
import pathlib
import zipfile
from datetime import datetime, timezone


# ── CONFIG ──────────────────────────────────────────────────────────────────
DEFAULT_ROOTS = [
    pathlib.Path(__file__).resolve().parents[2],               # project root
    pathlib.Path(__file__).resolve().parents[2] / "custom-skills",
    pathlib.Path(__file__).resolve().parents[2] / ".claude" / "skills",
    pathlib.Path(os.environ.get("APPDATA", "")) / "Claude" / "local-agent-mode-sessions",
    pathlib.Path("D:/skills"),
]


# ── FRONTMATTER PARSER ─────────────────────────────────────────────────────
def parse_frontmatter(text: str) -> dict:
    """Extract YAML-ish key: value frontmatter from a markdown file."""
    match = re.match(r"^---\s*\n(.*?)\n---", text, re.DOTALL)
    if not match:
        return {}
    data, current_key = {}, None
    for line in match.group(1).splitlines():
        if re.match(r"^\s", line) and current_key:
            data[current_key] += " " + line.strip()
            continue
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        current_key = key.strip()
        data[current_key] = value.strip().strip('"').strip(">")
    return data


# ── DISCOVERY ───────────────────────────────────────────────────────────────
def scan(root: pathlib.Path) -> list[dict]:
    """Scan a single root for SKILL.md files and .skill/.zip archives."""
    if not root.exists():
        return []

    results = []

    # Loose SKILL.md files
    for path in root.rglob("SKILL.md"):
        try:
            content = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        results.append(_record(path, content, archived=False))

    # Archived skills (.skill / .zip)
    for pattern in ("*.skill", "*.zip"):
        for archive in root.rglob(pattern):
            try:
                with zipfile.ZipFile(archive, "r") as zf:
                    for entry in zf.namelist():
                        if entry.endswith("SKILL.md"):
                            content = zf.read(entry).decode("utf-8", errors="ignore")
                            results.append(_record(archive, content,
                                                   archived=True, entry=entry))
            except (zipfile.BadZipFile, OSError):
                continue

    return results


def _record(path: pathlib.Path, content: str, archived: bool,
            entry: str | None = None) -> dict:
    meta = parse_frontmatter(content)
    try:
        mtime = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat()
    except OSError:
        mtime = None

    return {
        "path":          str(path),
        "entry":         entry,
        "archived":      archived,
        "name":          meta.get("name", path.parent.name),
        "description":   meta.get("description", ""),
        "version":       meta.get("version", "untagged"),
        "always_active": str(meta.get("always_active", "false")).lower() == "true",
        "last_modified": mtime,
        "size_bytes":    len(content.encode("utf-8")),
        "has_frontmatter": bool(meta),
    }


def scan_all(roots: list[pathlib.Path]) -> list[dict]:
    """Scan every root and deduplicate by (name, path)."""
    seen, out = set(), []
    for root in roots:
        for skill in scan(root):
            key = (skill["name"].lower(), skill["path"])
            if key in seen:
                continue
            seen.add(key)
            out.append(skill)
    out.sort(key=lambda s: (not s["always_active"], s["name"].lower()))
    return out


# ── AUDIT HEURISTICS ────────────────────────────────────────────────────────
# Flags align with Anthropic's April 2026 skill-authoring guidance:
# https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
RESERVED_NAME_WORDS = ("anthropic", "claude")
SECOND_PERSON_PATTERNS = (
    "i can ", "i will ", "you can ", "you should ", "you'll ", "we can ",
)

def audit_flags(skill: dict) -> list[str]:
    """Return Anthropic-aligned audit flags the Sentinel can act on."""
    flags = []

    # Frontmatter existence
    if not skill["has_frontmatter"]:
        flags.append("missing-frontmatter")

    # Name checks (Anthropic: ≤64 chars, lowercase/digits/hyphens, no reserved words)
    name = skill["name"]
    if not name:
        flags.append("missing-name")
    else:
        if len(name) > 64:
            flags.append("name-too-long")
        if not all(c.islower() or c.isdigit() or c == "-" for c in name):
            flags.append("name-bad-chars")
        if any(w in name.lower() for w in RESERVED_NAME_WORDS):
            flags.append("name-reserved-word")

    # Description checks (Anthropic: non-empty, ≤1024 chars, third-person, pushy)
    desc = skill["description"] or ""
    if not desc:
        flags.append("missing-description")
    else:
        if len(desc) > 1024:
            flags.append("description-too-long")
        lower = desc.lower()
        if any(p in lower for p in SECOND_PERSON_PATTERNS):
            flags.append("description-second-person")
        # Vague-description heuristic: very short + generic keywords
        if len(desc) < 40 and any(g in lower for g in ("helps with", "does stuff")):
            flags.append("description-vague")

    return flags


# ── ENTRY POINT ─────────────────────────────────────────────────────────────
def main(argv: list[str]) -> int:
    roots = DEFAULT_ROOTS[:]
    if "--root" in argv:
        i = argv.index("--root")
        if i + 1 < len(argv):
            roots = [pathlib.Path(argv[i + 1])]

    skills = scan_all(roots)
    for s in skills:
        s["audit_flags"] = audit_flags(s)

    if "--json" in argv:
        print(json.dumps({"count": len(skills), "skills": skills}, indent=2))
        return 0

    print(f"\n  SENTINEL CRAWL — {len(skills)} skill(s) discovered\n")
    print(f"  {'NAME':<32} {'VERSION':<10} {'MODIFIED':<22} FLAGS")
    print(f"  {'-'*32} {'-'*10} {'-'*22} {'-'*30}")
    for s in skills:
        mod = (s["last_modified"] or "")[:19]
        flags = ", ".join(s["audit_flags"]) or "ok"
        print(f"  {s['name'][:32]:<32} {s['version'][:10]:<10} {mod:<22} {flags}")
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
