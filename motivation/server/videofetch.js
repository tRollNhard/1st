const axios = require('axios');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.PEXELS_API_KEY;
const BASE = 'https://api.pexels.com/videos';
const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB per clip

async function searchVideos(query, count = 10) {
  const res = await axios.get(`${BASE}/search`, {
    headers: { Authorization: API_KEY },
    params: { query, orientation: 'portrait', per_page: count, size: 'large' },
  });
  return res.data.videos || [];
}

// FIX #10 — enforce 50 MB guard that was documented but never implemented
function bestFile(video) {
  const files = (video.video_files || [])
    .filter(f => f.width < f.height)                            // portrait only
    .filter(f => !f.file_size || f.file_size < MAX_FILE_BYTES)  // size guard
    .filter(f => !f.file_type || f.file_type === 'video/mp4')   // mp4 only
    .sort((a, b) => (b.width * b.height) - (a.width * a.height));
  return files[0] || video.video_files?.[0];
}

async function downloadClip(url, dest) {
  const res = await axios.get(url, { responseType: 'stream', timeout: 60000 });
  await new Promise((resolve, reject) => {
    const w = fs.createWriteStream(dest);
    res.data.on('error', reject); // FIX #9 — handle read stream errors
    res.data.pipe(w);
    w.on('finish', resolve);
    w.on('error', reject);
  });
}

// FIX #17 — batched parallel downloads (3 concurrent) instead of sequential
async function fetchClips(query, outputDir, onProgress) {
  onProgress?.('Searching Pexels for cinematic footage...');
  const videos = await searchVideos(query, 10);
  if (!videos.length) throw new Error(`No Pexels videos found for: "${query}"`);

  const selected = videos.slice(0, 8);
  const CONCURRENCY = 3;
  const clips = [];
  const thumbs = [];

  for (let i = 0; i < selected.length; i += CONCURRENCY) {
    const batch = selected.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(async (v, j) => {
      const idx = i + j;
      const file = bestFile(v);
      if (!file?.link) return null;
      onProgress?.(`Downloading clip ${idx + 1}/${selected.length}...`);
      const dest = path.join(outputDir, `clip_${String(idx).padStart(2,'0')}.mp4`);
      await downloadClip(file.link, dest);
      const pic = v.image || v.video_pictures?.[0]?.picture;
      return { dest, pic };
    }));
    for (const r of results) {
      if (r) { clips.push(r.dest); if (r.pic) thumbs.push(r.pic); }
    }
  }

  return { clips, thumbs };
}

module.exports = { fetchClips };
