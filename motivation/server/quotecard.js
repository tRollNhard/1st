const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const FFMPEG_LOCATIONS = [
  'ffmpeg',
  'C:\\ffmpeg\\bin\\ffmpeg.exe',
  'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
  'C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe',
];

function findFfmpeg() {
  for (const p of FFMPEG_LOCATIONS) {
    const r = spawnSync(p, ['-version'], { stdio: 'ignore' });
    if (r.status === 0) return p;
  }
  throw new Error('FFmpeg not found. See SETUP.md.');
}

async function fetchBackground(query, outputDir) {
  const res = await axios.get('https://api.pexels.com/v1/search', {
    headers: { Authorization: process.env.PEXELS_API_KEY },
    params: { query, orientation: 'portrait', per_page: 10, size: 'large' },
  });
  const photos = res.data.photos || [];
  if (!photos.length) throw new Error(`No Pexels photos found for: ${query}`);
  const photo = photos[Math.floor(Math.random() * Math.min(photos.length, 5))];
  const url = photo.src.large2x || photo.src.large;

  const bgPath = path.join(outputDir, 'bg.jpg');
  const dl = await axios.get(url, { responseType: 'stream' });
  await new Promise((resolve, reject) => {
    const w = fs.createWriteStream(bgPath);
    dl.data.on('error', reject); // FIX #9 — handle read stream errors
    dl.data.pipe(w);
    w.on('finish', resolve);
    w.on('error', reject);
  });
  return bgPath;
}

function wrapText(text, maxChars = 26) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxChars) {
      if (current) lines.push(current.trim());
      current = word;
    } else {
      current = (current + ' ' + word).trim();
    }
  }
  if (current) lines.push(current.trim());
  return lines;
}

// FIX #14 — escape %, backslash, single-quote, colon, brackets for FFmpeg drawtext
function esc(s) {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

async function generateQuoteCard({ text, author }, outputDir) {
  const bin = findFfmpeg();
  ffmpeg.setFfmpegPath(bin);

  const bgPath = await fetchBackground('dark dramatic nature cinematic portrait', outputDir);
  const outPath = path.join(outputDir, 'quote.jpg');

  const lines = wrapText(text, 26);
  const lineHeight = 72;
  const totalTextH = lines.length * lineHeight;
  const startY = Math.floor((1920 - totalTextH) / 2) - 60;

  // FIX #1 — removed dead `filters` array. Using vf chain only.
  let vf = 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920';
  vf += ',drawbox=x=0:y=0:w=1080:h=1920:color=black@0.55:t=fill';

  // Decorative rule above quote
  vf += `,drawbox=x=(w-120)/2:y=${startY - 30}:w=120:h=2:color=white@0.4:t=fill`;

  // Quote lines
  lines.forEach((line, i) => {
    const y = startY + i * lineHeight;
    vf += `,drawtext=text='${esc(line)}':fontfile='C\\:/Windows/Fonts/arialbd.ttf':fontsize=52:fontcolor=white:x=(w-text_w)/2:y=${y}:shadowcolor=black@0.8:shadowx=2:shadowy=2`;
  });

  // Author attribution
  if (author) {
    const authorY = startY + lines.length * lineHeight + 40;
    vf += `,drawtext=text='- ${esc(author)}':fontfile='C\\:/Windows/Fonts/ariali.ttf':fontsize=34:fontcolor=white@0.75:x=(w-text_w)/2:y=${authorY}:shadowcolor=black@0.8:shadowx=1:shadowy=1`;
  }

  // FIX #2 — no emoji in drawtext; Arial cannot render it and FFmpeg will crash
  vf += `,drawtext=text='MOTIVATION':fontfile='C\\:/Windows/Fonts/arialbd.ttf':fontsize=22:fontcolor=white@0.45:x=(w-text_w)/2:y=1840`;

  await new Promise((resolve, reject) => {
    ffmpeg(bgPath)
      .outputOptions(['-vf', vf, '-vframes', '1', '-q:v', '2', '-y'])
      .output(outPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });

  return outPath;
}

module.exports = { generateQuoteCard };
