require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { app, BrowserWindow, ipcMain, Notification, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const cron = require('node-cron');
const axios = require('axios');
const { google } = require('googleapis');
const envHelper = require('./server/env');
const generator = require('./server/generator');
const quoteGenerator = require('./server/quoteGenerator');
const { loadTokens, saveTokens } = require('./server/publisher');

// Auto-borrow ANTHROPIC_API_KEY from parent BRAIN project if not set locally
function syncParentKey() {
  const env = envHelper.readAll();
  if (env.ANTHROPIC_API_KEY && env.ANTHROPIC_API_KEY !== 'your-api-key-here') return;
  const parentEnv = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(parentEnv)) return;
  const match = fs.readFileSync(parentEnv, 'utf8').match(/^ANTHROPIC_API_KEY=(.+)$/m);
  if (match?.[1] && match[1].trim() !== 'your-api-key-here') {
    envHelper.save('ANTHROPIC_API_KEY', match[1].trim());
    process.env.ANTHROPIC_API_KEY = match[1].trim();
  }
}
syncParentKey();

let tray, promptWindow, progressWindow, setupWindow, quoteWindow, quoteProgressWindow;
let oauthServer = null;

const VIDEO_HOUR   = parseInt(process.env.POST_HOUR   || 9);
const VIDEO_MIN    = parseInt(process.env.POST_MINUTE  || 0);
const QUOTE_HOUR   = 7;
const QUOTE_MIN    = 15;

// ─── Window factories ─────────────────────────────────────────────────────────
function openSetup() {
  if (setupWindow) { setupWindow.focus(); return; }
  setupWindow = makeWindow('renderer/setup.html', 'Motivation — Setup', 760, 680);
  setupWindow.on('closed', () => { setupWindow = null; });
}

function openPrompt() {
  if (promptWindow) { promptWindow.focus(); return; }
  promptWindow = makeWindow('renderer/index.html', 'Motivation — Daily Video', 720, 720);
  promptWindow.on('closed', () => { promptWindow = null; });
}

function openQuote() {
  if (quoteWindow) { quoteWindow.focus(); return; }
  quoteWindow = makeWindow('renderer/quote.html', 'Motivation — Daily Quote', 600, 580);
  quoteWindow.on('closed', () => { quoteWindow = null; });
}

function openProgress() {
  if (promptWindow) { promptWindow.close(); promptWindow = null; }
  progressWindow = makeWindow('renderer/progress.html', 'Motivation — Generating Video', 600, 520);
  progressWindow.on('closed', () => { progressWindow = null; });
}

function openQuoteProgress() {
  if (quoteWindow) { quoteWindow.close(); quoteWindow = null; }
  quoteProgressWindow = makeWindow('renderer/quoteprogress.html', 'Motivation — Posting Quote', 560, 380);
  quoteProgressWindow.on('closed', () => { quoteProgressWindow = null; });
}

function makeWindow(file, title, w, h) {
  const win = new BrowserWindow({
    width: w, height: h, resizable: false, title,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  win.loadFile(file);
  return win;
}

// ─── App boot ─────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  const icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('Motivation');
  buildTrayMenu();
  tray.on('click', handleVideoTray);

  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) fs.copyFileSync(path.join(__dirname, '.env.example'), envPath);

  const miss = envHelper.missing();
  if (miss.anthropic) { openSetup(); return; }
  if (process.argv.includes('--dev')) { openPrompt(); }

  // 7:15 AM — daily quote
  cron.schedule(`${QUOTE_MIN} ${QUOTE_HOUR} * * *`, () => {
    const m = envHelper.missing();
    if (m.anthropic) { openSetup(); return; }
    openQuote();
    notify('⚡ Motivation', 'Time for your daily quote post! Review and approve.');
  });

  // 9:00 AM — daily video
  cron.schedule(`${VIDEO_MIN} ${VIDEO_HOUR} * * *`, () => {
    const m = envHelper.missing();
    if (m.anthropic) { openSetup(); return; }
    openPrompt();
    notify('⚡ Motivation', 'Time for your daily video! Review and approve.');
  });
});

app.on('window-all-closed', (e) => e.preventDefault());

function buildTrayMenu() {
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '📹  Post Video Now',   click: handleVideoTray },
    { label: '💬  Post Quote Now',   click: handleQuoteTray },
    { type: 'separator' },
    { label: '⚙️  Setup / API Keys', click: openSetup },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
}

function handleVideoTray() {
  const m = envHelper.missing();
  if (m.anthropic) { openSetup(); return; }
  openPrompt();
}

function handleQuoteTray() {
  const m = envHelper.missing();
  if (m.anthropic) { openSetup(); return; }
  openQuote();
}

// ─── IPC: Setup ───────────────────────────────────────────────────────────────
ipcMain.handle('get-missing-keys', () => envHelper.missing());
ipcMain.handle('save-key', (_, { key, value }) => { envHelper.save(key, value); return true; });
ipcMain.handle('get-env', () => envHelper.readAll());
ipcMain.handle('open-setup-done', () => { if (setupWindow) setupWindow.close(); openPrompt(); });

// ─── IPC: Video pipeline ──────────────────────────────────────────────────────
ipcMain.handle('research-topic', async () => {
  try { return await generator.researchTopic(); }
  catch (err) { return { error: err.message }; }
});

ipcMain.handle('approve-post', async (_, data) => {
  openProgress();
  try {
    await generator.run(data, (step, detail) => {
      if (progressWindow) progressWindow.webContents.send('progress', { step, detail });
    });
    if (progressWindow) progressWindow.webContents.send('done');
    notify('Motivation ✓', 'Video posted to all platforms!');
  } catch (err) {
    if (progressWindow) progressWindow.webContents.send('error', err.message);
    notify('Motivation ✗', err.message);
  }
});

ipcMain.on('skip-today', () => { if (promptWindow) promptWindow.close(); });

// ─── IPC: Quote pipeline ──────────────────────────────────────────────────────
ipcMain.handle('research-quote', async () => {
  try { return await quoteGenerator.researchQuote(); }
  catch (err) { return { error: err.message }; }
});

ipcMain.handle('approve-quote', async (_, data) => {
  openQuoteProgress();
  try {
    await quoteGenerator.run(data, (step, detail) => {
      if (quoteProgressWindow) quoteProgressWindow.webContents.send('progress', { step, detail });
    });
    if (quoteProgressWindow) quoteProgressWindow.webContents.send('done');
    notify('Motivation ✓', 'Quote posted to all platforms!');
  } catch (err) {
    if (quoteProgressWindow) quoteProgressWindow.webContents.send('error', err.message);
    notify('Motivation ✗', err.message);
  }
});

ipcMain.on('skip-quote', () => { if (quoteWindow) quoteWindow.close(); });

// ─── IPC: OAuth ───────────────────────────────────────────────────────────────
ipcMain.handle('start-oauth', (_, url) => {
  return new Promise((resolve, reject) => {
    if (oauthServer) oauthServer.close();
    oauthServer = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://localhost:3456');
      if (u.pathname.startsWith('/oauth/')) {
        const code = u.searchParams.get('code');
        res.end('<h2 style="font-family:sans-serif;color:#7c6dfa">Authorized! Close this tab.</h2>');
        oauthServer.close(); oauthServer = null;
        resolve(code);
      }
    }).listen(3456, () => shell.openExternal(url));
    setTimeout(() => { oauthServer?.close(); reject(new Error('OAuth timeout')); }, 120000);
  });
});

ipcMain.handle('open-url', (_, url) => shell.openExternal(url));

// ─── IPC: YouTube OAuth (full token exchange) ─────────────────────────────────
ipcMain.handle('connect-youtube', async () => {
  const env = envHelper.readAll();
  if (!env.YOUTUBE_CLIENT_ID || !env.YOUTUBE_CLIENT_SECRET) {
    throw new Error('Save your Google Client ID and Secret first.');
  }
  const REDIRECT = 'http://localhost:3456/oauth/youtube';
  const oauth2 = new google.auth.OAuth2(env.YOUTUBE_CLIENT_ID, env.YOUTUBE_CLIENT_SECRET, REDIRECT);
  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/youtube.upload'],
    prompt: 'consent',
  });

  const code = await new Promise((resolve, reject) => {
    if (oauthServer) oauthServer.close();
    oauthServer = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://localhost:3456');
      if (u.pathname === '/oauth/youtube') {
        const c = u.searchParams.get('code');
        res.end('<h2 style="font-family:sans-serif;padding:40px;color:#7c6dfa">YouTube connected! Close this tab.</h2>');
        oauthServer.close(); oauthServer = null;
        resolve(c);
      }
    }).listen(3456, () => shell.openExternal(authUrl));
    setTimeout(() => { oauthServer?.close(); oauthServer = null; reject(new Error('OAuth timeout')); }, 120000);
  });

  const { tokens } = await oauth2.getToken(code);
  const saved = loadTokens();
  saved.youtube = tokens;
  saveTokens(saved);
  return true;
});

// ─── IPC: LinkedIn OAuth (token exchange + auto-fetch URN) ───────────────────
ipcMain.handle('connect-linkedin', async (_, { clientId, clientSecret }) => {
  if (!clientId || !clientSecret) throw new Error('Client ID and Secret are required.');
  const REDIRECT = 'http://localhost:3456/oauth/linkedin';
  const state = Math.random().toString(36).slice(2);
  const scope = 'openid profile w_member_social';
  const authUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(REDIRECT)}&state=${state}&scope=${encodeURIComponent(scope)}`;

  const code = await new Promise((resolve, reject) => {
    if (oauthServer) oauthServer.close();
    oauthServer = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://localhost:3456');
      if (u.pathname === '/oauth/linkedin') {
        const c = u.searchParams.get('code');
        res.end('<h2 style="font-family:sans-serif;padding:40px;color:#7c6dfa">LinkedIn connected! Close this tab.</h2>');
        oauthServer.close(); oauthServer = null;
        resolve(c);
      }
    }).listen(3456, () => shell.openExternal(authUrl));
    setTimeout(() => { oauthServer?.close(); oauthServer = null; reject(new Error('OAuth timeout')); }, 120000);
  });

  const tokenRes = await axios.post(
    'https://www.linkedin.com/oauth/v2/accessToken',
    new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: clientId, client_secret: clientSecret }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  const accessToken = tokenRes.data.access_token;

  const profile = await axios.get('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const personUrn = `urn:li:person:${profile.data.sub}`;

  envHelper.save('LINKEDIN_ACCESS_TOKEN', accessToken);
  envHelper.save('LINKEDIN_PERSON_URN', personUrn);
  return { personUrn };
});

function notify(title, body) {
  if (Notification.isSupported()) new Notification({ title, body }).show();
}
