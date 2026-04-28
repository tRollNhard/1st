const Anthropic = require('@anthropic-ai/sdk');
const { matchSkills } = require('./skills');
const { getTools, executeTool, isConfigured: composioConfigured } = require('./composio');
const fs = require('fs');
const path = require('path');

// ── Conversation memory per chat ────────────────────────────────────────────
const chatHistories = new Map();
const chatTimestamps = new Map();

// Clean up chats older than 2 hours every 10 minutes
const CHAT_TTL_MS = 2 * 60 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [id, ts] of chatTimestamps) {
    if (now - ts > CHAT_TTL_MS) {
      chatHistories.delete(id);
      chatTimestamps.delete(id);
    }
  }
}, 10 * 60 * 1000);

function getHistory(chatId) {
  chatTimestamps.set(chatId, Date.now());
  if (!chatHistories.has(chatId)) {
    chatHistories.set(chatId, []);
  }
  return chatHistories.get(chatId);
}

// ── Skill context builder ───────────────────────────────────────────────────

// Cache skill matches for 60 seconds to avoid spawning Python per request
const skillCache = new Map();
const SKILL_CACHE_TTL = 60_000;

async function buildSystemPrompt(message) {
  const base = 'You are a helpful AI assistant in the Open Claude Cowork app. Be concise and helpful.';

  // Check skill cache
  const cacheKey = message.toLowerCase().trim();
  const cached = skillCache.get(cacheKey);
  let result;
  if (cached && Date.now() - cached.ts < SKILL_CACHE_TTL) {
    result = cached.data;
  } else {
    result = await matchSkills(message);
    skillCache.set(cacheKey, { data: result, ts: Date.now() });
    // Keep cache bounded
    if (skillCache.size > 200) {
      const oldest = skillCache.keys().next().value;
      skillCache.delete(oldest);
    }
  }

  const { alwaysActive, matched } = result;
  const skillSections = [];

  for (const skill of alwaysActive) {
    const content = readSkillContent(skill.path);
    if (content) {
      skillSections.push(`## [Always Active] ${skill.name}\n${content}`);
    }
  }

  for (const skill of matched) {
    const content = readSkillContent(skill.path);
    if (content) {
      skillSections.push(`## [Matched] ${skill.name}\n${content}`);
    }
  }

  if (skillSections.length === 0) return base;

  const skillContext = skillSections.join('\n\n---\n\n');
  return `${base}\n\n# Active Skills\nThe following skills have been auto-selected for this request. Follow their guidance.\n\n${skillContext}`;
}

function readSkillContent(skillPath) {
  try {
    const resolved = path.resolve(skillPath);
    const projectRoot = path.resolve(__dirname, '..');
    if (!resolved.startsWith(projectRoot + path.sep) && resolved !== projectRoot) {
      console.warn('[SKILLS] Blocked path traversal attempt:', skillPath);
      return null;
    }
    return fs.readFileSync(resolved, 'utf-8');
  } catch {
    return null;
  }
}

// ── Claude Provider ─────────────────────────────────────────────────────────

class ClaudeProvider {
  constructor() {
    this.client = new Anthropic();
    this.defaultModel = 'claude-sonnet-4-6-20250620';
  }

  async *stream(message, { model, signal, chatId = 'default' } = {}) {
    const history = getHistory(chatId);
    history.push({ role: 'user', content: message });

    const systemPrompt = await buildSystemPrompt(message);

    // Load Composio tools if configured
    const tools = composioConfigured() ? await getTools() : [];

    const requestParams = {
      model: model || this.defaultModel,
      max_tokens: 4096,
      system: systemPrompt,
      messages: history,
    };

    if (tools.length > 0) {
      requestParams.tools = tools;
    }

    // Agentic loop: stream response, handle tool calls, repeat
    let continueLoop = true;
    while (continueLoop) {
      continueLoop = false;

      const stream = this.client.messages.stream(requestParams);
      let fullResponse = '';
      let toolUseBlocks = [];

      for await (const event of stream) {
        if (signal?.aborted) {
          stream.controller.abort();
          return;
        }

        if (event.type === 'content_block_delta' && event.delta?.text) {
          fullResponse += event.delta.text;
          yield event.delta.text;
        }

        // Collect tool use blocks
        if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
          toolUseBlocks.push({ id: event.content_block.id, name: event.content_block.name, input: '' });
        }
        if (event.type === 'content_block_delta' && event.delta?.type === 'input_json_delta') {
          const last = toolUseBlocks[toolUseBlocks.length - 1];
          if (last) last.input += event.delta.partial_json;
        }
      }

      // If Claude requested tool calls, execute them and continue
      if (toolUseBlocks.length > 0) {
        // Add assistant message with text + tool_use blocks
        const assistantContent = [];
        if (fullResponse) {
          assistantContent.push({ type: 'text', text: fullResponse });
        }
        for (const tb of toolUseBlocks) {
          let parsedInput = {};
          try { parsedInput = JSON.parse(tb.input); } catch {}
          assistantContent.push({ type: 'tool_use', id: tb.id, name: tb.name, input: parsedInput });
        }
        history.push({ role: 'assistant', content: assistantContent });

        // Execute each tool and build tool_result messages
        const toolResults = [];
        for (const tb of toolUseBlocks) {
          let parsedInput = {};
          try { parsedInput = JSON.parse(tb.input); } catch {}

          yield `\n[Using tool: ${tb.name}...]\n`;
          const result = await executeTool(tb.name, parsedInput);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tb.id,
            content: JSON.stringify(result),
          });
        }

        history.push({ role: 'user', content: toolResults });
        requestParams.messages = history;
        continueLoop = true;
      } else {
        // Normal text response — save and finish
        if (fullResponse) {
          history.push({ role: 'assistant', content: fullResponse });
        }
      }
    }

    // Trim history to last 50 messages
    if (history.length > 50) {
      chatHistories.set(chatId, history.slice(-50));
    }
  }
}

// ── Provider factory ────────────────────────────────────────────────────────

const providers = {
  claude: () => new ClaudeProvider(),
};

function createProvider(name = 'claude') {
  const factory = providers[name];
  if (!factory) {
    throw new Error(`Unknown provider: ${name}. Available: ${Object.keys(providers).join(', ')}`);
  }
  return factory();
}

module.exports = { createProvider };
