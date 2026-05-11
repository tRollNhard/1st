const path = require('path');

// KNOWN GAP: these patterns are a best-effort tripwire for the most common
// English injection idioms, not a complete defence. Known bypasses (tested
// in skill-sanitization.test.js as `xfail` cases): verb swaps (override,
// pretend, act as, skip, bypass), contraction forms ("you're now"), word
// inserts ("ignore THE previous"), homoglyph/zero-width obfuscation,
// non-English, Anthropic-internal `\n\nHuman:` tokens, Llama/Gemma tokens.
// The primary defence is the random-fenced XML envelope + explicit
// data-vs-instructions framing in the wrapper instruction; this pattern set
// is layer C in a 3-layer defence (see scratch/skill-sanitization-PROPOSAL.md).
const INJECTION_PATTERNS = [
  /\b(ignore|disregard|forget)\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|messages?|context|rules?)\b/gi,
  /\byou\s+are\s+now\s+(?:a\s+)?(?:different|new)\b/gi,
  /\bnew\s+(?:role|system\s+prompt|persona|instructions?)\s*[:=]/gi,
  /\b(?:system|assistant)\s*[:=]\s*["']?(?:you|your)/gi,
  /<\|(?:im_start|im_end|system|user|assistant)\|>/gi,
];

// Character cap, not byte cap — JS .length is UTF-16 code units. For ASCII
// SKILL.md content (the common case) the two are equal; for non-ASCII the
// byte count can be 2-4x larger. If you need a true byte cap, switch to
// Buffer.byteLength(s, 'utf8').
const SKILL_CHAR_CAP = 8192;

function sanitizeSkillContent(raw) {
  let out = raw;
  for (const pat of INJECTION_PATTERNS) {
    out = out.replace(pat, '[REDACTED:injection-pattern]');
  }
  if (out.length > SKILL_CHAR_CAP) {
    out = out.slice(0, SKILL_CHAR_CAP) + '\n[TRUNCATED: skill exceeded 8K char cap]';
  }
  return out;
}

// Code points that must not survive into the rendered prompt. Built as a Set
// of numeric code points rather than a regex character class so the source
// file stays free of literal U+2028 / U+2029 (which would terminate a regex
// literal at JS parse time). Covers:
//   - XML metacharacters: < > & "
//   - C0 controls 0x00-0x1F: includes \n \r \t and other format chars
//   - NEL 0x85: next-line, parsed as line break by many tokenizers
//   - Zero-width + bidi marks 0x200B-0x200F: ZWSP, ZWNJ, ZWJ, LRM, RLM
//   - Line/para separators 0x2028, 0x2029: render as newlines
//   - Bidi formatting 0x202A-0x202E: LRE/RLE/PDF/LRO/RLO — RTL override risk
//   - Word joiner 0x2060
//   - BOM / zero-width no-break space 0xFEFF
const STRUCTURE_BREAKING_CODES = new Set([
  0x3C, 0x3E, 0x26, 0x22,
  ...Array.from({ length: 0x20 }, (_, i) => i),
  0x85,
  0x200B, 0x200C, 0x200D, 0x200E, 0x200F,
  0x2028, 0x2029,
  0x202A, 0x202B, 0x202C, 0x202D, 0x202E,
  0x2060,
  0xFEFF,
]);

// Used for skill_name and source fields in <skill_*> blocks — both XML
// element content, not attributes, despite the legacy name.
function escapeAttr(s) {
  let out = '';
  for (const ch of String(s)) {
    out += STRUCTURE_BREAKING_CODES.has(ch.codePointAt(0)) ? '_' : ch;
  }
  return out.slice(0, 80);
}

function wrapSkill(skill, content, fence, alwaysActive) {
  return [
    `<skill_${fence} category="${alwaysActive ? 'always' : 'matched'}">`,
    `  <skill_name>${escapeAttr(skill.name)}</skill_name>`,
    `  <source>${escapeAttr(path.basename(skill.path))}</source>`,
    `  <skill_content>`,
    content,
    `  </skill_content>`,
    `</skill_${fence}>`,
  ].join('\n');
}

module.exports = {
  sanitizeSkillContent,
  escapeAttr,
  wrapSkill,
  SKILL_CHAR_CAP,
  INJECTION_PATTERNS,
  STRUCTURE_BREAKING_CODES,
};
