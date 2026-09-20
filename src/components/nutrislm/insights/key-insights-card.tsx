"use client";

/**
 * Key Insights — rule-based highlights from the server (fiber progress, sugar,
 * hydration, …) with tone-colored icon chips and a "See all" trigger that
 * opens the full weekly digest report.
 */
import { Candy, Droplet, Flame, Gauge, Sparkles, TrendingUp, UtensilsCrossed, Wheat } from "lucide-react";
import { cn } from "@/lib/utils";
import { WeeklyDigestDialog } from "../weekly-digest";
import type { KeyInsight } from "@/lib/client/types";

const ICONS: Record<KeyInsight["icon"], React.ComponentType<{ className?: string }>> = {
  fiber: Wheat,
  sugar: Candy,
  hydration: Droplet,
  protein: UtensilsCrossed,
  sodium: Gauge,
  calories: Flame,
  streak: Flame,
  meals: UtensilsCrossed,
};

const TONE: Record<KeyInsight["tone"], { bg: string; fg: string }> = {
  positive: { bg: "bg-emerald-500/12", fg: "text-emerald-600 dark:text-emerald-400" },
  warning: { bg: "bg-rose-500/12", fg: "text-rose-500" },
  info: { bg: "bg-sky-500/12", fg: "text-sky-600 dark:text-sky-400" },
};

export function KeyInsightsCard({ insights }: { insights: KeyInsight[] }) {
  return (
    <section
      aria-label="Key insights"
      className="@container flex flex-col rounded-2xl border border-border/60 bg-card p-5 shadow-sm shadow-black/[0.03] transition-shadow duration-300 hover:shadow-md hover:shadow-primary/5 lg:col-span-3"
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400" aria-hidden>
            <Sparkles className="h-[18px] w-[18px]" />
          </span>
          <div>
            <h3 className="text-[15px] font-bold leading-tight">Key Insights</h3>
            <p className="hidden text-xs text-muted-foreground @[270px]:block">What your data is telling you</p>
          </div>
        </div>
        <WeeklyDigestDialog
          trigger={
            <button
              type="button"
              className="shrink-0 rounded-full border border-border/80 bg-background px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
              aria-label="Open the full weekly digest report"
            >
              See all
            </button>
          }
        />
      </header>

      <ul className="mt-4 flex-1 space-y-4">
        {insights.map((ins, i) => {
          const Icon = ICONS[ins.icon] ?? TrendingUp;
          const tone = TONE[ins.tone];
          return (
            <li key={ins.id} className="flex items-start gap-3">
              <span
                aria-hidden
                className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full", tone.bg, tone.fg)}
              >
                <Icon className="h-[17px] w-[17px]" />
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-bold leading-snug" style={{ animationDelay: `${i * 60}ms` }}>
                  {ins.title}
                </p>
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{ins.description}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
