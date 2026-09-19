/**
 * POST /api/nutrition/favorites/[id]/log — one-tap quick-log of a pinned favorite.
 *
 * Same trust model as re-log: matched foods are RE-COMPUTED from the Food table
 * (DB corrections flow through); unmatched lines fall back to the snapshot taken
 * when the favorite was created. The meal slot is inferred from the CURRENT time
 * (a quick-log means "I'm eating this now"), source="favorite" keeps provenance
 * honest, useCount powers "most used" ordering, and recommendations are
 * invalidated so the next suggestion reflects the freshly logged meal.
 */
import { NextRequest, NextResponse } from "next/server";
import { withApi, AppError } from "@/lib/api-utils";
import { requireUser } from "@/lib/auth";
import { invalidateCoachContext } from "@/lib/coach/context-builder";
import { db } from "@/lib/db";
import { getFood, convertQuantity } from "@/lib/nutrition/food-repository";
import { calculateFoodLine, foodToRef, sumNutrition } from "@/lib/nutrition/calculator";
import { getProfileFor, mealComplianceSummary } from "@/lib/nutrition/meal-service";
import { inferMealSlot, safeParseArray } from "@/lib/nutrition/targets";
import { round } from "@/lib/format";
import type { NutritionValues } from "@/lib/nutrition/types";

interface FavoriteItem {
  foodId: string | null;
  displayName: string;
  originalName?: string | null;
  quantity: number;
  unit: string;
  preparation?: string | null;
  confidence?: number | null;
  quantitySource: string;
  nutrition: NutritionValues;
}

function parseItems(json: string): FavoriteItem[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? (v as FavoriteItem[]) : [];
  } catch {
    return [];
  }
}

/** /api/nutrition/favorites/<id>/log — id is the second-to-last path segment. */
function extractFavoriteId(url: string): string {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  const id = parts[parts.length - 2];
  if (!id || id.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new AppError("VALIDATION_FAILED", "Invalid favorite id.");
  }
  return id;
}

export const POST = withApi("favorites_log", async ({ req }: { req: NextRequest }): Promise<NextResponse> => {
  const user = await requireUser();
  const id = extractFavoriteId(req.url);

  const favorite = await db.favorite.findUnique({ where: { id } });
  if (!favorite) throw new AppError("NOT_FOUND", "That favorite no longer exists.");
  if (favorite.userId !== user.id) throw new AppError("FORBIDDEN", "You can only log your own favorites.");

  const items = parseItems(favorite.items);
  if (items.length === 0) throw new AppError("VALIDATION_FAILED", "This favorite has no foods to log.");

  const profile = await getProfileFor(user.id);
  const conditions = safeParseArray(profile.healthConditions);

  const result = await db.$transaction(async (tx) => {
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

      for (const item of items) {
        const food = item.foodId ? await getFood(item.foodId) : null;
        if (!food) {
          incomplete = true;
          lines.push({
            foodId: null,
            displayName: item.displayName,
            originalName: item.originalName ?? null,
            quantity: item.quantity,
            unit: item.unit,
            preparation: item.preparation ?? null,
            confidence: item.confidence ?? null,
            quantitySource: item.quantitySource,
            nutrition: item.nutrition,
          });
          continue;
        }
        const conv = convertQuantity(item.quantity, item.unit, food.servingUnit);
        const nutrition = calculateFoodLine(foodToRef(food), conv.quantityInRefs);
        lines.push({
          foodId: food.id,
          displayName: food.canonicalName,
          originalName: item.originalName ?? food.canonicalName,
          quantity: item.quantity,
          unit: item.unit,
          preparation: item.preparation ?? null,
          confidence: item.confidence ?? null,
          quantitySource: item.quantitySource,
          nutrition,
        });
      }

      const totals = sumNutrition(lines.map((l) => l.nutrition));
      const now = new Date();

      const meal = await tx.meal.create({
        data: {
          userId: user.id,
          requestId: `fav_${favorite.id.slice(-8)}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          mealType: inferMealSlot(now),
          source: "favorite",
          notes: `Quick-logged from favorite "${favorite.name}"`,
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

      await tx.favorite.update({
        where: { id: favorite.id },
        data: { useCount: { increment: 1 } },
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

  invalidateCoachContext(user.id); // favorite logged → coach context rebuild

  return NextResponse.json({
    ok: true,
    mealId: result.mealId,
    mealType: inferMealSlot(new Date()),
    name: favorite.name,
    totals: {
      calories: round(result.totals.calories, 0),
      protein: round(result.totals.protein, 1),
      carbohydrates: round(result.totals.carbohydrates, 1),
      fat: round(result.totals.fat, 1),
      fiber: round(result.totals.fiber, 1),
      sugar: round(result.totals.sugar, 1),
      sodium: round(result.totals.sodium, 0),
    },
    source: "favorite",
    compliance,
    recommendationInvalidated: true,
  });
});
