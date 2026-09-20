"use client";

/**
 * AI Coach home card (spec §31) — "Your nutrition snapshot is ready."
 * Compact teaser built from the home dashboard's already-verified daily
 * summary; the CTA opens the full Coach screen.
 */
import { ArrowRight, Bot, Flame, Salad } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNutriStore } from "../store";
import type { DailySummaryResponse } from "@/lib/client/types";

export function CoachHomeCard({ summary }: { summary: DailySummaryResponse }) {
  const setView = useNutriStore((s) => s.setView);
  const remaining = summary.remaining;
  const mealsCount = summary.meals.length;

  return (
    <section
      aria-label="AI Coach snapshot"
      className="depth-hover relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-teal-500/10 p-5 shadow-sm dark:from-primary/15 dark:to-teal-500/15"
    >
      <div aria-hidden className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex flex-wrap items-center gap-4">
        <span className="glass-sheen flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-md shadow-emerald-600/25">
          <Bot className="h-6 w-6" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-primary/80">AI Coach</p>
          <p className="text-sm font-bold tracking-tight">Your nutrition snapshot is ready.</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Salad className="h-3 w-3 text-primary" aria-hidden />
              {mealsCount} meal{mealsCount === 1 ? "" : "s"} logged
            </span>
            <span className="inline-flex items-center gap-1">
              <Flame className="h-3 w-3 text-orange-500" aria-hidden />
              {Math.round(summary.consumed.calories).toLocaleString()} kcal eaten
            </span>
            <span>
              {Math.round(remaining.calories).toLocaleString()} kcal remaining
            </span>
            <span className="hidden sm:inline">
              {Math.round(remaining.protein)}g protein · {Math.round(remaining.fiber)}g fiber to go
            </span>
          </p>
        </div>
        <Button
          size="sm"
          className="h-9 gap-1.5 rounded-xl px-3.5 text-xs font-semibold shadow-md shadow-primary/25"
          onClick={() => setView("coach")}
        >
          Plan the rest of my day
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>
    </section>
  );
}
