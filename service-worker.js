/* CURIOID v1.317 offline shell. Minimal install; larger assets cache on first use. */
'use strict';
const SCOPE_URL = new URL(self.registration.scope);
const CACHE_PREFIX = `curioid-shell:${encodeURIComponent(SCOPE_URL.pathname)}:`;
const CACHE_NAME = `${CACHE_PREFIX}v1.317`;
const LEGACY_CACHE_PATTERN = /^curioid-shell-v1\.\d+$/;
// Generated from the exact production files by scripts/refresh_release_assets.py.
const EXPECTED_SHA256 = Object.freeze({
                              /* CURIOID_ASSET_HASHES_START */
  'applications-tools-apps.html': '87fb4e2477a8380aa728e21b0b034995dc558da8e4f7aeb8f31a64bf64bb4105',
  'curioid-icon-192.png': '32799afd1249c7fdeac1ce46bc12f09a2dcbf9ed4fb104cd80664be64a99c887',
  'curioid-icon-512.png': 'f5d307fcb59d1460bde3255c54ed57c281fd8e39cbbd82450250c6771a109086',
  'curioid-icon.svg': 'd2a0e03abcf6fa43325036af29ff2762c8af2ed039082687e76ef9059f1cfd78',
  'curioids.html': 'a27c77fe230698927dedcc49d6d3fc530d8171c38c8931fd5bef2a644bd3b3d3',
  'health-check.js': '47d6302fef26d800fb02fb30edcda7bb976dc1a026086fa9f9e33276f3608a36',
  'index.html': '8dc3ef1cc50eff90114be733ec021a1b7aa88aac4a1baba9666c9acb986f701d',
  'manifest.webmanifest': '92b55c1c8faa99121bd4ff79919d52cd48adb2c17353154abf428016f184846f',
  'music-audio-apps.html': '0bb0dcec33dbed8b6f15072a4a9cf586a7a141b61a6a6e68bbe16904a7761faa',
  'projects-category-creative-tools.js': '8eba29d095469c2b98b95b2d144fd553a1aa05c1dc70f61c23fd2c077dd634a5',
  'projects-category-digital-art.js': '5664e5f0f2b600c7ee7457dd58aca3366f458cf8ac3c059971c23bf93a161dd0',
  'projects-category-operating-systems.js': '907e64ad559cdc473d55adf80ab136d72cd40198c9f39878334d7e5485f4e368',
  'projects-category-sound-motion.js': '39ce4863c12e0cd56e3fa1355c7f0830b1ee04a8bf9ac7650fa2d40077951bf2',
  'projects-category-strange-archives.js': '0952c44a86591986a0743eea295fbbd5cc84a4564208aa4246ade1ea230e52e9',
  'projects-category-tiny-games.js': '3d26c8aad4bf8d3b31253ef06d05f6afa5e941b08d2c1b2fc66a99ccb399d59e',
  'projects-category-web-experiments.js': 'f266fc8b3cd40802f1dc0fa3c1aef706611cbe03571ea2d62deef81110b04d9f',
  'projects-core.js': '6d329993525c76ab76efb063d4785ad3942fcb37d3893e53a538719555780cb8',
  'projects.css': 'bcb29f1ddc36038da4e4aaa03db21e0e43ac6bb6e25b64d78fe309e7fa0d7e89',
  'robots.txt': '23877fe9514ab6e1c28495d254d75a56a96b79b0cf1e313102e0a74536c922d4',
  'site-runtime-current.js': 'e773cb7c2bff052df0957735ca0640bbd08486b88fd771976dca1fa61bfd2640',
  'sitemap.xml': '6983c2451814d79ea47ff138849bda8faabd386b3379dd089445e72476836a87',
  'social-preview.png': '562537c5503eda0ce9958e11fad368fddc93a16475d49695e201df0d6b2f9809',
  'vocal-lexicon.js': '1b5387a69ce496bc42b30b1fececb1678e2a259a029df3242535d4f41308b32a',
  /* CURIOID_ASSET_HASHES_END */
});
// Install only the small shell required to reopen CURIOID offline.
const SHELL_PATHS = ['index.html', 'site-runtime-current.js?v=sha256-e773cb7c2bff052df0957735ca0640bbd08486b88fd771976dca1fa61bfd2640', 'manifest.webmanifest', 'curioid-icon.svg', 'curioid-icon-192.png', 'curioid-icon-512.png'];
// Larger resources are cached on first request, not during PWA installation.
const ON_DEMAND_CACHEABLE = new Set(['projects-core.js','projects-category-operating-systems.js','projects-category-strange-archives.js','projects-category-web-experiments.js','projects-category-tiny-games.js','projects-category-digital-art.js','projects-category-sound-motion.js','projects-category-creative-tools.js','projects.css','health-check.js','music-audio-apps.html','applications-tools-apps.html','vocal-lexicon.js','curioids.html','robots.txt','sitemap.xml','social-preview.png']);
const CACHEABLE_DOCUMENTS = new Set(['index.html','curioids.html','music-audio-apps.html','applications-tools-apps.html']);
const CACHEABLE = new Set([...SHELL_PATHS.map(path=>relativePathFor(new URL(path,SCOPE_URL))).filter(Boolean), ...ON_DEMAND_CACHEABLE]);
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
function expectedHash(path) { let key=path||'index.html'; try { key=relativePathFor(new URL(key,SCOPE_URL))||key.split('?')[0]; } catch (_) { key=String(key).split('?')[0]; } return EXPECTED_SHA256[key] || ''; }
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
        if (!await responseMatchesRelease(relativePathFor(new URL(path,SCOPE_URL)) || path || 'index.html', response)) {
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
    const releaseQuery=/^sha256-[a-f0-9]{64}$/i.test(url.searchParams.get('v')||'');
    const cacheKey=releaseQuery?request:absolute(relativePath);
    if(cache)try{const hit=await cache.match(cacheKey,{ignoreSearch:!releaseQuery});if(hit&&await responseMatchesRelease(relativePath,hit))return hit;if(hit)await cache.delete(cacheKey);}catch(_){ }
    try{
      const response=await fetch(request);
      if(cache && response?.ok && response.type==='basic' && await responseMatchesRelease(relativePath,response))try{await cache.put(cacheKey,response.clone());}catch(_){ }
      return response;
    } catch(_){return new Response('CURIOID is offline and this resource has not been cached or failed its release integrity check.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});}
  })());
});
