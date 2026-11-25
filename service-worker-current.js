/* CURIOID v1.320 offline shell. CDN-tolerant document validation; strict hashes for executable assets. */
'use strict';
const RELEASE_ID = 'v1.320';
const SCOPE_URL = new URL(self.registration.scope);
const CACHE_PREFIX = `curioid-shell:${encodeURIComponent(SCOPE_URL.pathname)}:`;
const CACHE_NAME = `${CACHE_PREFIX}${RELEASE_ID}`;
const LEGACY_CACHE_PATTERN = /^curioid-shell-v1\.\d+$/;
const EXPECTED_SHA256 = Object.freeze({
  "applications-tools-apps.html": "ef08918ad301ee39b3aebc2d64248a1c2ab06eb453a3d58ca037c7f79d4272f9",
  "curioid-icon-192.png": "32799afd1249c7fdeac1ce46bc12f09a2dcbf9ed4fb104cd80664be64a99c887",
  "curioid-icon-512.png": "f5d307fcb59d1460bde3255c54ed57c281fd8e39cbbd82450250c6771a109086",
  "curioid-icon.svg": "d2a0e03abcf6fa43325036af29ff2762c8af2ed039082687e76ef9059f1cfd78",
  "curioids.html": "31e6a25716293af72bc89ed64769e6122d68b658202fac8772a794898f996167",
  "health-check.js": "f9e91c4678ff54ddb7bec9c2ce9c30d020f3c41603f6f39d2dba8e4562f47eb1",
  "index.html": "6860ef53e302c877bb606f5a6ab5468e904a906e7af277c03117fa64b2796b11",
  "manifest.webmanifest": "92b55c1c8faa99121bd4ff79919d52cd48adb2c17353154abf428016f184846f",
  "music-audio-apps.html": "0bb0dcec33dbed8b6f15072a4a9cf586a7a141b61a6a6e68bbe16904a7761faa",
  "projects-category-creative-tools.js": "7dccb0868f1eb38172bf1e9e47123e74a1ceaa3d30de6a8500c8367f3658cb6e",
  "projects-category-digital-art.js": "9332adf796367552960a43258db57825afc2a522c17255a05f057b1d8a10e615",
  "projects-category-operating-systems.js": "8cf3bb862076f5e9ae7bccbebc698f94c62033b0def73311a1dbfb8a6e17c80e",
  "projects-category-sound-motion.js": "8a9c2300aeffca0226396bb98d6aac8a139ae02cfdde2493302bd4a46dc1bdbd",
  "projects-category-strange-archives.js": "2c1ac457623dd4136136fe4a9873f0a9c298b926c978824a508a13801a88cb12",
  "projects-category-tiny-games.js": "bd117e2018d5cc5fb9a6887edde6a0994a858d22ba1a2f2e6b148281fa55dfde",
  "projects-category-web-experiments.js": "2b2e60ef06f15cec206d71a4cd1a7937b0780f5ff7c1d9e59f0fd490508b6941",
  "projects-core.js": "f4ac573e4e9f18fe7f5dfe1673c9b8570ff08f2cf2454f97d064a0b353598118",
  "projects-styles.txt": "bcb29f1ddc36038da4e4aaa03db21e0e43ac6bb6e25b64d78fe309e7fa0d7e89",
  "robots.txt": "23877fe9514ab6e1c28495d254d75a56a96b79b0cf1e313102e0a74536c922d4",
  "site-runtime-current.js": "f29364a505850d855451a653822a2eff637e94e98e6eb1c9667c546acf60b3e1",
  "sitemap.xml": "6983c2451814d79ea47ff138849bda8faabd386b3379dd089445e72476836a87",
  "social-preview.png": "562537c5503eda0ce9958e11fad368fddc93a16475d49695e201df0d6b2f9809",
  "vocal-lexicon.js": "1b5387a69ce496bc42b30b1fececb1678e2a259a029df3242535d4f41308b32a",
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
  'projects-category-sound-motion.js', 'projects-category-creative-tools.js', 'projects-styles.txt',
  'health-check.js', 'music-audio-apps.html', 'applications-tools-apps.html', 'vocal-lexicon.js',
  'curioids.html', 'robots.txt', 'sitemap.xml', 'social-preview.png'
]);
const CACHEABLE_DOCUMENTS = new Set(['index.html', 'curioids.html', 'music-audio-apps.html', 'applications-tools-apps.html']);
const STRICT_HASHED_ASSETS = new Set(Object.keys(EXPECTED_SHA256).filter(name => /\.js$/i.test(name) || name === 'projects-styles.txt'));
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
    const marker = /<meta\s+name=["']curioid-release["']\s+content=["']v1\.320["']/i.test(html);
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
self.addEventListener('message', event => {
  if (event.data?.type !== 'CURIOID_ACTIVATE_UPDATE') return;
  event.waitUntil((async () => {
    try {
      const clients = await self.clients.matchAll({type:'window', includeUncontrolled:true});
      const scoped = clients.filter(safeScopedClient);
      if (scoped.length > 1) { event.source?.postMessage({type:'CURIOID_UPDATE_BLOCKED', openTabs:scoped.length}); return; }
      await self.skipWaiting();
    } catch (_) { event.source?.postMessage({type:'CURIOID_UPDATE_BLOCKED', openTabs:null}); }
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
        if (hit?.ok && (!strict || await responseMatchesRelease(relativePath, hit))) return hit;
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
