/**
 * POST /api/coach/daily-plan
 * Full-day plan: all four slots. Logged slots come back untouched with
 * status "logged"; empty slots get engine recommendations with status
 * "recommended". Never overwrites logged meals.
 */
import { NextResponse } from "next/server";
import { withApi, rateLimit } from "@/lib/api-utils";
import { requireUser } from "@/lib/auth";
import { getCoachContext, type MealSlot } from "@/lib/coach/context-builder";
import { generateNextMealRecommendation } from "@/lib/recommendation/engine";
import { buildPlanCardFromCoach, planSummaryText } from "@/lib/coach/plan-shared";

export const POST = withApi("coach_daily_plan", async () => {
  const user = await requireUser();
  rateLimit("coach_daily_plan", user.id, 8, 5 * 60 * 1000);

  const { context: ctx, profile } = await getCoachContext(user.id);
  const loggedTypes = new Set(ctx.meals.map((m) => m.mealType));
  const missing = (["breakfast", "lunch", "snack", "dinner"] as MealSlot[]).filter((s) => !loggedTypes.has(s)).slice(0, 4);

  const results = await Promise.all(
    missing.map((slot) =>
      generateNextMealRecommendation({
        userId: ctx.userId,
        profile,
        mealSlot: slot,
        mealsToday: ctx.meals.map((m) => ({
          mealType: m.mealType,
          foods: m.foods.map((displayName) => ({ displayName })),
          totalCalories: m.calories,
          totalProtein: m.protein,
          totalCarbohydrates: m.carbohydrates,
          totalFat: m.fat,
          totalFiber: m.fiber,
          totalSugar: m.sugar,
          totalSodium: m.sodium,
          totalPotassium: 0,
          totalPhosphorus: 0,
          totalCholesterol: 0,
          totalSaturatedFat: 0,
        })),
      })
        .then((rec) => ({ slot, rec }))
        .catch(() => ({ slot, rec: null, error: "engine_failed" })),
    ),
  );

  const card = buildPlanCardFromCoach(ctx, results, { fullDay: true });
  return NextResponse.json({
    date: ctx.date,
    card,
    text: planSummaryText(ctx, card),
  });
});
