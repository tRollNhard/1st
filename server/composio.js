const { Composio, ComposioToolSet } = require('composio-core');

let client = null;
let toolset = null;
let cachedTools = null;

function getClient() {
  if (!client) {
    const apiKey = process.env.COMPOSIO_API_KEY;
    if (!apiKey || apiKey === 'your-composio-api-key-here') {
      return null;
    }
    client = new Composio({ apiKey });
  }
  return client;
}

function getToolSet() {
  if (!toolset) {
    const apiKey = process.env.COMPOSIO_API_KEY;
    if (!apiKey || apiKey === 'your-composio-api-key-here') {
      return null;
    }
    toolset = new ComposioToolSet({ apiKey });
  }
  return toolset;
}

/**
 * Fetch available Composio tools, cached after first call.
 * Returns Anthropic-compatible tool definitions.
 */
async function getTools() {
  const ts = getToolSet();
  if (!ts) return [];

  if (cachedTools) return cachedTools;

  try {
    cachedTools = await ts.getTools({});
    console.log(`[COMPOSIO] Loaded ${cachedTools.length} tools`);
    return cachedTools;
  } catch (err) {
    console.warn('[COMPOSIO] Failed to load tools:', err.message);
    return [];
  }
}

/**
 * Execute a Composio tool call returned by Claude.
 */
async function executeTool(toolName, toolInput) {
  const ts = getToolSet();
  if (!ts) {
    return { error: 'Composio not configured' };
  }

  try {
    const result = await ts.executeAction(toolName, toolInput);
    return result;
  } catch (err) {
    console.error(`[COMPOSIO] Tool execution error (${toolName}):`, err.message);
    return { error: err.message };
  }
}

function isConfigured() {
  const key = process.env.COMPOSIO_API_KEY;
  return Boolean(key && key !== 'your-composio-api-key-here');
}

module.exports = { getTools, executeTool, isConfigured };
