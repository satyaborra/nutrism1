/**
 * GET /api/nutrition/recent-meals?limit=10
 * Meals shown with ACTUAL food names (never "Logged Meal" placeholders) plus a
 * per-meal disease-constraint compliance badge (evaluated server-side from DB
 * constraints for the user's conditions).
 */
import { NextRequest, NextResponse } from "next/server";
import { withApi, AppError } from "@/lib/api-utils";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getRecentMeals, serializeMeal, mealComplianceSummary, getProfileFor } from "@/lib/nutrition/meal-service";
import { safeParseArray } from "@/lib/nutrition/targets";
import type { NutritionValues } from "@/lib/nutrition/types";

export const GET = withApi("recent_meals", async ({ req }: { req: NextRequest }) => {
  const user = await requireUser();
  const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 12) || 12));

  const [profile, meals] = await Promise.all([getProfileFor(user.id), getRecentMeals(user.id, limit)]);
  const conditions = safeParseArray(profile.healthConditions);

  const withCompliance = await Promise.all(
    meals.map(async (m) => {
      const totals: NutritionValues = {
        calories: m.totalCalories, protein: m.totalProtein, carbohydrates: m.totalCarbohydrates,
        fat: m.totalFat, fiber: m.totalFiber, sugar: m.totalSugar, sodium: m.totalSodium,
        potassium: m.totalPotassium, phosphorus: m.totalPhosphorus, cholesterol: m.totalCholesterol,
        saturatedFat: m.totalSaturatedFat,
      };
      // Unmatched food lines mean incomplete nutrition data → INDETERMINATE handled inside
      const incomplete = m.foods.some((f) => !f.foodId);
      const compliance = await mealComplianceSummary(conditions, totals, incomplete);
      return { ...serializeMeal(m), compliance };
    }),
  );

  return NextResponse.json({
    meals: withCompliance,
    count: withCompliance.length,
  });
});

/** Legacy delete-by-query endpoint kept for compatibility; prefer DELETE /api/nutrition/meals/[id]. */
export const DELETE = withApi("meal_delete", async ({ req }: { req: NextRequest }) => {
  const user = await requireUser();
  const mealId = req.nextUrl.searchParams.get("mealId");
  if (!mealId) throw new AppError("VALIDATION_FAILED", "mealId is required.");
  const meal = await db.meal.findUnique({ where: { id: mealId } });
  if (!meal || meal.userId !== user.id) throw new AppError("NOT_FOUND", "Meal not found.");
  await db.meal.delete({ where: { id: mealId } });
  return NextResponse.json({ ok: true, deletedId: mealId });
});
