"use client";

/**
 * NutriSLM root: bootstraps the session, then renders auth or the dashboard.
 */
import { useEffect } from "react";
import { Loader2, Salad } from "lucide-react";
import { api } from "@/lib/client/api";
import { useNutriStore } from "./store";
import { AppShell } from "./app-shell";
import { AuthView } from "./auth-view";
import { Dashboard } from "./dashboard";

export function NutriSLMApp() {
  const user = useNutriStore((s) => s.user);
  const bootstrapped = useNutriStore((s) => s.bootstrapped);
  const setSession = useNutriStore((s) => s.setSession);
  const clearSession = useNutriStore((s) => s.clearSession);

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

  return (
    <AppShell>
      {!bootstrapped ? (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3" aria-busy="true">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Salad className="h-6 w-6" aria-hidden />
          </span>
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
          <p className="sr-only">Loading NutriSLM…</p>
        </div>
      ) : user ? (
        <Dashboard />
      ) : (
        <AuthView />
      )}
    </AppShell>
  );
}
