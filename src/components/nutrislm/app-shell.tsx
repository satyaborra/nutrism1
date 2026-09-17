"use client";

/**
 * App chrome:
 *  • Desktop — fixed left sidebar (brand, nav, leaves inspiration card) and a
 *    sticky top bar (global search with ⌘/Ctrl-K, theme toggle, notifications,
 *    account menu) matching the "Log a Meal" design.
 *  • Mobile — compact top bar + slide-in drawer.
 * Content sits on a soft sage canvas.
 */
import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  Bell,
  Camera,
  ChevronDown,
  Droplets,
  Heart,
  Home,
  LogOut,
  Menu,
  Search,
  Settings,
  Sprout,
  Target,
  Trophy,
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
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useNutriStore, type AppView } from "./store";
import { api } from "@/lib/client/api";
import { ThemeToggle } from "./theme-toggle";

const NAV: { id: AppView; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "log", label: "Log Meal", icon: Camera },
  { id: "meals", label: "Meals", icon: UtensilsCrossed },
  { id: "insights", label: "Nutrition Insights", icon: BarChart3 },
  { id: "profile", label: "Health Profile", icon: UserRound },
  { id: "goals", label: "Goals", icon: Target },
];

const NAV_FOOTER: { id: AppView; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "settings", label: "Settings", icon: Settings },
];

function BrandBlock() {
  return (
    <a href="/" className="flex items-center gap-3 rounded-xl px-1 py-1 focus-visible:outline-2 focus-visible:outline-ring">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-md shadow-emerald-600/20">
        <Sprout className="h-6 w-6" aria-hidden />
      </span>
      <span>
        <span className="block text-lg font-extrabold leading-tight tracking-tight">
          Nutri<span className="text-primary">SLM</span>
        </span>
        <span className="block whitespace-nowrap text-[10.5px] leading-tight text-muted-foreground">
          Eat Smarter • Live Healthier
        </span>
      </span>
      <span className="sr-only">NutriSLM home</span>
    </a>
  );
}

function NavButton({
  item,
  onNavigate,
}: {
  item: { id: AppView; label: string; icon: React.ComponentType<{ className?: string }> };
  onNavigate?: () => void;
}) {
  const view = useNutriStore((s) => s.view);
  const setView = useNutriStore((s) => s.setView);
  const active = view === item.id;
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={() => {
        setView(item.id);
        onNavigate?.();
      }}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-150 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-ring",
        active
          ? "bg-primary/10 font-semibold text-primary shadow-sm"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {active && <span aria-hidden className="absolute inset-y-1.5 left-0 w-1 rounded-full bg-primary" />}
      <Icon className="h-[18px] w-[18px]" />
      {item.label}
    </button>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Primary" className="space-y-1">
      {NAV.map((item) => (
        <NavButton key={item.id} item={item} onNavigate={onNavigate} />
      ))}
      <div aria-hidden className="mx-2 my-3 h-px bg-border/80" />
      {NAV_FOOTER.map((item) => (
        <NavButton key={item.id} item={item} onNavigate={onNavigate} />
      ))}
    </nav>
  );
}

function LeavesInspirationCard() {
  return (
    <div
      aria-hidden
      className="relative overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-b from-primary/10 via-primary/5 to-primary/15 p-4"
    >
      <img
        src="/images/hero-leaves.png"
        alt=""
        className="pointer-events-none absolute inset-x-0 bottom-0 h-20 w-full object-cover opacity-40 [mask-image:linear-gradient(to_top,black_30%,transparent)] dark:opacity-25"
      />
      <p className="font-script relative text-[1.55rem] font-semibold leading-[1.15] text-primary">
        Good
        <br />
        Food
        <br />
        Brighter
        <br />
        Days <Heart className="inline h-4 w-4 fill-primary/70 text-primary/70" />
      </p>
      <p className="relative mt-2 pb-16 text-[11px] font-medium text-muted-foreground">
        Small changes.
        <br />
        Big impact.
      </p>
    </div>
  );
}

function SidebarInner({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-5 p-4">
      <BrandBlock />
      <NavList onNavigate={onNavigate} />
      <div className="mt-auto">
        <LeavesInspirationCard />
      </div>
      {/* drawer-only account block is passed as children when in mobile drawer */}
    </div>
  );
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function AccountMenuItems() {
  const user = useNutriStore((s) => s.user);
  const setView = useNutriStore((s) => s.setView);
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
    <>
      <DropdownMenuLabel>
        <div className="text-sm font-medium">{user.name}</div>
        <div className="truncate text-xs font-normal text-muted-foreground">{user.email}</div>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem className="cursor-pointer" onClick={() => setView("profile")}>
        <UserRound className="mr-2 h-4 w-4" aria-hidden /> Health Profile
      </DropdownMenuItem>
      <DropdownMenuItem className="cursor-pointer" onClick={() => setView("settings")}>
        <Settings className="mr-2 h-4 w-4" aria-hidden /> Settings
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
        <LogOut className="mr-2 h-4 w-4" aria-hidden /> Log out
      </DropdownMenuItem>
    </>
  );
}

/** Global search — Enter logs the query straight into the Describe box. */
function TopBarSearch() {
  const [q, setQ] = useState("");
  const requestLogger = useNutriStore((s) => s.requestLogger);
  const setView = useNutriStore((s) => s.setView);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function submit() {
    const text = q.trim();
    if (!text) return;
    requestLogger({ tab: "text", text });
    setView("log");
    setQ("");
    inputRef.current?.blur();
  }

  return (
    <div className="relative w-full max-w-xl flex-1">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input
        ref={inputRef}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") inputRef.current?.blur();
        }}
        placeholder="Search for foods, meals, or ask anything…"
        aria-label="Search for foods, meals, or ask anything — press Enter to describe it in the logger"
        className="h-11 rounded-2xl border-border/70 bg-background pr-16 pl-10 text-sm shadow-sm focus-visible:ring-2 focus-visible:ring-primary/30"
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded-md border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:flex">
        Ctrl + K
      </kbd>
    </div>
  );
}

/** Notification bell — quick jumps to the surfaces that need attention. */
function BellMenu() {
  const setView = useNutriStore((s) => s.setView);
  const items = [
    { icon: Trophy, title: "Milestones & badges", sub: "See what you have unlocked", view: "goals" as AppView },
    { icon: Droplets, title: "Hydration check-in", sub: "Log today's water glasses", view: "home" as AppView },
    { icon: BarChart3, title: "Weekly digest", sub: "Your week in review", view: "insights" as AppView },
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Notifications"
          className="relative flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Bell className="h-[18px] w-[18px]" aria-hidden />
          <span aria-hidden className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-background" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs">Reminders & progress</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.map(({ icon: Icon, title, sub, view }) => (
          <DropdownMenuItem key={title} className="cursor-pointer gap-2.5 py-2.5" onClick={() => setView(view)}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden>
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{title}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{sub}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Account block for the desktop top bar (avatar + name + dropdown). */
function TopBarAccount() {
  const user = useNutriStore((s) => s.user);
  if (!user) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="flex items-center gap-2.5 rounded-2xl border border-transparent py-1 pl-1 pr-2 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-sm font-bold text-white shadow-sm shadow-emerald-600/25">
            {initialsOf(user.name)}
          </span>
          <span className="hidden text-left xl:block">
            <span className="block max-w-[10rem] truncate text-sm font-semibold leading-tight">{user.name}</span>
            <span className="block text-[11px] leading-tight text-muted-foreground">Stay Healthy 🌱</span>
          </span>
          <ChevronDown className="hidden h-4 w-4 text-muted-foreground xl:block" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <AccountMenuItems />
      </DropdownMenuContent>
    </DropdownMenu>
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
            <div className="px-4 pb-6">
              <MobileAccountBlock />
            </div>
          </div>
        </div>
      )}

      {/* ---------- content canvas ---------- */}
      <div className="flex min-h-screen flex-col lg:pl-60">
        {/* desktop top bar */}
        {user && (
          <div className="sticky top-0 z-30 hidden border-b border-border/70 bg-[#f6f8f2]/85 backdrop-blur lg:block dark:bg-background/85">
            <div className="flex h-16 items-center gap-3 px-6">
              <TopBarSearch />
              <div className="ml-auto flex items-center gap-1.5">
                <ThemeToggle />
                <BellMenu />
                <TopBarAccount />
              </div>
            </div>
          </div>
        )}

        <main className="mx-auto w-full max-w-7xl flex-1 px-3 pb-10 pt-4 sm:px-5 sm:pt-6 lg:px-7">{children}</main>
        <footer className="mt-auto pb-[env(safe-area-inset-bottom)]">
          <div className="h-0.5 w-full bg-gradient-to-r from-primary/0 via-primary/40 to-teal-500/0" aria-hidden />
          <div className="mx-auto w-full max-w-7xl px-4 py-4 text-[11px] leading-relaxed text-muted-foreground">
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

/** Compact account row used inside the mobile drawer (openes the same menu). */
function MobileAccountBlock() {
  const user = useNutriStore((s) => s.user);
  const clearSession = useNutriStore((s) => s.clearSession);
  if (!user) return null;

  async function handleLogout() {
    try {
      await api.logout();
    } finally {
      clearSession();
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-xl border bg-background p-2.5 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
          aria-label="Account menu"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-xs font-bold text-white">
            {initialsOf(user.name)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{user.name}</span>
            <span className="block truncate text-[11px] text-muted-foreground">{user.email}</span>
          </span>
          <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <AccountMenuItems />
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
          <LogOut className="mr-2 h-4 w-4" aria-hidden /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
