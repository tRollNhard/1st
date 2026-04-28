require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { app, BrowserWindow, ipcMain, Notification, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const cron = require('node-cron');
const envHelper = require('./server/env');
const generator = require('./server/generator');
const quoteGenerator = require('./server/quoteGenerator');

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

function notify(title, body) {
  if (Notification.isSupported()) new Notification({ title, body }).show();
}
