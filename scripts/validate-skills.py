#!/usr/bin/env python3
"""
validate-skills.py — Validate SKILL.md frontmatter against agentskills.io spec.

Mirrors the checks from `gh skill publish --dry-run` so CI can catch
format regressions before merge.

Usage:
    python scripts/validate-skills.py [<directory>]

Exit codes:
    0 = all skills valid
    1 = one or more skills failed validation
    2 = setup error (missing dir, missing pyyaml)
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    print("ERROR: pyyaml not installed. Run: pip install pyyaml", file=sys.stderr)
    sys.exit(2)

# agentskills.io naming: lowercase letters, digits, hyphens; must start with letter
NAME_RE = re.compile(r"^[a-z][a-z0-9-]*$")


def parse_frontmatter(text: str) -> dict | None:
    """Extract YAML frontmatter between leading --- delimiters."""
    m = re.match(r"^---\s*\n(.*?)\n---", text, re.DOTALL)
    if not m:
        return None
    try:
        return yaml.safe_load(m.group(1))
    except yaml.YAMLError as e:
        print(f"  yaml-parse-error: {e}", file=sys.stderr)
        return None


def validate(skill_md: Path) -> list[str]:
    """Return a list of error strings (empty = valid)."""
    errors: list[str] = []
    text = skill_md.read_text(encoding="utf-8")
    fm = parse_frontmatter(text)

    if fm is None:
        return [f"{skill_md}: missing or unparseable frontmatter"]
    if not isinstance(fm, dict):
        return [f"{skill_md}: frontmatter is not a YAML mapping"]

    name = fm.get("name")
    desc = fm.get("description")
    license_ = fm.get("license")

    if not name:
        errors.append(f"{skill_md}: missing required field 'name'")
    elif not NAME_RE.match(str(name)):
        errors.append(
            f"{skill_md}: name '{name}' must be lowercase kebab-case "
            "(letters, digits, hyphens; starts with letter)"
        )
    elif name != skill_md.parent.name:
        errors.append(
            f"{skill_md}: name '{name}' does not match directory "
            f"'{skill_md.parent.name}'"
        )

    if not desc:
        errors.append(f"{skill_md}: missing required field 'description'")
    elif not isinstance(desc, str):
        errors.append(
            f"{skill_md}: description must be a string "
            f"(got {type(desc).__name__})"
        )

    # License is recommended, not required — emit a warning but don't fail
    if not license_:
        print(f"warning: {skill_md}: recommended field 'license' missing")

    # allowed-tools must be a string per agentskills.io
    allowed = fm.get("allowed-tools")
    if allowed is not None and not isinstance(allowed, str):
        errors.append(
            f"{skill_md}: allowed-tools must be a string, "
            f"got {type(allowed).__name__}"
        )

    return errors


def main() -> int:
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("custom-skills")
    if not root.exists():
        print(f"ERROR: {root} does not exist", file=sys.stderr)
        return 2

    skills = sorted(root.glob("*/SKILL.md"))
    if not skills:
        print(f"ERROR: no SKILL.md files found in {root}/*/", file=sys.stderr)
        return 2

    all_errors: list[str] = []
    for skill_md in skills:
        all_errors.extend(validate(skill_md))

    if all_errors:
        print("\nValidation failed:")
        for e in all_errors:
            print(f"  error: {e}")
        return 1

    print(f"OK: validated {len(skills)} skill(s) in {root}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
