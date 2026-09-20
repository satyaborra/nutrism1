"use client";

/**
 * Insights page — the reference-design dashboard:
 *   Row 0: title + script motto + range selector (+ journal)
 *   Row 1: five KPI cards
 *   Row 2: Calorie Trend · Macro Distribution · Meal Timing
 *   Row 3: Nutrient Intake · Weekly Mood & Energy · Key Insights
 *   Row 4: Top Food Categories · Motivation · Ask NutriSLM Coach
 * All numbers come from /api/nutrition/insights (deterministic aggregation).
 */
import { useCallback, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { BookOpenCheck, CalendarDays, ChevronDown, Heart, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/client/api";
import { useNutriStore } from "../store";
import { NotesJournal } from "../notes-journal";
import { FadeIn } from "../fade-in";
import { KpiCards } from "./kpi-cards";
import { CalorieTrendCard } from "./calorie-trend-card";
import { MacroDonutCard } from "./macro-donut-card";
import { MealTimingCard } from "./meal-timing-card";
import { NutrientIntakeCard } from "./nutrient-intake-card";
import { MoodEnergyCard } from "./mood-energy-card";
import { KeyInsightsCard } from "./key-insights-card";
import { TopCategoriesCard } from "./top-categories-card";
import { QuoteCard } from "./quote-card";
import { CoachCard } from "./coach-card";
import type { InsightsResponse } from "@/lib/client/types";

const RANGES = [7, 14, 30] as const;

function rangeLabel(days: number): string {
  return days === 7 ? "Last 7 days" : days === 14 ? "Last 14 days" : "Last 30 days";
}

function comparisonLabel(days: number): string {
  return days === 7 ? "vs last week" : `vs previous ${days} days`;
}

function InsightsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading insights">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Skeleton className="h-80 rounded-2xl lg:col-span-6" />
        <Skeleton className="h-80 rounded-2xl lg:col-span-3" />
        <Skeleton className="h-80 rounded-2xl lg:col-span-3" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Skeleton className="h-72 rounded-2xl lg:col-span-4" />
        <Skeleton className="h-72 rounded-2xl lg:col-span-5" />
        <Skeleton className="h-72 rounded-2xl lg:col-span-3" />
      </div>
    </div>
  );
}

export function InsightsPage() {
  const dataVersion = useNutriStore((s) => s.dataVersion);
  const [days, setDays] = useState<number>(7);
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [journalOpen, setJournalOpen] = useState(false);

  /** Event-handler retry (the effect below handles automatic refetches silently). */
  const fetchInsights = useCallback((windowDays: number) => {
    setLoading(true);
    api
      .insights(windowDays)
      .then((res) => {
        setData(res);
        setError(false);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let alive = true;
    api
      .insights(days)
      .then((res) => {
        if (alive) {
          setData(res);
          setError(false);
        }
      })
      .catch(() => {
        if (alive) setError(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [days, dataVersion]);

  return (
    <div className="space-y-5">
      {/* ---------- header ---------- */}
      <FadeIn>
        <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div>
            <h1 className="text-[1.7rem] font-extrabold leading-tight tracking-tight sm:text-[2rem]">
              Your <span className="text-primary">Nutrition</span> Insights
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Real data. Meaningful insights. A healthier you.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <p className="font-script mr-1 hidden text-[1.45rem] font-medium leading-[1.05] text-primary xl:block" aria-hidden>
              Understand Today,
              <br />
              Build a Healthier Tomorrow{" "}
              <Heart className="inline h-4 w-4 fill-primary/60 text-primary/60" />
            </p>
            <img
              src="/images/hero-leaves.png"
              alt=""
              aria-hidden
              className="hidden h-16 w-16 object-contain opacity-80 [mask-image:radial-gradient(closest-side,black,transparent)] lg:block dark:hidden"
            />

            <Dialog open={journalOpen} onOpenChange={setJournalOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 gap-2 rounded-xl border-border/70 bg-background shadow-sm"
                >
                  <BookOpenCheck className="h-4 w-4 text-primary" aria-hidden />
                  <span className="hidden sm:inline">Journal</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-base">
                    <BookOpenCheck className="h-4 w-4 text-primary" aria-hidden />
                    Notes journal
                  </DialogTitle>
                  <DialogDescription>
                    Reflections from your meal notes — feelings only, never nutrition numbers.
                  </DialogDescription>
                </DialogHeader>
                <NotesJournal />
              </DialogContent>
            </Dialog>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 gap-2 rounded-xl border-border/70 bg-background shadow-sm"
                  aria-label={`Range: ${rangeLabel(days)} — change`}
                >
                  <CalendarDays className="h-4 w-4 text-primary" aria-hidden />
                  {rangeLabel(days)}
                  <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {RANGES.map((r) => (
                  <DropdownMenuItem
                    key={r}
                    className="cursor-pointer"
                    onClick={() => setDays(r)}
                    aria-current={days === r ? "true" : undefined}
                  >
                    {rangeLabel(r)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
      </FadeIn>

      {/* ---------- content ---------- */}
      {error && data === null ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/60 bg-card py-16 text-center">
          <TriangleAlert className="h-8 w-8 text-amber-500" aria-hidden />
          <div>
            <p className="font-semibold">Insights are unavailable right now</p>
            <p className="mt-1 text-sm text-muted-foreground">We couldn&apos;t load your nutrition data. Please try again.</p>
          </div>
          <Button size="sm" className="mt-1 gap-2 rounded-xl" onClick={() => fetchInsights(days)}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Retry
          </Button>
        </div>
      ) : loading && data === null ? (
        <InsightsSkeleton />
      ) : data ? (
        <>
          <FadeIn delay={0.05}>
            <KpiCards data={data} comparisonLabel={comparisonLabel(data.days)} />
          </FadeIn>

          <FadeIn delay={0.1}>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              <CalorieTrendCard data={data} />
              <MacroDonutCard data={data} />
              <MealTimingCard data={data} />
            </div>
          </FadeIn>

          <FadeIn delay={0.15}>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              <NutrientIntakeCard data={data} />
              <MoodEnergyCard data={data} />
              <KeyInsightsCard insights={data.keyInsights} />
            </div>
          </FadeIn>

          <FadeIn delay={0.2}>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              <TopCategoriesCard data={data} />
              <QuoteCard />
              <CoachCard />
            </div>
          </FadeIn>

          <p className="text-center text-[11px] text-muted-foreground">
            {format(parseISO(`${data.range.start}T12:00:00`), "d MMM")} – {format(parseISO(`${data.range.end}T12:00:00`), "d MMM yyyy")} ·{" "}
            {data.daysLogged} day{data.daysLogged === 1 ? "" : "s"} logged · averages are per logged day
          </p>
        </>
      ) : null}
    </div>
  );
}
