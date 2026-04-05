const CACHE_NAME = 'forge-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/app.css',
  '/css/chat.css',
  '/js/app.js',
  '/js/db.js',
  '/js/forge.js',
  '/js/pocket.js',
  '/js/personas.js',
  '/manifest.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/train')) {
    e.respondWith(networkFirst(e.request));
    return;
  }
  if (e.request.method !== 'GET') return;
  if (url.origin === 'cdn.jsdelivr.net' || url.origin === 'unpkg.com') {
    e.respondWith(networkFirst(e.request));
    return;
  }
  e.respondWith(cacheFirst(e.request));
});

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const resp = await fetch(req);
    if (resp.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, resp.clone());
    }
    return resp;
  } catch {
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

async function networkFirst(req) {
  try {
    const resp = await fetch(req);
    if (resp.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, resp.clone());
    }
    return resp;
  } catch {
    const cached = await caches.match(req);
    return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}
