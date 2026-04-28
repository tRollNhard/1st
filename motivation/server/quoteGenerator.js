const path = require('path');
const fs = require('fs');
const { v4: uuid } = require('uuid');
const quotefetch = require('./quotefetch');
const quotecard = require('./quotecard');
const publisher = require('./publisher');

async function researchQuote() {
  const quote = await quotefetch.getDailyQuote();
  return quote;
}

async function run({ text, author }, onProgress) {
  const jobId = uuid();
  const outputDir = path.join(__dirname, '..', 'output', `quote_${jobId}`);
  fs.mkdirSync(outputDir, { recursive: true });

  onProgress('card', 'Generating quote card...');
  const cardPath = await quotecard.generateQuoteCard({ text, author }, outputDir);

  onProgress('publish', 'Posting to all platforms...');
  const results = await publisher.publishAllImage(cardPath, {
    caption: `"${text}" ${author ? '— ' + author : ''}\n\n#motivation #quotes #mindset #inspiration #daily`,
  });

  const summary = results.map(r => r.ok ? `✓ ${r.platform}` : `✗ ${r.platform}`).join('  ');
  onProgress('publish', summary);

  const allFailed = results.every(r => !r.ok);
  if (allFailed) throw new Error('All platforms failed. Check tokens in Setup.');

  return { cardPath, results };
}

module.exports = { researchQuote, run };
