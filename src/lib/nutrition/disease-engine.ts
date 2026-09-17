/**
 * Disease-Aware Constraint Engine.
 * Constraints live in the DiseaseConstraint table (configurable, evidence-backed) —
 * this module only APPLIES them. When information is insufficient the result is
 * INDETERMINATE, never a guess.
 *
 * States: COMPLIANT | POTENTIALLY_NON_COMPLIANT | INDETERMINATE
 */
import { db } from "@/lib/db";
import type { ComplianceResult, ConstraintViolation, NutritionValues, NutrientKey } from "./types";
import { safeParseArray } from "./targets";

let constraintCache: { rows: Awaited<ReturnType<typeof db.diseaseConstraint.findMany>>; at: number } | null = null;
const CACHE_TTL = 60_000;

async function getActiveConstraints() {
  if (constraintCache && Date.now() - constraintCache.at < CACHE_TTL) return constraintCache.rows;
  const rows = await db.diseaseConstraint.findMany({ where: { isActive: true } });
  constraintCache = { rows, at: Date.now() };
  return rows;
}

export function invalidateConstraintCache(): void {
  constraintCache = null;
}

interface NutritionProvider {
  totals?: NutritionValues;
  /** true when key nutrient data is missing (e.g. unmatched foods) */
  incomplete?: boolean;
}

/**
 * Evaluate nutrition values against active constraints for the user's conditions.
 * `scope` = "meal" (perMealValue) or "day" (dailyValue).
 */
export async function evaluateCompliance(
  conditions: string[],
  nutrition: NutritionValues,
  scope: "meal" | "day",
  incomplete: boolean = false,
): Promise<ComplianceResult> {
  if (conditions.length === 0) return { state: "COMPLIANT", violations: [] };

  const rows = await getActiveConstraints();
  const relevant = rows.filter((r) => conditions.includes(r.condition));
  if (relevant.length === 0) return { state: "COMPLIANT", violations: [] };

  const violations: ConstraintViolation[] = [];
  let indeterminate = incomplete;

  for (const r of relevant) {
    const limit = scope === "meal" ? r.perMealValue : r.dailyValue;
    if (limit === null || limit === undefined) continue;
    const actual = nutrition[r.nutrient as NutrientKey];
    if (actual === undefined || actual === null || !Number.isFinite(actual)) {
      indeterminate = true;
      continue;
    }
    const breached = r.comparator === "max" ? actual > limit : actual < limit;
    if (breached) {
      violations.push({
        condition: r.condition,
        nutrient: r.nutrient as NutrientKey,
        comparator: r.comparator as "max" | "min",
        limit,
        actual: Math.round(actual * 10) / 10,
        severity: r.severity as "hard" | "warning",
        message: r.message,
        evidenceSource: r.evidenceSource,
      });
    }
  }

  if (indeterminate) return { state: "INDETERMINATE", violations };
  if (violations.length > 0) {
    const hasHard = violations.some((v) => v.severity === "hard");
    return { state: hasHard ? "POTENTIALLY_NON_COMPLIANT" : "POTENTIALLY_NON_COMPLIANT", violations };
  }
  return { state: "COMPLIANT", violations: [] };
}

/**
 * Candidate-level gate for the recommendation engine.
 * Hard violations exclude a candidate; warnings penalize it; unknowns => INDETERMINATE.
 */
export async function screenCandidate(
  conditions: string[],
  nutrition: NutritionValues,
): Promise<{ excluded: boolean; violations: ConstraintViolation[]; indeterminate: boolean }> {
  if (conditions.length === 0) return { excluded: false, violations: [], indeterminate: false };
  const rows = await getActiveConstraints();
  const relevant = rows.filter((r) => conditions.includes(r.condition) && r.perMealValue !== null);
  const violations: ConstraintViolation[] = [];
  let hardBreach = false;
  let indeterminate = false;

  for (const r of relevant) {
    const limit = r.perMealValue as number;
    const actual = nutrition[r.nutrient as NutrientKey];
    if (actual === undefined || !Number.isFinite(actual)) {
      indeterminate = true;
      continue;
    }
    const breached = r.comparator === "max" ? actual > limit : actual < limit;
    if (breached) {
      const v: ConstraintViolation = {
        condition: r.condition, nutrient: r.nutrient as NutrientKey,
        comparator: r.comparator as "max" | "min", limit, actual,
        severity: r.severity as "hard" | "warning", message: r.message, evidenceSource: r.evidenceSource,
      };
      violations.push(v);
      if (r.severity === "hard") hardBreach = true;
    }
  }
  return { excluded: hardBreach, violations, indeterminate };
}

/** User's allergies parsed from profile. */
export function parseAllergies(profile: { allergies: string } | null): string[] {
  return safeParseArray(profile?.allergies).map((a) => a.toLowerCase().trim()).filter(Boolean);
}
