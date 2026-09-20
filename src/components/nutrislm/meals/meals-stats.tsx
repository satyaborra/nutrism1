"use client";

/**
 * Meals hero stat row — Total Intake (with delta + sparkline), Daily Target
 * (progress bar), Meals Logged (slot dots) and Streak. All numbers come from
 * the deterministic daily-summary + insights endpoints.
 */
import { ArrowDownRight, ArrowUpRight, Flame, Leaf, Sparkles, Target, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sparkline } from "../insights/sparkline";
import type { DailySummaryResponse, InsightsResponse } from "@/lib/client/types";

const CARD =
  "group rounded-2xl border border-border/60 bg-card p-4 shadow-sm shadow-black/[0.03] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md hover:shadow-primary/5";

const MEAL_SLOTS = 5;

export function MealsStats({
  summary,
  insights,
  loading,
}: {
  summary: DailySummaryResponse | null;
  insights: InsightsResponse | null;
  loading: boolean;
}) {
  const consumed = summary?.consumed.calories ?? 0;
  const target = summary?.targets.calories ?? 0;
  const mealCount = summary?.meals.length ?? 0;

  // delta vs yesterday from the insights per-day series (last two entries)
  const perDay = insights?.perDay ?? [];
  const todayCal = perDay.length > 0 ? perDay[perDay.length - 1].calories : 0;
  const yestCal = perDay.length > 1 ? perDay[perDay.length - 2].calories : 0;
  let deltaPct: number | null = null;
  if (yestCal > 0 && perDay.length > 1) {
    deltaPct = Math.round(((todayCal - yestCal) / yestCal) * 100);
  }
  const direction = deltaPct === null || deltaPct === 0 ? "flat" : deltaPct < 0 ? "down" : "up";

  const pctAchieved = target > 0 ? Math.round((consumed / target) * 100) : 0;
  const streak = insights?.streak ?? 0;
  const dots = Array.from({ length: MEAL_SLOTS }, (_, i) => i < mealCount);

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      {/* ---- Total Intake ---- */}
      <div className={cn(CARD, "min-w-0")}>
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-100 to-rose-100 text-orange-500 transition-transform duration-300 group-hover:scale-105 dark:from-orange-500/15 dark:to-rose-500/15"
            aria-hidden
          >
            <Flame className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-muted-foreground">Total Intake</p>
            {loading ? (
              <div className="mt-1 h-6 w-20 animate-pulse rounded bg-muted" aria-label="Loading total intake" />
            ) : (
              <p className="text-xl font-bold leading-tight tracking-tight tabular-nums">
                {Math.round(consumed).toLocaleString("en-US")}{" "}
                <span className="text-sm font-semibold text-muted-foreground">kcal</span>
              </p>
            )}
          </div>
        </div>
        <div className="mt-2.5 flex items-end justify-between gap-2">
          {deltaPct === null ? (
            <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <Minus className="h-3 w-3" aria-hidden /> vs yesterday
            </p>
          ) : (
            <p
              className={cn(
                "flex items-center gap-0.5 text-xs font-semibold",
                direction === "down" ? "text-emerald-600 dark:text-emerald-400" : direction === "up" ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
              )}
            >
              {direction === "down" ? (
                <ArrowDownRight className="h-3.5 w-3.5" aria-hidden />
              ) : direction === "up" ? (
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Minus className="h-3 w-3" aria-hidden />
              )}
              {Math.abs(deltaPct)}% <span className="font-medium text-muted-foreground">vs yesterday</span>
            </p>
          )}
          <Sparkline
            values={insights?.kpis.calories.sparkline ?? []}
            color="#10b981"
            id="meals-intake"
            className="h-7 w-[72px] shrink-0"
          />
        </div>
      </div>

      {/* ---- Daily Target ---- */}
      <div className={cn(CARD, "min-w-0")}>
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-100 to-cyan-100 text-sky-500 transition-transform duration-300 group-hover:scale-105 dark:from-sky-500/15 dark:to-cyan-500/15"
            aria-hidden
          >
            <Target className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-muted-foreground">Daily Target</p>
            {loading ? (
              <div className="mt-1 h-6 w-24 animate-pulse rounded bg-muted" aria-label="Loading daily target" />
            ) : (
              <p className="text-xl font-bold leading-tight tracking-tight tabular-nums">
                {target.toLocaleString("en-US")}{" "}
                <span className="text-sm font-semibold text-muted-foreground">kcal</span>
              </p>
            )}
          </div>
        </div>
        <div className="mt-3">
          <div
            role="progressbar"
            aria-label="Daily target progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(100, pctAchieved)}
            className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
          >
            <div
              className="relative h-full rounded-full bg-gradient-to-r from-emerald-500 via-emerald-500 to-teal-400 transition-[width] duration-700 ease-out"
              style={{ width: `${Math.min(100, pctAchieved)}%` }}
            >
              <span aria-hidden className="absolute inset-x-1 top-0.5 h-1 rounded-full bg-white/25" />
            </div>
          </div>
          <p className="mt-1.5 text-xs font-medium text-muted-foreground">{pctAchieved}% achieved</p>
        </div>
      </div>

      {/* ---- Meals Logged ---- */}
      <div className={cn(CARD, "min-w-0")}>
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100 text-emerald-600 transition-transform duration-300 group-hover:scale-105 dark:from-emerald-500/15 dark:to-teal-500/15"
            aria-hidden
          >
            <Leaf className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-muted-foreground">Meals Logged</p>
            {loading ? (
              <div className="mt-1 h-6 w-14 animate-pulse rounded bg-muted" aria-label="Loading meals logged" />
            ) : (
              <p className="text-xl font-bold leading-tight tracking-tight tabular-nums">
                {mealCount} <span className="text-base font-semibold text-muted-foreground">/ {MEAL_SLOTS}</span>
              </p>
            )}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1.5" aria-label={`${mealCount} of ${MEAL_SLOTS} meal slots logged`}>
          {dots.map((filled, i) => (
            <span
              key={i}
              aria-hidden
              className={cn(
                "h-3.5 w-3.5 rounded-full transition-all duration-300",
                filled
                  ? "bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-sm shadow-emerald-600/30"
                  : "bg-muted ring-1 ring-inset ring-border",
              )}
            />
          ))}
        </div>
      </div>

      {/* ---- Streak ---- */}
      <div className={cn(CARD, "relative min-w-0 overflow-hidden")}>
        <div aria-hidden className="pointer-events-none absolute -right-6 -top-8 h-20 w-20 rounded-full bg-amber-400/15 blur-2xl" />
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-100 to-yellow-100 text-amber-500 transition-transform duration-300 group-hover:scale-105 dark:from-amber-500/15 dark:to-yellow-500/15"
            aria-hidden
          >
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-muted-foreground">Streak</p>
            {loading ? (
              <div className="mt-1 h-6 w-16 animate-pulse rounded bg-muted" aria-label="Loading streak" />
            ) : (
              <p className="text-xl font-bold leading-tight tracking-tight tabular-nums">
                {streak} <span className="text-sm font-semibold text-muted-foreground">days</span>
              </p>
            )}
          </div>
        </div>
        <p className="mt-2.5 text-xs font-medium text-primary">{streak > 0 ? "Keep it going!" : "Log today to start"}</p>
      </div>
    </div>
  );
}
