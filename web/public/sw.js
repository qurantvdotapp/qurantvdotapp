// Quran TV Web Service Worker — Cache-first / Stale-While-Revalidate for dataset & static assets.
const CACHE_NAME = "qurantv-v1";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./fonts/Tajawal-Regular.ttf",
  "./fonts/Tajawal-Bold.ttf",
  "./quran/quran-uthmani.txt",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Explicitly ignore audio/media requests (never intercept/prefetch mp3 files)
  if (url.pathname.endsWith(".mp3") || url.hostname.includes("mp3quran.net") || event.request.destination === "audio") {
    return;
  }

  // Cache data-mirror JSONs, fonts, and texts with Stale-While-Revalidate
  const isDataOrAsset =
    url.pathname.includes("/data-mirror/") ||
    url.pathname.includes("cdn.jsdelivr.net") ||
    url.pathname.includes("raw.githubusercontent.com") ||
    url.pathname.endsWith(".json") ||
    url.pathname.endsWith(".ttf") ||
    url.pathname.endsWith(".txt");

  if (isDataOrAsset && event.request.method === "GET") {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        const fetchPromise = fetch(event.request)
          .then((networkRes) => {
            if (networkRes && networkRes.status === 200) {
              cache.put(event.request, networkRes.clone());
            }
            return networkRes;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
  }
});
