const Anthropic = require('@anthropic-ai/sdk');
const https = require('https');
const http = require('http');
const { executeTool, isConfigured: composioConfigured } = require('./composio');
const { MODELS } = require('./models');

// ── RSS utilities ─────────────────────────────────────────────────────────────

function fetchUrl(url, redirectCount = 0) {
  if (redirectCount > 5) return Promise.reject(new Error('Too many redirects'));
  const parsed = (() => { try { return new URL(url); } catch { return null; } })();
  if (!parsed || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
    return Promise.reject(new Error('Invalid URL protocol'));
  }
  return new Promise((resolve, reject) => {
    const proto = parsed.protocol === 'https:' ? https : http;
    const req = proto.get(url, { headers: { 'User-Agent': 'OpenClaudeCowork/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location, redirectCount + 1).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('RSS fetch timeout')); });
  });
}

function extractTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i');
  const m = re.exec(xml);
  return m ? m[1].replace(/<[^>]*>/g, '').trim() : '';
}

function parseRss(xml) {
  // Strip DOCTYPE declarations to prevent XXE attacks
  xml = xml.replace(/<!DOCTYPE[^>[]*(\[[^\]]*\])?>/gi, '');
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const b = m[1];
    const link = extractTag(b, 'link') || extractTag(b, 'url');
    items.push({
      title:       extractTag(b, 'title'),
      link,
      description: extractTag(b, 'description') || extractTag(b, 'summary'),
      pubDate:     extractTag(b, 'pubDate') || extractTag(b, 'published'),
      guid:        extractTag(b, 'guid') || link,
    });
  }
  return items;
}

// ── Claude helpers ────────────────────────────────────────────────────────────

async function claudeComplete(client, prompt, maxTokens = 400) {
  const msg = await client.messages.create({
    model: MODELS.HAIKU,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  });
  return msg.content[0].text.trim();
}

async function summarize(client, item) {
  return claudeComplete(client,
    `Summarize this AI/tech news in 2–3 punchy sentences. Focus on what's new and why it matters.\n\nTitle: ${item.title}\nDescription: ${item.description}\nURL: ${item.link}\n\nReturn only the summary.`,
    300
  );
}

async function writeForPlatform(client, platform, summary, item) {
  const prompts = {
    twitter: `Write a tweet about this AI news. Max 260 chars. Punchy, no filler. Add 2–3 hashtags like #AI #AItools.\n\nNews: ${summary}\n\nReturn only the tweet.`,
    instagram: `Write an Instagram caption for this AI news. Engaging with line breaks. Add 6–8 hashtags at the end.\n\nNews: ${summary}\n\nReturn only the caption.`,
    facebook: `Write a Facebook post about this AI news. Conversational, 2–3 paragraphs. Include the link: ${item.link}\n\nNews: ${summary}\n\nReturn only the post.`,
  };
  return claudeComplete(client, prompts[platform], 600);
}

async function generateImagePrompt(client, summary) {
  return claudeComplete(client,
    `Write a concise DALL-E prompt for an Instagram post about this AI news. Visually striking, modern, max 80 words.\n\n${summary}\n\nReturn only the prompt.`,
    150
  );
}

// ── Composio posting ──────────────────────────────────────────────────────────

const PLATFORM_ACTIONS = {
  twitter:   ['TWITTER_CREATE_TWEET', 'TWITTER_POST_TWEET'],
  facebook:  ['FACEBOOK_PAGES_CREATE_POST', 'FACEBOOK_CREATE_POST'],
  instagram: ['INSTAGRAM_CREATE_PHOTO_POST', 'INSTAGRAM_POST'],
};

const PLATFORM_INPUT = (platform, content, imagePrompt) => ({
  twitter:   { text: content },
  facebook:  { message: content },
  instagram: { caption: content, ...(imagePrompt ? { image_prompt: imagePrompt } : {}) },
}[platform]);

async function postToSocial(platform, content, imagePrompt) {
  if (!composioConfigured()) {
    return { dryRun: true, platform, content };
  }
  for (const action of (PLATFORM_ACTIONS[platform] || [])) {
    try {
      const result = await executeTool(action, PLATFORM_INPUT(platform, content, imagePrompt));
      if (!result?.error) return { success: true, platform, action };
    } catch {}
  }
  return { error: `No working Composio action found for ${platform}`, platform };
}

// ── Automation engine ─────────────────────────────────────────────────────────

// Cap on the in-memory dedup set of RSS GUIDs. Without a cap, a long-running
// process polling a feed every 30 min for months would grow `processedGuids`
// unboundedly (slow memory leak). 5000 GUIDs * ~80 bytes each ≈ 400 KB —
// orders of magnitude more than any realistic poll backlog, but bounded.
// FIFO eviction (insertion order) is the correct semantics: GUIDs are only
// ever looked up by exact match for dedup, no "recently seen" notion exists.
const PROCESSED_GUID_CAP = 5000;

class SocialAutomation {
  constructor() {
    this.client = new Anthropic();
    this.isRunning = false;
    this.intervalId = null;
    this.jobHistory = [];        // newest first, capped at 100
    // Map (not Set) so we get reliable insertion-order iteration for FIFO
    // eviction. Value is unused — we only need the key for `.has()`/`.set()`.
    this.processedGuids = new Map();
    this.config = {
      rssUrl: 'https://news.google.com/rss/search?q=AI+tools+news&hl=en-US&gl=US&ceid=US:en',
      pollIntervalMs: 30 * 60 * 1000,  // 30 min
      platforms: ['twitter', 'facebook', 'instagram'],
      maxItemsPerCycle: 3,
    };
  }

  _rememberGuid(guid) {
    // Idempotent insert with FIFO eviction once cap is reached.
    if (this.processedGuids.has(guid)) return;
    if (this.processedGuids.size >= PROCESSED_GUID_CAP) {
      // Delete oldest (first inserted) entry. Map iteration is insertion-
      // ordered per ECMAScript spec, so `.keys().next()` gives us the eldest.
      const oldest = this.processedGuids.keys().next().value;
      if (oldest !== undefined) this.processedGuids.delete(oldest);
    }
    this.processedGuids.set(guid, 1);
  }

  configure(updates = {}) {
    if (typeof updates.rssUrl === 'string') {
      try {
        const u = new URL(updates.rssUrl);
        if (u.protocol === 'http:' || u.protocol === 'https:') this.config.rssUrl = updates.rssUrl;
      } catch {}
    }
    if (typeof updates.pollIntervalMs === 'number' && updates.pollIntervalMs >= 60000) {
      this.config.pollIntervalMs = Math.floor(updates.pollIntervalMs);
    }
    if (Array.isArray(updates.platforms)) {
      const allowed = ['twitter', 'facebook', 'instagram'];
      this.config.platforms = updates.platforms.filter(p => allowed.includes(p));
    }
    if (typeof updates.maxItemsPerCycle === 'number' && updates.maxItemsPerCycle >= 1 && updates.maxItemsPerCycle <= 20) {
      this.config.maxItemsPerCycle = Math.floor(updates.maxItemsPerCycle);
    }
  }

  _addJob(job) {
    this.jobHistory.unshift(job);
    if (this.jobHistory.length > 100) this.jobHistory.pop();
  }

  async processItem(item) {
    if (this.processedGuids.has(item.guid)) return null;
    this._rememberGuid(item.guid);

    const job = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: item.title,
      link: item.link,
      startedAt: new Date().toISOString(),
      status: 'running',
      summary: null,
      platforms: {},
    };
    this._addJob(job);
    console.log(`[AUTOMATION] Processing: ${item.title}`);

    try {
      job.summary = await summarize(this.client, item);

      await Promise.all(this.config.platforms.map(async (platform) => {
        try {
          const content = await writeForPlatform(this.client, platform, job.summary, item);
          const imagePrompt = platform === 'instagram'
            ? await generateImagePrompt(this.client, job.summary)
            : null;
          const result = await postToSocial(platform, content, imagePrompt);
          job.platforms[platform] = {
            content,
            ...(imagePrompt ? { imagePrompt } : {}),
            result,
            status: result.error ? 'error' : (result.dryRun ? 'dry-run' : 'posted'),
          };
        } catch (err) {
          job.platforms[platform] = { status: 'error', error: err.message };
        }
      }));

      job.status = 'done';
    } catch (err) {
      job.status = 'error';
      job.error = err.message;
      console.error(`[AUTOMATION] Error processing item:`, err.message);
    }

    return job;
  }

  async runCycle() {
    console.log('[AUTOMATION] Running cycle…');
    const cycleJob = {
      id: `cycle-${Date.now()}`,
      type: 'cycle',
      startedAt: new Date().toISOString(),
      status: 'running',
      itemsFound: 0,
      itemsProcessed: 0,
    };
    this._addJob(cycleJob);

    try {
      const xml = await fetchUrl(this.config.rssUrl);
      const items = parseRss(xml);
      cycleJob.itemsFound = items.length;

      const newItems = items.filter(it => it.guid && !this.processedGuids.has(it.guid));
      const batch = newItems.slice(0, this.config.maxItemsPerCycle);

      for (const item of batch) {
        if (!this.isRunning) break;
        await this.processItem(item);
        cycleJob.itemsProcessed++;
      }

      cycleJob.status = 'done';
      console.log(`[AUTOMATION] Cycle done. Found ${items.length}, processed ${cycleJob.itemsProcessed} new.`);
    } catch (err) {
      cycleJob.status = 'error';
      cycleJob.error = err.message;
      console.error('[AUTOMATION] Cycle failed:', err.message);
    }
  }

  start(config = {}) {
    if (this.isRunning) return { ok: false, message: 'Already running' };
    this.configure(config);
    this.isRunning = true;

    this.runCycle(); // run immediately
    this.intervalId = setInterval(() => this.runCycle(), this.config.pollIntervalMs);

    const dryRun = !composioConfigured();
    console.log(`[AUTOMATION] Started. Dry-run: ${dryRun}. Interval: ${this.config.pollIntervalMs / 60000} min.`);
    return { ok: true, message: 'Automation started', dryRun, config: this.config };
  }

  stop() {
    if (!this.isRunning) return { ok: false, message: 'Not running' };
    clearInterval(this.intervalId);
    this.intervalId = null;
    this.isRunning = false;
    console.log('[AUTOMATION] Stopped.');
    return { ok: true, message: 'Automation stopped' };
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      dryRun: !composioConfigured(),
      config: this.config,
      jobHistory: this.jobHistory,
    };
  }
}

// Default export: shared singleton used by the Express routes. The class +
// PROCESSED_GUID_CAP are also exposed as named properties for tests that need
// to instantiate a fresh, isolated instance.
const singleton = new SocialAutomation();
singleton.SocialAutomation = SocialAutomation;
singleton.PROCESSED_GUID_CAP = PROCESSED_GUID_CAP;
module.exports = singleton;
