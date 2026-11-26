/* CURIOID v1.343 offline shell. Exact release hashes for every cached deployment asset. */
'use strict';
const RELEASE_ID = 'v1.343';
const SCOPE_URL = new URL(self.registration.scope);
const CACHE_PREFIX = `curioid-shell:${encodeURIComponent(SCOPE_URL.pathname)}:`;
const CACHE_NAME = `${CACHE_PREFIX}${RELEASE_ID}`;
const LEGACY_CACHE_PATTERN = /^curioid-shell-v1\.\d+$/;
const EXPECTED_SHA256 = Object.freeze({
  "applications-tools-apps.html": "81a895888113c9d056c1d628efa722332355afd8e04b918e051fd5e48f9a3234",
  "chroma-loom.html": "fa02c8a891a610ce2da7a70dd4e8d9e84a99bf2e8ea1359d781a2f0b34ed7e8d",
  "curioid-icon-192.png": "32799afd1249c7fdeac1ce46bc12f09a2dcbf9ed4fb104cd80664be64a99c887",
  "curioid-icon-512.png": "f5d307fcb59d1460bde3255c54ed57c281fd8e39cbbd82450250c6771a109086",
  "curioid-icon.svg": "d2a0e03abcf6fa43325036af29ff2762c8af2ed039082687e76ef9059f1cfd78",
  "curioids.html": "df08280dca7c9509971f26917aba9607ac5460ed68c80e43a83e158f2e558e49",
  "dark-looper-app.js": "d5b1969d36162f8e019c618f67d56dba2ac2d034e3b6d1b91c1f9f11ce2656dd",
  "glitchyard-app.js": "cbfaf76e775e50aded370afd8f73fa38458915caf5686299fcf5cb61f987dfb9",
  "health-check.js": "776f6a2990571fa23f0c521a31fd04aa8c20928042297655912011bfabe08459",
  "index.html": "dd3ce7c7340bbf1d59f73d6e9a3104003edc77edaa8fbd875a15c51824b48f58",
  "manifest.webmanifest": "578e2eaef7f5ab106f5887ee5edf810fa52468f128ceff691ba82967291e0eb1",
  "music-audio-apps.html": "0711844de6cde112b5e7d8e60d303142351ce858f52a5d390e76aedded4b2e1e",
  "projects-category-creative-tools.js": "8f80d886542f8780bf429e9c15203fb23e10f779a06582ad38180a7007e58c90",
  "projects-category-digital-art.js": "94dc33499899b946a84e3efe86b95b7329e645001f8e7635c2c50bd89f635ec3",
  "projects-category-operating-systems.js": "75a8845a96abd4305b577a1b107fa24e024cb58ed497965d169656058955b946",
  "projects-category-sound-motion.js": "6bfbeeb6658f8909003c4c740019ae1e6668237709cf2c24649e4a95a358e58b",
  "projects-category-strange-archives.js": "87b1d3969eb06b591b02691ebb388749f83120492d110cfa54292b7d1f1d80d9",
  "projects-category-tiny-games.js": "8e36510e5f598b2246243c69ac879cdea642f2886bcf4b1fbe435d221777eb20",
  "projects-category-web-experiments.js": "497be3e77f20adadeb03025662be9d4871439b026b079d3546ee2c3c49fbd5fc",
  "projects-core.js": "3cff172090e97408435c2a8453ea67977ccbad7c4ece0be6f174dbb9322e3438",
  "projects-styles.css": "51ffb3aa7dfc0d6d80307d3c8cc9abdcdee0630bfe2a4a17e817adb22012531e",
  "robots.txt": "23877fe9514ab6e1c28495d254d75a56a96b79b0cf1e313102e0a74536c922d4",
  "site-runtime-current.js": "c12025b62d2348a35d3514fabf126590aba584f8d7cf36971623b876db8159a7",
  "sitemap.xml": "e2635e23146209aa3ea5c9bb84e7edabd9ecca73a18c7f3c5ade6199153bf63a",
  "social-preview.png": "562537c5503eda0ce9958e11fad368fddc93a16475d49695e201df0d6b2f9809",
  "vanta-deck-app.js": "47b25c2ec7e4d05028579eee4111d647817a3004ddb1092089df767276fd7705",
  "vocal-lexicon-data.json": "0a9c758a0ca06a83ca318d8bb38e8703518a5a4b705a449be45be0914bfeb5ee",
  "vocal-lexicon.js": "7d9f5ed6e4edbf0abd4251560c757f006ba3dd8a8ee3390b302a38382c587ab6",
});
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
const STRICT_HASHED_ASSETS = new Set(Object.keys(EXPECTED_SHA256));
const VERIFIED_CACHE_KEYS = new Set();
const PRECACHE_LAST_REQUEST = new Map();
let precachePromise = null;
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
  if (!await responseMatchesRelease('index.html', page) || !await responseHasCurrentPageIdentity(page)) throw new Error('The homepage failed its exact release hash, release marker or runtime URL check.');
  const runtimeRequest = new URL(SHELL_PATHS[1], SCOPE_URL);
  const runtime = await cache.match(runtimeRequest.href);
  if (!await responseMatchesRelease(RUNTIME_PATH, runtime)) throw new Error('The main runtime failed its exact release hash check.');
  const manifest = await cache.match(absolute('manifest.webmanifest'));
  if (!await responseMatchesRelease('manifest.webmanifest', manifest)) throw new Error('The PWA manifest failed its exact release hash check.');
  try { const parsed = await manifest.clone().json(); if (!parsed?.name || !parsed?.start_url) throw new Error('Manifest identity is incomplete.'); }
  catch (_) { throw new Error('The PWA manifest is not valid JSON.'); }
  const svgIcon = await cache.match(absolute('curioid-icon.svg'));
  const icon192 = await cache.match(absolute('curioid-icon-192.png'));
  const icon512 = await cache.match(absolute('curioid-icon-512.png'));
  if (!await responseMatchesRelease('curioid-icon.svg', svgIcon) || !await responseLooksLikeImage(svgIcon, 'image/svg+xml')) throw new Error('The SVG brand icon failed its release integrity check.');
  if (!await responseMatchesRelease('curioid-icon-192.png', icon192) || !await responseLooksLikeImage(icon192, 'image/png')) throw new Error('The 192px PWA icon failed its release integrity check.');
  if (!await responseMatchesRelease('curioid-icon-512.png', icon512) || !await responseLooksLikeImage(icon512, 'image/png')) throw new Error('The 512px PWA icon failed its release integrity check.');
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
  if (precachePromise) return precachePromise;
  precachePromise = (async () => {
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
  })();
  try { return await precachePromise; } finally { precachePromise = null; }
}
self.addEventListener('message', event => {
  if (!safeScopedClient(event.source)) return;
  const type = event.data?.type;
  if (type === 'CURIOID_CLAIM_CONTROL') {
    event.waitUntil((async () => {
      try { await self.clients.claim(); replyToMessage(event,{type:'CURIOID_CONTROL_RESULT',release:RELEASE_ID,ok:true}); }
      catch (error) { replyToMessage(event,{type:'CURIOID_CONTROL_RESULT',release:RELEASE_ID,ok:false,error:String(error?.message||error)}); }
    })());
    return;
  }
  if (type === 'CURIOID_PRECACHE_CURRENT_RELEASE') {
    if (!precachePromise) {
      const clientId = String(event.source.id || '');
      const now = Date.now();
      const last = PRECACHE_LAST_REQUEST.get(clientId) || 0;
      if (now - last < 3000) { replyToMessage(event,{type:'CURIOID_PRECACHE_RESULT',release:RELEASE_ID,ok:false,cachedCount:0,expectedCount:DIAGNOSTIC_PRECACHE_PATHS.length,results:[],error:'A release precache was run recently. Wait a few seconds before retrying.'}); return; }
      PRECACHE_LAST_REQUEST.set(clientId,now);
      if (PRECACHE_LAST_REQUEST.size > 64) { for (const [id,at] of PRECACHE_LAST_REQUEST) if (now-at > 60000) PRECACHE_LAST_REQUEST.delete(id); while (PRECACHE_LAST_REQUEST.size > 64) { const oldest = PRECACHE_LAST_REQUEST.keys().next().value; if (oldest === undefined) break; PRECACHE_LAST_REQUEST.delete(oldest); } }
    }
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
        if (response?.ok && response.type === 'basic' && CACHEABLE_DOCUMENTS.has(key)) {
          const hashValid = await responseMatchesRelease(key,response);
          const identityValid = key !== 'index.html' || await responseHasCurrentPageIdentity(response);
          if (!hashValid || !identityValid) return new Response('This CURIOID document failed its release integrity check. Refresh after the matching deployment is available.', {status:502,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
          if (cache) { try { await cache.put(absolute(key), response.clone()); } catch (_) {} }
        }
        return response;
      } catch (_) {
        if (cache) {
          try {
            const exact = await cache.match(absolute(key), {ignoreSearch:true});
            const documentValid = !CACHEABLE_DOCUMENTS.has(key) || (await responseMatchesRelease(key,exact) && (key !== 'index.html' || await responseHasCurrentPageIdentity(exact)));
            if (exact?.ok && documentValid) return exact;
            if (exact) await cache.delete(absolute(key));
            if (!key.includes('.') || key === 'index.html') {
              const shell = await cache.match(absolute('index.html'));
              if (shell && await responseMatchesRelease('index.html', shell) && await responseHasCurrentPageIdentity(shell)) return shell;
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
        // Verify each strict cache entry on its first use after this worker
        // starts. This detects corrupted or externally modified persistent cache
        // bytes without re-hashing multi-megabyte assets on every later request.
        const verifiedKey = cacheKey.url;
        if (hit?.ok && (!strict || VERIFIED_CACHE_KEYS.has(verifiedKey))) return hit;
        if (hit?.ok && strict && await responseMatchesRelease(relativePath, hit)) { VERIFIED_CACHE_KEYS.add(verifiedKey); return hit; }
        if (hit) { await cache.delete(cacheKey); VERIFIED_CACHE_KEYS.delete(verifiedKey); }
      } catch (_) {}
    }
    try {
      const response = await fetch(request);
      if (response?.ok && response.type === 'basic') {
        const valid = !strict || await responseMatchesRelease(relativePath, response);
        if (!valid && strict) return new Response('This CURIOID asset failed its release integrity check. Refresh after the matching deployment is available.', {status:502,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
        if (valid && cache) { try { await cache.put(cacheKey, response.clone()); if(strict)VERIFIED_CACHE_KEYS.add(cacheKey.url); } catch (_) {} }
      }
      return response;
    } catch (_) {
      return new Response('CURIOID is offline and this resource has not been cached for the current release.', {status:503, headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
    }
  })());
});
