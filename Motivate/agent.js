#!/usr/bin/env node
/**
 * Motivation Coding Agent
 * Uses Claude + tool use loop to autonomously finalize the Motivation app.
 * Run: node agent.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const Anthropic = require('@anthropic-ai/sdk');
const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT   = __dirname;
const rawKey = process.env.ANTHROPIC_API_KEY || '';
const client = rawKey.startsWith('sk-ant-oat01-')
  ? new Anthropic({ authToken: rawKey })
  : new Anthropic({ apiKey: rawKey });

// ─── Tools ────────────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'read_file',
    description: 'Read any file in the motivation/ project (path relative to motivation/ root)',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write (overwrite) a file in the motivation/ project',
    input_schema: {
      type: 'object',
      properties: {
        path:    { type: 'string' },
        content: { type: 'string' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'list_files',
    description: 'List all source files in the project (excludes node_modules)',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'grep',
    description: 'Search for a regex pattern across project files (excludes node_modules)',
    input_schema: {
      type: 'object',
      properties: {
        pattern:   { type: 'string', description: 'Regex or literal to search for' },
        file_glob: { type: 'string', description: 'Optional filename glob, e.g. "*.js" or "*.html"' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'bash',
    description: 'Run a shell command inside the motivation/ directory',
    input_schema: {
      type: 'object',
      properties: { cmd: { type: 'string' } },
      required: ['cmd'],
    },
  },
  {
    name: 'done',
    description: 'Call this when all fixes are complete. Pass a summary of every change made.',
    input_schema: {
      type: 'object',
      properties: { summary: { type: 'string' } },
      required: ['summary'],
    },
  },
];

function runTool(name, input) {
  switch (name) {
    case 'read_file': {
      const fp = path.join(ROOT, input.path);
      if (!fs.existsSync(fp)) return `ERROR: file not found — ${input.path}`;
      return fs.readFileSync(fp, 'utf8');
    }
    case 'write_file': {
      const fp = path.join(ROOT, input.path);
      fs.mkdirSync(path.dirname(fp), { recursive: true });
      fs.writeFileSync(fp, input.content, 'utf8');
      return `OK — wrote ${input.path} (${input.content.length} bytes)`;
    }
    case 'list_files': {
      try {
        return execSync(
          'find . -type f -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/output/*"',
          { cwd: ROOT, encoding: 'utf8' }
        ).trim();
      } catch (e) { return e.message; }
    }
    case 'grep': {
      const include = input.file_glob ? `--include="${input.file_glob}"` : '';
      try {
        return execSync(
          `grep -rn ${include} --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=output "${input.pattern}" .`,
          { cwd: ROOT, encoding: 'utf8' }
        ).trim() || '(no matches)';
      } catch (e) {
        return e.stdout?.trim() || '(no matches)';
      }
    }
    case 'bash': {
      try {
        return execSync(input.cmd, { cwd: ROOT, encoding: 'utf8', timeout: 30000 }).trim();
      } catch (e) {
        return `EXIT ${e.status}\n${e.stdout || ''}\n${e.stderr || ''}`.trim();
      }
    }
    case 'done':
      return '__DONE__';
    default:
      return `Unknown tool: ${name}`;
  }
}

// ─── Agent loop ───────────────────────────────────────────────────────────────

const SYSTEM = `\
You are a senior Node.js/Electron engineer finalizing the "Motivation" app.

The app runs in the system tray and every day:
  - 7:15 AM: generates a quote image → posts to TikTok (+ optional platforms)
  - 9:00 AM: generates a ~60s motivational video (Pexels clips + Windows TTS + dubstep) → posts to TikTok

Stack: Electron 28, Node 18+, @anthropic-ai/sdk, Pexels API, googleapis, fluent-ffmpeg, node-cron

Known issues (verify each and fix if real):
1. env.missing() in server/env.js does NOT detect placeholder values ("your-api-key-here").
   Result: app boots as if keys are set, then crashes at API call time.
2. renderer/app.js was fixed (const { motivation } = window → const api = window.motivation)
   but quote.html, quoteprogress.html, progress.html may still have the old pattern inside <script> tags.
3. publisher.js — if zero platforms are configured, it throws and kills the job.
   Should succeed silently (skip unconfigured platforms, only throw if ALL fail AND at least one was attempted).
4. The "done" screen in setup.html says "7:15 AM quote + 9:00 AM video" — verify those match main.js cron times.
5. Any other bugs you find while reading the code.

Workflow:
1. Use list_files to see what exists.
2. Read every relevant source file.
3. Use grep to find all instances of known bad patterns.
4. Fix every issue by writing corrected files.
5. Call done() with a clear summary of every change made.

Do NOT modify node_modules, .git, or output/. Do NOT run npm install or electron.
Be precise — rewrite only what needs changing.`;

async function main() {
  console.log('⚡ Motivation Coding Agent\n');

  const messages = [
    {
      role: 'user',
      content: 'Analyze the Motivation app, find every bug and rough edge, and fix them all. Call done() when finished.',
    },
  ];

  let iters = 0;
  while (iters++ < 30) {
    const resp = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 8192,
      system:     SYSTEM,
      tools:      TOOLS,
      messages,
    });

    // Print any text the agent produces
    for (const blk of resp.content) {
      if (blk.type === 'text' && blk.text.trim()) {
        console.log('\n' + blk.text);
      }
    }

    if (resp.stop_reason === 'end_turn') {
      console.log('\n✅ Agent finished (end_turn).');
      break;
    }

    if (resp.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: resp.content });

      const results = [];
      for (const blk of resp.content) {
        if (blk.type !== 'tool_use') continue;

        // Log the call
        const argStr = JSON.stringify(blk.input);
        console.log(`\n🔧 ${blk.name}  ${argStr.length > 100 ? argStr.slice(0, 100) + '…' : argStr}`);

        const output = runTool(blk.name, blk.input);

        if (output === '__DONE__') {
          const summary = blk.input.summary || '(no summary)';
          console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('✅  All fixes applied.\n');
          console.log(summary);
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          fs.writeFileSync(path.join(ROOT, 'agent-log.md'), `# Agent fix log\n\n${summary}\n`, 'utf8');
          process.exit(0);
        }

        results.push({ type: 'tool_result', tool_use_id: blk.id, content: output });
      }

      messages.push({ role: 'user', content: results });
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
