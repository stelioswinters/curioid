/* CURIOID v1.316 offline shell. Minimal install; larger assets cache on first use. */
'use strict';
const SCOPE_URL = new URL(self.registration.scope);
const CACHE_PREFIX = `curioid-shell:${encodeURIComponent(SCOPE_URL.pathname)}:`;
const CACHE_NAME = `${CACHE_PREFIX}v1.316`;
const LEGACY_CACHE_PATTERN = /^curioid-shell-v1\.\d+$/;
// Generated from the exact production files by scripts/refresh_release_assets.py.
const EXPECTED_SHA256 = Object.freeze({
                              /* CURIOID_ASSET_HASHES_START */
  'index.html': '00d8668c8f065d3a8760e70980e6522e3adaac19c5c23c82fb5839b6343ab5e5',
  'site-runtime.js': '658c9d0d1d218dd012fc3f6c9723ba7bf45e6fafc93f5faa7cd4a70db65b9e21',
  'projects-core.js': '2f70ee579db07ebd0a577833c9c092c6108f8c490fba3a3098fb628cd133abe6',
  'projects-category-operating-systems.js': '7ee9480c2c0f08b4a2ea0bd6df14c7cd571bd18f124f14f6c048e21ffa52198d',
  'projects-category-strange-archives.js': '64036451348e2bdd5f44561406169f25c2e596c005e2524be8342f7a852fc3a4',
  'projects-category-web-experiments.js': 'fc86bffa5a0f9099c884bf15d92c1ca333f8a7c6fd2624cdb0ea7ee0caa7b01e',
  'projects-category-tiny-games.js': '2f0bfe48fc5addda431a9cacc3248347874a0d35242a794595b6ac93f8851e9b',
  'projects-category-digital-art.js': 'b17c028c30ea65bc0f88d1538e5d6b80debc0242094ecdd2fae8b9958224c502',
  'projects-category-sound-motion.js': '93c02bd7d8559ff79cc8c7fe9f7a154a78b6aaf0235680ecf635263262e63c86',
  'projects-category-creative-tools.js': '222b923b12b03ce5acb17efafcd35ca7768e1a1c3445915a3fd8b58ed1573587',
  'projects.css': 'bcb29f1ddc36038da4e4aaa03db21e0e43ac6bb6e25b64d78fe309e7fa0d7e89',
  'health-check.js': '6695437ce46c0047e5571e53c479e11e32ee6699ca7442d3768081e10b434452',
  'music-audio-apps.html': '0bb0dcec33dbed8b6f15072a4a9cf586a7a141b61a6a6e68bbe16904a7761faa',
  'applications-tools-apps.html': '8013dfd67f16c17a294f0b53eae51bdbb46068e41c494873efabac768b643b82',
  'vocal-lexicon.js': '1b5387a69ce496bc42b30b1fececb1678e2a259a029df3242535d4f41308b32a',
  'curioids.html': '75fb135faaf274514c972c9b1bf9bc80db0b54d5d3bdf20c048ce807badab592',
  'manifest.webmanifest': '92b55c1c8faa99121bd4ff79919d52cd48adb2c17353154abf428016f184846f',
  'robots.txt': '23877fe9514ab6e1c28495d254d75a56a96b79b0cf1e313102e0a74536c922d4',
  'sitemap.xml': '6983c2451814d79ea47ff138849bda8faabd386b3379dd089445e72476836a87',
  'social-preview.png': '562537c5503eda0ce9958e11fad368fddc93a16475d49695e201df0d6b2f9809',
  'curioid-icon.svg': 'd2a0e03abcf6fa43325036af29ff2762c8af2ed039082687e76ef9059f1cfd78',
  'curioid-icon-192.png': '32799afd1249c7fdeac1ce46bc12f09a2dcbf9ed4fb104cd80664be64a99c887',
  'curioid-icon-512.png': 'f5d307fcb59d1460bde3255c54ed57c281fd8e39cbbd82450250c6771a109086',
  /* CURIOID_ASSET_HASHES_END */
});
// Install only the small shell required to reopen CURIOID offline.
const SHELL_PATHS = ['index.html', 'site-runtime.js', 'manifest.webmanifest', 'curioid-icon.svg', 'curioid-icon-192.png', 'curioid-icon-512.png'];
// Larger resources are cached on first request, not during PWA installation.
const ON_DEMAND_CACHEABLE = new Set(['projects-core.js','projects-category-operating-systems.js','projects-category-strange-archives.js','projects-category-web-experiments.js','projects-category-tiny-games.js','projects-category-digital-art.js','projects-category-sound-motion.js','projects-category-creative-tools.js','projects.css','health-check.js','music-audio-apps.html','applications-tools-apps.html','vocal-lexicon.js','curioids.html','robots.txt','sitemap.xml','social-preview.png']);
const CACHEABLE_DOCUMENTS = new Set(['index.html','curioids.html','music-audio-apps.html','applications-tools-apps.html']);
const CACHEABLE = new Set([...SHELL_PATHS.filter(Boolean), ...ON_DEMAND_CACHEABLE]);
const absolute = path => new URL(path || './', SCOPE_URL).href;
function relativePathFor(url) {
  const raw = url.pathname.slice(SCOPE_URL.pathname.length).replace(/^\/+/, '');
  if (/%(?:2f|5c)/i.test(raw)) return null;
  let decoded;
  try { decoded = decodeURIComponent(raw); } catch (_) { return null; }
  if (decoded.includes('\0') || decoded.includes('\\') || decoded.split('/').some(part => part === '.' || part === '..')) return null;
  return decoded;
}
async function openCacheSafely() { try { return await caches.open(CACHE_NAME); } catch (_) { return null; } }
function expectedHash(path) { return EXPECTED_SHA256[path || 'index.html'] || ''; }
async function responseMatchesRelease(path, response) {
  const expected = expectedHash(path);
  const subtle = self.crypto?.subtle;
  if (!expected || !subtle || !response || !response.ok || typeof response.clone !== 'function') return false;
  try {
    const bytes = await response.clone().arrayBuffer();
    const digest = await subtle.digest('SHA-256', bytes);
    const actual = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
    return actual === expected;
  } catch (_) { return false; }
}
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      await cache.addAll(SHELL_PATHS.map(absolute));
      for (const path of SHELL_PATHS) {
        const response = await cache.match(absolute(path));
        if (!await responseMatchesRelease(path || 'index.html', response)) {
          throw new Error(`The installed shell asset failed its release hash check: ${path || 'index.html'}`);
        }
      }
    } catch (error) {
      try { await caches.delete(CACHE_NAME); } catch (_) {}
      throw error;
    }
    // Intentionally wait until the user accepts an update before skipWaiting().
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type !== 'CURIOID_ACTIVATE_UPDATE') return;
  event.waitUntil((async () => {
    try {
      const clients = await self.clients.matchAll({type:'window',includeUncontrolled:true});
      const scoped = clients.filter(client => { try { const url=new URL(client.url); return url.origin===SCOPE_URL.origin && url.pathname.startsWith(SCOPE_URL.pathname); } catch (_) { return false; } });
      if (scoped.length > 1) { event.source?.postMessage({type:'CURIOID_UPDATE_BLOCKED',openTabs:scoped.length}); return; }
      await self.skipWaiting();
    } catch (_) { event.source?.postMessage({type:'CURIOID_UPDATE_BLOCKED',openTabs:null}); }
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    let keys=[]; try { keys=await caches.keys(); } catch (_) { await self.clients.claim(); return; }
    const deletions=[];
    for (const key of keys) {
      if (key.startsWith(CACHE_PREFIX) && key!==CACHE_NAME) { try { deletions.push(caches.delete(key)); } catch (_) {} continue; }
      if (!LEGACY_CACHE_PATTERN.test(key)) continue;
      try {
        const legacy=await caches.open(key), entries=await legacy.keys();
        const belongs=entries.length>0 && entries.every(entry=>{const u=new URL(entry.url);return u.origin===SCOPE_URL.origin && u.pathname.startsWith(SCOPE_URL.pathname);});
        if (belongs) deletions.push(caches.delete(key));
      } catch (_) {}
    }
    await Promise.allSettled(deletions); await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request=event.request; if(request.method!=='GET')return;
  const url=new URL(request.url); if(url.origin!==SCOPE_URL.origin || !url.pathname.startsWith(SCOPE_URL.pathname))return;
  const relativePath=relativePathFor(url); if(relativePath===null)return;
  if(request.mode==='navigate' || request.destination==='document') {
    event.respondWith((async()=>{
      const key=relativePath||'index.html',cache=await openCacheSafely();
      try {
        const response=await fetch(request);
        if(response?.ok && response.type==='basic' && cache && CACHEABLE_DOCUMENTS.has(key) && await responseMatchesRelease(key,response)) { try{await cache.put(absolute(key),response.clone());}catch(_){} }
        return response;
      } catch (_) {
        if(cache)try{const exact=await cache.match(absolute(key),{ignoreSearch:true});if(exact&&await responseMatchesRelease(key,exact))return exact;if(exact)await cache.delete(absolute(key));if(!key.includes('.')||key==='index.html'){const shell=await cache.match(absolute('index.html'))||await cache.match(absolute(''));if(shell&&await responseMatchesRelease('index.html',shell))return shell;}}catch(_){ }
        return new Response('CURIOID is offline and this document has not been cached or failed its release integrity check.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
      }
    })()); return;
  }
  if(!CACHEABLE.has(relativePath))return;
  event.respondWith((async()=>{
    const cache=await openCacheSafely();
    if(cache)try{const hit=await cache.match(request,{ignoreSearch:true});if(hit&&await responseMatchesRelease(relativePath,hit))return hit;if(hit)await cache.delete(absolute(relativePath));}catch(_){ }
    try{
      const response=await fetch(request);
      if(cache && response?.ok && response.type==='basic' && await responseMatchesRelease(relativePath,response))try{await cache.put(absolute(relativePath),response.clone());}catch(_){ }
      return response;
    } catch(_){return new Response('CURIOID is offline and this resource has not been cached or failed its release integrity check.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});}
  })());
});
