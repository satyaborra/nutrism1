/**
 * Deterministic Nutrition Calculator — THE authoritative calculation engine.
 *
 *   NutrientValue(food)  = quantity_in_reference_units × nutrient_per_reference_unit
 *   MealNutrient         = SUM(all food nutrient values)
 *   DailyConsumed        = SUM(persisted meals for the day)
 *
 * The LLM is NEVER a source here. Numbers come exclusively from the Food table
 * (seeded from IFCT 2017 / USDA references).
 */
import type { NutritionValues, NutrientKey } from "./types";
import type { Food } from "@prisma/client";

export interface FoodRef {
  id: string;
  servingUnit: string; // reference amount descriptor, e.g. "1 piece" / "100 g"
  calories: number; protein: number; carbohydrates: number; fat: number; fiber: number;
  sugar: number; sodium: number; potassium: number; phosphorus: number; cholesterol: number; saturatedFat: number;
}

export function foodToRef(food: Food): FoodRef {
  return {
    id: food.id,
    servingUnit: food.servingUnit,
    calories: food.calories, protein: food.protein, carbohydrates: food.carbohydrates,
    fat: food.fat, fiber: food.fiber, sugar: food.sugar, sodium: food.sodium,
    potassium: food.potassium, phosphorus: food.phosphorus, cholesterol: food.cholesterol,
    saturatedFat: food.saturatedFat,
  };
}

/**
 * Calculate one food line.
 * `quantity` is expressed in the SAME reference unit as the Food row
 * (e.g. Food IDLI row is per "1 piece", so quantity 2 = two idlis).
 */
export function calculateFoodLine(ref: FoodRef, quantity: number): NutritionValues {
  const q = Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
  return {
    calories: ref.calories * q,
    protein: ref.protein * q,
    carbohydrates: ref.carbohydrates * q,
    fat: ref.fat * q,
    fiber: ref.fiber * q,
    sugar: ref.sugar * q,
    sodium: ref.sodium * q,
    potassium: ref.potassium * q,
    phosphorus: ref.phosphorus * q,
    cholesterol: ref.cholesterol * q,
    saturatedFat: ref.saturatedFat * q,
  };
}

/** Sum any number of nutrition value objects. */
export function sumNutrition(values: NutritionValues[]): NutritionValues {
  const keys: NutrientKey[] = [
    "calories", "protein", "carbohydrates", "fat", "fiber",
    "sugar", "sodium", "potassium", "phosphorus", "cholesterol", "saturatedFat",
  ];
  const out = {} as NutritionValues;
  for (const k of keys) {
    out[k] = values.reduce((acc, v) => acc + (v?.[k] ?? 0), 0);
  }
  return out;
}

/** Scale a nutrition object by a factor (used for fraction-of-reference quantities). */
export function scaleNutrition(n: NutritionValues, factor: number): NutritionValues {
  const out = {} as NutritionValues;
  for (const k of Object.keys(n) as NutrientKey[]) out[k] = (n[k] ?? 0) * factor;
  return out;
}
