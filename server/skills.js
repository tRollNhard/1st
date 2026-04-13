const { execFile } = require('child_process');
const path = require('path');

const CRAWLER_PATH = path.join(__dirname, '..', 'skill_crawler.py');

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
 * Run skill_crawler.py with a prompt and return the matched skill names.
 * Returns { alwaysActive: string[], matched: string[] }
 */
async function matchSkills(prompt) {
  const python = await findPython();
  if (!python) {
    return { alwaysActive: [], matched: [] };
  }

  return new Promise((resolve) => {
    execFile(python, [CRAWLER_PATH, '--json', prompt], {
      timeout: 5000,
      cwd: path.join(__dirname, '..'),
    }, (err, stdout) => {
      if (err) {
        console.warn('[SKILLS] Crawler error:', err.message);
        return resolve({ alwaysActive: [], matched: [] });
      }
      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch {
        console.warn('[SKILLS] Could not parse crawler output');
        resolve({ alwaysActive: [], matched: [] });
      }
    });
  });
}

module.exports = { matchSkills };
