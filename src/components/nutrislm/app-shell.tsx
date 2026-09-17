"use client";

/**
 * App chrome: left sidebar navigation (desktop) + mobile top bar with drawer.
 * Sidebar carries brand, primary nav, an inspirational leaf card and the
 * account block. Content area sits on a soft sage canvas.
 */
import { useState } from "react";
import {
  BarChart3,
  Camera,
  Heart,
  Home,
  LogOut,
  Menu,
  Settings,
  Sprout,
  Target,
  UserRound,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useNutriStore, type AppView } from "./store";
import { api } from "@/lib/client/api";
import { ThemeToggle } from "./theme-toggle";

const NAV: { id: AppView; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "log", label: "Log Food", icon: Camera },
  { id: "meals", label: "Meals", icon: UtensilsCrossed },
  { id: "insights", label: "Insights", icon: BarChart3 },
  { id: "profile", label: "Health Profile", icon: UserRound },
  { id: "goals", label: "Goals", icon: Target },
  { id: "settings", label: "Settings", icon: Settings },
];

function BrandBlock() {
  return (
    <a href="/" className="flex items-center gap-3 rounded-xl px-1 py-1 focus-visible:outline-2 focus-visible:outline-ring">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-md shadow-emerald-600/20">
        <Sprout className="h-6 w-6" aria-hidden />
      </span>
      <span>
        <span className="block text-lg font-extrabold leading-tight tracking-tight">
          Nutri<span className="text-primary">SLM</span>
        </span>
        <span className="block text-[11px] leading-tight text-muted-foreground">
          Eat Smarter
          <br />
          Live Healthier
        </span>
      </span>
      <span className="sr-only">NutriSLM home</span>
    </a>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const view = useNutriStore((s) => s.view);
  const setView = useNutriStore((s) => s.setView);
  return (
    <nav aria-label="Primary" className="space-y-1">
      {NAV.map(({ id, label, icon: Icon }) => {
        const active = view === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => {
              setView(id);
              onNavigate?.();
            }}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-150 active:scale-[0.98]",
              active
                ? "bg-primary/10 text-primary shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className={cn("h-[18px] w-[18px]", active && "drop-shadow-sm")} />
            {label}
            {active && <span aria-hidden className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
          </button>
        );
      })}
    </nav>
  );
}

function LeafInspirationCard() {
  return (
    <div
      aria-hidden
      className="relative overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-4"
    >
      <Sprout className="absolute -right-3 -top-3 h-16 w-16 rotate-12 text-primary/20" />
      <Heart className="absolute bottom-2.5 right-3 h-4 w-4 text-primary/50" />
      <p className="text-sm font-semibold leading-snug text-foreground/90">
        Small
        <br />
        Healthy Choices
        <br />
        A Brighter You
      </p>
    </div>
  );
}

function AccountBlock() {
  const user = useNutriStore((s) => s.user);
  const clearSession = useNutriStore((s) => s.clearSession);

  async function handleLogout() {
    try {
      await api.logout();
    } finally {
      clearSession();
    }
  }

  if (!user) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-xl border bg-background p-2.5 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
          aria-label="Account menu"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
            <UserRound className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{user.name}</span>
            <span className="block truncate text-[11px] text-muted-foreground">{user.email}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>
          <div className="text-sm font-medium">{user.name}</div>
          <div className="truncate text-xs font-normal text-muted-foreground">{user.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
          <LogOut className="mr-2 h-4 w-4" aria-hidden /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarInner({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-5 p-4">
      <BrandBlock />
      <NavList onNavigate={onNavigate} />
      <div className="mt-auto space-y-4">
        <LeafInspirationCard />
        <AccountBlock />
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const user = useNutriStore((s) => s.user);

  return (
    <div className="min-h-screen bg-[#eef2e6] dark:bg-background">
      {/* ---------- desktop sidebar ---------- */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 border-r border-border/70 bg-background lg:block">
        <SidebarInner />
      </aside>

      {/* ---------- mobile top bar ---------- */}
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur lg:hidden">
        <div className="flex h-14 items-center justify-between gap-2 px-4">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={mobileNavOpen}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>
          <a href="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white">
              <Sprout className="h-4.5 w-4.5" aria-hidden />
            </span>
            <span className="text-base font-extrabold tracking-tight">
              Nutri<span className="text-primary">SLM</span>
            </span>
          </a>
          {user ? <ThemeToggle /> : <span className="w-9" aria-hidden />}
        </div>
      </header>

      {/* ---------- mobile drawer ---------- */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] overflow-y-auto border-r bg-background shadow-xl animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between px-4 pt-4">
              <BrandBlock />
              <Button variant="ghost" size="icon" aria-label="Close menu" onClick={() => setMobileNavOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <SidebarInner onNavigate={() => setMobileNavOpen(false)} />
          </div>
        </div>
      )}

      {/* ---------- content canvas ---------- */}
      <div className="lg:pl-60">
        <main className="mx-auto w-full max-w-6xl flex-1 px-3 pb-10 pt-4 sm:px-5 sm:pt-6">{children}</main>
        <footer className="mt-auto pb-[env(safe-area-inset-bottom)]">
          <div className="h-0.5 w-full bg-gradient-to-r from-primary/0 via-primary/40 to-teal-500/0" aria-hidden />
          <div className="mx-auto w-full max-w-6xl px-4 py-4 text-[11px] leading-relaxed text-muted-foreground">
            <p>
              <strong className="text-foreground/80">NutriSLM</strong> — multimodal personalized nutrition intelligence.
              AI understands, the database answers, deterministic code calculates — never the other way around. Sources:
              IFCT 2017 · USDA · WHO · ICMR-NIN · ADA · KDIGO. Not medical advice — confirm clinical targets with your
              care team.
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}

/** Full-screen wrapper used for the signed-out state (no sidebar chrome). */
export function BareShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col bg-[#eef2e6] dark:bg-background">
      <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-teal-500/10 blur-3xl" />
      <header className="relative z-10 mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
        <a href="/" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-md shadow-emerald-600/20">
            <Sprout className="h-5 w-5" aria-hidden />
          </span>
          <span className="text-lg font-extrabold tracking-tight">
            Nutri<span className="text-primary">SLM</span>
          </span>
        </a>
        <ThemeToggle />
      </header>
      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-10">{children}</main>
      <footer className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-6 text-center text-[11px] text-muted-foreground">
        Not medical advice. Constraints are configurable starting points — confirm clinical targets with your care team.
      </footer>
    </div>
  );
}
