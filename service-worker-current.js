/* CURIOID v1.396 offline shell. Exact release hashes for every cached deployment asset. */
'use strict';
const RELEASE_ID = 'v1.396';
const SCOPE_URL = new URL(self.registration.scope);
const CACHE_PREFIX = `curioid-shell:${encodeURIComponent(SCOPE_URL.pathname)}:`;
const CACHE_NAME = `${CACHE_PREFIX}${RELEASE_ID}`;
const LEGACY_CACHE_PATTERN = /^curioid-shell-v1\.\d+$/;
const EXPECTED_SHA256 = Object.freeze({
  "applications-tools-apps.html": "7af21644b4ebcfddfde6eac434c23c247a031b0b95e8ffd09f4e871dd31097fe",
  "chroma-loom.html": "5037134eaf6c6f17e6ab02068ffabfe5abd5a6f916712780c23f166891073bf3",
  "curioid-icon-192.png": "32799afd1249c7fdeac1ce46bc12f09a2dcbf9ed4fb104cd80664be64a99c887",
  "curioid-icon-512.png": "f5d307fcb59d1460bde3255c54ed57c281fd8e39cbbd82450250c6771a109086",
  "curioid-icon.svg": "d2a0e03abcf6fa43325036af29ff2762c8af2ed039082687e76ef9059f1cfd78",
  "curioids.html": "50abcdcec2fc430e39f45489ecc06452924b169d8db1939ee3baad2cf3660460",
  "doors98-v86-frame.html": "104a728fc30dcebda6c0612514eccb34fdd7ba6ea337e545d31dd233227f16e7",
  "dark-looper-app.js": "470251adba5b3f82c4c768b561fdc7490d4f9accda867a2fd7a8282761cd85a5",
  "glitchyard-app.js": "48a243aa8e9c728fe82277f42c3666484068b9bbe1b1c96b1ba6ccac7364ca78",
  "health-check.js": "7657c4d56ade162bf99d178e970bc23fb3485ca2c6afd57988b587006a7e86ae",
  "index.html": "8fa441d4ca5a20777d85a9b73b6f7c1a9cc61335d1a4432533c8477ed89f8588",
  "manifest.webmanifest": "e08236505cfa80a962c1f87ee931764aa3eb7891f9345f21ceccecaf4af7afa0",
  "music-audio-apps.html": "55f6bf7b4eeaf7386389b366fab7c0e77141de2356d404c7c4086807c793855a",
  "projects-category-creative-tools.js": "a3d06ab68123db9fa422f776ea9a76741b61ed97d9a2c23323faaf6176b64fa6",
  "projects-category-digital-art.js": "ad88cbd1d6488934587117c7b47f64bc55ac2ad2b5fd74e9d50c4b0b9b898738",
  "projects-category-operating-systems.js": "70d861f8b72c45412e09c416ecf6bf21d9c1507e3f4e8489a70d9e2bcc2e57a1",
  "projects-category-sound-motion.js": "15148a302d597237747a14c493574975cd79da87133714e0f998853baceda2a7",
  "projects-category-strange-archives.js": "23a87a7fc7e8e2e82611070415a5cfc2760078b6a64ecd977318e1f93f2aa664",
  "projects-category-tiny-games.js": "2a4e5a029ec6e7d66c1462bc74bf68ef4a0936499f64d19164a135708b9c7981",
  "projects-category-web-experiments.js": "d9d30ce2e5c31e81af0fabe07f75e008433c45fbca17011eda24b3f670acbe3c",
  "projects-core.js": "4e06b0c4021c6c930036397ad4462052af8ebd6dc22d55050180271c1e898632",
  "projects-styles.css": "3a9a3fed38b892f93c211ad39334435030152f10903b8ec5fdd4a0f26f4470e2",
  "robots.txt": "23877fe9514ab6e1c28495d254d75a56a96b79b0cf1e313102e0a74536c922d4",
  "site-runtime-current.js": "7023287a608f9f595cfa703f9ee69832b53362b045f0178e9a5b1f81f336a94a",
  "sitemap.xml": "f8f04693a025774482ea129c14d24741b83584deb3a69f75f29fb0b8dddb15f3",
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
  'curioids.html', 'doors98-v86-frame.html', 'robots.txt', 'sitemap.xml', 'social-preview.png', 'chroma-loom.html', 'dark-looper-app.js', 'glitchyard-app.js', 'vanta-deck-app.js'
]);
const CACHEABLE_DOCUMENTS = new Set(['index.html', 'curioids.html', 'music-audio-apps.html', 'applications-tools-apps.html', 'chroma-loom.html', 'doors98-v86-frame.html']);
// HTML is checked by its release/document/CSP identity, not its raw bytes.
// CDNs may rewrite document bytes while preserving the deployed page contract.
const STRICT_HASHED_ASSETS = new Set(Object.keys(EXPECTED_SHA256).filter(path => !CACHEABLE_DOCUMENTS.has(path)));
const VERIFIED_CACHE_KEYS = new Set();
const PRECACHE_LAST_REQUEST = new Map();
const MAX_DIAGNOSTIC_ASSET_BYTES = 4 * 1024 * 1024;
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
function textHasCurrentPageIdentity(html, path = 'index.html') {
  if (typeof html !== 'string' || typeof path !== 'string' || !CACHEABLE_DOCUMENTS.has(path)) return false;
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  const metaValue = (tag, name) => tag.match(new RegExp('\\b' + name + '\\s*=\\s*["\']([^"\']+)["\']', 'i'))?.[1] || '';
  const marker = tags.some(tag => metaValue(tag, 'name') === 'curioid-release' && metaValue(tag, 'content') === RELEASE_ID);
  const documentMarker = tags.some(tag => metaValue(tag, 'name') === 'curioid-document' && metaValue(tag, 'content') === path);
  const hasPolicy = tags.some(tag => /\bhttp-equiv\s*=\s*["']Content-Security-Policy["']/i.test(tag));
  const runtimeMatches = path !== 'index.html' || html.includes('site-runtime-current.js?v=sha256-' + RUNTIME_HASH);
  return marker && documentMarker && hasPolicy && runtimeMatches;
}
async function responseHasCurrentPageIdentity(response, path = 'index.html') {
  if (!response?.ok || !response.clone || typeof path !== 'string' || !CACHEABLE_DOCUMENTS.has(path)) return false;
  try { return textHasCurrentPageIdentity(await response.clone().text(), path); }
  catch (_) { return false; }
}
async function verifiedPrecacheResponse(path, response) {
  if (!response?.ok || !response.body?.getReader || !self.crypto?.subtle) return null;
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_DIAGNOSTIC_ASSET_BYTES) return null;
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      const chunk = part.value instanceof Uint8Array ? part.value : new Uint8Array(part.value);
      total += chunk.byteLength;
      if (total > MAX_DIAGNOSTIC_ASSET_BYTES) {
        try { await reader.cancel('Diagnostic asset exceeded its byte limit.'); } catch (_) {}
        return null;
      }
      chunks.push(chunk);
    }
  } catch (_) {
    try { await reader.cancel('Diagnostic asset stream failed.'); } catch (_) {}
    return null;
  } finally { try { reader.releaseLock(); } catch (_) {} }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let valid = false;
  if (CACHEABLE_DOCUMENTS.has(path)) {
    valid = textHasCurrentPageIdentity(new TextDecoder().decode(bytes), path);
  } else {
    const expected = EXPECTED_SHA256[path];
    if (!expected) return null;
    try {
      const digest = await self.crypto.subtle.digest('SHA-256', bytes);
      const actual = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
      valid = actual === expected;
    } catch (_) { return null; }
  }
  if (!valid) return null;
  // The downloaded body is consumed exactly once, then reconstructed from
  // the verified bounded byte buffer for Cache Storage. This avoids cloning
  // a streamed Response after a clone branch has been consumed by a digest.
  return new Response(bytes, {status:response.status,statusText:response.statusText,headers:response.headers});
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
function responseBelongsToScope(response, requestUrl) {
  if (!response?.ok || response.type !== 'basic') return false;
  try {
    const finalUrl = new URL(response.url || requestUrl);
    return finalUrl.origin === SCOPE_URL.origin && finalUrl.pathname.startsWith(SCOPE_URL.pathname);
  } catch (_) { return false; }
}
async function openCacheSafely() { try { return await caches.open(CACHE_NAME); } catch (_) { return null; } }
function safeScopedClient(client) {
  try { const url = new URL(client.url); return url.origin === SCOPE_URL.origin && url.pathname.startsWith(SCOPE_URL.pathname); }
  catch (_) { return false; }
}
async function installCurrentShell(cache) {
  // Bypass the browser's HTTP cache during an update. A previous release can
  // otherwise be returned for a stable URL even though a new worker is being
  // installed. Validate every response before placing it in Cache Storage.
  for (const shellPath of SHELL_PATHS) {
    const url = absolute(shellPath);
    const response = await fetch(new Request(url, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin'
    }));
    if (!responseBelongsToScope(response, url)) {
      throw new Error(`The current release shell request failed or escaped its deployment scope: ${shellPath}`);
    }
    const file = relativePathFor(new URL(url));
    const valid = file === 'index.html'
      ? await responseHasCurrentPageIdentity(response, file)
      : await responseMatchesRelease(file, response);
    if (!valid) throw new Error(`The current release shell failed identity/integrity validation: ${shellPath}`);
    await cache.put(url, response.clone());
  }
  await installShellIsValid(cache);
}
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      await installCurrentShell(cache);
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
  'projects-category-creative-tools.js', 'vocal-lexicon.js', 'vocal-lexicon-data.json', 'chroma-loom.html', 'doors98-v86-frame.html', 'dark-looper-app.js',
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
        if (!responseBelongsToScope(response, url.href)) throw new Error('The asset request failed or redirected outside the current deployment scope.');
        const cachedResponse = await verifiedPrecacheResponse(file,response);
        if (!cachedResponse) throw new Error('Downloaded bytes exceeded the bounded precache budget or failed release identity/SHA-256 verification.');
        await cache.put(CACHEABLE_DOCUMENTS.has(file) ? absolute(file) : url.href, cachedResponse);
        results.push({file,ok:true,bytes:Number(cachedResponse.headers.get('content-length'))||null});
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
        // Request the current page from the host instead of trusting a stale
        // browser HTTP-cache entry. Some static hosts ignore the packaged
        // _headers rules; Cache Storage remains the separately validated
        // offline source below.
        const response = await fetch(request, { cache: 'no-store' });
        if (CACHEABLE_DOCUMENTS.has(key)) {
          // Never display or cache a different release/document, including one
          // served by an edge cache after the browser HTTP cache was bypassed.
          // CDN HTML rewriting remains supported when the identity markers and
          // pinned runtime URL survive the transformation.
          const responseInScope = responseBelongsToScope(response, request.url);
          const documentValid = responseInScope && await responseHasCurrentPageIdentity(response,key);
          if (!documentValid) {
            if (cache) {
              try {
                const exact = await cache.match(absolute(key), {ignoreSearch:true});
                if (exact?.ok && await responseHasCurrentPageIdentity(exact,key)) return exact;
              } catch (_) {}
            }
            return new Response('The host returned a CURIOID page from a different release or outside this deployment. Keep this tab open and publish the complete matching website files.', {
              status: 502,
              headers: {'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}
            });
          }
          if (cache) { try { await cache.put(absolute(key), response.clone()); } catch (_) {} }
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
    const requestedHash = url.searchParams.get('v') || '';
    const releaseHash = /^sha256-([a-f0-9]{64})$/i.exec(requestedHash);
    const releaseQuery = Boolean(releaseHash);
    const documentRequest = CACHEABLE_DOCUMENTS.has(relativePath);
    // Versioned HTML requests share the same identity-checked cache entry as
    // normal navigation. A query-string SHA-256 is not a valid HTML byte check
    // because edge/CDN transformations can legitimately change document bytes.
    const cacheKey = documentRequest ? absolute(relativePath) : (releaseQuery ? request : absolute(relativePath));
    const strict = STRICT_HASHED_ASSETS.has(relativePath);
    // A SHA-256 URL is part of the asset identity, not merely a cache-buster.
    // Reject a URL that claims a different release hash before reading or
    // populating any cache, even when the network is currently available.
    if (strict && releaseQuery && releaseHash[1].toLowerCase() !== EXPECTED_SHA256[relativePath]) {
      return new Response('This asset URL belongs to a different CURIOID release. Reload the current homepage and try again.', {
        status: 409,
        headers: {'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}
      });
    }
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
      // Strict assets are digest-pinned. Bypass an intermediary browser HTTP
      // cache so stale unversioned diagnostic requests cannot mask a deploy.
      const networkRequest = strict ? new Request(request, {cache:'no-store'}) : request;
      const response = await fetch(networkRequest);
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
