// ZipMeal Lite service worker – app shell cache + offline fallback.
// Az API válaszokat szándékosan NEM cache-eljük itt: az étlapot az app
// saját localStorage cache-ből jeleníti meg offline módban.
const CACHE = 'zipmeal-lite-v17';
const SHELL = ['./', './index.html', './styles.css', './app.js', './manifest.json', './icon.svg', './LICENSE'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function cachePut(request, response) {
  if (!response || !response.ok) return;
  const copy = response.clone();
  caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Csak a saját origin statikus fájljait kezeljük; az API-t hagyjuk online menni.
  if (url.origin !== self.location.origin) return;

  // Navigáció: hálózat first, hiba esetén a cache-elt index.html.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => { cachePut(req, res); return res; })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // Statikus erőforrások: hálózat first, offline a cache-ből.
  e.respondWith(
    fetch(req)
      .then((res) => { cachePut(req, res); return res; })
      .catch(() => caches.match(req))
  );
});
