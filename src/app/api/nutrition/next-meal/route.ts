/**
 * GET /api/nutrition/next-meal?refresh=1
 * Context-aware next-meal recommendation:
 * context → candidates (deterministic nutrition) → constraints → evidence → AI ranking → validator.
 */
import { NextRequest, NextResponse } from "next/server";
import { withApi, rateLimit } from "@/lib/api-utils";
import { requireUser } from "@/lib/auth";
import { generateNextMealRecommendation } from "@/lib/recommendation/engine";
import { getProfileFor, getMealsForDate } from "@/lib/nutrition/meal-service";
import { computeDailyTargets, safeParseArray } from "@/lib/nutrition/targets";
import type { RequestContext } from "@/lib/observability";

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const GET = withApi("next_meal", async ({ req, ctx }: { req: NextRequest; ctx: RequestContext }) => {
  const user = await requireUser();
  ctx.userId = user.id;
  rateLimit("next_meal", user.id, 15, 5 * 60_000);

  const [profile, mealsToday] = await Promise.all([getProfileFor(user.id), getMealsForDate(user.id, todayKey())]);
  const targets = computeDailyTargets(profile);

  const recommendation = await generateNextMealRecommendation({
    userId: user.id,
    profile,
    mealsToday: mealsToday.map((m) => ({
      mealType: m.mealType,
      foods: m.foods.map((f) => ({ displayName: f.displayName })),
      totalCalories: m.totalCalories,
      totalProtein: m.totalProtein,
      totalCarbohydrates: m.totalCarbohydrates,
      totalFat: m.totalFat,
      totalFiber: m.totalFiber,
      totalSugar: m.totalSugar,
      totalSodium: m.totalSodium,
      totalPotassium: m.totalPotassium,
      totalPhosphorus: m.totalPhosphorus,
      totalCholesterol: m.totalCholesterol,
      totalSaturatedFat: m.totalSaturatedFat,
    })),
  });

  return NextResponse.json({
    ...recommendation,
    contextSummary: {
      ...recommendation.contextSummary,
      targets: {
        calories: targets.calories, protein: targets.protein, carbohydrates: targets.carbohydrates,
        fat: targets.fat, fiber: targets.fiber,
      },
      conditions: safeParseArray(profile.healthConditions),
      dietaryPreference: profile.dietaryPreference,
    },
  });
});
