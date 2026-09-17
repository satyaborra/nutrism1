/**
 * GET /api/nutrition/weekly-digest — deterministic weekly "report card".
 *
 * Pure aggregation over persisted data (meals, hydration, food DB):
 *   - per-metric week averages vs targets → grade (great | good | watch | off)
 *   - calorie-band adherence (% of logged days within ±10% of target)
 *   - best day (closest to calorie target), highest-sodium day
 *   - top most-logged foods (by matched foodId, fallback display name)
 *   - previous-7-day comparison deltas (honest "no data" when absent)
 *   - hydration average (glasses/day, 250 ml each)
 *   - ONE evidence citation via the TF-IDF retriever, queried on the weakest
 *     metric — deterministic, source-attributed, never AI-invented.
 *
 * No LLM involved: every number here is reproducible from the database.
 */
import { NextResponse } from "next/server";
import { withApi } from "@/lib/api-utils";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProfileFor } from "@/lib/nutrition/meal-service";
import { computeDailyTargets, safeParseArray } from "@/lib/nutrition/targets";
import { retrieveEvidence } from "@/lib/rag/retriever";
import { round } from "@/lib/format";
import type { RequestContext } from "@/lib/observability";

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type Grade = "great" | "good" | "watch" | "off";

interface MetricResult {
  key: string;
  label: string;
  unit: string;
  avg: number | null;
  target: number | null;
  direction: "under" | "over" | "atLeast";
  grade: Grade;
  /** 0..100 — how close the week average landed relative to target. */
  score: number | null;
}

function gradeFor(ratio: number, tolerance: number, direction: "under" | "over" | "atLeast"): Grade {
  // ratio: avg/target (target>0). "under" = staying below target is good,
  // "over" = reaching at least the target is good, "atLeast" = close to target is good.
  const within = (a: number, b: number) => Math.abs(a - b) <= b * tolerance;
  if (direction === "atLeast") {
    if (ratio >= 0.95 && ratio <= 1.05) return "great";
    if (ratio >= 0.85 && ratio <= 1.2) return "good";
    if (ratio >= 0.6 && ratio <= 1.5) return "watch";
    return "off";
  }
  // under/over share the same banding logic mirrored
  const good = direction === "under" ? ratio <= 1 + tolerance : ratio >= 1 - tolerance;
  const ok = direction === "under" ? ratio <= 1 + tolerance * 2 : ratio >= 1 - tolerance * 2;
  const near = within(ratio, tolerance * 4);
  if (good) return "great";
  if (ok) return "good";
  if (near) return "watch";
  return "off";
}

function metricScore(ratio: number, direction: "under" | "over" | "atLeast"): number {
  const capped = Math.min(ratio, 2);
  if (direction === "atLeast") return Math.round(Math.max(0, 100 - Math.abs(1 - capped) * 100));
  if (direction === "under") return Math.round(Math.max(0, 100 - Math.max(0, capped - 1) * 100));
  return Math.round(Math.max(0, Math.min(100, capped * 100)));
}

export const GET = withApi(
  "weekly_digest",
  async ({ ctx }: { req: unknown; ctx: RequestContext }): Promise<NextResponse> => {
    const user = await requireUser();
    ctx.userId = user.id;

    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    const prevStart = new Date(start);
    prevStart.setDate(prevStart.getDate() - 7);

    const [profile, meals, hydration, prevMeals] = await Promise.all([
      getProfileFor(user.id),
      db.meal.findMany({
        where: { userId: user.id, eatenAt: { gte: start } },
        select: {
          eatenAt: true, totalCalories: true, totalProtein: true, totalFiber: true,
          totalSugar: true, totalSodium: true, totalSaturatedFat: true, foods: { select: { foodId: true, displayName: true } },
        },
      }),
      db.hydrationLog.findMany({
        where: { userId: user.id, date: { gte: dateKey(start) } },
        select: { date: true, glasses: true },
      }),
      db.meal.findMany({
        where: { userId: user.id, eatenAt: { gte: prevStart, lt: start } },
        select: { totalCalories: true, totalProtein: true },
      }),
    ]);

    const targets = computeDailyTargets(profile);
    const conditions = safeParseArray(profile.healthConditions);

    // ---- per-day buckets (current week) ----
    const byDate = new Map<string, { calories: number; protein: number; fiber: number; sugar: number; sodium: number; meals: number }>();
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      byDate.set(dateKey(d), { calories: 0, protein: 0, fiber: 0, sugar: 0, sodium: 0, meals: 0 });
    }
    for (const m of meals) {
      const b = byDate.get(dateKey(m.eatenAt));
      if (!b) continue;
      b.calories += m.totalCalories;
      b.protein += m.totalProtein;
      b.fiber += m.totalFiber;
      b.sugar += m.totalSugar;
      b.sodium += m.totalSodium;
      b.meals += 1;
    }

    const logged = [...byDate.values()].filter((b) => b.meals > 0);
    const daysLogged = logged.length;
    const avg = (sel: (b: { calories: number; protein: number; fiber: number; sugar: number; sodium: number }) => number) =>
      daysLogged === 0 ? null : round(logged.reduce((a, b) => a + sel(b), 0) / daysLogged, 1);

    const avgCalories = avg((b) => b.calories);
    const avgProtein = avg((b) => b.protein);
    const avgFiber = avg((b) => b.fiber);
    const avgSugar = avg((b) => b.sugar);
    const avgSodium = avg((b) => b.sodium);

    // ---- metrics with grades ----
    const mk = (
      key: string, label: string, unit: string, avgV: number | null, targetV: number,
      direction: "under" | "over" | "atLeast", tolerance: number,
    ): MetricResult => {
      const ratio = avgV !== null && targetV > 0 ? avgV / targetV : null;
      return {
        key, label, unit,
        avg: avgV, target: round(targetV, 1), direction,
        grade: ratio === null ? "off" : gradeFor(ratio, tolerance, direction),
        score: ratio === null ? null : metricScore(ratio, direction),
      };
    };

    const metrics: MetricResult[] = [
      mk("calories", "Calories", "kcal", avgCalories, targets.calories, "atLeast", 0.1),
      mk("protein", "Protein", "g", avgProtein, targets.protein, "over", 0.15),
      mk("fiber", "Fiber", "g", avgFiber, targets.fiber, "over", 0.2),
      mk("sugar", "Sugar", "g", avgSugar, Math.max(30, targets.sugar || 50), "under", 0.25),
      mk("sodium", "Sodium", "mg", avgSodium, Math.max(1500, targets.sodium || 2300), "under", 0.2),
    ];

    // ---- adherence + highlights ----
    const calorieBandLow = targets.calories * 0.9;
    const calorieBandHigh = targets.calories * 1.1;
    const adherence = daysLogged === 0
      ? 0
      : Math.round((logged.filter((b) => b.calories >= calorieBandLow && b.calories <= calorieBandHigh).length / daysLogged) * 100);

    let bestDay: { date: string; calories: number; deltaPct: number } | null = null;
    let worstSodiumDay: { date: string; sodium: number } | null = null;
    for (const [date, b] of byDate) {
      if (b.meals === 0) continue;
      const deltaPct = Math.abs(b.calories - targets.calories) / Math.max(1, targets.calories);
      if (!bestDay || deltaPct < bestDay.deltaPct) bestDay = { date, calories: Math.round(b.calories), deltaPct: round(deltaPct * 100, 1) };
      if (!worstSodiumDay || b.sodium > worstSodiumDay.sodium) worstSodiumDay = { date, sodium: Math.round(b.sodium) };
    }

    // ---- top foods (matched by foodId first, else display name) ----
    const foodCounts = new Map<string, { name: string; count: number }>();
    for (const m of meals) {
      for (const f of m.foods) {
        const key = f.foodId ?? `name:${f.displayName.toLowerCase()}`;
        const cur = foodCounts.get(key);
        if (cur) cur.count += 1;
        else foodCounts.set(key, { name: f.displayName, count: 1 });
      }
    }
    const topFoods = [...foodCounts.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // ---- previous week comparison ----
    const prevTotals = prevMeals.reduce(
      (a, m) => ({ calories: a.calories + m.totalCalories, protein: a.protein + m.totalProtein, meals: a.meals + 1 }),
      { calories: 0, protein: 0, meals: 0 },
    );
    const thisTotals = meals.reduce(
      (a, m) => ({ calories: a.calories + m.totalCalories, protein: a.protein + m.totalProtein, meals: a.meals + 1 }),
      { calories: 0, protein: 0, meals: 0 },
    );
    const prevAvgCalories = prevTotals.meals > 0 ? prevTotals.calories / 7 : null;
    const prevAvgProtein = prevTotals.meals > 0 ? prevTotals.protein / 7 : null;
    const comparison = {
      available: prevTotals.meals > 0,
      caloriesDelta: prevAvgCalories !== null && avgCalories !== null ? Math.round(avgCalories - prevAvgCalories) : null,
      proteinDelta: prevAvgProtein !== null && avgProtein !== null ? round(avgProtein - prevAvgProtein, 1) : null,
      mealsDelta: thisTotals.meals - prevTotals.meals,
    };

    // ---- hydration ----
    const glasses = hydration.map((h) => h.glasses);
    const avgGlasses = glasses.length > 0 ? round(glasses.reduce((a, b) => a + b, 0) / 7, 1) : null;

    // ---- evidence: query on the weakest metric (+ conditions) ----
    const weakest = [...metrics]
      .filter((m) => m.avg !== null)
      .sort((a, b) => (a.score ?? 100) - (b.score ?? 100))[0];
    let evidence: { source: string; document: string; section: string; text: string } | null = null;
    if (weakest) {
      const query = `${weakest.label.toLowerCase()} ${conditions.join(" ")} weekly intake recommendation`;
      const res = await retrieveEvidence(query, 1, [...conditions.map((c) => c.toLowerCase()), weakest.key]);
      if (res.chunks.length > 0) {
        const c = res.chunks[0];
        evidence = { source: c.source, document: c.document, section: c.section, text: c.text };
      }
    }

    return NextResponse.json({
      weekOf: dateKey(start),
      daysLogged,
      metrics,
      adherence,
      bestDay,
      worstSodiumDay,
      topFoods,
      comparison,
      hydration: { avgGlasses, mlPerGlass: 250, goal: 8 },
      evidence,
      targets: { calories: targets.calories, protein: targets.protein },
    });
  },
);
