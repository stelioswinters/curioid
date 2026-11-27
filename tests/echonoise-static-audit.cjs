const fs = require('node:fs');
const path = 'projects-category-operating-systems.js';
const source = fs.readFileSync(path, 'utf8');

const patterns = [
  ['ADVANCED VOCALOID', /advanced.{0,30}vocaloid|vocaloid.{0,30}advanced/ig],
  ['VOCALOID', /vocaloid/ig],
  ['VOICE', /voice/ig],
  ['PHONEME', /phoneme/ig],
  ['SPEECH', /speech/ig],
  ['SYNTH', /synth/ig],
  ['AUDIO CONTEXT', /AudioContext/g],
  ['OSCILLATOR', /createOscillator/g],
  ['BUFFER SOURCE', /createBufferSource/g],
  ['AUDIO BUFFER', /decodeAudioData|createBuffer\(/g],
  ['FETCH / AUDIO DATA', /fetch\([^)]{0,180}(?:audio|voice|phoneme|sample)/ig]
];

for (const [label, pattern] of patterns) {
  const matches = [...source.matchAll(pattern)];
  console.log(`\n=== ${label}: ${matches.length} match(es) ===`);
  const chosen = matches.length > 18 ? [...matches.slice(0, 9), ...matches.slice(-9)] : matches;
  const seen = new Set();
  for (const match of chosen) {
    const start = Math.max(0, match.index - 220);
    const end = Math.min(source.length, match.index + match[0].length + 420);
    const excerpt = source.slice(start, end).replace(/\s+/g, ' ');
    if (seen.has(excerpt)) continue;
    seen.add(excerpt);
    console.log(`@ ${match.index}: ${excerpt}`);
  }
}
