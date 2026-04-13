# Open Claude Cowork

Electron desktop app with an Express backend that routes chat through Claude (Anthropic SDK) with optional Composio tool calling. A Python skill crawler auto-matches skills to each message.

## Quick Start

```bash
bash setup.sh          # First-time: installs Composio CLI, configures API keys, npm install
npm run dev            # Starts both backend (port 3001) and Electron app concurrently
```

Or run separately:

```bash
npm run server         # Backend only (port 3001)
npm start              # Electron only (requires server running)
```

## Architecture

```
main.js          → Electron main process
preload.js       → contextBridge (renderer ↔ server bridge)
renderer/        → Chat UI (HTML/CSS/JS, no framework)
server/
  index.js       → Express API (port 3001): /api/chat, /api/providers, /api/abort
  providers.js   → Claude provider with streaming + skill injection + Composio tool loop
  composio.js    → Composio tool fetching and execution
  skills.js      → Bridges to skill_crawler.py --json
skill_crawler.py → Scans SKILL.md files + .zip/.skill archives, scores and matches skills
```

## Key Conventions

- **Streaming**: `/api/chat` streams text chunks (Transfer-Encoding: chunked), not SSE
- **Skills**: Always-active skills (clarifying-questions, truthfinder) are injected into every system prompt. Conditional skills are matched by keyword + synonym scoring
- **Composio**: Optional — if `COMPOSIO_API_KEY` is set, tools are loaded and Claude can call them in an agentic loop
- **Chat history**: Per-chatId, trimmed to 50 messages, auto-expires after 2 hours idle
- **Python**: skill_crawler.py requires Python 3.10+, auto-detected from common install paths
- **Node**: Requires Node 18+ (for `--watch` flag in server:dev)

## Environment Variables

Stored in `.env` (git-ignored). Copy `.env.example` to get started.

- `ANTHROPIC_API_KEY` — required
- `COMPOSIO_API_KEY` — optional, enables tool routing
- `PORT` — server port, default 3001
