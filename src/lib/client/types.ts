/**
 * Typed API contract for the NutriSLM frontend.
 * Mirrors the backend responses exactly (see src/lib/nutrition/types.ts, api routes).
 */

export const NUTRIENT_KEYS = [
  "calories", "protein", "carbohydrates", "fat", "fiber",
  "sugar", "sodium", "potassium", "phosphorus", "cholesterol", "saturatedFat",
] as const;

export type NutrientKey = (typeof NUTRIENT_KEYS)[number];
export type NutritionValues = Record<NutrientKey, number>;

export type MealType = "breakfast" | "lunch" | "snack" | "dinner";
export type MatchStatus = "matched" | "ambiguous" | "unmatched";
export type QuantitySource = "user" | "estimated" | "unknown";
export type ComplianceState = "COMPLIANT" | "POTENTIALLY_NON_COMPLIANT" | "INDETERMINATE";
export type LangCode = "en" | "ta" | "te" | "hi" | "kn";

export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type Goal = "lose_weight" | "maintain" | "gain_muscle";
export type DietaryPreference = "vegetarian" | "vegan" | "eggetarian" | "non_vegetarian";
export type HealthCondition = "T2DM" | "CKD" | "CVD";
export type Allergen = "dairy" | "nuts" | "peanuts" | "gluten" | "egg" | "fish" | "soy";

// ---------- Auth ----------

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface AuthProfileBrief {
  language: LangCode;
  dietaryPreference: string;
  healthConditions: string[];
  allergies: string[];
}

export interface MeResponse {
  user: User;
  profile: AuthProfileBrief | null;
}

export interface AuthResponse {
  user: User;
}

// ---------- Profile ----------

export interface ComputedTargets {
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
  bmr: number;
  tdee: number;
}

export interface ProfileData {
  age: number | null;
  sex: string | null;
  heightCm: number | null;
  weightKg: number | null;
  activityLevel: ActivityLevel | null;
  goal: Goal | null;
  dietaryPreference: DietaryPreference;
  allergies: string[];
  healthConditions: string[];
  language: LangCode;
  calorieTargetOverride: number | null;
  proteinTargetOverride: number | null;
}

export interface ProfileResponse {
  profile: ProfileData;
  computedTargets: ComputedTargets;
  targetNotes: string[];
}

export interface ProfileUpdateInput {
  age?: number | null;
  sex?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
  activityLevel?: string | null;
  goal?: string | null;
  dietaryPreference?: string;
  allergies?: string[];
  healthConditions?: string[];
  language?: string;
  calorieTargetOverride?: number | null;
  proteinTargetOverride?: number | null;
}

// ---------- Foods ----------

export interface FoodSearchItem {
  id: string;
  name: string;
  category: string;
  servingUnit: string;
  isVeg: boolean;
  allergens: string[];
}

export interface FoodSearchResponse {
  foods: FoodSearchItem[];
}

// ---------- Analyze / confirm / log ----------

export interface DetectedLanguage {
  language: string;
  script: string;
  confidence: number;
  method: string;
}

export interface DetectedFood {
  lineId: string;
  originalName: string;
  displayName: string;
  foodId: string | null;
  matchStatus: MatchStatus;
  candidates?: { foodId: string; name: string }[];
  quantity: number;
  unit: string;
  preparation?: string | null;
  confidence: number;
  quantitySource: QuantitySource;
  language?: string;
}

export interface AnalyzeFoodResponse {
  analysisId: string;
  draftId: string;
  status: string;
  detectedLanguage: DetectedLanguage;
  mealTypeGuess: string;
  foods: DetectedFood[];
  aiOk: boolean;
  aiNote: string | null;
  aiLatencyMs: number | null;
}

export interface ConfirmFoodLine {
  lineId: string;
  foodId: string | null;
  displayName: string;
  originalName: string | null;
  quantity: number;
  unit: string;
  preparation: string | null;
  confidence: number | null;
  quantitySource: string;
  nutrition: NutritionValues;
  source: string | null;
  perReference: string | null;
  conversionNote: string | null;
}

export interface ConfirmFoodRequest {
  draftId: string;
  mealType: string;
  foods: {
    lineId: string;
    foodId?: string | null;
    name: string;
    quantity: number;
    unit: string;
    preparation?: string | null;
  }[];
}

export interface ConfirmFoodResponse {
  draftId: string;
  mealType: string;
  foods: ConfirmFoodLine[];
  totals: NutritionValues;
  compliance: Compliance;
  incomplete: boolean;
  note: string | null;
}

export interface LogMealItemInput {
  foodId?: string | null;
  name: string;
  quantity: number;
  unit: string;
  preparation?: string | null;
}

export interface LogMealRequest {
  requestId: string;
  draftId?: string;
  mealType: string;
  foods: LogMealItemInput[];
  notes?: string;
  source?: "text" | "manual" | "recommendation";
}

export interface ConstraintViolation {
  condition: string;
  nutrient: string;
  message: string;
  severity: string;
  evidenceSource: string;
}

export interface Compliance {
  state: ComplianceState;
  violations: ConstraintViolation[];
}

export interface MealFoodSummary {
  name: string;
  quantity: number;
  unit: string;
  nutrition: Partial<NutritionValues>;
}

export interface MealSummary {
  id: string;
  mealType: string;
  eatenAt: string;
  foods: MealFoodSummary[];
  totals: Partial<NutritionValues>;
}

export interface LogMealResponse {
  mealId: string;
  duplicate: boolean;
  meal: MealSummary;
  totals: NutritionValues;
  compliance: Compliance;
  recommendationInvalidated: boolean;
}

// ---------- Meals / daily summary ----------

export interface MealFoodDetail {
  id: string;
  foodId: string | null;
  name: string;
  originalName: string | null;
  quantity: number;
  unit: string;
  preparation: string | null;
  confidence: number | null;
  quantitySource: string;
  nutrition: NutritionValues;
}

export interface MealDetail {
  id: string;
  mealType: string;
  source: string | null;
  notes: string | null;
  eatenAt: string;
  loggedAt: string;
  foods: MealFoodDetail[];
  totals: NutritionValues;
}

export interface RecentMealsResponse {
  meals: MealDetail[];
  count: number;
}

export interface DailySummaryResponse {
  date: string;
  mealSlot: string;
  meals: MealDetail[];
  consumed: NutritionValues;
  targets: NutritionValues;
  remaining: NutritionValues;
  compliance: Compliance;
  healthConditions: string[];
  language: string;
}

// ---------- Next-meal recommendation ----------

export interface RecommendationItem {
  foodId: string;
  name: string;
  quantity: number;
  unit: string;
  perReference: string;
}

export interface CandidateViolation {
  nutrient: string;
  message: string;
  severity: string;
  evidenceSource: string;
}

export interface RecommendationCandidate {
  id: string;
  name: string;
  description: string;
  items: RecommendationItem[];
  nutrition: NutritionValues;
  score: number;
  dietTags: string[];
  cuisine: string;
  violations: CandidateViolation[];
  indeterminate: boolean;
}

export interface EvidenceChunk {
  evidence_id: string;
  source: string;
  document: string;
  section: string;
  text: string;
  score: number;
}

export interface NextMealResponse {
  recommendationId: string;
  generatedAt: string;
  mealSlot: string;
  engineSource: "ai" | "deterministic_fallback";
  selected: RecommendationCandidate;
  alternatives: RecommendationCandidate[];
  explanation: string;
  keyFactors: string[];
  evidence: EvidenceChunk[];
  contextSummary: {
    conditions: string[];
    dietaryPreference: string;
    remainingToday: NutritionValues;
    targets: NutritionValues;
  };
  aiNote: string | null;
}

// ---------- Health ----------

export interface HealthResponse {
  status: string;
  service?: string;
  database: string;
  dbLatencyMs?: number;
  seed: { foods: number; evidence: number; templates: number; constraints: number };
  time?: string;
}
