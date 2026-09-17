/**
 * AI Ranking flow — the "SLM reasoning" step of the pipeline.
 * Receives ONLY pre-validated candidates with deterministic nutrition values.
 * The AI must select/rank and explain — never modify numbers (validator enforces this).
 */
import { getAiProvider, parseJsonSafe } from "./provider";
import { formatKcal, formatGrams, formatMg } from "@/lib/format";
import type { NutritionValues, NutrientKey } from "@/lib/nutrition/types";
import type { CandidateForValidation, AIRanking } from "./validator";
import type { EvidenceChunk } from "@/lib/rag/retriever";

export interface RankingContext {
  mealSlot: string;
  consumedToday: NutritionValues;
  remainingToday: NutritionValues;
  conditions: string[];
  dietaryPreference: string;
  goal?: string | null;
  recentMealNames: string[];
  recentRecommendationNames: string[];
  /** Meal names the user explicitly liked (thumbs up) — gentle preference signal. */
  likedMealNames?: string[];
  /** Meal names the user explicitly rejected (thumbs down) — avoid unless clearly best. */
  dislikedMealNames?: string[];
}

const RANK_SYSTEM_PROMPT = `You are the reasoning component of a nutrition recommendation engine. You will receive pre-validated meal candidates with nutrition values computed from a trusted food database, the user's remaining daily nutrition budget, health context, and retrieved evidence excerpts.

Your job:
1. Select the single best candidate for the user's NEXT meal.
2. Briefly explain why in simple, non-technical language a normal person understands.
3. Cite which evidence excerpt (by id) supports your reasoning, if any.

STRICT RULES:
- NEVER modify, recalculate, or dispute the provided nutrition values. They are from a trusted database.
- NEVER invent a candidate that is not in the list.
- NEVER recommend anything conflicting with the user's allergies or dietary preference (they are pre-filtered anyway).
- If evidence is not relevant, do not cite it.
- Reply in English.

Output STRICT JSON only:
{
  "selected_id": "<candidate id>",
  "reason": "<2-3 sentence plain-language explanation>",
  "key_factors": ["<factor 1>", "<factor 2>", "..."],
  "evidence_refs": ["<evidence id>", "..."],
  "nutrition": { "calories": <same as provided>, "protein": <same as provided> }
}`;

function fmtNutritionCompact(n: NutritionValues): string {
  return [
    `${formatKcal(n.calories)}`,
    `protein ${formatGrams(n.protein)}`,
    `carbs ${formatGrams(n.carbohydrates)}`,
    `fat ${formatGrams(n.fat)}`,
    `fiber ${formatGrams(n.fiber)}`,
    `sugar ${formatGrams(n.sugar)}`,
    `sodium ${formatMg(n.sodium)}`,
    `sat fat ${formatGrams(n.saturatedFat)}`,
  ].join(", ");
}

export function buildRankingUserPrompt(
  candidates: CandidateForValidation[],
  evidence: EvidenceChunk[],
  ctx: RankingContext,
): string {
  const candidateLines = candidates
    .map(
      (c, i) =>
        `[${c.id}] ${c.name} — ${c.description}\n  Items: ${c.items.map((it) => `${it.quantity} ${it.unit} ${it.name}`).join(", ")}\n  Nutrition (database-computed, DO NOT CHANGE): ${fmtNutritionCompact(c.nutrition)}`,
    )
    .join("\n\n");

  const evidenceLines = evidence.length
    ? evidence.map((e) => `(${e.evidence_id}) ${e.source} — ${e.document}${e.section ? ` / ${e.section}` : ""}: "${e.text.slice(0, 220)}..."`).join("\n")
    : "(no evidence retrieved)";

  const recent = ctx.recentMealNames.length ? ctx.recentMealNames.slice(0, 8).join(", ") : "(none yet)";
  const recentRecs = ctx.recentRecommendationNames.length ? ctx.recentRecommendationNames.slice(0, 6).join(", ") : "(none)";
  const liked = ctx.likedMealNames?.length ? ctx.likedMealNames.slice(0, 5).join(", ") : "(none yet)";
  const disliked = ctx.dislikedMealNames?.length ? ctx.dislikedMealNames.slice(0, 5).join(", ") : "(none yet)";

  return `CURRENT MEAL SLOT: ${ctx.mealSlot}
HEALTH CONDITIONS: ${ctx.conditions.length ? ctx.conditions.join(", ") : "none"}
DIETARY PREFERENCE: ${ctx.dietaryPreference}
GOAL: ${ctx.goal ?? "maintain"}
CONSUMED TODAY: ${fmtNutritionCompact(ctx.consumedToday)}
REMAINING TODAY: ${fmtNutritionCompact(ctx.remainingToday)}
MEALS ALREADY EATEN TODAY: ${recent}
RECENTLY RECOMMENDED (avoid repeating unless clearly best): ${recentRecs}
USER LIKED (thumbs up, prefer similar choices when they fit): ${liked}
USER REJECTED (thumbs down, avoid unless clearly the best remaining option): ${disliked}

EVIDENCE EXCERPTS:
${evidenceLines}

CANDIDATES (nutrition from trusted database):
${candidateLines}

Select the best candidate and explain. JSON only.`;
}

export async function rankCandidates(
  candidates: CandidateForValidation[],
  evidence: EvidenceChunk[],
  ctx: RankingContext,
): Promise<{ ranking: AIRanking | null; latencyMs: number; ok: boolean; error?: string }> {
  if (candidates.length === 0) return { ranking: null, latencyMs: 0, ok: false, error: "no_candidates" };

  const provider = getAiProvider();
  const userPrompt = buildRankingUserPrompt(candidates, evidence, ctx);
  const result = await provider.chat([
    { role: "system", content: RANK_SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ]);

  if (!result.ok) return { ranking: null, latencyMs: result.latencyMs, ok: false, error: result.error };

  const parsed = parseJsonSafe<AIRanking>(result.content);
  if (!parsed || typeof parsed.selected_id !== "string") {
    return { ranking: null, latencyMs: result.latencyMs, ok: false, error: "unparseable_ranking" };
  }
  return { ranking: parsed, latencyMs: result.latencyMs, ok: true };
}

/** Small helper reused for localized explanation snippets. */
export async function translateSnippet(text: string, language: string): Promise<string | null> {
  if (language === "en") return null;
  const provider = getAiProvider();
  const langNames: Record<string, string> = { ta: "Tamil", te: "Telugu", hi: "Hindi", kn: "Kannada" };
  const target = langNames[language];
  if (!target) return null;
  const result = await provider.chat([
    { role: "system", content: `Translate the following nutrition guidance text into ${target}. Keep it simple and natural. Reply with ONLY the translation.` },
    { role: "user", content: text },
  ]);
  return result.ok ? result.content.trim() : null;
}
