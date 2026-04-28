const fs = require('fs');
const path = require('path');

const ENV_PATH = path.join(__dirname, '..', '.env');

function readAll() {
  if (!fs.existsSync(ENV_PATH)) return {};
  const env = {};
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return env;
}

// FIX #13 — don't trimStart (destroys user comments); append cleanly
function save(key, value) {
  let content = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
  const regex = new RegExp(`^${key}=.*$`, 'm');
  const line = `${key}=${value}`;
  if (regex.test(content)) {
    content = content.replace(regex, line);
  } else {
    content = content.endsWith('\n') ? content + line : content + '\n' + line;
  }
  fs.writeFileSync(ENV_PATH, content, 'utf8');
  process.env[key] = value;
}

function missing() {
  const env = readAll();
  return {
    anthropic: !env.ANTHROPIC_API_KEY,
    pexels:    !env.PEXELS_API_KEY,
    youtube:   !env.YOUTUBE_CLIENT_ID || !env.YOUTUBE_CLIENT_SECRET,
    linkedin:  !env.LINKEDIN_ACCESS_TOKEN || !env.LINKEDIN_PERSON_URN,
    tiktok:    !env.TIKTOK_ACCESS_TOKEN,
    instagram: !env.INSTAGRAM_ACCESS_TOKEN || !env.INSTAGRAM_BUSINESS_ACCOUNT_ID,
  };
}

module.exports = { readAll, save, missing };
