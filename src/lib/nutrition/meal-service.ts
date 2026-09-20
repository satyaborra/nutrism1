/**
 * Shared meal-domain service used by multiple API routes.
 * Kept out of route files so logic stays reusable and testable.
 */
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { computeDailyTargets, inferMealSlot, safeParseArray } from "@/lib/nutrition/targets";
import { zeroNutrition, type NutritionValues, type NutrientKey } from "@/lib/nutrition/types";
import { evaluateCompliance } from "@/lib/nutrition/disease-engine";
import type { Profile, Meal, MealFood } from "@prisma/client";

export interface MealWithFoods extends Meal {
  foods: (MealFood & { food: { source: string } | null })[];
}

export async function getProfileFor(userId: string): Promise<Profile> {
  const profile = await db.profile.findUnique({ where: { userId } });
  if (profile) return profile;
  return db.profile.create({ data: { userId } });
}

const FOODS_INCLUDE = { foods: { include: { food: { select: { source: true } } } } } as const;

export async function getMealsForDate(userId: string, dateKey: string): Promise<MealWithFoods[]> {
  const start = new Date(`${dateKey}T00:00:00`);
  const end = new Date(`${dateKey}T23:59:59.999`);
  return db.meal.findMany({
    where: { userId, eatenAt: { gte: start, lte: end } },
    include: FOODS_INCLUDE,
    orderBy: { eatenAt: "desc" },
  });
}

export async function getRecentMeals(userId: string, limit: number): Promise<MealWithFoods[]> {
  return db.meal.findMany({
    where: { userId },
    include: FOODS_INCLUDE,
    orderBy: { eatenAt: "desc" },
    take: limit,
  });
}

export function mealTotals(meals: MealWithFoods[]): NutritionValues {
  const out = zeroNutrition();
  for (const m of meals) {
    for (const k of Object.keys(out) as NutrientKey[]) {
      const map: Record<NutrientKey, number> = {
        calories: m.totalCalories, protein: m.totalProtein, carbohydrates: m.totalCarbohydrates,
        fat: m.totalFat, fiber: m.totalFiber, sugar: m.totalSugar, sodium: m.totalSodium,
        potassium: m.totalPotassium, phosphorus: m.totalPhosphorus, cholesterol: m.totalCholesterol,
        saturatedFat: m.totalSaturatedFat,
      };
      out[k] += map[k] ?? 0;
    }
  }
  return out;
}

/** Serialize a meal for the API — clean `foods: []` array, never raw blobs. */
export function serializeMeal(m: MealWithFoods) {
  return {
    id: m.id,
    mealType: m.mealType,
    source: m.source,
    notes: m.notes,
    userNotes: m.userNotes ?? null,
    eatenAt: m.eatenAt.toISOString(),
    loggedAt: m.loggedAt.toISOString(),
    foods: m.foods.map((f) => ({
      id: f.id,
      foodId: f.foodId,
      name: f.displayName,
      originalName: f.originalName,
      quantity: f.quantity,
      unit: f.unit,
      preparation: f.preparation,
      confidence: f.confidence,
      quantitySource: f.quantitySource,
      source: f.food?.source ?? null,
      nutrition: {
        calories: f.calories, protein: f.protein, carbohydrates: f.carbohydrates, fat: f.fat, fiber: f.fiber,
        sugar: f.sugar, sodium: f.sodium, potassium: f.potassium, phosphorus: f.phosphorus,
        cholesterol: f.cholesterol, saturatedFat: f.saturatedFat,
      },
    })),
    totals: {
      calories: m.totalCalories, protein: m.totalProtein, carbohydrates: m.totalCarbohydrates, fat: m.totalFat,
      fiber: m.totalFiber, sugar: m.totalSugar, sodium: m.totalSodium, potassium: m.totalPotassium,
      phosphorus: m.totalPhosphorus, cholesterol: m.totalCholesterol, saturatedFat: m.totalSaturatedFat,
    },
  };
}

/** Evaluate per-meal compliance against the user's condition constraints. */
export async function mealComplianceSummary(conditions: string[], totals: NutritionValues, incomplete: boolean) {
  const result = await evaluateCompliance(conditions, totals, "meal", incomplete);
  return {
    state: result.state,
    violations: result.violations.map((v) => ({
      condition: v.condition, nutrient: v.nutrient, message: v.message, severity: v.severity, evidenceSource: v.evidenceSource,
    })),
  };
}

/** Dashboard/daily summary payload — all aggregation server-side. */
export async function buildDailySummary(userId: string, dateKey: string) {
  const [profile, meals] = await Promise.all([getProfileFor(userId), getMealsForDate(userId, dateKey)]);
  const targets = computeDailyTargets(profile);
  const consumed = mealTotals(meals);
  const conditions = safeParseArray(profile.healthConditions);

  const remaining = zeroNutrition();
  for (const k of Object.keys(consumed) as NutrientKey[]) {
    remaining[k] = Math.max(0, (targets[k] ?? 0) - consumed[k]);
  }

  const dayCompliance = await evaluateCompliance(conditions, consumed, "day");

  return {
    date: dateKey,
    mealSlot: inferMealSlot(new Date()),
    meals: meals.map(serializeMeal),
    consumed,
    targets: {
      calories: targets.calories, protein: targets.protein, carbohydrates: targets.carbohydrates,
      fat: targets.fat, fiber: targets.fiber, sugar: targets.sugar, sodium: targets.sodium,
      potassium: targets.potassium, phosphorus: targets.phosphorus, cholesterol: targets.cholesterol,
      saturatedFat: targets.saturatedFat,
    },
    remaining,
    compliance: {
      state: dayCompliance.state,
      violations: dayCompliance.violations.map((v) => ({
        condition: v.condition, nutrient: v.nutrient, message: v.message, severity: v.severity, evidenceSource: v.evidenceSource,
      })),
    },
    healthConditions: conditions,
    language: profile.language,
  };
}
