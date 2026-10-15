const CACHE = 'ianz-v11';
const ASSETS = ['./', 'index.html', 'styles.css', 'manifest.json', 'icons/icon.svg',
  'js/data.js', 'js/engine.js', 'js/stats.js', 'js/charts.js', 'js/core.js', 'js/vendor/supabase.js', 'js/config.js', 'js/cloud.js', 'js/wizard.js',
  'js/home.js', 'js/challenge.js', 'js/library.js', 'js/history.js', 'js/me.js', 'js/social.js', 'js/app.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

// Network first so updates show up; fall back to cache when offline.
self.addEventListener('fetch', (e) => {
  // Only cache the app itself; never cache cloud API / login requests.
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }) // revalidate with the server instead of the browser's HTTP cache
      .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request))
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((list) => (list.length ? list[0].focus() : self.clients.openWindow('./'))));
});
