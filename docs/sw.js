const CACHE = "au-finance-pulse-v5";
const SAME_ORIGIN = self.location.origin;

self.addEventListener("install", event => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith("au-finance-pulse") && key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  if (url.pathname.endsWith("/news.json") || url.hostname === "raw.githubusercontent.com") {
    event.respondWith(fetch(event.request, { cache: "no-store" }));
    return;
  }

  if (url.origin === SAME_ORIGIN) {
    event.respondWith(networkFirst(event.request));
  }
});
