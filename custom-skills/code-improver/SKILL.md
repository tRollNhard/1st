---
name: code-improver
description: Always-active code review skill. Whenever the user shares code — pasted, referenced by file path, or implied by a task — scan it for readability, performance, and best-practice issues. For each issue, explain *why* it matters, show the current snippet, and provide an improved version. Applies to in-chat review, Cowork sessions, and standalone CLI use via `npm run review`.
always_active: true
version: 1.0
---

# Code Improver — Always-Active Review Skill

This skill is **always active** across chat, Cowork, and the standalone
`scripts/code-improver.js` CLI. Apply it whenever code is in scope.

Companion CLI: `npm run review -- <file-or-directory>`
Programmatic entry: `require('./scripts/code-improver')` → `{ reviewFile, reviewDirectory, formatReport }`.

---

## When to Engage

Engage automatically when any of the following is true:
- The user pastes code (any language) into the conversation.
- The user names a source file (`server/providers.js`, `main.py`, etc.).
- The user asks to refactor, optimize, clean up, "make this better", review a PR/diff, or debug.
- Code appears in a tool result (file read, git diff, grep match) that is relevant to the task.

Do **not** engage when:
- The user explicitly asks for something else and the code is incidental (e.g. "just run this").
- The code is a one-line example purely for illustration.
- The user says "don't review" / "skip review" / "just do X".

---

## The Three Lenses

Review every snippet through exactly these three lenses, in order:

### 1. Readability
- Naming: are identifiers self-explanatory at the point of use?
- Structure: function length, nesting depth, early returns vs. pyramids.
- Comments: absent where non-obvious? Redundant where obvious?
- Consistency: style matches surrounding code (spacing, quotes, casing)?

### 2. Performance
- Algorithmic: is there an O(n²) loop where O(n) would do? Repeated work inside a hot path?
- I/O: synchronous calls that should be async? Unbatched network/DB calls?
- Allocation: objects/arrays rebuilt every render/iteration? Regexes compiled in a loop?
- Memory: unbounded caches, leaks from retained closures or listeners.

### 3. Best Practices
- Correctness: off-by-one, null/undefined, error swallowing, race conditions.
- Security: injection (SQL / shell / XSS), hardcoded secrets, unsafe `eval`, path traversal.
- Language idioms: uses the language's native constructs (JS: `for...of`, optional chaining; Py: comprehensions, `with`).
- Testability: pure functions where possible, dependencies injected not imported in-place.
- Maintainability: dead code, duplicated blocks, magic numbers, missing types.

---

## Output Format

For each issue found, produce exactly this block:

````
### <N>. <Short title> — <Readability | Performance | Best Practice>

**Why it matters:** <1–2 sentences. Concrete consequence, not abstract principle.>

**Current:**
```<lang>
<exact snippet from the source>
```

**Improved:**
```<lang>
<minimal rewrite that fixes the issue and nothing else>
```
````

After all issue blocks, end with a one-line summary:

```
Summary: <N> issues — <X> readability, <Y> performance, <Z> best-practice.
```

### Rules for the output
- **Minimum change.** Do not rewrite code that isn't broken. One fix per block.
- **Preserve behavior** unless the behavior itself is the bug (then say so explicitly in "Why it matters").
- **No speculative refactors.** Don't introduce abstractions, configuration, or tests that weren't asked for.
- **Rank by impact.** Correctness/security issues first, then performance, then readability.
- **If nothing is wrong, say so.** Output: `No issues found — code is idiomatic and correct for its scope.` Do not invent problems.
- **Language tag the fences.** Always use `js`, `ts`, `py`, `go`, `rs`, `sh`, etc. — not bare ``` ```.

---

## Scope Discipline

- **Review what was shown, not what you imagine.** If the user pastes a function, don't critique the imagined caller.
- **File-level review:** at most 10 issues per file. If more exist, report the top 10 and note `<M> additional issues suppressed — ask to see them if wanted.`
- **Directory review (CLI):** summarize per-file counts in a table, then show the top 5 highest-impact issues across the whole tree.

---

## Edge Cases

- **Generated code** (bundler output, protobuf, migrations): skip readability lens, keep correctness/security.
- **Tests:** readability matters extra (tests are documentation); performance matters less.
- **Config files (JSON/YAML/TOML):** only flag schema or security issues, not "style."
- **Unfamiliar language:** if you are not confident in idiomatic patterns, say so and limit review to correctness/security.

---

## Interaction with Other Skills

- If `clarifying-questions` triggers (ambiguous request), ask questions **first**, then review.
- If `truthfinder` flags a source (e.g. copy-pasted code from a questionable site), surface the classification before reviewing.
- Does not override user refusal: "don't review" means don't review, even though this skill is always-active.
