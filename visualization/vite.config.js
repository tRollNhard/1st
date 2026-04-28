// Smillee — Vite build config
// Copyright (c) 2026 Jason W Clark (THATdudeAGAIN) — All rights reserved.

import { defineConfig } from 'vite';

export default defineConfig({
  // Use './' so asset paths work when loaded from file:// in Electron
  base: './',

  build: {
    // Output goes here; Electron prod build loads dist-web/index.html
    outDir: 'dist-web',
    emptyOutDir: true,
    // Single JS bundle — no dynamic code-splitting needed for this app
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },

  server: {
    // Vite dev server port (Electron dev mode points here)
    port: 5173,
    strictPort: true,
  },
});
