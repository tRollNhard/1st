# Changelog

All notable changes to **Smillee** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Bumped `electron` 33 → 42, `electron-builder` 25 → 26, `vite` 5 → 8 to clear
  the last open Dependabot alerts on the repo. Build pipeline (`vite build` →
  `electron-builder --win portable`) verified clean post-bump.

### Fixed
- Restricted DevTools auto-open to development mode (`!app.isPackaged`) and
  blocked DevTools entirely in packaged builds.
- `npm audit` clean across `visualization/` after non-breaking and breaking
  dep refreshes.

## [1.0.0] - 2026-04-30

### Added
- **Hard offline enforcement.** Every Chromium background-network path
  disabled at process start (`disable-component-update`,
  `disable-background-networking`, `disable-breakpad`, `dns-prefetch-disable`,
  `disable-sync`, etc.); all non-`file://`/`data:`/`blob:` requests cancelled
  by `webRequest.onBeforeRequest`; `setProxy({ proxyRules: 'direct://' })`
  guarantees DNS lookups fail instantly instead of timing out.
- **Sandboxed renderer**: `contextIsolation: true`, `nodeIntegration: false`,
  `sandbox: true`, `webSecurity: true`, `experimentalFeatures: false`. CSP
  meta-tag adds `connect-src 'none'` belt-and-braces inside the page.
- **System-audio loopback** via `desktopCapturer` — captures the host audio
  output without a tab-share picker, no microphone permission, no Spotify
  Web API access required.
- Multi-color liquid-drip reactive scene plus auxiliary scenes
  (Spectrum Mirror, Plasma Feedback, Spectrum Wreath, Nebula, Lightning,
  Fireworks).
- Rate-limited lightning strikes; punchier beat detection.
- Single-instance lock — second launch focuses the existing window instead
  of fighting for the loopback stream.
- User-data dir set to `%APPDATA%\Smillee` so the portable `.exe` persists
  state across runs (extraction temp dir would otherwise be wiped).
- Vite-bundled modular renderer (`src/app.js`, `src/audio.js`, `src/fx.js`,
  `src/plugins.js`, `src/renderer.js`, `src/utils.js`).
- `electron-builder` portable + NSIS installer targets (`Smillee-${version}-portable.exe`).

### Security
- See [SECURITY.md](SECURITY.md) for reporting policy and the offline
  invariant that defines the in-scope threat model.
