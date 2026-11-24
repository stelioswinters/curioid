/* CURIOID v1.296 offline shell. Minimal install; larger assets cache on first use. */
'use strict';
const SCOPE_URL = new URL(self.registration.scope);
const CACHE_PREFIX = `curioid-shell:${encodeURIComponent(SCOPE_URL.pathname)}:`;
const CACHE_NAME = `${CACHE_PREFIX}v1.296`;
const LEGACY_CACHE_PATTERN = /^curioid-shell-v1\.\d+$/;
// Generated from the exact production files by scripts/refresh_release_assets.py.
const EXPECTED_SHA256 = Object.freeze({
  /* CURIOID_ASSET_HASHES_START */
  'index.html': '1d1a19c5ed18f9b44567706fd8cbec1432acb8f02ea2553791c9eb4a4a72dc36',
  'projects.css': '95e43bd92c5eb8c14c287b6e7f904941a8b14ef97173baa33a0e62c3a8130954',
  'projects.js': '70f748fc5bcc2632447c4cee05ea5f01a06add041d72c20ac754347dde064a77',
  'vocal-lexicon.js': '1b5387a69ce496bc42b30b1fececb1678e2a259a029df3242535d4f41308b32a',
  'curioids.html': 'efa11079d8298c828452765f2c1f8f0cab15af905f378df9536c76751fed50f0',
  'manifest.webmanifest': '1868963388ab187bace09b717e9172a03fef1f9d203f9c41305d9d4e5272e505',
  'robots.txt': '23877fe9514ab6e1c28495d254d75a56a96b79b0cf1e313102e0a74536c922d4',
  'sitemap.xml': '6983c2451814d79ea47ff138849bda8faabd386b3379dd089445e72476836a87',
  'social-preview.png': '287c93a40b36717b8a58989c0d1481e6f916307d156853dea0d23a823c28190e',
  'curioid-icon-192.png': '4641e5416a61e181b85c8ba11b602d3d2235aa1b5616dfbcdaae71d754f0bc08',
  'curioid-icon-512.png': 'a66c7ad5e5d1debe570fa46569e9791359a76e91bbabb1172b98e1a3ceea9c41',
  /* CURIOID_ASSET_HASHES_END */
});
// Install only the small shell required to reopen CURIOID offline.
const SHELL_PATHS = ['index.html', 'manifest.webmanifest', 'curioid-icon-192.png', 'curioid-icon-512.png'];
// Larger resources are cached on first request, not during PWA installation.
const ON_DEMAND_CACHEABLE = new Set(['projects.css','projects.js','vocal-lexicon.js','social-preview.png','curioids.html','robots.txt','sitemap.xml']);
const CACHEABLE_DOCUMENTS = new Set(['index.html','curioids.html']);
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
