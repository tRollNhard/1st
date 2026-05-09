# AUDIO.md — narration and audio for web video presentations

Reference for the `web-video-presentation` skill. Covers capture → cleanup → mix → encode for narrated slide videos that play inline in browsers.

## 1. Capture

| Source | Tool | Settings | Notes |
|---|---|---|---|
| External mic (USB/XLR) | OS recorder, Audacity, OBS | 48 kHz, 24-bit WAV, mono | Best quality. Use a pop filter; aim for −12 to −6 dBFS peaks. |
| Built-in laptop mic | OS recorder | 48 kHz, 16-bit WAV, mono | Fallback. Expect room noise — plan to denoise. |
| Browser capture | `MediaRecorder` + `getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false } })` | Opus in WebM | Disable AGC if you want consistent levels across takes. |
| TTS narration | Web Speech API, ElevenLabs, OpenAI TTS | 48 kHz WAV/Opus | Synthesize per slide so retakes don't re-render the whole script. |

**Rule of thumb**: record ~6 dB hotter than your target so cleanup has headroom; normalize at the end, not the start.

## 2. Cleanup

Run in this order — each step assumes the prior is done:

1. **Trim silence** at head/tail (250 ms padding).
2. **High-pass filter** at 80 Hz — removes rumble, AC hum, mic-stand thumps.
3. **Denoise** — capture a 1–2 s noise profile from a silent section, then spectral-subtract (Audacity Noise Reduction, RNNoise, `ffmpeg afftdn`).
4. **De-ess** if sibilance is harsh (5–8 kHz).
5. **Compress** lightly: ratio 2:1–3:1, threshold around −18 dBFS, makeup gain to taste.
6. **Loudness normalize** to broadcast targets:
   - **Web video**: −16 LUFS integrated, −1 dBTP true peak (matches YouTube/Vimeo).
   - **Podcast-style**: −19 to −16 LUFS.
   - Use `ffmpeg -af loudnorm=I=-16:TP=-1:LRA=11` (two-pass for accuracy).

## 3. Mix and sync

- **Per-slide audio files** beat one long file: easier to retake, easier to align with slide transitions, and the player can preload sequentially.
- If you're mixing **narration + music bed**, duck the music: sidechain compressor keyed to narration, −9 to −12 dB ducking, 200 ms attack, 400 ms release. Keep music below −24 LUFS.
- Sync drift on long takes is real. For >5 min videos, cut on natural breath pauses and re-anchor; don't fight a 100 ms drift across 20 slides.

## 4. Encode for the web

Match codec to delivery:

```bash
# MP4 — broadest compatibility (Safari, all browsers, embedded players)
ffmpeg -i in.wav -i slides.mp4 \
  -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -ar 48000 -ac 2 \
  -movflags +faststart \
  out.mp4

# WebM — smaller files, modern browsers
ffmpeg -i in.wav -i slides.mp4 \
  -c:v libvpx-vp9 -crf 32 -b:v 0 \
  -c:a libopus -b:a 96k \
  out.webm
```

**Why these flags**:
- `-movflags +faststart` moves the moov atom to the front so the browser can start playback before the file is fully downloaded. Without this, a `<video>` tag stalls until the whole file loads.
- `-pix_fmt yuv420p` is required for Safari and most embedded H.264 decoders.
- `-ar 48000 -ac 2` keeps audio at industry-standard 48 kHz stereo even if your source is mono — some browsers misbehave on mono AAC.

## 5. Captions (WebVTT)

Generate a caption track and reference it from the `<video>` element:

```html
<video controls poster="poster.jpg">
  <source src="presentation.mp4" type="video/mp4">
  <source src="presentation.webm" type="video/webm">
  <track kind="captions" src="captions.vtt" srclang="en" label="English" default>
</video>
```

WebVTT skeleton:

```vtt
WEBVTT

00:00.000 --> 00:04.500
Welcome — today we're walking through the architecture of Open Claude Cowork.

00:04.500 --> 00:09.200
We'll cover three layers: the Electron shell, the Express backend, and skill matching.
```

Tools: Whisper (`whisper file.wav --output_format vtt`), Descript, or hand-author from the script.

## 6. Accessibility checks

- **Captions present and accurate** (WCAG 1.2.2).
- **Audio description** for visual-only content (WCAG 1.2.5) — either via descriptive narration in the main track or a separate descriptive track.
- **No autoplay with sound** (WCAG 1.4.2) — `<video controls>` without `autoplay`, or `autoplay muted` if you must.
- **Keyboard-operable controls** — the native `controls` attribute handles this; if you build a custom player, ensure tab order and Space/Enter behavior.
- **Sufficient contrast** on burned-in captions if you skip WebVTT (4.5:1 for caption text vs. background).

## 7. Common failure modes

| Symptom | Likely cause | Fix |
|---|---|---|
| Audio out of sync after export | Variable-frame-rate source | Re-encode source to CFR: `ffmpeg -i in.mp4 -r 30 -vsync cfr cfr.mp4`. |
| Hiss/buzz in final | Skipped denoise or denoised too aggressively | Re-do step 2.3 with a fresh noise profile; aim for −60 dBFS noise floor, not lower. |
| Loud peaks despite normalization | Normalized peak instead of LUFS | Use loudnorm two-pass, not `-af volume`. |
| Safari won't play WebM | Older Safari versions | Always ship MP4 fallback as the first `<source>`. |
| Video starts late on slow connections | Missing `+faststart` | Re-mux: `ffmpeg -i in.mp4 -c copy -movflags +faststart out.mp4`. |
| Music drowns narration | No ducking | Sidechain duck −10 dB keyed to narration track. |

## 8. Quick checklist

- [ ] 48 kHz capture, peaks at −6 dBFS or below
- [ ] High-pass at 80 Hz, denoise, compress, loudness-normalize to −16 LUFS
- [ ] Per-slide audio files for easy retakes
- [ ] MP4 (H.264/AAC) + WebM (VP9/Opus) outputs
- [ ] `+faststart` on MP4
- [ ] WebVTT captions linked via `<track>`
- [ ] No autoplay with sound; controls visible
- [ ] Test in Safari, Chrome, Firefox before shipping
