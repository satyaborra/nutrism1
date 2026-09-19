/**
 * POST /api/coach/plan-rest-of-day
 * Dedicated "Plan the rest of my day" feature.
 * Identifies completed vs remaining slots (by time + logs), runs the
 * deterministic candidate engine per remaining slot, and returns the
 * LOGGED vs RECOMMENDED timeline. Logged meals are never touched.
 */
import { NextResponse } from "next/server";
import { withApi, rateLimit } from "@/lib/api-utils";
import { requireUser } from "@/lib/auth";
import { getCoachContext, remainingSlots, type MealSlot } from "@/lib/coach/context-builder";
import { generateNextMealRecommendation } from "@/lib/recommendation/engine";
import { buildPlanCardFromCoach, planSummaryText } from "@/lib/coach/plan-shared";

export const POST = withApi("coach_plan_rest_of_day", async () => {
  const user = await requireUser();
  rateLimit("coach_plan_rest", user.id, 8, 5 * 60 * 1000);

  const { context: ctx, profile } = await getCoachContext(user.id);
  const loggedTypes = new Set(ctx.meals.map((m) => m.mealType));
  const pending = remainingSlots(ctx, loggedTypes).slice(0, 3) as MealSlot[];

  const results = await Promise.all(
    pending.map((slot) =>
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

  const card = buildPlanCardFromCoach(ctx, results);
  return NextResponse.json({
    date: ctx.date,
    card,
    text: planSummaryText(ctx, card),
  });
});
