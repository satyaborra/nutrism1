/**
 * POST /api/nutrition/meals/relog — one-tap "log this again".
 *
 * Re-logs a previously logged meal with identical foods/quantities/units.
 * Same trust model as log-meal: matched foods are RE-COMPUTED from the Food
 * table (so any DB correction flows through), unmatched lines keep their
 * server-persisted numbers (identical quantity → identical deterministic value).
 * Transactional; recommendations invalidated; new meal carries source="relog"
 * so provenance stays honest.
 */
import { NextRequest, NextResponse } from "next/server";
import { withApi, parseJsonBody, AppError } from "@/lib/api-utils";
import { requireUser } from "@/lib/auth";
import { invalidateCoachContext } from "@/lib/coach/context-builder";
import { db } from "@/lib/db";
import { getFood, convertQuantity } from "@/lib/nutrition/food-repository";
import { calculateFoodLine, sumNutrition, foodToRef } from "@/lib/nutrition/calculator";
import type { NutritionValues } from "@/lib/nutrition/types";
import { getProfileFor, mealComplianceSummary } from "@/lib/nutrition/meal-service";
import { safeParseArray } from "@/lib/nutrition/targets";
import { round } from "@/lib/format";

interface RelogBody {
  mealId?: string;
}

export const POST = withApi("meal_relog", async ({ req }: { req: NextRequest }) => {
  const user = await requireUser();
  const body = await parseJsonBody<RelogBody>(req);
  const mealId = String(body.mealId ?? "").trim();
  if (!mealId || mealId.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(mealId)) {
    throw new AppError("VALIDATION_FAILED", "Invalid meal id.");
  }

  const original = await db.meal.findUnique({ where: { id: mealId }, include: { foods: true } });
  if (!original) throw new AppError("NOT_FOUND", "That meal no longer exists.");
  if (original.userId !== user.id) throw new AppError("FORBIDDEN", "You can only re-log your own meals.");

  const profile = await getProfileFor(user.id);
  const conditions = safeParseArray(profile.healthConditions);

  const result = await db.$transaction(async (tx) => {
    const requestId = `relog_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    const lines: {
      foodId: string | null;
      displayName: string;
      originalName: string | null;
      quantity: number;
      unit: string;
      preparation: string | null;
      confidence: number | null;
      quantitySource: string;
      nutrition: NutritionValues;
    }[] = [];
    let incomplete = false;

    for (const line of original.foods) {
      const food = line.foodId ? await getFood(line.foodId) : null;
      if (!food) {
        // Unmatched line: same quantity → keep the server-persisted values.
        incomplete = true;
        lines.push({
          foodId: null,
          displayName: line.displayName,
          originalName: line.originalName,
          quantity: line.quantity,
          unit: line.unit,
          preparation: line.preparation,
          confidence: line.confidence,
          quantitySource: line.quantitySource,
          nutrition: {
            calories: line.calories, protein: line.protein, carbohydrates: line.carbohydrates,
            fat: line.fat, fiber: line.fiber, sugar: line.sugar, sodium: line.sodium,
            potassium: line.potassium, phosphorus: line.phosphorus, cholesterol: line.cholesterol,
            saturatedFat: line.saturatedFat,
          },
        });
        continue;
      }
      // Matched: recompute fresh from the Food table (deterministic).
      const conv = convertQuantity(line.quantity, line.unit, food.servingUnit);
      const nutrition = calculateFoodLine(foodToRef(food), conv.quantityInRefs);
      lines.push({
        foodId: food.id,
        displayName: food.canonicalName,
        originalName: line.originalName ?? food.canonicalName,
        quantity: line.quantity,
        unit: line.unit,
        preparation: line.preparation,
        confidence: line.confidence,
        quantitySource: line.quantitySource,
        nutrition,
      });
    }

    if (lines.length === 0) throw new AppError("VALIDATION_FAILED", "The original meal has no foods to re-log.");

    const totals = sumNutrition(lines.map((l) => l.nutrition));
    const now = new Date();

    const meal = await tx.meal.create({
      data: {
        userId: user.id,
        requestId,
        mealType: original.mealType,
        source: "relog",
        notes: `Re-logged from a meal originally logged ${original.loggedAt.toISOString().slice(0, 10)}`,
        eatenAt: now,
        totalCalories: totals.calories,
        totalProtein: totals.protein,
        totalCarbohydrates: totals.carbohydrates,
        totalFat: totals.fat,
        totalFiber: totals.fiber,
        totalSugar: totals.sugar,
        totalSodium: totals.sodium,
        totalPotassium: totals.potassium,
        totalPhosphorus: totals.phosphorus,
        totalCholesterol: totals.cholesterol,
        totalSaturatedFat: totals.saturatedFat,
        foods: {
          create: lines.map((l) => ({
            foodId: l.foodId,
            displayName: l.displayName,
            originalName: l.originalName,
            quantity: l.quantity,
            unit: l.unit,
            preparation: l.preparation,
            confidence: l.confidence,
            quantitySource: l.quantitySource,
            calories: l.nutrition.calories,
            protein: l.nutrition.protein,
            carbohydrates: l.nutrition.carbohydrates,
            fat: l.nutrition.fat,
            fiber: l.nutrition.fiber,
            sugar: l.nutrition.sugar,
            sodium: l.nutrition.sodium,
            potassium: l.nutrition.potassium,
            phosphorus: l.nutrition.phosphorus,
            cholesterol: l.nutrition.cholesterol,
            saturatedFat: l.nutrition.saturatedFat,
          })),
        },
      },
    });

    await tx.recommendationHistory.deleteMany({
      where: {
        userId: user.id,
        date: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10) },
        createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
      },
    });

    return { mealId: meal.id, totals };
  });

  const compliance = await mealComplianceSummary(conditions, result.totals, false);

  invalidateCoachContext(user.id); // relogged meal → coach context rebuild

  return NextResponse.json({
    ok: true,
    mealId: result.mealId,
    totals: {
      calories: round(result.totals.calories, 0),
      protein: round(result.totals.protein, 1),
      carbohydrates: round(result.totals.carbohydrates, 1),
      fat: round(result.totals.fat, 1),
      fiber: round(result.totals.fiber, 1),
      sugar: round(result.totals.sugar, 1),
      sodium: round(result.totals.sodium, 0),
    },
    source: "relog",
    compliance,
    recommendationInvalidated: true,
  });
});
