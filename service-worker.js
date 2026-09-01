const CACHE='job-radar-public-v7';
const SHELL=['./','./index.html','./app.js?v=6','./styles.css?v=6','./manifest.webmanifest','./icons/icon-192.png'];
const DATA='./data/jobs.json';

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    try {
      const response = await fetch(DATA, {cache:'no-store'});
      if (response && response.ok) await cache.put(DATA, response.clone());
    } catch (_) {}
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith('/data/jobs.json')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(event.request, {cache:'no-store'});
        if (response && response.ok) await cache.put(DATA, response.clone());
        return response;
      } catch (_) {
        return (await cache.match(DATA)) || Response.error();
      }
    })());
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(event.request);
        if (response && response.ok) await cache.put('./index.html', response.clone());
        return response;
      } catch (_) {
        return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(event.request, {ignoreSearch:true});
    if (cached) {
      fetch(event.request).then(response => {
        if (response && response.ok) cache.put(event.request, response.clone());
      }).catch(() => {});
      return cached;
    }
    try {
      const response = await fetch(event.request);
      if (response && response.ok) await cache.put(event.request, response.clone());
      return response;
    } catch (_) {
      return Response.error();
    }
  })());
});
