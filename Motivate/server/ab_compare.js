// A/B comparison: same script + voiceover + music; two distinct b-roll query strategies
// pulled from the same Pexels source. Output is two final MP4s for visual side-by-side.
//
// Run from Motivate/:  node server/ab_compare.js
// Output:              Motivate/output/<jobId>/A/final.mp4 and B/final.mp4

const path = require('path');
const fs = require('fs');
const { v4: uuid } = require('uuid');

// Load .env into process.env before requiring modules that read it.
const env = require('./env');
for (const [k, v] of Object.entries(env.readAll())) {
  if (!process.env[k]) process.env[k] = v;
}

const researcher   = require('./researcher');
const scriptwriter = require('./scriptwriter');
const tts          = require('./tts');
const videofetch   = require('./videofetch');
const music        = require('./music');
const assembler    = require('./assembler');

const STYLES = {
  A: { label: 'stationary heroic', query: 'silhouette mountain peak sunset' },
  B: { label: 'kinetic action',    query: 'silhouette running sunrise cliff' },
};

// Fallback used when ANTHROPIC_API_KEY is missing/invalid so the A/B can run.
// Daily flow still uses Claude when the real key is in .env.
const FALLBACK_SCRIPT = {
  topic: 'rising after failure',
  script: "You think failure is the end? It's the beginning. Every person you admire, every name you know — they fell first. Hard. In public. Sometimes more than once. The difference isn't talent. It isn't luck. It's that they got back up while you were still hiding. Failure isn't the opposite of success. It's part of it. Every no is data. Every collapse is information about what doesn't work, and that's how you find what does. Stop waiting for the wound to heal before you move. The wound heals while you walk. The world isn't watching to see if you're perfect. It's watching to see if you stand back up. So stand. Take the next step. The smallest one. Right now. That's how you rise.",
  caption: 'Failure isn\'t the end — it\'s the data. Stand up. #Mindset #Discipline #Motivation #Grit #RiseUp',
  title: 'Rising After Failure: The Mindset Shift That Changes Everything',
};

function looksLikeRealAnthropicKey(k) {
  if (!k || typeof k !== 'string') return false;
  if (!k.startsWith('sk-ant-')) return false;
  if (k.length < 30) return false;
  for (const ch of k) if (ch.charCodeAt(0) > 126) return false;
  return true;
}

function log(msg) {
  process.stdout.write(`[${new Date().toISOString().slice(11, 19)}] ${msg}\n`);
}

async function main() {
  const jobId = uuid();
  const baseDir = path.join(__dirname, '..', 'output', jobId);
  fs.mkdirSync(baseDir, { recursive: true });
  log(`A/B job ${jobId}`);
  log(`Output dir: ${baseDir}`);

  log("Picking today's topic...");
  const topic = researcher.getTodaysTopic();
  log(`Topic: ${topic}`);

  let scriptData;
  if (looksLikeRealAnthropicKey(process.env.ANTHROPIC_API_KEY)) {
    log('Writing script via Claude...');
    scriptData = await scriptwriter.writeScript(topic);
  } else {
    log('ANTHROPIC_API_KEY missing/invalid — using built-in fallback script for "rising after failure".');
    scriptData = FALLBACK_SCRIPT;
  }
  log(`Script (${scriptData.script.length} chars):\n${scriptData.script}`);
  fs.writeFileSync(path.join(baseDir, 'topic.txt'), topic + '\n', 'utf8');
  fs.writeFileSync(path.join(baseDir, 'script.txt'), scriptData.script + '\n', 'utf8');

  log('Generating voiceover via Windows TTS...');
  const voiceFile = await tts.generateVoiceover(scriptData.script, baseDir);
  log(`Voiceover: ${voiceFile}`);

  const musicTrack = music.getRandomTrack();
  log(`Music: ${musicTrack || '(none — assets/music dir empty)'}`);

  const results = {};
  for (const [key, style] of Object.entries(STYLES)) {
    log(`\n=== Video ${key} (${style.label}): query="${style.query}" ===`);
    const styleDir = path.join(baseDir, key);
    fs.mkdirSync(styleDir, { recursive: true });

    try {
      const { clips } = await videofetch.fetchClips(
        style.query,
        styleDir,
        detail => log(`[${key}] ${detail}`)
      );
      log(`[${key}] Got ${clips.length} clips`);

      if (!clips.length) {
        results[key] = { ok: false, reason: 'no clips returned from Pexels' };
        continue;
      }

      log(`[${key}] Assembling final video...`);
      const finalVideo = await assembler.assemble({
        clips,
        voiceover: voiceFile,
        musicTrack,
        script: scriptData.script,
        outputDir: styleDir,
      });
      log(`[${key}] Done: ${finalVideo}`);
      results[key] = { ok: true, path: finalVideo };
    } catch (err) {
      log(`[${key}] FAILED: ${err.message}`);
      results[key] = { ok: false, reason: err.message };
    }
  }

  log('\n=== SUMMARY ===');
  log(`Topic: ${topic}`);
  log(`Job:   ${jobId}`);
  for (const [key, r] of Object.entries(results)) {
    if (r.ok) {
      const stat = fs.statSync(r.path);
      log(`Video ${key} (${STYLES[key].label}): ${r.path}  (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
    } else {
      log(`Video ${key}: FAILED — ${r.reason}`);
    }
  }
}

main().catch(err => {
  console.error('A/B compare failed:', err);
  process.exit(1);
});
