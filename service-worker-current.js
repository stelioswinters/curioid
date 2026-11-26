/* CURIOID v1.334 offline shell. CDN-tolerant document validation; strict hashes for executable assets. */
'use strict';
const RELEASE_ID = 'v1.334';
const SCOPE_URL = new URL(self.registration.scope);
const CACHE_PREFIX = `curioid-shell:${encodeURIComponent(SCOPE_URL.pathname)}:`;
const CACHE_NAME = `${CACHE_PREFIX}${RELEASE_ID}`;
const LEGACY_CACHE_PATTERN = /^curioid-shell-v1\.\d+$/;
const EXPECTED_SHA256 = Object.freeze({
  "applications-tools-apps.html": "9ef7bfa06cfa6d4ae65bf9fc83b1ba6dfb5800adb5640630663c2c956b5658b1",
  "chroma-loom.html": "2e20261cad01a46b28e0e075faf33287b961a390fe242949c5a05377c077b979",
  "curioid-icon-192.png": "32799afd1249c7fdeac1ce46bc12f09a2dcbf9ed4fb104cd80664be64a99c887",
  "curioid-icon-512.png": "f5d307fcb59d1460bde3255c54ed57c281fd8e39cbbd82450250c6771a109086",
  "curioid-icon.svg": "d2a0e03abcf6fa43325036af29ff2762c8af2ed039082687e76ef9059f1cfd78",
  "curioids.html": "b3ce77bafb63cd0ea263125842b99974af4c94bbed545dc8dfa72c5613479738",
  "dark-looper-app.js": "cc2240fc2dd99051804782fc8291f97a69996ac19465f5c0c980a78969b96933",
  "glitchyard-app.js": "99ba8270c53352826b9cbdb88dda362d18601d06a4bab13503873349738152a7",
  "health-check.js": "6db03d6eb4572d563195c5bb2d24e44cc9cfb82d3af0dd257279e55567c234b8",
  "index.html": "37bbfa7781b9881a46b0b2322e232fcf6f627adf54893db316a27def126c74e6",
  "manifest.webmanifest": "578e2eaef7f5ab106f5887ee5edf810fa52468f128ceff691ba82967291e0eb1",
  "music-audio-apps.html": "e72db054a2fdc04a76ad5d8d0f7cdc6d68044542dd8ee6f74c91d457962c38ac",
  "projects-category-creative-tools.js": "0843d957f364080ccc9330219d8b00f2bcc95e8c00844b68b57e4b4936e2270b",
  "projects-category-digital-art.js": "e3f715aefbcf029ddcb08c2c93969a39e2c60ae01e1b27d524cd64428ad15538",
  "projects-category-operating-systems.js": "31a29489a59a423a931e82079912934a52d2e1904602cd1fbeabbc9f91c86703",
  "projects-category-sound-motion.js": "129173b387660f7bd81847c172d0ca34989bca88fe7d2504a618107e4b3a8e7a",
  "projects-category-strange-archives.js": "c436fc2d70528c6f969139ad5ca3d827395aef1161e30bdee10e58574f2ae00e",
  "projects-category-tiny-games.js": "8851ac598b44544de56eaf4d6984b88d5d0a4c0b16c8afe94c5d9389ccee18b1",
  "projects-category-web-experiments.js": "4967263cee2f5b952a7c1a611ca1b1b11e2207565af328cb2bd9f6dbd7b09ea8",
  "projects-core.js": "ec883c4a574ab72df936574d62860d96369f4a5013684c95bc2bfbb2d8a52dd0",
  "projects-styles.css": "4d30563c63090405a52e2d5e54bf10447de386f7dcfd2007a29814674c94767d",
  "robots.txt": "23877fe9514ab6e1c28495d254d75a56a96b79b0cf1e313102e0a74536c922d4",
  "site-runtime-current.js": "3aef8dc4a421c00ba3e5ce08ddee556fd54cfe263327af93c5746a28c5ce1b6f",
  "sitemap.xml": "e2635e23146209aa3ea5c9bb84e7edabd9ecca73a18c7f3c5ade6199153bf63a",
  "social-preview.png": "562537c5503eda0ce9958e11fad368fddc93a16475d49695e201df0d6b2f9809",
  "vanta-deck-app.js": "5e475347154c15b5cffc32961c939e87a8fe12256dc16931ef69ac6ee3197f02",
  "vocal-lexicon-data.json": "0a9c758a0ca06a83ca318d8bb38e8703518a5a4b705a449be45be0914bfeb5ee",
  "vocal-lexicon.js": "7d9f5ed6e4edbf0abd4251560c757f006ba3dd8a8ee3390b302a38382c587ab6",
});;;;;;;;
const RUNTIME_PATH = 'site-runtime-current.js';
const RUNTIME_HASH = EXPECTED_SHA256[RUNTIME_PATH];
const SHELL_PATHS = [
  'index.html',
  `${RUNTIME_PATH}?v=sha256-${RUNTIME_HASH}`,
  'manifest.webmanifest',
  'curioid-icon.svg',
  'curioid-icon-192.png',
  'curioid-icon-512.png'
];
const ON_DEMAND_CACHEABLE = new Set([
  'projects-core.js', 'projects-category-operating-systems.js', 'projects-category-strange-archives.js',
  'projects-category-web-experiments.js', 'projects-category-tiny-games.js', 'projects-category-digital-art.js',
  'projects-category-sound-motion.js', 'projects-category-creative-tools.js', 'projects-styles.css',
  'health-check.js', 'music-audio-apps.html', 'applications-tools-apps.html', 'vocal-lexicon.js', 'vocal-lexicon-data.json',
  'curioids.html', 'robots.txt', 'sitemap.xml', 'social-preview.png', 'chroma-loom.html', 'dark-looper-app.js', 'glitchyard-app.js', 'vanta-deck-app.js'
]);
const CACHEABLE_DOCUMENTS = new Set(['index.html', 'curioids.html', 'music-audio-apps.html', 'applications-tools-apps.html', 'chroma-loom.html']);
const STRICT_HASHED_ASSETS = new Set(Object.keys(EXPECTED_SHA256).filter(name => /\.js$/i.test(name) || name === 'projects-styles.css' || name === 'vocal-lexicon-data.json'));
const CACHEABLE = new Set([...SHELL_PATHS.map(path => relativePathFor(new URL(path, SCOPE_URL))).filter(Boolean), ...ON_DEMAND_CACHEABLE]);
const absolute = path => new URL(path || './', SCOPE_URL).href;
function relativePathFor(url) {
  const raw = url.pathname.slice(SCOPE_URL.pathname.length).replace(/^\/+/, '');
  if (/%(?:2f|5c)/i.test(raw)) return null;
  let decoded;
  try { decoded = decodeURIComponent(raw); } catch (_) { return null; }
  if (decoded.includes('\0') || decoded.includes('\\') || decoded.split('/').some(part => part === '.' || part === '..')) return null;
  return decoded;
}
async function responseMatchesRelease(path, response) {
  const expected = EXPECTED_SHA256[path];
  if (!expected || !self.crypto?.subtle || !response?.ok || typeof response.clone !== 'function') return false;
  try {
    const bytes = await response.clone().arrayBuffer();
    const digest = await self.crypto.subtle.digest('SHA-256', bytes);
    const actual = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
    return actual === expected;
  } catch (_) { return false; }
}
async function responseHasCurrentPageIdentity(response) {
  if (!response?.ok || !response.clone) return false;
  try {
    const html = await response.clone().text();
    const marker = new RegExp(`<meta\\s+name=[\"']curioid-release[\"']\\s+content=[\"']${RELEASE_ID.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\"']`, 'i').test(html);
    const runtime = html.includes(`site-runtime-current.js?v=sha256-${RUNTIME_HASH}`);
    return marker && runtime;
  } catch (_) { return false; }
}
async function responseLooksLikeImage(response, mime) {
  if (!response?.ok) return false;
  const type = response.headers.get('content-type') || '';
  if (!type.toLowerCase().includes(mime)) return false;
  try {
    const bytes = new Uint8Array(await response.clone().arrayBuffer());
    if (mime === 'image/png') return bytes.length > 24 && bytes.slice(0,8).join(',') === '137,80,78,71,13,10,26,10';
    return bytes.length > 64 && new TextDecoder().decode(bytes.slice(0,100)).includes('<svg');
  } catch (_) { return false; }
}
async function installShellIsValid(cache) {
  const page = await cache.match(absolute('index.html'));
  if (!await responseHasCurrentPageIdentity(page)) throw new Error('The homepage is missing the current release marker or runtime URL.');
  const runtimeRequest = new URL(SHELL_PATHS[1], SCOPE_URL);
  const runtime = await cache.match(runtimeRequest.href);
  if (!await responseMatchesRelease(RUNTIME_PATH, runtime)) throw new Error('The main runtime failed its exact release hash check.');
  const manifest = await cache.match(absolute('manifest.webmanifest'));
  if (!manifest?.ok) throw new Error('The PWA manifest could not be cached.');
  try { const parsed = await manifest.clone().json(); if (!parsed?.name || !parsed?.start_url) throw new Error('Manifest identity is incomplete.'); }
  catch (_) { throw new Error('The PWA manifest is not valid JSON.'); }
  if (!await responseLooksLikeImage(await cache.match(absolute('curioid-icon.svg')), 'image/svg+xml')) throw new Error('The SVG brand icon could not be cached.');
  if (!await responseLooksLikeImage(await cache.match(absolute('curioid-icon-192.png')), 'image/png')) throw new Error('The 192px PWA icon could not be cached.');
  if (!await responseLooksLikeImage(await cache.match(absolute('curioid-icon-512.png')), 'image/png')) throw new Error('The 512px PWA icon could not be cached.');
}
async function openCacheSafely() { try { return await caches.open(CACHE_NAME); } catch (_) { return null; } }
function safeScopedClient(client) {
  try { const url = new URL(client.url); return url.origin === SCOPE_URL.origin && url.pathname.startsWith(SCOPE_URL.pathname); }
  catch (_) { return false; }
}
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      await cache.addAll(SHELL_PATHS.map(path => absolute(path)));
      await installShellIsValid(cache);
    } catch (error) {
      try { await caches.delete(CACHE_NAME); } catch (_) {}
      throw error;
    }
    // Wait for explicit visitor approval; do not interrupt active editors.
  })());
});
const DIAGNOSTIC_PRECACHE_PATHS = Object.freeze([
  'projects-core.js', 'projects-styles.css', 'health-check.js',
  'projects-category-operating-systems.js', 'projects-category-strange-archives.js',
  'projects-category-web-experiments.js', 'projects-category-tiny-games.js',
  'projects-category-digital-art.js', 'projects-category-sound-motion.js',
  'projects-category-creative-tools.js', 'vocal-lexicon.js', 'vocal-lexicon-data.json', 'chroma-loom.html', 'dark-looper-app.js',
  'glitchyard-app.js', 'vanta-deck-app.js'
]);
function replyToMessage(event, data) {
  try { if (event.ports?.[0]) event.ports[0].postMessage(data); else event.source?.postMessage(data); } catch (_) {}
}
async function precacheCurrentReleaseAssets() {
  const cache = await caches.open(CACHE_NAME);
  const results = [];
  let cursor = 0;
  // Avoid three simultaneous multi-megabyte response clones/digests on low-RAM
  // phones. The browser still verifies every byte before it enters the cache;
  // this only controls how many independent downloads are in flight.
  const memoryGb = Number(self.navigator?.deviceMemory) || 0;
  const connection = self.navigator?.connection || null;
  const connectionType = String(connection?.effectiveType || '').toLowerCase();
  const limitedDevice = (memoryGb > 0 && memoryGb <= 2) || connection?.saveData || ['slow-2g', '2g'].includes(connectionType);
  const concurrency = limitedDevice ? 1 : 2;
  const worker = async () => {
    while (cursor < DIAGNOSTIC_PRECACHE_PATHS.length) {
      const file = DIAGNOSTIC_PRECACHE_PATHS[cursor++];
      const hash = EXPECTED_SHA256[file];
      if (!hash) { results.push({file,ok:false,error:'No SHA-256 release declaration exists.'}); continue; }
      const url = new URL(file, SCOPE_URL);
      url.searchParams.set('v', `sha256-${hash}`);
      try {
        const response = await fetch(new Request(url.href, {method:'GET', cache:'no-store', credentials:'same-origin'}));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (!await responseMatchesRelease(file, response)) throw new Error('Downloaded bytes did not match the current release SHA-256.');
        await cache.put(url.href, response.clone());
        results.push({file,ok:true,bytes:Number(response.headers.get('content-length'))||null});
      } catch (error) { results.push({file,ok:false,error:String(error?.message||error).slice(0,220)}); }
    }
  };
  await Promise.all(Array.from({length:Math.min(concurrency, DIAGNOSTIC_PRECACHE_PATHS.length)}, () => worker()));
  results.sort((a,b)=>DIAGNOSTIC_PRECACHE_PATHS.indexOf(a.file)-DIAGNOSTIC_PRECACHE_PATHS.indexOf(b.file));
  return {type:'CURIOID_PRECACHE_RESULT',release:RELEASE_ID,ok:results.length===DIAGNOSTIC_PRECACHE_PATHS.length&&results.every(item=>item.ok),cachedCount:results.filter(item=>item.ok).length,expectedCount:DIAGNOSTIC_PRECACHE_PATHS.length,concurrency,results};
}
self.addEventListener('message', event => {
  const type = event.data?.type;
  if (type === 'CURIOID_CLAIM_CONTROL') {
    event.waitUntil((async () => {
      try { await self.clients.claim(); replyToMessage(event,{type:'CURIOID_CONTROL_RESULT',release:RELEASE_ID,ok:true}); }
      catch (error) { replyToMessage(event,{type:'CURIOID_CONTROL_RESULT',release:RELEASE_ID,ok:false,error:String(error?.message||error)}); }
    })());
    return;
  }
  if (type === 'CURIOID_PRECACHE_CURRENT_RELEASE') {
    event.waitUntil((async () => {
      try { replyToMessage(event,await precacheCurrentReleaseAssets()); }
      catch (error) { replyToMessage(event,{type:'CURIOID_PRECACHE_RESULT',release:RELEASE_ID,ok:false,cachedCount:0,expectedCount:DIAGNOSTIC_PRECACHE_PATHS.length,results:[],error:String(error?.message||error).slice(0,220)}); }
    })());
    return;
  }
  if (type !== 'CURIOID_ACTIVATE_UPDATE') return;
  event.waitUntil((async () => {
    try {
      const clients = await self.clients.matchAll({type:'window', includeUncontrolled:true});
      const scoped = clients.filter(safeScopedClient);
      if (scoped.length > 1) { replyToMessage(event,{type:'CURIOID_UPDATE_BLOCKED', openTabs:scoped.length}); return; }
      await self.skipWaiting();
    } catch (_) { replyToMessage(event,{type:'CURIOID_UPDATE_BLOCKED', openTabs:null}); }
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    let keys = [];
    try { keys = await caches.keys(); } catch (_) { await self.clients.claim(); return; }
    const deletions = [];
    for (const key of keys) {
      if (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME) { deletions.push(caches.delete(key)); continue; }
      if (!LEGACY_CACHE_PATTERN.test(key)) continue;
      try {
        const legacy = await caches.open(key), entries = await legacy.keys();
        const belongs = entries.length > 0 && entries.every(entry => safeScopedClient({url:entry.url}));
        if (belongs) deletions.push(caches.delete(key));
      } catch (_) {}
    }
    await Promise.allSettled(deletions);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== SCOPE_URL.origin || !url.pathname.startsWith(SCOPE_URL.pathname)) return;
  const relativePath = relativePathFor(url);
  if (relativePath === null) return;
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith((async () => {
      const key = relativePath || 'index.html';
      const cache = await openCacheSafely();
      try {
        const response = await fetch(request);
        if (response?.ok && response.type === 'basic' && cache && CACHEABLE_DOCUMENTS.has(key)) {
          const valid = key === 'index.html' ? await responseHasCurrentPageIdentity(response) : true;
          if (valid) { try { await cache.put(absolute(key), response.clone()); } catch (_) {} }
        }
        return response;
      } catch (_) {
        if (cache) {
          try {
            const exact = await cache.match(absolute(key), {ignoreSearch:true});
            if (exact?.ok && (key !== 'index.html' || await responseHasCurrentPageIdentity(exact))) return exact;
            if (exact) await cache.delete(absolute(key));
            if (!key.includes('.') || key === 'index.html') {
              const shell = await cache.match(absolute('index.html'));
              if (shell && await responseHasCurrentPageIdentity(shell)) return shell;
            }
          } catch (_) {}
        }
        return new Response('CURIOID is offline and this document has not been cached for the current release.', {status:503, headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
      }
    })());
    return;
  }
  if (!CACHEABLE.has(relativePath)) return;
  event.respondWith((async () => {
    const cache = await openCacheSafely();
    const releaseQuery = /^sha256-[a-f0-9]{64}$/i.test(url.searchParams.get('v') || '');
    const cacheKey = releaseQuery ? request : absolute(relativePath);
    const strict = STRICT_HASHED_ASSETS.has(relativePath);
    if (cache) {
      try {
        const hit = await cache.match(cacheKey, {ignoreSearch: !releaseQuery});
        // Strict assets enter this release-scoped cache only after their bytes
        // pass responseMatchesRelease() on the network or in the explicit
        // integrity-checked precache action. The cache key is release-specific,
        // and the consuming page independently enforces SRI (or Fetch integrity
        // for the JSON lexicon). Re-hashing multi-megabyte cache hits on every
        // navigation would waste CPU and allocate another full response buffer.
        if (hit?.ok) return hit;
        if (hit) await cache.delete(cacheKey);
      } catch (_) {}
    }
    try {
      const response = await fetch(request);
      if (cache && response?.ok && response.type === 'basic') {
        const valid = !strict || await responseMatchesRelease(relativePath, response);
        if (valid) { try { await cache.put(cacheKey, response.clone()); } catch (_) {} }
      }
      return response;
    } catch (_) {
      return new Response('CURIOID is offline and this resource has not been cached for the current release.', {status:503, headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
    }
  })());
});
