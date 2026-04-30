const ffmpeg = require('fluent-ffmpeg');
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
  throw new Error('FFmpeg not found. Install from https://www.gyan.dev/ffmpeg/builds/ and add to PATH, then restart.');
}

function buildSrt(script, durationSec, srtPath) {
  const words = script.split(/\s+/).filter(Boolean);
  const chunkSize = 4;
  const chunks = [];
  for (let i = 0; i < words.length; i += chunkSize) {
    chunks.push(words.slice(i, i + chunkSize).join(' '));
  }
  const secPerChunk = durationSec / chunks.length;

  function ts(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.round((sec % 1) * 1000);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(ms).padStart(3,'0')}`;
  }

  const srt = chunks.map((chunk, i) => {
    const start = i * secPerChunk;
    const end = Math.min(start + secPerChunk - 0.05, durationSec);
    return `${i + 1}\n${ts(start)} --> ${ts(end)}\n${chunk}`;
  }).join('\n\n');

  fs.writeFileSync(srtPath, srt, 'utf8');
}

function probe(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, meta) => err ? reject(err) : resolve(meta));
  });
}

async function assemble({ clips, voiceover, musicTrack, script, outputDir }) {
  const bin = findFfmpeg();
  ffmpeg.setFfmpegPath(bin);

  const concatTxt = path.join(outputDir, 'concat.txt');
  const stitched  = path.join(outputDir, 'stitched.mp4');
  const srtPath   = path.join(outputDir, 'captions.srt');
  const finalPath = path.join(outputDir, 'final.mp4');
  const normDir   = path.join(outputDir, 'norm');
  fs.mkdirSync(normDir, { recursive: true });

  // FIX #16 — normalize all clips in parallel (Promise.all, not sequential for-loop)
  const normClips = await Promise.all(clips.map((clip, i) => {
    const out = path.join(normDir, `n${i}.mp4`);
    return new Promise((resolve, reject) => {
      ffmpeg(clip)
        .outputOptions([
          '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1',
          '-r', '30',
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '23',
          '-an',
          '-y',
        ])
        .output(out)
        .on('end', () => resolve(out))  // FIX: resolve WITH path so array is populated
        .on('error', reject)
        .run();
    });
  }));

  // FIX #4 — each flag and value must be separate tokens for fluent-ffmpeg
  fs.writeFileSync(concatTxt, normClips.map(c => `file '${c.replace(/\\/g,'/')}'`).join('\n'), 'utf8');
  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(concatTxt)
      .inputOptions(['-f', 'concat', '-safe', '0'])  // FIX #4
      .outputOptions(['-c', 'copy', '-y'])
      .output(stitched)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });

  const meta = await probe(stitched);
  const duration = Math.min(meta.format.duration || 60, 60);

  buildSrt(script, duration, srtPath);

  // FIX #8 — correct Windows path escaping for subtitles filter
  const srtEscaped = srtPath
    .replace(/\\/g, '/')
    .replace(/^([A-Za-z]):/, '$1\\:');

  const subtitleFilter = `subtitles='${srtEscaped}':force_style='FontName=Arial,FontSize=20,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=3,Alignment=2,MarginV=60'`;

  await new Promise((resolve, reject) => {
    const cmd = ffmpeg().input(stitched).input(voiceover);
    const filters = [];
    let audioOut;

    if (musicTrack) {
      cmd.input(musicTrack);
      filters.push('[1:a]volume=1.0[vo]');
      // FIX #3 — integer literal, not scientific notation
      filters.push('[2:a]volume=0.18,aloop=loop=-1:size=2000000000[mu]');
      filters.push('[vo][mu]amix=inputs=2:duration=first[aout]');
      audioOut = '[aout]';
    } else {
      filters.push('[1:a]volume=1.0[aout]');
      audioOut = '[aout]';
    }

    filters.push(`[0:v]${subtitleFilter}[vout]`);

    cmd
      .complexFilter(filters)
      .outputOptions([
        '-map', '[vout]',
        '-map', audioOut,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '22',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-t', '60',
        '-movflags', '+faststart',
        '-y',
      ])
      .output(finalPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });

  return finalPath;
}

module.exports = { assemble };
