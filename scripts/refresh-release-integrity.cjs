'use strict';
// CURIOID release builder.
// The version shown in the very bottom site footer is the only editable
// release-version source. This script propagates it to every generated marker,
// updates all SHA-256/SHA-384 integrity references, and refreshes the offline
// cache manifest. Run from the repository root with Node.js 20+.
const fs = require('node:fs');
const crypto = require('node:crypto');

const read = name => fs.readFileSync(name);
const readText = name => fs.readFileSync(name, 'utf8');
const hash = (algorithm, bytes, encoding = 'hex') => crypto.createHash(algorithm).update(bytes).digest(encoding);
const sha256 = bytes => hash('sha256', bytes);
const sha384 = bytes => 'sha384-' + hash('sha384', bytes, 'base64');
const writeIfChanged = (name, value) => {
  const next = Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8');
  if (fs.existsSync(name) && read(name).equals(next)) return false;
  fs.writeFileSync(name, next);
  return true;
};
const replaceRequired = (source, pattern, replacement, label) => {
  if (!pattern.test(source)) throw new Error('Could not locate ' + label);
  return source.replace(pattern, replacement);
};

const htmlFiles = fs.readdirSync('.').filter(name => name.endsWith('.html')).sort();
const html = new Map(htmlFiles.map(name => [name, readText(name)]));
if (!html.has('index.html')) throw new Error('index.html is missing from the release.');

const indexOriginal = html.get('index.html');
const footerMatches = [...indexOriginal.matchAll(/<small class="site-version">(v\d+\.\d+)<\/small>/g)];
if (footerMatches.length !== 1) {
  throw new Error('Expected exactly one bottom-footer site version. Found ' + footerMatches.length + '.');
}
const release = footerMatches[0][1];
if (!/^v\d+\.\d+$/.test(release)) throw new Error('Invalid footer release version: ' + release);
const projectCountMatch = indexOriginal.match(/<meta name="curioid-project-count" content="(\d+)"/);
if (!projectCountMatch) throw new Error('index.html is missing its project-count metadata.');
const projectCount = Number(projectCountMatch[1]);

let health = readText('health-check.js');
health = replaceRequired(
  health,
  /^\/\* CURIOID v\d+\.\d+ lazy Health Check module\./m,
  '/* CURIOID ' + release + ' lazy Health Check module.',
  'Health Check release comment'
);
health = replaceRequired(
  health,
  /const EXPECTED_RELEASE = 'v\d+\.\d+';/,
  "const EXPECTED_RELEASE = '" + release + "';",
  'Health Check expected release'
);
const oldWorkerProbeUrl = /new URL\(['"]service-worker-current\.js\?release=v\d+\.\d+['"],\s*deploymentBase\)/;
const currentWorkerProbeUrl = /new URL\(['"]service-worker-current\.js\?release=['"]\s*\+\s*EXPECTED_RELEASE\s*,\s*deploymentBase\)/;
if (oldWorkerProbeUrl.test(health)) {
  health = health.replace(
    oldWorkerProbeUrl,
    "new URL('service-worker-current.js?release=' + EXPECTED_RELEASE, deploymentBase)"
  );
} else if (!currentWorkerProbeUrl.test(health)) {
  throw new Error('Could not locate a valid Health Check worker probe URL.');
}
if (/service-worker-current\.js\?release=v\d+\.\d+/.test(health)) {
  throw new Error('Health Check still contains a hard-coded service-worker release URL.');
}

let manifest = JSON.parse(readText('manifest.webmanifest'));
if (typeof manifest.description !== 'string' ||
    !/\b\d+\s+browser-native project windows\b/i.test(manifest.description)) {
  throw new Error('PWA manifest description is missing its browser project count.');
}
manifest.description = manifest.description.replace(
  /\b\d+\s+browser-native project windows\b/i,
  projectCount + ' browser-native project windows'
);
const manifestText = JSON.stringify(manifest, null, 2) + '\n';

for (const [file, source] of html) {
  const marker = /<meta[^>]+name="curioid-release"[^>]+content="v\d+\.\d+"/;
  if (!marker.test(source)) throw new Error(file + ' is missing its CURIOID release marker.');
  html.set(file, source.replace(
    /(<meta[^>]+name="curioid-release"[^>]+content=")v\d+\.\d+(")/,
    '$1' + release + '$2'
  ));
}

let runtime = readText('site-runtime-current.js');
const runtimeVersionMatches = [...runtime.matchAll(/v\d+\.\d+/g)];
if (!runtimeVersionMatches.length) throw new Error('No embedded service-worker release references found in the site runtime.');
runtime = runtime.replace(/v\d+\.\d+/g, release);

function syncRuntimeConstant(hashName, sriName, file, bytes) {
  const nextHash = sha256(bytes);
  const nextSri = sha384(bytes);
  const hashPattern = new RegExp('(const ' + hashName + " = ')[a-f0-9]{64}(';)");
  const sriPattern = new RegExp('(const ' + sriName + " = ')sha384-[^']+(';)");
  if (!hashPattern.test(runtime) || !sriPattern.test(runtime)) {
    throw new Error('Missing runtime integrity constants for ' + file);
  }
  runtime = runtime.replace(hashPattern, '$1' + nextHash + '$2');
  runtime = runtime.replace(sriPattern, '$1' + nextSri + '$2');
}
syncRuntimeConstant('HEALTH_MODULE_HASH', 'HEALTH_MODULE_SRI', 'health-check.js', Buffer.from(health));
syncRuntimeConstant('PROJECT_STYLES_SHA256', 'PROJECT_STYLES_SRI', 'projects-styles.css', read('projects-styles.css'));

const coreHash = sha256(read('projects-core.js'));
const coreSri = sha384(read('projects-core.js'));
const corePattern = /(file: "projects-core\.js", hash: ")[a-f0-9]{64}(", integrity: ")sha384-[^"]+(")/;
if (!corePattern.test(runtime)) throw new Error('Could not locate projects-core.js integrity descriptor.');
runtime = runtime.replace(corePattern, '$1' + coreHash + '$2' + coreSri + '$3');

const modulePattern = /"([^"]+)": \{ file: "([^"]+\.js)", hash: "([a-f0-9]{64})", integrity: "(sha384-[A-Za-z0-9+/=]+)" \}/g;
let moduleCount = 0;
runtime = runtime.replace(modulePattern, (whole, key, file) => {
  if (!fs.existsSync(file)) throw new Error('Missing category bundle: ' + file);
  const bytes = read(file);
  moduleCount++;
  return '"' + key + '": { file: "' + file + '", hash: "' + sha256(bytes) + '", integrity: "' + sha384(bytes) + '" }';
});
if (moduleCount !== 7) throw new Error('Expected 7 category integrity entries, found ' + moduleCount + '.');

function inspectHtmlAssetTags(source, runtimeBytes) {
  return source.replace(/<(?:script|link)\b[^>]*>/gi, tag => {
    const attribute = /^<script\b/i.test(tag) ? 'src' : 'href';
    const match = tag.match(new RegExp('\\b' + attribute + '="([^"]+)"'));
    if (!match) return tag;
    const url = match[1];
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(url)) return tag;
    const file = url.split(/[?#]/)[0];
    if (!file || !fs.existsSync(file)) return tag;
    const bytes = file === 'site-runtime-current.js' ? runtimeBytes
      : file === 'health-check.js' ? Buffer.from(health)
      : file === 'manifest.webmanifest' ? Buffer.from(manifestText)
      : read(file);
    const nextHash = sha256(bytes);
    const nextSri = sha384(bytes);
    const oldSri = tag.match(/\bintegrity="(sha384-[^"]+)"/)?.[1];
    const hasVersionHash = /[?&]v=sha256-[a-f0-9]{64}/.test(url);
    let nextTag = tag;
    if (hasVersionHash) {
      nextTag = nextTag.replace(new RegExp('(' + attribute + '="[^"]*[?&]v=sha256-)[a-f0-9]{64}'), '$1' + nextHash);
    }
    if (oldSri) nextTag = nextTag.replace(/(\bintegrity=")sha384-[^"]+/, '$1' + nextSri);
    return nextTag;
  });
}
const runtimeBytes = Buffer.from(runtime);
for (const [file, source] of html) html.set(file, inspectHtmlAssetTags(source, runtimeBytes));

const indexFinal = html.get('index.html');
const preloadTag = indexFinal.match(/<link[^>]+href="site-runtime-current\.js\?v=sha256-[^"]+"[^>]+integrity="(sha384-[^"]+)"/);
const scriptTag = indexFinal.match(/<script[^>]+src="site-runtime-current\.js\?v=sha256-[^"]+"[^>]+integrity="(sha384-[^"]+)"/);
if (!preloadTag || !scriptTag || preloadTag[1] !== sha384(runtimeBytes) || scriptTag[1] !== sha384(runtimeBytes)) {
  throw new Error('Runtime preload and executable script SHA-384 references are not aligned.');
}
const runtimeHash = sha256(runtimeBytes);
if (!indexFinal.includes('site-runtime-current.js?v=sha256-' + runtimeHash)) {
  throw new Error('index.html does not point to the final site runtime hash.');
}

let worker = readText('service-worker-current.js');
const expectedMatch = worker.match(/const EXPECTED_SHA256 = Object\.freeze\(\{([\s\S]*?)\n\}\);/);
if (!expectedMatch) throw new Error('Could not locate service-worker integrity table.');
const expectedEntries = [...expectedMatch[1].matchAll(/"([^"]+)": "([a-f0-9]{64})"/g)];
if (expectedEntries.length < 20) throw new Error('Service-worker integrity table looks incomplete.');
const finalBytes = new Map([
  ...[...html].map(([file, source]) => [file, Buffer.from(source)]),
  ['health-check.js', Buffer.from(health)],
  ['manifest.webmanifest', Buffer.from(manifestText)],
  ['site-runtime-current.js', runtimeBytes]
]);
const updatedExpected = expectedMatch[1].replace(/("([^"]+)": ")[a-f0-9]{64}(")/g, (whole, prefix, file, suffix) => {
  if (!finalBytes.has(file) && !fs.existsSync(file)) throw new Error('Missing cached asset during hash refresh: ' + file);
  const bytes = finalBytes.get(file) || read(file);
  return prefix + sha256(bytes) + suffix;
});
worker = worker.replace(expectedMatch[1], updatedExpected);
worker = replaceRequired(
  worker,
  /const RELEASE_ID = 'v\d+\.\d+';/,
  "const RELEASE_ID = '" + release + "';",
  'service-worker release ID'
);
worker = worker.replace(/CURIOID v\d+\.\d+ offline shell/, 'CURIOID ' + release + ' offline shell');

const workerRelease = worker.match(/const RELEASE_ID = '(v\d+\.\d+)';/)?.[1];
if (workerRelease !== release) throw new Error('Service-worker release ID does not match the footer.');
for (const [file, source] of html) {
  const marker = source.match(/<meta[^>]+name="curioid-release"[^>]+content="(v\d+\.\d+)"/)?.[1];
  if (marker !== release) throw new Error(file + ' release marker does not match the footer.');
}
if (!health.includes("const EXPECTED_RELEASE = '" + release + "';")) {
  throw new Error('Health Check release does not match the footer.');
}

let writes = 0;
for (const [file, source] of html) if (writeIfChanged(file, source)) writes++;
if (writeIfChanged('health-check.js', health)) writes++;
if (writeIfChanged('manifest.webmanifest', manifestText)) writes++;
if (writeIfChanged('site-runtime-current.js', runtime)) writes++;
if (writeIfChanged('service-worker-current.js', worker)) writes++;

console.log(
  writes
    ? 'CURIOID release build synchronized from footer ' + release + '; updated ' + writes + ' generated files, ' + moduleCount + ' category bundles and ' + expectedEntries.length + ' offline asset hashes.'
    : 'CURIOID release build is already synchronized with footer ' + release + '; no changes needed.'
);
