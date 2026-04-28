// Smillee — SmileeRenderer: body, fur, eyes, smile, spring physics, idle animation
// Copyright (c) 2026 Jason W Clark (THATdudeAGAIN) — All rights reserved.

import { hsla, hueFor, DPR, SMILE_HUES, SMILE_N, FUR_N, BODY_BLOB_N } from './utils.js';

export class SmileeRenderer {
  constructor(canvas, metaCanvas) {
    this.canvas    = canvas;
    this.ctx       = canvas.getContext('2d');
    this.metaCanvas = metaCanvas;
    this.metaCtx   = metaCanvas.getContext('2d');

    // Spring state
    this.eyeScale   = 1.0; this.eyeVel   = 0;
    this.smileScale = 1.0; this.smileVel = 0;
    this.blinkVal = 0; this.blinkTimer = 0; this.nextBlink = 3 + Math.random() * 3.5;
    this.bounceY = 0; this.bounceVY = 0;
    this.sqX = 1.0; this.sqXV = 0;
    this.sqY = 1.0; this.sqYV = 0;

    // Layout — updated by app on resize
    this.W = 0; this.H = 0;
    this.rectX = 0; this.rectY = 0; this.rectW = 0; this.rectH = 0;
    this.drawCx = 0; this.drawCy = 0;
    this.mode = 'spotify';

    // Optional camera video element
    this.cameraEl = null;
  }

  // ── Beat response ─────────────────────────────────────────────────────────
  onBeat(beatStrength) {
    this.eyeScale   = 1.0 + Math.min(1.10, beatStrength * 0.72); this.eyeVel   = 0;
    this.smileScale = 1.0 + Math.min(0.80, beatStrength * 0.58); this.smileVel = 0;
    this.bounceVY   = -beatStrength * 110;
    this.sqX  = 1.0 + Math.min(0.32, beatStrength * 0.20);
    this.sqY  = 1.0 - Math.min(0.24, beatStrength * 0.16);
    this.sqXV = 0; this.sqYV = 0;
  }

  // ── Spring integrators ────────────────────────────────────────────────────
  _updateSprings(dt) {
    const SK = 18, SD = 6.5;
    this.eyeVel   += (-SK * (this.eyeScale   - 1.0) - SD * this.eyeVel)   * dt;
    this.eyeScale  = Math.max(0.88, this.eyeScale   + this.eyeVel   * dt);
    this.smileVel += (-SK * (this.smileScale - 1.0) - SD * this.smileVel) * dt;
    this.smileScale = Math.max(0.92, this.smileScale + this.smileVel * dt);
    const BSK = 22, BSD = 7;
    this.bounceVY += (-BSK * this.bounceY        - BSD * this.bounceVY) * dt;
    this.bounceY  += this.bounceVY * dt;
    this.sqXV     += (-BSK * (this.sqX - 1.0) - BSD * this.sqXV) * dt;
    this.sqX       = Math.max(0.84, this.sqX + this.sqXV * dt);
    this.sqYV     += (-BSK * (this.sqY - 1.0) - BSD * this.sqYV) * dt;
    this.sqY       = Math.max(0.84, this.sqY + this.sqYV * dt);
  }

  // ── Blink timer — returns eyelid closure 0..1 ─────────────────────────────
  _updateBlink(dt) {
    this.blinkTimer += dt;
    if (this.blinkTimer >= this.nextBlink && this.blinkVal === 0) this.blinkVal = 0.001;
    if (this.blinkVal > 0) {
      this.blinkVal += dt * 8;
      if (this.blinkVal >= 1.6) {
        this.blinkVal = 0; this.blinkTimer = 0;
        this.nextBlink = 2.5 + Math.random() * 4.5;
      }
    }
    return this.blinkVal > 0
      ? (this.blinkVal < 0.8 ? this.blinkVal / 0.8 : (1.6 - this.blinkVal) / 0.8)
      : 0;
  }

  // ── Main render frame (called while audio is active) ─────────────────────
  // Returns { bodyR, drawCx, drawCy } so fx.js can position effects.
  drawFrame(t, dt, bass, mid, high, flash, beat, beatStrength) {
    const ctx     = this.ctx;
    const metaCtx = this.metaCtx;
    const { drawCx, drawCy, rectX, rectY, rectW, rectH, W, H, mode } = this;
    const dpr   = DPR();
    const scale = (mode === 'tiktok' ? 0.72 : 1);

    if (beat) this.onBeat(beatStrength);
    this._updateSprings(dt);
    const blinkLid = this._updateBlink(dt);

    // ── Clear ──────────────────────────────────────────────────────────────
    if (mode === 'tiktok') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      ctx.save(); ctx.beginPath(); ctx.rect(rectX, rectY, rectW, rectH); ctx.clip();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(0,0,0,${0.022 + (1 - bass) * 0.010})`;
    ctx.fillRect(rectX, rectY, rectW, rectH);

    // ── Camera background ──────────────────────────────────────────────────
    if (this.cameraEl && this.cameraEl.readyState >= 2) {
      const vw = this.cameraEl.videoWidth, vh = this.cameraEl.videoHeight;
      if (vw && vh) {
        const sf = Math.max(rectW / vw, rectH / vh);
        const dw = vw * sf, dh = vh * sf;
        ctx.save();
        ctx.translate(rectX + (rectW - dw) / 2 + dw, rectY + (rectH - dh) / 2);
        ctx.scale(-1, 1); ctx.globalAlpha = 0.5;
        ctx.drawImage(this.cameraEl, 0, 0, dw, dh);
        ctx.restore(); ctx.globalAlpha = 1;
      }
    }

    // ── Body radius ────────────────────────────────────────────────────────
    const baseBodyR = Math.min(rectW, rectH) * 0.265;
    const bodyR     = baseBodyR * (1 + flash * 0.52 + bass * 0.16);

    // ── Squash-stretch + sway transform (wraps aura → smile) ──────────────
    const swayX = Math.sin(t * 0.72) * baseBodyR * 0.036;
    const swayY = Math.sin(t * 1.05 + 0.5) * baseBodyR * 0.018;
    ctx.save();
    ctx.translate(swayX, this.bounceY * dpr + swayY);
    ctx.translate(drawCx, drawCy); ctx.scale(this.sqX, this.sqY); ctx.translate(-drawCx, -drawCy);

    // ── Aura glow ──────────────────────────────────────────────────────────
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const hue = hueFor(i * 2.5, i * 42);
      const ox  = Math.cos(t * (0.38 + i * 0.11) + i * 2.09) * bodyR * 0.14;
      const oy  = Math.sin(t * (0.29 + i * 0.09) + i * 1.73) * bodyR * 0.14;
      const aR  = bodyR * (1.48 + i * 0.18 + flash * 0.45);
      const g   = ctx.createRadialGradient(drawCx+ox, drawCy+oy, bodyR*0.25, drawCx+ox, drawCy+oy, aR);
      g.addColorStop(0,    hsla(hue,          100, 65, 0.32 + flash * 0.28));
      g.addColorStop(0.55, hsla((hue+55)%360, 100, 60, 0.16));
      g.addColorStop(1,    hsla(hue,          100, 55, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(drawCx+ox, drawCy+oy, aR, 0, Math.PI*2); ctx.fill();
    }

    // ── Metaball pass: body plasma + fur ──────────────────────────────────
    metaCtx.setTransform(1,0,0,1,0,0);
    metaCtx.globalCompositeOperation = 'source-over';
    metaCtx.clearRect(0, 0, this.metaCanvas.width, this.metaCanvas.height);
    metaCtx.globalCompositeOperation = 'lighter';

    // Body plasma blobs (dense interior colour)
    for (let i = 0; i < BODY_BLOB_N; i++) {
      const hue   = hueFor(i * 2.2, 0);
      const angle = (i / BODY_BLOB_N) * Math.PI * 2 + t * (0.09 + i * 0.022);
      const dist  = bodyR * ((i % 3) * 0.20 + Math.sin(t * 0.65 + i * 1.4) * 0.05);
      const br    = bodyR * (0.56 + (i % 2) * 0.14 + bass * 0.12);
      const bx    = drawCx + Math.cos(angle) * dist;
      const by    = drawCy + Math.sin(angle) * dist;
      const mg    = metaCtx.createRadialGradient(bx, by, 0, bx, by, br);
      mg.addColorStop(0,    hsla(hue,          100, 56, 1.0));
      mg.addColorStop(0.55, hsla((hue+22)%360, 100, 52, 0.88));
      mg.addColorStop(1,    hsla(hue,          100, 44, 0));
      metaCtx.fillStyle = mg; metaCtx.beginPath(); metaCtx.arc(bx, by, br, 0, Math.PI*2); metaCtx.fill();
    }

    // Fur blobs (small, clustered at body edge → gooey fuzzy border)
    for (let i = 0; i < FUR_N; i++) {
      const hue     = hueFor(i * 1.6, 25);
      const angle   = (i / FUR_N) * Math.PI * 2 + t * 0.09 + Math.sin(t * 1.4 + i * 0.85) * 0.08;
      const furDist = bodyR * (0.87 + Math.sin(t * 1.9 + i * 0.72) * 0.055 + flash * 0.14);
      const furR    = bodyR * (0.19  + flash * 0.10 + Math.sin(t * 2.1 + i * 1.1) * 0.022);
      const fx      = drawCx + Math.cos(angle) * furDist;
      const fy      = drawCy + Math.sin(angle) * furDist;
      const fg      = metaCtx.createRadialGradient(fx, fy, 0, fx, fy, furR);
      fg.addColorStop(0,    hsla(hue,          100, 82, 1.0));
      fg.addColorStop(0.45, hsla((hue+32)%360, 100, 76, 0.88));
      fg.addColorStop(1,    hsla(hue,          100, 68, 0));
      metaCtx.fillStyle = fg; metaCtx.beginPath(); metaCtx.arc(fx, fy, furR, 0, Math.PI*2); metaCtx.fill();
    }

    // Gooey composite: blur fuses blobs, contrast sharpens the merged edge
    const mergeBlur = bodyR * 0.072 + flash * bodyR * 0.028;
    ctx.save();
    ctx.filter = `blur(${mergeBlur}px) contrast(5.8)`;
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(this.metaCanvas, 0, 0);
    ctx.restore();

    // ── Body shine (specular highlight — gives 3D sphere quality) ─────────
    ctx.globalCompositeOperation = 'source-over';
    const shineG = ctx.createRadialGradient(
      drawCx - bodyR * 0.28, drawCy - bodyR * 0.32, 0,
      drawCx - bodyR * 0.10, drawCy - bodyR * 0.15, bodyR * 0.68
    );
    shineG.addColorStop(0,    'rgba(255,255,255,0.38)');
    shineG.addColorStop(0.38, 'rgba(255,255,255,0.10)');
    shineG.addColorStop(1,    'rgba(255,255,255,0)');
    ctx.fillStyle = shineG;
    ctx.beginPath(); ctx.arc(drawCx, drawCy, bodyR, 0, Math.PI * 2); ctx.fill();

    // ── Eyes ──────────────────────────────────────────────────────────────
    ctx.globalCompositeOperation = 'source-over';
    const eyeSpacing = bodyR * 0.285;
    const eyeOffY    = bodyR * 0.085;
    const eyeR       = bodyR * 0.188 * this.eyeScale * scale;

    for (let side = -1; side <= 1; side += 2) {
      const ex     = drawCx + side * eyeSpacing * scale;
      const ey     = drawCy - eyeOffY * scale;
      const eyeHue = side === -1 ? 218 : 268;

      // Iris — deep radial gradient for 3D sphere feel
      const ig = ctx.createRadialGradient(ex - eyeR*0.22, ey - eyeR*0.18, 0, ex, ey, eyeR);
      ig.addColorStop(0,    hsla(eyeHue - 18, 75, 65, 1));
      ig.addColorStop(0.45, hsla(eyeHue,      95, 42, 1));
      ig.addColorStop(0.82, hsla(eyeHue + 22, 80, 18, 1));
      ig.addColorStop(1,    'rgba(0,0,0,1)');
      ctx.fillStyle = ig;
      ctx.beginPath(); ctx.arc(ex, ey, eyeR, 0, Math.PI*2); ctx.fill();

      // Pupil
      ctx.fillStyle = '#04040a';
      ctx.beginPath(); ctx.arc(ex, ey, eyeR * 0.34, 0, Math.PI*2); ctx.fill();

      // Blink eyelid (sweeps down from top)
      if (blinkLid > 0.02) {
        ctx.save();
        ctx.beginPath(); ctx.arc(ex, ey, eyeR * 1.03, 0, Math.PI*2); ctx.clip();
        ctx.fillStyle = `rgba(190, 140, 255, ${Math.min(1, blinkLid)})`;
        ctx.fillRect(ex - eyeR*1.1, ey - eyeR*1.1, eyeR*2.2, eyeR*2.1 * Math.min(1, blinkLid));
        ctx.restore();
      }

      // Main specular highlight
      ctx.fillStyle = 'rgba(255,255,255,0.93)';
      ctx.beginPath();
      ctx.ellipse(ex + eyeR*0.19, ey - eyeR*0.29, eyeR*0.19, eyeR*0.12, -0.38, 0, Math.PI*2);
      ctx.fill();
      // Secondary small highlight
      ctx.fillStyle = 'rgba(255,255,255,0.52)';
      ctx.beginPath(); ctx.arc(ex - eyeR*0.27, ey + eyeR*0.22, eyeR*0.065, 0, Math.PI*2); ctx.fill();

      // Beat sparkles orbiting each eye
      if (flash > 0.22) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (let k = 0; k < 5; k++) {
          const sa  = (k / 5) * Math.PI * 2 + t * 4.5 + side * 0.8;
          const sd  = eyeR * (1.28 + flash * 0.55);
          const spx = ex + Math.cos(sa) * sd, spy = ey + Math.sin(sa) * sd;
          const spkG = ctx.createRadialGradient(spx, spy, 0, spx, spy, eyeR*0.27);
          spkG.addColorStop(0, hsla(eyeHue, 100, 90, flash * 0.75));
          spkG.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = spkG; ctx.beginPath(); ctx.arc(spx, spy, eyeR*0.27, 0, Math.PI*2); ctx.fill();
        }
        ctx.restore();
      }
    }

    // ── Smile (smooth glowing arc) ────────────────────────────────────────
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'round';

    const smileCy    = drawCy + bodyR * 0.335 * scale;
    const smileHalfW = bodyR * 0.68 * (1 + mid * 0.18) * this.smileScale * scale;
    const curveDep   = bodyR * 0.092 * scale;
    const smileCtrlY = smileCy - curveDep * 2;
    const sx0        = drawCx - smileHalfW;
    const sx1        = drawCx + smileHalfW;
    const smileW     = bodyR * 0.062 * this.smileScale * scale;
    const glowHue    = hueFor(3) % 360;

    // Wide soft outer glow
    ctx.lineWidth   = smileW * 4.2;
    ctx.strokeStyle = `hsla(${glowHue}, 100%, 60%, 0.10)`;
    ctx.beginPath(); ctx.moveTo(sx0, smileCy); ctx.quadraticCurveTo(drawCx, smileCtrlY, sx1, smileCy); ctx.stroke();

    // Mid halo
    ctx.lineWidth   = smileW * 2.4;
    ctx.strokeStyle = `hsla(${glowHue}, 100%, 65%, 0.25)`;
    ctx.beginPath(); ctx.moveTo(sx0, smileCy); ctx.quadraticCurveTo(drawCx, smileCtrlY, sx1, smileCy); ctx.stroke();

    // Core rainbow arc
    const smileGrad = ctx.createLinearGradient(sx0, 0, sx1, 0);
    SMILE_HUES.forEach((h, idx) => smileGrad.addColorStop(idx / (SMILE_HUES.length - 1), `hsl(${h}, 100%, 64%)`));
    ctx.lineWidth   = smileW;
    ctx.shadowColor = `hsl(${glowHue}, 100%, 70%)`;
    ctx.shadowBlur  = smileW * 2.5;
    ctx.strokeStyle = smileGrad;
    ctx.beginPath(); ctx.moveTo(sx0, smileCy); ctx.quadraticCurveTo(drawCx, smileCtrlY, sx1, smileCy); ctx.stroke();
    ctx.shadowBlur = 0;

    // Thin specular highlight along top edge
    ctx.lineWidth   = smileW * 0.26;
    ctx.strokeStyle = 'rgba(255,255,255,0.78)';
    ctx.beginPath();
    ctx.moveTo(sx0 + smileHalfW * 0.06, smileCy - smileW * 0.32);
    ctx.quadraticCurveTo(drawCx, smileCtrlY - smileW * 0.32, sx1 - smileHalfW * 0.06, smileCy - smileW * 0.32);
    ctx.stroke();
    ctx.restore(); // end squash-stretch

    if (mode === 'tiktok') ctx.restore();

    return { bodyR, drawCx, drawCy };
  }

  // ── Idle animation: gentle breathing Smillee (no audio active) ───────────
  drawIdle(t) {
    const ctx     = this.ctx;
    const metaCtx = this.metaCtx;
    const { drawCx, drawCy, rectX, rectY, rectW, rectH, W, H, mode } = this;

    const iBass = 0.08 + Math.sin(t * 1.1) * 0.04;
    const iMid  = 0.06 + Math.sin(t * 0.7) * 0.03;

    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    if (mode === 'tiktok') { ctx.save(); ctx.beginPath(); ctx.rect(rectX, rectY, rectW, rectH); ctx.clip(); }

    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(rectX, rectY, rectW, rectH);

    const baseBodyR = Math.min(rectW, rectH) * 0.265;
    const bodyR     = baseBodyR * (1 + iBass * 0.18);

    // Idle aura
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const hue = (t * 25 + i * 137.5) % 360;
      const a   = t * (0.4 + i * 0.13) + i * 2.09;
      const ox  = Math.cos(a) * bodyR * 0.12, oy = Math.sin(a) * bodyR * 0.12;
      const aR  = bodyR * (1.4 + i * 0.18);
      const g   = ctx.createRadialGradient(drawCx+ox, drawCy+oy, bodyR*0.2, drawCx+ox, drawCy+oy, aR);
      g.addColorStop(0, hsla(hue, 100, 62, 0.15)); g.addColorStop(1, hsla(hue, 100, 55, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(drawCx+ox, drawCy+oy, aR, 0, Math.PI*2); ctx.fill();
    }

    // Idle body
    metaCtx.setTransform(1,0,0,1,0,0);
    metaCtx.globalCompositeOperation = 'source-over';
    metaCtx.clearRect(0, 0, this.metaCanvas.width, this.metaCanvas.height);
    metaCtx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < BODY_BLOB_N; i++) {
      const hue   = (t * 20 + i * (360 / BODY_BLOB_N)) % 360;
      const angle = (i / BODY_BLOB_N) * Math.PI * 2 + t * (0.08 + i * 0.02);
      const dist  = bodyR * ((i % 3) * 0.20 + Math.sin(t * 0.6 + i * 1.4) * 0.05);
      const br    = bodyR * (0.55 + (i % 2) * 0.13);
      const bx    = drawCx + Math.cos(angle) * dist, by = drawCy + Math.sin(angle) * dist;
      const mg    = metaCtx.createRadialGradient(bx, by, 0, bx, by, br);
      mg.addColorStop(0,    hsla(hue,          100, 56, 1));
      mg.addColorStop(0.55, hsla((hue+22)%360, 100, 52, 0.6));
      mg.addColorStop(1,    hsla(hue,          100, 44, 0));
      metaCtx.fillStyle = mg; metaCtx.beginPath(); metaCtx.arc(bx, by, br, 0, Math.PI*2); metaCtx.fill();
    }
    for (let i = 0; i < FUR_N; i++) {
      const hue   = (t * 18 + i * (360 / FUR_N)) % 360;
      const angle = (i / FUR_N) * Math.PI * 2 + t * 0.09 + Math.sin(t * 1.4 + i * 0.85) * 0.08;
      const dist  = bodyR * (0.88 + Math.sin(t * 1.9 + i * 0.72) * 0.06);
      const furR  = bodyR * (0.18 + iMid * 0.07);
      const fx    = drawCx + Math.cos(angle) * dist, fy = drawCy + Math.sin(angle) * dist;
      const fg    = metaCtx.createRadialGradient(fx, fy, 0, fx, fy, furR);
      fg.addColorStop(0,    hsla(hue,          100, 82, 1));
      fg.addColorStop(0.45, hsla((hue+30)%360, 100, 76, 0.6));
      fg.addColorStop(1,    hsla(hue,          100, 66, 0));
      metaCtx.fillStyle = fg; metaCtx.beginPath(); metaCtx.arc(fx, fy, furR, 0, Math.PI*2); metaCtx.fill();
    }
    const iBlur = bodyR * 0.044;
    ctx.save(); ctx.filter = `blur(${iBlur}px) contrast(6.5)`;
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(this.metaCanvas, 0, 0); ctx.restore();

    // Idle eyes
    ctx.globalCompositeOperation = 'source-over';
    const eyeR       = bodyR * 0.188;
    const eyeSpacing = bodyR * 0.285, eyeOffY = bodyR * 0.085;
    for (let side = -1; side <= 1; side += 2) {
      const ex     = drawCx + side * eyeSpacing;
      const ey     = drawCy - eyeOffY + Math.sin(t * 0.8 + side) * bodyR * 0.012;
      const eyeHue = side === -1 ? 218 : 268;
      const ig = ctx.createRadialGradient(ex - eyeR*0.22, ey - eyeR*0.18, 0, ex, ey, eyeR);
      ig.addColorStop(0,    hsla(eyeHue - 18, 75, 65, 1));
      ig.addColorStop(0.45, hsla(eyeHue,      95, 42, 1));
      ig.addColorStop(0.82, hsla(eyeHue + 22, 80, 18, 1));
      ig.addColorStop(1,    'rgba(0,0,0,1)');
      ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(ex, ey, eyeR, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#04040a'; ctx.beginPath(); ctx.arc(ex, ey, eyeR*0.34, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.93)';
      ctx.beginPath(); ctx.ellipse(ex + eyeR*0.19, ey - eyeR*0.29, eyeR*0.19, eyeR*0.12, -0.38, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.52)';
      ctx.beginPath(); ctx.arc(ex - eyeR*0.27, ey + eyeR*0.22, eyeR*0.065, 0, Math.PI*2); ctx.fill();
    }

    // Idle smile (smooth glowing arc)
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'round';
    const iAnim      = 1 + Math.sin(t * 0.9) * 0.04;
    const smileCy    = drawCy + bodyR * 0.335;
    const smileHalfW = bodyR * 0.68 * iAnim;
    const curveDep   = bodyR * 0.092;
    const smileCtrlY = smileCy - curveDep * 2;
    const sx0        = drawCx - smileHalfW;
    const sx1        = drawCx + smileHalfW;
    const smileW     = bodyR * 0.062 * iAnim;
    const iGlowHue   = (t * 25) % 360;

    ctx.lineWidth   = smileW * 4.2;
    ctx.strokeStyle = `hsla(${iGlowHue}, 100%, 60%, 0.10)`;
    ctx.beginPath(); ctx.moveTo(sx0, smileCy); ctx.quadraticCurveTo(drawCx, smileCtrlY, sx1, smileCy); ctx.stroke();

    ctx.lineWidth   = smileW * 2.4;
    ctx.strokeStyle = `hsla(${iGlowHue}, 100%, 65%, 0.25)`;
    ctx.beginPath(); ctx.moveTo(sx0, smileCy); ctx.quadraticCurveTo(drawCx, smileCtrlY, sx1, smileCy); ctx.stroke();

    const iGrad = ctx.createLinearGradient(sx0, 0, sx1, 0);
    SMILE_HUES.forEach((h, idx) => iGrad.addColorStop(idx / (SMILE_HUES.length - 1), `hsl(${h}, 100%, 64%)`));
    ctx.lineWidth   = smileW;
    ctx.shadowColor = `hsl(${iGlowHue}, 100%, 70%)`;
    ctx.shadowBlur  = smileW * 2.5;
    ctx.strokeStyle = iGrad;
    ctx.beginPath(); ctx.moveTo(sx0, smileCy); ctx.quadraticCurveTo(drawCx, smileCtrlY, sx1, smileCy); ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.lineWidth   = smileW * 0.26;
    ctx.strokeStyle = 'rgba(255,255,255,0.78)';
    ctx.beginPath();
    ctx.moveTo(sx0 + smileHalfW * 0.06, smileCy - smileW * 0.32);
    ctx.quadraticCurveTo(drawCx, smileCtrlY - smileW * 0.32, sx1 - smileHalfW * 0.06, smileCy - smileW * 0.32);
    ctx.stroke();
    ctx.restore();

    if (mode === 'tiktok') ctx.restore();
  }
}
