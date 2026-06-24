/**
 * Family Hub — Service Worker
 * Strategy: network-first for app shell (edits show immediately; cache is
 * offline fallback only), network-only for all external APIs.
 */

const CACHE_VERSION = 'fh-v4';
const CACHE_NAME    = `family-hub-${CACHE_VERSION}`;

const APP_SHELL = [
  '/family-hub.html',
  '/family-hub.css',
  '/family-hub.js',
  '/favicon.svg',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/fonts/fraunces-roman.woff2',
  '/fonts/fraunces-italic.woff2',
  '/fonts/hanken-grotesk.woff2',
];

// ── Install: pre-cache app shell ──────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: delete old caches ───────────────────────────────
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

// ── Fetch: network-first for same-origin, passthrough for external ──
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Pass through non-GET and all cross-origin requests (APIs, Firebase, Google)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then(response => {
        // Network succeeded — update cache and return fresh response
        if (response.ok) {
          caches.open(CACHE_NAME)
            .then(cache => cache.put(request, response.clone()));
        }
        return response;
      })
      .catch(() => caches.match(request)) // Offline fallback
  );
});
