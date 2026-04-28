const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function listVoices() {
  const ps = `
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name }
$s.Dispose()
`;
  try {
    const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
    return r.stdout.trim().split('\n').map(v => v.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

// FIX #7 — match full voice name against installed list, not a substring
function pickBestVoice() {
  const voices = listVoices();
  const preferred = [
    'Microsoft Guy Online (Natural)',
    'Microsoft Davis Online (Natural)',
    'Microsoft Aria Online (Natural)',
    'Microsoft Guy',
    'Microsoft David Desktop',
    'Microsoft Zira Desktop',
  ];
  for (const p of preferred) {
    if (voices.includes(p)) return p;
  }
  return voices[0] || 'Microsoft David Desktop';
}

async function generateVoiceover(script, outputDir) {
  const wavPath = path.join(outputDir, 'voiceover.wav');
  const psScript = path.join(os.tmpdir(), `tts_${Date.now()}.ps1`);
  const voice = pickBestVoice();
  const escaped = script.replace(/'/g, "''").replace(/"/g, '`"');

  const ps = `
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try { $synth.SelectVoice('${voice}') } catch {}
$synth.Rate = 1
$synth.Volume = 100
$synth.SetOutputToWaveFile('${wavPath.replace(/\\/g, '\\\\')}')
$synth.Speak('${escaped}')
$synth.Dispose()
`;

  fs.writeFileSync(psScript, ps, 'utf8');

  // FIX #8 — always clean up temp file, even if spawnSync throws
  let result;
  try {
    result = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psScript], {
      encoding: 'utf8',
      timeout: 60000,
    });
  } finally {
    try { fs.unlinkSync(psScript); } catch {}
  }

  if (!result || result.status !== 0 || !fs.existsSync(wavPath)) {
    throw new Error(`TTS failed: ${result?.stderr || result?.stdout || 'unknown error'}`);
  }

  return wavPath;
}

module.exports = { generateVoiceover };
