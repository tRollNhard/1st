// Smillee — FXEngine: drip particles, beat ripples, high-freq sparkle rays
// Copyright (c) 2026 Jason W Clark (THATdudeAGAIN) — All rights reserved.

import { hsla, hueFor, curl, DPR, SMILE_N } from './utils.js';

export class FXEngine {
  constructor() {
    this.drips   = [];
    this.ripples = [];
    this.TRAIL_LEN = 90;
    this.MAX_DRIPS = 280;
  }

  // ── Spawn helpers ─────────────────────────────────────────────────────────
  spawnDrip(x, y, hue, vx0, vy0) {
    this.drips.push({
      x, y,
      vx: vx0 + (Math.random() - 0.5) * 30,
      vy: vy0 + (Math.random() - 0.5) * 30,
      r: 0.5 + Math.random() * 0.7,
      hue, life: 1,
      spin: (Math.random() < 0.5 ? 1 : -1) * (0.8 + Math.random() * 1.4),
      noiseSeed: Math.random() * 1000,
      history: [{ x, y }],
    });
    if (this.drips.length > this.MAX_DRIPS) this.drips.shift();
  }

  spawnRipple(strength, hue) {
    this.ripples.push({ r: 0, life: 1, strength, hue });
    if (this.ripples.length > 14) this.ripples.shift();
  }

  // ── Main draw call ────────────────────────────────────────────────────────
  drawFrame(ctx, t, dt, bass, mid, high, flash, beat, beatStrength, bodyR, drawCx, drawCy, rectX, rectY, rectW, rectH) {
    const dpr = DPR();

    // ── High-freq sparkle rays ─────────────────────────────────────────────
    if (high > 0.07) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(drawCx, drawCy);
      const rayCount = 22;
      for (let i = 0; i < rayCount; i++) {
        const rayHue = hueFor(i * 2, 175);
        const a   = (i / rayCount) * Math.PI * 2 + t * 0.65;
        const len = bodyR * 0.45 + high * bodyR * 1.1 + Math.sin(t * 4.2 + i) * bodyR * 0.09;
        const lg  = ctx.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
        lg.addColorStop(0,   hsla(rayHue, 100, 65, 0));
        lg.addColorStop(0.5, hsla(rayHue, 100, 72, 0.32 * high));
        lg.addColorStop(1,   hsla(rayHue, 100, 65, 0));
        ctx.strokeStyle = lg; ctx.lineWidth = 1.8 * dpr;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len); ctx.stroke();
      }
      ctx.restore();
    }

    // ── Beat ripples ───────────────────────────────────────────────────────
    ctx.globalCompositeOperation = 'lighter';
    for (const rp of this.ripples) {
      rp.r    += (390 + rp.strength * 540) * dt * dpr;
      rp.life -= dt * 0.88;
      if (rp.life <= 0) continue;
      ctx.strokeStyle = hsla(rp.hue, 100, 65, rp.life * 0.72);
      ctx.lineWidth   = (3.5 + rp.strength * 6.5) * dpr * rp.life;
      ctx.beginPath(); ctx.arc(drawCx, drawCy, rp.r, 0, Math.PI*2); ctx.stroke();
    }
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      if (this.ripples[i].life <= 0) this.ripples.splice(i, 1);
    }

    // ── Spawn drips on beat ────────────────────────────────────────────────
    if (beat) {
      const burst = 3 + Math.floor(beatStrength * 3);
      for (let s = 0; s < burst; s++) {
        const ang  = Math.random() * Math.PI * 2;
        const sx   = drawCx + Math.cos(ang) * bodyR;
        const sy   = drawCy + Math.sin(ang) * bodyR;
        const dHue = hueFor(Math.floor(Math.random() * SMILE_N));
        const spd  = 160 + beatStrength * 200 + Math.random() * 110;
        this.spawnDrip(sx, sy, dHue, Math.cos(ang) * spd, Math.sin(ang) * spd);
      }
    }

    // ── Drip physics + render ──────────────────────────────────────────────
    const curlGain = (240 + mid * 480 + bass * 300) * dpr;
    for (const d of this.drips) {
      // Spin rotation
      const cs = Math.cos(d.spin * dt), sn = Math.sin(d.spin * dt);
      const nvx = d.vx * cs - d.vy * sn, nvy = d.vx * sn + d.vy * cs;
      d.vx = nvx; d.vy = nvy;
      // Curl noise advection
      const cf = curl(d.x, d.y, t + d.noiseSeed * 0.01);
      d.vx += cf.x * curlGain * dt;
      d.vy += cf.y * curlGain * dt;
      // Gravity + wave drift
      d.vy += Math.sin(t * 2.4 + d.noiseSeed) * 170 * dt + 18 * dpr * dt;
      d.vx *= 0.997;
      // Integrate position
      d.x += d.vx * dt * dpr; d.y += d.vy * dt * dpr;
      d.life -= dt * 0.12;
      if (d.life <= 0) continue;
      d.history.push({ x: d.x, y: d.y });
      if (d.history.length > this.TRAIL_LEN) d.history.shift();
      const h = d.history;
      if (h.length < 2) continue;
      const head = h[h.length - 1];
      // Smooth trail
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(h[0].x, h[0].y);
      for (let k = 1; k < h.length - 1; k++) {
        const mx = (h[k].x + h[k+1].x) * 0.5, my = (h[k].y + h[k+1].y) * 0.5;
        ctx.quadraticCurveTo(h[k].x, h[k].y, mx, my);
      }
      ctx.lineTo(head.x, head.y);
      ctx.strokeStyle = hsla(d.hue, 100, 65, d.life * 0.33);
      ctx.lineWidth   = Math.max(1.2, d.r * dpr * 3); ctx.stroke();
      ctx.strokeStyle = hsla(d.hue, 100, 90, d.life * 0.92);
      ctx.lineWidth   = Math.max(0.5, d.r * dpr * 0.85); ctx.stroke();
      // Head dot
      ctx.fillStyle = hsla(d.hue, 100, 92, d.life);
      ctx.beginPath(); ctx.arc(head.x, head.y, Math.max(0.7, d.r * dpr), 0, Math.PI*2); ctx.fill();
    }

    // Clean up drips that left the viewport or died
    for (let i = this.drips.length - 1; i >= 0; i--) {
      const d = this.drips[i], pad = 380 * dpr;
      if (d.life <= 0 || d.x < rectX-pad || d.x > rectX+rectW+pad ||
          d.y < rectY-pad || d.y > rectY+rectH+pad) {
        this.drips.splice(i, 1);
      }
    }
  }
}
