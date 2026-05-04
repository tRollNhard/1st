// Smillee — app entry point: wires audio → renderer → fx, owns UI + camera + recording
// Copyright (c) 2026 Jason W Clark (THATdudeAGAIN) — All rights reserved.

import { addRotate, tickRotate, hueFor, DPR } from './utils.js';
import { AudioEngine }   from './audio.js';
import { SmileeRenderer } from './renderer.js';
import { FXEngine }       from './fx.js';
import { dispatchFrame, dispatchBeat } from './plugins.js';

// ── Optional plugins: uncomment to activate ──────────────────────────────────
// import './plugins/example.js';

// ── Global error display ─────────────────────────────────────────────────────
const _shownErrs = new Set();
window.addEventListener('error', (e) => {
  const msg = (e.error && e.error.stack) || e.message || 'unknown error';
  const key = msg.split('\n')[0];
  if (_shownErrs.has(key)) return;
  _shownErrs.add(key);
  setStatus('ERR: ' + key.slice(0, 240));
});
window.addEventListener('unhandledrejection', (e) => {
  const msg = (e.reason && (e.reason.stack || e.reason.message)) || String(e.reason);
  const key = msg.split('\n')[0];
  if (_shownErrs.has(key)) return;
  _shownErrs.add(key);
  setStatus('REJ: ' + key.slice(0, 240));
});

// ── Canvas setup ─────────────────────────────────────────────────────────────
const canvas     = document.getElementById('c');
const metaCanvas = document.createElement('canvas');
let W, H, rectX, rectY, rectW, rectH, drawCx, drawCy;

// ── Subsystems ────────────────────────────────────────────────────────────────
const audio    = new AudioEngine();
const renderer = new SmileeRenderer(canvas, metaCanvas);
const fx       = new FXEngine();

// ── Mode ─────────────────────────────────────────────────────────────────────
let mode = 'spotify';

function setMode(next) {
  if (recorder && recorder.state === 'recording') { setStatus('Stop recording before switching modes'); return; }
  mode = next;
  renderer.mode = mode;
  document.body.classList.toggle('tiktok', mode === 'tiktok');

  const spot = document.getElementById('btn-spotify');
  const tik  = document.getElementById('btn-tiktok');
  spot.classList.toggle('active', mode === 'spotify');
  spot.classList.toggle('ghost',  mode !== 'spotify');
  spot.setAttribute('aria-pressed', String(mode === 'spotify'));
  tik.classList.toggle('active', mode === 'tiktok');
  tik.classList.toggle('ghost',  mode !== 'tiktok');
  tik.setAttribute('aria-pressed', String(mode === 'tiktok'));
  document.getElementById('btn-record').disabled = (mode !== 'tiktok') || !audio.started;

  if (mode !== 'tiktok' && cameraStream) toggleCamera();
  resize();
}

// ── Recording state (declared here so resize() guard works on first call) ─────
let recorder = null, recChunks = [];
let recStart = 0, recTimerHandle = 0;

// ── Resize ────────────────────────────────────────────────────────────────────
function resize() {
  if (recorder && recorder.state === 'recording') return;
  const dpr = DPR();
  W = canvas.width  = window.innerWidth  * dpr;
  H = canvas.height = window.innerHeight * dpr;
  canvas.style.width  = window.innerWidth  + 'px';
  canvas.style.height = window.innerHeight + 'px';
  metaCanvas.width = W; metaCanvas.height = H;

  if (mode === 'tiktok') {
    const vw = Math.min(window.innerHeight * 9/16, window.innerWidth);
    const vh = vw * 16/9;
    rectW = vw * dpr; rectH = vh * dpr;
    rectX = (W - rectW) / 2; rectY = (H - rectH) / 2;
  } else {
    rectX = 0; rectY = 0; rectW = W; rectH = H;
  }
  drawCx = rectX + rectW / 2;
  drawCy = rectY + rectH / 2;

  // Push layout to renderer
  Object.assign(renderer, { W, H, rectX, rectY, rectW, rectH, drawCx, drawCy, mode });
}
resize();
window.addEventListener('resize', resize);

// ── Status helper ─────────────────────────────────────────────────────────────
function setStatus(s) { document.getElementById('status').textContent = s; }

// ── Audio callbacks ───────────────────────────────────────────────────────────
audio.onStatus = setStatus;
audio.onStart = (label) => {
  document.getElementById('btn-mic').disabled  = true;
  document.getElementById('btn-sys').disabled  = true;
  document.getElementById('btn-stop').disabled = false;
  document.getElementById('btn-mic').classList.toggle('active', label === 'mic');
  document.getElementById('btn-sys').classList.toggle('active', label === 'system');
  document.getElementById('btn-mic').classList.toggle('ghost',  label !== 'mic');
  document.getElementById('btn-sys').classList.toggle('ghost',  label !== 'system');
  document.getElementById('btn-record').disabled = (mode !== 'tiktok');
  requestAnimationFrame(frame);
};
audio.onStop = () => {
  if (recorder && recorder.state === 'recording') stopRecording();
  document.getElementById('btn-mic').disabled  = false;
  document.getElementById('btn-sys').disabled  = false;
  document.getElementById('btn-stop').disabled = true;
  document.getElementById('btn-mic').classList.remove('active'); document.getElementById('btn-mic').classList.add('ghost');
  document.getElementById('btn-sys').classList.remove('active'); document.getElementById('btn-sys').classList.add('ghost');
  document.getElementById('btn-record').disabled = true;
  if (!idleScheduled) { idleScheduled = true; requestAnimationFrame(idleFrame); }
};

// ── Camera ────────────────────────────────────────────────────────────────────
let cameraStream = null;
async function toggleCamera() {
  const btn = document.getElementById('btn-camera');
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
    renderer.cameraEl = null;
    btn.textContent = 'Camera'; btn.classList.add('ghost'); btn.classList.remove('active');
    return;
  }
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false,
    });
    const el = document.createElement('video');
    el.srcObject = cameraStream; el.autoplay = true; el.muted = true; el.playsInline = true;
    try { await el.play(); } catch (playErr) {
      cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; renderer.cameraEl = null;
      alert('Camera acquired but could not play: ' + (playErr.message || playErr)); return;
    }
    renderer.cameraEl = el;
    btn.textContent = 'Camera ✓'; btn.classList.remove('ghost'); btn.classList.add('active');
  } catch (err) { alert('Could not access camera: ' + err.message); }
}

// ── Recording ─────────────────────────────────────────────────────────────────
function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}
function tickRecTimer() { document.getElementById('rec-time').textContent = fmtTime(performance.now() - recStart); }
function resetRecordUI() {
  document.body.classList.remove('recording');
  document.getElementById('btn-record').textContent = '● Record';
  document.getElementById('btn-spotify').disabled = false;
  document.getElementById('btn-tiktok').disabled  = false;
  if (recTimerHandle) { clearInterval(recTimerHandle); recTimerHandle = 0; }
  document.getElementById('rec-time').textContent = '';
}

function startRecording() {
  if (!audio.started || mode !== 'tiktok') return;
  if (recorder && recorder.state === 'recording') return;
  const liveAudio = audio.audioStream && audio.audioStream.getAudioTracks().filter(t => t.readyState === 'live');
  if (!liveAudio || liveAudio.length === 0) { setStatus('cannot record — no live audio track'); return; }

  const canvasStream = canvas.captureStream(60);
  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus'
             : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus') ? 'video/webm;codecs=vp8,opus'
             : 'video/webm';
  try {
    recorder = new MediaRecorder(
      new MediaStream([...canvasStream.getVideoTracks(), ...liveAudio]),
      { mimeType: mime, videoBitsPerSecond: 8_000_000 }
    );
  } catch (err) { setStatus('recorder init failed: ' + (err.message || err)); return; }

  recChunks = [];
  recorder.ondataavailable = e => { if (e.data && e.data.size) recChunks.push(e.data); };
  recorder.onerror = e => {
    setStatus('recorder error: ' + (e.error && e.error.name ? e.error.name : 'unknown'));
    try { recorder.stop(); } catch (_) {}
  };
  recorder.onstop = () => {
    try {
      if (recChunks.length === 0) { setStatus('recording produced no data'); }
      else {
        const blob = new Blob(recChunks, { type: 'video/webm' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = `smillee-${Date.now()}.webm`; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        setStatus('saved ' + (blob.size / 1024 / 1024).toFixed(1) + ' MB');
      }
    } finally { recChunks = []; resetRecordUI(); }
  };
  try { recorder.start(500); } catch (err) { setStatus('recorder.start failed: ' + (err.message || err)); return; }

  document.body.classList.add('recording');
  document.getElementById('btn-record').textContent = '■ Stop';
  document.getElementById('btn-spotify').disabled = true;
  document.getElementById('btn-tiktok').disabled  = true;
  recStart = performance.now(); tickRecTimer();
  recTimerHandle = setInterval(tickRecTimer, 500);
  setStatus('recording');
}
function stopRecording() {
  if (!recorder || recorder.state === 'inactive') return;
  try { recorder.stop(); } catch (_) {}
}

// ── UI event wiring ───────────────────────────────────────────────────────────
document.getElementById('btn-mic').addEventListener('click',     () => audio.startMic());
document.getElementById('btn-sys').addEventListener('click',     () => audio.startSystemAudio());
document.getElementById('btn-stop').addEventListener('click',    () => audio.stop());
document.getElementById('btn-spotify').addEventListener('click', () => setMode('spotify'));
document.getElementById('btn-tiktok').addEventListener('click',  () => setMode('tiktok'));
document.getElementById('btn-camera').addEventListener('click',  toggleCamera);
document.getElementById('btn-record').addEventListener('click',  () => {
  (recorder && recorder.state === 'recording') ? stopRecording() : startRecording();
});
canvas.addEventListener('click', () => document.getElementById('panel').classList.toggle('hide'));
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !document.fullscreenElement)
    document.getElementById('panel').classList.remove('hide');
  if (e.key === 'F11') {
    e.preventDefault();
    document.fullscreenElement
      ? document.exitFullscreen().catch(() => {})
      : document.documentElement.requestFullscreen().catch(() => {});
  }
  if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey && !e.altKey &&
      audio.started && mode === 'tiktok') {
    (recorder && recorder.state === 'recording') ? stopRecording() : startRecording();
  }
});
window.addEventListener('beforeunload', () => {
  if (cameraStream)  try { cameraStream.getTracks().forEach(t => t.stop()); } catch (_) {}
  if (audio.audioStream) try { audio.audioStream.getTracks().forEach(t => t.stop()); } catch (_) {}
  if (recorder && recorder.state === 'recording') try { recorder.stop(); } catch (_) {}
});

// ── Render state ──────────────────────────────────────────────────────────────
let lastTime = 0;

// Firework cadence — beat-aligned; fires the next beat after fwGapMs has elapsed.
// Aim: 1 firework every 2.5 s on average.  Occasional double-pop on huge beats.
let fwLastMs = 0;
let fwGapMs  = 2200 + Math.random() * 800;
const FW_MIN_GAP = 1900;

// ── Main animation frame (audio active) ──────────────────────────────────────
function frame(nowMs) {
  if (!audio.started) return;   // guard: idle loop took over
  requestAnimationFrame(frame);

  const now = nowMs || performance.now();
  const t   = now / 1000;
  const dt  = Math.min(0.05, (now - lastTime) / 1000) || 0.016;
  lastTime  = now;

  const energy = audio.tick(now, dt);
  if (!energy) return;
  const { bass, mid, high, flash, beat, beatStrength } = energy;

  // Rotate hue palette
  if (beat) addRotate(22 + Math.random() * 28);
  tickRotate(dt);

  // Spawn ripple on beat
  if (beat) fx.spawnRipple(Math.min(1, 0.4 + beatStrength * 0.3), hueFor(Math.floor(Math.random() * 8)));

  // Lightning on harder beats — limit to ~one strike per 600 ms so it stays dramatic.
  if (beat && beatStrength > 0.55) fx.spawnLightning(drawCx, drawCy, rectW, rectH, beatStrength);

  // Beat-snapped fireworks: fires the FIRST beat that lands after fwGapMs has elapsed.
  // If no beat for too long, fire on the next idle frame so silent passages still pop.
  const sinceFw = now - fwLastMs;
  if (fwLastMs === 0 || (beat && sinceFw >= fwGapMs) || (!beat && sinceFw >= fwGapMs + 1100)) {
    if (sinceFw >= FW_MIN_GAP) {
      const fxw = rectW, fyh = rectH;
      const fwX = rectX + fxw * (0.18 + Math.random() * 0.64);
      const fwY = rectY + fyh * (0.16 + Math.random() * 0.50);
      fx.spawnFirework(fwX, fwY);
      // Occasional double-pop on a strong beat
      if (beat && beatStrength > 0.85 && Math.random() < 0.45) {
        const fwX2 = rectX + fxw * (0.18 + Math.random() * 0.64);
        const fwY2 = rectY + fyh * (0.16 + Math.random() * 0.50);
        fx.spawnFirework(fwX2, fwY2);
      }
      fwLastMs = now;
      fwGapMs  = 2200 + Math.random() * 800;     // 2.2 – 3.0 s next gap
    }
  }

  // Draw Smillee body
  const { bodyR, drawCx: cx, drawCy: cy } = renderer.drawFrame(t, dt, bass, mid, high, flash, beat, beatStrength);

  // Draw FX layer (on top of body, inherits main ctx)
  fx.drawFrame(renderer.ctx, t, dt, bass, mid, high, flash, beat, beatStrength,
               bodyR, cx, cy, rectX, rectY, rectW, rectH, audio.freq);

  // Dispatch plugin frame hooks
  dispatchFrame(renderer.ctx, { t, dt, bass, mid, high, flash, beat, beatStrength, bodyR, drawCx: cx, drawCy: cy });
  if (beat) dispatchBeat(beatStrength, renderer.ctx);

  // Status bar + level meter
  if (!audio.silenceWarned) {
    if (beat) setStatus(`BEAT ×${beatStrength.toFixed(2)}`);
    else setStatus(`listening · bass ${(bass * 100).toFixed(0)} mid ${(mid * 100).toFixed(0)} hi ${(high * 100).toFixed(0)}`);
  }
  document.getElementById('bar-bass').style.height = (4 + bass * 32) + 'px';
  document.getElementById('bar-mid').style.height  = (4 + mid  * 32) + 'px';
  document.getElementById('bar-high').style.height = (4 + high * 32) + 'px';
}

// ── Idle animation loop ───────────────────────────────────────────────────────
let idleScheduled = false;
function idleFrame() {
  idleScheduled = false;
  if (audio.started) return;
  idleScheduled = true;
  renderer.drawIdle(performance.now() / 1000);
  requestAnimationFrame(idleFrame);
}

// Kick off idle on load
idleScheduled = true;
requestAnimationFrame(idleFrame);

// Initial status
setStatus('idle — pick Microphone or System Audio to wake Smillee');
