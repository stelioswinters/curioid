'use strict';
// Cross-file release contract audit. Run after refresh-release-integrity.cjs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');

const read = file => fs.readFileSync(file);
const readText = file => read(file).toString('utf8');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sri = (algorithm, bytes) => algorithm + '-' + crypto.createHash(algorithm).update(bytes).digest('base64');
const sha384 = bytes => sri('sha384', bytes);
const worker = readText('service-worker-current.js');
const runtime = readText('site-runtime-current.js');
const health = readText('health-check.js');
const index = readText('index.html');

const release = worker.match(/const RELEASE_ID\s*=\s*['"](v\d+)['"]/)?.[1];
assert.ok(release, 'service worker must declare a release ID');
assert.equal(index.match(/<meta[^>]+name="curioid-release"[^>]+content="(v\d+)"/)?.[1], release,
  'homepage and service worker release IDs must match');

const manifestMatch = worker.match(/const EXPECTED_SHA256\s*=\s*Object\.freeze\((\{[\s\S]*?\})\);/);
assert.ok(manifestMatch, 'service worker must expose its SHA-256 manifest');
const manifest = JSON.parse(manifestMatch[1].replace(/,\s*}/g, '}'));
assert.ok(Object.keys(manifest).length >= 20, 'release manifest must contain the expected asset inventory');
for (const [file, expected] of Object.entries(manifest)) {
  assert.match(expected, /^[a-f0-9]{64}$/i, file + ' must have a SHA-256 digest');
  assert.ok(fs.existsSync(file), 'manifest asset is missing: ' + file);
  assert.equal(sha256(read(file)), expected, file + ' does not match the service-worker manifest');
}

assert.match(health, /const EXPECTED_RELEASE = \(\(\) => \{[\s\S]{0,400}meta\[name="curioid-release"\]/,
  'Health Check must read its expected release from the active homepage');
assert.match(health, /service-worker-current\.js\?release=\$\{EXPECTED_RELEASE\}/,
  'Health Check must request the service worker using the shell release');
assert.doesNotMatch(health, /service-worker-current\.js\?release=v\d+/,
  'Health Check must not pin a service-worker release');
assert.match(worker, /searchParams\.set\('__curioid_release',\s*RELEASE_ID\)/,
  'service-worker navigation must be release-versioned');
assert.match(worker, /cache:\s*'no-store'/,
  'service-worker navigation must bypass the browser HTTP cache');

const core = read('projects-core.js');
const coreHash = sha256(core);
const coreSri = sha384(core);
const coreDescriptor = runtime.match(/file:\s*["']projects-core\.js["'][^}]*hash:\s*["']([a-f0-9]{64})["'][^}]*integrity:\s*["'](sha384-[^"']+)["']/i);
assert.ok(coreDescriptor, 'runtime must declare the shared project core');
assert.equal(coreDescriptor[1], coreHash, 'shared-core runtime SHA-256 is stale');
assert.equal(coreDescriptor[2], coreSri, 'shared-core runtime SRI is stale');
assert.equal(manifest['projects-core.js'], coreHash, 'shared-core worker hash is stale');

const style = read('projects-styles.css');
const styleHash = sha256(style);
const styleSri = sha384(style);
assert.equal(runtime.match(/const PROJECT_STYLES_SHA256\s*=\s*["']([a-f0-9]{64})["']/i)?.[1], styleHash,
  'project stylesheet loader SHA-256 is stale');
assert.equal(runtime.match(/const PROJECT_STYLES_SRI\s*=\s*["'](sha384-[^"']+)["']/i)?.[1], styleSri,
  'project stylesheet loader SRI is stale');
assert.equal(manifest['projects-styles.css'], styleHash, 'project stylesheet worker hash is stale');

const prefetch = runtime.match(/const SHARED_PREFETCH_ASSETS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\);/)?.[1] || '';
const prefetchCoreHash = prefetch.match(/file:\s*["']projects-core\.js["'][^}]*hash:\s*["']([a-f0-9]{64})["']/i)?.[1] || '';
const prefetchStyleHash = prefetch.match(/file:\s*["']projects-styles\.css["'][^}]*hash:\s*["']([a-f0-9]{64})["']/i)?.[1] || '';
assert.equal(prefetchCoreHash, coreHash, 'shared-core prefetch hash is stale');
assert.equal(prefetchStyleHash, styleHash, 'stylesheet prefetch hash is stale');

const categoryBlock = runtime.match(/const PROJECT_CATEGORY_ASSETS\s*=\s*Object\.freeze\((\{[\s\S]*?\})\);/)?.[1] || '';
const categoryPattern = /["']([^"']+)["']\s*:\s*\{\s*file:\s*["']([^"']+)["']\s*,\s*hash:\s*["']([a-f0-9]{64})["']\s*,\s*integrity:\s*["'](sha384-[^"']+)["']\s*\}/gi;
const categories = [...categoryBlock.matchAll(categoryPattern)];
assert.equal(categories.length, 7, 'runtime must contain seven parseable category asset descriptors');
for (const [, category, file, hash, integrity] of categories) {
  const bytes = read(file);
  assert.equal(sha256(bytes), hash, category + ' category SHA-256 is stale');
  assert.equal(sha384(bytes), integrity, category + ' category SRI is stale');
  assert.equal(manifest[file], hash, category + ' category descriptor differs from service-worker manifest');
}

const lexiconLoader = read('vocal-lexicon.js');
const lexiconText = lexiconLoader.toString('utf8');
const lexiconData = read('vocal-lexicon-data.json');
const lexiconDataHash = sha256(lexiconData);
const lexiconDataSri = sri('sha256', lexiconData);
assert.equal(sha256(lexiconLoader), manifest['vocal-lexicon.js'], 'Vocal Lexicon loader hash differs from service-worker manifest');
assert.equal(lexiconText.match(/const DATA_SHA256\s*=\s*['"]([a-f0-9]{64})['"]/i)?.[1], lexiconDataHash,
  'Vocal Lexicon JSON SHA-256 is stale');
assert.equal(lexiconText.match(/const DATA_SRI\s*=\s*['"](sha256-[^'"]+)['"]/i)?.[1], lexiconDataSri,
  'Vocal Lexicon JSON Fetch SRI is stale');
assert.equal(manifest['vocal-lexicon-data.json'], lexiconDataHash,
  'Vocal Lexicon JSON worker hash is stale');

const runtimeBytes = read('site-runtime-current.js');
const runtimeHash = sha256(runtimeBytes);
const runtimeSri = sha384(runtimeBytes);
assert.ok(index.includes('href="site-runtime-current.js?v=sha256-' + runtimeHash + '"'),
  'homepage runtime preload URL is stale');
assert.ok(index.includes('src="site-runtime-current.js?v=sha256-' + runtimeHash + '"'),
  'homepage runtime script URL is stale');
assert.ok(index.includes('integrity="' + runtimeSri + '"'),
  'homepage runtime SRI is stale');

const htmlFiles = fs.readdirSync('.').filter(file => file.endsWith('.html'));
for (const file of htmlFiles) {
  const source = readText(file);
  const pageRelease = source.match(/<meta[^>]+name="curioid-release"[^>]+content="(v\d+)"/)?.[1];
  if (pageRelease) assert.equal(pageRelease, release, file + ' release ID differs from service worker');
}

console.log('CURIOID release coherence passed: ' + release + ', ' +
  Object.keys(manifest).length + ' hashed assets, 7 category bundles, core/style SRI and Vocal Lexicon data all aligned.');
