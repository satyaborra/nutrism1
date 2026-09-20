"use client";

/**
 * Early capture of the browser's one-time `beforeinstallprompt` event.
 *
 * Chrome fires this event ONCE per page load — shortly after the service
 * worker becomes ready, long before a user could reach Settings. A listener
 * attached inside the Settings card therefore misses it every time, which is
 * exactly why the "Install as an app" button appeared dead.
 *
 * This module attaches the listener at app-boot (imported by pwa-register.tsx)
 * and rebroadcasts to late subscribers, so the card always sees the prompt.
 */

export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let captured: InstallPromptEvent | null = null;
const listeners = new Set<(prompt: InstallPromptEvent | null) => void>();

function broadcast() {
  listeners.forEach((fn) => fn(captured));
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // suppress the mini-infobar; we own the UX
    captured = e as InstallPromptEvent;
    broadcast();
  });

  window.addEventListener("appinstalled", () => {
    captured = null;
    broadcast();
  });
}

/** The prompt if it has already fired, otherwise null. */
export function getInstallPrompt(): InstallPromptEvent | null {
  return captured;
}

/** Drop a captured prompt (used after a failed/used prompt() call). */
export function clearInstallPrompt() {
  captured = null;
  broadcast();
}

/** Subscribe to prompt availability; returns an unsubscribe function. */
export function onInstallPromptChange(
  cb: (prompt: InstallPromptEvent | null) => void,
): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
