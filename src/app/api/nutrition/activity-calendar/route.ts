/**
 * GET /api/nutrition/activity-calendar?weeks=12
 * Deterministic per-day aggregation over the trailing N weeks (default 12,
 * max 26): meal count, calories vs target, water glasses and a light meal
 * list for the day-detail view. Database is the only source — no client
 * input influences any number.
 */
import { NextRequest, NextResponse } from "next/server";
import { withApi } from "@/lib/api-utils";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProfileFor } from "@/lib/nutrition/meal-service";
import { computeDailyTargets } from "@/lib/nutrition/targets";

export interface ActivityCalendarMeal {
  id: string;
  mealType: string;
  kcal: number;
  foods: string;
}

export interface ActivityDay {
  date: string;
  meals: number;
  calories: number;
  water: number;
  items: ActivityCalendarMeal[];
}

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const GET = withApi("activity_calendar", async ({ req }: { req: NextRequest }) => {
  const user = await requireUser();
  const url = new URL(req.url);
  const weeksRaw = Number(url.searchParams.get("weeks") ?? "12");
  const weeks = Number.isFinite(weeksRaw) ? Math.min(26, Math.max(4, Math.floor(weeksRaw))) : 12;

  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  // Grid spans whole weeks aligned to Monday; the last column holds today.
  const totalDays = weeks * 7;
  const start = new Date(today);
  start.setDate(start.getDate() - (totalDays - 1));
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // back to Monday
  const endExclusive = new Date(today);
  endExclusive.setDate(endExclusive.getDate() + 1);

  const [profile, meals, hydration] = await Promise.all([
    getProfileFor(user.id),
    db.meal.findMany({
      where: { userId: user.id, eatenAt: { gte: start, lt: endExclusive } },
      select: {
        id: true,
        eatenAt: true,
        mealType: true,
        totalCalories: true,
        foods: { select: { displayName: true }, orderBy: { displayName: "asc" } },
      },
      orderBy: { eatenAt: "asc" },
    }),
    db.hydrationLog.findMany({
      where: { userId: user.id, date: { gte: dateKey(start), lte: dateKey(today) } },
      select: { date: true, glasses: true },
    }),
  ]);

  const targets = computeDailyTargets(profile);

  const byDate = new Map<string, ActivityDay>();
  const cursor = new Date(start);
  while (cursor < endExclusive) {
    byDate.set(dateKey(cursor), { date: dateKey(cursor), meals: 0, calories: 0, water: 0, items: [] });
    cursor.setDate(cursor.getDate() + 1);
  }

  for (const m of meals) {
    const key = dateKey(m.eatenAt);
    const bucket = byDate.get(key);
    if (!bucket) continue;
    bucket.meals += 1;
    bucket.calories += m.totalCalories;
    if (bucket.items.length < 8) {
      bucket.items.push({
        id: m.id,
        mealType: m.mealType,
        kcal: Math.round(m.totalCalories),
        foods: m.foods.map((f) => f.displayName).slice(0, 4).join(" · ") || "—",
      });
    }
  }
  for (const h of hydration) {
    const bucket = byDate.get(h.date);
    if (bucket) bucket.water = h.glasses;
  }

  const days = [...byDate.values()].map((d) => ({
    ...d,
    calories: Math.round(d.calories),
  }));

  // Logging streak: consecutive days with >=1 meal ending today (or yesterday).
  let streak = 0;
  const probe = new Date(today);
  const dayAt = (k: string) => days.find((d) => d.date === k);
  if (dayAt(dateKey(probe))?.meals === 0) probe.setDate(probe.getDate() - 1);
  for (let i = 0; i < totalDays; i++) {
    if ((dayAt(dateKey(probe))?.meals ?? 0) > 0) {
      streak += 1;
      probe.setDate(probe.getDate() - 1);
    } else break;
  }

  return NextResponse.json({
    weeks,
    start: dateKey(start),
    today: dateKey(today),
    days,
    calorieTarget: Math.round(targets.calories),
    streak,
    activeDays: days.filter((d) => d.meals > 0).length,
  });
});
