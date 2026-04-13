"""
skill_crawler.py — Scans ALL Claude skill locations, deduplicates, and
automatically decides which skill(s) to apply for any given prompt.

Usage:
    python skill_crawler.py                     # Interactive mode
    python skill_crawler.py "make me a pdf"     # One-shot match
    python skill_crawler.py --list              # List all skills
"""

import os
import sys
import re
import json
import pathlib
import zipfile

# ── CONFIG ──────────────────────────────────────────────────────────────────
APPDATA         = pathlib.Path(os.environ.get("APPDATA", ""))
SESSIONS_ROOT   = APPDATA / "Claude" / "local-agent-mode-sessions"
CUSTOM_SKILLS   = pathlib.Path(__file__).parent / "custom-skills"
CLAUDE_SKILLS   = pathlib.Path(__file__).parent / ".claude" / "skills"
SD_CARD_SKILLS  = pathlib.Path("D:/skills")

# How many conditional skill matches to show per prompt
TOP_N = 3


# ── SKILL SCANNING ──────────────────────────────────────────────────────────
def find_all_skill_mds() -> list[pathlib.Path]:
    """Return every SKILL.md path across all known locations."""
    found = []

    search_dirs = [SESSIONS_ROOT, CUSTOM_SKILLS, CLAUDE_SKILLS, SD_CARD_SKILLS]

    for d in search_dirs:
        if d.exists():
            found.extend(d.rglob("SKILL.md"))

    return found


def find_all_skill_archives() -> list[dict]:
    """Scan for .zip and .skill archives containing SKILL.md files."""
    archives = []
    search_dirs = [CUSTOM_SKILLS, CLAUDE_SKILLS, SD_CARD_SKILLS, pathlib.Path(__file__).parent]

    for d in search_dirs:
        if not d.exists():
            continue
        for pattern in ("*.zip", "*.skill"):
            for archive_path in d.rglob(pattern):
                try:
                    with zipfile.ZipFile(archive_path, "r") as zf:
                        skill_entries = [n for n in zf.namelist() if n.endswith("SKILL.md")]
                        for entry in skill_entries:
                            content = zf.read(entry).decode("utf-8", errors="ignore")
                            archives.append({
                                "archive_path": archive_path,
                                "entry": entry,
                                "content": content,
                            })
                except (zipfile.BadZipFile, OSError):
                    continue

    return archives


def parse_frontmatter(text: str) -> dict:
    """Extract simple key: value frontmatter from a markdown file."""
    data = {}
    match = re.match(r"^---\s*\n(.*?)\n---", text, re.DOTALL)
    if not match:
        return data
    for line in match.group(1).splitlines():
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        data[key.strip()] = value.strip().strip('"')
    return data


def _register_skill(content: str, path: str, fallback_name: str,
                    seen_names: set, always_active: list, conditional: list):
    """Parse a SKILL.md's content and append to the right list."""
    meta        = parse_frontmatter(content)
    name        = (meta.get("name") or fallback_name).lower().strip()
    description = meta.get("description", "")
    is_always   = meta.get("always_active", "false").lower() == "true"

    if name in seen_names:
        return
    seen_names.add(name)

    skill = {
        "name":         name,
        "display_name": meta.get("name") or fallback_name,
        "description":  description,
        "path":         path,
        "triggers":     extract_trigger_words(description),
        "always_active": is_always,
    }

    if is_always:
        always_active.append(skill)
    else:
        conditional.append(skill)


def load_all_skills() -> tuple[list[dict], list[dict]]:
    """
    Load every SKILL.md, deduplicate by name (first occurrence wins),
    and split into (always_active, conditional) lists.
    """
    seen_names: set[str] = set()
    always_active: list[dict] = []
    conditional:   list[dict] = []

    # 1. Raw SKILL.md files
    for path in find_all_skill_mds():
        try:
            content = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        _register_skill(content, str(path), path.parent.name,
                        seen_names, always_active, conditional)

    # 2. Zipped / .skill archives
    for arc in find_all_skill_archives():
        fallback_name = arc["archive_path"].stem
        entry_parent = pathlib.Path(arc["entry"]).parent.name
        _register_skill(arc["content"], str(arc["archive_path"]),
                        entry_parent or fallback_name,
                        seen_names, always_active, conditional)

    # Sort conditional skills alphabetically for consistent display
    conditional.sort(key=lambda s: s["name"])
    return always_active, conditional


def extract_trigger_words(description: str) -> list[str]:
    """Extract meaningful keywords from a skill description for matching."""
    STOP = {
        "this", "that", "with", "from", "when", "user", "wants", "into",
        "more", "than", "also", "them", "they", "have", "even", "like",
        "just", "file", "files", "skill", "use", "the", "any", "for",
        "and", "all", "not", "does", "their", "will", "such", "both",
        "task", "tasks", "other", "each", "time", "only", "very",
        "always", "never", "should", "would", "could", "make", "need",
        "using", "used", "uses", "where", "which", "these", "those",
        "about", "across", "between", "within", "without",
    }
    words = re.findall(r"[a-z]{4,}", description.lower())
    seen, result = set(), []
    for w in words:
        if w not in STOP and w not in seen:
            seen.add(w)
            result.append(w)
    return result


# ── SYNONYMS & ALIASES ──────────────────────────────────────────────────────
# Maps common user terms to canonical skill-description terms.
# Each key expands the prompt so the scorer can match skill descriptions.
SYNONYMS = {
    # File format aliases
    "powerpoint":   ["pptx", "slide", "presentation", "deck"],
    "slides":       ["pptx", "presentation", "deck"],
    "deck":         ["pptx", "presentation", "slide"],
    "spreadsheet":  ["xlsx", "excel", "workbook"],
    "excel":        ["xlsx", "spreadsheet", "workbook"],
    "word":         ["docx", "document"],
    "word doc":     ["docx", "document"],
    # Domain aliases
    "website":      ["web", "site", "url", "link", "browse"],
    "safe":         ["safety", "trust", "risk", "phishing", "malware", "blocked"],
    "secure":       ["security", "vulnerability", "exploit"],
    "deploy":       ["deployment", "ship", "release", "rollout"],
    "bug":          ["debug", "error", "issue", "broken", "fix"],
    "chart":        ["visualization", "graph", "plot"],
    "graph":        ["visualization", "chart", "plot"],
    "database":     ["sql", "query", "schema", "table"],
    "api":          ["endpoint", "rest", "request", "route"],
    "test":         ["testing", "spec", "unittest", "coverage"],
    "video":        ["animation", "render", "remotion", "motion"],
}


def expand_prompt(prompt: str) -> str:
    """Expand a prompt with synonym terms for better matching."""
    p = prompt.lower()
    extras = []
    for term, expansions in SYNONYMS.items():
        if term in p:
            extras.extend(expansions)
    if extras:
        return p + " " + " ".join(extras)
    return p


# ── MATCHING / DECISION ENGINE ───────────────────────────────────────────────
def score_skill(skill: dict, prompt: str) -> float:
    """
    Score how well a skill matches the prompt.
    Higher = better match. Returns 0 if no match at all.
    """
    p = expand_prompt(prompt)
    score = 0.0

    # Exact skill name in prompt — strongest signal
    if skill["name"] in p:
        score += 15

    # Skill name words individually in prompt
    for word in skill["name"].replace("-", " ").split():
        if len(word) >= 4 and word in p:
            score += 4

    # File extension match (.pdf, .xlsx, .docx, .pptx, etc.)
    for ext in re.findall(r"\.?\w{2,5}", p):
        if ext.startswith(".") and ext in skill["description"].lower():
            score += 10
    # Also check if format keywords (pptx, xlsx, docx) appear in skill desc
    for fmt in re.findall(r"\b(pptx|xlsx|docx|pdf|csv)\b", p):
        if fmt in skill["description"].lower():
            score += 10

    # Trigger keyword hits
    for word in skill["triggers"]:
        if word in p:
            score += 1

    # Whole-word prompt token hits inside description
    for word in re.findall(r"\b[a-z]{4,}\b", p):
        if re.search(rf"\b{re.escape(word)}\b", skill["description"].lower()):
            score += 0.5

    return score


def decide(prompt: str, conditional: list[dict]) -> list[dict]:
    """
    Decide which conditional skills apply to the prompt.
    Returns ranked list (best first), capped at TOP_N.
    Only returns skills with a meaningful score (>= 2).
    """
    scored = [(score_skill(s, prompt), s) for s in conditional]
    scored.sort(key=lambda x: x[0], reverse=True)
    return [s for score, s in scored[:TOP_N] if score >= 2]


# ── DISPLAY ──────────────────────────────────────────────────────────────────
def fmt_skill(skill: dict, rank: int = 0) -> str:
    label = f"[{rank}] " if rank else "    "
    desc  = skill["description"]
    if len(desc) > 180:
        desc = desc[:177] + "..."
    return f"\n  {label}{skill['display_name'].upper()}\n  {desc}"


def list_all(always_active: list[dict], conditional: list[dict]) -> None:
    total = len(always_active) + len(conditional)
    print(f"\n{'='*55}")
    print(f"  ALL SKILLS — {total} total")
    print(f"{'='*55}")

    if always_active:
        print(f"\n  ALWAYS ACTIVE ({len(always_active)}):")
        for s in always_active:
            print(fmt_skill(s))

    print(f"\n  CONDITIONAL ({len(conditional)}):")
    for i, s in enumerate(conditional, 1):
        print(fmt_skill(s, rank=i))
    print()


# ── MAIN ─────────────────────────────────────────────────────────────────────
def main():
    quiet = "--json" in sys.argv

    if not quiet:
        print("Scanning all skill locations...")
    always_active, conditional = load_all_skills()
    total = len(always_active) + len(conditional)

    if total == 0:
        if quiet:
            print(json.dumps({"alwaysActive": [], "matched": []}))
        else:
            print("ERROR: No skills found. Check that Claude Code plugins are installed.")
        sys.exit(1 if not quiet else 0)

    if not quiet:
        print(f"Ready: {total} skills ({len(always_active)} always-active, "
              f"{len(conditional)} conditional)\n")

    if "--list" in sys.argv:
        list_all(always_active, conditional)
        return

    # JSON mode for programmatic use (called by server/skills.js)
    if "--json" in sys.argv:
        args = [a for a in sys.argv[1:] if a != "--json"]
        if not args:
            print(json.dumps({"alwaysActive": [], "matched": []}))
            return
        prompt = " ".join(args)
        matches = decide(prompt, conditional)
        output = {
            "alwaysActive": [
                {"name": s["name"], "description": s["description"], "path": s["path"]}
                for s in always_active
            ],
            "matched": [
                {"name": s["name"], "description": s["description"], "path": s["path"]}
                for s in matches
            ],
        }
        print(json.dumps(output))
        return

    if len(sys.argv) > 1 and not sys.argv[1].startswith("--"):
        prompt = " ".join(sys.argv[1:])
        run(prompt, always_active, conditional)
        return

    # Interactive mode
    print("Type a prompt — I'll decide which skills to use.")
    print("Commands: 'list' = show all  |  'quit' = exit\n")

    while True:
        try:
            prompt = input("Prompt> ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\nBye!")
            break

        if not prompt:
            continue
        if prompt.lower() == "quit":
            break
        if prompt.lower() == "list":
            list_all(always_active, conditional)
            continue

        run(prompt, always_active, conditional)


def run(prompt: str, always_active: list[dict], conditional: list[dict]) -> None:
    matches = decide(prompt, conditional)

    print(f"\n{'='*55}")
    print(f'  SKILLS FOR: "{prompt}"')
    print(f"{'='*55}")

    print(f"\n  ALWAYS ACTIVE ({len(always_active)}):")
    for s in always_active:
        print(fmt_skill(s))

    if matches:
        print(f"\n  APPLYING ({len(matches)} matched):")
        for i, s in enumerate(matches, 1):
            print(fmt_skill(s, rank=i))
    else:
        print("\n  No conditional skill matched this prompt.")

    print()


if __name__ == "__main__":
    main()
