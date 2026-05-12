// Single source of truth for Anthropic model IDs used by Open Claude Cowork.
//
// Why this exists
// ---------------
// PR #10 (commit 1aac28e, merged 2026-05-12) fixed four call sites that hand-
// typed fabricated model IDs (`claude-sonnet-4-6-20250620`, `claude-opus-4-6-
// 20250620` — Anthropic dropped the date suffix starting at the 4.6 gen, so
// those IDs 404 the API). That was a symptom fix. The root cause was that
// every consumer carried its own string literal, so a typo had four chances
// to slip past review. This module is the cure: import from here, never
// hand-type a model ID anywhere else in the repo.
//
// Industry pattern alignment
// --------------------------
// - Mirrors the "model registry" pattern from Vercel AI SDK's `customProvider`
//   (semantic aliases like `opus`, `sonnet`, `haiku` -> concrete IDs).
// - Uses `Object.freeze` — the standard JS-without-TypeScript way to express
//   an immutable constant set (MDN; widely-used JS-enum convention).
// - Verified against docs.anthropic.com/en/docs/about-claude/models/overview.
//
// Maintenance
// -----------
// When Anthropic ships a new ID, update it HERE only. A grep check
// (`npm run check:models`) blocks any bare `claude-(opus|sonnet|haiku)-N`
// string from sneaking back into the tracked codebase outside the allowlist.

const MODELS = Object.freeze({
  SONNET:  'claude-sonnet-4-6',
  OPUS:    'claude-opus-4-7',
  HAIKU:   'claude-haiku-4-5-20251001',
  DEFAULT: 'claude-sonnet-4-6',
});

const VALID = new Set(Object.values(MODELS));

// Best-effort runtime validation: at startup, fetch Anthropic's live model
// list and warn on any configured ID that isn't there. Non-fatal — server
// continues regardless. Skips silently when no API key is configured.
//
// Not wired into the server in this PR (kept scope tight); exported here so
// a future change can call it from server/index.js inside the app.listen
// callback without another refactor.
async function validateAgainstApi(client) {
  try {
    const response = await client.models.list({ limit: 100 });
    const apiIds = new Set(response.data.map(m => m.id));
    const configured = [...VALID];
    const unknown = configured.filter(id => !apiIds.has(id));

    if (unknown.length) {
      console.warn('[MODELS] Configured IDs not found in Anthropic API list:', unknown);
      console.warn('[MODELS]   See docs.anthropic.com/en/docs/about-claude/models/overview');
      return { ok: false, unknown };
    }
    console.log(`[MODELS] Validated ${configured.length} IDs against Anthropic API`);
    return { ok: true, unknown: [] };
  } catch (err) {
    if (err && (err.status === 401 || /api[_ -]?key/i.test(err.message || ''))) {
      console.warn('[MODELS] Validation skipped: ANTHROPIC_API_KEY missing or invalid');
    } else {
      console.warn('[MODELS] Validation failed (non-fatal):', err.message || err);
    }
    return { ok: false, error: err.message || String(err) };
  }
}

module.exports = { MODELS, VALID, validateAgainstApi };
