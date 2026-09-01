const CACHE='job-radar-public-v2';
const SHELL=['./','./index.html','./app.js','./styles.css','./manifest.webmanifest','./icons/icon-192.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(url.pathname.endsWith('/data/jobs.json')) return;
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
});
