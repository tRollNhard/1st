// Smillee — Example plugin (template — copy this to create your own)
// Copyright (c) 2026 Jason W Clark (THATdudeAGAIN) — All rights reserved.
//
// To activate: import this file in src/app.js:
//   import './plugins/example.js';

import { registerPlugin } from '../plugins.js';

registerPlugin({
  name: 'example',

  // Called once when the plugin is first registered.
  init() {
    console.log('[example-plugin] initialised');
  },

  // Called every animation frame while audio is active.
  // ctx  — CanvasRenderingContext2D (already configured for your drawing)
  // data — { t, dt, bass, mid, high, flash, beat, beatStrength, bodyR, drawCx, drawCy }
  onFrame(ctx, data) {
    // Example: subtle ring that pulses with bass
    // const { bass, bodyR, drawCx, drawCy } = data;
    // ctx.save();
    // ctx.globalCompositeOperation = 'lighter';
    // ctx.strokeStyle = `rgba(255,255,255,${bass * 0.3})`;
    // ctx.lineWidth = 2;
    // ctx.beginPath(); ctx.arc(drawCx, drawCy, bodyR * 1.6, 0, Math.PI*2); ctx.stroke();
    // ctx.restore();
  },

  // Called when a beat is detected.
  // beatStrength — number > 0 (higher = stronger beat)
  // ctx          — CanvasRenderingContext2D
  onBeat(beatStrength, ctx) {
    // console.log('[example-plugin] beat strength:', beatStrength.toFixed(2));
  },
});
