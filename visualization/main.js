// Smillee — Music-Reactive Desktop Visualizer
// Copyright (c) 2026 Jason W Clark (THATdudeAGAIN)
// All rights reserved. Proprietary software — see COPYRIGHT.txt
// Contact: jwclarkladymae@gmail.com | GitHub: https://github.com/THATdudeAGAIN

// Electron main process — Smillee standalone app.
// Captures system audio via loopback (no tab-share picker) and renders
// a multi-color liquid-drip reactive scene.

const { app, BrowserWindow, session, desktopCapturer, Menu, screen } = require('electron');
const path = require('path');

// Single-instance lock — second launch focuses the existing window instead
// of spawning a duplicate that would fight for the camera / loopback stream.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// User-data dir: prefer %APPDATA%\Smillee (persists across runs of
// the portable .exe — extraction temp dir would be wiped on every launch).
// Fall back to a project-local dir only in development, where the APPDATA
// path may have restrictive ACLs causing "Access is denied" cache errors.
try {
  const appDataDir = path.join(app.getPath('appData'), 'Smillee');
  app.setPath('userData', appDataDir);
} catch (_) {
  app.setPath('userData', path.join(__dirname, '.electron-data'));
}
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

// Fully-offline hardening — block every Chromium background network path
// so the app works with the network cable unplugged and emits zero traffic.
// (The renderer is already blocked by `connect-src 'none'` in the CSP meta.)
app.commandLine.appendSwitch('disable-component-update');
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-breakpad');         // no crash-reporter uploads
app.commandLine.appendSwitch('disable-domain-reliability');
app.commandLine.appendSwitch('disable-features',
  'AutofillServerCommunication,OptimizationHints,InterestFeedContentSuggestions,CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('no-pings');
app.commandLine.appendSwitch('no-default-browser-check');
app.commandLine.appendSwitch('dns-prefetch-disable');
app.commandLine.appendSwitch('disable-sync');
app.commandLine.appendSwitch('metrics-recording-only');
app.commandLine.appendSwitch('disable-default-apps');

function createWindow() {
  // Window icon — tolerate the file being absent (first-time dev before
  // build resources exist). BrowserWindow will just use the Electron default.
  const iconPath = path.join(__dirname, 'build', 'icon.ico');
  const iconOpt = require('fs').existsSync(iconPath) ? { icon: iconPath } : {};

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#000000',
    title: 'Smillee',
    autoHideMenuBar: true,
    ...iconOpt,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,                    // OS-level isolation for the renderer
      webSecurity: true,                // same-origin checks on file:// too
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      spellcheck: false,
      // devTools stay on in dev for debugging; disabled in packaged builds below.
      devTools: !app.isPackaged,
    },
  });

  // Auto-open DevTools in dev so renderer errors (black screen, audio init
  // failures, CSP violations) are immediately visible in the console.
  if (!app.isPackaged) {
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Block the in-app devtools in packaged builds.
    win.webContents.on('devtools-opened', () => win.webContents.closeDevTools());
  }

  // Belt-and-braces navigation lockdown — this app only ever loads its
  // bundled index.html. Silently DENY all navigation and new-window
  // requests. We deliberately do NOT hand URLs to the system browser
  // via shell.openExternal: the app must never cause ANY program
  // (itself or another) to make a network connection.
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) e.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // Also block webview attachment and in-app redirects
  win.webContents.on('will-attach-webview', (e) => e.preventDefault());
  win.webContents.on('will-redirect', (e, url) => {
    if (!url.startsWith('file://')) e.preventDefault();
  });

  // HARD OFFLINE ENFORCEMENT — cancel every non-local network request at
  // the Chromium network stack, below any subsystem that might try to
  // phone home (component updater, autofill, safe-browsing, DNS prefetch,
  // telemetry, etc.). Only file://, data:, blob:, about: are allowed
  // through. The renderer's CSP already blocks fetch/XHR from the page;
  // this backstops the main process too.
  //
  // DEV EXCEPTION: in development (!app.isPackaged) the Vite dev server
  // runs at localhost:5173 — we allow that origin so the app can load its
  // ES modules. No internet traffic is permitted even in dev.
  const OFFLINE_ALLOW = app.isPackaged
    ? /^(file|data|blob|about|chrome-extension|devtools):/i
    : /^(file|data|blob|about|chrome-extension|devtools|http:\/\/localhost|http:\/\/127\.0\.0\.1):/i;
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, cb) => {
    if (OFFLINE_ALLOW.test(details.url)) return cb({ cancel: false });
    console.log('[offline-block]', details.method, details.url);
    cb({ cancel: true });
  });
  // Belt-and-braces: point any attempted DNS lookup at a dead proxy so the
  // socket fails instantly instead of hanging on resolution timeout.
  session.defaultSession.setProxy({ proxyRules: 'direct://', proxyBypassRules: '<local>' })
    .catch(err => console.warn('[offline] setProxy failed (non-fatal):', err));

  // System-audio loopback: captures whatever is playing on the default
  // output device (so Spotify must be outputting to that device). We
  // attach to the screen source that matches this window's current display
  // (multi-monitor correctness — sources[0] is arbitrary in enumeration
  // order), then set audio: 'loopback' so system audio is mixed in.
  // NOTE: if Spotify is routed to a non-default output (common on PCs
  // with multiple sound devices / USB DACs), loopback will be silent —
  // the user must set Spotify's output to the Windows default device.
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 0, height: 0 },
      });
      if (sources.length === 0) {
        console.error('[visualizer] no screen sources — cannot provide loopback audio');
        callback({});
        return;
      }
      // Match the screen source to the display the window is on. Screen
      // source IDs encode the display_id after a colon: "screen:123:0".
      let chosen = sources[0];
      try {
        const bounds = win.getBounds();
        const display = screen.getDisplayMatching(bounds);
        const match = sources.find(s => s.display_id === String(display.id));
        if (match) chosen = match;
      } catch (_) { /* fall back to sources[0] */ }
      console.log(`[visualizer] granting loopback on "${chosen.name}"`);
      callback({ video: chosen, audio: 'loopback' });
    } catch (err) {
      console.error('[visualizer] display-media handler error:', err);
      callback({});
    }
  });

  // Auto-grant camera + mic permission requests so getUserMedia works
  // without a prompt — but ONLY for our own file:// origin. A redirect
  // bug or injected iframe must not silently inherit media access.
  const isTrustedOrigin = (wc) => {
    try {
      const url = wc.getURL();
      return url.startsWith('file://');
    } catch (_) { return false; }
  };
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
    callback(permission === 'media' && isTrustedOrigin(wc));
  });
  session.defaultSession.setPermissionCheckHandler((wc, permission) => {
    return permission === 'media' && isTrustedOrigin(wc);
  });

  Menu.setApplicationMenu(null);

  // Dev: load from Vite dev server (ES modules served hot).
  // Prod: load the pre-built dist-web/index.html (all JS bundled, fully offline).
  const isDev = !app.isPackaged && process.env.SMILLEE_DEV === '1';
  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    // In non-dev and packaged mode, prefer the Vite-built bundle.
    // Fall back to raw index.html (src/ ES modules) if dist-web doesn't exist yet
    // so `npm start` still works before the first `npm run build`.
    const distHtml = path.join(__dirname, 'dist-web', 'index.html');
    if (require('fs').existsSync(distHtml)) {
      win.loadFile(distHtml);
    } else {
      win.loadFile(path.join(__dirname, 'index.html'));
    }
  }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
