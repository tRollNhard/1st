// Smillee — AudioEngine: mic / system-audio capture + beat detection
// Copyright (c) 2026 Jason W Clark (THATdudeAGAIN) — All rights reserved.

// Tracks inter-beat intervals from confirmed beats, predicts the next beat
// time, and pre-fires the visual response ~14 ms early so it lands on the
// beat rather than reacting after it. Falls back to reactive detection while
// confidence is building (first ~4 beats) and re-locks slowly after a tempo
// change (EMA α = 0.22 → ~5 beats to fully re-lock).
class BeatPredictor {
  constructor() {
    this.smoothedIBI = 0;          // ms — EMA of inter-beat interval
    this.lastBeatMs  = 0;          // ms — performance.now() of last real beat
    this.nextBeatMs  = 0;          // ms — predicted next beat
    this.confidence  = 0;          // 0..1
    this.lastStrength = 1;         // strength of last real beat (reused for predicted)

    this._fired      = false;      // true once prediction has fired this cycle
    this._fireAtMs   = 0;          // exact ms when prediction fired

    // Tuning knobs
    this.ALPHA          = 0.22;    // EMA coefficient — slow but not too slow re-lock
    this.PREFIRE_MS     = 14;      // fire this many ms before predicted beat
    this.CONF_THRESH    = 0.55;    // minimum confidence to use predictions
    this.DRIFT_TOL      = 0.18;    // ±18 % IBI variance = on-beat → raise confidence
    this.IBI_MIN        = 240;     // ms  (≈250 BPM ceiling)
    this.IBI_MAX        = 2400;    // ms  (≈25 BPM floor)
    this.MERGE_WINDOW   = 45;      // ms  — real beat within this of prediction = same event
  }

  // Called by AudioEngine when spectral-flux confirms a real beat.
  onRealBeat(nowMs, strength) {
    this.lastStrength = strength;

    if (this.lastBeatMs > 0) {
      const ibi = nowMs - this.lastBeatMs;
      if (ibi >= this.IBI_MIN && ibi <= this.IBI_MAX) {
        if (this.smoothedIBI === 0) {
          this.smoothedIBI = ibi;
        } else {
          const drift = Math.abs(ibi - this.smoothedIBI) / this.smoothedIBI;
          if (drift < this.DRIFT_TOL) {
            this.confidence = Math.min(1, this.confidence + 0.18);
          } else {
            this.confidence = Math.max(0, this.confidence - 0.22);
          }
          this.smoothedIBI = this.smoothedIBI * (1 - this.ALPHA) + ibi * this.ALPHA;
        }
      } else {
        // Out-of-range IBI (silence gap, breakdown) — erode confidence gently
        this.confidence = Math.max(0, this.confidence - 0.10);
      }
    }

    this.lastBeatMs = nowMs;
    this._fired     = false;
    this._fireAtMs  = 0;
    if (this.smoothedIBI > 0) {
      this.nextBeatMs = nowMs + this.smoothedIBI;
    }
  }

  // Call every tick. Returns beatStrength to use for a predicted beat, or 0.
  tick(nowMs) {
    if (this._fired)                          return 0;
    if (this.confidence < this.CONF_THRESH)   return 0;
    if (this.nextBeatMs <= 0)                 return 0;
    if (nowMs >= this.nextBeatMs - this.PREFIRE_MS) {
      this._fired    = true;
      this._fireAtMs = nowMs;
      return this.lastStrength;
    }
    return 0;
  }

  // True if a prediction was recently fired and a real beat arriving now
  // should be treated as the same event (suppresses a double-fire).
  isMergeWindow(nowMs) {
    return this._fired && nowMs <= this._fireAtMs + this.MERGE_WINDOW;
  }

  // Erode confidence slowly during silence (no real beats arriving).
  decayOnSilence(dt) {
    this.confidence = Math.max(0, this.confidence - dt * 0.07);
  }

  reset() {
    this.smoothedIBI = 0;
    this.lastBeatMs  = 0;
    this.nextBeatMs  = 0;
    this.confidence  = 0;
    this._fired      = false;
    this._fireAtMs   = 0;
  }
}

export class AudioEngine {
  constructor() {
    // Web Audio nodes
    this.audioCtx       = null;
    this.analyser       = null;
    this.freq           = null;   // Uint8Array frequency bin data
    this.audioSourceNode = null;
    this.audioStream    = null;

    // State
    this.audioStarting  = false;
    this.started        = false;
    this.audioSourceLabel = '';
    this.silenceAccum   = 0;
    this.silenceWarned  = false;

    // Beat detection
    this.beatAnalyser   = null;  // raw (no smoothing) analyser — beat detection only
    this.beatFreq       = null;
    this.BEAT_BINS      = 16;    // 0–~344 Hz at 2048 fftSize / 44100 Hz
    this.prevBassBins   = new Uint8Array(16);
    this.energyEMA      = 0;     // slow EMA of bass energy for adaptive threshold
    this.energyVar      = 0.001; // running variance — std dev drives the beat gate
    this.lastBeat       = 0;
    this.flash          = 0;
    this.bassSlow       = 0;
    this.BEAT_MIN_GAP_MS = 380;  // ms — allows up to ~158 BPM; prevents sub-beat double-fires

    // Beat prediction
    this.predictor = new BeatPredictor();

    // Callbacks — set by app.js
    this.onStatus = null;   // (msg: string) => void
    this.onStart  = null;   // (label: string) => void
    this.onStop   = null;   // () => void
  }

  // ── Internal stream setup ─────────────────────────────────────────────────
  async startWithStream(stream, label) {
    if (this.started) return;
    this.audioStream      = stream;
    this.audioSourceLabel = label;
    try {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (err) {
      throw new Error('AudioContext init failed: ' + ((err && err.message) ? err.message : err));
    }
    if (this.audioCtx.state === 'suspended') { try { await this.audioCtx.resume(); } catch (_) {} }
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.4;
    this.freq = new Uint8Array(this.analyser.frequencyBinCount);

    // Raw analyser for beat detection — no smoothing so transients are sharp
    this.beatAnalyser = this.audioCtx.createAnalyser();
    this.beatAnalyser.fftSize = 2048;
    this.beatAnalyser.smoothingTimeConstant = 0;
    this.beatFreq = new Uint8Array(this.beatAnalyser.frequencyBinCount);

    this.audioSourceNode = this.audioCtx.createMediaStreamSource(stream);
    this.audioSourceNode.connect(this.analyser);
    this.audioSourceNode.connect(this.beatAnalyser);
    stream.getAudioTracks().forEach(t => {
      t.addEventListener('ended', () => {
        if (!this.started) return;
        this.onStatus && this.onStatus('audio track ended — click an input to resume');
        this.stop();
      });
    });
    this.started = true;
    this.onStatus && this.onStatus(`listening · ${label}`);
    this.onStart  && this.onStart(label);
  }

  // ── Public: stop all audio ────────────────────────────────────────────────
  stop() {
    if (this.audioStream)    { this.audioStream.getTracks().forEach(t => { try { t.stop(); } catch (_) {} }); this.audioStream = null; }
    if (this.audioSourceNode){ try { this.audioSourceNode.disconnect(); } catch (_) {} this.audioSourceNode = null; }
    if (this.audioCtx)       { this.audioCtx.close().catch(() => {}); this.audioCtx = null; }
    this.analyser      = null;
    this.beatAnalyser  = null;
    this.beatFreq      = null;
    this.started       = false;
    this.silenceAccum  = 0;
    this.silenceWarned = false;
    this.energyEMA     = 0;
    this.energyVar     = 0.001;
    this.predictor.reset();
    this.onStop   && this.onStop();
    this.onStatus && this.onStatus('stopped — pick Microphone or System Audio');
  }

  // ── Public: microphone input ──────────────────────────────────────────────
  async startMic() {
    if (this.audioStarting) return;
    if (this.started && this.audioSourceLabel !== 'mic') this.stop();
    if (this.started) return;
    this.audioStarting = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        video: false,
      });
      await this.startWithStream(stream, 'mic');
    } catch (err) {
      alert('Could not access microphone: ' + (err && err.message ? err.message : err));
    } finally { this.audioStarting = false; }
  }

  // ── Public: system-audio loopback ────────────────────────────────────────
  async startSystemAudio() {
    if (this.audioStarting) return;
    if (this.started && this.audioSourceLabel !== 'system') this.stop();
    if (this.started) return;
    this.audioStarting = true;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const audioTracks = stream.getAudioTracks().filter(t => t.readyState === 'live');
      if (audioTracks.length === 0) {
        alert('No live audio captured.\n\n• Nothing is playing on the Windows default output device\n• Try setting speakers as the default device\n• The device may be in exclusive mode');
        stream.getTracks().forEach(t => t.stop());
        return;
      }
      stream.getVideoTracks().forEach(t => t.stop());
      await this.startWithStream(new MediaStream(audioTracks), 'system');
    } catch (err) {
      if (this.audioStream && !this.started) this.stop();
      if (err && err.name === 'NotAllowedError')
        this.onStatus && this.onStatus('Permission denied — could not capture system audio');
      else
        alert('Could not capture system audio: ' + (err && err.message ? err.message : err));
    } finally { this.audioStarting = false; }
  }

  // ── Internal: energy-based beat detection ─────────────────────────────────
  // Tracks a slow EMA + variance of bass-bin energy. Fires when instantaneous
  // energy exceeds EMA + 1.6 σ — adapts to any genre/volume automatically.
  _detectBeat(now) {
    const src = this.beatFreq;
    let energy = 0;
    for (let i = 2; i <= 9; i++) {
      const v = src[i] / 255;
      energy += v * v;
    }
    energy /= 8;
    const alpha = 0.011;   // ~90-frame window ≈ 1.5 s at 60 fps — slower baseline = cleaner transient detection
    this.energyEMA = this.energyEMA * (1 - alpha) + energy * alpha;
    const diff = energy - this.energyEMA;
    this.energyVar = this.energyVar * (1 - alpha) + diff * diff * alpha;
    const std = Math.sqrt(Math.max(this.energyVar, 1e-6));
    if (energy > this.energyEMA + 2.1 * std && now - this.lastBeat > this.BEAT_MIN_GAP_MS) {
      this.lastBeat = now;
      return Math.min(3, diff / std);
    }
    return 0;
  }

  // ── Public: call once per animation frame ─────────────────────────────────
  // Returns { bass, mid, high, flash, beat, beatStrength } or null when stopped.
  tick(now, dt) {
    if (!this.analyser || !this.freq) return null;
    this.analyser.getByteFrequencyData(this.freq);
    if (this.beatAnalyser) this.beatAnalyser.getByteFrequencyData(this.beatFreq);

    // Energy bands
    let bass = 0, mid = 0, high = 0;
    const binCount = this.freq.length;
    const bassEnd  = Math.floor(binCount * 0.06);
    const midEnd   = Math.floor(binCount * 0.25);
    for (let i = 0; i < bassEnd; i++) bass += this.freq[i];
    for (let i = bassEnd; i < midEnd; i++) mid += this.freq[i];
    for (let i = midEnd; i < binCount; i++) high += this.freq[i];
    bass /= bassEnd * 255;
    mid  /= (midEnd - bassEnd) * 255;
    high /= (binCount - midEnd) * 255;

    // Punch bass (subtracts slow average so only transients drive energy)
    this.bassSlow   = this.bassSlow * 0.94 + bass * 0.06;
    const bassPunch = Math.max(0, bass - this.bassSlow * 0.80);
    bass            = bass * 0.20 + bassPunch * 3.2;

    const realStrength = this._detectBeat(now);
    const realBeat     = realStrength > 0;

    let beat          = false;
    let beatStrength  = 0;

    if (realBeat) {
      this.predictor.onRealBeat(now, realStrength);
      // Suppress the real-beat visual if prediction already fired for this same beat
      // (avoids a double-flash ~14 ms apart).
      if (!this.predictor.isMergeWindow(now)) {
        beat         = true;
        beatStrength = realStrength;
      }
    }

    // Check for a pre-fired predicted beat (only fires when confidence is high enough)
    if (!beat) {
      const predictedStrength = this.predictor.tick(now);
      if (predictedStrength > 0) {
        beat         = true;
        beatStrength = predictedStrength;
      }
    }

    // Decay predictor confidence while signal is silent
    if (bass + mid + high < 0.02) this.predictor.decayOnSilence(dt);

    if (beat) this.flash = Math.min(1, 0.7 + beatStrength * 0.30);
    this.flash *= Math.exp(-dt * 2.8);  // slower decay — flash stays visible ~350ms

    // Silence warning
    this.silenceAccum = (bass + mid + high < 0.02) ? this.silenceAccum + dt : 0;
    if (this.silenceAccum > 3 && !this.silenceWarned) {
      this.silenceWarned = true;
      this.onStatus && this.onStatus(
        'NO INPUT — set Spotify output to your Windows default device ' +
        '(Sound settings → Volume mixer → Spotify → speakers)'
      );
    } else if (this.silenceAccum === 0 && this.silenceWarned) {
      this.silenceWarned = false;
    }

    return { bass, mid, high, flash: this.flash, beat, beatStrength };
  }
}
