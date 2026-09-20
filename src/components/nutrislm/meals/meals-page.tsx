"use client";

/**
 * Meals page — reference-design rebuild:
 * hero → 4 stat cards → [ timeline | right rail ] → recent meals strip.
 * Data: daily-summary (selected date), insights 7d (streak/sparkline/water),
 * recent-meals, activity-calendar 10w (week/month views).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ArrowRight, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/client/api";
import { mealImageFor } from "@/lib/client/meal-images";
import type {
  ActivityCalendarResponse,
  DailySummaryResponse,
  InsightsResponse,
  RecentMealsResponse,
} from "@/lib/client/types";
import { FadeIn } from "../fade-in";
import { useNutriStore } from "../store";
import { MealsHero } from "./meals-hero";
import { MealsStats } from "./meals-stats";
import { MealsTimeline, type MealsRange } from "./meals-timeline";
import { MealsRail } from "./meals-rail";

function todayKey(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

function relDayLabel(iso: string): string {
  try {
    return format(new Date(iso), "d MMM, hh:mm a");
  } catch {
    return "";
  }
}

function RecentStrip() {
  const [data, setData] = useState<RecentMealsResponse | null>(null);
  const [showAll, setShowAll] = useState(false);
  const dataVersion = useNutriStore((s) => s.dataVersion);
  const requestLogger = useNutriStore((s) => s.requestLogger);
  const setView = useNutriStore((s) => s.setView);
  const { toast } = useToast();

  useEffect(() => {
    let alive = true;
    api
      .recentMeals()
      .then((d) => alive && setData(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [dataVersion]);

  const visible = showAll ? (data?.meals ?? []).slice(0, 8) : (data?.meals ?? []).slice(0, 4);

  return (
    <Card className="rounded-3xl border-border/60 shadow-sm shadow-black/[0.03]">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-bold tracking-tight">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400" aria-hidden>
              <History className="h-3.5 w-3.5" />
            </span>
            Recent Meals
          </p>
          {(data?.meals.length ?? 0) > 4 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 rounded-lg px-2 text-xs font-semibold text-primary hover:bg-primary/10 hover:text-primary"
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll ? "Show less" : "View all"} <ArrowRight className="h-3 w-3" aria-hidden />
            </Button>
          )}
        </div>

        {!data ? (
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-36 rounded-2xl" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
            No recent meals yet — your logged history will appear here.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visible.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  const text = m.foods.map((f) => f.name).join(" + ");
                  requestLogger({ tab: "text", text });
                  setView("log");
                  toast({ title: "Added to the logger", description: "Review and calculate to log this again." });
                }}
                title={`Log again: ${m.foods.map((f) => f.name).join(" + ")}`}
                className="group overflow-hidden rounded-2xl border border-border/60 bg-card text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md hover:shadow-primary/5 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <div className="relative h-20 w-full overflow-hidden sm:h-24">
                  <img
                    src={mealImageFor(m.foods.map((f) => f.name).join(" "), m.mealType)}
                    alt=""
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.05]"
                    loading="lazy"
                  />
                  <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm tabular-nums">
                    {Math.round(m.totals.calories ?? 0)} kcal
                  </span>
                </div>
                <div className="p-2.5">
                  <p className="truncate text-xs font-bold tracking-tight">{m.foods.map((f) => f.name).join(" + ")}</p>
                  <p className="mt-0.5 text-[10.5px] font-medium text-muted-foreground">{relDayLabel(m.eatenAt)}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function MealsPage() {
  const dataVersion = useNutriStore((s) => s.dataVersion);
  const [range, setRange] = useState<MealsRange>("today");
  const [viewDate, setViewDate] = useState<string>(todayKey);
  const [summary, setSummary] = useState<DailySummaryResponse | null>(null);
  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [calendar, setCalendar] = useState<ActivityCalendarResponse | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingMeta, setLoadingMeta] = useState(true);

  // selected-date summary
  useEffect(() => {
    let alive = true;
    api
      .dailySummary(viewDate)
      .then((d) => alive && setSummary(d))
      .catch(() => alive && setSummary(null))
      .finally(() => alive && setLoadingSummary(false));
    return () => {
      alive = false;
    };
  }, [viewDate, dataVersion]);

  // window-level data (insights + calendar)
  useEffect(() => {
    let alive = true;
    Promise.all([api.insights(7), api.activityCalendar(10)])
      .then(([ins, cal]) => {
        if (!alive) return;
        setInsights(ins);
        setCalendar(cal);
      })
      .catch(() => {})
      .finally(() => alive && setLoadingMeta(false));
    return () => {
      alive = false;
    };
  }, [dataVersion]);

  const loading = loadingSummary || loadingMeta;
  const statsLoading = loadingMeta; // stat values that depend on insights

  return (
    <div className="space-y-4 sm:space-y-5">
      <FadeIn>
        <MealsHero />
      </FadeIn>

      <FadeIn delay={0.05}>
        <MealsStats summary={summary} insights={insights} loading={statsLoading} />
      </FadeIn>

      <div className="grid grid-cols-1 items-start gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
        <FadeIn delay={0.1} className="min-w-0">
          <div className="space-y-4 sm:space-y-5">
            <MealsTimeline
              range={range}
              onRangeChange={setRange}
              viewDate={viewDate}
              onViewDateChange={setViewDate}
              summary={summary}
              calendar={calendar}
              loading={loadingSummary}
            />
            <RecentStrip />
          </div>
        </FadeIn>
        <FadeIn delay={0.15} className="min-w-0">
          <MealsRail summary={summary} insights={insights} />
        </FadeIn>
      </div>
    </div>
  );
}
