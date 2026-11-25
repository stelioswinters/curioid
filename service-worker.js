/* CURIOID v1.307 offline shell. Minimal install; larger assets cache on first use. */
'use strict';
const SCOPE_URL = new URL(self.registration.scope);
const CACHE_PREFIX = `curioid-shell:${encodeURIComponent(SCOPE_URL.pathname)}:`;
const CACHE_NAME = `${CACHE_PREFIX}v1.307`;
const LEGACY_CACHE_PATTERN = /^curioid-shell-v1\.\d+$/;
// Generated from the exact production files by scripts/refresh_release_assets.py.
const EXPECTED_SHA256 = Object.freeze({
                              /* CURIOID_ASSET_HASHES_START */
  'index.html': '2efe784e91e5a806dc7d6cb5f4172ffc14038f2e77a2ec5041c771f2625cc4ea',
  'projects-core.v1.307.js': '501791dae05b39dcdf83163f036a12e71ba05b2059f0236e1be71553bfaad286',
  'projects-category-operating-systems.v1.307.js': 'cb2383349bec43378236ad59dcc4f948e8dd45f03349a3045f7a2c627c608736',
  'projects-category-strange-archives.v1.307.js': 'a6a6b661bc8ef2a8647e1f4e469d55631632dc1c29ce8d9377bcb455c0ea0d8d',
  'projects-category-web-experiments.v1.307.js': 'ae88c87efe9f1feb00e7d2755a9f75fe63841a65666a6831a482ca90d93abec1',
  'projects-category-tiny-games.v1.307.js': 'b045fdee6f01ac155c7575b032d4dec9811a3dd0e0f6774811e3555b7d448e4e',
  'projects-category-digital-art.v1.307.js': '4d77665ecbc20f4b4edd667e071c75bc479c8ac087de1d3ee2e733fc84abba0d',
  'projects-category-sound-motion.v1.307.js': 'ae9499c544e79c1855a754bd98b5f83c8b94c363b98e4402ca2d95ca0129bcaf',
  'projects-category-creative-tools.v1.307.js': '2edd951334864b255c6106815d93cc569d6121af5a4d0283b414b3da0ac3fb26',
  'projects-v1.304.css': '9f6232f165a914d57d5412ea25bdd9813b87f19641bd716ee860386ae771f03d',
  'health-check-v1.307.js': '1b5862b1064b0d05def568c44932c07cc352f35e0627265b7014ce15d5f94acb',
  'music-audio-apps.html': '8c0285587a561c0db1116af930f221a261d66ad46d51044f1e978d72dc82055b',
  'applications-tools-apps.html': '8d2573eb366470d1b69bbfd88a7d8e890030ab5b6080fde2fc362d118be48e39',
  'vocal-lexicon.js': '1b5387a69ce496bc42b30b1fececb1678e2a259a029df3242535d4f41308b32a',
  'curioids.html': 'd7428edefd11708b748891a93757894793e3fa0d091ebb6a89faab4d97554a9e',
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
const ON_DEMAND_CACHEABLE = new Set(['projects-core.v1.307.js','projects-category-operating-systems.v1.307.js','projects-category-strange-archives.v1.307.js','projects-category-web-experiments.v1.307.js','projects-category-tiny-games.v1.307.js','projects-category-digital-art.v1.307.js','projects-category-sound-motion.v1.307.js','projects-category-creative-tools.v1.307.js','projects-v1.304.css','health-check-v1.307.js','music-audio-apps.html','applications-tools-apps.html','vocal-lexicon.js','curioids.html','robots.txt','sitemap.xml','social-preview.png']);
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
