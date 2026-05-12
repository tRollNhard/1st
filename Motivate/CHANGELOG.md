# Changelog

All notable changes to **Motivate** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `server/ab_compare.js` — A/B comparison script that produces two final MP4s from the same script + voiceover + music but with two distinct b-roll query strategies ("stationary heroic" vs "kinetic action") pulled from the same Pexels source. Used for visual side-by-side evaluation of b-roll style choices. Includes a built-in `FALLBACK_SCRIPT` ("rising after failure") so the comparison runs even when `ANTHROPIC_API_KEY` is missing or invalid; the daily pipeline still uses Claude when the real key is in `.env`. Run from `Motivate/`: `node server/ab_compare.js`. Output: `Motivate/output/<jobId>/A/final.mp4` and `B/final.mp4`.

### Changed
- `server/publisher.js` `uploadToImgur` — the Imgur Client-ID is now read from `process.env.IMGUR_CLIENT_ID` instead of a hardcoded literal (`546c25a59c58ad7`) baked into the source. The function throws a clear error with the registration URL (`https://api.imgur.com/oauth2/addclient`) if the env var is missing, matching the convention already used for Instagram/LinkedIn/TikTok tokens elsewhere in the file. The stale `FIX #5` comment block was rewritten to document the rationale (Imgur has been revoking anonymous shared Client-IDs since 2023, so personal IDs are required for reliable Instagram posting).
- `.env.example` — added `IMGUR_CLIENT_ID=` under the Instagram section with a one-line setup hint pointing at Imgur's app-registration page.

### Security
- Removed the hardcoded Imgur Client-ID from source. The previous shared community ID was at imminent risk of revocation (Imgur has been deprecating anonymous shared IDs since 2023), which would have caused silent Instagram-post failures with no log signal until users hit the broken path. Moving to a per-deployment env var also stops the ID from being included in fork/clone exfiltration and lets each operator rotate independently. Closes item #5 of the 2026-05-11 outstanding-issues triage on the parent Cowork repo.

## [2.0.0] - 2026-04-30

### Changed
- **BREAKING**: Renamed project and folder from `motivation` → `Motivate`.
  Update any references in launchers, shortcuts, or external scripts.

### Fixed
- Stability and bug fixes across the end-to-end pipeline (quote → research →
  script → video → TTS → assembly → publish) following the v1.x feature push.

## [1.2.0] - 2026-04-30

### Changed
- Decoupled the quote pipeline from the `ANTHROPIC_API_KEY` requirement —
  quote generation now runs without an Anthropic key, falling back to
  local/Pexels-driven quote sourcing. The full motivational-video pipeline
  still uses Claude when the key is configured.

## [1.1.0] - 2026-04-29

### Added
- Quote video pipeline (`server/quoteGenerator.js`, `server/quotecard.js`,
  `server/quotefetch.js`, `renderer/quote.html`, `renderer/quote.js`,
  `renderer/quoteprogress.html`) — fast-path that produces a static
  quote-card video without the full research/script flow.
- One-click OAuth flow for the supported platforms.
- All-platform publishing: YouTube, LinkedIn, TikTok, Instagram from a
  single render.
- Auto-sync of `ANTHROPIC_API_KEY` from the parent project's `.env` so the
  key only has to live in one place.
- TikTok-first setup UI in `renderer/setup.html`.

## [1.0.0] - 2026-04-27

Initial release.

### Added
- Electron desktop app (`main.js`, `preload.js`, `renderer/`).
- Daily motivational-video generator built on a free stack:
  - **Pexels** for stock video clips (`server/videofetch.js`).
  - **Windows TTS** for narration (`server/tts.js`).
  - **Anthropic SDK (`@anthropic-ai/sdk`)** for research and scripting
    (`server/researcher.js`, `server/scriptwriter.js`).
  - **FFmpeg** via `fluent-ffmpeg` for assembly (`server/assembler.js`).
- Multi-platform publishing scaffolding (`server/publisher.js`) for YouTube,
  LinkedIn, TikTok, Instagram via the Google APIs and platform-specific tokens.
- `node-cron` scheduling — `POST_HOUR` / `POST_MINUTE` env vars set the
  daily run time.
- `agent.js` — Claude Agent SDK wrapper used by the renderer.
- `SETUP.md` — one-time setup guide (~25 minutes).
- `.env.example` documenting every required and optional key.

[Unreleased]: https://example.invalid/Motivate/compare/v2.0.0...HEAD
[2.0.0]: https://example.invalid/Motivate/releases/tag/v2.0.0
[1.2.0]: https://example.invalid/Motivate/releases/tag/v1.2.0
[1.1.0]: https://example.invalid/Motivate/releases/tag/v1.1.0
[1.0.0]: https://example.invalid/Motivate/releases/tag/v1.0.0
