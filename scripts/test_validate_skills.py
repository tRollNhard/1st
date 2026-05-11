"""Tests for scripts/validate-skills.py.

The validator script has a hyphen in its filename so it can't be imported
with a plain `import` statement. We load it via importlib.util once per
module and reuse the resulting module across tests.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

SCRIPT_PATH = Path(__file__).parent / "validate-skills.py"


@pytest.fixture(scope="module")
def validator():
    """Load validate-skills.py as an importable module."""
    spec = importlib.util.spec_from_file_location("_validate_skills", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _write_skill(tmp_path: Path, dir_name: str, frontmatter: str,
                 body: str = "# skill body") -> Path:
    """Create a skill directory with a SKILL.md and return its path."""
    skill_dir = tmp_path / dir_name
    skill_dir.mkdir()
    skill_md = skill_dir / "SKILL.md"
    skill_md.write_text(f"---\n{frontmatter}\n---\n\n{body}\n", encoding="utf-8")
    return skill_md


def test_valid_skill_returns_no_errors(validator, tmp_path):
    p = _write_skill(
        tmp_path, "my-skill",
        "name: my-skill\ndescription: A valid skill\nlicense: MIT",
    )
    assert validator.validate(p) == []


def test_missing_name_is_error(validator, tmp_path):
    p = _write_skill(
        tmp_path, "my-skill",
        "description: missing name\nlicense: MIT",
    )
    errors = validator.validate(p)
    assert any("missing required field 'name'" in e for e in errors)


def test_uppercase_name_rejected(validator, tmp_path):
    p = _write_skill(
        tmp_path, "MyBadSkill",
        "name: MyBadSkill\ndescription: bad name\nlicense: MIT",
    )
    errors = validator.validate(p)
    assert any("kebab-case" in e for e in errors)


def test_digit_start_name_rejected(validator, tmp_path):
    p = _write_skill(
        tmp_path, "1stskill",
        "name: 1stskill\ndescription: starts with digit\nlicense: MIT",
    )
    errors = validator.validate(p)
    assert any("kebab-case" in e for e in errors)


def test_name_directory_mismatch_is_error(validator, tmp_path):
    p = _write_skill(
        tmp_path, "actual-dir",
        "name: different-name\ndescription: mismatch\nlicense: MIT",
    )
    errors = validator.validate(p)
    assert any("does not match directory" in e for e in errors)


def test_missing_description_is_error(validator, tmp_path):
    p = _write_skill(
        tmp_path, "my-skill",
        "name: my-skill\nlicense: MIT",
    )
    errors = validator.validate(p)
    assert any("missing required field 'description'" in e for e in errors)


def test_non_string_description_rejected(validator, tmp_path):
    p = _write_skill(
        tmp_path, "my-skill",
        "name: my-skill\ndescription:\n  - bullet one\n  - bullet two\nlicense: MIT",
    )
    errors = validator.validate(p)
    assert any("description must be a string" in e for e in errors)


def test_allowed_tools_as_list_rejected(validator, tmp_path):
    """The surprise from the original review: YAML list shape is invalid."""
    p = _write_skill(
        tmp_path, "my-skill",
        'name: my-skill\ndescription: valid\nlicense: MIT\nallowed-tools: [Read, Edit]',
    )
    errors = validator.validate(p)
    assert any("allowed-tools must be a string" in e for e in errors)


def test_allowed_tools_as_string_accepted(validator, tmp_path):
    p = _write_skill(
        tmp_path, "my-skill",
        'name: my-skill\ndescription: valid\nlicense: MIT\nallowed-tools: "Read, Edit"',
    )
    assert validator.validate(p) == []


def test_missing_license_is_warning_not_error(validator, tmp_path, capsys):
    """License is recommended, not required. Absence prints a warning but
    does not produce a validation error."""
    p = _write_skill(
        tmp_path, "my-skill",
        "name: my-skill\ndescription: no license",
    )
    assert validator.validate(p) == []
    out = capsys.readouterr().out
    assert "license" in out.lower()


def test_missing_frontmatter_is_error(validator, tmp_path):
    skill_dir = tmp_path / "my-skill"
    skill_dir.mkdir()
    skill_md = skill_dir / "SKILL.md"
    skill_md.write_text("# body with no frontmatter\n", encoding="utf-8")
    errors = validator.validate(skill_md)
    assert any("missing or unparseable frontmatter" in e for e in errors)


def test_folded_scalar_description_accepted(validator, tmp_path):
    """Folded scalars (description: >) must parse as strings, not as the
    indicator character — guards against re-introducing the crawler bug."""
    p = _write_skill(
        tmp_path, "my-skill",
        "name: my-skill\ndescription: >\n  This is a folded\n  scalar description.\nlicense: MIT",
    )
    assert validator.validate(p) == []
