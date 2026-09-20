/**
 * GET /api/nutrition/insights?days=7|14|30
 *
 * Deterministic aggregation for the Insights dashboard — NO AI calls, pure DB
 * aggregation + fixed rules over the signed-in user's meals and hydration.
 *
 * Window = the `days` days ending today (server-local, today included), plus
 * the previous equal-length window for deltas. Response (contract mirrored in
 * InsightsResponse, src/lib/client/types.ts): per-day nutrition + hydration,
 * calorie/protein/fiber KPI series with sparklines and prev-window deltas,
 * macro split (Atwater 4/4/9/2), meal-timing share, nutrient bars vs targets,
 * mood-vs-hydration series (moods parsed from Meal.userNotes quick-chips),
 * top food categories, calorie adherence, logging streak and rule-based
 * key insights.
 */
import { NextRequest, NextResponse } from "next/server";
import { withApi } from "@/lib/api-utils";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProfileFor } from "@/lib/nutrition/meal-service";
import { computeDailyTargets } from "@/lib/nutrition/targets";
import type { RequestContext } from "@/lib/observability";
import type { InsightsKpiSeries, InsightsResponse, KeyInsight } from "@/lib/client/types";

/** Same 8-glass goal as the hydration widget (HYDRATION_GOAL_GLASSES). */
const HYDRATION_GOAL = 8;

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** 1-decimal string with a trailing ".0" trimmed ("5" instead of "5.0"). */
function fmt1(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// ---- Mood scoring from meal reflection notes (same quick-chip phrases as notes-journal) ----

const MOOD_PATTERNS: { mood: string; re: RegExp }[] = [
  { mood: "enjoyed", re: /enjoyed it/i },
  { mood: "craving", re: /was craving this/i },
  { mood: "okay", re: /just okay/i },
  { mood: "habit", re: /ate out of habit/i },
  { mood: "stressed", re: /stressful day/i },
  { mood: "fuel", re: /post-workout fuel/i },
];

const MOOD_SCORE: Record<string, number> = { enjoyed: 4, fuel: 3, habit: 3, okay: 2, craving: 1.5, stressed: 1 };

/** Mean matched-mood score of one note; null when no known mood phrase matches. */
function noteScore(note: string): number | null {
  const scores = MOOD_PATTERNS.filter((p) => p.re.test(note)).map((p) => MOOD_SCORE[p.mood]);
  return scores.length === 0 ? null : scores.reduce((a, b) => a + b, 0) / scores.length;
}

// ---- Food category buckets ----

const CATEGORY_META: Record<string, { label: string; emoji: string }> = {
  grain: { label: "Grains & Cereals", emoji: "🌾" },
  proteins: { label: "Proteins", emoji: "🫘" },
  vegetable: { label: "Vegetables", emoji: "🥦" },
  fruit: { label: "Fruits", emoji: "🍎" },
  dairy: { label: "Dairy", emoji: "🥛" },
  fat: { label: "Fats & Oils", emoji: "🥑" },
  sweet: { label: "Sweets", emoji: "🍯" },
  beverage: { label: "Beverages", emoji: "🍵" },
  dish: { label: "Mixed Dishes", emoji: "🍛" },
  condiment: { label: "Condiments", emoji: "🧂" },
};

/** legume/meat/egg collapse into the single "proteins" bucket. */
const PROTEIN_SOURCE_CATEGORIES = new Set(["legume", "meat", "egg"]);

// ---- Per-day accumulation ----

interface DayTotals {
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
  meals: number;
}

function emptyDay(): DayTotals {
  return { calories: 0, protein: 0, carbohydrates: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0, meals: 0 };
}

function bucketsFor(start: Date, count: number): Map<string, DayTotals> {
  const map = new Map<string, DayTotals>();
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    map.set(dateKey(d), emptyDay());
  }
  return map;
}

function sumBuckets(map: Map<string, DayTotals>): DayTotals {
  const acc = emptyDay();
  for (const b of map.values()) {
    acc.calories += b.calories;
    acc.protein += b.protein;
    acc.carbohydrates += b.carbohydrates;
    acc.fat += b.fat;
    acc.fiber += b.fiber;
    acc.sugar += b.sugar;
    acc.sodium += b.sodium;
    acc.meals += b.meals;
  }
  return acc;
}

// ---- KPI helpers ----

/** (avgThis − avgPrev) / avgPrev × 100, only when both windows have logged days. */
function pctDelta(curAvg: number, prevAvg: number, curLogged: number, prevLogged: number): number | null {
  if (curLogged === 0 || prevLogged === 0 || prevAvg === 0) return null;
  return Math.round(((curAvg - prevAvg) / prevAvg) * 100);
}

function directionOf(delta: number | null): "up" | "down" | "flat" {
  if (delta === null) return "flat";
  if (delta > 2) return "up";
  if (delta < -2) return "down";
  return "flat";
}

function kpiSeries(value: number, sparkline: number[], delta: number | null, daysLogged: number): InsightsKpiSeries {
  return { value, deltaPct: delta, direction: directionOf(delta), sparkline, daysLogged };
}

/** Atwater pct share of one macro's calorie contribution (0 when nothing logged). */
function macroPct(kcal: number, totalKcal: number): number {
  return totalKcal > 0 ? Math.round((kcal / totalKcal) * 100) : 0;
}

// ---- Macro verdict (deterministic rules) ----

function macroVerdict(
  daysLogged: number,
  proteinPct: number,
  carbsPct: number,
  fatPct: number,
  fiberAvg: number,
  fiberTarget: number,
): { verdict: string; tone: "great" | "good" | "watch" } {
  if (daysLogged === 0) return { verdict: "Log a few meals to see your macro balance.", tone: "good" };
  if (proteinPct >= 12 && fiberAvg >= 0.8 * fiberTarget && fatPct <= 35) {
    return { verdict: "Well balanced! Keep your protein and fiber up.", tone: "great" };
  }
  if (fatPct > 40) return { verdict: "Fat is a bit heavy — tilt toward protein and fibre-rich foods.", tone: "watch" };
  if (carbsPct > 60) return { verdict: "Carbs are dominating — balance plates with protein and vegetables.", tone: "watch" };
  return { verdict: "A solid week — nudge protein and fiber a little higher.", tone: "good" };
}

export const GET = withApi(
  "nutrition_insights",
  async ({ req, ctx }: { req: NextRequest; ctx: RequestContext }): Promise<NextResponse> => {
    const user = await requireUser();
    ctx.userId = user.id;

    const url = new URL(req.url);
    const parsed = Number(url.searchParams.get("days") ?? 7);
    const days = parsed === 7 || parsed === 14 || parsed === 30 ? parsed : 7;

    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));
    const prevStart = new Date(start);
    prevStart.setDate(prevStart.getDate() - days);

    const cur = bucketsFor(start, days);
    const prev = bucketsFor(prevStart, days);
    const curKeys = [...cur.keys()];

    const [profile, meals, hydrationRows] = await Promise.all([
      getProfileFor(user.id),
      db.meal.findMany({
        where: { userId: user.id, eatenAt: { gte: prevStart } },
        select: {
          eatenAt: true,
          mealType: true,
          userNotes: true,
          totalCalories: true,
          totalProtein: true,
          totalCarbohydrates: true,
          totalFat: true,
          totalFiber: true,
          totalSugar: true,
          totalSodium: true,
          foods: { select: { foodId: true, calories: true, food: { select: { category: true } } } },
        },
      }),
      db.hydrationLog.findMany({
        where: { userId: user.id, date: { in: curKeys } },
        select: { date: true, glasses: true },
      }),
    ]);

    const targets = computeDailyTargets(profile);

    // Bucket meals by local date key; mood/timing/categories only for the current window
    const moodScores = new Map<string, number[]>();
    const noteCount = new Map<string, number>();
    const slotCalories: Record<string, number> = { breakfast: 0, lunch: 0, dinner: 0, snack: 0 };
    const categoryCalories = new Map<string, number>();

    for (const m of meals) {
      const key = dateKey(m.eatenAt);
      const bucket = cur.get(key) ?? prev.get(key);
      if (!bucket) continue;
      bucket.calories += m.totalCalories;
      bucket.protein += m.totalProtein;
      bucket.carbohydrates += m.totalCarbohydrates;
      bucket.fat += m.totalFat;
      bucket.fiber += m.totalFiber;
      bucket.sugar += m.totalSugar;
      bucket.sodium += m.totalSodium;
      bucket.meals += 1;

      if (!cur.has(key)) continue;

      if (m.userNotes !== null) {
        noteCount.set(key, (noteCount.get(key) ?? 0) + 1);
        const score = noteScore(m.userNotes);
        if (score !== null) {
          const list = moodScores.get(key) ?? [];
          list.push(score);
          moodScores.set(key, list);
        }
      }
      if (m.mealType in slotCalories) slotCalories[m.mealType] += m.totalCalories;
      for (const f of m.foods) {
        if (f.foodId === null || f.food === null) continue;
        const bucketName = PROTEIN_SOURCE_CATEGORIES.has(f.food.category) ? "proteins" : f.food.category;
        categoryCalories.set(bucketName, (categoryCalories.get(bucketName) ?? 0) + f.calories);
      }
    }

    const hydrationByDate = new Map(hydrationRows.map((h) => [h.date, h.glasses] as const));

    const perDay = curKeys.map((date) => {
      const b = cur.get(date)!;
      return {
        date,
        calories: Math.round(b.calories),
        protein: round1(b.protein),
        carbohydrates: round1(b.carbohydrates),
        fat: round1(b.fat),
        fiber: round1(b.fiber),
        sugar: round1(b.sugar),
        sodium: Math.round(b.sodium),
        meals: b.meals,
        hydrationGlasses: hydrationByDate.get(date) ?? 0,
      };
    });

    const daysLogged = perDay.filter((d) => d.meals > 0).length;
    const prevLogged = [...prev.values()].filter((b) => b.meals > 0).length;
    const curTotals = sumBuckets(cur);
    const prevTotals = sumBuckets(prev);

    // ---- KPI series (avg per LOGGED day, sparkline = per-day values) ----
    const caloriesAvg = daysLogged === 0 ? 0 : Math.round(curTotals.calories / daysLogged);
    const proteinAvg = daysLogged === 0 ? 0 : round1(curTotals.protein / daysLogged);
    const fiberAvg = daysLogged === 0 ? 0 : round1(curTotals.fiber / daysLogged);
    const prevCaloriesAvg = prevLogged === 0 ? 0 : Math.round(prevTotals.calories / prevLogged);
    const prevProteinAvg = prevLogged === 0 ? 0 : round1(prevTotals.protein / prevLogged);
    const prevFiberAvg = prevLogged === 0 ? 0 : round1(prevTotals.fiber / prevLogged);

    const todayGlasses = hydrationByDate.get(dateKey(now)) ?? 0;
    const kpis: InsightsResponse["kpis"] = {
      calories: kpiSeries(caloriesAvg, perDay.map((d) => d.calories), pctDelta(caloriesAvg, prevCaloriesAvg, daysLogged, prevLogged), daysLogged),
      protein: kpiSeries(proteinAvg, perDay.map((d) => d.protein), pctDelta(proteinAvg, prevProteinAvg, daysLogged, prevLogged), daysLogged),
      fiber: kpiSeries(fiberAvg, perDay.map((d) => d.fiber), pctDelta(fiberAvg, prevFiberAvg, daysLogged, prevLogged), daysLogged),
      water: {
        glasses: todayGlasses,
        goal: HYDRATION_GOAL,
        pct: Math.max(0, Math.min(100, Math.round((todayGlasses / HYDRATION_GOAL) * 100))),
      },
      weight: { valueKg: profile.weightKg ?? null, deltaPct: null },
    };

    // ---- Macro split (Atwater 4/4/9/2, normalized to 100) ----
    const macroGrams: { key: "carbs" | "protein" | "fat" | "fiber"; label: string; grams: number; color: string; kcal: number }[] = [
      { key: "carbs", label: "Carbs", grams: round1(curTotals.carbohydrates), color: "#f59e0b", kcal: curTotals.carbohydrates * 4 },
      { key: "protein", label: "Protein", grams: round1(curTotals.protein), color: "#10b981", kcal: curTotals.protein * 4 },
      { key: "fat", label: "Fat", grams: round1(curTotals.fat), color: "#f97316", kcal: curTotals.fat * 9 },
      { key: "fiber", label: "Fiber", grams: round1(curTotals.fiber), color: "#8b5cf6", kcal: curTotals.fiber * 2 },
    ];
    const macroKcal = macroGrams.reduce((a, s) => a + s.kcal, 0);
    const macros = {
      totalCalories: Math.round(curTotals.calories),
      slices: macroGrams.map((s) => ({
        key: s.key,
        label: s.label,
        grams: s.grams,
        pct: macroPct(s.kcal, macroKcal),
        color: s.color,
      })),
      ...macroVerdict(
        daysLogged,
        macroPct(curTotals.protein * 4, macroKcal),
        macroPct(curTotals.carbohydrates * 4, macroKcal),
        macroPct(curTotals.fat * 9, macroKcal),
        fiberAvg,
        targets.fiber,
      ),
    };

    // ---- Meal timing (share of window calories per slot) ----
    const SLOT_META = [
      { slot: "breakfast", label: "Breakfast" },
      { slot: "lunch", label: "Lunch" },
      { slot: "dinner", label: "Dinner" },
      { slot: "snack", label: "Snack" },
    ] as const;
    const mealTiming = SLOT_META.map(({ slot, label }) => ({
      slot,
      label,
      pct: curTotals.calories > 0 ? Math.round((slotCalories[slot] / curTotals.calories) * 100) : 0,
    }));

    // ---- Nutrient bars vs targets (avg per logged day, clamped 0..150%) ----
    const NUTRIENT_BARS = [
      { key: "protein", label: "Protein", color: "#10b981" },
      { key: "carbohydrates", label: "Carbs", color: "#f59e0b" },
      { key: "fat", label: "Fat", color: "#f97316" },
      { key: "fiber", label: "Fiber", color: "#8b5cf6" },
    ] as const;
    const nutrientIntake = NUTRIENT_BARS.map(({ key, label, color }) => {
      const value = daysLogged === 0 ? 0 : round1(curTotals[key] / daysLogged);
      const target = targets[key];
      return {
        key,
        label,
        value,
        target,
        pct: target > 0 ? Math.max(0, Math.min(150, Math.round((value / target) * 100))) : 0,
        color,
      };
    });

    // ---- Mood vs hydration (one entry per day of the window) ----
    const moodHydration = curKeys.map((date) => {
      const scores = moodScores.get(date);
      return {
        date,
        mood: scores && scores.length > 0 ? round1(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
        moodCount: noteCount.get(date) ?? 0,
        hydration: hydrationByDate.get(date) ?? 0,
      };
    });

    // ---- Top food categories (matched MealFood calories, share of window meal calories) ----
    const topCategories = [...categoryCalories.entries()]
      .map(([category, calories]) => ({
        category,
        label: CATEGORY_META[category].label,
        emoji: CATEGORY_META[category].emoji,
        calories: Math.round(calories),
        pct: curTotals.calories > 0 ? Math.round((calories / curTotals.calories) * 100) : 0,
      }))
      .sort((a, b) => b.calories - a.calories || a.category.localeCompare(b.category))
      .slice(0, 5);

    // ---- Calorie adherence (logged days within ±10% of target) ----
    let daysOnTarget = 0;
    for (const d of perDay) {
      if (d.meals > 0 && Math.abs(d.calories - targets.calories) <= targets.calories * 0.1) daysOnTarget += 1;
    }
    const adherencePct = daysLogged === 0 ? null : Math.round((daysOnTarget / daysLogged) * 100);

    // ---- Logging streak (consecutive days with >=1 meal ending today) ----
    let streak = 0;
    for (let i = perDay.length - 1; i >= 0; i--) {
      if (perDay[i].meals > 0) streak += 1;
      else break;
    }

    // ---- Key insights (deterministic rules, max 4, priority order) ----
    const totalGlasses = perDay.reduce((a, d) => a + d.hydrationGlasses, 0);
    const avgGlasses = round1(totalGlasses / days);
    const collected: KeyInsight[] = [];
    if (curTotals.meals === 0) {
      collected.push({
        id: "no-meals",
        icon: "meals",
        tone: "info",
        title: "No meals logged this period",
        description: "Log a meal to unlock trends, macro balance and personalised insights.",
      });
    } else {
      const fiberDelta = kpis.fiber.deltaPct;
      if (fiberDelta !== null && fiberDelta >= 10) {
        collected.push({
          id: "fiber-improved",
          icon: "fiber",
          tone: "positive",
          title: `Fiber intake improved by ${fiberDelta}%`,
          description: "Great progress! Keep including more fruits, vegetables and whole grains.",
        });
      }
      const sugarAvg = round1(curTotals.sugar / daysLogged);
      if (sugarAvg > targets.sugar && targets.sugar > 0) {
        collected.push({
          id: "sugar-high",
          icon: "sugar",
          tone: "warning",
          title: "Sugar intake is slightly high",
          description: "Try to reduce added sugars, especially in the evening.",
        });
      }
      if (todayGlasses < HYDRATION_GOAL) {
        collected.push({
          id: "hydration-low",
          icon: "hydration",
          tone: "info",
          title: "Hydration can be better",
          description: `You're averaging ${fmt1(avgGlasses)} glasses. Aim for at least ${HYDRATION_GOAL} glasses daily.`,
        });
      }
      if (daysLogged > 0 && proteinAvg < 0.8 * targets.protein) {
        collected.push({
          id: "protein-low",
          icon: "protein",
          tone: "info",
          title: "Protein is below your goal",
          description: `Averaging ${fmt1(proteinAvg)} g against a ${targets.protein} g target — add a dal, curd or paneer serving.`,
        });
      }
      if (adherencePct !== null && adherencePct >= 60) {
        collected.push({
          id: "adherence-high",
          icon: "calories",
          tone: "positive",
          title: `${adherencePct}% of days on target`,
          description: "Your calorie intake is landing close to plan — consistency wins.",
        });
      }
      if (daysLogged > 0 && round1(curTotals.sodium / daysLogged) > targets.sodium) {
        collected.push({
          id: "sodium-high",
          icon: "sodium",
          tone: "warning",
          title: "Sodium is running high",
          description: "Watch packaged and pickled foods; favour fresh preparations.",
        });
      }
      if (collected.length < 2) {
        collected.push({
          id: "logging-streak",
          icon: "meals",
          tone: "positive",
          title: streak >= 2 ? `${streak}-day logging streak` : "Keep logging your meals",
          description: "Consistent logging is the strongest predictor of better choices.",
        });
      }
    }
    const keyInsights = collected.slice(0, 4);

    const payload: InsightsResponse = {
      days,
      range: { start: curKeys[0], end: curKeys[curKeys.length - 1] },
      perDay,
      targets: {
        calories: targets.calories,
        protein: targets.protein,
        carbohydrates: targets.carbohydrates,
        fat: targets.fat,
        fiber: targets.fiber,
        sugar: targets.sugar,
        sodium: targets.sodium,
      },
      kpis,
      macros,
      mealTiming,
      nutrientIntake,
      moodHydration,
      keyInsights,
      topCategories,
      adherencePct,
      daysLogged,
      streak,
    };

    return NextResponse.json(payload);
  },
);
