/**
 * POST /api/nutrition/log-meal
 * Idempotent, transactional meal logging. NEVER trusts nutrition from the frontend —
 * re-validates, re-normalizes, re-looks-up and re-calculates everything server-side.
 *
 * Body: { requestId: string, draftId?: string, mealType: string, foods: [{ foodId?, name, quantity, unit, preparation? }], notes? }
 */
import { NextRequest, NextResponse } from "next/server";
import { withApi, parseJsonBody, AppError } from "@/lib/api-utils";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getFood, convertQuantity, resolveFoodName } from "@/lib/nutrition/food-repository";
import { calculateFoodLine, sumNutrition, foodToRef } from "@/lib/nutrition/calculator";
import { zeroNutrition, type NutritionValues } from "@/lib/nutrition/types";
import { safeParseArray } from "@/lib/nutrition/targets";
import { getProfileFor, mealComplianceSummary } from "@/lib/nutrition/meal-service";
import { round } from "@/lib/format";

interface LogMealItem {
  foodId?: string | null;
  name?: string;
  quantity?: number;
  unit?: string;
  preparation?: string | null;
}

interface LogMealBody {
  requestId?: string;
  draftId?: string;
  mealType?: string;
  eatenAt?: string;
  notes?: string;
  source?: string;
  foods?: LogMealItem[];
}

export const POST = withApi("log_meal", async ({ req }: { req: NextRequest }) => {
  const user = await requireUser();
  const body = await parseJsonBody<LogMealBody>(req);

  if (!body.requestId || typeof body.requestId !== "string") {
    throw new AppError("VALIDATION_FAILED", "requestId (idempotency key) is required.");
  }
  const requestId = body.requestId.slice(0, 100);

  const foods = Array.isArray(body.foods) ? body.foods.slice(0, 20) : [];
  if (foods.length === 0) throw new AppError("VALIDATION_FAILED", "No foods provided.");

  const mealType = ["breakfast", "lunch", "snack", "dinner"].includes(String(body.mealType)) ? String(body.mealType) : "snack";
  const source = ["text", "manual", "recommendation", "image", "relog"].includes(String(body.source))
    ? String(body.source)
    : body.draftId
      ? "text"
      : "manual";
  const eatenAt = parseEatenAt(body.eatenAt);

  // ---- Idempotency: duplicate submission returns the original meal ----
  const existing = await db.meal.findUnique({ where: { requestId }, include: { foods: true } });
  if (existing) {
    if (existing.userId !== user.id) throw new AppError("CONFLICT", "This request id is already in use.");
    const profile = await getProfileFor(user.id);
    const conditions = safeParseArray(profile.healthConditions);
    const totals = mealTotalsOf(existing);
    const compliance = await mealComplianceSummary(conditions, totals, false);
    return NextResponse.json({
      mealId: existing.id,
      duplicate: true,
      meal: serialize(existing),
      totals,
      compliance,
      recommendationInvalidated: false,
    });
  }

  const profile = await getProfileFor(user.id);
  const conditions = safeParseArray(profile.healthConditions);

  // ---- Transactional pipeline: validate → normalize → lookup → calculate → persist ----
  const result = await db.$transaction(async (tx) => {
    const lines: PersistLine[] = [];
    let incomplete = false;

    for (const item of foods) {
      const quantity = Number(item.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100) {
        throw new AppError("VALIDATION_FAILED", "One of the quantities is invalid.");
      }
      const name = (item.name ?? "").trim().slice(0, 120);
      if (!name && !item.foodId) throw new AppError("VALIDATION_FAILED", "Each food needs a name.");

      let food = item.foodId ? await tx.food.findUnique({ where: { id: item.foodId } }) : null;
      if (!food && name) {
        const res = await resolveFoodName(name);
        food = res.status === "matched" ? res.food : null;
      }

      if (!food) {
        incomplete = true;
        lines.push({
          foodId: null, displayName: name || "Unknown food", originalName: name || null,
          quantity, unit: item.unit ?? "serving", preparation: item.preparation ?? null,
          confidence: null, quantitySource: "user",
          nutrition: zeroNutrition(),
        });
        continue;
      }

      const conv = convertQuantity(quantity, item.unit ?? food.servingUnit, food.servingUnit);
      const nutrition = calculateFoodLine(foodToRef(food), conv.quantityInRefs);
      lines.push({
        foodId: food.id,
        displayName: food.canonicalName,
        originalName: name || food.canonicalName,
        quantity,
        unit: item.unit ?? food.servingUnit,
        preparation: item.preparation ?? null,
        confidence: null,
        quantitySource: "user",
        nutrition,
      });
    }

    if (lines.length === 0) throw new AppError("VALIDATION_FAILED", "No valid foods to log.");

    const totals = sumNutrition(lines.map((l) => l.nutrition));

    const meal = await tx.meal.create({
      data: {
        userId: user.id,
        requestId,
        mealType,
        source,
        notes: body.notes ? body.notes.slice(0, 500) : null,
        eatenAt,
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
      include: { foods: true },
    });

    // Invalidate previous recommendations for today (they're stale now)
    await tx.recommendationHistory.deleteMany({
      where: {
        userId: user.id,
        date: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        },
        createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
      },
    });

    return { meal, totals, incomplete };
  });

  const compliance = await mealComplianceSummary(conditions, result.totals, result.incomplete);

  return NextResponse.json({
    mealId: result.meal.id,
    duplicate: false,
    meal: serialize(result.meal),
    totals: result.totals,
    compliance,
    recommendationInvalidated: true,
  });
});

function parseEatenAt(raw: string | undefined): Date {
  if (!raw) return new Date();
  const d = new Date(raw);
  // Out-of-range or unparseable dates are REJECTED, not silently swapped for
  // "now" — a backfilled meal must never land on the wrong day unnoticed.
  if (Number.isNaN(d.getTime())) {
    throw new AppError("VALIDATION_FAILED", "eatenAt is not a valid date.");
  }
  const now = Date.now();
  const t = d.getTime();
  if (t > now + 2 * 24 * 3600 * 1000 || t < now - 30 * 24 * 3600 * 1000) {
    throw new AppError(
      "VALIDATION_FAILED",
      "eatenAt is out of range — meals can be backfilled up to 30 days back, and no more than 2 days ahead.",
    );
  }
  return d;
}

function mealTotalsOf(meal: { totalCalories: number; totalProtein: number; totalCarbohydrates: number; totalFat: number; totalFiber: number; totalSugar: number; totalSodium: number; totalPotassium: number; totalPhosphorus: number; totalCholesterol: number; totalSaturatedFat: number }): NutritionValues {
  return {
    calories: meal.totalCalories, protein: meal.totalProtein, carbohydrates: meal.totalCarbohydrates,
    fat: meal.totalFat, fiber: meal.totalFiber, sugar: meal.totalSugar, sodium: meal.totalSodium,
    potassium: meal.totalPotassium, phosphorus: meal.totalPhosphorus, cholesterol: meal.totalCholesterol,
    saturatedFat: meal.totalSaturatedFat,
  };
}

function serialize(meal: MealWithFoodsShape) {
  return {
    id: meal.id,
    mealType: meal.mealType,
    eatenAt: meal.eatenAt.toISOString(),
    foods: meal.foods.map((f) => ({
      name: f.displayName,
      quantity: f.quantity,
      unit: f.unit,
      nutrition: {
        calories: round(f.calories, 0), protein: round(f.protein, 1), carbohydrates: round(f.carbohydrates, 1),
        fat: round(f.fat, 1), fiber: round(f.fiber, 1),
      },
    })),
    totals: {
      calories: meal.totalCalories, protein: meal.totalProtein, carbohydrates: meal.totalCarbohydrates,
      fat: meal.totalFat, fiber: meal.totalFiber, sugar: meal.totalSugar, sodium: meal.totalSodium,
    },
  };
}

interface PersistLine {
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

interface MealWithFoodsShape {
  id: string;
  mealType: string;
  eatenAt: Date;
  foods: {
    displayName: string;
    quantity: number;
    unit: string;
    calories: number; protein: number; carbohydrates: number; fat: number; fiber: number;
  }[];
  totalCalories: number; totalProtein: number; totalCarbohydrates: number; totalFat: number;
  totalFiber: number; totalSugar: number; totalSodium: number; totalPotassium: number;
  totalPhosphorus: number; totalCholesterol: number; totalSaturatedFat: number;
}
