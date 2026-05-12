#!/usr/bin/env node
/**
 * code-improver.js — standalone code review agent.
 *
 * Scans a file or directory for readability, performance, and best-practice
 * issues using Claude (Anthropic SDK). Shares the same always-active skill
 * (`custom-skills/code-improver/SKILL.md`) used in chat + Cowork, so review
 * behavior is identical across all three surfaces.
 *
 * Usage:
 *   node scripts/code-improver.js <file-or-dir> [--json] [--max-bytes N]
 *   npm run review -- server/providers.js
 *   npm run review -- server/               # recursive
 *
 * Exit codes:
 *   0 — review completed (issues may or may not exist)
 *   1 — bad arguments / unreadable path
 *   2 — API error
 */

const fs = require('fs');
const path = require('path');

// SDK is installed under server/node_modules — resolve from there so this
// script works without a duplicate root-level install.
const Anthropic = require(
  path.join(__dirname, '..', 'server', 'node_modules', '@anthropic-ai', 'sdk')
);
const { MODELS } = require(path.join(__dirname, '..', 'server', 'models'));

// ── Config ──────────────────────────────────────────────────────────────────

const MODEL = MODELS.SONNET;
const MAX_BYTES_DEFAULT = 120_000;           // per-file cap; skip larger files by default
const SKILL_PATH = path.join(
  __dirname, '..', 'custom-skills', 'code-improver', 'SKILL.md'
);

// Extensions we consider reviewable source code
const REVIEWABLE_EXTS = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift',
  '.c', '.h', '.cc', '.cpp', '.hpp',
  '.cs', '.php', '.sh', '.bash', '.ps1',
  '.sql', '.lua', '.r',
  '.html', '.css', '.scss', '.vue', '.svelte',
]);

// Directories to always skip
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out',
  '__pycache__', '.venv', 'venv', '.next', '.cache',
  'coverage', '.turbo',
]);

// ── File collection ─────────────────────────────────────────────────────────

function collectFiles(target, maxBytes) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];

  const results = [];
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(path.join(dir, entry.name));
      } else if (entry.isFile()) {
        const full = path.join(dir, entry.name);
        const ext = path.extname(full).toLowerCase();
        if (!REVIEWABLE_EXTS.has(ext)) continue;
        const size = fs.statSync(full).size;
        if (size > maxBytes) continue;
        results.push(full);
      }
    }
  }
  walk(target);
  return results;
}

// ── Skill loading ───────────────────────────────────────────────────────────

function loadSkill() {
  try {
    return fs.readFileSync(SKILL_PATH, 'utf-8');
  } catch (err) {
    console.error(`warning: could not read skill at ${SKILL_PATH}: ${err.message}`);
    return '';
  }
}

// ── Review call ─────────────────────────────────────────────────────────────

async function reviewFile(client, filePath, skillContent) {
  const source = fs.readFileSync(filePath, 'utf-8');
  const lang = path.extname(filePath).slice(1) || 'text';
  const rel = path.relative(process.cwd(), filePath);

  const systemPrompt =
    'You are the code-improver agent. Apply the skill below exactly as written. ' +
    'Output the issue blocks and the final Summary line. Nothing else.\n\n' +
    skillContent;

  const userPrompt =
    `File: ${rel}\n` +
    `Language hint: ${lang}\n` +
    `\n\`\`\`${lang}\n${source}\n\`\`\`\n`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  return { file: rel, review: text };
}

// ── Formatting ──────────────────────────────────────────────────────────────

function formatReport(results) {
  const lines = [];
  for (const r of results) {
    lines.push('='.repeat(78));
    lines.push(r.file);
    lines.push('='.repeat(78));
    lines.push(r.review.trim());
    lines.push('');
  }
  return lines.join('\n');
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { target: null, json: false, maxBytes: MAX_BYTES_DEFAULT };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--json') args.json = true;
    else if (a === '--max-bytes') args.maxBytes = parseInt(rest[++i], 10);
    else if (a === '-h' || a === '--help') args.help = true;
    else if (!args.target) args.target = a;
  }
  return args;
}

function usage() {
  return [
    'code-improver — scan code for readability, performance, best-practice issues.',
    '',
    'Usage:',
    '  node scripts/code-improver.js <file-or-dir> [--json] [--max-bytes N]',
    '  npm run review -- <file-or-dir>',
    '',
    'Options:',
    '  --json         Emit JSON instead of formatted text.',
    '  --max-bytes N  Skip files larger than N bytes (default 120000).',
    '',
    'Requires ANTHROPIC_API_KEY in the environment.',
  ].join('\n');
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.help || !args.target) {
    console.log(usage());
    process.exit(args.help ? 0 : 1);
  }

  if (!fs.existsSync(args.target)) {
    console.error(`error: path not found: ${args.target}`);
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('error: ANTHROPIC_API_KEY is not set.');
    process.exit(1);
  }

  const skillContent = loadSkill();
  const files = collectFiles(args.target, args.maxBytes);
  if (files.length === 0) {
    console.error('error: no reviewable source files found.');
    process.exit(1);
  }

  const client = new Anthropic();
  const results = [];

  for (const f of files) {
    process.stderr.write(`reviewing ${path.relative(process.cwd(), f)}... `);
    try {
      const r = await reviewFile(client, f, skillContent);
      results.push(r);
      process.stderr.write('done\n');
    } catch (err) {
      process.stderr.write(`failed: ${err.message}\n`);
      results.push({ file: f, review: `ERROR: ${err.message}` });
    }
  }

  if (args.json) {
    process.stdout.write(JSON.stringify(results, null, 2) + '\n');
  } else {
    process.stdout.write(formatReport(results) + '\n');
  }
}

// ── Exports (for programmatic use from server/providers.js etc.) ────────────

module.exports = {
  collectFiles,
  loadSkill,
  reviewFile,
  formatReport,
};

// Run only when invoked directly
if (require.main === module) {
  main().catch((err) => {
    console.error(`fatal: ${err.message}`);
    process.exit(2);
  });
}
