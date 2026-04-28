const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { v4: uuid } = require('uuid');
const researcher   = require('./researcher');
const scriptwriter = require('./scriptwriter');
const tts          = require('./tts');
const videofetch   = require('./videofetch');
const music        = require('./music');
const assembler    = require('./assembler');
const publisher    = require('./publisher');

async function researchTopic() {
  const topic = researcher.getTodaysTopic();
  const scriptData = await scriptwriter.writeScript(topic);

  let thumbs = [];
  try {
    const res = await axios.get('https://api.pexels.com/videos/search', {
      headers: { Authorization: process.env.PEXELS_API_KEY },
      params: { query: scriptData.pexelsQuery, orientation: 'portrait', per_page: 6 },
    });
    thumbs = (res.data.videos || []).map(v => v.image).filter(Boolean);
  } catch { /* thumbnails are optional — don't block */ }

  return {
    topic,
    script: scriptData.script,
    pexelsQuery: scriptData.pexelsQuery,
    caption: scriptData.caption,
    title: scriptData.title,
    thumbs,
  };
}

async function run({ script, pexelsQuery, topic, caption, title }, onProgress) {
  const jobId = uuid();
  const outputDir = path.join(__dirname, '..', 'output', jobId);
  fs.mkdirSync(outputDir, { recursive: true });

  onProgress('voice', 'Generating voiceover with Windows TTS...');
  const voiceFile = await tts.generateVoiceover(script, outputDir);

  onProgress('video', 'Fetching cinematic clips from Pexels...');
  const { clips } = await videofetch.fetchClips(
    pexelsQuery || topic,
    outputDir,
    detail => onProgress('video', detail)
  );

  // FIX #11 — guard against empty clips array before handing to assembler
  if (!clips.length) {
    throw new Error('No video clips downloaded. Check your PEXELS_API_KEY and internet connection.');
  }

  onProgress('assemble', 'Mixing clips, voice, music & captions...');
  const musicTrack = music.getRandomTrack();
  const finalVideo = await assembler.assemble({ clips, voiceover: voiceFile, musicTrack, script, outputDir });

  onProgress('publish', 'Posting to all platforms...');
  const results = await publisher.publishAll(finalVideo, { title, caption });
  const summary = results.map(r => r.ok ? `✓ ${r.platform}` : `✗ ${r.platform}`).join('  ');
  onProgress('publish', summary);

  if (results.every(r => !r.ok)) {
    throw new Error('All platforms failed to post. Check your tokens in Setup.');
  }

  return { finalVideo, results };
}

module.exports = { researchTopic, run };
