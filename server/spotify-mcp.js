'use strict';

const { Router } = require('express');
const { randomUUID } = require('crypto');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');

// Lazy-loaded ESM Spotify client — imported only on first request so startup stays fast
let spotify = null;
async function getSpotify() {
  if (!spotify) spotify = await import('../spotify-mcp/spotify.js');
  return spotify;
}

function fmt(ms) {
  return `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
}

function buildServer() {
  const server = new McpServer({ name: 'spotify', version: '1.0.0' });

  server.tool('now_playing', "Get the song currently playing on the user's Spotify.", {}, async () => {
    try {
      const { getNowPlaying } = await getSpotify();
      const r = await getNowPlaying();
      if (!r.playing && !r.track) return { content: [{ type: 'text', text: 'Nothing is currently playing.' }] };
      const lines = [
        `${r.playing ? 'Playing' : 'Paused'}: ${r.track}`,
        `Artist: ${r.artists.join(', ')}`,
        `Album: ${r.album}`,
        r.progress_ms ? `Progress: ${fmt(r.progress_ms)} / ${fmt(r.duration_ms)}` : null,
        r.device ? `Device: ${r.device}` : null,
        r.track_url ? `Link: ${r.track_url}` : null,
      ].filter(Boolean);
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  });

  server.tool(
    'recently_played',
    "Get the user's recently played Spotify tracks.",
    { limit: z.number().min(1).max(20).default(5).describe('Number of tracks to return') },
    async ({ limit }) => {
      try {
        const { getRecentlyPlayed } = await getSpotify();
        const tracks = await getRecentlyPlayed(limit);
        if (!tracks.length) return { content: [{ type: 'text', text: 'No recently played tracks found.' }] };
        const lines = tracks.map((t, i) =>
          `${i + 1}. ${t.track} — ${t.artists.join(', ')} (${t.album}) [${new Date(t.played_at).toLocaleString()}]`
        );
        return { content: [{ type: 'text', text: lines.join('\n') }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool('playback_state', "Get the user's current Spotify playback state.", {}, async () => {
    try {
      const { getPlaybackState } = await getSpotify();
      const s = await getPlaybackState();
      if (!s.active) return { content: [{ type: 'text', text: 'No active Spotify playback session.' }] };
      const lines = [
        `Device: ${s.device} (${s.device_type})`,
        `Playing: ${s.is_playing}`,
        `Volume: ${s.volume}%`,
        `Shuffle: ${s.shuffle ? 'on' : 'off'}`,
        `Repeat: ${s.repeat}`,
      ];
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  });

  return server;
}

// Session store — reuse transport/server across requests in the same Claude session
const sessions = new Map();

async function handleRequest(req, res) {
  const sessionId = req.headers['mcp-session-id'];
  let transport = sessionId ? sessions.get(sessionId) : null;

  if (!transport) {
    transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
    const server = buildServer();
    await server.connect(transport);
    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId);
    };
  }

  await transport.handleRequest(req, res, req.body);

  if (transport.sessionId && !sessions.has(transport.sessionId)) {
    sessions.set(transport.sessionId, transport);
  }
}

module.exports = function spotifyMcpRouter() {
  const router = Router();
  router.post('/', handleRequest);
  router.get('/', handleRequest);
  router.delete('/', (req, res) => {
    const id = req.headers['mcp-session-id'];
    if (id && sessions.has(id)) {
      sessions.get(id).close();
      sessions.delete(id);
    }
    res.sendStatus(200);
  });
  return router;
};
