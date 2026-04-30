const { Anthropic } = require('@anthropic-ai/sdk');

async function writeScript(topic) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: `You are a world-class motivational video scriptwriter.
Write punchy, emotionally raw scripts — real, human, direct. Not corporate or preachy.
60 seconds when spoken at a natural pace (~140 words).
The hook must grab within 3 seconds or viewers scroll away.`,
    messages: [{
      role: 'user',
      content: `Write a 60-second motivational video script on: "${topic}"

Return ONLY valid JSON — no markdown, no extra text:
{
  "script": "Full spoken script, ~140 words",
  "pexelsQuery": "3-4 word search query for Pexels cinematic video (e.g. 'athlete running sunrise')",
  "caption": "Social caption under 150 chars with 5 hashtags",
  "title": "YouTube video title"
}`,
    }],
  });

  const raw = msg.content[0].text.trim();
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Claude returned invalid JSON');
  return JSON.parse(match[0]);
}

module.exports = { writeScript };
