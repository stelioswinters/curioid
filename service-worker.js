/* CURIOID v1.263 offline application shell. Same-origin assets only. */
'use strict';
const CACHE_NAME = 'curioid-shell-v1.263';
const SCOPE_URL = new URL(self.registration.scope);
const SHELL_PATHS = [
  '', 'index.html', 'projects.css', 'projects.js', 'vocal-lexicon.js',
  'bella-concierge.webp', 'social-preview.png', 'curioids.html', 'robots.txt', 'sitemap.xml',
  'manifest.webmanifest', 'curioid-icon-192.png', 'curioid-icon-512.png'
];
const CACHEABLE = new Set(SHELL_PATHS.filter(Boolean));
const absolute = path => new URL(path || './', SCOPE_URL).href;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(SHELL_PATHS.map(absolute));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('curioid-shell-') && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== SCOPE_URL.origin || !url.pathname.startsWith(SCOPE_URL.pathname)) return;

  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith((async () => {
      const relativePath = decodeURIComponent(url.pathname.slice(SCOPE_URL.pathname.length)).replace(/^\/+/, '');
      const documentKey = relativePath || 'index.html';
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response && response.ok && response.type === 'basic') {
          // Cache the actual document URL. A local game iframe must never be
          // replaced by index.html when a later navigation happens offline.
          if (CACHEABLE.has(documentKey)) await cache.put(absolute(documentKey), response.clone());
          else if (!/\.[a-z0-9]{1,8}$/i.test(documentKey)) await cache.put(absolute('index.html'), response.clone());
        }
        return response;
      } catch (_) {
        const exact = await cache.match(absolute(documentKey), { ignoreSearch: true });
        if (exact) return exact;
        // Extensionless app routes are client-side routes and can use the shell.
        if (!documentKey.includes('.') || documentKey === 'index.html') {
          return (await cache.match(absolute('index.html'))) || (await cache.match(absolute('')));
        }
        return new Response('CURIOID is offline and this document has not been cached yet.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
        });
      }
    })());
    return;
  }

  const relativePath = decodeURIComponent(url.pathname.slice(SCOPE_URL.pathname.length)).replace(/^\/+/, '');
  if (!CACHEABLE.has(relativePath)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response && response.ok && response.type === 'basic') await cache.put(absolute(relativePath), response.clone());
      return response;
    } catch (_) {
      return new Response('CURIOID is offline and this resource has not been cached yet.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
      });
    }
  })());
});
