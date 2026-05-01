const CACHE_NAME = "fresh-weight-assistant-v15";
const ASSET_PATHS = [
  "/",
  "/index.html",
  "/404.html",
  "/src/main.js",
  "/src/styles.css",
  "/src/pwa.js",
  "/src/domain/health.js",
  "/src/domain/id.js",
  "/src/storage/localStore.js",
  "/src/sync/syncService.js",
  "/public/manifest.webmanifest",
  "/public/icon.svg"
];

function assetUrl(path) {
  return new URL(path, self.registration.scope).toString();
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSET_PATHS.map(assetUrl))));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => {
        if (event.request.mode === "navigate") return caches.match(assetUrl("./index.html"));
        return caches.match(event.request);
      })
  );
});
