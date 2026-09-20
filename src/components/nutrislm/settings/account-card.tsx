"use client";

/**
 * Account — signed-in identity with the reference's red Log out action, plus
 * reassurance that logging out never deletes server-side data.
 */
import { LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client/api";
import { useNutriStore } from "../store";

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function AccountCard() {
  const user = useNutriStore((s) => s.user);
  const clearSession = useNutriStore((s) => s.clearSession);
  const setView = useNutriStore((s) => s.setView);

  async function handleLogout() {
    try {
      await api.logout();
    } finally {
      clearSession();
      setView("home");
    }
  }

  return (
    <section
      aria-label="Account"
      className="flex flex-col gap-4 rounded-3xl border border-border/60 bg-card p-5 shadow-sm shadow-black/[0.03] sm:flex-row sm:items-center sm:justify-between sm:p-6"
    >
      <div className="flex min-w-0 items-center gap-3.5">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-base font-bold text-white shadow-md shadow-emerald-600/25"
          aria-hidden
        >
          {user ? initialsOf(user.name) : "·"}
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-bold tracking-tight">Account</h2>
          <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
            Signed in as <span className="font-semibold text-foreground/80">{user?.email ?? "…"}</span>
          </p>
          {user && <p className="truncate text-[11px] text-muted-foreground/80">{user.name}</p>}
        </div>
      </div>

      <div className="flex flex-col items-start gap-2 sm:items-end">
        <Button variant="destructive" className="h-10 gap-1.5 rounded-xl px-4 font-semibold shadow-sm" onClick={handleLogout}>
          <LogOut className="h-4 w-4" aria-hidden /> Log out
        </Button>
        <p className="flex items-center gap-1.5 text-[10.5px] leading-snug text-muted-foreground/80">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary/70" aria-hidden />
          Meals, goals and profile stay saved to this account.
        </p>
      </div>
    </section>
  );
}
