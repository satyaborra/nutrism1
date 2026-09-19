"use client";

/**
 * Home — the illustrated dashboard: hero greeting + quote, "Your Health
 * Matters" feature card, Today's Nutrition (ring + macro tiles), 7-day trend,
 * next-meal recommendation, recent meal photo cards, insight tip, quick
 * actions, water intake and the closing motivational banner.
 * Every number is fetched from the APIs — the client never calculates.
 */
import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  Camera,
  ChevronRight,
  Image as ImageIcon,
  Keyboard,
  Lightbulb,
  Quote,
  Salad,
  Sparkles,
  Wheat,
  Mic,
  Droplet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { api } from "@/lib/client/api";
import { formatGrams, formatKcal, localeFor, todayKey } from "@/lib/client/format";
import { mealImageFor } from "@/lib/client/meal-images";
import type { DailySummaryResponse, RecentMealsResponse, WeeklySummaryResponse } from "@/lib/client/types";
import { CalorieRing } from "../summary";
import { HydrationWidget } from "../hydration-widget";
import { RecommendationCard } from "../recommendation-card";
import { useNutriStore, MEAL_TYPE_ICON } from "../store";
import { FadeIn } from "../fade-in";
import { CoachHomeCard } from "../coach-home-card";

/* ------------------------------------------------------------------ */
/* Hero banner: greeting + quote + leaf decorations                    */
/* ------------------------------------------------------------------ */

function slotGreeting(h: number): { title: string; icon: string; line: string } {
  if (h < 11) return { title: "Good Morning", icon: "🌅", line: "A fresh start — let's make breakfast count." };
  if (h < 16) return { title: "Good Afternoon", icon: "👋", line: "Let's make a healthier you, one meal at a time." };
  if (h < 19) return { title: "Good Evening", icon: "🌤️", line: "Snack o'clock — small bites, chosen well." };
  return { title: "Good Night", icon: "🌙", line: "Dinner time — let's keep the day on track." };
}

function HeroBanner() {
  const user = useNutriStore((s) => s.user);
  const profileBrief = useNutriStore((s) => s.profileBrief);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setNow(new Date()));
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(interval);
    };
  }, []);

  const g = slotGreeting(now?.getHours() ?? new Date().getHours());

  return (
    <div className="relative overflow-hidden rounded-3xl border border-primary/10 shadow-sm">
      {/* leaf backdrop */}
      <div
        aria-hidden
        className="absolute inset-0 bg-cover bg-left-top opacity-90 dark:opacity-25"
        style={{ backgroundImage: "url(/images/hero-leaves.png)" }}
      />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-background/70 via-background/40 to-background/10 dark:from-background/95 dark:via-background/85 dark:to-background/70" />

      <div className="relative grid gap-4 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-[28px]">
            {g.title}
            {user?.name ? `, ${user.name.split(" ")[0]}` : ""}{" "}
            <span aria-hidden className="inline-block origin-bottom-right animate-[wave_2.4s_ease-in-out_1]">{g.icon}</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{g.line}</p>
          <p className="mt-0.5 text-xs text-muted-foreground/80">
            {now
              ? new Intl.DateTimeFormat(localeFor(profileBrief?.language ?? "en"), {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                }).format(now)
              : ""}
          </p>
        </div>

        <figure className="relative rounded-2xl border bg-background/80 p-3.5 shadow-sm backdrop-blur-sm lg:max-w-64">
          <Quote className="absolute -left-2 -top-2 h-5 w-5 rounded-full bg-primary/15 p-1 text-primary" aria-hidden />
          <blockquote className="text-[13px] font-medium italic leading-snug text-foreground/90">
            &ldquo;Food is not just fuel, it&apos;s information for your body.&rdquo;
          </blockquote>
          <figcaption className="mt-1.5 text-right text-[11px] text-muted-foreground">— Dr. Mark Hyman</figcaption>
        </figure>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Your Health Matters — feature card                                  */
/* ------------------------------------------------------------------ */

function HealthMattersCard() {
  const setView = useNutriStore((s) => s.setView);
  const requestLogger = useNutriStore((s) => s.requestLogger);

  return (
    <Card className="relative overflow-hidden border-primary/15 shadow-sm">
      <CardContent className="p-0">
        <div className="relative h-36 overflow-hidden sm:h-40">
          <img
            src="/images/hero-bowl.png"
            alt="Colorful healthy bowl with chickpeas, avocado and fresh vegetables"
            className="h-full w-full object-cover"
          />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-card via-card/20 to-transparent" />
          <p
            aria-hidden
            className="absolute bottom-2 right-3 rotate-[-4deg] font-[cursive] text-[13px] font-semibold leading-tight text-primary/80"
          >
            Healthy Today,
            <br />
            Brighter Tomorrow ♡
          </p>
        </div>
        <div className="space-y-3 p-4">
          <div>
            <h2 className="text-lg font-extrabold leading-tight">Your Health Matters</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Personalized nutrition. Backed by science. Powered by AI.
            </p>
          </div>
          <Button
            className="w-full gap-2 shadow-md shadow-primary/20 transition-all active:scale-[0.98]"
            onClick={() => {
              requestLogger({ tab: "photo" });
              setView("log");
            }}
          >
            <Camera className="h-4 w-4" aria-hidden /> Log a Meal <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Today's Nutrition: ring + macro tiles                               */
/* ------------------------------------------------------------------ */

const MACRO_TILES = [
  {
    key: "protein" as const,
    label: "Protein",
    icon: Salad,
    chip: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400",
    bar: "bg-gradient-to-r from-emerald-600 to-emerald-400",
    tile: "bg-emerald-50/80 dark:bg-emerald-500/[0.07]",
  },
  {
    key: "carbohydrates" as const,
    label: "Carbs",
    icon: Wheat,
    chip: "bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400",
    bar: "bg-gradient-to-r from-amber-500 to-amber-300",
    tile: "bg-amber-50/80 dark:bg-amber-500/[0.07]",
  },
  {
    key: "fat" as const,
    label: "Fat",
    icon: Droplet,
    chip: "bg-pink-100 text-pink-600 dark:bg-pink-500/20 dark:text-pink-400",
    bar: "bg-gradient-to-r from-pink-500 to-pink-300",
    tile: "bg-pink-50/80 dark:bg-pink-500/[0.07]",
  },
  {
    key: "fiber" as const,
    label: "Fiber",
    icon: Sparkles,
    chip: "bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-400",
    bar: "bg-gradient-to-r from-violet-500 to-violet-300",
    tile: "bg-violet-50/80 dark:bg-violet-500/[0.07]",
  },
];

function MacroTile({
  label,
  icon: Icon,
  chip,
  bar,
  tile,
  value,
  target,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  chip: string;
  bar: string;
  tile: string;
  value: number;
  target: number;
}) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  return (
    <div className={cn("rounded-2xl p-3 transition-transform duration-200 hover:-translate-y-0.5", tile)}>
      <div className="flex items-center gap-2">
        <span className={cn("flex h-7 w-7 items-center justify-center rounded-full", chip)}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="text-xs font-semibold">{label}</span>
      </div>
      <p className="mt-2 text-sm font-bold tabular-nums">
        {formatGrams(value)} <span className="text-xs font-medium text-muted-foreground">/ {formatGrams(target)}</span>
      </p>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/70 dark:bg-muted/60">
        <div className={cn("h-full rounded-full transition-all duration-500", bar)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function TodaysNutrition({ summary }: { summary: DailySummaryResponse }) {
  const setView = useNutriStore((s) => s.setView);
  const dateLabel = new Date(`${summary.date}T12:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <Card className="border-primary/15 shadow-sm">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
            <BarChart3 className="h-4 w-4" aria-hidden />
          </span>
          Today&apos;s Nutrition
        </CardTitle>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">🗓️ {dateLabel}</span>
          {summary.healthConditions.map((c) => (
            <Badge key={c} variant="outline" className="border-primary/30 bg-primary/5 font-mono text-[10px]">
              {c}
            </Badge>
          ))}
          <Button variant="outline" size="sm" className="h-7 gap-1 rounded-full px-3 text-xs" onClick={() => setView("insights")}>
            View Details <ArrowRight className="h-3 w-3" aria-hidden />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center">
        <div className="mx-auto lg:mx-0">
          <CalorieRing consumed={summary.consumed.calories} target={summary.targets.calories} />
        </div>
        <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
          {MACRO_TILES.map((m) => (
            <MacroTile
              key={m.key}
              label={m.label}
              icon={m.icon}
              chip={m.chip}
              bar={m.bar}
              tile={m.tile}
              value={summary.consumed[m.key]}
              target={summary.targets[m.key]}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Nutrition trend — 7-day mini bar chart with dashed target           */
/* ------------------------------------------------------------------ */

function TrendChart({ weekly }: { weekly: WeeklySummaryResponse }) {
  const [metric, setMetric] = useState<"calories" | "protein">("calories");
  const target = metric === "calories" ? weekly.targets.calories : weekly.targets.protein;

  const data = weekly.days.map((d) => ({
    label: new Date(`${d.date}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short" }),
    value: metric === "calories" ? Math.round(d.calories) : Math.round(d.protein),
    onTarget: d.onTarget,
    isToday: d.date === todayKey(),
  }));

  return (
    <Card className="border-primary/15 shadow-sm">
      <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
              <BarChart3 className="h-4 w-4" aria-hidden />
            </span>
            Nutrition Trend
          </CardTitle>
          <CardDescription className="mt-1">Your {metric} intake over the last 7 days</CardDescription>
        </div>
        <div role="group" aria-label="Trend metric" className="flex overflow-hidden rounded-lg border text-xs">
          {(["calories", "protein"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMetric(m)}
              aria-pressed={metric === m}
              className={cn(
                "px-2.5 py-1 font-medium capitalize transition-colors",
                metric === m ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted",
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-44" role="img" aria-label={`Bar chart of ${metric} for the last 7 days with a target line at ${target}`}>
          <TrendBars data={data} target={target} />
        </div>
        <p className="mt-1 text-center text-[11px] text-muted-foreground">
          Target {target.toLocaleString()} {metric === "calories" ? "kcal" : "g"} · dashed line
        </p>
      </CardContent>
    </Card>
  );
}

/** Hand-rolled flex bar chart (lighter than a chart lib for this compact card). */
function TrendBars({
  data,
  target,
}: {
  data: { label: string; value: number; onTarget: boolean; isToday: boolean }[];
  target: number;
}) {
  const max = Math.max(target * 1.15, ...data.map((d) => d.value), 1);
  return (
    <div className="relative flex h-full items-end gap-2 pt-3">
      {/* target dashed line */}
      <div
        aria-hidden
        className="absolute inset-x-0 border-t-2 border-dashed border-orange-400/80"
        style={{ bottom: `${(target / max) * 100}%` }}
      >
        <span className="absolute -top-2.5 right-0 rounded bg-orange-400/90 px-1.5 py-0.5 text-[9px] font-semibold text-white">
          Target {target.toLocaleString()}
        </span>
      </div>
      {data.map((d) => {
        const h = Math.max(2, (d.value / max) * 100);
        return (
          <div key={d.label} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[9px] font-medium tabular-nums text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
              {d.value.toLocaleString()}
            </span>
            <div
              className={cn(
                "w-full max-w-9 rounded-t-md transition-all duration-500 group-hover:brightness-110",
                d.value === 0
                  ? "bg-muted"
                  : d.isToday
                    ? "bg-gradient-to-t from-emerald-600 to-emerald-400 shadow-md shadow-emerald-600/25"
                    : d.onTarget
                      ? "bg-gradient-to-t from-emerald-500/85 to-emerald-300/85"
                      : "bg-emerald-200/80 dark:bg-emerald-500/35",
              )}
              style={{ height: `${h}%` }}
              title={`${d.label}: ${d.value.toLocaleString()}`}
            />
            <span className={cn("text-[10px]", d.isToday ? "font-bold text-foreground" : "text-muted-foreground")}>{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Recent meals — photo card strip                                     */
/* ------------------------------------------------------------------ */

function RecentMealStrip({ data }: { data: RecentMealsResponse }) {
  const setView = useNutriStore((s) => s.setView);
  const cards = data.meals.slice(0, 4);

  return (
    <Card className="border-primary/15 shadow-sm">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="text-base" aria-hidden>🍽️</span> Recent Meals
        </CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="rounded-full bg-primary/10 text-[10px] font-medium text-primary">
            {data.count} meal{data.count === 1 ? "" : "s"} logged
          </Badge>
          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-primary" onClick={() => setView("meals")}>
            View All <ArrowRight className="h-3 w-3" aria-hidden />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {cards.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-muted/30 p-4 text-center text-sm text-muted-foreground">
            No meals yet — your logged meals will appear here as photo cards.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {cards.map((m) => {
              const firstFood = m.foods[0]?.name ?? "";
              const img = mealImageFor(...m.foods.map((f) => f.name));
              const time = new Date(m.eatenAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setView("meals")}
                    aria-label={`${m.mealType}: ${firstFood || "meal"}, ${time}, ${formatKcal(m.totals.calories)}`}
                    className="group w-full overflow-hidden rounded-2xl border bg-card text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <div className="relative h-20 overflow-hidden sm:h-24">
                      <img
                        src={img}
                        alt=""
                        aria-hidden
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <span className="absolute bottom-1.5 left-1.5 rounded-md bg-background/85 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 backdrop-blur-sm dark:text-emerald-400">
                        {formatKcal(m.totals.calories)}
                      </span>
                    </div>
                    <div className="p-2">
                      <p className="text-[10px] font-medium capitalize text-muted-foreground">
                        {MEAL_TYPE_ICON[m.mealType]} {m.mealType}
                      </p>
                      <p className="mt-0.5 flex items-center justify-between gap-1 truncate text-xs font-semibold">
                        <span className="truncate">{firstFood || "Meal"}</span>
                        <ChevronRight
                          className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                          aria-hidden
                        />
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">⏱ {time}</p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Insight & tip — constraint-derived, with deterministic fallbacks    */
/* ------------------------------------------------------------------ */

const FALLBACK_TIPS = [
  { text: "Prefer fibre-rich foods to blunt post-meal glucose excursions.", source: "ADA Standards of Care 2024" },
  { text: "Distribute carbohydrates evenly across meals to avoid large spikes.", source: "ADA Standards of Care 2024" },
  { text: "Aim for a fistful of vegetables at every meal — fibre first, then protein.", source: "WHO healthy diet guidance" },
  { text: "Keep added salts modest — flavour with spices, herbs and citrus instead.", source: "WHO sodium guideline" },
];

function InsightTipCard({ summary }: { summary: DailySummaryResponse | null }) {
  const violation = summary?.compliance.violations[0];
  const dayIndex = new Date().getDate();
  const tip = violation
    ? { text: violation.message, source: violation.evidenceSource, condition: violation.condition }
    : { ...FALLBACK_TIPS[dayIndex % FALLBACK_TIPS.length], condition: summary?.healthConditions[0] };

  return (
    <Card className="relative overflow-hidden border-amber-300/50 bg-gradient-to-br from-amber-100/80 via-amber-50/60 to-card shadow-sm dark:border-amber-500/25 dark:from-amber-500/10 dark:via-amber-500/5 dark:to-card">
      <div aria-hidden className="pointer-events-none absolute -bottom-8 -right-8 h-32 w-32 rounded-full bg-amber-300/25 blur-2xl" />
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-200/80 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
            <Lightbulb className="h-4 w-4" aria-hidden />
          </span>
          Insights &amp; Tips
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm font-medium leading-relaxed text-foreground/90">{tip.text}</p>
        <div className="flex flex-wrap items-center gap-2">
          {tip.condition && (
            <Badge variant="outline" className="border-amber-500/40 bg-background/70 font-mono text-[10px]">
              {tip.condition}
            </Badge>
          )}
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <BookOpenCheck className="h-3 w-3" aria-hidden /> {tip.source}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Quick actions — open the logger in a specific mode                  */
/* ------------------------------------------------------------------ */

const ACTIONS = [
  {
    key: "photo",
    label: "Take a Photo",
    hint: "Snap your meal",
    icon: Camera,
    tile: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/20",
    req: { tab: "photo" as const, openFile: true },
  },
  {
    key: "upload",
    label: "Upload Image",
    hint: "Choose from gallery",
    icon: ImageIcon,
    tile: "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-400 dark:hover:bg-sky-500/20",
    req: { tab: "photo" as const, openFile: true },
  },
  {
    key: "text",
    label: "Enter Food Text",
    hint: "Type in any language",
    icon: Keyboard,
    tile: "border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100 dark:border-teal-500/25 dark:bg-teal-500/10 dark:text-teal-400 dark:hover:bg-teal-500/20",
    req: { tab: "text" as const },
  },
  {
    key: "voice",
    label: "Use Voice",
    hint: "Speak your meal",
    icon: Mic,
    tile: "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/20",
    req: { tab: "text" as const, voice: true },
  },
];

function QuickActions() {
  const setView = useNutriStore((s) => s.setView);
  const requestLogger = useNutriStore((s) => s.requestLogger);

  return (
    <Card className="border-primary/15 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-dashed border-primary/50 text-primary">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
          </span>
          Quick Actions
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2.5">
        {ACTIONS.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={() => {
              requestLogger(a.req);
              setView("log");
            }}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-center transition-all duration-150 hover:-translate-y-0.5 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-ring",
              a.tile,
            )}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-background/80 shadow-sm">
              <a.icon className="h-5 w-5" />
            </span>
            <span className="text-xs font-bold leading-tight">{a.label}</span>
            <span className="text-[10px] leading-tight opacity-80">{a.hint}</span>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Bottom banner                                                       */
/* ------------------------------------------------------------------ */

function BottomBanner() {
  const setView = useNutriStore((s) => s.setView);
  return (
    <div className="relative overflow-hidden rounded-3xl border border-primary/15 bg-gradient-to-r from-emerald-100/70 via-background to-background shadow-sm dark:border-primary/20 dark:from-emerald-500/10">
      <div
        aria-hidden
        className="absolute inset-y-0 right-0 hidden w-1/2 bg-cover bg-center opacity-90 [mask-image:linear-gradient(to_left,black_55%,transparent)] sm:block dark:opacity-40"
        style={{ backgroundImage: "url(/images/banner-vegetables.png)" }}
      />
      <div className="relative flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-extrabold leading-tight sm:text-2xl">
            Good Food
            <br />
            Brighter Days
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">Personalized nutrition for a healthier, happier you.</p>
        </div>
        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-muted-foreground lg:max-w-md">
          {["Science-backed guidance", "Personalized for your health", "Supports Indian dietary preferences"].map((t) => (
            <li key={t} className="flex items-center gap-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-primary" aria-hidden>
                <Sparkles className="h-3 w-3" />
              </span>
              {t}
            </li>
          ))}
        </ul>
        <Button size="lg" className="gap-2 shadow-md shadow-primary/20 transition-all active:scale-[0.98]" onClick={() => setView("goals")}>
          Stay Consistent <ArrowRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* View assembly                                                       */
/* ------------------------------------------------------------------ */

export function HomeView() {
  const dataVersion = useNutriStore((s) => s.dataVersion);
  const [summary, setSummary] = useState<DailySummaryResponse | null>(null);
  const [weekly, setWeekly] = useState<WeeklySummaryResponse | null>(null);
  const [recent, setRecent] = useState<RecentMealsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    let alive = true;
    Promise.all([api.dailySummary(todayKey()), api.weeklySummary(), api.recentMeals()])
      .then(([s, w, r]) => {
        if (!alive) return;
        setSummary(s);
        setWeekly(w);
        setRecent(r);
        setError(null);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setError("Could not load your dashboard data.");
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    return refresh();
  }, [refresh, dataVersion]);

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-5">
          <FadeIn>
            <HeroBanner />
          </FadeIn>

          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          {loading && !summary && (
            <div className="space-y-5" aria-hidden>
              <Skeleton className="h-44 w-full rounded-3xl" />
              <Skeleton className="h-40 w-full rounded-3xl" />
            </div>
          )}

          {summary && (
            <FadeIn delay={0.05}>
              <TodaysNutrition summary={summary} />
            </FadeIn>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            {weekly ? (
              <FadeIn delay={0.1}>
                <TrendChart weekly={weekly} />
              </FadeIn>
            ) : (
              <Skeleton className="h-64 rounded-2xl" aria-hidden />
            )}
            <FadeIn delay={0.12}>
              <RecommendationCard />
            </FadeIn>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            {recent ? (
              <FadeIn delay={0.15}>
                <RecentMealStrip data={recent} />
              </FadeIn>
            ) : (
              <Skeleton className="h-56 rounded-2xl" aria-hidden />
            )}
            <FadeIn delay={0.17}>
              <InsightTipCard summary={summary} />
            </FadeIn>
          </div>
        </div>

        <aside className="space-y-5" aria-label="Daily shortcuts">
          <FadeIn delay={0.06}>
            <CoachHomeCard />
          </FadeIn>
          <FadeIn delay={0.08}>
            <HealthMattersCard />
          </FadeIn>
          <FadeIn delay={0.1}>
            <QuickActions />
          </FadeIn>
          <FadeIn delay={0.14}>
            <HydrationWidget />
          </FadeIn>
        </aside>
      </div>

      <FadeIn delay={0.2}>
        <BottomBanner />
      </FadeIn>
    </div>
  );
}
