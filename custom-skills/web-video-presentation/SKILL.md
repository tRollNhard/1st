---
name: web-video-presentation
version: 0.1
license: MIT
description: >
  Build web-deliverable video presentations — slide-driven storyboards, synced
  narration, captions, and MP4/WebM export tuned for browser playback. Use when
  turning slides, a script, or a notion of a talk into a self-contained video
  that plays inline on the web. Triggered by "create a video presentation",
  "turn these slides into a video", "record narration over slides", "screencast
  presentation", "explainer video for the web", "voiceover slideshow".
---

# Web Video Presentation Skill

Turn slides + a script into a self-contained narrated video that plays inline in browsers.

## When to use

- "Create a video presentation from these slides"
- "Record narration over a slideshow and export for the web"
- "Build an explainer video I can embed on a landing page"
- "Turn this script into a screencast"

## Pipeline

1. **Storyboard** — one row per slide: visuals, narration script, slide duration, transition.
2. **Capture audio** — per-slide WAV files at 48 kHz; see `references/AUDIO.md` for capture and cleanup.
3. **Render slides** — Remotion (React-based, programmatic), HTML→video via Puppeteer/Playwright, or pre-exported PNG/MP4 frames.
4. **Mix** — composite slides + narration + optional music bed (ducked −10 dB under narration).
5. **Caption** — generate WebVTT (Whisper, Descript, or hand-authored from the script).
6. **Export** — MP4 (H.264/AAC) as primary + WebM (VP9/Opus) as smaller modern fallback. Always use `+faststart` on MP4.
7. **Embed** — `<video controls poster>` with both `<source>` tags and a `<track kind="captions">`.

## Key references

- `references/AUDIO.md` — capture, cleanup, mix, encode for narration. Includes ffmpeg recipes, loudness targets (−16 LUFS for web), and a failure-mode table.

## Output formats

| Format | Codecs | When |
|---|---|---|
| MP4 | H.264 + AAC | Always — broadest compatibility (Safari + everyone else) |
| WebM | VP9 + Opus | Smaller files, modern browsers |
| WebVTT | UTF-8 cues | Captions track for accessibility |
| Poster | JPEG/PNG | Frame shown before play |

## Accessibility (non-negotiable)

- WebVTT captions present and accurate (WCAG 1.2.2)
- No autoplay with sound (WCAG 1.4.2) — use `<video controls>` without autoplay, or `autoplay muted`
- Native `<video controls>` for keyboard operability — if you build a custom player, verify tab order and Space/Enter behavior
- Audio description for visual-only content (WCAG 1.2.5) — bake into narration or ship a separate descriptive track

## Tools (optional)

- **ffmpeg** — encoding, loudness normalization, muxing
- **Remotion** — React-based programmatic video rendering (matches your `remotion-best-practices` skill)
- **Whisper** — caption generation from finished audio
- **MediaRecorder API / Web Speech API** — in-browser capture and TTS
- **Puppeteer / Playwright** — HTML slides → frames

## Quick checklist

- [ ] Storyboard with per-slide script and durations
- [ ] Audio captured per-slide at 48 kHz, normalized to −16 LUFS
- [ ] Slides rendered at the same FPS as final video (typically 30 fps)
- [ ] MP4 + WebM exported, MP4 has `+faststart`
- [ ] WebVTT captions linked via `<track>`
- [ ] Tested in Safari, Chrome, Firefox before shipping
