/**
 * DELETE /api/nutrition/meals/[id] — delete a meal (transactional).
 * PATCH  /api/nutrition/meals/[id] — edit quantities/units of existing lines.
 *
 * PATCH rules (same trust model as log-meal):
 *  - The frontend NEVER supplies nutrition numbers. Only line ids + quantity/unit.
 *  - Matched foods (foodId) are recomputed from the Food table via the deterministic
 *    calculator. Unmatched lines (foodId null) have their persisted nutrition scaled
 *    proportionally to the quantity change (honest, deterministic arithmetic).
 *  - Lines can be removed with `remove: true`. A meal must keep at least one line.
 *  - Everything happens in one transaction; recommendations are invalidated after.
 */
import { NextRequest, NextResponse } from "next/server";
import { withApi, AppError } from "@/lib/api-utils";
import { requireUser } from "@/lib/auth";
import { invalidateCoachContext } from "@/lib/coach/context-builder";
import { db } from "@/lib/db";
import { convertQuantity } from "@/lib/nutrition/food-repository";
import { calculateFoodLine, sumNutrition, foodToRef, scaleNutrition } from "@/lib/nutrition/calculator";
import { zeroNutrition } from "@/lib/nutrition/types";
import type { NutritionValues } from "@/lib/nutrition/types";
import { round } from "@/lib/format";

interface EditLineBody {
  lineId?: string;
  quantity?: number;
  unit?: string;
  remove?: boolean;
}

interface EditMealBody {
  foods?: EditLineBody[];
  notes?: string | null;
  /** User-authored reflection ("why I ate / how I felt") — display only, never used for nutrition math. */
  userNotes?: string | null;
}

interface ConversionNote {
  lineId: string;
  food: string;
  note: string;
  exact: boolean;
}

function extractId(url: string): string {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  const id = parts[parts.length - 1];
  if (!id || id.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new AppError("VALIDATION_FAILED", "Invalid meal id.");
  }
  return id;
}

export const DELETE = withApi("meal_delete", async ({ req }: { req: NextRequest }) => {
  const user = await requireUser();
  const id = extractId(req.url);

  const result = await db.$transaction(async (tx) => {
    const meal = await tx.meal.findUnique({ where: { id }, include: { foods: true } });
    if (!meal) throw new AppError("NOT_FOUND", "Meal not found. It may have been already deleted.");
    if (meal.userId !== user.id) throw new AppError("FORBIDDEN", "You can only delete your own meals.");

    await tx.mealFood.deleteMany({ where: { mealId: meal.id } });
    await tx.meal.delete({ where: { id: meal.id } });

    // Invalidate recent recommendations — remaining budget changed
    await tx.recommendationHistory.deleteMany({
      where: {
        userId: user.id,
        date: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10) },
        createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
      },
    });

    return { id: meal.id, totals: { calories: meal.totalCalories }, foodsCount: meal.foods.length };
  });

  invalidateCoachContext(user.id); // coach must never see a deleted meal (spec §18)

  return NextResponse.json({
    ok: true,
    deletedMealId: result.id,
    removedCalories: result.totals.calories,
    removedFoods: result.foodsCount,
    recommendationInvalidated: true,
  });
});

interface RecomputedLine {
  id: string;
  foodId: string | null;
  displayName: string;
  originalName: string | null;
  quantity: number;
  unit: string;
  preparation: string | null;
  confidence: number | null;
  quantitySource: string;
  nutrition: NutritionValues;
}

export const PATCH = withApi("meal_edit", async ({ req }: { req: NextRequest }) => {
  const user = await requireUser();
  const id = extractId(req.url);

  let body: EditMealBody;
  try {
    body = (await req.json()) as EditMealBody;
  } catch {
    throw new AppError("VALIDATION_FAILED", "Request body must be JSON.");
  }

  const edits = Array.isArray(body.foods) ? body.foods.slice(0, 20) : [];
  if (edits.length === 0 && body.notes === undefined && body.userNotes === undefined) {
    throw new AppError("VALIDATION_FAILED", "Nothing to update — provide food edits or notes.");
  }
  // userNotes: 0..500 chars after trim; empty string clears the note (null in DB).
  let userNotes: string | null | undefined;
  if (body.userNotes !== undefined) {
    const trimmed = String(body.userNotes ?? "").trim();
    if (trimmed.length > 500) {
      throw new AppError("VALIDATION_FAILED", "Notes are limited to 500 characters.");
    }
    userNotes = trimmed.length === 0 ? null : trimmed;
  }

  const updated = await db.$transaction(async (tx) => {
    const meal = await tx.meal.findUnique({ where: { id }, include: { foods: true } });
    if (!meal) throw new AppError("NOT_FOUND", "Meal not found. It may have been already deleted.");
    if (meal.userId !== user.id) throw new AppError("FORBIDDEN", "You can only edit your own meals.");

    const byId = new Map(meal.foods.map((f) => [f.id, f]));
    const removeIds = new Set<string>();
    const newLines: RecomputedLine[] = [];
    const conversionNotes: ConversionNote[] = [];

    for (const edit of edits) {
      if (!edit?.lineId) throw new AppError("VALIDATION_FAILED", "Each food edit needs a lineId.");
      const line = byId.get(edit.lineId);
      if (!line) throw new AppError("VALIDATION_FAILED", `Food line not found in this meal.`);
      if (removeIds.has(line.id)) continue;

      if (edit.remove === true) {
        removeIds.add(line.id);
        continue;
      }

      const keep = edit.quantity === undefined || edit.quantity === null;
      const newQty = keep ? line.quantity : Number(edit.quantity);
      if (!Number.isFinite(newQty) || newQty <= 0 || newQty > 100) {
        throw new AppError("VALIDATION_FAILED", "Quantities must be between 0.1 and 100.");
      }
      const newUnit = edit.unit ? String(edit.unit).trim().slice(0, 24) : line.unit;

      let nutrition: NutritionValues;
      if (line.foodId) {
        const food = await tx.food.findUnique({ where: { id: line.foodId } });
        if (food) {
          const conv = convertQuantity(newQty, newUnit, food.servingUnit);
          nutrition = calculateFoodLine(foodToRef(food), conv.quantityInRefs);
          if (newUnit !== line.unit && conv.note) {
            conversionNotes.push({ lineId: line.id, food: line.displayName, note: conv.note, exact: conv.exact });
          }
        } else {
          // Food removed from DB since logging — scale persisted values
          nutrition = scaleNutrition(lineNutrition(line), newQty / line.quantity);
        }
      } else {
        // Unmatched line — scale persisted values proportionally
        nutrition = scaleNutrition(lineNutrition(line), newQty / line.quantity);
      }

      newLines.push({
        id: line.id,
        foodId: line.foodId,
        displayName: line.displayName,
        originalName: line.originalName,
        quantity: newQty,
        unit: newUnit,
        preparation: line.preparation,
        confidence: line.confidence,
        quantitySource: keep && newUnit === line.unit ? line.quantitySource : "user",
        nutrition,
      });
    }

    // Unedited lines keep their persisted values
    for (const line of meal.foods) {
      if (!byId.has(line.id) || removeIds.has(line.id) || newLines.some((l) => l.id === line.id)) continue;
      newLines.push({
        id: line.id,
        foodId: line.foodId,
        displayName: line.displayName,
        originalName: line.originalName,
        quantity: line.quantity,
        unit: line.unit,
        preparation: line.preparation,
        confidence: line.confidence,
        quantitySource: line.quantitySource,
        nutrition: lineNutrition(line),
      });
    }

    if (newLines.length === 0) {
      throw new AppError("VALIDATION_FAILED", "A meal needs at least one food item. Delete the meal instead.");
    }

    const totals = sumNutrition(newLines.map((l) => l.nutrition));

    // Apply: update kept lines, drop removed ones, refresh denormalized totals
    for (const l of newLines) {
      await tx.mealFood.update({
        where: { id: l.id },
        data: {
          quantity: l.quantity,
          unit: l.unit,
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
        },
      });
    }
    if (removeIds.size > 0) {
      await tx.mealFood.deleteMany({ where: { mealId: meal.id, id: { in: [...removeIds] } } });
    }

    const savedMeal = await tx.meal.update({
      where: { id: meal.id },
      data: {
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
        notes: body.notes === undefined ? meal.notes : body.notes === null ? null : String(body.notes).slice(0, 500),
        userNotes: userNotes === undefined ? meal.userNotes : userNotes,
      },
      include: { foods: true },
    });

    // Invalidate recent recommendations — remaining budget changed
    await tx.recommendationHistory.deleteMany({
      where: {
        userId: user.id,
        date: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10) },
        createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
      },
    });

    return { meal: savedMeal, totals, previousCalories: meal.totalCalories, conversionNotes };
  });

  const safeTotals = zeroNutrition();
  for (const k of Object.keys(safeTotals) as (keyof NutritionValues)[]) {
    safeTotals[k] = round(updated.totals[k] ?? 0, 2);
  }

  invalidateCoachContext(user.id); // coach must never see stale meal edits (spec §18)

  return NextResponse.json({
    ok: true,
    editedMealId: updated.meal.id,
    previousCalories: round(updated.previousCalories, 1),
    totals: safeTotals,
    foodsCount: updated.meal.foods.length,
    userNotes: updated.meal.userNotes ?? null,
    conversionNotes: updated.conversionNotes,
    recommendationInvalidated: true,
  });
});

function lineNutrition(line: {
  calories: number; protein: number; carbohydrates: number; fat: number; fiber: number;
  sugar: number; sodium: number; potassium: number; phosphorus: number; cholesterol: number; saturatedFat: number;
}): NutritionValues {
  return {
    calories: line.calories, protein: line.protein, carbohydrates: line.carbohydrates,
    fat: line.fat, fiber: line.fiber, sugar: line.sugar, sodium: line.sodium,
    potassium: line.potassium, phosphorus: line.phosphorus, cholesterol: line.cholesterol,
    saturatedFat: line.saturatedFat,
  };
}
