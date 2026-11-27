'use strict';
// Rebuild all current-release integrity metadata after static assets change.
// Run from the repository root with Node.js 20+.
const fs = require('node:fs');
const crypto = require('node:crypto');

const read = name => fs.readFileSync(name);
const hash = (algorithm, bytes, encoding = 'hex') => crypto.createHash(algorithm).update(bytes).digest(encoding);
const sha256 = name => hash('sha256', read(name));
const sha384 = name => 'sha384-' + hash('sha384', read(name), 'base64');
const write = (name, value) => fs.writeFileSync(name, value);
let runtime = fs.readFileSync('site-runtime-current.js', 'utf8');
let worker = fs.readFileSync('service-worker-current.js', 'utf8');
let index = fs.readFileSync('index.html', 'utf8');

const modulePattern = /"([^"]+)": \{ file: "([^"]+\.js)", hash: "([a-f0-9]{64})", integrity: "(sha384-[A-Za-z0-9+/=]+)" \}/g;
let moduleCount = 0, changed = false;
runtime = runtime.replace(modulePattern, (whole, key, file, oldHash, oldSri) => {
  if (!fs.existsSync(file)) throw new Error('Missing category bundle: ' + file);
  const nextHash = sha256(file), nextSri = sha384(file);
  moduleCount++;
  if (nextHash !== oldHash || nextSri !== oldSri) changed = true;
  return `"${key}": { file: "${file}", hash: "${nextHash}", integrity: "${nextSri}" }`;
});
if (moduleCount !== 7) throw new Error('Expected 7 category integrity entries, found ' + moduleCount);

const expectedMatch = worker.match(/const EXPECTED_SHA256 = Object\.freeze\(\{([\s\S]*?)\n\}\);/);
if (!expectedMatch) throw new Error('Could not locate service-worker integrity table');
const expectedEntries = [...expectedMatch[1].matchAll(/"([^"]+)": "([a-f0-9]{64})"/g)];
if (expectedEntries.length < 20) throw new Error('Service-worker integrity table looks incomplete');
for (const [, file, oldHash] of expectedEntries) {
  if (!fs.existsSync(file)) throw new Error('Missing cached asset: ' + file);
  if (sha256(file) !== oldHash) changed = true;
}
const releaseMatch = worker.match(/const RELEASE_ID = 'v1\.(\d+)';/);
if (!releaseMatch) throw new Error('Could not read service-worker release ID');
const oldRelease = 'v1.' + releaseMatch[1];
if (!runtime.includes('service-worker-current.js?release=' + oldRelease)) changed = true;
if (!index.includes('name="curioid-release" content="' + oldRelease + '"')) changed = true;
if (!changed) {
  console.log('Release integrity metadata is already current; no changes needed.');
  process.exit(0);
}
const nextRelease = 'v1.' + (Number(releaseMatch[1]) + 1);
runtime = runtime.replace('service-worker-current.js?release=' + oldRelease, 'service-worker-current.js?release=' + nextRelease);
index = index.replace(/(<meta name="curioid-release" content=")v1\.\d+(")/, '$1' + nextRelease + '$2');

// Runtime's own digest is included by the HTML preload and offline shell.
const runtimeHash = hash('sha256', Buffer.from(runtime));
const runtimeSri = 'sha384-' + hash('sha384', Buffer.from(runtime), 'base64');
index = index.replace(/(site-runtime-current\.js\?v=sha256-)[a-f0-9]{64}/g, '$1' + runtimeHash);
index = index.replace(/(<link rel="preload" href="site-runtime-current\.js\?v=sha256-[^"]+" as="script" integrity=")sha384-[^"]+/, '$1' + runtimeSri);

// Refresh every cached file hash, including the final HTML and runtime bytes.
const updatedExpected = expectedMatch[1].replace(/("([^"]+)": ")[a-f0-9]{64}(")/g, (whole, prefix, file, suffix) => {
  if (!fs.existsSync(file)) throw new Error('Missing cached asset during hash refresh: ' + file);
  // Hash the final in-memory bytes for files this script is rewriting.
  const bytes = file === 'index.html' ? Buffer.from(index)
    : file === 'site-runtime-current.js' ? Buffer.from(runtime)
    : read(file);
  return prefix + hash('sha256', bytes) + suffix;
});
worker = worker.replace(expectedMatch[1], updatedExpected);
worker = worker.replace(/const RELEASE_ID = 'v1\.\d+';/, "const RELEASE_ID = '" + nextRelease + "';");
worker = worker.replace(/CURIOID v1\.\d+ offline shell/, 'CURIOID ' + nextRelease + ' offline shell');

write('site-runtime-current.js', runtime);
write('index.html', index);
write('service-worker-current.js', worker);
console.log('Refreshed category SRI, runtime preload SRI, offline hashes and release ID: ' + oldRelease + ' -> ' + nextRelease);
