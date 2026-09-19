"use client";

/**
 * Insights view — mockup-faithful rebuild, 100% honest data.
 *
 * HERO: gradient ViewHero + disabled "Last 7 days" range Select + five
 *       StatCards (calories / protein / fiber / water / days logged) fed by
 *       Promise.all([weeklySummary, weeklyDigest, dailySummary, hydration]).
 * ROW 1: Calorie Trend (recharts bar + target line) · Macro Distribution
 *       (Donut) · Meal Timing (share of today's kcal by slot).
 * ROW 2: Nutrient Intake (vs daily targets) · Coach Focus (SLM insight) ·
 *       Key Insights (real digest highlights, "See all" opens the digest).
 * ROW 3: Top Food Categories · Quote card · Ask NutriSLM Coach (<AiCoach />).
 * Bottom: <NotesJournal /> full width.
 *
 * Every number comes from the API responses — no invented values. The old
 * mockup's "mood chart" has no backing API, so it is honestly replaced by a
 * deterministic Coach Focus card. Blue tones appear only as water/carb data
 * accents, never as UI chrome.
 */

import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  Activity,
  Award,
  BarChart3,
  BadgeCheck,
  CalendarCheck,
  Clock,
  Drumstick,
  Droplet,
  Flame,
  Heart,
  Leaf,
  ListChecks,
  MessageCircle,
  PieChart,
  RefreshCw,
  Sparkles,
  Sprout,
  Target,
  UtensilsCrossed,
  Wheat,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { api } from "@/lib/client/api";
import { formatGrams, formatKcal, formatNumber, formatShort, todayKey } from "@/lib/client/format";
import type {
  CoachInsightResponse,
  DailySummaryResponse,
  HydrationResponse,
  WeeklyDigestResponse,
  WeeklySummaryResponse,
} from "@/lib/client/types";
import { useNutriStore } from "../store";
import { AiCoach } from "../ai-coach";
import { NotesJournal } from "../notes-journal";
import { WeeklyDigestDialog } from "../weekly-digest";
import { FadeIn } from "../fade-in";
import { Donut } from "../donut";
import { Sparkline, StatCard, ViewHero } from "./view-hero";
import type { Tone } from "./view-hero";

// ---------------------------------------------------------------------------
// Small shared pieces
// ---------------------------------------------------------------------------

/** Solid dot/background class per tone (static strings so Tailwind compiles them). */
const DOT: Record<Tone, string> = {
  emerald: "bg-emerald-500",
  teal: "bg-teal-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  blue: "bg-sky-500",
  purple: "bg-purple-500",
  orange: "bg-orange-500",
};

const CHIP: Record<Tone, string> = {
  emerald: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  teal: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  rose: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  blue: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  purple: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  orange: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
};

/** Icon chip used in card headers. */
function HeaderChip({ tone = "emerald", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span
      aria-hidden
      className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl", CHIP[tone])}
    >
      {children}
    </span>
  );
}

/** Graceful per-card unavailable note. */
function Unavailable({ note }: { note: string }) {
  return (
    <p className="rounded-xl border border-dashed border-primary/25 bg-primary/5 p-4 text-sm text-muted-foreground">
      {note}
    </p>
  );
}

function dayLabel(date: string, fmt: string): string {
  return format(parseISO(`${date}T12:00:00`), fmt);
}

// ---------------------------------------------------------------------------
// Data bundle
// ---------------------------------------------------------------------------

interface InsightsBundle {
  weekly: WeeklySummaryResponse;
  digest: WeeklyDigestResponse;
  today: DailySummaryResponse;
  hydration: HydrationResponse;
}

// ---------------------------------------------------------------------------
// Hero stats — five StatCards, 2 cols mobile / 5 cols on lg
// ---------------------------------------------------------------------------

/** 8 tiny water bars — filled count = weekly average glasses (capped at 8). */
function WaterBars({ filled }: { filled: number }) {
  return (
    <div className="flex items-end gap-0.5" aria-hidden>
      {Array.from({ length: 8 }).map((_, i) => (
        <span key={i} className={cn("h-4 w-0.5 rounded-full", i < filled ? "bg-sky-500" : "bg-muted")} />
      ))}
    </div>
  );
}

/** 7 dots, one per day of the week — filled when that day had logged meals. */
function LoggedDots({ days }: { days: WeeklySummaryResponse["days"] }) {
  return (
    <div className="flex items-center gap-1" aria-hidden>
      {days.map((d, i) => (
        <span key={i} className={cn("h-1.5 w-1.5 rounded-full", d.calories > 0 ? "bg-purple-500" : "bg-muted")} />
      ))}
    </div>
  );
}

function HeroStatSkeletons() {
  return (
    <>
      <span className="sr-only">Loading your nutrition insights…</span>
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-[88px] rounded-2xl" />
      ))}
    </>
  );
}

/**
 * Five hero StatCards — rendered by the view in its own full-width grid
 * (2 cols mobile / 5 cols on lg) below the hero band.
 */
function HeroStats({
  weekly,
  digest,
  hydration,
}: {
  weekly: WeeklySummaryResponse;
  digest: WeeklyDigestResponse;
  hydration: HydrationResponse;
}) {
  const cmp = digest.comparison;

  // Calories vs last week — a decrease reads as "up" (good) per the design.
  let calSub: React.ReactNode = `${digest.daysLogged}/7 days logged`;
  let calSubTone: "muted" | "up" | "down" = "muted";
  if (cmp.available && cmp.caloriesDelta != null) {
    const prevAvg = weekly.avgCalories - cmp.caloriesDelta;
    if (prevAvg > 0) {
      const p = Math.round((Math.abs(cmp.caloriesDelta) / prevAvg) * 100);
      if (cmp.caloriesDelta <= 0) {
        calSub = `↓ ${p}% vs last week`;
        calSubTone = "up";
      } else {
        calSub = `↑ ${p}% vs last week`;
        calSubTone = "down";
      }
    }
  }

  // Protein vs last week — an increase reads as "up" (good).
  let proSub: React.ReactNode = `target ${weekly.targets.protein} g`;
  let proSubTone: "muted" | "up" | "down" = "muted";
  if (cmp.available && cmp.proteinDelta != null) {
    const prevAvg = weekly.weekTotals.protein / 7 - cmp.proteinDelta;
    if (prevAvg > 0) {
      const p = Math.round((Math.abs(cmp.proteinDelta) / prevAvg) * 100);
      if (cmp.proteinDelta > 0) {
        proSub = `↑ ${p}% vs last week`;
        proSubTone = "up";
      } else {
        proSub = `↓ ${p}% vs last week`;
        proSubTone = "down";
      }
    }
  }

  const fiberAvg = weekly.days.reduce((s, d) => s + d.fiber, 0) / Math.max(1, weekly.days.length);
  const waterAvg = digest.hydration.avgGlasses;
  const waterGoal = digest.hydration.goal;
  const filled = Math.max(0, Math.min(8, Math.round(waterAvg ?? 0)));

  return (
    <>
      <StatCard
        icon={<Flame className="h-5 w-5" aria-hidden />}
        tone="rose"
        label="Calories"
        value={formatKcal(weekly.avgCalories)}
        sub={calSub}
        subTone={calSubTone}
        extra={<Sparkline data={weekly.days.map((d) => d.calories)} tone="rose" />}
      />
      <StatCard
        icon={<Target className="h-5 w-5" aria-hidden />}
        tone="emerald"
        label="Protein"
        value={`${formatNumber(weekly.weekTotals.protein)} g`}
        sub={proSub}
        subTone={proSubTone}
        extra={<Sparkline data={weekly.days.map((d) => d.protein)} tone="emerald" />}
      />
      <StatCard
        icon={<Leaf className="h-5 w-5" aria-hidden />}
        tone="teal"
        label="Fiber"
        value={`${fiberAvg.toFixed(1)} g`}
        sub={fiberAvg >= 25 ? "↑ fiber-rich week" : "aim for 25 g+"}
        subTone={fiberAvg >= 25 ? "up" : "muted"}
        extra={<Sparkline data={weekly.days.map((d) => d.fiber)} tone="teal" />}
      />
      <StatCard
        icon={<Droplet className="h-5 w-5" aria-hidden />}
        tone="blue"
        label="Water"
        value={`${waterAvg !== null ? formatShort(waterAvg) : "0"} / ${waterGoal} glasses`}
        sub={`today ${hydration.glasses} / ${hydration.goal} glasses`}
        progress={waterAvg !== null && waterGoal > 0 ? Math.max(0, Math.min(1, waterAvg / waterGoal)) : 0}
        extra={<WaterBars filled={filled} />}
      />
      <StatCard
        icon={<CalendarCheck className="h-5 w-5" aria-hidden />}
        tone="purple"
        label="Days logged"
        value={`${digest.daysLogged} / 7`}
        sub={`${digest.adherence}% on target`}
        extra={<LoggedDots days={weekly.days} />}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Row 1a — Calorie Trend
// ---------------------------------------------------------------------------

interface CalDatum {
  label: string;
  date: string;
  calories: number;
  isToday: boolean;
}

function CalTooltip({ active, payload }: { active?: boolean; payload?: { payload: CalDatum }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-semibold">
        {dayLabel(d.date, "EEE d MMM")}
        {d.isToday ? " · today" : ""}
      </p>
      {d.calories > 0 ? (
        <p className="text-muted-foreground tabular-nums">{formatNumber(d.calories)} kcal</p>
      ) : (
        <p className="text-muted-foreground">No meals logged</p>
      )}
    </div>
  );
}

function CalorieTrendCard({ weekly, failed }: { weekly: WeeklySummaryResponse | null; failed: boolean }) {
  const target = weekly?.targets.calories ?? 0;
  const chartData: CalDatum[] = weekly
    ? weekly.days.map((d) => ({
        label: dayLabel(d.date, "EEE"),
        date: d.date,
        calories: d.meals > 0 ? d.calories : 0,
        isToday: d.date === todayKey(),
      }))
    : [];
  const yMax = Math.ceil((Math.max(target, ...chartData.map((d) => d.calories), 1) * 1.2) / 100) * 100;

  return (
    <Card className="min-w-0 rounded-3xl border-primary/15 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <HeaderChip tone="emerald">
                <BarChart3 className="h-4 w-4" />
              </HeaderChip>
              Calorie Trend
            </CardTitle>
            <CardDescription className="mt-1">Your daily calorie intake vs target</CardDescription>
          </div>
          {weekly && (
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-[#10b981]" />
                Actual
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="h-0 w-5 border-t-2 border-dashed border-[#f59e0b]" />
                Target {formatNumber(target)}
              </span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {failed && <Unavailable note="Calorie trend is unavailable right now — it will return with your next sync." />}
        {!weekly && !failed && (
          <div aria-busy="true">
            <Skeleton className="h-64 w-full rounded-2xl" />
            <span className="sr-only">Loading calorie trend…</span>
          </div>
        )}
        {weekly && (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 12, right: 8, bottom: 0, left: -16 }}>
                <defs>
                  <linearGradient id="insights-cal-bar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" />
                    <stop offset="100%" stopColor="#5eead4" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94a3b8" strokeOpacity={0.25} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={46}
                  tickCount={5}
                  allowDecimals={false}
                  domain={[0, yMax]}
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  tickFormatter={(v: number) => (v >= 1000 ? `${(Math.round(v / 100) / 10).toFixed(1)}k` : `${v}`)}
                />
                <Tooltip content={<CalTooltip />} cursor={{ fill: "rgba(16,185,129,0.08)" }} />
                <ReferenceLine
                  y={target}
                  stroke="#f59e0b"
                  strokeDasharray="6 4"
                  strokeWidth={1.5}
                  label={{
                    value: `target ${formatNumber(target)}`,
                    position: "insideTopRight",
                    fontSize: 10,
                    fill: "#f59e0b",
                  }}
                />
                <Bar dataKey="calories" radius={[6, 6, 0, 0]} maxBarSize={38}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={d.isToday ? "#059669" : "url(#insights-cal-bar)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Row 1b — Macro Distribution (today)
// ---------------------------------------------------------------------------

function MacroCard({ today, failed }: { today: DailySummaryResponse | null; failed: boolean }) {
  const consumed = today?.consumed ?? null;
  const targets = today?.targets ?? null;
  const segments: { name: string; value: number; tone: Tone }[] = consumed
    ? [
        { name: "Carbs", value: consumed.carbohydrates, tone: "orange" },
        { name: "Protein", value: consumed.protein, tone: "emerald" },
        { name: "Fat", value: consumed.fat, tone: "amber" },
        { name: "Fiber", value: consumed.fiber, tone: "purple" },
      ]
    : [];
  const macroSum = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  const hasMacros = macroSum > 0;
  const proteinPct =
    consumed && targets && targets.protein > 0 ? Math.round((consumed.protein / targets.protein) * 100) : 0;

  return (
    <Card className="min-w-0 rounded-3xl border-primary/15 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <HeaderChip tone="amber">
            <PieChart className="h-4 w-4" />
          </HeaderChip>
          Macro Distribution
        </CardTitle>
        <CardDescription className="mt-1">Today</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {failed && <Unavailable note="Macro breakdown is unavailable right now — it will return with your next sync." />}
        {!today && !failed && (
          <div aria-busy="true">
            <Skeleton className="h-40 w-full rounded-2xl" />
            <span className="sr-only">Loading macro distribution…</span>
          </div>
        )}
        {today && !hasMacros && (
          <p className="rounded-xl border border-dashed border-primary/25 bg-primary/5 p-4 text-sm text-muted-foreground">
            Log your meals today to see where your calories come from.
          </p>
        )}
        {today && hasMacros && consumed && (
          <>
            <div className="flex items-center gap-4">
              <Donut
                segments={segments.map((s) => ({ value: s.value, tone: s.tone }))}
                size={150}
                stroke={16}
                className="shrink-0"
              >
                <span className="text-xl font-bold tabular-nums">{formatNumber(consumed.calories)}</span>
                <span className="text-[10px] text-muted-foreground">kcal</span>
              </Donut>
              <ul className="min-w-0 flex-1 space-y-2">
                {segments.map((s) => (
                  <li key={s.name} className="flex items-center gap-2 text-xs">
                    <span aria-hidden className={cn("h-2.5 w-2.5 shrink-0 rounded-full", DOT[s.tone])} />
                    <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{formatGrams(s.value)}</span>
                    <span className="w-9 shrink-0 text-right font-semibold tabular-nums">
                      {Math.round((Math.max(0, s.value) / macroSum) * 100)}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="rounded-full bg-primary/10 px-3 py-1.5 text-center text-xs font-medium text-primary">
              {targets && consumed.protein >= targets.protein
                ? "Well balanced! Keep your protein and fiber up."
                : `Boost protein — you're at ${proteinPct}% of target.`}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Row 1c — Meal Timing (today)
// ---------------------------------------------------------------------------

const SLOT_UI: { type: string; label: string; bar: string }[] = [
  { type: "breakfast", label: "Breakfast", bar: "bg-amber-500" },
  { type: "lunch", label: "Lunch", bar: "bg-emerald-500" },
  { type: "dinner", label: "Dinner", bar: "bg-teal-500" },
  { type: "snack", label: "Snacks", bar: "bg-purple-500" },
];

function MealTimingCard({ today, failed }: { today: DailySummaryResponse | null; failed: boolean }) {
  const slots = SLOT_UI.map((s) => {
    const kcal = today ? today.meals.filter((m) => m.mealType === s.type).reduce((sum, m) => sum + m.totals.calories, 0) : 0;
    return { ...s, kcal };
  });
  const slotTotal = slots.reduce((a, s) => a + s.kcal, 0);
  const hasMeals = today ? today.meals.length > 0 : false;

  return (
    <Card className="min-w-0 rounded-3xl border-primary/15 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <HeaderChip tone="teal">
            <Clock className="h-4 w-4" />
          </HeaderChip>
          Meal Timing
        </CardTitle>
        <CardDescription className="mt-1">Your calorie intake by meal (today)</CardDescription>
      </CardHeader>
      <CardContent>
        {failed && <Unavailable note="Meal timing is unavailable right now — it will return with your next sync." />}
        {!today && !failed && (
          <div aria-busy="true" className="space-y-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-2 w-2/3" />
            <span className="sr-only">Loading meal timing…</span>
          </div>
        )}
        {today && !hasMeals && (
          <p className="rounded-xl border border-dashed border-primary/25 bg-primary/5 p-4 text-sm text-muted-foreground">
            Log meals to see timing.
          </p>
        )}
        {today && hasMeals && (
          <ul className="space-y-3" aria-label="Share of today's calories by meal slot">
            {slots.map((s) => {
              const pct = slotTotal > 0 ? Math.round((s.kcal / slotTotal) * 100) : 0;
              return (
                <li key={s.type} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-xs font-medium">{s.label}</span>
                  <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full transition-[width] duration-500", s.bar)}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-9 shrink-0 text-right text-xs font-semibold tabular-nums">{pct}%</span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Row 2a — Nutrient Intake (today vs targets)
// ---------------------------------------------------------------------------

const NUTRIENT_ROWS: {
  key: "protein" | "carbohydrates" | "fat" | "fiber";
  name: string;
  icon: LucideIcon;
  tone: Tone;
}[] = [
  { key: "protein", name: "Protein", icon: Drumstick, tone: "emerald" },
  { key: "carbohydrates", name: "Carbs", icon: Wheat, tone: "blue" },
  { key: "fat", name: "Fat", icon: Droplet, tone: "orange" },
  { key: "fiber", name: "Fiber", icon: Sprout, tone: "purple" },
];

/** Badge tint for % of target: emerald 60–110, amber >110, rose <40, muted between. */
function intakeBadgeClass(pct: number): string {
  if (pct > 110) return "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400";
  if (pct >= 60) return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
  if (pct >= 40) return "border-muted-foreground/30 bg-muted text-muted-foreground";
  return "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400";
}

function NutrientIntakeCard({ today, failed }: { today: DailySummaryResponse | null; failed: boolean }) {
  return (
    <Card className="min-w-0 rounded-3xl border-primary/15 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <HeaderChip tone="purple">
            <ListChecks className="h-4 w-4" />
          </HeaderChip>
          Nutrient Intake
        </CardTitle>
        <CardDescription className="mt-1">How you&apos;re doing vs recommended daily intake (today)</CardDescription>
      </CardHeader>
      <CardContent>
        {failed && <Unavailable note="Nutrient intake is unavailable right now — it will return with your next sync." />}
        {!today && !failed && (
          <div aria-busy="true" className="space-y-4">
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-10 w-full rounded-xl" />
            <span className="sr-only">Loading nutrient intake…</span>
          </div>
        )}
        {today &&
          NUTRIENT_ROWS.map(({ key, name, icon: Icon, tone }) => {
            const consumed = today.consumed[key];
            const target = today.targets[key];
            const pct = target > 0 ? Math.round((consumed / target) * 100) : 0;
            const fill = target > 0 ? Math.max(0, Math.min(1, consumed / target)) : 0;
            return (
              <div key={key} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                <span aria-hidden className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", CHIP[tone])}>
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">{name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {Math.round(consumed)} / {Math.round(target)} g
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full transition-[width] duration-500", DOT[tone])}
                      style={{ width: `${fill * 100}%` }}
                    />
                  </div>
                </div>
                <Badge variant="outline" className={cn("shrink-0 tabular-nums", intakeBadgeClass(pct))}>
                  {pct}%
                </Badge>
              </div>
            );
          })}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Row 2b — Coach Focus (SLM insight, honest replacement for the mood chart)
// ---------------------------------------------------------------------------

function CoachFocusCard() {
  const dataVersion = useNutriStore((s) => s.dataVersion);
  const [insight, setInsight] = useState<CoachInsightResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .coachInsight(false)
      .then((res) => {
        if (!alive) return;
        setInsight(res);
        setNote(null);
      })
      .catch((err) => {
        console.warn("[insights] coach insight unavailable:", err);
        if (!alive) return;
        setNote("The coach is unavailable right now — meanwhile: keep protein and fiber up, and stay hydrated.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [dataVersion]);

  async function handleRefresh() {
    setLoading(true);
    try {
      const res = await api.coachInsight(true);
      setInsight(res);
      setNote(null);
    } catch (err) {
      console.warn("[insights] coach refresh failed:", err);
      setNote(
        err instanceof Error && err.message.includes("Too many requests")
          ? "The coach needs a short break — try again in a few minutes."
          : "Could not refresh the coach insight right now.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="min-w-0 rounded-3xl border-primary/15 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <HeaderChip tone="emerald">
                <Sparkles className="h-4 w-4" />
              </HeaderChip>
              Coach Focus
            </CardTitle>
            <CardDescription className="mt-1">Today&apos;s grounded guidance from your verified numbers</CardDescription>
          </div>
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={loading}
            aria-label="Refresh the coach insight"
            title="Refresh insight"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden />
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {loading && !insight && (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <div className="flex flex-wrap gap-1.5 pt-1">
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-6 w-28 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            <span className="sr-only">Coach is thinking…</span>
          </div>
        )}

        {insight && (
          <div className={cn("space-y-3 transition-opacity", loading && "opacity-60")}>
            {insight.stale && (
              <p className="text-xs italic text-muted-foreground">
                You logged something new — refresh the coach for an up-to-date insight.
              </p>
            )}
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 text-sm font-bold leading-snug tracking-tight">{insight.headline}</p>
              <Badge
                variant="outline"
                className={cn(
                  "shrink-0 text-[9px] uppercase tracking-wide",
                  insight.engineSource === "ai"
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-muted-foreground/40 bg-muted text-muted-foreground",
                )}
              >
                {insight.engineSource === "ai" ? "AI" : "rule-based"}
              </Badge>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">{insight.insight}</p>
            {insight.focus.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {insight.focus.map((tip, i) => (
                  <Badge key={i} variant="outline" className="border-primary/25 bg-background/60 px-2.5 py-1 text-xs font-normal">
                    {tip}
                  </Badge>
                ))}
              </div>
            )}
            {insight.evidenceSources.length > 0 && (
              <p className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                Grounded in {insight.evidenceSources.join(" · ")}
              </p>
            )}
          </div>
        )}

        {!insight && !loading && (
          <p className="rounded-xl border border-dashed border-primary/30 bg-background/50 p-4 text-sm text-muted-foreground">
            Coach is offline — a steady rule of thumb: keep protein and fiber up, keep water handy, and log your meals on time.
          </p>
        )}

        {note && <p className="mt-2 text-xs italic text-muted-foreground">{note}</p>}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Row 2c — Key Insights (real digest rows + "See all" → WeeklyDigestDialog)
// ---------------------------------------------------------------------------

function KeyInsightsCard({ digest, failed }: { digest: WeeklyDigestResponse | null; failed: boolean }) {
  const avg = digest?.hydration.avgGlasses ?? null;
  const rows: { icon: React.ReactNode; tone: Tone; title: string; sub: string }[] = digest
    ? [
        {
          icon: <Target className="h-4 w-4" aria-hidden />,
          tone: "emerald",
          title: `${digest.adherence}% of logged days on target`,
          sub: "within ±10% of the calorie goal",
        },
        digest.bestDay
          ? {
              icon: <Award className="h-4 w-4" aria-hidden />,
              tone: "emerald",
              title: `Best day ${dayLabel(digest.bestDay.date, "EEE d MMM")} at ${formatNumber(digest.bestDay.calories)} kcal`,
              sub: `${digest.bestDay.deltaPct}% off target — closest logged day this week`,
            }
          : {
              icon: <Award className="h-4 w-4" aria-hidden />,
              tone: "emerald",
              title: "No best day yet",
              sub: "Log meals to reveal your closest-to-target day",
            },
        {
          icon: <Droplet className="h-4 w-4" aria-hidden />,
          tone: "blue",
          title: `${avg !== null ? formatShort(avg) : "0"} / ${digest.hydration.goal} glasses`,
          sub: "daily water average vs goal",
        },
      ]
    : [];

  return (
    <Card className="min-w-0 rounded-3xl border-primary/15 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <HeaderChip tone="amber">
                <Sparkles className="h-4 w-4" />
              </HeaderChip>
              Key Insights
            </CardTitle>
            <CardDescription className="mt-1">Highlights from your deterministic weekly digest</CardDescription>
          </div>
          <div className="group relative shrink-0">
            <div className="rounded-lg has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background">
              <span
                aria-hidden
                className="inline-flex min-h-8 cursor-pointer items-center rounded-lg px-1 text-sm font-semibold text-primary transition-colors group-hover:text-primary/80"
              >
                See all →
              </span>
              {/* WeeklyDigestDialog owns its trigger; stretch it invisibly over the styled label. */}
              <div className="absolute inset-0 [&>button]:h-full [&>button]:w-full [&>button]:cursor-pointer [&>button]:opacity-0">
                <WeeklyDigestDialog />
              </div>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {failed && <Unavailable note="Insights are unavailable right now — they will return with your next sync." />}
        {!digest && !failed && (
          <div aria-busy="true" className="space-y-2.5">
            <Skeleton className="h-14 w-full rounded-2xl" />
            <Skeleton className="h-14 w-full rounded-2xl" />
            <Skeleton className="h-14 w-full rounded-2xl" />
            <span className="sr-only">Loading key insights…</span>
          </div>
        )}
        {digest &&
          rows.map((r, i) => (
            <div key={i} className="flex items-start gap-3 rounded-2xl border border-primary/10 bg-background/50 p-3">
              <span aria-hidden className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", CHIP[r.tone])}>
                {r.icon}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-snug">{r.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{r.sub}</p>
              </div>
            </div>
          ))}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Row 3a — Top Food Categories
// ---------------------------------------------------------------------------

function TopFoodsCard({ digest, failed }: { digest: WeeklyDigestResponse | null; failed: boolean }) {
  const foods = digest ? digest.topFoods.slice(0, 5) : [];
  const maxCount = foods.length ? Math.max(...foods.map((f) => f.count), 1) : 1;

  return (
    <Card className="min-w-0 rounded-3xl border-primary/15 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <HeaderChip tone="teal">
            <UtensilsCrossed className="h-4 w-4" />
          </HeaderChip>
          Top Food Categories
        </CardTitle>
        <CardDescription className="mt-1">What you logged most this week</CardDescription>
      </CardHeader>
      <CardContent>
        {failed && <Unavailable note="Top foods are unavailable right now — they will return with your next sync." />}
        {!digest && !failed && (
          <div aria-busy="true" className="space-y-3">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-2 w-5/6" />
            <Skeleton className="h-2 w-2/3" />
            <span className="sr-only">Loading top foods…</span>
          </div>
        )}
        {digest && foods.length === 0 && (
          <p className="rounded-xl border border-dashed border-primary/25 bg-primary/5 p-4 text-sm text-muted-foreground">
            Nothing logged yet this week — your most-logged foods will appear here.
          </p>
        )}
        {digest && foods.length > 0 && (
          <ul className="space-y-3" aria-label="Most logged foods this week">
            {foods.map((f) => (
              <li key={f.name} className="flex items-center gap-3">
                <span className="w-28 min-w-0 flex-1 truncate text-xs font-medium sm:w-32 sm:flex-none">{f.name}</span>
                <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-[width] duration-500"
                    style={{ width: `${Math.max(6, (f.count / maxCount) * 100)}%` }}
                  />
                </div>
                <span className="w-6 shrink-0 text-right text-xs font-semibold tabular-nums">{f.count}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Row 3b — Quote card
// ---------------------------------------------------------------------------

function QuoteCard() {
  const chips: { icon: React.ReactNode; label: string }[] = [
    { icon: <Heart className="h-3.5 w-3.5" aria-hidden />, label: "Eat Mindfully" },
    { icon: <Activity className="h-3.5 w-3.5" aria-hidden />, label: "Stay Active" },
    { icon: <Droplet className="h-3.5 w-3.5" aria-hidden />, label: "Stay Hydrated" },
  ];
  return (
    <Card className="relative h-full min-w-0 overflow-hidden rounded-3xl border-primary/15 shadow-sm">
      <img
        src="/images/hero-leaves.png"
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.08] [mask-image:linear-gradient(to_top,black_30%,transparent_95%)]"
      />
      <div className="relative flex h-full flex-col justify-between gap-6 bg-gradient-to-br from-primary/15 via-primary/5 to-teal-500/10 p-6">
        <div>
          <p className="font-script text-3xl font-semibold leading-tight text-primary sm:text-4xl">
            &ldquo;Progress, not perfection.&rdquo;
          </p>
          <p className="mt-2 text-xs font-medium text-muted-foreground">— NutriSLM</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <span
              key={c.label}
              className="flex items-center gap-1.5 rounded-full border border-primary/25 bg-background/70 px-3 py-1.5 text-xs font-medium text-foreground/80 backdrop-blur-sm"
            >
              <span aria-hidden className="text-primary">
                {c.icon}
              </span>
              {c.label}
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Row 3c — Ask NutriSLM Coach (wraps the shared AiCoach card)
// ---------------------------------------------------------------------------

function CoachAskCard() {
  return (
    <Card className="h-full min-w-0 rounded-3xl border-primary/15 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <HeaderChip tone="emerald">
            <MessageCircle className="h-4 w-4" />
          </HeaderChip>
          Ask NutriSLM Coach
        </CardTitle>
        <CardDescription className="mt-1">
          Follow-up chat grounded in your verified numbers — the model never invents them.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AiCoach />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export function InsightsView() {
  const dataVersion = useNutriStore((s) => s.dataVersion);
  const [data, setData] = useState<InsightsBundle | null>(null);
  const [failed, setFailed] = useState(false);

  // One bundle fetch for the hero + chart rows; refetch when meals change.
  // Any failure is silent+graceful: hero renders without stats, cards show
  // their unavailable notes, and the failure is logged for observability.
  useEffect(() => {
    let alive = true;
    Promise.all([
      api.weeklySummary(),
      api.weeklyDigest(),
      api.dailySummary(todayKey()),
      api.hydration(),
    ])
      .then(([weekly, digest, today, hydration]) => {
        if (!alive) return;
        setData({ weekly, digest, today, hydration });
        setFailed(false);
      })
      .catch((err) => {
        console.warn("[insights] data unavailable:", err);
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [dataVersion]);

  return (
    <div className="space-y-5">
      <FadeIn>
        <ViewHero
          title={
            <>
              Your <span className="text-primary">Nutrition</span> Insights
            </>
          }
          subtitle="Real data. Meaningful insights. A healthier you."
          script={
            <>
              Understand Today
              <br />
              Build a Healthier Tomorrow ♡
            </>
          }
          image="/images/hero-leaves.png"
          actions={
            <Select disabled value="last7">
              <SelectTrigger
                title="Only the last 7 days is available in this build"
                aria-label="Date range (only the last 7 days is available)"
                className="h-9 w-[150px] rounded-full border-primary/25 bg-background/80 text-xs font-medium"
              >
                <SelectValue placeholder="Last 7 days" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="last7">Last 7 days</SelectItem>
              </SelectContent>
            </Select>
          }
        />
        {/* Five StatCards in their own full-width row (2 cols mobile / 5 on lg). */}
        {!failed && (
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5 lg:gap-4">
            {data ? <HeroStats weekly={data.weekly} digest={data.digest} hydration={data.hydration} /> : <HeroStatSkeletons />}
          </div>
        )}
      </FadeIn>

      {failed && (
        <FadeIn delay={0.05}>
          <Card className="rounded-3xl border-dashed border-primary/25 bg-primary/5 p-0 shadow-sm">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">
                Could not load your nutrition data just now — check your connection. Everything returns with your next sync.
              </p>
            </CardContent>
          </Card>
        </FadeIn>
      )}

      {!failed && (
        <FadeIn delay={0.05} className="min-w-0">
          <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr_1fr]">
            <CalorieTrendCard weekly={data?.weekly ?? null} failed={failed} />
            <MacroCard today={data?.today ?? null} failed={failed} />
            <MealTimingCard today={data?.today ?? null} failed={failed} />
          </div>
        </FadeIn>
      )}

      {!failed && (
        <FadeIn delay={0.1} className="min-w-0">
          <div className="grid gap-5 xl:grid-cols-3">
            <NutrientIntakeCard today={data?.today ?? null} failed={failed} />
            <CoachFocusCard />
            <KeyInsightsCard digest={data?.digest ?? null} failed={failed} />
          </div>
        </FadeIn>
      )}

      <FadeIn delay={0.15} className="min-w-0">
        <div className="grid gap-5 xl:grid-cols-3">
          <TopFoodsCard digest={data?.digest ?? null} failed={failed} />
          <QuoteCard />
          <CoachAskCard />
        </div>
      </FadeIn>

      <FadeIn delay={0.2}>
        <NotesJournal />
      </FadeIn>
    </div>
  );
}
