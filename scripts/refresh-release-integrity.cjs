'use strict';
// Rebuild all current-release integrity references after static assets change.
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

let changed = false;
function syncRuntimeConstant(hashName, sriName, file) {
  if (!fs.existsSync(file)) throw new Error('Missing runtime asset: ' + file);
  const nextHash = sha256(file), nextSri = sha384(file);
  const hashPattern = new RegExp("(const " + hashName + " = ')[a-f0-9]{64}(';)");
  const sriPattern = new RegExp("(const " + sriName + " = ')sha384-[^']+(';)");
  const currentHash = runtime.match(hashPattern)?.[0];
  const currentSri = runtime.match(sriPattern)?.[0];
  if (!currentHash || !currentSri) throw new Error('Missing runtime integrity constants for ' + file);
  if (!currentHash.includes(nextHash) || !currentSri.includes(nextSri)) changed = true;
  runtime = runtime.replace(hashPattern, '$1' + nextHash + '$2');
  runtime = runtime.replace(sriPattern, '$1' + nextSri + '$2');
}
syncRuntimeConstant('HEALTH_MODULE_HASH', 'HEALTH_MODULE_SRI', 'health-check.js');
syncRuntimeConstant('PROJECT_STYLES_SHA256', 'PROJECT_STYLES_SRI', 'projects-styles.css');

const coreHash = sha256('projects-core.js'), coreSri = sha384('projects-core.js');
const corePattern = /(file: "projects-core\.js", hash: ")[a-f0-9]{64}(", integrity: ")sha384-[^"]+(")/;
const coreMatch = runtime.match(corePattern);
if (!coreMatch) throw new Error('Could not locate projects-core.js integrity descriptor');
if (!coreMatch[0].includes(coreHash) || !coreMatch[0].includes(coreSri)) changed = true;
runtime = runtime.replace(corePattern, '$1' + coreHash + '$2' + coreSri + '$3');

const modulePattern = /"([^"]+)": \{ file: "([^"]+\.js)", hash: "([a-f0-9]{64})", integrity: "(sha384-[A-Za-z0-9+/=]+)" \}/g;
let moduleCount = 0;
runtime = runtime.replace(modulePattern, (whole, key, file, oldHash, oldSri) => {
  if (!fs.existsSync(file)) throw new Error('Missing category bundle: ' + file);
  const nextHash = sha256(file), nextSri = sha384(file);
  moduleCount++;
  if (nextHash !== oldHash || nextSri !== oldSri) changed = true;
  return '"' + key + '": { file: "' + file + '", hash: "' + nextHash + '", integrity: "' + nextSri + '" }';
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
if (!html.get('index.html').includes('<small class="site-version">' + oldRelease + '</small>')) changed = true;

function inspectHtmlAssetTags(source, update, runtimeBytes) {
  return source.replace(/<(?:script|link)\b[^>]*>/gi, tag => {
    const attribute = /^<script\b/i.test(tag) ? 'src' : 'href';
    const match = tag.match(new RegExp('\\b' + attribute + '="([^"]+)"'));
    if (!match) return tag;
    const url = match[1];
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(url)) return tag;
    const file = url.split(/[?#]/)[0];
    if (!file || !fs.existsSync(file)) return tag;
    const bytes = file === 'site-runtime-current.js' && runtimeBytes ? runtimeBytes : read(file);
    const nextHash = hash('sha256', bytes);
    const nextSri = 'sha384-' + hash('sha384', bytes, 'base64');
    const oldSri = tag.match(/\bintegrity="(sha384-[^"]+)"/)?.[1];
    const hasVersionHash = /[?&]v=sha256-[a-f0-9]{64}/.test(url);
    if ((hasVersionHash && !url.includes('v=sha256-' + nextHash)) || (oldSri && oldSri !== nextSri)) changed = true;
    if (!update) return tag;
    let nextTag = tag.replace(new RegExp('(' + attribute + '="[^"]*[?&]v=sha256-)[a-f0-9]{64}'), '$1' + nextHash);
    if (oldSri) nextTag = nextTag.replace(/(\bintegrity=")sha384-[^"]+/, '$1' + nextSri);
    return nextTag;
  });
}
for (const source of html.values()) inspectHtmlAssetTags(source, false, Buffer.from(runtime));
const currentRuntimeHash = hash('sha256', Buffer.from(runtime));
const currentRuntimeSri = 'sha384-' + hash('sha384', Buffer.from(runtime), 'base64');
if (!html.get('index.html').includes('site-runtime-current.js?v=sha256-' + currentRuntimeHash)) changed = true;
const preloadSri = html.get('index.html').match(/<link[^>]+href="site-runtime-current\.js\?v=sha256-[^"]+"[^>]+integrity="(sha384-[^"]+)"/)?.[1];
const scriptSri = html.get('index.html').match(/<script[^>]+src="site-runtime-current\.js\?v=sha256-[^"]+"[^>]+integrity="(sha384-[^"]+)"/)?.[1];
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

const runtimeBytes = Buffer.from(runtime);
for (const [file, source] of html) html.set(file, inspectHtmlAssetTags(source, true, runtimeBytes));

// Refresh every cached file hash using final in-memory bytes for rewritten files.
const updatedExpected = expectedMatch[1].replace(/("([^"]+)": ")[a-f0-9]{64}(")/g, (whole, prefix, file, suffix) => {
  if (!fs.existsSync(file)) throw new Error('Missing cached asset during hash refresh: ' + file);
  const bytes = html.has(file) ? Buffer.from(html.get(file))
    : file === 'site-runtime-current.js' ? runtimeBytes
    : read(file);
  return prefix + hash('sha256', bytes) + suffix;
});
worker = worker.replace(expectedMatch[1], updatedExpected);
worker = worker.replace(/const RELEASE_ID = 'v1\.\d+';/, "const RELEASE_ID = '" + nextRelease + "';");
worker = worker.replace(/CURIOID v1\.\d+ offline shell/, 'CURIOID ' + nextRelease + ' offline shell');

for (const [file, source] of html) write(file, source);
write('site-runtime-current.js', runtime);
write('service-worker-current.js', worker);
console.log('Refreshed runtime assets, all page script SRI, category integrity, page versions, offline hashes and release ID: ' + oldRelease + ' -> ' + nextRelease);
