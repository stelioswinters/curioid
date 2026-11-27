/* CURIOID v1.352 offline shell. Exact release hashes for every cached deployment asset. */
'use strict';
const RELEASE_ID = 'v1.352';
const SCOPE_URL = new URL(self.registration.scope);
const CACHE_PREFIX = `curioid-shell:${encodeURIComponent(SCOPE_URL.pathname)}:`;
const CACHE_NAME = `${CACHE_PREFIX}${RELEASE_ID}`;
const LEGACY_CACHE_PATTERN = /^curioid-shell-v1\.\d+$/;
const EXPECTED_SHA256 = Object.freeze({
  "applications-tools-apps.html": "79bea13ed7d1b18f18f04e83c837b6750763dc46ea9b83be958bc0bad37f4fc7",
  "chroma-loom.html": "dc4724acb89c6679b66b7ebb543a901f6a827d124c1c61ba31650efcb236d8b6",
  "curioid-icon-192.png": "32799afd1249c7fdeac1ce46bc12f09a2dcbf9ed4fb104cd80664be64a99c887",
  "curioid-icon-512.png": "f5d307fcb59d1460bde3255c54ed57c281fd8e39cbbd82450250c6771a109086",
  "curioid-icon.svg": "d2a0e03abcf6fa43325036af29ff2762c8af2ed039082687e76ef9059f1cfd78",
  "curioids.html": "028b29a74650f5a35274619ce482f2a847653b7ba482de802942e281df5b407d",
  "dark-looper-app.js": "470251adba5b3f82c4c768b561fdc7490d4f9accda867a2fd7a8282761cd85a5",
  "glitchyard-app.js": "cbfaf76e775e50aded370afd8f73fa38458915caf5686299fcf5cb61f987dfb9",
  "health-check.js": "cc42adc57d6a1a6b848b457b2c793aeea7e87f226277e3bb6e7908b286f6794c",
  "index.html": "436850b05f671e62647690963e6456f4711abf733f13d481a683545177b2e54a",
  "manifest.webmanifest": "578e2eaef7f5ab106f5887ee5edf810fa52468f128ceff691ba82967291e0eb1",
  "music-audio-apps.html": "a97848ea240b68fb57a877af312df885e48576009072d3338f4cd694a8f8a321",
  "projects-category-creative-tools.js": "8f80d886542f8780bf429e9c15203fb23e10f779a06582ad38180a7007e58c90",
  "projects-category-digital-art.js": "94dc33499899b946a84e3efe86b95b7329e645001f8e7635c2c50bd89f635ec3",
  "projects-category-operating-systems.js": "75a8845a96abd4305b577a1b107fa24e024cb58ed497965d169656058955b946",
  "projects-category-sound-motion.js": "e6b3a0c1463a0b2ca758f94627988988e25b4f1012dc5561cd87c7f54bdba568",
  "projects-category-strange-archives.js": "87b1d3969eb06b591b02691ebb388749f83120492d110cfa54292b7d1f1d80d9",
  "projects-category-tiny-games.js": "fcec73cfca4acae789de6a070e0770be426e3a94e2375a7a89a64408e48dfe26",
  "projects-category-web-experiments.js": "4b309dbfd4ab439c3954de04b56570bfaa2bc6fa72aff88547079ec8f739f71b",
  "projects-core.js": "af961b333e3633aab2bc7aecf2551a87aab9de222c9c056f7f21bf83a15fdf6f",
  "projects-styles.css": "b0fe98f57d22d20206f174d71fe883a96dca51c817b837bfe8ac925f6f13864d",
  "robots.txt": "23877fe9514ab6e1c28495d254d75a56a96b79b0cf1e313102e0a74536c922d4",
  "site-runtime-current.js": "5f14b65c8d85bb6de3ead902dca2e3324e816651ae35a8bd43a4c59070839815",
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
// HTML is checked by its release/document/CSP identity, not its raw bytes.
// CDNs may rewrite document bytes while preserving the deployed page contract.
const STRICT_HASHED_ASSETS = new Set(Object.keys(EXPECTED_SHA256).filter(path => !CACHEABLE_DOCUMENTS.has(path)));
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
async function responseHasCurrentPageIdentity(response, path = 'index.html') {
  if (!response?.ok || !response.clone || typeof path !== 'string' || !CACHEABLE_DOCUMENTS.has(path)) return false;
  try {
    const html = await response.clone().text();
    const tags = html.match(/<meta\b[^>]*>/gi) || [];
    const metaValue = (tag, name) => tag.match(new RegExp('\\b' + name + '\\s*=\\s*["\']([^"\']+)["\']', 'i'))?.[1] || '';
    const marker = tags.some(tag => metaValue(tag, 'name') === 'curioid-release' && metaValue(tag, 'content') === RELEASE_ID);
    const documentMarker = tags.some(tag => metaValue(tag, 'name') === 'curioid-document' && metaValue(tag, 'content') === path);
    const hasPolicy = tags.some(tag => /\bhttp-equiv\s*=\s*["']Content-Security-Policy["']/i.test(tag));
    const runtimeMatches = path !== 'index.html' || html.includes('site-runtime-current.js?v=sha256-' + RUNTIME_HASH);
    return marker && documentMarker && hasPolicy && runtimeMatches;
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
  // Cloudflare may transform HTML at the edge, so its byte hash is not a stable deployment identity.
  // The release marker and exact SRI-versioned runtime URL identify the current shell instead.
  if (!await responseHasCurrentPageIdentity(page, 'index.html')) throw new Error('The homepage failed its release marker, document identity or runtime URL check.');
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
        const validDocument = CACHEABLE_DOCUMENTS.has(file)
          ? await responseHasCurrentPageIdentity(response,file)
          : await responseMatchesRelease(file,response);
        if (!validDocument) throw new Error(CACHEABLE_DOCUMENTS.has(file)
          ? 'Downloaded HTML did not match the current release/document identity.'
          : 'Downloaded bytes did not match the current release SHA-256.');
        await cache.put(CACHEABLE_DOCUMENTS.has(file) ? absolute(file) : url.href, response.clone());
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
          // HTML may be rewritten by the CDN even when it is the correct live
          // document. Do not turn a successful origin response into a synthetic
          // 502: identity is required only before storing it for offline use.
          const documentValid = await responseHasCurrentPageIdentity(response,key);
          if (cache && documentValid) { try { await cache.put(absolute(key), response.clone()); } catch (_) {} }
        }
        return response;
      } catch (_) {
        if (cache) {
          try {
            const exact = await cache.match(absolute(key), {ignoreSearch:true});
            const documentValid = !CACHEABLE_DOCUMENTS.has(key) || await responseHasCurrentPageIdentity(exact,key);
            if (exact?.ok && documentValid) return exact;
            if (exact) await cache.delete(absolute(key));
            if (!key.includes('.') || key === 'index.html') {
              const shell = await cache.match(absolute('index.html'));
              if (shell && await responseHasCurrentPageIdentity(shell,'index.html')) return shell;
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
    const documentRequest = CACHEABLE_DOCUMENTS.has(relativePath);
    // Versioned HTML requests share the same identity-checked cache entry as
    // normal navigation. A query-string SHA-256 is not a valid HTML byte check
    // because edge/CDN transformations can legitimately change document bytes.
    const cacheKey = documentRequest ? absolute(relativePath) : (releaseQuery ? request : absolute(relativePath));
    const strict = STRICT_HASHED_ASSETS.has(relativePath);
    const readCurrentDocumentCache = async () => {
      if (!cache || !documentRequest) return null;
      try {
        const cached = await cache.match(absolute(relativePath));
        if (cached?.ok && await responseHasCurrentPageIdentity(cached, relativePath)) return cached;
        if (cached) await cache.delete(absolute(relativePath));
      } catch (_) {}
      return null;
    };
    if (cache) {
      try {
        const hit = await cache.match(cacheKey, {ignoreSearch: !documentRequest && !releaseQuery});
        // Documents use their release marker, document identity and CSP contract.
        if (hit?.ok && documentRequest && await responseHasCurrentPageIdentity(hit, relativePath)) return hit;
        // Hashed non-document assets are verified once per worker lifetime.
        const verifiedKey = cacheKey.url || String(cacheKey);
        if (hit?.ok && !documentRequest && (!strict || VERIFIED_CACHE_KEYS.has(verifiedKey))) return hit;
        if (hit?.ok && !documentRequest && strict && await responseMatchesRelease(relativePath, hit)) {
          VERIFIED_CACHE_KEYS.add(verifiedKey);
          return hit;
        }
        if (hit) { await cache.delete(cacheKey); VERIFIED_CACHE_KEYS.delete(verifiedKey); }
      } catch (_) {}
    }
    try {
      const response = await fetch(request);
      if (response?.ok && response.type === 'basic') {
        const valid = documentRequest
          ? await responseHasCurrentPageIdentity(response, relativePath)
          : !strict || await responseMatchesRelease(relativePath, response);
        if (!valid && strict && !documentRequest) return new Response('This CURIOID asset failed its release integrity check. Refresh after the matching deployment is available.', {status:502,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
        if (valid && cache) {
          try { await cache.put(cacheKey, response.clone()); if(strict)VERIFIED_CACHE_KEYS.add(cacheKey.url || String(cacheKey)); } catch (_) {}
        }
      } else if (documentRequest) {
        const cached = await readCurrentDocumentCache();
        if (cached) return cached;
      }
      return response;
    } catch (_) {
      if (documentRequest) {
        const cached = await readCurrentDocumentCache();
        if (cached) return cached;
      }
      return new Response('CURIOID is offline and this resource has not been cached for the current release.', {status:503, headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
    }
  })());
});
