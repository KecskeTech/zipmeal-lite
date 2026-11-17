// ZiPMEAL Lite service worker – app shell cache + offline fallback.
// Az API válaszokat szándékosan NEM cache-eljük itt: az étlapot az app
// saját localStorage cache-ből jeleníti meg offline módban.
const CACHE = 'zipmeal-lite-v50';
const SHELL = ['./', './index.html', './v2.html', './styles.css', './v2.css', './app.js', './manifest.json', './icon.svg', './LICENSE', './robots.txt', './sitemap.xml', './zipmeal-bejelentkezes.html', './zipmeal-etlap.html', './zipmeal-zalaegerszeg.html', './zipmeal-kaposvar.html', './zipmeal-web.html'];

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

  // Navigáció: hálózat first, hiba esetén a cache-elt index.html (a v2
  // útvonalon a v2.html, hogy offline is a kísérleti nézet jöjjön vissza).
  if (req.mode === 'navigate') {
    const isV2 = /\/v2(\.html|\/)?$/.test(url.pathname);
    const fallback = isV2 ? './v2.html' : './index.html';
    e.respondWith(
      fetch(req)
        .then((res) => { cachePut(req, res); return res; })
        .catch(() => caches.match(req).then((r) => r || caches.match(fallback)))
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
