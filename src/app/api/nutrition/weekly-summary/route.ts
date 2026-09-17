/**
 * GET /api/nutrition/weekly-summary
 * Last 7 days (server-local, today included): calories/protein per day,
 * meal counts, calorie/protein targets, and the current logging streak.
 * Deterministic aggregation over persisted meals only.
 */
import { NextResponse } from "next/server";
import { withApi } from "@/lib/api-utils";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProfileFor } from "@/lib/nutrition/meal-service";
import { computeDailyTargets } from "@/lib/nutrition/targets";
import type { RequestContext } from "@/lib/observability";

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const GET = withApi("weekly_summary", async ({ ctx }: { req: unknown; ctx: RequestContext }): Promise<NextResponse> => {
  const user = await requireUser();
  ctx.userId = user.id;

  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);

  const [profile, meals] = await Promise.all([
    getProfileFor(user.id),
    db.meal.findMany({
      where: { userId: user.id, eatenAt: { gte: start } },
      select: {
        eatenAt: true,
        totalCalories: true,
        totalProtein: true,
        totalFiber: true,
        totalSugar: true,
        totalSodium: true,
      },
    }),
  ]);

  const targets = computeDailyTargets(profile);

  // Bucket by local date key
  const byDate = new Map<string, { calories: number; protein: number; fiber: number; sugar: number; sodium: number; meals: number }>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    byDate.set(dateKey(d), { calories: 0, protein: 0, fiber: 0, sugar: 0, sodium: 0, meals: 0 });
  }
  for (const m of meals) {
    const key = dateKey(m.eatenAt);
    const bucket = byDate.get(key);
    if (!bucket) continue;
    bucket.calories += m.totalCalories;
    bucket.protein += m.totalProtein;
    bucket.fiber += m.totalFiber;
    bucket.sugar += m.totalSugar;
    bucket.sodium += m.totalSodium;
    bucket.meals += 1;
  }

  const days = [...byDate.entries()].map(([date, v]) => ({
    date,
    calories: Math.round(v.calories),
    protein: Math.round(v.protein * 10) / 10,
    fiber: Math.round(v.fiber * 10) / 10,
    sugar: Math.round(v.sugar * 10) / 10,
    sodium: Math.round(v.sodium),
    meals: v.meals,
    onTarget: v.meals > 0,
  }));

  // Logging streak: consecutive days with >=1 meal ending today
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].meals > 0) streak += 1;
    else break;
  }

  const weekTotals = days.reduce(
    (acc, d) => ({
      calories: acc.calories + d.calories,
      protein: Math.round((acc.protein + d.protein) * 10) / 10,
      meals: acc.meals + d.meals,
      daysLogged: acc.daysLogged + (d.meals > 0 ? 1 : 0),
    }),
    { calories: 0, protein: 0, meals: 0, daysLogged: 0 }
  );

  return NextResponse.json({
    days,
    streak,
    targets: { calories: targets.calories, protein: targets.protein },
    weekTotals,
    avgCalories: Math.round(weekTotals.calories / 7),
  });
});
