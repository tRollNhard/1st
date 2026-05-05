# Architecture

This document describes the runtime architecture of **Motivate**: how the
Electron shell, generator pipeline, OAuth callback server, and the daily
`node-cron` scheduler fit together; the end-to-end video generation
lifecycle; and the trust boundaries between components.

## Components

```mermaid
graph TB
  subgraph Desktop["Electron desktop process"]
    Main["main.js<br/>(Electron main + tray + cron)"]
    Preload["preload.js<br/>(contextBridge)"]
    Renderer["renderer/<br/>setup · index · quote · progress"]
    Agent["agent.js<br/>(Claude Agent SDK wrapper)"]
  end

  subgraph Pipeline["server/ pipeline modules"]
    EnvMod["env.js"]
    Generator["generator.js<br/>(full video orchestrator)"]
    QuoteGen["quoteGenerator.js<br/>(quote-card fast path)"]
    Researcher["researcher.js"]
    ScriptW["scriptwriter.js"]
    VideoFetch["videofetch.js"]
    QuoteFetch["quotefetch.js"]
    QuoteCard["quotecard.js"]
    TTS["tts.js"]
    Music["music.js"]
    Assembler["assembler.js"]
    Publisher["publisher.js"]
  end

  subgraph OAuth["Local OAuth callback"]
    OAuthSrv["http :3456<br/>(setup wizard only)"]
  end

  subgraph External["External services"]
    Claude["Anthropic API"]
    Pexels["Pexels API"]
    YT["YouTube Data API"]
    LI["LinkedIn API"]
    TT["TikTok API"]
    IG["Instagram Graph API"]
  end

  subgraph Local["Local-only deps"]
    WinTTS["Windows TTS<br/>(SAPI)"]
    FFmpeg["FFmpeg"]
    Cron["node-cron<br/>(daily schedule)"]
  end

  Renderer -- "ipc via contextBridge" --> Preload
  Preload --> Main
  Main --> Generator
  Main --> QuoteGen
  Main -- "auto-sync key" --> EnvMod
  Main --> OAuthSrv
  Main --> Cron
  Cron -. "fires" .-> Generator
  Cron -. "fires" .-> QuoteGen

  Generator --> Researcher --> Claude
  Generator --> ScriptW --> Claude
  Generator --> VideoFetch --> Pexels
  Generator --> TTS --> WinTTS
  Generator --> Music
  Generator --> Assembler --> FFmpeg
  Generator --> Publisher

  QuoteGen --> QuoteFetch
  QuoteGen --> QuoteCard
  QuoteGen --> Assembler
  QuoteGen --> Publisher

  Publisher --> YT
  Publisher --> LI
  Publisher --> TT
  Publisher --> IG

  Agent -. "optional fallback" .-> Claude
```

### Process model

- **Single Electron process** owns the desktop window(s): a system tray, a
  setup wizard (`setup.html`), the daily prompt UI (`index.html`), the
  quote-card fast-path UI (`quote.html`), and progress UIs.
- The renderer is isolated from Node — only methods exposed via
  `preload.js`'s `contextBridge` cross the boundary.
- **Pipeline modules** run inside the Electron main process. There is no
  separate backend server — the OAuth callback is the only HTTP listener.
- **Daily generation is driven by `node-cron`** scheduled in `main.js`
  (`POST_HOUR` / `POST_MINUTE` for the full video; `07:15` for the
  quote-card fast path).

## Lifecycles

### Full motivational-video lifecycle

```mermaid
sequenceDiagram
  autonumber
  participant Cr as node-cron / user click
  participant G  as generator.js
  participant R  as researcher.js
  participant SW as scriptwriter.js
  participant VF as videofetch.js
  participant T  as tts.js
  participant A  as assembler.js
  participant P  as publisher.js
  participant CL as Anthropic API
  participant PX as Pexels
  participant FF as FFmpeg
  participant Pl as Platforms

  Cr->>G: trigger
  G->>R: pick topic / research
  R->>CL: messages.create
  CL-->>R: research notes
  G->>SW: write script
  SW->>CL: messages.create
  CL-->>SW: shot list + narration
  G->>VF: fetch clips
  VF->>PX: search videos
  PX-->>VF: clip URLs
  G->>T: render narration
  T->>T: Windows SAPI → wav
  G->>A: assemble
  A->>FF: mux video + audio + music + captions
  FF-->>A: mp4
  G->>P: publish
  P->>Pl: YouTube · LinkedIn · TikTok · Instagram
  Pl-->>P: URLs / IDs
```

### Quote-card fast-path lifecycle

The quote pipeline does **not** require an Anthropic key — it falls back to
local quote generation and a static-card render.

```mermaid
sequenceDiagram
  autonumber
  participant Cr as cron 07:15 / user click
  participant Q  as quoteGenerator.js
  participant QF as quotefetch.js
  participant QC as quotecard.js
  participant A  as assembler.js
  participant P  as publisher.js
  participant FF as FFmpeg
  participant Pl as Platforms

  Cr->>Q: trigger
  Q->>QF: get a quote
  QF-->>Q: text + attribution
  Q->>QC: render card image
  QC-->>Q: png
  Q->>A: stitch to short video
  A->>FF: mux card + audio
  FF-->>A: mp4
  Q->>P: publish
  P->>Pl: post to enabled platforms
```

### One-click OAuth setup

```mermaid
sequenceDiagram
  autonumber
  participant U  as User
  participant SU as renderer/setup.html
  participant M  as main.js
  participant LS as :3456 callback
  participant Pr as Provider (e.g. YouTube)

  U->>SU: click "Connect YouTube"
  SU->>M: ipc("oauth:start", "youtube")
  M->>LS: spin up local listener on :3456
  M->>U: open browser → Pr authorize URL
  U->>Pr: consent
  Pr-->>LS: redirect with code
  LS->>M: code captured
  M->>Pr: exchange code for tokens
  Pr-->>M: access + refresh
  M->>M: save tokens via publisher.loadTokens/saveTokens
  M->>SU: ipc("oauth:done", "youtube")
  M->>LS: tear down listener
```

## Trust and data boundaries

```mermaid
graph LR
  subgraph T1["Untrusted (renderer)"]
    R[Renderer pages]
  end
  subgraph T2["Local trust (this machine)"]
    M[Electron main + pipeline]
    Env[".env<br/>(API keys + OAuth tokens)"]
    OS[":3456 OAuth listener<br/>(setup-time only)"]
  end
  subgraph T3["External (over network)"]
    Anthropic
    Pexels
    Platforms[YouTube / LinkedIn / TikTok / Instagram]
  end

  R -- "structured ipc only" --> M
  M -- "reads / writes" --> Env
  M -- "TLS" --> Anthropic
  M -- "TLS" --> Pexels
  M -- "TLS + OAuth bearer" --> Platforms
  M -- "loopback only" --> OS

  classDef untrusted fill:#fee,stroke:#c33,stroke-width:1px;
  classDef trusted   fill:#efe,stroke:#3a3,stroke-width:1px;
  classDef external  fill:#eef,stroke:#33c,stroke-width:1px;
  class R untrusted;
  class M,Env,OS trusted;
  class Anthropic,Pexels,Platforms external;
```

### Boundaries enforced by code

- **Renderer ↔ Main**: `contextIsolation: true`. The renderer has no Node,
  no `require`, no filesystem. Only methods exposed by `preload.js` cross
  the boundary.
- **Main ↔ External APIs**: API keys and OAuth tokens are loaded from
  `.env` (or auto-borrowed from the parent project's `.env` for
  `ANTHROPIC_API_KEY`) and never serialized into a renderer message.
- **OAuth listener** is bound to `127.0.0.1:3456` and only runs while the
  setup wizard is actively brokering a connection — torn down immediately
  after the code exchange completes.

### Files that hold secrets

- `.env` (git-ignored) — every API key and OAuth token listed in
  `.env.example`.
- The parent project's `.env`, read **only** for `ANTHROPIC_API_KEY` to
  avoid duplicating the key.

## Operational architecture

### Daily schedule

```mermaid
gantt
  title Daily run (default schedule)
  dateFormat HH:mm
  axisFormat %H:%M
  section Quote pipeline
  Quote card                :07:15, 5m
  section Video pipeline
  Research + script         :09:00, 2m
  Fetch + TTS + assemble    :09:02, 5m
  Publish to platforms      :09:07, 2m
```

`POST_HOUR` and `POST_MINUTE` in `.env` override the video-pipeline start
time. The quote fast path is currently fixed at `07:15` in `main.js`.

### Tray + windows

`main.js` runs as a tray app. The tray menu opens the setup wizard, the
daily-video prompt, or the quote-card window on demand. None of the
windows are required to be open for the cron schedule to fire.

## Tech stack summary

| Layer        | Tech                                        |
| ------------ | ------------------------------------------- |
| Desktop      | Electron 28.x                                |
| AI           | `@anthropic-ai/sdk` (Claude)                 |
| Stock video  | Pexels API (`axios`)                         |
| TTS          | Windows SAPI (local, no network)             |
| Assembly     | `fluent-ffmpeg` + system FFmpeg              |
| Publishing   | `googleapis` for YouTube; per-platform REST  |
| Scheduling   | `node-cron`                                  |
| Frontend     | Vanilla HTML/CSS/JS                          |
