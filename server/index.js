require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const { createProvider } = require('./providers');
const { isConfigured: composioReady } = require('./composio');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Track active requests by chatId + provider for abort support
const activeRequests = new Map();

function abortKey(chatId, provider) {
  return `${chatId}:${provider}`;
}

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
        return res.status(500).json({ error: err.message });
      }
      res.write(`\n\n[Error: ${err.message}]`);
    }
  } finally {
    activeRequests.delete(abortKey(chatId, provider));
    res.end();
  }
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
});
