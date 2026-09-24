/* ==========================================
   Service Worker - MHASpace PWA
   Cache v5 (added i18n.js)
   ========================================== */

const CACHE = 'mha-v8';  //
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/mha-logo.png',
  '/app.js',
  '/sound.js',
  '/i18n.js'
];

// --- Install: cache core assets ---
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// --- Activate: clean old caches ---
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys.filter(k => k !== CACHE).map(k => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// --- Fetch: network-first for navigation, cache-first for assets ---
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Skip Firebase (always live)
  if (url.hostname.includes('firebasedatabase.app')) return;
  // Skip external fonts
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) return;
  // Skip third-party SDKs
  if (url.hostname.includes('telegram.org') ||
      url.hostname.includes('adsgram.ai') ||
      url.hostname.includes('cdnjs.cloudflare.com') ||
      url.hostname.includes('gstatic.com') ||
      url.hostname.includes('upgulpinon.com')) return;

  // Navigations: try network, fall back to cache
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Other requests: cache-first, then network
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok && e.request.method === 'GET' && url.origin === location.origin) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});
