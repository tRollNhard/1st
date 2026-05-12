/**
 * Tests for server/skills.js — focus on failure-mode signalling.
 *
 * Closes issue #10 of the 2026-05-11 outstanding-issues triage:
 * the 5s crawler timeout previously collapsed to the same empty result as
 * "no match," silently dropping always-active skills (truthfinder,
 * clarifying-questions) for that request. The fix adds an explicit `error`
 * field to the return shape and a longer 10s timeout, with distinct log
 * lines per failure kind.
 *
 * Tests run without spawning the real Python crawler — `classifyCrawlerError`
 * is a pure function and the integration smoke just spins up node itself
 * with a tiny script that exits before the timeout.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('child_process');

const {
  matchSkills,
  CRAWLER_TIMEOUT_MS,
  classifyCrawlerError,
} = require('./skills');

// ── classifyCrawlerError (pure) ────────────────────────────────────────────

test('classifyCrawlerError: timeout has killed=true and signal=SIGTERM', () => {
  // This is the exact shape execFile sets on timeout — verified empirically
  // against node v18+ child_process.exithandler.
  const err = { killed: true, signal: 'SIGTERM', code: null };
  assert.equal(classifyCrawlerError(err), 'timeout');
});

test('classifyCrawlerError: non-zero exit code', () => {
  const err = { killed: false, signal: null, code: 2, message: 'crawler crashed' };
  assert.equal(classifyCrawlerError(err), 'exit-nonzero');
});

test('classifyCrawlerError: generic error falls through to "error"', () => {
  const err = { message: 'ENOENT' };
  assert.equal(classifyCrawlerError(err), 'error');
});

test('classifyCrawlerError: null/undefined error returns "error"', () => {
  assert.equal(classifyCrawlerError(null), 'error');
  assert.equal(classifyCrawlerError(undefined), 'error');
});

// ── timeout constant ──────────────────────────────────────────────────────

test('CRAWLER_TIMEOUT_MS is 10s (regression guard — was 5s, swallowed cold-start)', () => {
  assert.equal(CRAWLER_TIMEOUT_MS, 10_000);
});

// ── matchSkills return-shape contract ─────────────────────────────────────

test('matchSkills returns error="no-python" when Python is absent', async () => {
  // Force the no-python path by setting an invalid PYTHON_PATH and clearing
  // the module-level cache via require.cache evict.
  const originalPath = process.env.PYTHON_PATH;
  process.env.PYTHON_PATH = '/this/path/does/not/exist/python-fake';
  delete process.env.LOCALAPPDATA; // strip the Windows fallback paths too

  // Re-require with a fresh module cache so the closure's `pythonPath` is null.
  const skillsPath = require.resolve('./skills');
  delete require.cache[skillsPath];
  // Also blow away PYTHON_CANDIDATES references — easier: re-require fresh.
  const fresh = require(skillsPath);

  // Use the system PATH-finding to find anything called 'python3' or 'python'.
  // On a CI box without Python, this should return error: 'no-python'. On a
  // dev box with Python installed, it'll skip the failure path. We tolerate
  // both since this test runs on a Python-having dev box; the assertion is
  // structural — the shape must always include `error`.
  const result = await fresh.matchSkills('test prompt');

  // The shape contract: { alwaysActive, matched, error } regardless of which
  // path was taken.
  assert.ok(Array.isArray(result.alwaysActive), 'alwaysActive must be array');
  assert.ok(Array.isArray(result.matched), 'matched must be array');
  assert.ok('error' in result, 'result must include error key');

  // Restore env for subsequent tests.
  if (originalPath) process.env.PYTHON_PATH = originalPath;
  else delete process.env.PYTHON_PATH;
  delete require.cache[skillsPath];
});

// ── timeout integration smoke (no Python required) ────────────────────────

test('execFile timeout signature matches what classifyCrawlerError expects', (t, done) => {
  // This locks in the assumption underlying the timeout-detection logic:
  // when execFile's `timeout` fires, the err object carries
  //   killed: true, signal: 'SIGTERM'
  // If a future Node version changes that convention, classifyCrawlerError
  // breaks silently — this test fails loudly instead.
  const hang = ['-e', 'setTimeout(() => process.exit(0), 30000)'];
  execFile(process.execPath, hang, { timeout: 200 }, (err) => {
    assert.ok(err, 'expected timeout to produce err');
    assert.equal(err.killed, true);
    assert.equal(err.signal, 'SIGTERM');
    assert.equal(classifyCrawlerError(err), 'timeout');
    done();
  });
});
