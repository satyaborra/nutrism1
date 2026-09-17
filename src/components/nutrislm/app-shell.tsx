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
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-4 py-4 text-xs text-muted-foreground sm:flex-row">
          <p>
            <span className="font-semibold text-foreground">NutriSLM</span> — multimodal personalized nutrition
            intelligence. AI understands, the database answers, deterministic code calculates.
          </p>
          <p>Nutrition values from IFCT 2017 / USDA references. Not medical advice.</p>
        </div>
      </footer>
    </div>
  );
}
