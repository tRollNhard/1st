const fs = require('fs');
const path = require('path');

const MUSIC_DIR = path.join(__dirname, '..', 'assets', 'music');

function getRandomTrack() {
  if (!fs.existsSync(MUSIC_DIR)) return null;
  const files = fs.readdirSync(MUSIC_DIR).filter(f =>
    f.endsWith('.mp3') || f.endsWith('.wav') || f.endsWith('.m4a')
  );
  if (!files.length) return null;
  return path.join(MUSIC_DIR, files[Math.floor(Math.random() * files.length)]);
}

module.exports = { getRandomTrack };
