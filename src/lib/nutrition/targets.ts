/**
 * Daily nutrition targets — computed from the user's health profile.
 * Evidence-anchored defaults (Mifflin-St Jeor for BMR, ICMR-NIN protein, NIN fibre),
 * with optional manual overrides. NOT hard-coded per-user magic numbers.
 */
import type { Profile } from "@prisma/client";
import { zeroNutrition, type NutritionValues } from "./types";

export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type Goal = "lose_weight" | "maintain" | "gain_muscle";

const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

const GOAL_ADJUSTMENTS: Record<Goal, number> = {
  lose_weight: -400,
  maintain: 0,
  gain_muscle: 300,
};

export interface DailyTargets extends NutritionValues {
  computedFrom: "profile" | "defaults";
  bmr: number | null;
  tdee: number | null;
  notes: string[];
}

export function computeDailyTargets(profile: Profile | null): DailyTargets {
  const notes: string[] = [];
  let calorieTarget: number;
  let proteinTarget: number;
  let bmr: number | null = null;
  let tdee: number | null = null;
  let computedFrom: "profile" | "defaults" = "defaults";

  const conditions = safeParseArray(profile?.healthConditions);
  const weight = profile?.weightKg ?? null;
  const height = profile?.heightCm ?? null;
  const age = profile?.age ?? null;
  const sex = profile?.sex ?? null;
  const activity = (profile?.activityLevel as ActivityLevel) ?? null;
  const goal = (profile?.goal as Goal) ?? "maintain";

  if (profile?.calorieTargetOverride) {
    calorieTarget = profile.calorieTargetOverride;
    computedFrom = "profile";
    notes.push("Calorie target uses your manual override.");
  } else if (weight && height && age) {
    // Mifflin-St Jeor
    const s = sex === "female" ? -161 : 5;
    bmr = 10 * weight + 6.25 * height - 5 * age + s;
    tdee = bmr * (activity ? ACTIVITY_FACTORS[activity] : ACTIVITY_FACTORS.moderate);
    calorieTarget = Math.max(1200, tdee + GOAL_ADJUSTMENTS[goal]);
    computedFrom = "profile";
    if (goal === "lose_weight") notes.push("Calorie target includes a moderate deficit for gradual weight loss.");
    if (goal === "gain_muscle") notes.push("Calorie target includes a surplus to support muscle gain.");
  } else {
    calorieTarget = 2000;
    notes.push("Complete your profile for a personalized calorie target (using a general 2000 kcal reference).");
  }

  if (profile?.proteinTargetOverride) {
    proteinTarget = profile.proteinTargetOverride;
    notes.push("Protein target uses your manual override.");
  } else if (weight) {
    if (conditions.includes("CKD")) {
      // KDIGO: ~0.8 g/kg for non-dialysis CKD (unless clinically advised otherwise)
      proteinTarget = 0.8 * weight;
      notes.push("Protein target follows CKD guidance (~0.8 g/kg/day); confirm with your clinician.");
    } else if (goal === "gain_muscle") {
      proteinTarget = 1.6 * weight;
      notes.push("Higher protein target to support muscle gain.");
    } else {
      // ICMR-NIN ~0.83–1.0 g/kg; use 1.0 for active users, 0.9 default
      proteinTarget = 0.9 * weight;
    }
    computedFrom = "profile";
  } else {
    proteinTarget = Math.round((calorieTarget * 0.15) / 4);
  }

  // Carbs ~45-55% of energy for general population; lower band if T2DM
  const carbShare = conditions.includes("T2DM") ? 0.45 : 0.5;
  const carbTarget = (calorieTarget * carbShare) / 4;
  const fatTarget = (calorieTarget * (conditions.includes("CVD") ? 0.25 : 0.3)) / 9;
  const fiberTarget = conditions.includes("T2DM")
    ? Math.round((calorieTarget / 1000) * 14) // ADA: 14g/1000kcal
    : 28; // ICMR-NIN 25-30 g/day

  // Sodium: WHO <5g salt (~2g sodium); AHA stricter for CVD
  const sodiumTarget = conditions.includes("CVD") || conditions.includes("CKD") ? 1500 : 2000;
  const sugarTarget = (calorieTarget * 0.05) / 4; // WHO <5% free sugars (aspirational)

  return {
    ...zeroNutrition(),
    calories: Math.round(calorieTarget),
    protein: Math.round(proteinTarget),
    carbohydrates: Math.round(carbTarget),
    fat: Math.round(fatTarget),
    fiber: fiberTarget,
    sugar: Math.round(sugarTarget),
    sodium: sodiumTarget,
    potassium: 3500, // WHO suggested potassium intake for adults
    phosphorus: 1000,
    cholesterol: conditions.includes("CVD") ? 200 : 300,
    saturatedFat: Math.round((calorieTarget * (conditions.includes("CVD") ? 0.06 : 0.1)) / 9),
    computedFrom,
    bmr: bmr !== null ? Math.round(bmr) : null,
    tdee: tdee !== null ? Math.round(tdee) : null,
    notes,
  };
}

export function safeParseArray(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Infer the meal slot from the current time. */
export function inferMealSlot(d: Date): "breakfast" | "lunch" | "snack" | "dinner" {
  const h = d.getHours();
  if (h >= 5 && h < 11) return "breakfast";
  if (h >= 11 && h < 16) return "lunch";
  if (h >= 16 && h < 19) return "snack";
  return "dinner";
}
