const { execFile } = require('child_process');
const path = require('path');

const CRAWLER_PATH = path.join(__dirname, '..', 'skill_crawler.py');

// 10s. Was 5s — bumped because `skill_crawler.py` does filesystem I/O across
// every SKILL.md under `custom-skills/` plus archive scans, and on a cold
// disk + first-message-of-the-session that exceeded 5s often enough that
// always-active skills (truthfinder, clarifying-questions) were silently
// dropping for the *first* reply of a session.
const CRAWLER_TIMEOUT_MS = 10_000;

// Try common Python locations on Windows
const PYTHON_CANDIDATES = [
  process.env.PYTHON_PATH,
  'python3',
  'python',
  path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312', 'python.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python311', 'python.exe'),
].filter(Boolean);

let pythonPath = null;

async function findPython() {
  if (pythonPath) return pythonPath;

  for (const candidate of PYTHON_CANDIDATES) {
    try {
      await new Promise((resolve, reject) => {
        execFile(candidate, ['--version'], (err) => err ? reject(err) : resolve());
      });
      pythonPath = candidate;
      console.log(`[SKILLS] Using Python: ${candidate}`);
      return pythonPath;
    } catch {
      continue;
    }
  }
  console.warn('[SKILLS] Python not found — skill matching disabled');
  return null;
}

/**
 * Classify an execFile error so the caller can distinguish a timeout from
 * a crawler crash from a parse failure. All three previously collapsed to
 * `{ alwaysActive: [], matched: [] }` — indistinguishable from a legitimate
 * "no skills matched" result. That meant always-active skills (truthfinder,
 * clarifying-questions) silently dropped on any crawler failure.
 *
 * execFile signals timeout via `err.killed === true && err.signal === 'SIGTERM'`
 * (NOT `err.code === 'ETIMEDOUT'`, despite what the Node fs docs imply —
 * child_process uses a different convention). See node/lib/child_process.js
 * `exithandler` for the timeout-vs-exit branching.
 */
function classifyCrawlerError(err) {
  if (err && err.killed === true && err.signal === 'SIGTERM') return 'timeout';
  if (err && typeof err.code === 'number' && err.code !== 0) return 'exit-nonzero';
  return 'error';
}

/**
 * Run skill_crawler.py with a prompt and return the matched skill names.
 *
 * Returns:
 *   {
 *     alwaysActive: skill[],   // always-active skills (truthfinder, clarifying-questions)
 *     matched: skill[],        // conditional matches (TOP_N capped, score >= 2)
 *     error: string | null,    // 'timeout' | 'exit-nonzero' | 'parse' | 'no-python' | null
 *   }
 *
 * On error, the arrays are still empty (caller can degrade gracefully), but
 * `error` is set so the caller can log/alert distinctly from a clean
 * no-match. Callers that don't need the distinction can keep destructuring
 * `{ alwaysActive, matched }` — `error` is additive and backward compatible.
 */
async function matchSkills(prompt) {
  const python = await findPython();
  if (!python) {
    return { alwaysActive: [], matched: [], error: 'no-python' };
  }

  return new Promise((resolve) => {
    execFile(python, [CRAWLER_PATH, '--json', prompt], {
      timeout: CRAWLER_TIMEOUT_MS,
      cwd: path.join(__dirname, '..'),
    }, (err, stdout) => {
      if (err) {
        const kind = classifyCrawlerError(err);
        if (kind === 'timeout') {
          // Distinct from a clean empty result: always-active skills are
          // dropping here. Loud enough to surface in dev logs without
          // crashing the request.
          console.warn(
            `[SKILLS] Crawler timed out after ${CRAWLER_TIMEOUT_MS}ms — ` +
            `always-active skills (truthfinder, clarifying-questions) ` +
            `dropped for this request. Prompt prefix: ${prompt.slice(0, 60)}`
          );
        } else {
          console.warn(`[SKILLS] Crawler ${kind}:`, err.message);
        }
        return resolve({ alwaysActive: [], matched: [], error: kind });
      }
      try {
        const result = JSON.parse(stdout);
        // Defensive: ensure both arrays exist on the return shape even if
        // the crawler ever ships an older JSON schema. `error: null` is
        // explicit so callers can `if (result.error)` cleanly.
        resolve({
          alwaysActive: result.alwaysActive || [],
          matched: result.matched || [],
          error: null,
        });
      } catch (parseErr) {
        console.warn(
          `[SKILLS] Could not parse crawler output ` +
          `(stdout ${stdout ? stdout.length : 0} chars): ${parseErr.message}`
        );
        resolve({ alwaysActive: [], matched: [], error: 'parse' });
      }
    });
  });
}

module.exports = { matchSkills, CRAWLER_TIMEOUT_MS, classifyCrawlerError };
