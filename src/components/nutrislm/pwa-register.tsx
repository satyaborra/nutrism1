"use client";

/**
 * Registers the static-asset service worker once per session so the app is
 * PWA-installable (Chrome requires a fetch handler) and images/icons load
 * from cache on repeat visits. Renders nothing.
 */
import { useEffect } from "react";
// Side-effect import: attaches the beforeinstallprompt listener at bundle-eval
// time so the one-time event is never missed by the Settings install card.
import "@/lib/install-prompt";

export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* SW is a progressive enhancement — ignore failures */
      });
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
