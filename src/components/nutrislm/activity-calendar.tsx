"use client";

/**
 * Activity calendar — a deterministic, GitHub-style heatmap of the user's
 * logging history. Every cell is a day: colour encodes how that day's calories
 * compared with the personal target (database + profile only, never guessed).
 * Clicking a day opens a detail strip with that day's meals, calories and water.
 * Weeks / day buckets come from /api/nutrition/activity-calendar.
 */
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Droplets, Flame, Plus, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { api } from "@/lib/client/api";
import type { ActivityCalendarResponse, ActivityDay } from "@/lib/client/types";
import { MEAL_TYPE_ICON, useNutriStore } from "./store";

const WEEKS_OPTIONS = [8, 12, 26] as const;

const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

/** Colour level for a day, from calories vs the personal daily target. */
function levelOf(day: ActivityDay, target: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (day.meals === 0 || target <= 0) return 0;
  const ratio = day.calories / target;
  if (ratio < 0.5) return 1;
  if (ratio < 0.85) return 2;
  if (ratio <= 1.1) return 3;
  if (ratio <= 1.35) return 4;
  return 5;
}

const LEVEL_CLASS: Record<0 | 1 | 2 | 3 | 4 | 5, string> = {
  0: "bg-muted/70 border border-dashed border-border/60",
  1: "bg-emerald-200/80 dark:bg-emerald-900/80",
  2: "bg-emerald-400/80 dark:bg-emerald-700/90",
  3: "bg-emerald-500 dark:bg-emerald-500 shadow-[0_0_6px_-1px_rgba(16,185,129,0.55)]",
  4: "bg-amber-400/90 dark:bg-amber-500/90",
  5: "bg-rose-500/90 dark:bg-rose-500/90",
};

const LEVEL_HINT: Record<0 | 1 | 2 | 3 | 4 | 5, string> = {
  0: "no meals logged",
  1: "under half the target",
  2: "light day",
  3: "on target",
  4: "over target",
  5: "well over target",
};

function formatDay(dateKey: string): string {
  const d = new Date(dateKey + "T12:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function monthOf(dateKey: string): string {
  return new Date(dateKey + "T12:00:00").toLocaleDateString("en-GB", { month: "short" });
}

export function ActivityCalendar() {
  const dataVersion = useNutriStore((s) => s.dataVersion);
  const requestBackfill = useNutriStore((s) => s.requestBackfill);
  const setView = useNutriStore((s) => s.setView);
  const [data, setData] = useState<ActivityCalendarResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [weeks, setWeeks] = useState<number>(12);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .activityCalendar(weeks)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setError(null);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Could not load your activity calendar.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [weeks, dataVersion]);

  /** Range buttons: user-event state updates (allowed) + explicit loading state. */
  function switchWeeks(w: number) {
    if (w === weeks) return;
    setWeeks(w);
    setLoading(true);
    setSelected(null);
  }

  const columns = useMemo(() => {
    if (!data) return [] as (ActivityDay | null)[][];
    const out: (ActivityDay | null)[][] = [];
    for (let i = 0; i < data.days.length; i += 7) {
      out.push(data.days.slice(i, i + 7));
    }
    // Pad the final column so every column has 7 rows (future days -> null).
    if (out.length > 0) {
      const last = out[out.length - 1];
      while (last.length < 7) last.push(null);
    }
    return out;
  }, [data]);

  const selectedDay = data?.days.find((d) => d.date === selected) ?? null;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="size-4 text-primary" aria-hidden />
              Activity calendar
            </CardTitle>
            <CardDescription className="mt-1">
              Every square is a day — colour shows calories against your personal target. Click a day for its meals.
            </CardDescription>
          </div>
          <div role="group" aria-label="Calendar range" className="flex overflow-hidden rounded-md border">
            {WEEKS_OPTIONS.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => switchWeeks(w)}
                aria-pressed={weeks === w}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium transition-colors",
                  weeks === w ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted",
                )}
              >
                {w}w
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        {!data && !error && (
          <div className="space-y-2" aria-hidden>
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}

        {data && (
          <>
            {/* headline stats */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium",
                  data.streak > 0
                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                    : "bg-muted text-muted-foreground",
                )}
              >
                <Flame className="size-3.5" aria-hidden />
                {data.streak > 0 ? `${data.streak}-day logging streak` : "No active streak"}
              </span>
              <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 font-medium text-emerald-700 dark:text-emerald-400">
                {data.activeDays} of {data.days.length} days logged
              </span>
              <span className="hidden text-muted-foreground sm:inline">
                target {data.calorieTarget.toLocaleString()} kcal/day
              </span>
            </div>

            {/* heatmap */}
            <div className="overflow-x-auto pb-1">
              <div className="inline-flex min-w-full gap-[3px]" role="img" aria-label={`Activity heatmap for the last ${weeks} weeks`}>
                {/* weekday labels */}
                <div className="mr-1 flex flex-col gap-[3px] pt-[14px]" aria-hidden>
                  {WEEKDAY_LABELS.map((l, i) => (
                    <span key={i} className="flex h-[14px] w-3 items-center text-[9px] leading-none text-muted-foreground">
                      {i % 2 === 0 ? l : ""}
                    </span>
                  ))}
                </div>
                {columns.map((col, ci) => {
                  const firstReal = col.find((d): d is ActivityDay => d !== null);
                  const showMonth = firstReal && (ci === 0 || monthOf(columns[ci - 1].find((d): d is ActivityDay => d !== null)?.date ?? "") !== monthOf(firstReal.date));
                  return (
                    <div key={ci} className="flex flex-col gap-[3px]">
                      <span className="h-[11px] w-[14px] text-[9px] leading-none text-muted-foreground" aria-hidden>
                        {showMonth ? monthOf(firstReal!.date) : ""}
                      </span>
                      {col.map((day, ri) => {
                        if (!day) return <span key={ri} className="size-[14px]" aria-hidden />;
                        const lvl = levelOf(day, data.calorieTarget);
                        const isToday = day.date === data.today;
                        const isSelected = day.date === selected;
                        const isFuture = day.date > data.today;
                        if (isFuture) return <span key={ri} className="size-[14px]" aria-hidden />;
                        const waterHero = day.water >= 8;
                        return (
                          <button
                            key={ri}
                            type="button"
                            onClick={() => setSelected(isSelected ? null : day.date)}
                            aria-label={`${formatDay(day.date)}: ${day.meals === 0 ? "no meals" : `${day.meals} meal${day.meals === 1 ? "" : "s"}, ${day.calories.toLocaleString()} kcal, ${LEVEL_HINT[lvl]}`}${waterHero ? `, hydration hero ${day.water}/8` : ""}`}
                            aria-pressed={isSelected}
                            title={`${formatDay(day.date)} — ${day.meals === 0 ? "no meals" : `${day.calories.toLocaleString()} kcal · ${day.water}/8 glasses`}${waterHero ? " · hydration goal met" : ""}`}
                            className={cn(
                              "relative size-[14px] shrink-0 rounded-[3px] transition-all duration-100",
                              "hover:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                              "active:scale-95",
                              LEVEL_CLASS[lvl],
                              isToday && !isSelected && "ring-2 ring-foreground/70 ring-offset-1 ring-offset-background animate-today-pulse",
                              isSelected && "scale-125 ring-2 ring-foreground",
                            )}
                          >
                            {waterHero && (
                              <span
                                aria-hidden
                                className="absolute -bottom-[3px] -right-[3px] size-[6px] rounded-full border border-background bg-teal-500 shadow-[0_0_4px_rgba(20,184,166,0.7)]"
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* legend */}
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
              <span>Colour = day&apos;s calories vs target</span>
              <span className="flex items-center gap-1.5">
                <span className="flex items-center gap-1" aria-hidden>
                  less
                  {([0, 1, 2, 3, 4, 5] as const).map((l) => (
                    <span key={l} className={cn("size-[10px] rounded-[2px]", LEVEL_CLASS[l])} />
                  ))}
                  more
                </span>
                <span className="flex items-center gap-1" aria-hidden>
                  <span className="inline-block size-[6px] rounded-full border border-background bg-teal-500" />
                  = 8+ glasses
                </span>
              </span>
            </div>

            {/* day detail strip */}
            {selectedDay && (
              <div
                role="region"
                aria-label={`Details for ${formatDay(selectedDay.date)}`}
                className="rounded-lg border bg-gradient-to-br from-muted/60 to-transparent p-3 animate-in fade-in slide-in-from-bottom-2 duration-200"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{formatDay(selectedDay.date)}</p>
                    {selectedDay.date === data.today && (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">Today</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    aria-label="Close day details"
                    className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-90"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    // The logger lives on the Log Meal view — navigate there,
                    // then the logger consumes the backfill request on mount.
                    setView("log");
                    requestBackfill(selectedDay.date);
                    requestAnimationFrame(() =>
                      document.getElementById("log-food")?.scrollIntoView({ behavior: "smooth", block: "start" }),
                    );
                  }}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-xs font-medium text-primary transition-all hover:bg-primary/10 active:scale-[0.98]"
                >
                  <Plus className="size-3.5" aria-hidden />
                  Log a meal for this day
                </button>

                {selectedDay.meals === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">No meals logged this day.</p>
                ) : (
                  <div className="mt-2 space-y-3">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                      <span className="font-medium">
                        {selectedDay.calories.toLocaleString()}{" "}
                        <span className="font-normal text-muted-foreground">/ {data.calorieTarget.toLocaleString()} kcal</span>
                      </span>
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <Droplets className="size-3" aria-hidden />
                        {selectedDay.water}/8 glasses
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          levelOf(selectedDay, data.calorieTarget) >= 4
                            ? "bg-rose-500"
                            : levelOf(selectedDay, data.calorieTarget) >= 1
                              ? "bg-emerald-500"
                              : "bg-muted-foreground/40",
                        )}
                        style={{ width: `${Math.min(100, (selectedDay.calories / Math.max(1, data.calorieTarget)) * 100)}%` }}
                      />
                    </div>
                    <ul className="space-y-1.5">
                      {selectedDay.items.map((m) => (
                        <li key={m.id} className="flex items-center gap-2 text-xs">
                          <span aria-hidden className="text-sm">{MEAL_TYPE_ICON[m.mealType] ?? MEAL_TYPE_ICON.snack}</span>
                          <span className="font-medium capitalize">{m.mealType}</span>
                          <span className="min-w-0 flex-1 truncate text-muted-foreground">{m.foods}</span>
                          <span className="shrink-0 font-mono tabular-nums">{m.kcal} kcal</span>
                        </li>
                      ))}
                    </ul>
                    {selectedDay.items.length < selectedDay.meals && (
                      <p className="text-[10px] text-muted-foreground">+{selectedDay.meals - selectedDay.items.length} more meal(s) this day</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
