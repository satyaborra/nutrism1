"use client";

/**
 * Meals view — mockup-faithful rebuild:
 *  • Emerald hero with four live StatCards (Total Intake vs yesterday +
 *    7-day sparkline, Daily Target, Meals Logged, Streak).
 *  • Tabs — Today (meal timeline with inline expand), This Week (activity
 *    calendar), This Month (calendar + full meal history) — plus a day
 *    navigator (never into the future).
 *  • Right rail — Log a Meal, Quick Add (water logs instantly via the
 *    hydration API), Today's Nutrients donut rings, quote card.
 *  • Full-width horizontal "Recent Meals" strip.
 *
 * Every number is server data (daily-summary ×2, weekly-summary,
 * recent-meals, hydration) — the client only formats. Failures are
 * console.warn'ed and degrade gracefully; nothing crashes.
 */
import { useEffect, useState, type ReactNode } from "react";
import { addDays, format, parseISO } from "date-fns";
import {
  ArrowRight,
  CalendarDays,
  Camera,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Flame,
  Heart,
  History,
  Leaf,
  Moon,
  Plus,
  Sparkles,
  Sun,
  Sunrise,
  Target,
  UtensilsCrossed,
  Wheat,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { RecentMeals } from "../recent-meals";
import { ActivityCalendar } from "../activity-calendar";
import { FadeIn } from "../fade-in";
import { Donut } from "../donut";
import { mealLabel, useNutriStore } from "../store";
import { ConfidenceBadge, ProvenanceLine, TargetExplainer } from "../xai";
import { api } from "@/lib/client/api";
import { formatGrams, formatKcal, pct, todayKey } from "@/lib/client/format";
import { mealImageFor } from "@/lib/client/meal-images";
import type { DailySummaryResponse, MealDetail, WeeklySummaryResponse } from "@/lib/client/types";
import { Sparkline, StatCard, ViewHero, type Tone } from "./view-hero";

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

/** Shift a YYYY-MM-DD key by N days (local time, noon-anchored). */
function shiftDayKey(key: string, days: number): string {
  return format(addDays(parseISO(`${key}T12:00:00`), days), "yyyy-MM-dd");
}

/** "08:30 AM" from an ISO datetime — never crashes on bad input. */
function timeLabel(iso: string): string {
  const d = parseISO(iso);
  return Number.isNaN(d.getTime()) ? "—" : format(d, "hh:mm a");
}

/** "Fri 19 Sep, 08:30 AM" from an ISO datetime. */
function dayTimeLabel(iso: string): string {
  const d = parseISO(iso);
  return Number.isNaN(d.getTime()) ? "—" : format(d, "EEE d MMM, hh:mm a");
}

/** Timeline rail chip per meal slot (tinted circle + connector line). */
const SLOT_META: Record<string, { icon: ReactNode; chip: string; title: string }> = {
  breakfast: { icon: <Sunrise className="h-4 w-4" />, chip: "bg-amber-500/15 text-amber-600 dark:text-amber-400", title: "Breakfast" },
  lunch: { icon: <Sun className="h-4 w-4" />, chip: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", title: "Lunch" },
  snack: { icon: <Coffee className="h-4 w-4" />, chip: "bg-orange-500/15 text-orange-600 dark:text-orange-400", title: "Snack" },
  dinner: { icon: <Moon className="h-4 w-4" />, chip: "bg-rose-500/15 text-rose-600 dark:text-rose-400", title: "Dinner" },
};

function slotMeta(mealType: string) {
  return SLOT_META[mealType] ?? SLOT_META.snack;
}

/**
 * Honest provenance badge. The API's meal.source is "text" | "manual" |
 * "image" | "recommendation" | "relog" — there is no "verified"/"photo"
 * value, so: "Verified ✓" only when every food line matched the verified DB
 * food library (foodId non-null); "From Scan" for photo-logged meals that
 * are not fully matched. Everything else shows no badge.
 */
function SourceBadge({ meal }: { meal: MealDetail }) {
  const allMatched = meal.foods.length > 0 && meal.foods.every((f) => f.foodId !== null);
  if (allMatched) {
    return (
      <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
        Verified ✓
      </Badge>
    );
  }
  if (meal.source === "image") {
    return (
      <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-medium text-muted-foreground">
        From Scan
      </Badge>
    );
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Hero stat cards                                                     */
/* ------------------------------------------------------------------ */

interface HeroData {
  today: DailySummaryResponse;
  yesterday: DailySummaryResponse | null;
  week: WeeklySummaryResponse;
}

function MealsHeroStats({ hero }: { hero: HeroData }) {
  const { today, yesterday, week } = hero;
  const kcal = today.consumed.calories;
  const target = today.targets.calories;
  const mealsLogged = today.meals.length;

  // vs-yesterday delta — only when a comparable baseline exists.
  const yKcal = yesterday?.consumed.calories ?? null;
  let deltaSub: ReactNode = "First logged day";
  let deltaTone: "muted" | "up" | "down" = "muted";
  if (yKcal !== null) {
    if (yKcal <= 0) {
      deltaSub = "No intake logged yesterday";
    } else {
      const delta = Math.round(((kcal - yKcal) / yKcal) * 100);
      if (delta > 0) {
        deltaSub = `↑ ${delta}% vs yesterday`;
        deltaTone = "up";
      } else if (delta < 0) {
        deltaSub = `↓ ${Math.abs(delta)}% vs yesterday`;
        deltaTone = "down";
      } else {
        deltaSub = "Same as yesterday";
      }
    }
  }

  return (
    <>
      <StatCard
        icon={<Flame className="h-4 w-4" aria-hidden />}
        tone="rose"
        label="Total Intake"
        value={formatKcal(kcal)}
        sub={deltaSub}
        subTone={deltaTone}
        extra={<Sparkline data={week.days.map((d) => d.calories)} tone="rose" />}
      />
      <StatCard
        icon={<Target className="h-4 w-4" aria-hidden />}
        tone="emerald"
        label="Daily Target"
        value={formatKcal(target)}
        progress={target > 0 ? kcal / target : 0}
        sub={`${pct(kcal, target)}% achieved`}
      />
      <StatCard
        icon={<Leaf className="h-4 w-4" aria-hidden />}
        tone="teal"
        label="Meals Logged"
        value={`${mealsLogged} / 5`}
        extra={
          <span className="flex items-center gap-1" role="img" aria-label={`${mealsLogged} of 5 meal slots logged today`}>
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i} aria-hidden className={cn("h-2.5 w-2.5 rounded-full", i < mealsLogged ? "bg-primary" : "bg-primary/20")} />
            ))}
          </span>
        }
      />
      <StatCard
        icon={<Sparkles className="h-4 w-4" aria-hidden />}
        tone="amber"
        label="Streak"
        value={`${week.streak} ${week.streak === 1 ? "day" : "days"}`}
        sub="Keep it going!"
      />
    </>
  );
}

/** Skeleton shell mirroring StatCard while the summaries load. */
function HeroStatSkeletons() {
  return (
    <>
      <span className="sr-only">Loading meal stats…</span>
      {[0, 1, 2, 3].map((i) => (
        <Card key={i} className="rounded-2xl border-primary/10 bg-card/90 p-4 shadow-sm backdrop-blur-sm" aria-busy="true">
          <div className="flex items-center gap-3" aria-hidden>
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <span className="block min-w-0 space-y-2">
              <Skeleton className="block h-3 w-16" />
              <Skeleton className="block h-5 w-24" />
            </span>
          </div>
        </Card>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Timeline pieces                                                     */
/* ------------------------------------------------------------------ */

/** P/C/F macro chips with tiny colour-coded dots + grams from meal totals. */
function MacroChips({ totals }: { totals: MealDetail["totals"] }) {
  const macros = [
    { k: "P", v: totals.protein, dot: "bg-emerald-500" },
    { k: "C", v: totals.carbohydrates, dot: "bg-sky-500" },
    { k: "F", v: totals.fat, dot: "bg-orange-500" },
  ];
  return (
    <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
      {macros.map((m) => (
        <span key={m.k} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", m.dot)} />
          <span className="font-semibold text-foreground/80">{m.k}</span>
          <span className="tabular-nums">{formatGrams(m.v)}</span>
        </span>
      ))}
    </span>
  );
}

function TimelineMealCard({
  meal,
  expanded,
  onToggle,
}: {
  meal: MealDetail;
  expanded: boolean;
  onToggle: () => void;
}) {
  const detailId = `meal-detail-${meal.id}`;
  const firstFoods = meal.foods.slice(0, 2).map((f) => f.name).join(", ");
  const moreCount = meal.foods.length - 2;
  const foodLine =
    meal.foods.length === 0 ? "No food lines recorded" : `${firstFoods}${moreCount > 0 ? ` +${moreCount} more` : ""}`;

  return (
    <Card className="gap-0 overflow-hidden rounded-2xl border-primary/10 py-0 shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={detailId}
        className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:p-4"
      >
        <img
          src={mealImageFor(meal.foods[0]?.name, meal.mealType)}
          alt=""
          aria-hidden
          className="h-16 w-16 shrink-0 rounded-xl object-cover"
        />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="text-sm font-semibold">{mealLabel(meal.mealType)}</span>
            <SourceBadge meal={meal} />
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{foodLine}</span>
          <MacroChips totals={meal.totals} />
        </span>
        <span className="flex shrink-0 items-center gap-0.5">
          <span className="text-sm font-bold tabular-nums">{formatKcal(meal.totals.calories)}</span>
          <ChevronRight
            aria-hidden
            className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", expanded && "rotate-90")}
          />
        </span>
      </button>

      {expanded && (
        <div id={detailId} className="border-t border-primary/10 bg-primary/[0.03] px-3 py-3 sm:px-4 dark:bg-primary/[0.05]">
          <div className="space-y-1.5">
            {meal.foods.map((f) => {
              const share = meal.totals.calories > 0 && f.foodId ? Math.round((f.nutrition.calories / meal.totals.calories) * 100) : 0;
              return (
                <div key={f.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  <span className="min-w-0 flex-1 basis-32 truncate">
                    <span className="font-medium">{f.name}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {f.quantity} {f.unit}
                      {f.preparation ? `, ${f.preparation}` : ""}
                    </span>
                  </span>
                  <ConfidenceBadge
                    confidence={f.confidence != null && f.confidence < 1 ? f.confidence : null}
                    quantitySource={f.quantitySource === "estimated" || f.quantitySource === "unknown" ? f.quantitySource : null}
                    className="shrink-0"
                  />
                  {share > 0 && <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">{share}%</span>}
                  <span className="shrink-0 font-semibold tabular-nums">{formatKcal(f.nutrition.calories)}</span>
                </div>
              );
            })}
            {meal.foods.length === 0 && (
              <p className="text-xs text-muted-foreground">No food lines recorded for this meal.</p>
            )}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-primary/10 pt-2 text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground">Totals</span>
            <span className="tabular-nums">{formatKcal(meal.totals.calories)}</span>
            <span className="tabular-nums">P {formatGrams(meal.totals.protein)}</span>
            <span className="tabular-nums">C {formatGrams(meal.totals.carbohydrates)}</span>
            <span className="tabular-nums">F {formatGrams(meal.totals.fat)}</span>
            <span className="tabular-nums">Fiber {formatGrams(meal.totals.fiber)}</span>
          </div>
          {/* XAI: provenance — where the numbers came from and what the AI did */}
          <ProvenanceLine
            foods={meal.foods.map((f) => ({ name: f.name, confidence: f.confidence, quantitySource: f.quantitySource, source: f.source }))}
            className="mt-2"
          />
          {meal.userNotes && <p className="mt-2 text-xs italic text-muted-foreground">“{meal.userNotes}”</p>}
        </div>
      )}
    </Card>
  );
}

function TimelineSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <span className="sr-only">Loading meals…</span>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-3 sm:gap-4" aria-hidden>
          <div className="flex w-16 shrink-0 flex-col items-center gap-1.5">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-9 w-9 rounded-full" />
          </div>
          <Skeleton className="min-w-0 flex-1 rounded-2xl" style={{ height: 104 }} />
        </div>
      ))}
    </div>
  );
}

function TimelineEmpty({ onLog }: { onLog: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-primary/25 bg-primary/5 p-6 text-center">
      <UtensilsCrossed className="mx-auto h-6 w-6 text-primary/60" aria-hidden />
      <p className="mt-2 text-sm font-medium">No meals logged for this day yet.</p>
      <p className="mt-0.5 text-xs text-muted-foreground">Log your first meal and it appears on the timeline.</p>
      <Button
        variant="outline"
        size="sm"
        onClick={onLog}
        className="mt-3 min-h-11 gap-1.5 rounded-xl border-primary/30 bg-background/60 px-4 text-primary hover:bg-primary/10"
      >
        <Plus className="h-4 w-4" aria-hidden /> Log a meal
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Nutrient rings                                                      */
/* ------------------------------------------------------------------ */

function NutrientRing({
  label,
  consumed,
  target,
  tone,
}: {
  label: string;
  consumed: number;
  target: number;
  tone: Tone;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1">
      <Donut value={consumed} max={target} tone={tone} size={86} stroke={9} className="shrink-0">
        <span className="text-sm font-bold tabular-nums text-foreground">{pct(consumed, target)}%</span>
      </Donut>
      <span className="text-xs font-semibold">{label}</span>
      <span className="text-[11px] tabular-nums text-muted-foreground">
        {Math.round(consumed)} / {Math.round(target)} g
      </span>
    </div>
  );
}

const NUTRIENT_RINGS: { label: string; key: "protein" | "carbohydrates" | "fat" | "fiber"; tone: Tone }[] = [
  { label: "Protein", key: "protein", tone: "emerald" },
  { label: "Carbs", key: "carbohydrates", tone: "blue" },
  { label: "Fat", key: "fat", tone: "orange" },
  { label: "Fiber", key: "fiber", tone: "purple" },
];

/* ------------------------------------------------------------------ */
/* Main view                                                           */
/* ------------------------------------------------------------------ */

type PeriodTab = "today" | "week" | "month";

export function MealsView() {
  const dataVersion = useNutriStore((s) => s.dataVersion);
  const setView = useNutriStore((s) => s.setView);
  const bumpData = useNutriStore((s) => s.bumpData);
  const { toast } = useToast();

  const TODAY = todayKey();
  const MIN_DATE = shiftDayKey(TODAY, -365);

  const [tab, setTab] = useState<PeriodTab>("today");
  const [selectedDate, setSelectedDate] = useState<string>(TODAY);
  const [hero, setHero] = useState<HeroData | null>(null);
  const [heroFailed, setHeroFailed] = useState(false);
  const [day, setDay] = useState<{ date: string; summary: DailySummaryResponse | null } | null>(null);
  const [recent, setRecent] = useState<MealDetail[] | null>(null);
  const [recentFailed, setRecentFailed] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [waterBusy, setWaterBusy] = useState(false);

  // Hero stats + the selected day's timeline, in parallel. Re-fetched on
  // every dataVersion bump (meal edits/deletes) and day change. Failure is
  // silent (console.warn) — the hero renders without stats, sections stay up.
  useEffect(() => {
    let alive = true;
    const tKey = todayKey();
    Promise.all([
      api.dailySummary(tKey),
      api.dailySummary(shiftDayKey(tKey, -1)),
      api.weeklySummary(),
      selectedDate === tKey ? Promise.resolve(null) : api.dailySummary(selectedDate),
    ])
      .then(([today, yesterday, week, selected]) => {
        if (!alive) return;
        setHero({ today, yesterday, week });
        setHeroFailed(false);
        setDay({ date: selectedDate, summary: selected ?? today });
      })
      .catch((err) => {
        console.warn("[meals] summaries unavailable:", err);
        if (!alive) return;
        setHeroFailed(true);
        setDay((prev) => (prev && prev.date === selectedDate ? prev : { date: selectedDate, summary: null }));
      });
    return () => {
      alive = false;
    };
  }, [dataVersion, selectedDate]);

  // Recent meals for the bottom strip (independent — failures don't take
  // the rest of the view down).
  useEffect(() => {
    let alive = true;
    api
      .recentMeals()
      .then((res) => {
        if (!alive) return;
        setRecent(res.meals.slice(0, 4));
        setRecentFailed(false);
      })
      .catch((err) => {
        console.warn("[meals] recent meals unavailable:", err);
        if (!alive) return;
        setRecentFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [dataVersion]);

  function shiftDate(days: number) {
    setSelectedDate((prev) => shiftDayKey(prev, days));
  }

  async function quickAddWater() {
    if (waterBusy) return;
    setWaterBusy(true);
    try {
      await api.hydrationUpdate({ delta: 1 });
      bumpData();
      toast({ title: "+1 glass logged", description: "Your water intake was updated." });
    } catch {
      toast({ title: "Could not log water", description: "Please try again in a moment.", variant: "destructive" });
    } finally {
      setWaterBusy(false);
    }
  }

  // Timeline data for the selected day: undefined = still loading, null = failed.
  const activeDay = day && day.date === selectedDate ? day.summary : undefined;
  const meals = activeDay?.meals ?? [];

  const quickAdds: { emoji: string; label: string; aria: string; onClick: () => void; disabled?: boolean }[] = [
    { emoji: "💧", label: "Water", aria: "Quick add a glass of water", onClick: quickAddWater, disabled: waterBusy },
    { emoji: "🍎", label: "Fruits", aria: "Log fruits in the food logger", onClick: () => setView("log") },
    { emoji: "🥜", label: "Snacks", aria: "Log snacks in the food logger", onClick: () => setView("log") },
    { emoji: "➕", label: "Custom", aria: "Log a custom meal in the food logger", onClick: () => setView("log") },
  ];

  return (
    <div className="space-y-5">
      {/* ---------------- HERO ---------------- */}
      <FadeIn>
        <ViewHero
          title={<>Meals</>}
          subtitle="Track, manage and get insights from your daily meals."
          script={
            <>
              Healthy
              <br />
              Meals
              <br />
              Happier You <Heart className="inline h-4 w-4 fill-primary" aria-hidden />
            </>
          }
          image="/images/hero-bowl.png"
          stats={hero ? <MealsHeroStats hero={hero} /> : heroFailed ? undefined : <HeroStatSkeletons />}
        />
      </FadeIn>

      {/* XAI: explain where the daily targets come from */}
      <FadeIn delay={0.02}>
        <TargetExplainer />
      </FadeIn>

      <div className="grid min-w-0 gap-5 lg:grid-cols-[1fr_340px]">
        {/* ---------------- LEFT COLUMN ---------------- */}
        <div className="min-w-0 space-y-5">
          <FadeIn delay={0.05} className="min-w-0">
            <Card className="min-w-0 rounded-3xl border-primary/15 shadow-sm">
              <CardContent className="p-4 sm:p-5">
                <Tabs
                  value={tab}
                  onValueChange={(v) => setTab(v as PeriodTab)}
                  aria-label="Meals periods"
                  className="min-w-0 gap-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <TabsList aria-label="Choose period">
                      <TabsTrigger value="today">Today</TabsTrigger>
                      <TabsTrigger value="week">This Week</TabsTrigger>
                      <TabsTrigger value="month">This Month</TabsTrigger>
                    </TabsList>

                    {/* Day navigator — never into the future */}
                    <div
                      role="group"
                      aria-label="Selected day"
                      className="flex items-center gap-0.5 rounded-xl border border-primary/15 bg-background/60 px-1.5 py-1"
                    >
                      <CalendarDays className="mx-1 h-4 w-4 shrink-0 text-primary" aria-hidden />
                      <span className="min-w-[6.75rem] text-center text-xs font-semibold tabular-nums">
                        {format(parseISO(`${selectedDate}T12:00:00`), "EEE d MMM yyyy")}
                      </span>
                      {selectedDate === TODAY && (
                        <Badge variant="secondary" className="rounded-full bg-primary/10 px-2 py-0 text-[10px] font-semibold text-primary">
                          Today
                        </Badge>
                      )}
                      <button
                        type="button"
                        onClick={() => shiftDate(-1)}
                        disabled={selectedDate <= MIN_DATE}
                        aria-label="Previous day"
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
                      >
                        <ChevronLeft className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => shiftDate(1)}
                        disabled={selectedDate >= TODAY}
                        aria-label="Next day"
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
                      >
                        <ChevronRight className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  </div>

                  {/* TODAY — meal timeline */}
                  <TabsContent value="today" className="min-w-0">
                    {activeDay === undefined ? (
                      <TimelineSkeleton />
                    ) : activeDay === null ? (
                      <p className="rounded-2xl border border-dashed border-primary/25 bg-primary/5 p-4 text-sm text-muted-foreground">
                        Couldn&apos;t load meals for this day — your data is safe, try again shortly.
                      </p>
                    ) : meals.length === 0 ? (
                      <TimelineEmpty onLog={() => setView("log")} />
                    ) : (
                      <ol className="min-w-0">
                        {meals.map((meal, idx) => {
                          const isLast = idx === meals.length - 1;
                          const slot = slotMeta(meal.mealType);
                          return (
                            <li key={meal.id} className="flex gap-3 sm:gap-4">
                              {/* time rail with connector line */}
                              <div className="flex w-16 shrink-0 flex-col items-center">
                                <span
                                  className="text-[10px] font-bold tabular-nums text-muted-foreground"
                                  title={slot.title}
                                >
                                  {timeLabel(meal.eatenAt)}
                                </span>
                                <span
                                  aria-hidden
                                  className={cn(
                                    "mt-1 flex h-9 w-9 items-center justify-center rounded-full",
                                    slot.chip,
                                  )}
                                >
                                  {slot.icon}
                                </span>
                                {!isLast && <span aria-hidden className="my-1 w-px flex-1 bg-primary/20" />}
                              </div>
                              <div className={cn("min-w-0 flex-1", !isLast && "pb-4")}>
                                <TimelineMealCard
                                  meal={meal}
                                  expanded={expandedId === meal.id}
                                  onToggle={() => setExpandedId((prev) => (prev === meal.id ? null : meal.id))}
                                />
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </TabsContent>

                  {/* THIS WEEK — activity calendar + note */}
                  <TabsContent value="week" className="min-w-0">
                    <div className="space-y-3">
                      <FadeIn className="min-w-0">
                        <ActivityCalendar />
                      </FadeIn>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        Tip: click any square to open that day&apos;s meals — the “Log a meal for this day” action
                        inside backfills missed days, and the server recomputes every number.
                      </p>
                    </div>
                  </TabsContent>

                  {/* THIS MONTH — calendar + full meal history */}
                  <TabsContent value="month" className="min-w-0">
                    <div className="space-y-4">
                      <FadeIn delay={0.05} className="min-w-0">
                        <ActivityCalendar />
                      </FadeIn>
                      <FadeIn delay={0.1} className="min-w-0">
                        <RecentMeals />
                      </FadeIn>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </FadeIn>

          {/* Bottom action row */}
          <FadeIn delay={0.1}>
            <div className="flex flex-wrap gap-2.5">
              <Button
                variant="outline"
                onClick={() => setView("log")}
                className="min-h-11 flex-1 gap-1.5 rounded-xl border-primary/25 bg-background/60 hover:bg-primary/5 sm:flex-none sm:px-5"
              >
                <Plus className="h-4 w-4" aria-hidden /> Add Meal
              </Button>
              <Button
                variant="outline"
                onClick={() => setView("log")}
                className="min-h-11 flex-1 gap-1.5 rounded-xl border-primary/25 bg-background/60 hover:bg-primary/5 sm:flex-none sm:px-5"
              >
                <Camera className="h-4 w-4" aria-hidden /> Scan Food
              </Button>
              <Button
                variant="outline"
                onClick={() => setView("log")}
                className="min-h-11 flex-1 gap-1.5 rounded-xl border-primary/25 bg-background/60 hover:bg-primary/5 sm:flex-none sm:px-5"
              >
                <UtensilsCrossed className="h-4 w-4" aria-hidden /> Quick Add
              </Button>
            </div>
          </FadeIn>
        </div>

        {/* ---------------- RIGHT RAIL ---------------- */}
        <div className="min-w-0 space-y-5">
          {/* Log a Meal */}
          <FadeIn delay={0.15} className="min-w-0">
            <Card className="rounded-3xl border-primary/15 shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
                  >
                    <Camera className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <CardTitle className="text-base">Log a Meal</CardTitle>
                    <CardDescription className="mt-1">
                      Take a photo, describe, or choose from your recent meals.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <Button
                  onClick={() => setView("log")}
                  className="min-h-11 w-full gap-1.5 rounded-xl text-sm font-semibold"
                >
                  Log Food <ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
              </CardContent>
            </Card>
          </FadeIn>

          {/* Quick Add */}
          <FadeIn delay={0.2} className="min-w-0">
            <Card className="rounded-3xl border-primary/15 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <span
                    aria-hidden
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-500/15 text-teal-600 dark:text-teal-400"
                  >
                    <UtensilsCrossed className="h-4 w-4" />
                  </span>
                  Quick Add
                </CardTitle>
                <CardDescription>Water logs instantly — the rest opens the food logger.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-2">
                  {quickAdds.map((q) => (
                    <button
                      key={q.label}
                      type="button"
                      onClick={q.onClick}
                      disabled={q.disabled}
                      aria-label={q.aria}
                      className="flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl border border-primary/15 bg-background/60 px-1 py-2 text-[11px] font-medium text-foreground transition-all hover:border-primary/30 hover:bg-primary/5 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                    >
                      <span aria-hidden className="text-lg leading-none">
                        {q.emoji}
                      </span>
                      <span>{q.label}</span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </FadeIn>

          {/* Today's Nutrients */}
          <FadeIn delay={0.25} className="min-w-0">
            <Card className="rounded-3xl border-primary/15 shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <CardTitle className="flex min-w-0 items-center gap-2 text-base">
                    <span
                      aria-hidden
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    >
                      <Wheat className="h-4 w-4" />
                    </span>
                    Today&apos;s Nutrients
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 px-2 text-xs text-primary"
                    onClick={() => setView("insights")}
                  >
                    Details <ArrowRight className="h-3 w-3" aria-hidden />
                  </Button>
                </div>
                <CardDescription>Share of your daily target consumed so far.</CardDescription>
              </CardHeader>
              <CardContent>
                {hero ? (
                  <div className="grid grid-cols-2 gap-4">
                    {NUTRIENT_RINGS.map((r) => (
                      <NutrientRing
                        key={r.label}
                        label={r.label}
                        consumed={hero.today.consumed[r.key]}
                        target={hero.today.targets[r.key]}
                        tone={r.tone}
                      />
                    ))}
                  </div>
                ) : heroFailed ? (
                  <p className="rounded-xl border border-dashed border-primary/25 bg-primary/5 p-4 text-sm text-muted-foreground">
                    Nutrient rings are unavailable right now — they&apos;ll return with your next sync.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-4" aria-busy="true">
                    <span className="sr-only">Loading today&apos;s nutrients…</span>
                    {NUTRIENT_RINGS.map((r) => (
                      <div key={r.label} className="flex flex-col items-center gap-2" aria-hidden>
                        <Skeleton className="h-[86px] w-[86px] rounded-full" />
                        <Skeleton className="h-3 w-14" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </FadeIn>

          {/* Quote */}
          <FadeIn delay={0.3} className="min-w-0">
            <div className="relative min-w-0 overflow-hidden rounded-3xl border border-primary/15 bg-gradient-to-br from-primary/10 to-teal-500/5 p-5">
              <img
                src="/images/hero-leaves.png"
                alt=""
                aria-hidden
                className="pointer-events-none absolute inset-y-0 right-0 h-full w-32 object-cover opacity-20 [mask-image:linear-gradient(to_left,black_35%,transparent_100%)] dark:opacity-10"
              />
              <div className="relative min-w-0">
                <p className="font-script text-xl font-semibold leading-snug text-primary sm:text-2xl">
                  Healthy meals today, a brighter tomorrow.
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">— NutriSLM</p>
                <button
                  type="button"
                  onClick={() => setView("insights")}
                  aria-label="Open insights"
                  className="mt-4 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>
          </FadeIn>
        </div>
      </div>

      {/* ---------------- RECENT MEALS STRIP (full width) ---------------- */}
      <FadeIn delay={0.35} className="min-w-0">
        <Card className="min-w-0 rounded-3xl border-primary/15 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex min-w-0 items-center gap-2 text-base">
                <span
                  aria-hidden
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
                >
                  <History className="h-4 w-4" />
                </span>
                Recent Meals
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1 px-2 text-xs text-primary"
                onClick={() => setView("insights")}
              >
                View all <ArrowRight className="h-3 w-3" aria-hidden />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {recent === null && !recentFailed ? (
              <div className="flex gap-4 overflow-hidden pb-2" aria-busy="true">
                <span className="sr-only">Loading recent meals…</span>
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-40 w-[140px] shrink-0 rounded-2xl" aria-hidden />
                ))}
              </div>
            ) : recent !== null && recent.length > 0 ? (
              <ul className="flex gap-4 overflow-x-auto pb-2">
                {recent.map((m) => (
                  <li key={m.id} className="w-[140px] min-w-[140px] shrink-0">
                    <img
                      src={mealImageFor(m.foods[0]?.name, m.mealType)}
                      alt=""
                      aria-hidden
                      className="h-24 w-full rounded-xl object-cover"
                    />
                    <p className="mt-1.5 truncate text-xs font-semibold">{m.foods[0]?.name ?? mealLabel(m.mealType)}</p>
                    <p className="text-xs font-bold tabular-nums text-primary">{formatKcal(m.totals.calories)}</p>
                    <p className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">{dayTimeLabel(m.eatenAt)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl border border-dashed border-primary/25 bg-primary/5 p-4 text-center text-sm text-muted-foreground">
                {recentFailed ? "Recent meals are unavailable right now." : "No meals logged yet — your history appears here."}
              </p>
            )}
          </CardContent>
        </Card>
      </FadeIn>
    </div>
  );
}
