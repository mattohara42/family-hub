/**
 * Family Hub — Service Worker
 * Strategy: cache-first for app shell files, network-only for all external APIs.
 * Bump CACHE_VERSION whenever app files change to force clients to update.
 */

const CACHE_VERSION = 'fh-v1';
const CACHE_NAME    = `family-hub-${CACHE_VERSION}`;

// App shell files to pre-cache on install
const APP_SHELL = [
  '/family-hub.html',
  '/family-hub.css',
  '/family-hub.js',
  '/favicon.svg',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

// ── Install: pre-cache app shell ──────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: delete old caches ────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith('family-hub-') && k !== CACHE_NAME)
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: cache-first for same-origin, network-only for external ──
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Pass through non-GET and all cross-origin requests (APIs, Firebase, Google)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) {
        // Serve from cache; refresh in background (stale-while-revalidate)
        const networkFetch = fetch(request).then(response => {
          if (response.ok) {
            caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
          }
          return response;
        }).catch(() => {});
        return cached;
      }
      // Not in cache — fetch and cache it
      return fetch(request).then(response => {
        if (response.ok) {
          caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
        }
        return response;
      });
    })
  );
});
