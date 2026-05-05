# Security Policy

## Supported versions

| Version | Supported          |
| ------- | ------------------ |
| 2.0.x   | :white_check_mark: |
| 1.x     | :x:                |

## Reporting a vulnerability

Please email **jwclarkladymae@gmail.com** with details. Use the subject line
`[SECURITY] Motivate: <one-line summary>`.

Please include, at minimum:

- Affected component (`server/`, `renderer/`, `main.js`, `agent.js`, etc.).
- Reproduction steps or a minimal proof of concept.
- Versions, OS, Node version, FFmpeg version, and any relevant configuration.
- Your assessment of impact (confidentiality / integrity / availability) — in
  particular, whether OAuth tokens or API keys could be leaked or abused.

**Do not** open a public GitHub issue for vulnerabilities.

## Response SLA

| Stage              | Target                                         |
| ------------------ | ---------------------------------------------- |
| Acknowledgement    | within **3 calendar days** of report           |
| Initial assessment | within **7 calendar days** of report           |
| Fix or mitigation  | within **30 calendar days** of report          |

If a fix is not feasible within 30 days (e.g. an upstream platform-API issue),
you will receive a written status update at the 30-day mark with a revised
target and the reason for the slip.

## Scope

In scope:

- The Electron main / preload bridge (`main.js`, `preload.js`) and the
  renderer (`renderer/`, `setup.html`, `quote.html`, `progress.html`, etc.).
- The pipeline modules under `server/` — `assembler.js`, `env.js`,
  `generator.js`, `music.js`, `publisher.js`, `quotecard.js`, `quotefetch.js`,
  `quoteGenerator.js`, `researcher.js`, `scriptwriter.js`, `tts.js`,
  `videofetch.js`.
- `agent.js` — the Claude Agent SDK wrapper.
- `.env` handling and the auto-sync from the parent project's `.env`.
- The local OAuth callback server used by the one-click setup
  (default `http://localhost:3456/oauth/youtube`).
- The `node-cron` daily scheduler.

Out of scope:

- The Anthropic API, Pexels API, or the publishing-platform APIs themselves
  (YouTube, LinkedIn, TikTok, Instagram) — report to those vendors.
- FFmpeg vulnerabilities — report upstream to the FFmpeg project.
- Issues that require an attacker to already have local code-execution on the
  user's machine.
- The platforms' content-policy decisions about videos that Motivate publishes.

## Sensitive data

Motivate handles the following sensitive material — please be especially
careful to avoid disclosure in reports:

- `ANTHROPIC_API_KEY`, `PEXELS_API_KEY`.
- `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, OAuth refresh tokens.
- `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_PERSON_URN`.
- `TIKTOK_ACCESS_TOKEN`, `TIKTOK_OPEN_ID`.
- `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_BUSINESS_ACCOUNT_ID`.

All of these are read from `.env` at runtime and must never appear in logs,
the renderer, video metadata, or published-video descriptions.

## Disclosure

Coordinated disclosure preferred. Once a fix is shipped (or the 30-day window
elapses with a status update), the reporter is credited in `CHANGELOG.md`
under the relevant version's `### Security` section, unless they request
otherwise.
