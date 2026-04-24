const CACHE_NAME = 'ask-bir-sinyal-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json',
];

// Install - cache static assets
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate - clean old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch - network first, fall back to cache
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.hostname.includes('supabase') || url.hostname.includes('nominatim')) return;
  if (url.pathname.startsWith('/api/')) return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// ─── PUSH NOTIFICATIONS ───
self.addEventListener('push', (e) => {
  let data = { title: 'Aşk Bir Sinyal', body: 'Yeni bir mesajın var! 💕' };

  try {
    if (e.data) data = e.data.json();
  } catch (err) {}

  const options = {
    body: data.body,
    icon: data.icon || '/icon-192-real.png',
    badge: data.badge || '/icon-192-real.png',
    vibrate: [200, 100, 200, 100, 200],
    tag: 'ask-sinyal-' + Date.now(),
    renotify: true,
    requireInteraction: true,
    data: data.data || { url: '/' },
    actions: [
      { action: 'open', title: '💕 Aç' },
      { action: 'close', title: 'Kapat' },
    ],
  };

  e.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Handle notification click
self.addEventListener('notificationclick', (e) => {
  e.notification.close();

  if (e.action === 'close') return;

  const url = e.notification.data?.url || '/';

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus existing tab if open
      for (const client of windowClients) {
        if (client.url.includes('ask-bir-sinyal') && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open new tab
      return clients.openWindow(url);
    })
  );
});
