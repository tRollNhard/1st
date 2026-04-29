const https = require('https');
const { Anthropic } = require('@anthropic-ai/sdk');

const USER_QUOTES = [
  { text: 'Remember that everyday is the best day of the year!', author: '' },
  { text: 'Listen to many, Speak to Few', author: 'Hamlet' },
  { text: 'Never could I breathe love if I did not first learn to inhale a little bit of chaos.', author: 'Christopher Poindexter' },
  { text: 'My love is Selfish. I cannot breathe without you.', author: 'John Keats' },
  { text: 'There is a world elsewhere.', author: 'Coriolanus' },
  { text: 'I like this place and could willingly waste my time in it.', author: 'As You Like It' },
  { text: 'Night whispers all the secrets Day keeps from me.', author: 'Lauren Eden' },
  { text: 'Why, sometimes I have believed as many as six impossible things before breakfast.', author: 'Lewis Carroll' },
  { text: 'Love all, trust a few, do wrong to none.', author: "All's Well That Ends Well" },
  { text: 'To thine own self be true.', author: 'William Shakespeare' },
];

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Motivation-App/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON from quotes API')); }
      });
    }).on('error', reject).setTimeout(8000, function() { this.destroy(); reject(new Error('Quotes API timeout')); });
  });
}

async function changeOneWord(quote) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key === 'your-api-key-here') return quote;
  try {
    const client = new Anthropic({ apiKey: key });
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Take this quote and change exactly ONE word to make it feel slightly fresh and unique, while keeping the same meaning and spirit. The change should be subtle — a near-synonym only.

Quote: "${quote.text}"
Author: ${quote.author || 'unknown'}

Return ONLY valid JSON — no markdown, no explanation:
{"text": "modified quote here", "author": "${quote.author || ''}"}`,
      }],
    });
    const raw = msg.content[0].text.trim();
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return quote;
    return JSON.parse(match[0]);
  } catch {
    return quote;
  }
}

// Rotation relative to app epoch — day 0 = 2026-04-27
const APP_EPOCH_MS = new Date('2026-04-27').getTime();

async function getDailyQuote() {
  const appDay = Math.floor((Date.now() - APP_EPOCH_MS) / 86400000);

  // Every 3rd day use one of the user's own quotes unchanged
  if (appDay % 3 === 0) {
    return USER_QUOTES[appDay % USER_QUOTES.length];
  }

  // Fetch a real quote from the internet (free, no auth needed)
  try {
    const data = await fetchJson('https://zenquotes.io/api/random');
    if (data?.[0]?.q && data[0].q !== 'Too many requests. Obtain an auth key for unlimited access.') {
      return { text: data[0].q, author: data[0].a || '' };
    }
  } catch (e) {
    console.warn('[QUOTEFETCH] zenquotes fetch failed:', e.message);
  }

  // Fallback: generate via Claude if key is valid
  const key = process.env.ANTHROPIC_API_KEY;
  if (key && key !== 'your-api-key-here') {
    try {
      const client = new Anthropic({ apiKey: key });
      const msg = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        system: `You find and write beautiful, uplifting quotes.
Your style is poetic, literary, and emotionally resonant — never generic or corporate.
Draw from literature, poetry, philosophy, and your own creativity.`,
        messages: [{
          role: 'user',
          content: `Give me one perfect uplifting quote for today.
It can be a real famous quote OR one you compose in the same style.
If you compose it, attribute it as "Motivation".

Return ONLY valid JSON — no markdown, no extra text:
{"text": "the quote here", "author": "Author name"}`,
        }],
      });
      const raw = msg.content[0].text.trim();
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
    } catch {}
  }

  // Final fallback: rotate through user's own quotes
  return USER_QUOTES[appDay % USER_QUOTES.length];
}

module.exports = { getDailyQuote, USER_QUOTES };
