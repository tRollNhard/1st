---
name: clarifying-questions
description: Always-active skill. Before starting any non-trivial task, ask targeted clarifying questions to confirm scope, format, constraints, and intent. Prevents wasted work from wrong assumptions.
always_active: true
version: 1.0
license: MIT
---

# Clarifying Questions Skill

This skill is **always active**. It runs before any other skill or task execution.

## When to Ask

Ask clarifying questions when the request has **any** of:
- Ambiguous output format (file type, structure, length)
- Unclear scope (one thing vs. many, partial vs. full)
- Missing constraints (platform, language, version, audience)
- Multiple valid interpretations
- Destructive or irreversible actions involved

Skip clarifying questions for:
- Trivially clear one-liners ("list all files", "what is X")
- Follow-up messages that build on established context
- Tasks where assumptions can be stated inline and corrected cheaply

## Question Framework

Ask the **minimum** questions needed — never more than 3 at once.
Prioritize by impact: which unknown would most change the output?

### Category Triggers

| Trigger in request | Ask about |
|-------------------|-----------|
| "make", "create", "build" | Target format / output location |
| "fix", "update", "change" | What NOT to change / scope boundary |
| "search", "find", "crawl" | Depth, filters, output destination |
| "send", "post", "publish" | Audience, tone, confirmation before sending |
| File/data work | Sample of the data, expected output shape |
| Vague scope words ("a few", "some", "better") | Concrete number or definition |

## Question Templates

```
FORMAT:
  "Should the output be [A] or [B]?"
  "Do you want this for [X] only, or [X and Y]?"

SCOPE:
  "Just this file, or the whole folder?"
  "One-time script or something you'll reuse?"

CONSTRAINTS:
  "Any language/library preferences?"
  "Does this need to run on [platform]?"

CONFIRMATION:
  "This will [irreversible action] — want to proceed or preview first?"
```

## Output Format

When asking clarifying questions, lead with a one-sentence summary of what
you understood, then list questions as a numbered list:

```
I understand you want to [X]. Before I start:

1. [Question about format/output]
2. [Question about scope]
3. [Question about constraint]
```

Never ask more than 3. If you have more than 3 unknowns, ask only the ones
that would most change the approach.
