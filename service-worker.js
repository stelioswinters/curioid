/* CURIOID v1.271 offline application shell. Same-origin, scope-isolated assets only. */
'use strict';
const SCOPE_URL = new URL(self.registration.scope);
// Cache Storage is origin-wide, not service-worker-scope-wide. Namespacing by
// the exact registration path prevents another GitHub Pages project on this
// origin from overwriting or deleting this site's cache (and vice versa).
const CACHE_PREFIX = `curioid-shell:${encodeURIComponent(SCOPE_URL.pathname)}:`;
const CACHE_NAME = `${CACHE_PREFIX}v1.271`;
const LEGACY_CACHE_PATTERN = /^curioid-shell-v1\.\d+$/;
const SHELL_PATHS = [
  '', 'index.html', 'projects.css', 'projects.js', 'vocal-lexicon.js',
  'social-preview.png', 'curioids.html', 'robots.txt', 'sitemap.xml',
  'manifest.webmanifest', 'curioid-icon-192.png', 'curioid-icon-512.png'
];
const CACHEABLE = new Set(SHELL_PATHS.filter(Boolean));
const absolute = path => new URL(path || './', SCOPE_URL).href;

function relativePathFor(url) {
  const raw = url.pathname.slice(SCOPE_URL.pathname.length).replace(/^\/+/, '');
  // Encoded separators and malformed escapes are not valid app routes. Ignore
  // them rather than throwing from the fetch event or mapping them to cache keys.
  if (/%(?:2f|5c)/i.test(raw)) return null;
  let decoded;
  try { decoded = decodeURIComponent(raw); }
  catch (_) { return null; }
  if (decoded.includes('\0') || decoded.includes('\\') || decoded.split('/').some(part => part === '.' || part === '..')) return null;
  return decoded;
}

async function openCacheSafely() {
  try { return await caches.open(CACHE_NAME); }
  catch (_) { return null; }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(SHELL_PATHS.map(absolute));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    let keys = [];
    try { keys = await caches.keys(); }
    catch (_) { await self.clients.claim(); return; }
    const deletions = [];
    for (const key of keys) {
      if (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME) {
        try { deletions.push(caches.delete(key)); } catch (_) { /* Best-effort cache cleanup. */ }
        continue;
      }
      // Older releases used one origin-global name. Delete one only when every
      // entry demonstrably belongs to this exact scope; mixed/unknown caches
      // are preserved because they may belong to another Pages project.
      if (!LEGACY_CACHE_PATTERN.test(key)) continue;
      try {
        const legacy = await caches.open(key);
        const entries = await legacy.keys();
        const belongsToThisScope = entries.length > 0 && entries.every(entry => {
          const entryURL = new URL(entry.url);
          return entryURL.origin === SCOPE_URL.origin && entryURL.pathname.startsWith(SCOPE_URL.pathname);
        });
        if (belongsToThisScope) deletions.push(caches.delete(key));
      } catch (_) { /* Cache cleanup is best-effort; do not block activation. */ }
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
      const documentKey = relativePath || 'index.html';
      const cache = await openCacheSafely();
      try {
        const response = await fetch(request);
        if (response && response.ok && response.type === 'basic' && cache) {
          // Cache the actual document URL. A local game iframe must never be
          // replaced by index.html when a later navigation happens offline.
          try {
            if (CACHEABLE.has(documentKey)) await cache.put(absolute(documentKey), response.clone());
            else if (!/\.[a-z0-9]{1,8}$/i.test(documentKey)) await cache.put(absolute('index.html'), response.clone());
          } catch (_) { /* A cache quota/error must never discard a successful network response. */ }
        }
        return response;
      } catch (_) {
        if (cache) {
          try {
            const exact = await cache.match(absolute(documentKey), { ignoreSearch: true });
            if (exact) return exact;
            // Extensionless app routes are client-side routes and can use the shell.
            if (!documentKey.includes('.') || documentKey === 'index.html') {
              const shell = await cache.match(absolute('index.html')) || await cache.match(absolute(''));
              if (shell) return shell;
            }
          } catch (_) { /* Cache lookup failure falls through to the explicit offline response. */ }
        }
        return new Response('CURIOID is offline and this document has not been cached yet.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
        });
      }
    })());
    return;
  }

  if (!CACHEABLE.has(relativePath)) return;
  event.respondWith((async () => {
    const cache = await openCacheSafely();
    if (cache) {
      try {
        const cached = await cache.match(request, { ignoreSearch: true });
        if (cached) return cached;
      } catch (_) { /* Fall through to network when the cache is unavailable or damaged. */ }
    }
    try {
      const response = await fetch(request);
      if (cache && response && response.ok && response.type === 'basic') {
        try { await cache.put(absolute(relativePath), response.clone()); } catch (_) { /* Cache writes are best-effort. */ }
      }
      return response;
    } catch (_) {
      return new Response('CURIOID is offline and this resource has not been cached yet.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
      });
    }
  })());
});
