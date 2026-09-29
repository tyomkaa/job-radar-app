const CACHE='job-radar-public-v15';
const SHELL=['./','./index.html','./app-v12.js','./styles-v12.css','./v13-ui.js','./v14-templates.js','./v15-cv-manager.js','./styles-v13-ui.css','./manifest.webmanifest','./icons/icon-192.png'];
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
    event.respondWith(networkFirst(event.request, DATA));
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(event.request, {cache:'no-store'});
        if (response && response.ok) await cache.put('./index.html', response.clone());
        return response;
      } catch (_) {
        return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
      }
    })());
    return;
  }

  if (
    url.pathname.endsWith('/app-v12.js') ||
    url.pathname.endsWith('/styles-v12.css') ||
    url.pathname.endsWith('/v13-ui.js') ||
    url.pathname.endsWith('/v14-templates.js') ||
    url.pathname.endsWith('/v15-cv-manager.js') ||
    url.pathname.endsWith('/styles-v13-ui.css')
  ) {
    event.respondWith(networkFirst(event.request, event.request));
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(event.request);
    if (cached) return cached;
    try {
      const response = await fetch(event.request);
      if (response && response.ok) await cache.put(event.request, response.clone());
      return response;
    } catch (_) {
      return Response.error();
    }
  })());
});

async function networkFirst(request, cacheKey) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request, {cache:'no-store'});
    if (response && response.ok) await cache.put(cacheKey, response.clone());
    return response;
  } catch (_) {
    return (await cache.match(cacheKey)) || Response.error();
  }
}
