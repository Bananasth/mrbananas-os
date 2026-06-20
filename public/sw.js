// Minimal service worker — PWA installability baseline.
// Real offline caching (app shell + outbox) is a later phase; this just registers.
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})
