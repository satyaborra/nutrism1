"use client";

/**
 * Appearance — the reference design's Light / Dark switch, upgraded to large
 * touch-friendly segmented buttons with a live caption that describes the
 * active mode. Real next-themes wiring ("applies instantly" is literal).
 */
import { useEffect, useState } from "react";
import { Moon, Sun, SunMoon } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

export function AppearanceCard() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const dark = mounted && resolvedTheme === "dark";

  return (
    <section
      aria-label="Appearance"
      className="flex flex-col rounded-3xl border border-border/60 bg-card p-5 shadow-sm shadow-black/[0.03]"
    >
      <header>
        <h2 className="flex items-center gap-2 text-base font-bold tracking-tight">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-500 dark:bg-amber-500/15 dark:text-amber-400"
            aria-hidden
          >
            <SunMoon className="h-4 w-4" />
          </span>
          Appearance
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          Comfortable in both day and night kitchens.
        </p>
      </header>

      <div className="mt-4 grid grid-cols-2 gap-2" role="group" aria-label="Theme">
        <button
          type="button"
          onClick={() => setTheme("light")}
          aria-pressed={mounted && !dark}
          className={cn(
            "flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all duration-150 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-ring",
            mounted && !dark
              ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
              : "border border-border/70 bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Sun className="h-4 w-4" aria-hidden /> Light
        </button>
        <button
          type="button"
          onClick={() => setTheme("dark")}
          aria-pressed={dark}
          className={cn(
            "flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all duration-150 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-ring",
            dark
              ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
              : "border border-border/70 bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Moon className="h-4 w-4" aria-hidden /> Dark
        </button>
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground" aria-live="polite">
        {mounted ? (
          dark ? (
            <>
              <Moon className="h-3 w-3 shrink-0" aria-hidden />
              <span key="dark" className="animate-in fade-in slide-in-from-right-1 duration-300">
                Dimmed surfaces for evening logging — easier on night-shift eyes.
              </span>
            </>
          ) : (
            <>
              <Sun className="h-3 w-3 shrink-0" aria-hidden />
              <span key="light" className="animate-in fade-in slide-in-from-right-1 duration-300">
                Bright counters and daylight cards — applies instantly across the app.
              </span>
            </>
          )
        ) : (
          <span className="opacity-0" aria-hidden>
            placeholder
          </span>
        )}
      </p>
    </section>
  );
}
