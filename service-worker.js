const CACHE_NAME = 'flipnote-v2.0.0';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/utils.js',
  './js/i18n.js',
  './js/database.js',
  './js/notes.js',
  './js/flashcards.js',
  './js/quiz.js',
  './js/revision.js',
  './js/sharing.js',
  './js/supabase.js',
  './js/ai.js',
  './js/v2.js',
  './js/app.js',
  './assets/icons/favicon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/apple-touch-icon.png',
  './locales/en.json',
  './locales/hi.json',
  './locales/bn.json',
  './locales/de.json',
  './locales/fr.json',
  './locales/es.json',
  './locales/pt.json',
  './locales/ar.json',
  './locales/ur.json',
  './locales/ja.json',
  './locales/ko.json',
  './locales/ta.json',
  './locales/te.json',
  './locales/mr.json',
  './locales/gu.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Never cache Supabase API or external AI API calls
  if (url.hostname.includes('supabase.co') || url.pathname.includes('/rest/v1/')) {
    return;
  }

  // Same-origin: cache-first with background refresh for app shell
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const clone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return networkResponse;
          })
          .catch(() => cached || caches.match('./index.html'));
        return cached || fetchPromise;
      })
    );
  }
});
