// Smillee — FXEngine: backdrop nebula, spectrum wreath, drip particles,
//                     beat ripples, high-freq sparkle rays, lightning bolts,
//                     multi-color fireworks
// Copyright (c) 2026 Jason W Clark (THATdudeAGAIN) — All rights reserved.

import { hsla, hueFor, curl, DPR, SMILE_N, SMILE_HUES } from './utils.js';

export class FXEngine {
  constructor() {
    this.drips   = [];
    this.ripples = [];
    this.bolts   = [];   // lightning bolts: { pts, branches, life, hue, width }
    this.fworks  = [];   // firework particles: { x, y, vx, vy, hue, life, r, history }
    this.TRAIL_LEN = 90;
    this.MAX_DRIPS = 280;
    this.MAX_FWORK_PARTICLES = 600;
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

  // ── Lightning ─────────────────────────────────────────────────────────────
  // Jagged polyline strike from a random off-canvas edge towards (cx, cy).
  // Optional 1–2 forking branches.  Crisp white core + cyan/violet glow halo.
  spawnLightning(cx, cy, viewW, viewH, strength) {
    const dpr   = DPR();
    const edge  = Math.floor(Math.random() * 4);   // 0 top 1 right 2 bottom 3 left
    let x0, y0;
    if (edge === 0) { x0 = Math.random() * viewW;       y0 = -10; }
    if (edge === 1) { x0 = viewW + 10;                  y0 = Math.random() * viewH; }
    if (edge === 2) { x0 = Math.random() * viewW;       y0 = viewH + 10; }
    if (edge === 3) { x0 = -10;                         y0 = Math.random() * viewH; }
    // Aim near the body, with random offset so it doesn't always stab the centre
    const aimR = Math.min(viewW, viewH) * 0.22;
    const aa   = Math.random() * Math.PI * 2;
    const x1   = cx + Math.cos(aa) * aimR * Math.random();
    const y1   = cy + Math.sin(aa) * aimR * Math.random();

    const pts = this._jagPath(x0, y0, x1, y1, 9, Math.min(viewW, viewH) * 0.04);
    const branches = [];
    const branchN = 1 + Math.floor(Math.random() * 2);
    for (let b = 0; b < branchN; b++) {
      const idx = 2 + Math.floor(Math.random() * (pts.length - 4));
      const bp  = pts[idx];
      // Branch shoots off perpendicular-ish for ~60–110 px
      const ang = Math.atan2(y1 - y0, x1 - x0) + (Math.random() - 0.5) * 1.4;
      const len = (60 + Math.random() * 90) * dpr;
      const ex  = bp.x + Math.cos(ang) * len;
      const ey  = bp.y + Math.sin(ang) * len;
      branches.push(this._jagPath(bp.x, bp.y, ex, ey, 5, len * 0.18));
    }
    // Slight hue lean — alternates icy-blue / violet / electric-pink
    const palette = [205, 280, 320, 195];
    const hue = palette[Math.floor(Math.random() * palette.length)];
    this.bolts.push({
      pts, branches,
      hue,
      life: 1,
      width: (1.2 + strength * 1.4) * dpr,
    });
    if (this.bolts.length > 6) this.bolts.shift();
  }

  _strokePts(ctx, pts) {
    if (!pts || pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }

  _jagPath(x0, y0, x1, y1, segments, jitter) {
    const pts = [{ x: x0, y: y0 }];
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const px  = -dy / len, py = dx / len;
    for (let i = 1; i < segments; i++) {
      const t  = i / segments;
      const lx = x0 + dx * t, ly = y0 + dy * t;
      // Falloff towards the endpoints so the strike still lands on target
      const k  = (1 - Math.abs(t - 0.5) * 2) * jitter;
      const j  = (Math.random() - 0.5) * 2 * k;
      pts.push({ x: lx + px * j, y: ly + py * j });
    }
    pts.push({ x: x1, y: y1 });
    return pts;
  }

  // ── Fireworks ─────────────────────────────────────────────────────────────
  // Multi-coloured radial burst from (x, y).  Each particle gets its own hue,
  // gravity drags them down, drag damps speed, short trails fade nicely.
  spawnFirework(x, y) {
    const dpr  = DPR();
    const N    = 36 + Math.floor(Math.random() * 18);
    // Pick 3–5 hues from the SMILE palette so the burst is rainbow-coloured
    const hues = [];
    const baseShift = Math.random() * 360;
    for (let k = 0; k < 5; k++) hues.push((baseShift + k * 72 + (Math.random() - 0.5) * 18) % 360);
    for (let i = 0; i < N; i++) {
      const ang = (i / N) * Math.PI * 2 + (Math.random() - 0.5) * 0.18;
      const spd = (220 + Math.random() * 240) * dpr;
      this.fworks.push({
        x, y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        hue: hues[Math.floor(Math.random() * hues.length)],
        life: 1,
        r: (1.2 + Math.random() * 1.3) * dpr,
        history: [{ x, y }],
      });
    }
    // Cap total particles to avoid GC pressure on long sessions
    while (this.fworks.length > this.MAX_FWORK_PARTICLES) this.fworks.shift();
  }

  // ── Main draw call ────────────────────────────────────────────────────────
  drawFrame(ctx, t, dt, bass, mid, high, flash, beat, beatStrength, bodyR, drawCx, drawCy, rectX, rectY, rectW, rectH, freqData = null) {
    const dpr = DPR();

    // ── Backdrop nebula (drawn first, behind the body's aura) ──────────────
    // Two slow-drifting radial blobs — bass swells them, hue rotates over time.
    {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const nebR = Math.max(rectW, rectH) * 0.55;
      for (let i = 0; i < 2; i++) {
        const ph  = t * (0.07 + i * 0.05) + i * 1.7;
        const nx  = drawCx + Math.cos(ph) * rectW * 0.18;
        const ny  = drawCy + Math.sin(ph * 1.13) * rectH * 0.16;
        const nh  = (t * (8 + i * 6) + i * 140) % 360;
        const ng  = ctx.createRadialGradient(nx, ny, 0, nx, ny, nebR * (1 + bass * 0.18));
        ng.addColorStop(0,    hsla(nh,           80, 35, 0.18 + bass * 0.10));
        ng.addColorStop(0.45, hsla((nh + 40) % 360, 90, 30, 0.07 + bass * 0.05));
        ng.addColorStop(1,    hsla(nh,           80, 25, 0));
        ctx.fillStyle = ng;
        ctx.fillRect(rectX, rectY, rectW, rectH);
      }
      ctx.restore();
    }

    // ── Spectrum wreath: FFT bars in a polar ring around the body ─────────
    // Mirrors the right-half spectrum to the left for symmetry; mid bins drive
    // the prominent bars.  Subtle even when no audio is loud — anchors the body.
    if (freqData && freqData.length) {
      const BARS    = 96;
      const ringR   = bodyR * 1.18;
      const maxLen  = bodyR * (0.55 + flash * 0.35);
      const halfBars = BARS >> 1;
      // Use the lower 60% of bins (skip the very top where humans don't hear much).
      const usable  = Math.floor(freqData.length * 0.60);
      ctx.save();
      ctx.translate(drawCx, drawCy);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap   = 'round';
      const rotPhase = t * 0.18;
      for (let i = 0; i < BARS; i++) {
        // Symmetric mapping — left and right halves mirror each other for balance
        const sym = i < halfBars ? i : (BARS - 1 - i);
        const bin = 2 + Math.floor((sym / halfBars) * (usable - 4));
        const v   = (freqData[bin] || 0) / 255;
        // Smooth + emphasise — skip nearly-silent bars
        const lvl = Math.pow(v, 1.35);
        if (lvl < 0.05) continue;
        const ang = (i / BARS) * Math.PI * 2 + rotPhase;
        const len = Math.min(maxLen * 1.6, 6 * dpr + lvl * maxLen * 1.45 + bass * dpr * 18);
        const x0  = Math.cos(ang) * ringR;
        const y0  = Math.sin(ang) * ringR;
        const x1  = Math.cos(ang) * (ringR + len);
        const y1  = Math.sin(ang) * (ringR + len);
        const hue = ((i / BARS) * 360 + t * 22) % 360;
        // Wide soft halo
        ctx.strokeStyle = hsla(hue, 100, 65, 0.18 + lvl * 0.32);
        ctx.lineWidth   = (3 + lvl * 4) * dpr;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        // Bright core
        ctx.strokeStyle = hsla(hue, 100, 80, 0.55 + lvl * 0.40);
        ctx.lineWidth   = (1.2 + lvl * 1.4) * dpr;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }
      ctx.restore();
    }

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

    // ── Lightning bolts ────────────────────────────────────────────────────
    if (this.bolts.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap  = 'round';
      ctx.lineJoin = 'round';
      for (const lb of this.bolts) {
        lb.life -= dt * 4.6;            // ~220 ms lifetime
        if (lb.life <= 0) continue;
        const a       = Math.max(0, lb.life);
        const corePts = lb.pts;
        // Outer halo (very wide, low alpha)
        ctx.strokeStyle = hsla(lb.hue, 100, 70, a * 0.18);
        ctx.lineWidth   = lb.width * 9;
        this._strokePts(ctx, corePts);
        // Mid glow
        ctx.strokeStyle = hsla(lb.hue, 100, 75, a * 0.45);
        ctx.lineWidth   = lb.width * 4;
        this._strokePts(ctx, corePts);
        // Bright white core
        ctx.shadowColor = hsla(lb.hue, 100, 80, a);
        ctx.shadowBlur  = lb.width * 3.5;
        ctx.strokeStyle = `rgba(255,255,255,${0.92 * a})`;
        ctx.lineWidth   = lb.width;
        this._strokePts(ctx, corePts);
        ctx.shadowBlur  = 0;
        // Branches — thinner, slight hue shift
        for (const br of lb.branches) {
          ctx.strokeStyle = hsla((lb.hue + 18) % 360, 100, 78, a * 0.65);
          ctx.lineWidth   = lb.width * 2.5;
          this._strokePts(ctx, br);
          ctx.strokeStyle = `rgba(255,255,255,${0.85 * a})`;
          ctx.lineWidth   = lb.width * 0.7;
          this._strokePts(ctx, br);
        }
      }
      ctx.restore();
      for (let i = this.bolts.length - 1; i >= 0; i--) {
        if (this.bolts[i].life <= 0) this.bolts.splice(i, 1);
      }
    }

    // ── Fireworks ──────────────────────────────────────────────────────────
    if (this.fworks.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      const grav = 580 * dpr;
      const drag = 0.984;
      for (const p of this.fworks) {
        p.vx *= drag;
        p.vy = p.vy * drag + grav * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt * 0.62;             // ~1.6 s lifetime
        if (p.life <= 0) continue;
        p.history.push({ x: p.x, y: p.y });
        if (p.history.length > 9) p.history.shift();
        const h = p.history;
        if (h.length >= 2) {
          // Soft trail
          ctx.strokeStyle = hsla(p.hue, 100, 70, p.life * 0.55);
          ctx.lineWidth   = p.r * 2.2;
          ctx.beginPath();
          ctx.moveTo(h[0].x, h[0].y);
          for (let k = 1; k < h.length - 1; k++) {
            const mx = (h[k].x + h[k + 1].x) * 0.5;
            const my = (h[k].y + h[k + 1].y) * 0.5;
            ctx.quadraticCurveTo(h[k].x, h[k].y, mx, my);
          }
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          // Bright core trail
          ctx.strokeStyle = `rgba(255,255,255,${p.life * 0.85})`;
          ctx.lineWidth   = p.r * 0.7;
          ctx.stroke();
        }
        // Glowing head
        const hg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
        hg.addColorStop(0,   `rgba(255,255,255,${p.life})`);
        hg.addColorStop(0.4, hsla(p.hue, 100, 70, p.life * 0.85));
        hg.addColorStop(1,   hsla(p.hue, 100, 65, 0));
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      // Cull dead / off-canvas particles
      for (let i = this.fworks.length - 1; i >= 0; i--) {
        const p = this.fworks[i];
        const pad = 80 * dpr;
        if (p.life <= 0 ||
            p.x < rectX - pad || p.x > rectX + rectW + pad ||
            p.y < rectY - pad || p.y > rectY + rectH + pad) {
          this.fworks.splice(i, 1);
        }
      }
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
