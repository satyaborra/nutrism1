"use client";

/**
 * App chrome: sticky header (logo, theme toggle, user menu) and sticky footer.
 * Root wrapper is min-h-screen flex-col; footer uses mt-auto so it sticks to
 * the bottom on short pages and is pushed down naturally on long ones.
 */
import { useTheme } from "next-themes";
import { LogOut, Moon, Salad, Sun, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNutriStore } from "./store";
import { api } from "@/lib/client/api";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      {/* CSS-driven icons avoid hydration mismatch without mount effects */}
      <Moon className="h-4 w-4 dark:hidden" aria-hidden />
      <Sun className="hidden h-4 w-4 dark:block" aria-hidden />
    </Button>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const user = useNutriStore((s) => s.user);
  const clearSession = useNutriStore((s) => s.clearSession);

  async function handleLogout() {
    try {
      await api.logout();
    } finally {
      clearSession();
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4">
          <a href="/" className="flex items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-ring">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Salad className="h-5 w-5" aria-hidden />
            </span>
            <span className="text-lg font-bold tracking-tight">
              Nutri<span className="text-primary">SLM</span>
            </span>
            <span className="sr-only">NutriSLM home</span>
          </a>

          <div className="flex items-center gap-1">
            <ThemeToggle />
            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2" aria-label="Account menu">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-primary">
                      <UserRound className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="hidden max-w-[10rem] truncate sm:inline">{user.name}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
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
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-10 pt-6">{children}</main>

      <footer className="mt-auto border-t bg-muted/40 pb-[env(safe-area-inset-bottom)]">
        {/* Accent hairline echoing the brand gradient */}
        <div className="h-0.5 w-full bg-gradient-to-r from-primary/0 via-primary/50 to-teal-500/0" aria-hidden />
        <div className="mx-auto w-full max-w-6xl px-4 py-5 text-xs text-muted-foreground">
          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:justify-between sm:gap-8 sm:text-left">
            <div className="max-w-sm space-y-1.5">
              <p className="flex items-center justify-center gap-1.5 sm:justify-start">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary text-primary-foreground" aria-hidden>
                  <Salad className="h-3 w-3" />
                </span>
                <span className="text-sm font-bold tracking-tight text-foreground">
                  Nutri<span className="text-primary">SLM</span>
                </span>
              </p>
              <p>
                Multimodal personalized nutrition intelligence. AI understands, the database answers, deterministic code
                calculates — never the other way around.
              </p>
            </div>
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground/70">Data sources</p>
              <ul className="space-y-0.5">
                <li>IFCT 2017 · USDA food references</li>
                <li>WHO · ICMR-NIN · ADA · KDIGO guidance</li>
              </ul>
            </div>
            <div className="max-w-xs space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground/70">Disclaimer</p>
              <p>Not medical advice. Constraints are configurable starting points — confirm clinical targets with your care team.</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
