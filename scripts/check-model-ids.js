#!/usr/bin/env node
// Layer-2 enforcement for the model-ID SSoT in server/models.js.
//
// Fails (exit 1) if any tracked file outside the allowlist contains a bare
// `claude-(opus|sonnet|haiku)-N` string. The single allowed home for those
// strings is server/models.js. CHANGELOG/docs mention the IDs in prose and
// are allowlisted. Vendored example files under Skills.md/files/ are also
// allowlisted (they ship a deprecated Sonnet 4 ID intentionally as part of
// the example).
//
// renderer/index.html is **deliberately** allowlisted as a known secondary
// source. The renderer is a static HTML <select> that can't `require()` a
// Node module — populating from the SSoT at runtime would require adding a
// `/api/models` endpoint, a preload bridge, and dropdown-population JS. Out
// of scope for this PR. To compensate, this script verifies that every
// `<option value="...">` in the renderer dropdown is one of the IDs in
// server/models.js. If they drift, the check fails.
//
// Run manually:  node scripts/check-model-ids.js
// Or via npm:    npm run check:models

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { VALID, MODELS } = require(path.join(__dirname, '..', 'server', 'models'));

// Files allowed to mention bare model IDs in prose / vendored examples.
// Order doesn't matter; first-match wins.
const PROSE_ALLOWLIST = [
  /^server[\\/]models\.js$/,
  /^CHANGELOG\.md$/,
  /^Skills\.md[\\/]/,
  /^scripts[\\/]check-model-ids\.js$/,
  /^scratch[\\/]/,
  /^node_modules[\\/]/,
  /^\.git[\\/]/,
  // Motivate/ is a separate sub-project — out of scope per task brief.
  /^Motivate[\\/]/,
  // Smilee visualizer is offline-only; never touched by this refactor.
  /^visualization[\\/]/,
  // .claude worktrees are scratch session state, not tracked source.
  /^\.claude[\\/]/,
];

// renderer/index.html is a special case: bare IDs are allowed, but every
// one must match the SSoT. Handled separately below.
const RENDERER_HTML = path.join('renderer', 'index.html');

const PATTERN = /claude-(opus|sonnet|haiku)-[0-9][\w-]*/g;

function isProseAllowed(file) {
  return PROSE_ALLOWLIST.some(rx => rx.test(file));
}

// `git ls-files` is the canonical "tracked files" list and is fast on any
// platform. Falls back to an error if git is unavailable.
let tracked;
try {
  tracked = execSync('git ls-files', {
    encoding: 'utf-8',
    cwd: path.join(__dirname, '..'),
  }).split('\n').filter(Boolean);
} catch (err) {
  console.error('[check:models] git ls-files failed:', err.message);
  process.exit(2);
}

const violations = [];
const rendererViolations = [];

for (const file of tracked) {
  const isRenderer = file === RENDERER_HTML || file === RENDERER_HTML.replace(/\\/g, '/');

  if (!isRenderer && isProseAllowed(file)) continue;

  let content;
  try {
    content = fs.readFileSync(path.join(__dirname, '..', file), 'utf-8');
  } catch {
    continue; // binary or unreadable — skip
  }
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    const matches = line.match(PATTERN);
    if (!matches) return;

    if (isRenderer) {
      // Renderer is allowed to carry IDs, but they MUST match the SSoT.
      for (const match of matches) {
        if (!VALID.has(match)) {
          rendererViolations.push({
            file, line: idx + 1, id: match, text: line.trim().slice(0, 160),
          });
        }
      }
    } else {
      violations.push({ file, line: idx + 1, text: line.trim().slice(0, 160) });
    }
  });
}

if (violations.length > 0 || rendererViolations.length > 0) {
  if (violations.length > 0) {
    console.error(`[check:models] FAIL - ${violations.length} bare Claude model ID(s) outside server/models.js:`);
    console.error('');
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line}`);
      console.error(`    ${v.text}`);
    }
    console.error('');
    console.error('Fix: import the ID from server/models.js instead of hard-coding it.');
    console.error('  const { MODELS } = require(\'./models\');');
    console.error('  client.messages.create({ model: MODELS.SONNET, ... })');
    console.error('');
  }

  if (rendererViolations.length > 0) {
    console.error(`[check:models] FAIL - ${rendererViolations.length} renderer/index.html dropdown ID(s) not in SSoT:`);
    console.error('');
    for (const v of rendererViolations) {
      console.error(`  ${v.file}:${v.line}  unknown ID "${v.id}"`);
      console.error(`    ${v.text}`);
    }
    console.error('');
    console.error('Fix: update renderer/index.html to use one of the IDs in server/models.js:');
    for (const [key, id] of Object.entries(MODELS)) {
      console.error(`  ${key} = ${id}`);
    }
    console.error('');
  }

  process.exit(1);
}

console.log(`[check:models] OK - ${tracked.length} tracked files scanned, no bare model IDs outside server/models.js.`);
console.log(`[check:models] OK - renderer/index.html dropdown options all match the SSoT.`);
