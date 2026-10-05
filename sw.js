// App-shell service worker: cache-first for same-origin files only.
// Requests to AI providers are never touched or cached.
const VERSION = 'snootfood-v5';
const SHELL = [
  './', 'index.html', 'styles.css', 'app.js', 'config.js', 'demo.js', 'ai.js', 'card.js', 'image.js', 'chef.svg', 'manifest.webmanifest',
  'fonts/playfair.woff2', 'fonts/playfair-italic.woff2', 'fonts/caveat.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
  'samples/noodles.jpg', 'samples/beans.jpg', 'samples/pie.jpg', 'samples/fridge.jpg',
  ...['fancy-menu', 'chef-roast', 'fridge-chef'].flatMap((n) => [`img/chef-gerardo-${n}.webp`, `img/chef-gerardo-${n}.png`]),
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put('index.html', copy)); return r; }).catch(() => caches.match('index.html')));
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
    return r;
  })));
});
