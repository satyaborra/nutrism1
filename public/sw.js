/*
 * NutriSLM service worker — safe pass-through.
 *
 * Purpose: own the `/sw.js` URL so a stale registration from an older build
 * can never intercept (and break) app fetches again. This worker NEVER calls
 * respondWith: every request goes straight to the network. On activation it
 * clears any caches left behind by previous workers.
 */

const CACHE_NAME = "nutrislm-runtime-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

// No fetch handler on purpose: pass-through keeps every request network-first
// and eliminates the stale-cache failure mode entirely.
