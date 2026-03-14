const CACHE_NAME = "eflow-v8";
const ASSETS = ["./","./index.html","./style.css","./app.js","./manifest.json","./icon-192.png","./icon-512.png","./eflow.png","./mundoled.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  if(e.request.method !== "GET") return;
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone();
    caches.open(CACHE_NAME).then(c => c.put(e.request, copy));
    return r;
  }).catch(() => caches.match(e.request).then(cached => cached || caches.match("./index.html"))));
});
