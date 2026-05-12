"""Tests for skill_crawler.score_skill, decide, extract_trigger_words, and the SYNONYMS table.

These functions decide which skills reach Claude on every chat request. Today's
existing pytest covers parse_frontmatter (file I/O for frontmatter), but the
matching/decision logic was previously unguarded — a regression in the SYNONYMS
table, the scoring weights, or the `>= 2` threshold in `decide` would silently
change skill behavior with zero CI signal.

Contract anchors verified against skill_crawler.py at HEAD 5533606:

- TOP_N = 3 (decide returns at most 3 matches)
- decide threshold: score >= 2 to be returned
- score_skill weights:
    * exact skill["name"] as substring of expanded prompt: +15
    * each name word (>= 4 chars) appearing in prompt: +4
    * each `.ext` token in prompt that appears in description: +10
    * each format keyword (pptx/xlsx/docx/pdf/csv) in prompt that appears in description: +10
    * each trigger word appearing anywhere in prompt: +1
    * each whole-word prompt token (>= 4 chars) matching whole-word in description: +0.5
- skill name match is substring (NOT whole-word), e.g. "thing" matches "things"
- extract_trigger_words: r"[a-z]{4,}" -> lowercase only, 4+ chars, dedupe-preserve-order, STOP-filtered
- always-active skills are routed by load_all_skills, NOT decide — decide only sees `conditional`
- Sort uses Python stable sort; ties preserve input order (descending by score)
- expand_prompt: appends synonym expansions to the lowercased prompt when a SYNONYMS key is a substring
"""
from __future__ import annotations

import pytest

# sys.path setup lives in scripts/conftest.py
import skill_crawler


def _make_skill(name, description, *, always_active=False):
    """Build a skill dict shaped the way load_all_skills produces them."""
    return {
        "name": name,
        "display_name": name,
        "description": description,
        "path": f"/fake/{name}/SKILL.md",
        "triggers": skill_crawler.extract_trigger_words(description),
        "always_active": always_active,
    }


# --- extract_trigger_words ---------------------------------------------------

def test_extract_trigger_words_filters_short_and_stopwords():
    """Min length is 4 chars (r"[a-z]{4,}"), and the STOP list is applied."""
    triggers = skill_crawler.extract_trigger_words(
        "Use this skill whenever the user wants documents"
    )
    # "use" is 3 chars (filtered by regex), "this"/"the"/"user"/"wants" are STOP words,
    # "whenever" is NOT in STOP (despite being filler — that's the actual contract).
    assert "use" not in triggers
    assert "the" not in triggers
    assert "this" not in triggers
    assert "user" not in triggers
    assert "wants" not in triggers
    assert "documents" in triggers


def test_extract_trigger_words_dedupes_preserving_order():
    """Repeated words appear only once, in first-seen order."""
    triggers = skill_crawler.extract_trigger_words("zebra apple zebra banana apple")
    assert triggers == ["zebra", "apple", "banana"]


def test_extract_trigger_words_empty_when_only_stopwords():
    """A description made entirely of short words and STOP words yields no triggers."""
    assert skill_crawler.extract_trigger_words("the this that with from when") == []


# --- expand_prompt + SYNONYMS ------------------------------------------------

def test_expand_prompt_appends_synonyms_when_term_matches():
    """SYNONYMS["deck"] = ["pptx", "presentation", "slide"]: a prompt with 'deck'
    should get those terms appended so the scorer can hit pptx skill descriptions."""
    expanded = skill_crawler.expand_prompt("build me a deck")
    assert "pptx" in expanded
    assert "presentation" in expanded
    assert "slide" in expanded


def test_synonyms_table_contains_load_bearing_keys():
    """Lock in the synonym keys the README/UX promises. A typo here would
    silently break user expectations (e.g. removing 'deck' kills the
    'turn this PDF into a deck' workflow)."""
    required_keys = {"deck", "powerpoint", "slides", "spreadsheet", "excel",
                     "word", "video", "bug", "api", "test"}
    missing = required_keys - set(skill_crawler.SYNONYMS.keys())
    assert not missing, f"SYNONYMS table missing required keys: {missing}"


# --- score_skill: individual weight components -------------------------------

def test_score_exact_skill_name_in_prompt():
    """Skill name as substring of the expanded prompt is the strongest signal (+15)."""
    skill = _make_skill("pdf", "irrelevant description")
    # name "pdf" appears in prompt -> +15
    # Trigger 'irrelevant' / 'description' do NOT appear in prompt.
    # No format kw, no .ext match.
    assert skill_crawler.score_skill(skill, "help with pdf please") == 15.0


def test_score_skill_name_match_is_substring_not_whole_word():
    """Document the contract: skill name match uses `in`, not whole-word regex.
    A skill named 'thing' WILL match a prompt containing 'things'. This is a
    real behavior contract — if a future maintainer tightens it to whole-word,
    several existing skills will silently stop matching."""
    skill = _make_skill("thing", "x")
    # "thing" is substring of "things" -> +15
    score = skill_crawler.score_skill(skill, "I have many things to do")
    assert score >= 15.0


def test_score_synonym_expansion_deck_to_pptx():
    """'deck' in the prompt expands to include 'pptx'; a pptx skill with
    pptx in its description should now match. This is the workflow that
    makes 'turn this PDF into a deck' actually find the pptx skill."""
    skill = _make_skill("pptx", "Use this skill for pptx presentation deck")
    score_no_synonym = skill_crawler.score_skill(
        _make_skill("pptx", "irrelevant"),
        "build me a deck"
    )
    score_with_synonym = skill_crawler.score_skill(skill, "build me a deck")
    # The synonym-aware skill should score notably higher than the irrelevant baseline.
    assert score_with_synonym > score_no_synonym
    # And it should pass the decide threshold.
    assert score_with_synonym >= 2.0


def test_score_filename_extension_match():
    """A '.pdf' token in the prompt that also appears in the skill description
    contributes +10 via the ext-match branch."""
    skill_with_ext = _make_skill("documents", ".pdf files are supported")
    skill_without_ext = _make_skill("documents", "no extension here")
    score_with = skill_crawler.score_skill(skill_with_ext, "open my .pdf file")
    score_without = skill_crawler.score_skill(skill_without_ext, "open my .pdf file")
    # The ext-match branch adds +10 to the first skill that the second doesn't get.
    assert score_with - score_without >= 10.0


def test_score_format_keyword_match():
    """A format keyword (pptx/xlsx/docx/pdf/csv) in the prompt that also appears
    in the skill description contributes +10 via the format-kw branch."""
    skill = _make_skill("sheets", "spreadsheets via xlsx")
    # Prompt has 'xlsx', description has 'xlsx' -> format-kw branch fires.
    score = skill_crawler.score_skill(skill, "make me an xlsx file")
    # We expect at least +10 from format-kw alone. Other branches may add more,
    # but the floor proves the branch fired.
    assert score >= 10.0


def test_score_trigger_keyword_hit():
    """Each trigger word that appears in the prompt adds +1."""
    # Construct triggers explicitly so we know exactly what should hit.
    skill = {
        "name": "xyz",  # doesn't appear in prompt
        "description": "no overlap with prompt at all",  # no whole-word hits
        "triggers": ["docker", "kubernetes"],
        "always_active": False,
    }
    # Both triggers in prompt; no name match (skill name 'xyz' not in prompt);
    # no format kw; no .ext; description has no whole words matching prompt.
    score = skill_crawler.score_skill(skill, "deploy docker and kubernetes today")
    # 2 triggers * 1.0 + 0 + small whole-word overlap. The trigger contribution alone is 2.
    assert score >= 2.0


# --- decide: threshold + ordering --------------------------------------------

def test_decide_threshold_score_1_does_not_match():
    """A skill with exactly score = 1 must NOT appear in decide() output.
    This locks in the `>= 2` threshold. A single trigger hit alone is score 1."""
    skill = {
        "name": "xyzzy",  # not in prompt
        "description": "fffff",  # no whole-word overlap with prompt
        "triggers": ["onlyhit"],
        "always_active": False,
    }
    # Prompt contains exactly one trigger word and nothing else overlapping.
    assert skill_crawler.score_skill(skill, "onlyhit") == 1.0
    assert skill_crawler.decide("onlyhit", [skill]) == []


def test_decide_threshold_score_2_matches():
    """A skill with exactly score = 2 MUST appear in decide() output."""
    skill = {
        "name": "xyzzy",  # not in prompt
        "description": "fffff",  # no whole-word overlap
        "triggers": ["alpha", "beta"],
        "always_active": False,
    }
    assert skill_crawler.score_skill(skill, "alpha beta") == 2.0
    result = skill_crawler.decide("alpha beta", [skill])
    assert len(result) == 1
    assert result[0]["name"] == "xyzzy"


def test_decide_returns_top_n_capped_at_3():
    """When 4 skills all score above threshold, decide returns exactly TOP_N=3.

    All four skill names appear as substrings of the prompt, so each gets at least
    +15 from the name-match branch. The decide() function keeps the top 3 and
    discards the 4th. The exact identity of the dropped one depends on the
    secondary signals (trigger hits, whole-word desc hits), so the rock-solid
    assertion is len == TOP_N — that's what guards the TOP_N=3 contract."""
    skills = [
        _make_skill("alpha", "alphaword once"),
        _make_skill("beta", "betaword twice betaword"),
        _make_skill("gamma", "gammaword thrice gammaword gammaword"),
        _make_skill("delta", "deltaword four times deltaword deltaword deltaword"),
    ]
    prompt = "alpha beta gamma delta together"
    result = skill_crawler.decide(prompt, skills)
    assert len(result) == skill_crawler.TOP_N == 3
    # All returned skills must have scored at least 15 (each name is in prompt).
    for s in result:
        assert skill_crawler.score_skill(s, prompt) >= 15.0


def test_decide_orders_results_descending_by_score():
    """The returned list is sorted high-to-low. Highest scorer at index 0."""
    high = _make_skill("highscore", "highscore is the keyword")
    mid = _make_skill("midscore", "midscore matters")
    low = _make_skill("lowscore", "lowscore appears here")
    skills = [low, high, mid]  # Deliberately not in score order in the input
    # Prompt mentions all three names, but only one extra word that lifts 'high' above 'mid'.
    prompt = "I need highscore which is the keyword for highscore tasks midscore lowscore"
    result = skill_crawler.decide(prompt, skills)
    scores = [skill_crawler.score_skill(s, prompt) for s in result]
    assert scores == sorted(scores, reverse=True), (
        f"decide() returned skills out of score order: {scores}"
    )


def test_decide_empty_prompt_returns_empty_list():
    """An empty prompt scores 0 against everything and matches nothing."""
    skills = [_make_skill("pdf", "PDF tools"), _make_skill("pptx", "pptx tools")]
    assert skill_crawler.decide("", skills) == []


def test_decide_prompt_with_no_matches_returns_empty_list():
    """A prompt that doesn't overlap any skill yields an empty match list."""
    skills = [_make_skill("pdf", "PDF document handling"),
              _make_skill("pptx", "presentation slides")]
    assert skill_crawler.decide("xyzzy frobnicate qwertyuiop", skills) == []


def test_decide_only_filters_conditional_skills():
    """Always-active skills are routed by load_all_skills, not decide. decide() only
    sees the `conditional` list — this test confirms that even if an always-active
    skill is passed in (anti-pattern), decide treats it like any other and the
    `always_active` field doesn't bypass the score threshold.

    The real `always_active` bypass happens at the caller level (server/skills.js
    treats always-active skills as a separate list); this test enshrines that
    decide itself is a pure scoring function with no special-case for the flag."""
    always = _make_skill("clarifying-questions", "yzqyzq nothing here", always_active=True)
    # Even though always_active=True, this skill scores 0 against an empty prompt
    # and must NOT appear in decide() output. The `always_active` flag is honored
    # by the *caller*, not by decide.
    assert skill_crawler.decide("hello world", [always]) == []


# --- Real-world prompt parametrization ---------------------------------------

@pytest.mark.parametrize("prompt, expected_skill_name", [
    # "turn this PDF into a deck": both 'pdf' (substring of 'pdf' in prompt
    # via direct match) and 'pptx' (via 'deck' -> ['pptx', 'presentation', 'slide']
    # synonym expansion) should match. We pick 'pptx' as the canonical expected
    # match since that's the workflow the synonym table was designed to support.
    ("turn this PDF into a deck", "pptx"),
    # "build a video presentation": 'video' is both a skill name AND a SYNONYMS key
    # (expands to ['animation', 'render', 'remotion', 'motion']). The video skill
    # itself should easily match its own name.
    ("build a video presentation", "video"),
    # "post a tweet about it": 'tweet' is a name component; the tweet skill's
    # description mentions tweets and twitter.
    ("post a tweet about it", "tweet"),
])
def test_known_good_prompts_match_expected_skills(prompt, expected_skill_name):
    """Parametrized acceptance test: real prompts users will type should match
    the skills the synonym table + scoring weights were tuned for.

    This is the load-bearing integration test — if someone breaks the SYNONYMS
    table or the scoring weights, these prompts will stop matching and the
    user-facing skill routing will silently regress."""
    skills = [
        _make_skill("pdf", "Use this skill whenever the user wants anything with PDF files"),
        _make_skill("pptx", "Use this skill any time a .pptx file is involved presentation deck slides"),
        _make_skill("xlsx", "Use this skill any time a spreadsheet file is the primary input"),
        _make_skill("video", "Build videos with Remotion video animation render motion"),
        _make_skill("tweet", "Post tweets and social media updates to twitter"),
    ]
    matched_names = [s["name"] for s in skill_crawler.decide(prompt, skills)]
    assert expected_skill_name in matched_names, (
        f"Prompt {prompt!r} should match {expected_skill_name!r} but matched {matched_names!r}"
    )
