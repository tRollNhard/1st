# 2026 Skill Efficiency Standard

Reference rubric used by the Sentinel Architect's `//audit` command. Aligned
with Anthropic's April 2026 official skill-authoring guidance:
[Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices).

Each skill is scored out of 100. Skills below 70 are candidates for refactor;
above 85 are well-formed and should only be touched if the projected gain
exceeds 15%.

---

## A. Frontmatter Validity (25 pts) — Anthropic-mandated

| Criterion                                                          | Pts |
|--------------------------------------------------------------------|-----|
| `---` delimited YAML frontmatter present                           | 4   |
| `name` field: ≤ 64 chars, lowercase/digits/hyphens only            | 6   |
| `name` does NOT contain reserved words "anthropic" or "claude"     | 4   |
| `description` field: non-empty, ≤ 1024 chars, no XML tags          | 6   |
| `name` matches parent folder name                                  | 5   |

> Only `name` and `description` are required by Anthropic. `always_active`,
> `version`, `compatibility`, etc. are optional. Their presence or absence
> does NOT affect the score.

## B. Description Quality (25 pts) — Anthropic's discovery rules

| Criterion                                                          | Pts |
|--------------------------------------------------------------------|-----|
| Written in **third person** (no "I can…" or "You can use this…")   | 8   |
| States WHAT the skill does                                         | 5   |
| States WHEN to use it (triggers, contexts, user phrases)           | 7   |
| Language is **"pushy"** — active verbs, not hedging                | 5   |

Per Anthropic: "Claude has a tendency to undertrigger skills — to not use
them when they'd be useful. To combat this, please make the skill
descriptions a little bit pushy."

Good example from Anthropic docs:
```yaml
description: Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF files or when the user mentions PDFs, forms, or document extraction.
```

Bad examples (Anthropic-flagged):
```yaml
description: Helps with documents
description: I can help you process Excel files
description: You can use this to process Excel files
```

## C. Naming Convention (10 pts)

| Criterion                                                          | Pts |
|--------------------------------------------------------------------|-----|
| Uses gerund form (`processing-pdfs`) or noun phrase (`pdf-processing`) | 5   |
| Specific, not generic (avoid `helper`, `utils`, `tools`)           | 5   |

Anthropic recommends gerund form as the default; noun-phrase and
action-oriented (`process-pdfs`) are acceptable alternatives.

## D. Body Structure (20 pts)

| Criterion                                                          | Pts |
|--------------------------------------------------------------------|-----|
| Body ≤ 500 lines (Anthropic's hard recommendation)                 | 6   |
| H1 title present, matches or closely mirrors `name`                | 3   |
| Named sections for each major behavior                             | 3   |
| At least one fenced code block showing canonical invocation        | 3   |
| Forward-slash paths only (`scripts/foo.py`, not `scripts\foo.py`)  | 3   |
| No time-sensitive content ("before August 2025…") in main sections | 2   |

## E. Script & Reference Integrity (10 pts)

| Criterion                                                          | Pts |
|--------------------------------------------------------------------|-----|
| Every referenced script path resolves on disk                      | 4   |
| References stay **one level deep** from SKILL.md (no nested hops)  | 3   |
| Execution intent is explicit ("Run `x.py`" vs. "See `x.py` for…")  | 3   |

## F. Uniqueness (10 pts)

| Criterion                                                          | Pts |
|--------------------------------------------------------------------|-----|
| Name does not collide with another skill in the society            | 4   |
| Description triggers do not fully overlap another skill            | 6   |

---

## Audit Flag Taxonomy

These flags match what `crawler.py` emits and map back to rubric sections:

| Flag                        | Deduction | Section |
|-----------------------------|-----------|---------|
| `missing-frontmatter`       | −25       | A       |
| `missing-name`              | −10       | A       |
| `name-too-long`             | −6        | A       |
| `name-bad-chars`            | −6        | A       |
| `name-reserved-word`        | −4        | A       |
| `name-folder-mismatch`      | −5        | A       |
| `missing-description`       | −18       | A + B   |
| `description-too-long`      | −6        | A       |
| `description-second-person` | −8        | B       |
| `description-vague`         | −12       | B       |
| `body-over-500-lines`       | −6        | D       |
| `windows-paths`             | −3        | D       |
| `broken-script-ref`         | −4        | E       |
| `nested-reference`          | −3        | E       |
| `duplicate-name`            | −4        | F       |
| `duplicate-triggers`        | −6        | F       |

---

## Refactor Decision Rule

```
projected_gain = target_score - current_score
if projected_gain > 15:    refactor
elif projected_gain > 5:   flag-only
else:                      no-op
```

Churn is worse than imperfection. A skill scoring 78 should not be refactored
to 82 — the diff cost outweighs the benefit for downstream agents that have
already cached the prior shape.

---

## What is NOT in this rubric (and why)

Previous versions of this file included the following rules, which were
REMOVED in the 2026-04-16 update because they are not supported by
Anthropic's official guidance:

- ~~"Description ≤ 80 words"~~ — Anthropic's cap is 1024 **characters**, no word cap.
- ~~"Anti-trigger clause required"~~ — Anthropic recommends positive pushy triggers only; anti-triggers belong in the body, not the description.
- ~~"`version` field required"~~ — only `name` and `description` are required.
- ~~"`always_active` explicitly set"~~ — optional, not part of Anthropic's schema.

If a future Anthropic doc re-introduces any of these, reinstate them with a
citation to the specific URL and retrieval date.
