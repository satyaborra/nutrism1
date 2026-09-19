"use client";

/**
 * NutriSLM root: bootstraps the session, then renders auth (bare shell) or the
 * sidebar dashboard shell with the active view.
 */
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/client/api";
import { useNutriStore } from "./store";
import { AppShell, BareShell } from "./app-shell";
import { AuthView } from "./auth-view";
import { Dashboard } from "./dashboard";

export function NutriSLMApp() {
  const user = useNutriStore((s) => s.user);
  const bootstrapped = useNutriStore((s) => s.bootstrapped);
  const setSession = useNutriStore((s) => s.setSession);
  const clearSession = useNutriStore((s) => s.clearSession);
  const setAuthNotice = useNutriStore((s) => s.setAuthNotice);

  useEffect(() => {
    let alive = true;
    api
      .me()
      .then((res) => {
        if (alive) setSession(res.user, res.profile);
      })
      .catch(() => {
        if (alive) clearSession();
      });
    return () => {
      alive = false;
    };
  }, [setSession, clearSession]);

  // A 401 from any section API means the session is no longer valid (server
  // restart, DB reset, expired cookie). Instead of letting every section show
  // its own error, return to sign-in once with a friendly explanation.
  useEffect(() => {
    function onUnauthorized(event: Event) {
      const message =
        event instanceof CustomEvent && typeof event.detail?.message === "string"
          ? event.detail.message
          : "Your session is no longer valid.";
      clearSession();
      setAuthNotice("Your session ended — please sign in again to continue where you left off.");
      if (message) {
        // The banner above already explains everything; this is kept for
        // debugging support via the console without user-facing toast spam.
        console.info("[nutrislm] session ended:", message);
      }
    }
    window.addEventListener("nutrislm:unauthorized", onUnauthorized);
    return () => window.removeEventListener("nutrislm:unauthorized", onUnauthorized);
  }, [clearSession, setAuthNotice]);

  if (!bootstrapped) {
    return (
      <BareShell>
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3" aria-busy="true">
          <span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-white p-1 shadow-md ring-1 ring-emerald-900/10 dark:ring-white/15">
            <img src="/images/nutrislm-logo-mark.png" alt="" className="h-full w-full object-contain" aria-hidden />
          </span>
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
          <p className="sr-only">Loading NutriSLM…</p>
        </div>
      </BareShell>
    );
  }

  if (!user) {
    return (
      <BareShell>
        <AuthView />
      </BareShell>
    );
  }

  return (
    <AppShell>
      <Dashboard />
    </AppShell>
  );
}
