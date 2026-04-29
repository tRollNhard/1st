const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('motivation', {
  // ── Setup ──────────────────────────────────────────────────────────────────
  getMissingKeys: () => ipcRenderer.invoke('get-missing-keys'),
  saveKey: (key, value) => ipcRenderer.invoke('save-key', { key, value }),
  getEnv: () => ipcRenderer.invoke('get-env'),
  setupDone: () => ipcRenderer.invoke('open-setup-done'),
  startOAuth: (url) => ipcRenderer.invoke('start-oauth', url),
  connectYouTube: () => ipcRenderer.invoke('connect-youtube'),
  connectLinkedIn: (data) => ipcRenderer.invoke('connect-linkedin', data),
  openUrl: (url) => ipcRenderer.invoke('open-url', url),

  // ── Video pipeline ─────────────────────────────────────────────────────────
  researchTopic: () => ipcRenderer.invoke('research-topic'),
  approvePost: (data) => ipcRenderer.invoke('approve-post', data),
  skipToday: () => ipcRenderer.send('skip-today'),

  // ── Quote pipeline ─────────────────────────────────────────────────────────
  researchQuote: () => ipcRenderer.invoke('research-quote'),
  approveQuote: (data) => ipcRenderer.invoke('approve-quote', data),
  skipQuote: () => ipcRenderer.send('skip-quote'),

  // ── Progress events ────────────────────────────────────────────────────────
  onProgress: (cb) => ipcRenderer.on('progress', (_, d) => cb(d)),
  onDone: (cb) => ipcRenderer.on('done', cb),
  onError: (cb) => ipcRenderer.on('error', (_, m) => cb(m)),
});
