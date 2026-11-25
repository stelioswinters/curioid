/* CURIOID v1.323 offline shell. CDN-tolerant document validation; strict hashes for executable assets. */
'use strict';
const RELEASE_ID = 'v1.323';
const SCOPE_URL = new URL(self.registration.scope);
const CACHE_PREFIX = `curioid-shell:${encodeURIComponent(SCOPE_URL.pathname)}:`;
const CACHE_NAME = `${CACHE_PREFIX}${RELEASE_ID}`;
const LEGACY_CACHE_PATTERN = /^curioid-shell-v1\.\d+$/;
const EXPECTED_SHA256 = Object.freeze({
  "applications-tools-apps.html": "081b15e39cfcb9cf9f9c20655e84d7637e141f362d12013d1b784d64a36d12b1",
  "curioid-icon-192.png": "32799afd1249c7fdeac1ce46bc12f09a2dcbf9ed4fb104cd80664be64a99c887",
  "curioid-icon-512.png": "f5d307fcb59d1460bde3255c54ed57c281fd8e39cbbd82450250c6771a109086",
  "curioid-icon.svg": "d2a0e03abcf6fa43325036af29ff2762c8af2ed039082687e76ef9059f1cfd78",
  "curioids.html": "222b287453329e3f6fea45b308cfa29866f9ccd60ecb6ce57573147dd7b60f13",
  "health-check.js": "856ca30abfb3518557bde3dadea4f345cd31e7758bac70fad2b3105f75c9b159",
  "index.html": "13328bfe0531a9d85663f088f252d235868a36a688804972dfc45fa95abe7d5e",
  "manifest.webmanifest": "578e2eaef7f5ab106f5887ee5edf810fa52468f128ceff691ba82967291e0eb1",
  "music-audio-apps.html": "ba0e5ac1043aaba39ac80515e4f26edb0f540860f516ab8458995f5092b7fc9d",
  "projects-category-creative-tools.js": "7a7aac242ec21861c4f7538ab3516035d9bf36b10b495e039b40ad78a4e81c7e",
  "projects-category-digital-art.js": "f28f7b7b3b1c560819c9441d8cd6bef40cb039eaca41b0c55ca68695203f7359",
  "projects-category-operating-systems.js": "fd1ff507be4e21803aed39c7b5c76b9753e7477385e8c5a3a5f055e10261f25f",
  "projects-category-sound-motion.js": "fd42798a4518cd5f72ac93393e8103b1d370a70af605791c583eb69a5878a0eb",
  "projects-category-strange-archives.js": "3651db00b5b2ea3aa8ccd5903abbe585553f80d89ad6bef2656d4fa45fdc732f",
  "projects-category-tiny-games.js": "bebe9ab361e4830d53d0e23da411049e92a6316fced463ed365ed0cc3d224369",
  "projects-category-web-experiments.js": "86d0d00776c8404a8659ec63aabda6ed1b38cbc426a73a7e79ff50fcdae463a2",
  "projects-core.js": "28565ac06f927183b39363a2cf09473dbccf6aab80486c5fd905b087061857bc",
  "projects-styles.txt": "a847d1b34f8cbe820f4ae5479c8d17001d837e5648cb7a2e7dd8959a61835257",
  "robots.txt": "23877fe9514ab6e1c28495d254d75a56a96b79b0cf1e313102e0a74536c922d4",
  "site-runtime-current.js": "88557e9150b21f4fdf99c0e271af9c5d9f449f80afde07e3adc3f6502565b980",
  "sitemap.xml": "6983c2451814d79ea47ff138849bda8faabd386b3379dd089445e72476836a87",
  "social-preview.png": "562537c5503eda0ce9958e11fad368fddc93a16475d49695e201df0d6b2f9809",
  "vocal-lexicon.js": "1b5387a69ce496bc42b30b1fececb1678e2a259a029df3242535d4f41308b32a"
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
    const marker = /<meta\s+name=["']curioid-release["']\s+content=["']v1\.322["']/i.test(html);
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
  'projects-core.js', 'projects-styles.txt', 'health-check.js',
  'projects-category-operating-systems.js', 'projects-category-strange-archives.js',
  'projects-category-web-experiments.js', 'projects-category-tiny-games.js',
  'projects-category-digital-art.js', 'projects-category-sound-motion.js',
  'projects-category-creative-tools.js'
]);
function replyToMessage(event, data) {
  try { if (event.ports?.[0]) event.ports[0].postMessage(data); else event.source?.postMessage(data); } catch (_) {}
}
async function precacheCurrentReleaseAssets() {
  const cache = await caches.open(CACHE_NAME);
  const results = [];
  let cursor = 0;
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
  await Promise.all(Array.from({length:Math.min(3, DIAGNOSTIC_PRECACHE_PATHS.length)}, () => worker()));
  results.sort((a,b)=>DIAGNOSTIC_PRECACHE_PATHS.indexOf(a.file)-DIAGNOSTIC_PRECACHE_PATHS.indexOf(b.file));
  return {type:'CURIOID_PRECACHE_RESULT',release:RELEASE_ID,ok:results.length===DIAGNOSTIC_PRECACHE_PATHS.length&&results.every(item=>item.ok),cachedCount:results.filter(item=>item.ok).length,expectedCount:DIAGNOSTIC_PRECACHE_PATHS.length,results};
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
