/**
 * Spotify OAuth2 Authorization Code flow.
 * Run once: `node auth.js`
 * Opens browser → user logs in → stores refresh token to tokens.json
 */
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_PATH = path.join(__dirname, "tokens.json");
const ENV_PATH = path.join(__dirname, ".env");

// Read .env
function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) {
    console.error("Missing .env file. Copy .env.example and fill in your Spotify app credentials.");
    process.exit(1);
  }
  const lines = fs.readFileSync(ENV_PATH, "utf-8").split("\n");
  const env = {};
  for (const line of lines) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
  }
  return env;
}

const env = loadEnv();
const CLIENT_ID = env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = "https://localhost:8901/callback";
const SCOPES = "user-read-currently-playing user-read-playback-state user-read-recently-played";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in spotify-mcp/.env");
  process.exit(1);
}

const state = crypto.randomBytes(16).toString("hex");

// Generate self-signed cert for localhost HTTPS
function generateSelfSignedCert() {
  const certDir = path.join(__dirname, ".certs");
  const keyPath = path.join(certDir, "key.pem");
  const certPath = path.join(certDir, "cert.pem");
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
  }
  fs.mkdirSync(certDir, { recursive: true });
  execSync(`openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 365 -nodes -subj "/CN=localhost"`, { stdio: "ignore" });
  return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
}

const tlsOptions = generateSelfSignedCert();

// Build auth URL
const authUrl = new URL("https://accounts.spotify.com/authorize");
authUrl.searchParams.set("client_id", CLIENT_ID);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
authUrl.searchParams.set("scope", SCOPES);
authUrl.searchParams.set("state", state);

// Start local HTTPS server to catch callback
const server = https.createServer(tlsOptions, async (req, res) => {
  const url = new URL(req.url, "https://localhost:8901");
  if (url.pathname !== "/callback") {
    res.writeHead(404);
    res.end();
    return;
  }

  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");

  if (returnedState !== state) {
    res.writeHead(400);
    res.end("State mismatch");
    return;
  }

  // Exchange code for tokens
  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64"),
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });

  const tokens = await tokenRes.json();

  if (tokens.error) {
    res.writeHead(400);
    res.end("Token error: " + tokens.error_description);
    console.error(tokens);
    server.close();
    return;
  }

  // Save tokens
  fs.writeFileSync(TOKEN_PATH, JSON.stringify({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + tokens.expires_in * 1000,
  }, null, 2));

  res.writeHead(200, { "Content-Type": "text/html" });
  res.end("<h1>Spotify connected! You can close this tab.</h1>");
  console.log("Tokens saved to tokens.json");
  server.close();
});

server.listen(8901, async () => {
  console.log("Opening browser for Spotify login...");
  const open = (await import("open")).default;
  open(authUrl.toString());
});
