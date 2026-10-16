const CACHE = 'ianz-v34';
const ASSETS = ['./', 'index.html', 'styles.css', 'manifest.json', 'icons/icon.svg', 'icons/icon-192.png', 'icons/apple-touch-icon.png',
  'js/data.js', 'js/engine.js', 'js/stats.js', 'js/charts.js', 'js/core.js', 'js/quotes.js', 'assets/fonts/barlow-condensed-700.woff2', 'assets/fonts/barlow-condensed-800.woff2', 'js/vendor/supabase.js', 'js/config.js', 'js/cloud.js', 'js/wizard.js',
  'js/home.js', 'js/free.js', 'js/challenge.js', 'js/library.js', 'js/history.js', 'js/me.js', 'js/social.js', 'js/community.js', 'js/market.js', 'js/stories.js', 'js/push.js', 'js/photos.js', 'js/app.js'];

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
  // Exercise photos never change: serve from cache first, fetch once.
  if (new URL(e.request.url).pathname.includes('/assets/ex/')) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    })));
    return;
  }
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }) // revalidate with the server instead of the browser's HTTP cache
      .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request))
  );
});

// Lock-screen reminders sent by the send-reminders Edge Function
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(Promise.all([
    self.registration.showNotification(d.title || 'Ianz Fitness', {
      body: d.body || '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: d.tag || d.title, data: { url: d.url || './' },
    }),
    self.navigator.setAppBadge ? self.navigator.setAppBadge(1).catch(() => {}) : null,
  ]));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const c = list[0];
    if (c) return c.focus().then(() => (c.navigate ? c.navigate(url) : null)).catch(() => self.clients.openWindow(url));
    return self.clients.openWindow(url);
  }));
});
