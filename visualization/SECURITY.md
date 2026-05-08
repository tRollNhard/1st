# Security Policy

## Supported versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a vulnerability

Please email **jwclarkladymae@gmail.com** with details. Use the subject line
`[SECURITY] Smillee: <one-line summary>`.

Please include, at minimum:

- Affected component (`main.js`, `src/audio.js`, `src/renderer.js`, the Vite
  dev server, `electron-builder` packaging, etc.).
- Reproduction steps or a minimal proof of concept.
- Versions, OS build, and any relevant configuration.
- Your assessment of impact — and in particular whether the offline
  guarantee was breached (see Scope).

**Do not** open a public GitHub issue for vulnerabilities.

## Response SLA

| Stage              | Target                                         |
| ------------------ | ---------------------------------------------- |
| Acknowledgement    | within **3 calendar days** of report           |
| Initial assessment | within **7 calendar days** of report           |
| Fix or mitigation  | within **30 calendar days** of report          |

If a fix is not feasible within 30 days (e.g. an upstream Electron or
Chromium-network-stack issue), you will receive a written status update at
the 30-day mark with a revised target and the reason for the slip.

## Scope

In scope:

- **Offline-invariant breach.** Any code path through which a packaged
  Smillee build (`!app.isPackaged === false`) emits a network request to a
  destination other than `file://`, `data:`, `blob:`, `about:`, or
  `chrome-extension:` is a security incident. The build is intended to run
  with the network cable unplugged and produce zero outbound traffic.
- **Renderer escape** — any way for content rendered in the Smillee
  `BrowserWindow` to call Node APIs, bypass the `contextIsolation` /
  `sandbox: true` boundary, or attach a `<webview>`.
- **DevTools exposure** in packaged builds — DevTools must remain blocked
  via `webContents.on('devtools-opened')` close.
- **Local privilege escalation** via the `%APPDATA%\Smillee` user-data dir
  or shader-cache write paths.
- **Loopback capture abuse** — any way for a captured audio stream to leave
  the renderer.

Out of scope:

- The development workflow (`SMILLEE_DEV=1`, Vite dev server at
  `http://localhost:5173`). Dev mode loosens the offline allowlist on
  purpose so ES modules can be served by Vite. Reports targeting dev-only
  paths will be triaged but not treated as production vulnerabilities.
- Vulnerabilities in upstream Electron, Chromium, FFmpeg, or transitive
  npm packages. Report those upstream; we will track the advisory and ship
  a bumped dependency once a patched version is available.

## Offline invariant — implementation backstops

The offline guarantee is enforced at four layers; any single layer holding
prevents a leak:

1. **Chromium command-line flags** (`main.js` lines ~35–46) — disable
   component-update, background-networking, breakpad, domain-reliability,
   sync, autofill server, calculate-native-win-occlusion, etc.
2. **Renderer CSP** — `connect-src 'none'` in the page `<meta>` blocks
   `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`.
3. **Main-process request filter** —
   `session.defaultSession.webRequest.onBeforeRequest` cancels every URL
   that doesn't match the offline allowlist regex.
4. **Dead proxy** — `setProxy({ proxyRules: 'direct://' })` ensures DNS
   lookups fail instantly rather than hanging on resolution timeout, so a
   leaking call surfaces as a fast error rather than a silent dangling
   socket.

Reports against any of these layers are treated as scope-1 issues even when
no leak is observed in practice.
