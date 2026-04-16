#!/usr/bin/env node
/**
 * Spotify MCP Server — exposes now-playing, recently-played, and playback state
 * as MCP tools over stdio transport.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getNowPlaying, getRecentlyPlayed, getPlaybackState } from "./spotify.js";

const server = new McpServer({
  name: "spotify",
  version: "1.0.0",
});

server.tool(
  "now_playing",
  "Get the song currently playing on the user's Spotify. Returns track name, artist, album, progress, device, and more.",
  {},
  async () => {
    try {
      const result = await getNowPlaying();
      if (!result.playing && !result.track) {
        return { content: [{ type: "text", text: "Nothing is currently playing on Spotify." }] };
      }
      const progress = result.progress_ms
        ? `${Math.floor(result.progress_ms / 60000)}:${String(Math.floor((result.progress_ms % 60000) / 1000)).padStart(2, "0")}`
        : "?";
      const duration = result.duration_ms
        ? `${Math.floor(result.duration_ms / 60000)}:${String(Math.floor((result.duration_ms % 60000) / 1000)).padStart(2, "0")}`
        : "?";
      const lines = [
        `${result.playing ? "Playing" : "Paused"}: ${result.track}`,
        `Artist: ${result.artists.join(", ")}`,
        `Album: ${result.album}`,
        `Progress: ${progress} / ${duration}`,
        result.device ? `Device: ${result.device}` : null,
        result.track_url ? `Link: ${result.track_url}` : null,
      ].filter(Boolean);
      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.tool(
  "recently_played",
  "Get the user's recently played tracks on Spotify.",
  { limit: z.number().min(1).max(20).default(5).describe("Number of recent tracks to return") },
  async ({ limit }) => {
    try {
      const tracks = await getRecentlyPlayed(limit);
      if (!tracks.length) {
        return { content: [{ type: "text", text: "No recently played tracks found." }] };
      }
      const lines = tracks.map((t, i) =>
        `${i + 1}. ${t.track} — ${t.artists.join(", ")} (${t.album}) [${new Date(t.played_at).toLocaleString()}]`
      );
      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.tool(
  "playback_state",
  "Get the user's current Spotify playback state — device, volume, shuffle, repeat.",
  {},
  async () => {
    try {
      const state = await getPlaybackState();
      if (!state.active) {
        return { content: [{ type: "text", text: "No active Spotify playback session." }] };
      }
      const lines = [
        `Device: ${state.device} (${state.device_type})`,
        `Playing: ${state.is_playing}`,
        `Volume: ${state.volume}%`,
        `Shuffle: ${state.shuffle ? "on" : "off"}`,
        `Repeat: ${state.repeat}`,
      ];
      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
