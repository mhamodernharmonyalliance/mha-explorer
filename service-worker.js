// تم تغيير الإصدار إلى v2 لإجبار المتصفح على التحديث
const CACHE = 'mha-v2'; 
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/mha-logo.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // لا نخزّن Firebase — دائماً من الشبكة
  if (url.hostname.includes('firebasedatabase.app')) {
    return;
  }

  // لا نخزّن Google Fonts
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    return;
  }

  // صفحة HTML: الشبكة أولاً، ثم الكاش عند الانقطاع
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // ملفات ثابتة: الكاش أولاً
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      if (res.ok && e.request.method === 'GET' && url.origin === location.origin) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }))
  );
});
