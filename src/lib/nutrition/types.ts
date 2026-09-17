/** Shared nutrition domain types — the typed API contract between backend and frontend. */

export const NUTRIENT_KEYS = [
  "calories", "protein", "carbohydrates", "fat", "fiber",
  "sugar", "sodium", "potassium", "phosphorus", "cholesterol", "saturatedFat",
] as const;

export type NutrientKey = (typeof NUTRIENT_KEYS)[number];
export type NutritionValues = Record<NutrientKey, number>;

export function zeroNutrition(): NutritionValues {
  return {
    calories: 0, protein: 0, carbohydrates: 0, fat: 0, fiber: 0,
    sugar: 0, sodium: 0, potassium: 0, phosphorus: 0, cholesterol: 0, saturatedFat: 0,
  };
}

export type MealType = "breakfast" | "lunch" | "snack" | "dinner";
export type QuantitySource = "user" | "estimated" | "unknown";

/** Result of resolving raw food text against the canonical food database. */
export type MatchStatus = "matched" | "ambiguous" | "unmatched";

export interface DetectedFood {
  /** stable line id for UI editing */
  lineId: string;
  /** raw name as the user/AI described it */
  originalName: string;
  /** canonical DB name when matched, else user text */
  displayName: string;
  /** canonical food id when matched (language independent) */
  foodId: string | null;
  matchStatus: MatchStatus;
  /** candidate matches when ambiguous */
  candidates?: { foodId: string; name: string }[];
  quantity: number;
  unit: string;
  preparation?: string | null;
  confidence: number;
  quantitySource: QuantitySource;
  language?: string;
}

/** Fully-resolved food line with deterministic nutrition attached. */
export interface CalculatedFoodLine {
  lineId: string;
  foodId: string | null;
  displayName: string;
  originalName: string | null;
  quantity: number;
  unit: string;
  preparation?: string | null;
  confidence: number | null;
  quantitySource: QuantitySource;
  nutrition: NutritionValues;
  source: string | null; // DB source of the nutrition values
  perReference: string | null; // "1 piece" | "100 g" ...
}

export interface CalculatedMeal {
  foods: CalculatedFoodLine[];
  totals: NutritionValues;
}

export type ComplianceState = "COMPLIANT" | "POTENTIALLY_NON_COMPLIANT" | "INDETERMINATE";

export interface ConstraintViolation {
  condition: string;
  nutrient: NutrientKey;
  comparator: "max" | "min";
  limit: number;
  actual: number;
  severity: "hard" | "warning";
  message: string;
  evidenceSource: string;
}

export interface ComplianceResult {
  state: ComplianceState;
  violations: ConstraintViolation[];
}

export interface MealPayloadItem {
  foodId?: string | null;
  name: string;
  quantity: number;
  unit: string;
  preparation?: string | null;
}
