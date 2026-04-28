// Smillee — Plugin registry
// Copyright (c) 2026 Jason W Clark (THATdudeAGAIN) — All rights reserved.
//
// A plugin is a plain object with any subset of these hooks:
//   { name: string, init(), onFrame(ctx, data), onBeat(beatStrength, ctx) }
//
// Usage:
//   import { registerPlugin } from './plugins.js';
//   registerPlugin({ name: 'myPlugin', onBeat(s){ ... } });

const _plugins = [];

/**
 * Register a plugin and immediately call its init() hook if present.
 * @param {object} plugin
 * @returns {object} the plugin (for chaining)
 */
export function registerPlugin(plugin) {
  if (!plugin || typeof plugin !== 'object') throw new Error('Plugin must be an object');
  if (!plugin.name) throw new Error('Plugin must have a .name property');
  _plugins.push(plugin);
  if (typeof plugin.init === 'function') {
    try { plugin.init(); }
    catch (e) { console.error('[plugin]', plugin.name, 'init error:', e); }
  }
  console.log('[smillee] plugin registered:', plugin.name);
  return plugin;
}

/** Return a snapshot array of all registered plugins. */
export function getPlugins() { return [..._plugins]; }

/**
 * Dispatch the onFrame hook to all plugins.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ t, dt, bass, mid, high, flash, beat, beatStrength, bodyR, drawCx, drawCy }} data
 */
export function dispatchFrame(ctx, data) {
  for (const p of _plugins) {
    if (typeof p.onFrame === 'function') {
      try { p.onFrame(ctx, data); }
      catch (e) { console.error('[plugin]', p.name, 'onFrame error:', e); }
    }
  }
}

/**
 * Dispatch the onBeat hook to all plugins.
 * @param {number} beatStrength
 * @param {CanvasRenderingContext2D} ctx
 */
export function dispatchBeat(beatStrength, ctx) {
  for (const p of _plugins) {
    if (typeof p.onBeat === 'function') {
      try { p.onBeat(beatStrength, ctx); }
      catch (e) { console.error('[plugin]', p.name, 'onBeat error:', e); }
    }
  }
}
