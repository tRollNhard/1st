/**
 * Spotify Web API client with auto-refresh.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_PATH = path.join(__dirname, "tokens.json");
const ENV_PATH = path.join(__dirname, ".env");

function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) return {};
  const lines = fs.readFileSync(ENV_PATH, "utf-8").split("\n");
  const env = {};
  for (const line of lines) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
  }
  return env;
}

function loadTokens() {
  if (!fs.existsSync(TOKEN_PATH)) return null;
  return JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
}

function saveTokens(tokens) {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
}

async function refreshAccessToken(tokens) {
  const env = loadEnv();
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`).toString("base64"),
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Refresh failed: ${data.error_description}`);

  tokens.access_token = data.access_token;
  tokens.expires_at = Date.now() + data.expires_in * 1000;
  if (data.refresh_token) tokens.refresh_token = data.refresh_token;
  saveTokens(tokens);
  return tokens;
}

async function getAccessToken() {
  let tokens = loadTokens();
  if (!tokens) throw new Error("Not authenticated. Run: node auth.js");
  if (Date.now() >= tokens.expires_at - 60000) {
    tokens = await refreshAccessToken(tokens);
  }
  return tokens.access_token;
}

async function spotifyGet(endpoint) {
  const token = await getAccessToken();
  const res = await fetch(`https://api.spotify.com/v1${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 204) return null; // Nothing playing
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Spotify API ${res.status}: ${err}`);
  }
  return res.json();
}

export async function getNowPlaying() {
  const data = await spotifyGet("/me/player/currently-playing");
  if (!data || !data.item) return { playing: false };

  const item = data.item;
  return {
    playing: data.is_playing,
    track: item.name,
    artists: item.artists.map((a) => a.name),
    album: item.album?.name,
    album_art: item.album?.images?.[0]?.url,
    progress_ms: data.progress_ms,
    duration_ms: item.duration_ms,
    track_url: item.external_urls?.spotify,
    device: data.device?.name,
    shuffle: data.shuffle_state,
    repeat: data.repeat_state,
  };
}

export async function getRecentlyPlayed(limit = 5) {
  const data = await spotifyGet(`/me/player/recently-played?limit=${limit}`);
  if (!data?.items) return [];
  return data.items.map((item) => ({
    track: item.track.name,
    artists: item.track.artists.map((a) => a.name),
    album: item.track.album?.name,
    played_at: item.played_at,
    track_url: item.track.external_urls?.spotify,
  }));
}

export async function getPlaybackState() {
  const data = await spotifyGet("/me/player");
  if (!data) return { active: false };
  return {
    active: true,
    device: data.device?.name,
    device_type: data.device?.type,
    volume: data.device?.volume_percent,
    is_playing: data.is_playing,
    shuffle: data.shuffle_state,
    repeat: data.repeat_state,
  };
}
