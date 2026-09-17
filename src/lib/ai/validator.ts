/**
 * Recommendation Validator — every AI recommendation passes through here.
 * The AI may SELECT and EXPLAIN; it may NEVER change nutrition numbers,
 * violate allergies/diet, or invent candidates.
 */
import { formatKcal, formatGrams, round } from "@/lib/format";
import type { NutritionValues } from "@/lib/nutrition/types";

export interface CandidateForValidation {
  id: string;
  name: string;
  description: string;
  nutrition: NutritionValues;
  items: { name: string; quantity: number; unit: string }[];
  dietTags: string[];
}

export interface AIRanking {
  selected_id: string;
  reason?: string;
  key_factors?: string[];
  evidence_refs?: string[];
  /** rejected if present and mismatched with the candidate's deterministic values */
  nutrition?: Partial<NutritionValues>;
}

export interface ValidationResult {
  valid: boolean;
  failureCode?: string;
  failureReason?: string;
}

export function validateRanking(
  ranking: AIRanking,
  candidates: CandidateForValidation[],
  allergies: string[],
  dietaryPreference: string,
): ValidationResult {
  if (!ranking || typeof ranking.selected_id !== "string") {
    return { valid: false, failureCode: "SCHEMA", failureReason: "Missing selected_id." };
  }

  const selected = candidates.find((c) => c.id === ranking.selected_id);
  if (!selected) {
    return { valid: false, failureCode: "CANDIDATE_NOT_FOUND", failureReason: "AI selected an unknown candidate." };
  }

  // Nutrition consistency: if AI echoed numbers, they must match deterministic values (±2%)
  if (ranking.nutrition) {
    const pairs: [keyof NutritionValues, number][] = [["calories", selected.nutrition.calories], ["protein", selected.nutrition.protein]];
    for (const [key, expected] of pairs) {
      const provided = ranking.nutrition[key];
      if (typeof provided === "number" && Number.isFinite(provided)) {
        const tolerance = Math.max(0.5, Math.abs(expected) * 0.02);
        if (Math.abs(provided - expected) > tolerance) {
          return {
            valid: false,
            failureCode: "NUTRITION_MISMATCH",
            failureReason: `AI modified ${String(key)} (${provided} vs database ${round(expected, 1)}).`,
          };
        }
      }
    }
  }

  // Allergies: candidate must not contain any user allergen tag
  const allergenHit = allergies.find((a) => selected.dietTags.includes(a));
  if (allergenHit) {
    return { valid: false, failureCode: "ALLERGY", failureReason: `Candidate contains allergen: ${allergenHit}.` };
  }

  // Dietary preference
  if (!selected.dietTags.includes(dietaryPreference) && dietaryPreference !== "non_vegetarian") {
    return { valid: false, failureCode: "DIET", failureReason: `Candidate not suitable for ${dietaryPreference}.` };
  }
  if (dietaryPreference === "vegan" && !selected.dietTags.includes("vegan")) {
    return { valid: false, failureCode: "DIET", failureReason: "Candidate not vegan." };
  }

  return { valid: true };
}

/** Deterministic fallback reason used when AI ranking fails validation. */
export function buildFallbackReason(candidate: CandidateForValidation, remaining: NutritionValues): string {
  const kcal = Math.round(candidate.nutrition.calories);
  const protein = round(candidate.nutrition.protein, 1);
  const remKcal = Math.round(remaining.calories);
  return `Selected ${candidate.name} — approximately ${formatKcal(kcal)}, ${formatGrams(protein)} protein, which fits well within your remaining ~${formatKcal(remKcal)} for today and matches your dietary preferences and health constraints.`;
}
