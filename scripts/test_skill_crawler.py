"""Tests for skill_crawler.parse_frontmatter.

The crawler and the validator have INDEPENDENT frontmatter parsers. The
validator tests (test_validate_skills.py) cover the validator's parser.
This file covers skill_crawler's parser — the one that was silently
returning ">" for folded-scalar descriptions until commit 8223c2f.

A regression in skill_crawler.parse_frontmatter affects keyword matching
at runtime but does not affect the validator, so the two test files must
exist in parallel.
"""
from __future__ import annotations

from pathlib import Path

import pytest

# sys.path setup lives in scripts/conftest.py so it's not duplicated per file.
import skill_crawler

REPO_ROOT = Path(__file__).parent.parent


def _md(frontmatter: str) -> str:
    """Build a SKILL.md-shaped text from a frontmatter block."""
    return f"---\n{frontmatter}\n---\n\nbody\n"


# --- parse_frontmatter: happy paths -----------------------------------------

def test_simple_key_value():
    fm = skill_crawler.parse_frontmatter(_md("name: my-skill\ndescription: hello"))
    assert fm["name"] == "my-skill"
    assert fm["description"] == "hello"


def test_folded_scalar_description():
    """Regression for the bug fixed by 8223c2f.

    Before the fix, the line parser saw 'description: >' and stored the
    literal '>' character as the value. Folded scalars must collapse to
    the joined paragraph text.
    """
    text = _md("name: my-skill\ndescription: >\n  multi-line\n  description here.")
    fm = skill_crawler.parse_frontmatter(text)
    assert fm["description"] != ">"
    assert fm["description"].startswith("multi-line")
    assert "description here." in fm["description"]


def test_block_scalar_description():
    """The | (literal) block scalar preserves newlines but the description
    must still come back as a string, not the indicator character."""
    text = _md("name: my-skill\ndescription: |\n  line one\n  line two")
    fm = skill_crawler.parse_frontmatter(text)
    assert fm["description"] != "|"
    assert "line one" in fm["description"]
    assert "line two" in fm["description"]


def test_quoted_description_with_colon():
    """The pre-fix line parser would split on the first ':' inside the
    quoted string. yaml.safe_load handles it correctly."""
    text = _md('name: my-skill\ndescription: "use this: when X happens"')
    fm = skill_crawler.parse_frontmatter(text)
    assert fm["description"] == "use this: when X happens"


def test_yaml_boolean_stringified():
    """Downstream code does meta.get("always_active", "false").lower() —
    that would crash on Python True. Stringification keeps it safe."""
    text = _md("name: my-skill\ndescription: ok\nalways_active: true")
    fm = skill_crawler.parse_frontmatter(text)
    # str(True) == "True", which downstream .lower() turns into "true".
    # Asserting the exact pre-lower string locks in the contract; a loose
    # .lower() check would pass even if we accidentally returned "TRUE"
    # or "true" from some other path.
    assert fm["always_active"] == "True"


def test_yaml_null_becomes_empty_string():
    """An explicit field: null should become '' not the Python None
    (downstream code uses .strip()/.lower() and would crash on None)."""
    text = _md("name: my-skill\ndescription: ok\nlicense: null")
    fm = skill_crawler.parse_frontmatter(text)
    assert fm["license"] == ""


# --- parse_frontmatter: edge cases ------------------------------------------

def test_missing_frontmatter_returns_empty():
    fm = skill_crawler.parse_frontmatter("no frontmatter here\nat all")
    assert fm == {}


def test_unterminated_frontmatter_returns_empty():
    """Opening `---` with no closing fence should not partially-parse."""
    fm = skill_crawler.parse_frontmatter("---\nname: my-skill\n# no closing fence\n")
    assert fm == {}


def test_empty_frontmatter_returns_empty():
    fm = skill_crawler.parse_frontmatter("---\n\n---\n\nbody\n")
    assert fm == {}


# --- fallback parser (no pyyaml) --------------------------------------------

def test_fallback_when_pyyaml_unavailable(monkeypatch):
    """Simulate a fresh clone where pyyaml isn't installed yet.

    The crawler must still parse simple key:value frontmatter so the chat
    server doesn't crash before setup.sh has run.
    """
    monkeypatch.setattr(skill_crawler, "_HAS_YAML", False)
    text = _md("name: my-skill\ndescription: hello world")
    fm = skill_crawler.parse_frontmatter(text)
    assert fm["name"] == "my-skill"
    assert fm["description"] == "hello world"


def test_fallback_truncates_folded_scalar(monkeypatch):
    """Document the known limitation of the line-parser fallback.

    This is the bug we fixed by switching to yaml.safe_load — but the
    fallback path still has it. The test enshrines that as a known cost
    so a future maintainer doesn't waste time thinking the fallback can
    handle folded scalars.
    """
    monkeypatch.setattr(skill_crawler, "_HAS_YAML", False)
    text = _md("name: my-skill\ndescription: >\n  this gets truncated")
    fm = skill_crawler.parse_frontmatter(text)
    assert fm["description"] == ">"


# --- integration: real SKILL.md files in the repo ---------------------------

# 50 chars is a soft floor — short enough that no real skill description
# ever falls below it (the shortest reasonable description is ~80 chars),
# but loose enough that legitimate wording edits don't trip the test.
# The real regression signal is the indicator-char assertion below.
_MIN_REAL_DESC_LEN = 50

@pytest.mark.parametrize("skill_name", [
    "mcp-builder",
    "install-skill",
    "sentinel-architect",
    "web-video-presentation",
])
def test_real_folded_scalar_skills_have_full_descriptions(skill_name):
    """Regression test for the four real skills that used folded scalars.

    Before 8223c2f, all four had description=">" in the crawler. After
    the fix, each should expose its full description. The hard regression
    signal is the indicator-char check; the length floor is loose enough
    to survive normal wording edits.
    """
    path = REPO_ROOT / "custom-skills" / skill_name / "SKILL.md"
    if not path.exists():
        pytest.skip(f"{skill_name} not present in this worktree")
    fm = skill_crawler.parse_frontmatter(path.read_text(encoding="utf-8"))
    desc = fm.get("description", "")
    # .strip() so a future fallback-parser tweak that leaves trailing
    # whitespace (e.g. "> ", ">\n") can't sneak past this regression check.
    assert desc.strip() not in (">", "|", ""), (
        f"{skill_name}: description is just the indicator char "
        f"(or empty/whitespace) — the folded-scalar bug has regressed."
    )
    assert len(desc) >= _MIN_REAL_DESC_LEN, (
        f"{skill_name}: description is {len(desc)} chars, expected "
        f">= {_MIN_REAL_DESC_LEN}. Either the description got "
        f"unrealistically short or the crawler is misparsing."
    )
