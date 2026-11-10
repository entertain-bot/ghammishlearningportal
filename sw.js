/* =====================================================================
   GHAMMISH app - service worker
   Keeps the pages available offline. Online, it always loads the newest
   version of your site; offline, it shows the last copy it saved.
   (If you ever need to force everyone to refresh, change CACHE_NAME.)
   ===================================================================== */

const CACHE_NAME = "ghammish-v3";

// Pages and files saved when the app is first opened
const START_FILES = [
  "./",
  "index.html",
  "resources.html",
  "videos.html",
  "about.html",
  "style.css",
  "manifest.webmanifest",
  "icon-192.png"
];


/* ---------- Install: save the starting files ---------- */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        // add files one by one so one missing file doesn't break everything
        Promise.all(START_FILES.map((file) => cache.add(file).catch(() => {})))
      )
      .then(() => self.skipWaiting())
  );
});


/* ---------- Activate: remove old saved copies ---------- */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});


/* ---------- Fetch: network first, saved copy when offline ---------- */
self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  // Leave other websites alone (YouTube videos, Google Drive PDFs, fonts)
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((saved) => saved || caches.match("index.html"))
      )
  );
});
