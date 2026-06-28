/* Service Worker — حضور و غیاب کافه باراما (PWA) */
const CACHE = 'barama-att-v1';
const SHELL = [
  './attendance.html',
  './manifest.webmanifest',
  './config.js',
  './icon-192.png',
  './icon-512.png',
  'https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// شِل برنامه را آفلاین هم بالا بیاور؛ درخواست‌های Supabase/شبکه را همیشه آنلاین بفرست
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // داده‌ها (Supabase) را کش نکن — همیشه از شبکه
  if (url.hostname.endsWith('supabase.co')) return;
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res && res.status === 200 && (url.origin === location.origin || url.hostname.includes('jsdelivr'))) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match('./attendance.html')))
  );
});
