"use client";

/**
 * Service-worker ownership + stale-worker cleanup.
 *
 * Older builds of the app registered a service worker that precached API
 * responses. When that worker's script disappeared (build reset), browsers
 * that still had it registered kept it controlling the page — its broken
 * fetch handling produced intermittent "Could not load…" error states in
 * several sections. This component:
 *   1. unregisters any foreign/stale worker,
 *   2. registers the safe pass-through worker at /sw.js.
 */

import { useEffect } from "react";

export function SwRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const swUrl = "/sw.js";

    void (async () => {
      try {
        // 1. Remove any worker not owned by the current build.
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          registrations
            .filter((r) => {
              const script = r.active?.scriptURL ?? r.installing?.scriptURL ?? r.waiting?.scriptURL ?? "";
              return !script.endsWith(swUrl);
            })
            .map((r) => r.unregister())
        );
        // 2. Register the safe pass-through worker (also delivers the update
        //    that retires any same-URL stale worker).
        await navigator.serviceWorker.register(swUrl, { scope: "/" });
      } catch {
        /* SW is a progressive enhancement — never block the app on it. */
      }
    })();
  }, []);

  return null;
}
