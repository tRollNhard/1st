const path = require('path');

const INJECTION_PATTERNS = [
  /\b(ignore|disregard|forget)\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|messages?|context|rules?)\b/gi,
  /\byou\s+are\s+now\s+(?:a\s+)?(?:different|new)\b/gi,
  /\bnew\s+(?:role|system\s+prompt|persona|instructions?)\s*[:=]/gi,
  /\b(?:system|assistant)\s*[:=]\s*["']?(?:you|your)/gi,
  /<\|(?:im_start|im_end|system|user|assistant)\|>/gi,
];

const SKILL_BYTE_CAP = 8192;

function sanitizeSkillContent(raw) {
  let out = raw;
  for (const pat of INJECTION_PATTERNS) {
    out = out.replace(pat, '[REDACTED:injection-pattern]');
  }
  if (out.length > SKILL_BYTE_CAP) {
    out = out.slice(0, SKILL_BYTE_CAP) + '\n[TRUNCATED: skill exceeded 8KB cap]';
  }
  return out;
}

function escapeAttr(s) {
  return String(s).replace(/[<>&"\n\r]/g, '_').slice(0, 80);
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
  SKILL_BYTE_CAP,
  INJECTION_PATTERNS,
};
