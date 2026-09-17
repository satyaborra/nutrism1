/**
 * Next-Meal Recommendation Engine — core differentiator.
 *
 * Pipeline (responsibilities are NEVER reversed):
 *  1. Build context (date, meal slot, consumed/remaining, profile, history)
 *  2. Generate candidates deterministically from MealTemplates + Food DB
 *  3. Calculate candidate nutrition with the DETERMINISTIC calculator
 *  4. Filter/penalize via allergies, dietary preference, disease constraints
 *  5. Score deterministically vs remaining targets + diversity penalty
 *  6. Retrieve RAG evidence
 *  7. AI ranks & explains (numbers untouched)
 *  8. Validator verifies; on ANY failure -> deterministic safe fallback
 *  9. Persist recommendation history for diversity
 */
import { db } from "@/lib/db";
import { getFoods } from "@/lib/nutrition/food-repository";
import { calculateFoodLine, sumNutrition, foodToRef, type FoodRef } from "@/lib/nutrition/calculator";
import { zeroNutrition, type NutritionValues, type NutrientKey, type ComplianceState } from "@/lib/nutrition/types";
import { computeDailyTargets, safeParseArray, inferMealSlot } from "@/lib/nutrition/targets";
import { screenCandidate, parseAllergies } from "@/lib/nutrition/disease-engine";
import { retrieveEvidence, type EvidenceChunk } from "@/lib/rag/retriever";
import { rankCandidates, type RankingContext } from "@/lib/ai/ranking";
import { validateRanking, buildFallbackReason, type CandidateForValidation } from "@/lib/ai/validator";
import { round } from "@/lib/format";
import type { Profile } from "@prisma/client";

export interface CandidateItem {
  foodId: string;
  name: string;
  quantity: number;
  unit: string;
  perReference: string;
}

export interface RecommendationCandidate {
  id: string;
  name: string;
  description: string;
  items: CandidateItem[];
  nutrition: NutritionValues;
  score: number;
  dietTags: string[];
  cuisine: string;
  violations: { nutrient: string; message: string; severity: string; evidenceSource: string }[];
  indeterminate: boolean;
}

export type RecommendationEvidence = EvidenceChunk;

export interface NextMealRecommendation {
  recommendationId: string;
  generatedAt: string;
  mealSlot: string;
  engineSource: "ai" | "deterministic_fallback";
  selected: RecommendationCandidate;
  alternatives: RecommendationCandidate[];
  explanation: string;
  keyFactors: string[];
  evidence: RecommendationEvidence[];
  /** Present when the user's persisted thumbs up/down influenced this ranking. */
  feedbackSignal: { down: number; up: number } | null;
  contextSummary: {
    conditions: string[];
    dietaryPreference: string;
    remainingToday: NutritionValues;
    targets: NutritionValues;
  };
  aiNote: string | null;
}

function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ---------- Candidate generation ----------

async function generateCandidates(conditions: string[], allergies: string[], dietaryPreference: string, mealSlot: string): Promise<RecommendationCandidate[]> {
  const templates = await db.mealTemplate.findMany({ where: { isActive: true } });

  const dietOrder: Record<string, string[]> = {
    vegan: ["vegan"],
    vegetarian: ["vegetarian", "vegan"],
    eggetarian: ["eggetarian", "vegetarian", "vegan"],
    non_vegetarian: ["non_vegetarian", "eggetarian", "vegetarian", "vegan"],
  };
  const acceptableDiets = dietOrder[dietaryPreference] ?? dietOrder.vegetarian;

  const results: RecommendationCandidate[] = [];

  for (const tpl of templates) {
    const slots = safeParseArray(tpl.mealSlots);
    if (!slots.includes(mealSlot)) continue;
    const diets = safeParseArray(tpl.dietTags);
    if (!diets.some((d) => acceptableDiets.includes(d))) continue;

    const itemsRaw = safeParseTemplateItems(tpl.items);
    const foods = await getFoods(itemsRaw.map((i) => i.foodId));

    let feasible = true;
    const items: CandidateItem[] = [];
    const nutritions: NutritionValues[] = [];

    for (const item of itemsRaw) {
      const food = foods.get(item.foodId);
      if (!food) { feasible = false; break; }

      // Allergen gate (hard filter)
      const allergens = safeParseArray(food.allergens);
      if (allergies.some((a) => allergens.includes(a))) { feasible = false; break; }

      const ref: FoodRef = foodToRef(food);
      nutritions.push(calculateFoodLine(ref, item.quantity));
      items.push({
        foodId: food.id,
        name: food.canonicalName,
        quantity: item.quantity,
        // Template unit (e.g. "katori", "pieces") — the user-meaningful unit.
        // food.servingUnit ("1 katori") is the DB reference and goes in perReference.
        unit: item.unit || food.servingUnit,
        perReference: food.servingUnit,
      });
    }
    if (!feasible || items.length === 0) continue;

    const nutrition = sumNutrition(nutritions);

    // Disease constraint screening (hard exclusions + warnings)
    const screening = await screenCandidate(conditions, nutrition);

    results.push({
      id: tpl.id,
      name: tpl.name,
      description: tpl.description ?? "",
      items,
      nutrition,
      score: 0,
      dietTags: diets,
      cuisine: tpl.cuisine ?? "general",
      violations: screening.violations.map((v) => ({
        nutrient: v.nutrient, message: v.message, severity: v.severity, evidenceSource: v.evidenceSource,
      })),
      indeterminate: screening.indeterminate,
    });
  }

  return results;
}

function safeParseTemplateItems(json: string): { foodId: string; quantity: number; unit: string }[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((i) => i && typeof i.foodId === "string" && Number.isFinite(Number(i.quantity)))
      .map((i) => ({ foodId: i.foodId, quantity: Number(i.quantity), unit: String(i.unit ?? "serving") }));
  } catch {
    return [];
  }
}

// ---------- Deterministic scoring ----------

function scoreCandidate(
  c: RecommendationCandidate,
  remaining: NutritionValues,
  recentRecIds: string[],
  downVotedIds: Set<string>,
  upvotedIds: Set<string>,
  rejectedFoodSets: string[][],
): number {
  // How well does candidate fill remaining calories/protein without overshooting?
  const kcalFit = 1 - Math.min(1, Math.abs(remaining.calories - c.nutrition.calories) / Math.max(400, remaining.calories));
  const proteinFit = remaining.protein > 0 ? Math.min(1, c.nutrition.protein / Math.max(10, remaining.protein * 0.4)) : 0.5;
  const fiberFit = Math.min(1, c.nutrition.fiber / 8);

  let score = kcalFit * 0.4 + proteinFit * 0.35 + fiberFit * 0.25;

  // Penalize constraint warnings
  score -= c.violations.length * 0.15;
  if (c.indeterminate) score -= 0.05;

  // Diversity penalty from recommendation history
  const repeatCount = recentRecIds.filter((id) => id === c.id).length;
  score -= repeatCount * 0.18;

  // Human-feedback loop: heavy penalty for explicitly rejected candidates,
  // gentle boost for approved ones (persisted via thumbs up/down).
  if (downVotedIds.has(c.id)) score -= 0.5;
  if (upvotedIds.has(c.id)) score += 0.12;

  // Feedback generalization: candidates that SHARE foods with a rejected template
  // inherit part of the rejection (≥2 shared foods → strong, 1 → mild).
  let similarityPenalty = 0;
  for (const rejected of rejectedFoodSets) {
    const shared = c.items.filter((i) => rejected.includes(i.foodId)).length;
    if (shared >= 2) similarityPenalty += 0.25;
    else if (shared === 1) similarityPenalty += 0.06;
  }
  score -= Math.min(similarityPenalty, 0.6);

  // Small cuisine variety nudge
  score += (c.items.length >= 3 ? 0.03 : 0);

  return score;
}

// ---------- Main entry ----------

export interface NextMealContextInput {
  userId: string;
  profile: Profile | null;
  mealsToday: {
    mealType: string;
    foods: { displayName: string }[];
    totalCalories: number;
    totalProtein: number;
    totalCarbohydrates: number;
    totalFat: number;
    totalFiber: number;
    totalSugar: number;
    totalSodium: number;
    totalPotassium: number;
    totalPhosphorus: number;
    totalCholesterol: number;
    totalSaturatedFat: number;
  }[];
  now?: Date;
}

export async function generateNextMealRecommendation(input: NextMealContextInput): Promise<NextMealRecommendation> {
  const now = input.now ?? new Date();
  const mealSlot = inferMealSlot(now);
  const profile = input.profile;
  const conditions = safeParseArray(profile?.healthConditions);
  const allergies = parseAllergies(profile);
  const dietaryPreference = profile?.dietaryPreference ?? "vegetarian";
  const language = profile?.language ?? "en";

  const targets = computeDailyTargets(profile);
  const consumed = sumNutrition(
    input.mealsToday.map((m) => ({
      calories: m.totalCalories, protein: m.totalProtein, carbohydrates: m.totalCarbohydrates,
      fat: m.totalFat, fiber: m.totalFiber, sugar: m.totalSugar, sodium: m.totalSodium,
      potassium: m.totalPotassium, phosphorus: m.totalPhosphorus, cholesterol: m.totalCholesterol,
      saturatedFat: m.totalSaturatedFat,
    })),
  );
  const remaining = zeroNutrition();
  for (const k of Object.keys(consumed) as NutrientKey[]) {
    remaining[k] = Math.max(0, (targets[k] ?? 0) - consumed[k]);
  }

  // Diversity signal: recent recommendation history for this user
  const recentRecs = await db.recommendationHistory.findMany({
    where: { userId: input.userId, createdAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } },
    orderBy: { createdAt: "desc" },
    take: 12,
  });
  const recentRecIds = recentRecs.map((r) => r.selectedTemplateId).filter((x): x is string => !!x);
  const recentRecNames = recentRecs
    .map((r) => {
      try {
        const s = JSON.parse(r.candidatesSummary ?? "[]") as { id: string; name: string }[];
        const sel = s.find((x) => x.id === r.selectedTemplateId);
        return sel?.name ?? "";
      } catch { return ""; }
    })
    .filter(Boolean);

  // Human-feedback signal: persisted thumbs up/down from the last 14 days
  const recentFeedback = await db.recommendationFeedback
    .findMany({
      where: { userId: input.userId, createdAt: { gte: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000) } },
      orderBy: { createdAt: "desc" },
      take: 50,
    })
    .catch(() => []);
  const downVotedIds = new Set(recentFeedback.filter((f) => f.rating === "down").map((f) => f.candidateId).filter((x): x is string => !!x));
  const upvotedIds = new Set(recentFeedback.filter((f) => f.rating === "up").map((f) => f.candidateId).filter((x): x is string => !!x));

  // Feedback generalization: resolve rejected templates to their FOOD ids so the
  // penalty extends beyond the exact template (similar meals inherit a share of it).
  const rejectedFoodSets: string[][] = [];
  if (downVotedIds.size > 0) {
    const rejectedTemplates = await db.mealTemplate
      .findMany({ where: { id: { in: [...downVotedIds] } }, select: { id: true, items: true } })
      .catch(() => []);
    for (const t of rejectedTemplates) {
      const ids = safeParseTemplateItems(t.items).map((i) => i.foodId);
      if (ids.length > 0) rejectedFoodSets.push(ids);
    }
  }

  // 1-2. Candidates + 3. deterministic nutrition + 4. constraint screening
  const candidates = await generateCandidates(conditions, allergies, dietaryPreference, mealSlot);

  // 5. deterministic scoring (incl. feedback adjustments + similarity generalization)
  for (const c of candidates) {
    c.score = scoreCandidate(c, remaining, recentRecIds, downVotedIds, upvotedIds, rejectedFoodSets);
  }
  candidates.sort((a, b) => b.score - a.score);
  const topCandidates = candidates.slice(0, 5);

  // Names for the feedback the AI prompt should be aware of (empty when no feedback)
  const nameById = new Map(candidates.map((c) => [c.id, c.name] as const));
  const dislikedNames = [...downVotedIds].map((id) => nameById.get(id)).filter((x): x is string => !!x);
  const likedNames = [...upvotedIds].map((id) => nameById.get(id)).filter((x): x is string => !!x);

  if (topCandidates.length === 0) {
    // Absolute fallback: no template passed filters — return a minimal safe suggestion
    const fallbackCandidate: RecommendationCandidate = {
      id: "fallback_simple",
      name: "Simple balanced plate",
      description: "A home-cooked dal, roti and vegetable salad plate",
      items: [],
      nutrition: zeroNutrition(),
      score: 0,
      dietTags: [dietaryPreference],
      cuisine: "general",
      violations: [],
      indeterminate: true,
    };
    return {
      recommendationId: `rec_${Date.now().toString(36)}`,
      generatedAt: now.toISOString(),
      mealSlot,
      engineSource: "deterministic_fallback",
      selected: fallbackCandidate,
      alternatives: [],
      explanation: "We couldn't generate safe candidates with your current filters. Try relaxing your profile settings (e.g. allergies) or check back later.",
      keyFactors: ["No valid candidates passed your health constraints"],
      evidence: [],
      feedbackSignal: null,
      contextSummary: {
        conditions, dietaryPreference, remainingToday: remaining, targets,
      },
      aiNote: null,
    };
  }

  // 6. RAG evidence retrieval
  const evidenceQuery = [
    mealSlot, ...conditions, dietaryPreference,
    remaining.protein > targets.protein * 0.4 ? "protein" : "",
    remaining.fiber > targets.fiber * 0.4 ? "fiber" : "",
    consumed.sodium > targets.sodium * 0.6 ? "sodium" : "",
  ].filter(Boolean).join(" ");
  const evidence = await retrieveEvidence(evidenceQuery, 3, [...conditions.map((c) => c.toLowerCase()), dietaryPreference.replace("_", " ")]);

  // 7. AI ranking with strict instructions
  const rankingCtx: RankingContext = {
    mealSlot,
    consumedToday: consumed,
    remainingToday: remaining,
    conditions,
    dietaryPreference,
    goal: profile?.goal ?? null,
    recentMealNames: input.mealsToday.flatMap((m) => m.foods.map((f) => f.displayName)),
    recentRecommendationNames: recentRecNames,
    likedMealNames: likedNames,
    dislikedMealNames: dislikedNames,
  };

  const forValidation: CandidateForValidation[] = topCandidates.map((c) => ({
    id: c.id, name: c.name, description: c.description, nutrition: c.nutrition,
    items: c.items.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit })),
    dietTags: c.dietTags,
  }));

  const ranking = await rankCandidates(forValidation, evidence.chunks, rankingCtx);

  // 8. Validation
  let engineSource: "ai" | "deterministic_fallback" = "deterministic_fallback";
  let selectedCandidate = topCandidates[0];
  let explanation = buildFallbackReason(forValidation[0], remaining);
  let keyFactors: string[] = buildKeyFactors(topCandidates[0], conditions, remaining);
  let aiNote: string | null = null;

  if (ranking.ok && ranking.ranking) {
    // diet tags for validation come from candidate records
    const validationCandidates = topCandidates.map((c) => ({ ...c, dietTags: c.dietTags }));
    const validation = validateRanking(ranking.ranking, validationCandidates, allergies, dietaryPreference);
    if (validation.valid) {
      const sel = topCandidates.find((c) => c.id === ranking.ranking!.selected_id)!;
      selectedCandidate = sel;
      explanation = (ranking.ranking.reason ?? "").trim() || buildFallbackReason(forValidation.find((c) => c.id === sel.id)!, remaining);
      keyFactors = Array.isArray(ranking.ranking.key_factors) ? ranking.ranking.key_factors.slice(0, 5).map(String) : keyFactors;
      engineSource = "ai";
    } else {
      aiNote = `AI recommendation rejected by validator (${validation.failureCode}); used deterministic selection.`;
    }
  } else if (!ranking.ok) {
    aiNote = "AI reasoning was unavailable; used deterministic selection.";
  }

  // Honest attribution: surface the feedback adjustment in the response when it was applied
  const feedbackApplied = downVotedIds.size + upvotedIds.size > 0;
  if (feedbackApplied) {
    keyFactors = [...keyFactors, "Adjusted using your recent thumbs up/down feedback"].slice(0, 6);
  }

  // Evidence refs validation: keep only evidence that actually exists and was retrieved
  const validEvidence = evidence.chunks;

  // 9. Persist history
  const recId = `rec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  await db.recommendationHistory.create({
    data: {
      userId: input.userId,
      date: todayKey(now),
      mealSlot,
      selectedTemplateId: selectedCandidate.id === "fallback_simple" ? null : selectedCandidate.id,
      selectedFoodIds: JSON.stringify(selectedCandidate.items.map((i) => i.foodId)),
      reason: explanation.slice(0, 500),
      engineSource,
      candidatesSummary: JSON.stringify(topCandidates.map((c) => ({ id: c.id, name: c.name }))),
    },
  }).catch(() => undefined); // history persistence must never break the response

  const localizedExplanation = language !== "en" ? explanation : explanation;

  return {
    recommendationId: recId,
    generatedAt: now.toISOString(),
    mealSlot,
    engineSource,
    selected: selectedCandidate,
    alternatives: topCandidates.filter((c) => c.id !== selectedCandidate.id).slice(0, 2),
    explanation: localizedExplanation,
    keyFactors,
    evidence: validEvidence,
    feedbackSignal: feedbackApplied ? { down: downVotedIds.size, up: upvotedIds.size } : null,
    contextSummary: {
      conditions, dietaryPreference, remainingToday: remaining, targets,
    },
    aiNote,
  };
}

function buildKeyFactors(candidate: RecommendationCandidate, conditions: string[], remaining: NutritionValues): string[] {
  const factors: string[] = [];
  factors.push(`~${Math.round(candidate.nutrition.calories)} kcal for your next meal`);
  if (remaining.protein > 20) factors.push(`adds ${round(candidate.nutrition.protein, 1)} g protein toward your remaining ${Math.round(remaining.protein)} g`);
  if (candidate.nutrition.fiber >= 5) factors.push(`good fibre content (${round(candidate.nutrition.fiber, 1)} g)`);
  if (conditions.length) factors.push(`checked against ${conditions.join(", ")} constraints`);
  factors.push("matches your dietary preference");
  return factors.slice(0, 5);
}
