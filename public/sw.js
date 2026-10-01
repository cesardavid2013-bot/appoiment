/* Kept service worker: installability plus a graceful offline page. It never caches pages,
   API responses or anything private — a stale booking screen is worse than none. */
const OFFLINE = "/offline";
const CACHE = "kept-offline-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add(new Request(OFFLINE, { cache: "reload" }))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Only top-level page navigations get the offline fallback; everything else goes straight to the network.
  if (req.mode !== "navigate" || req.method !== "GET") return;
  event.respondWith(fetch(req).catch(() => caches.match(OFFLINE).then((r) => r || Response.error())));
});
