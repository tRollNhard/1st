// Smillee — shared utilities, constants, colour helpers, curl noise
// Copyright (c) 2026 Jason W Clark (THATdudeAGAIN) — All rights reserved.

// ── Constants ────────────────────────────────────────────────────────────────
export const GOLDEN     = 137.508;
export const SMILE_HUES = [182, 155, 88, 55, 30, 12, 330, 285, 248];
export const SMILE_N    = 9;
export const FUR_N      = 42;
export const BODY_BLOB_N = 13;

export const DPR = () => devicePixelRatio || 1;

// ── Rotating hue offset (module-level singleton — all callers share one state)
let _rotate = 0;
export function hueFor(i, extra = 0) { return (i * GOLDEN + _rotate + extra) % 360; }
export function addRotate(delta)  { _rotate = (_rotate + delta) % 360; }
export function tickRotate(dt)    { _rotate = (_rotate + 4 * dt) % 360; }
export function getRotate()       { return _rotate; }

// ── Colour helper ─────────────────────────────────────────────────────────────
export function hsla(h, s, l, a) {
  return `hsla(${(h % 360 + 360) % 360},${s}%,${l}%,${a})`;
}

// ── Curl noise for drip particle advection ────────────────────────────────────
export function curl(x, y, t) {
  const sx = 0.0018, sy = 0.0022;
  const a  = Math.sin(x * sx + t * 0.23)       * Math.cos(y * sy + t * 0.17);
  const b  = Math.sin(x * sx * 1.7 - t * 0.19) * Math.cos(y * sy * 1.3 + t * 0.29) * 0.6;
  const f  = a + b;
  const eps = 2;
  const fx = (Math.sin((x+eps)*sx+t*0.23)*Math.cos(y*sy+t*0.17)
            + Math.sin((x+eps)*sx*1.7-t*0.19)*Math.cos(y*sy*1.3+t*0.29)*0.6) - f;
  const fy = (Math.sin(x*sx+t*0.23)*Math.cos((y+eps)*sy+t*0.17)
            + Math.sin(x*sx*1.7-t*0.19)*Math.cos((y+eps)*sy*1.3+t*0.29)*0.6) - f;
  return { x: fy / eps, y: -fx / eps };
}
