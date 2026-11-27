'use strict';
// Rebuild every current-release integrity reference after static assets change.
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
const htmlFiles = fs.readdirSync('.').filter(name => name.endsWith('.html'));
const html = new Map(htmlFiles.map(name => [name, fs.readFileSync(name, 'utf8')]));

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
const runtimeReleases = [...runtime.matchAll(/v1\.\d+/g)].map(match => match[0]);
if (!runtimeReleases.length || runtimeReleases.some(version => version !== oldRelease)) changed = true;
for (const [file, source] of html) {
  const match = source.match(/<meta[^>]+name="curioid-release"[^>]+content="(v1\.\d+)"/);
  if (match && match[1] !== oldRelease) changed = true;
}
if (!html.has('index.html')) throw new Error('index.html is missing from the release');
const currentIndex = html.get('index.html');
if (!currentIndex.includes('<small class="site-version">' + oldRelease + '</small>')) changed = true;
const currentRuntimeHash = hash('sha256', Buffer.from(runtime));
const currentRuntimeSri = 'sha384-' + hash('sha384', Buffer.from(runtime), 'base64');
if (!currentIndex.includes('site-runtime-current.js?v=sha256-' + currentRuntimeHash)) changed = true;
const preloadSri = currentIndex.match(/<link[^>]+href="site-runtime-current\.js\?v=sha256-[^"]+"[^>]+integrity="(sha384-[^"]+)"/)?.[1];
const scriptSri = currentIndex.match(/<script[^>]+src="site-runtime-current\.js\?v=sha256-[^"]+"[^>]+integrity="(sha384-[^"]+)"/)?.[1];
if (preloadSri !== currentRuntimeSri || scriptSri !== currentRuntimeSri) changed = true;

if (!changed) {
  console.log('Release integrity metadata is already current; no changes needed.');
  process.exit(0);
}

const nextRelease = 'v1.' + (Number(releaseMatch[1]) + 1);
runtime = runtime.replace(/v1\.\d+/g, nextRelease);
for (const [file, source] of html) {
  let next = source.replace(/(<meta[^>]+name="curioid-release"[^>]+content=")v1\.\d+(")/, '$1' + nextRelease + '$2');
  if (file === 'index.html') {
    next = next.replace(/(<small class="site-version">)v1\.\d+(<\/small>)/, '$1' + nextRelease + '$2');
  }
  html.set(file, next);
}

let index = html.get('index.html');
const runtimeHash = hash('sha256', Buffer.from(runtime));
const runtimeSri = 'sha384-' + hash('sha384', Buffer.from(runtime), 'base64');
index = index.replace(/(site-runtime-current\.js\?v=sha256-)[a-f0-9]{64}/g, '$1' + runtimeHash);
index = index.replace(/(<link rel="preload" href="site-runtime-current\.js\?v=sha256-[^"]+" as="script" integrity=")sha384-[^"]+/, '$1' + runtimeSri);
index = index.replace(/(<script src="site-runtime-current\.js\?v=sha256-[^"]+" defer integrity=")sha384-[^"]+/, '$1' + runtimeSri);
html.set('index.html', index);

// Refresh every cached file hash using final in-memory bytes for rewritten files.
const updatedExpected = expectedMatch[1].replace(/("([^"]+)": ")[a-f0-9]{64}(")/g, (whole, prefix, file, suffix) => {
  if (!fs.existsSync(file)) throw new Error('Missing cached asset during hash refresh: ' + file);
  const bytes = html.has(file) ? Buffer.from(html.get(file))
    : file === 'site-runtime-current.js' ? Buffer.from(runtime)
    : read(file);
  return prefix + hash('sha256', bytes) + suffix;
});
worker = worker.replace(expectedMatch[1], updatedExpected);
worker = worker.replace(/const RELEASE_ID = 'v1\.\d+';/, "const RELEASE_ID = '" + nextRelease + "';");
worker = worker.replace(/CURIOID v1\.\d+ offline shell/, 'CURIOID ' + nextRelease + ' offline shell');

for (const [file, source] of html) write(file, source);
write('site-runtime-current.js', runtime);
write('service-worker-current.js', worker);
console.log('Refreshed all page release markers, runtime references, category SRI, offline hashes and release ID: ' + oldRelease + ' -> ' + nextRelease);
