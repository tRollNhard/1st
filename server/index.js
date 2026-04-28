require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { createProvider } = require('./providers');
const { isConfigured: composioReady, reset: composioReset } = require('./composio');
const spotifyMcpRouter = require('./spotify-mcp');
const automation = require('./automation');

const ENV_PATH = path.join(__dirname, '..', '.env');

// ── .env helpers ────────────────────────────────────────────────────────────

function readEnv() {
  try { return fs.readFileSync(ENV_PATH, 'utf-8'); } catch { return ''; }
}

function writeEnvKey(key, value) {
  let content = readEnv();
  const re = new RegExp(`^(${key}=.*)$`, 'm');
  const line = `${key}=${value}`;
  if (re.test(content)) {
    content = content.replace(re, line);
  } else {
    content = content.trimEnd() + `\n${line}\n`;
  }
  fs.writeFileSync(ENV_PATH, content, 'utf-8');
  try { fs.chmodSync(ENV_PATH, 0o600); } catch {}
  process.env[key] = value;
}

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: [`http://localhost:${process.env.PORT || 3001}`, 'file://'] }));
app.use(express.json());

// Track active requests by chatId + provider for abort support
const activeRequests = new Map();

function abortKey(chatId, provider) {
  return `${chatId}:${provider}`;
}

// ── MCP ────────────────────────────────────────────────────────────────────
app.use('/mcp', spotifyMcpRouter());

// ── Routes ─────────────────────────────────────────────────────────────────

// GET /api/providers — list available AI providers and tool status
app.get('/api/providers', (req, res) => {
  res.json({
    providers: ['claude'],
    default: 'claude',
    composio: composioReady(),
  });
});

// POST /api/chat — send a message and stream the response
app.post('/api/chat', async (req, res) => {
  const { message, chatId, provider = 'claude', model } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  if (!chatId) {
    return res.status(400).json({ error: 'chatId is required' });
  }

  if (message.length > 32000) {
    return res.status(400).json({ error: 'Message too long (max 32000 chars)' });
  }

  // Set up SSE-style streaming headers
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Create abort controller for this request
  const abortController = new AbortController();
  activeRequests.set(abortKey(chatId, provider), abortController);

  try {
    const ai = createProvider(provider);
    const stream = await ai.stream(message, {
      model,
      signal: abortController.signal,
      chatId,
    });

    for await (const chunk of stream) {
      if (abortController.signal.aborted) break;
      res.write(chunk);
    }
  } catch (err) {
    if (err.name === 'AbortError' || abortController.signal.aborted) {
      console.log(`[SERVER] Request aborted for chat ${chatId}`);
    } else {
      console.error(`[SERVER] Error in chat ${chatId}:`, err.message);
      if (!res.headersSent) {
        return res.status(500).json({ error: 'Internal server error' });
      }
      res.write(`\n\n[Error: Request failed. Please try again.]`);
    }
  } finally {
    activeRequests.delete(abortKey(chatId, provider));
    res.end();
  }
});

// ── Settings routes ─────────────────────────────────────────────────────────

// GET /api/settings/status — which keys are set
app.get('/api/settings/status', (req, res) => {
  const anthKey = process.env.ANTHROPIC_API_KEY;
  const compKey = process.env.COMPOSIO_API_KEY;
  res.json({
    anthropic: Boolean(anthKey && anthKey !== 'your-api-key-here'),
    composio:  composioReady(),
  });
});

// POST /api/settings/keys — save one or both keys to .env + live-patch process.env
app.post('/api/settings/keys', (req, res) => {
  const { anthropicKey, composioKey } = req.body;
  const updated = [];

  if (anthropicKey && anthropicKey.trim()) {
    writeEnvKey('ANTHROPIC_API_KEY', anthropicKey.trim());
    updated.push('ANTHROPIC_API_KEY');
  }
  if (composioKey && composioKey.trim()) {
    writeEnvKey('COMPOSIO_API_KEY', composioKey.trim());
    composioReset(); // clear cached Composio client so it re-initialises with new key
    updated.push('COMPOSIO_API_KEY');
  }

  const anthKey = process.env.ANTHROPIC_API_KEY;
  const compKey = process.env.COMPOSIO_API_KEY;
  res.json({
    ok: true,
    updated,
    status: {
      anthropic: Boolean(anthKey && anthKey !== 'your-api-key-here'),
      composio:  composioReady(),
    },
  });
});

// ── Automation routes ───────────────────────────────────────────────────────

function sanitizeAutomationConfig(updates) {
  const safe = {};
  if (typeof updates.rssUrl === 'string') {
    try {
      const u = new URL(updates.rssUrl);
      if (u.protocol === 'http:' || u.protocol === 'https:') safe.rssUrl = updates.rssUrl;
    } catch {}
  }
  if (typeof updates.pollIntervalMs === 'number' && updates.pollIntervalMs >= 60000) {
    safe.pollIntervalMs = Math.floor(updates.pollIntervalMs);
  }
  if (Array.isArray(updates.platforms)) {
    const allowed = ['twitter', 'facebook', 'instagram'];
    safe.platforms = updates.platforms.filter(p => allowed.includes(p));
  }
  if (typeof updates.maxItemsPerCycle === 'number' && updates.maxItemsPerCycle >= 1 && updates.maxItemsPerCycle <= 20) {
    safe.maxItemsPerCycle = Math.floor(updates.maxItemsPerCycle);
  }
  return safe;
}

// GET /api/automation/status
app.get('/api/automation/status', (req, res) => {
  res.json(automation.getStatus());
});

// POST /api/automation/start
app.post('/api/automation/start', (req, res) => {
  const result = automation.start(sanitizeAutomationConfig(req.body || {}));
  res.json(result);
});

// POST /api/automation/stop
app.post('/api/automation/stop', (req, res) => {
  res.json(automation.stop());
});

// POST /api/automation/configure
app.post('/api/automation/configure', (req, res) => {
  automation.configure(sanitizeAutomationConfig(req.body || {}));
  res.json({ ok: true, config: automation.getStatus().config });
});

// POST /api/abort — cancel an in-progress request
app.post('/api/abort', (req, res) => {
  const { chatId, provider = 'claude' } = req.body;

  if (!chatId) {
    return res.status(400).json({ error: 'chatId is required' });
  }

  const key = abortKey(chatId, provider);
  const controller = activeRequests.get(key);
  if (controller) {
    controller.abort();
    activeRequests.delete(key);
    console.log(`[SERVER] Aborted ${provider} request for chat ${chatId}`);
    res.json({ success: true, message: 'Request aborted' });
  } else {
    res.json({ success: false, message: 'No active request found for this chat' });
  }
});

// ── Start ──────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[SERVER] Open Claude Cowork backend running on http://localhost:${PORT}`);
  console.log(`[SERVER] Provider: claude`);
  console.log(`[SERVER] Anthropic key: ${process.env.ANTHROPIC_API_KEY ? 'configured' : 'MISSING'}`);
  console.log(`[SERVER] Composio key: ${process.env.COMPOSIO_API_KEY ? 'configured' : 'MISSING'}`);
  console.log(`[SERVER] Spotify MCP: http://localhost:${PORT}/mcp (lazy-loaded on first use)`);
});
