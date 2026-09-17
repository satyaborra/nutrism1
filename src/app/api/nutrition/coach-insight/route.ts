/**
 * GET /api/nutrition/coach-insight
 * AI coach note on today's data. The SLM receives ONLY deterministic numbers
 * (from buildDailySummary + hydration) and RAG evidence excerpts — it explains
 * and advises, it never invents nutrition values. Output is JSON-validated;
 * on AI failure a deterministic rule-based insight is returned instead.
 *
 * Rate limited (10 / 5 min / user). Results cached per user until their data changes.
 */
import { NextRequest, NextResponse } from "next/server";
import { withApi, rateLimit } from "@/lib/api-utils";
import { requireUser } from "@/lib/auth";
import { buildDailySummary, getProfileFor } from "@/lib/nutrition/meal-service";
import { computeDailyTargets, safeParseArray } from "@/lib/nutrition/targets";
import { retrieveEvidence } from "@/lib/rag/retriever";
import { getAiProvider, parseJsonSafe } from "@/lib/ai/provider";
import { formatKcal, formatGrams, formatMg } from "@/lib/format";
import { db } from "@/lib/db";
import type { NutritionValues } from "@/lib/nutrition/types";

export interface CoachInsightPayload {
  headline: string;
  insight: string;
  focus: string[];
  evidenceSources: string[];
  engineSource: "ai" | "deterministic_fallback";
  generatedAt: string;
  stale: boolean;
  aiNote: string | null;
}

interface CacheEntry {
  data: CoachInsightPayload;
  signature: string;
  at: number;
}

const CACHE_TTL = 15 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

function signatureOf(summary: Awaited<ReturnType<typeof buildDailySummary>>, glasses: number): string {
  return `${summary.meals.length}|${Math.round(summary.consumed.calories)}|${Math.round(summary.consumed.protein)}|${Math.round(summary.consumed.sugar)}|${glasses}`;
}

export const GET = withApi("coach_insight", async ({ req }: { req: NextRequest }) => {
  const user = await requireUser();
  const url = new URL(req.url);
  const refresh = url.searchParams.get("refresh") === "1";
  rateLimit("coach_insight", user.id, 10, 5 * 60 * 1000);

  const dateKey = new Date().toISOString().slice(0, 10);
  const [summary, profile, hydration] = await Promise.all([
    buildDailySummary(user.id, dateKey),
    getProfileFor(user.id),
    db.hydrationLog.findUnique({ where: { userId_date: { userId: user.id, date: dateKey } } }),
  ]);
  const glasses = hydration?.glasses ?? 0;
  const targets = computeDailyTargets(profile);
  const conditions = safeParseArray(profile.healthConditions);
  const allergies = safeParseArray(profile.allergies);
  const sig = signatureOf(summary, glasses);

  // Serve cached insight when data has not changed (unless explicit refresh)
  const cached = cache.get(user.id);
  if (!refresh && cached && cached.signature === sig && Date.now() - cached.at < CACHE_TTL) {
    return NextResponse.json({ ...cached.data, stale: false });
  }

  // ---- RAG evidence: conditions + weakest nutrients drive the query ----
  const weakNutrients = [
    summary.targets.protein - summary.consumed.protein > 15 ? "protein" : null,
    summary.targets.fiber - summary.consumed.fiber > 8 ? "fiber" : null,
    summary.consumed.sugar > summary.targets.sugar * 0.8 ? "sugar blood glucose" : null,
    summary.consumed.sodium > summary.targets.sodium * 0.8 ? "sodium" : null,
  ].filter(Boolean) as string[];
  const query = [conditions.join(" "), ...weakNutrients, summary.mealSlot, "daily diet guidance"].join(" ");
  const evidence = await retrieveEvidence(query, 3, conditions);

  // ---- Deterministic fallback (ALWAYS available, no AI needed) ----
  const fallback = buildDeterministicInsight(summary, targets, glasses, evidence.chunks.map((c) => c.source));

  // ---- AI insight over deterministic numbers + evidence ----
  const provider = getAiProvider();
  const prompt = buildCoachPrompt(summary, targets, conditions, allergies, glasses, evidence.chunks);
  const ai = await provider.chat(prompt, { maxTokens: 700 });

  let payload: CoachInsightPayload = fallback;
  let aiNote: string | null = null;

  if (ai.ok) {
    const parsed = parseJsonSafe<Partial<CoachInsightPayload>>(ai.content);
    if (
      parsed &&
      typeof parsed.headline === "string" && parsed.headline.trim().length > 3 && parsed.headline.length <= 140 &&
      typeof parsed.insight === "string" && parsed.insight.trim().length > 20 && parsed.insight.length <= 1200 &&
      Array.isArray(parsed.focus) && parsed.focus.length > 0 && parsed.focus.length <= 4 &&
      parsed.focus.every((f) => typeof f === "string" && f.trim().length > 5 && f.length <= 220)
    ) {
      payload = {
        headline: parsed.headline.trim(),
        insight: parsed.insight.trim(),
        focus: parsed.focus.map((f) => f.trim()).slice(0, 3),
        evidenceSources: evidence.chunks.map((c) => c.source),
        engineSource: "ai",
        generatedAt: new Date().toISOString(),
        stale: false,
        aiNote: null,
      };
    } else {
      aiNote = "AI response did not pass validation — showing a rule-based summary instead.";
    }
  } else {
    aiNote = "AI coach is unavailable right now — showing a rule-based summary instead.";
  }

  if (aiNote && payload.engineSource === "deterministic_fallback") payload.aiNote = aiNote;

  cache.set(user.id, { data: payload, signature: sig, at: Date.now() });
  if (cache.size > 500) {
    const cutoff = Date.now() - CACHE_TTL;
    for (const [k, v] of cache) if (v.at < cutoff) cache.delete(k);
  }

  return NextResponse.json(payload);
});

// ---------- prompt ----------

function buildCoachPrompt(
  summary: Awaited<ReturnType<typeof buildDailySummary>>,
  targets: NutritionValues,
  conditions: string[],
  allergies: string[],
  glasses: number,
  evidence: { evidence_id: string; source: string; text: string }[],
): { role: "system" | "user"; content: string }[] {
  const c = summary.consumed;
  const r = summary.remaining;
  const foodsLogged = summary.meals
    .flatMap((m) => m.foods.map((f) => `${f.name} ${f.quantity} ${f.unit}`))
    .slice(0, 15);

  const system = `You are NutriSLM's AI nutrition coach. You receive the user's verified daily nutrition numbers (computed from a trusted food database), their health conditions, and retrieved evidence excerpts from clinical guidance (WHO / ICMR-NIN / ADA / KDIGO / AHA).

STRICT RULES:
- NEVER invent or recalculate nutrition numbers. Only reference the numbers provided. It is fine to speak qualitatively (e.g. "well under target", "approaching the limit").
- NEVER give medical advice or medication guidance. You give food and lifestyle guidance only.
- NEVER suggest foods containing the user's allergens.
- Base your advice on the provided evidence excerpts; if evidence is thin, keep advice general and safe (hydration, fiber, portion size, meal timing).
- Be warm, concrete and brief. Plain language, no jargon.
- Reply in English.

Output STRICT JSON only:
{
  "headline": "<one short punchy line, max 12 words>",
  "insight": "<3-4 sentences: what stands out in today's numbers so far and what to aim for the rest of the day>",
  "focus": ["<3 short actionable tips for the rest of today, each max 20 words>"]
}`;

  const userMsg = `Today so far (${summary.date}, current slot: ${summary.mealSlot}):
- Consumed: ${formatKcal(c.calories)} kcal of ${formatKcal(targets.calories)} target; protein ${formatGrams(c.protein)}/${formatGrams(targets.protein)}; carbs ${formatGrams(c.carbohydrates)}/${formatGrams(targets.carbohydrates)}; fat ${formatGrams(c.fat)}/${formatGrams(targets.fat)}; fiber ${formatGrams(c.fiber)}/${formatGrams(targets.fiber)}; sugar ${formatGrams(c.sugar)}/${formatGrams(targets.sugar)}; sodium ${formatMg(c.sodium)}/${formatMg(targets.sodium)}; sat fat ${formatGrams(c.saturatedFat)}/${formatGrams(targets.saturatedFat)}.
- Remaining today: ${formatKcal(r.calories)} kcal, protein ${formatGrams(r.protein)}, fiber ${formatGrams(r.fiber)}.
- Meals logged: ${summary.meals.length}${foodsLogged.length ? ` (${foodsLogged.join("; ")})` : ""}.
- Water: ${glasses} glasses (~${glasses * 250} ml) of 8-glass goal.
- Health conditions: ${conditions.length ? conditions.join(", ") : "none declared"}.
- Allergies (hard exclusions): ${allergies.length ? allergies.join(", ") : "none"}.
- Constraint check state today: ${summary.compliance.state}${summary.compliance.violations.length ? ` (violations: ${summary.compliance.violations.map((v) => `${v.nutrient} — ${v.message}`).join(" | ")})` : ""}.

Evidence excerpts:
${evidence.map((e) => `[${e.evidence_id}] (${e.source}) ${e.text.slice(0, 320)}`).join("\n") || "(none retrieved)"}`;

  return [
    { role: "system", content: system },
    { role: "user", content: userMsg },
  ];
}

// ---------- deterministic fallback ----------

function buildDeterministicInsight(
  summary: Awaited<ReturnType<typeof buildDailySummary>>,
  targets: NutritionValues,
  glasses: number,
  evidenceSources: string[],
): CoachInsightPayload {
  const c = summary.consumed;
  const focus: string[] = [];
  const observations: string[] = [];

  const kcalPct = targets.calories > 0 ? c.calories / targets.calories : 0;
  const proteinPct = targets.protein > 0 ? c.protein / targets.protein : 0;
  const fiberPct = targets.fiber > 0 ? c.fiber / targets.fiber : 0;
  const sugarPct = targets.sugar > 0 ? c.sugar / targets.sugar : 0;
  const sodiumPct = targets.sodium > 0 ? c.sodium / targets.sodium : 0;

  if (summary.meals.length === 0) {
    observations.push("Nothing logged yet today — your targets and recommendations will sharpen once you log your first meal.");
    focus.push(`Start with a protein- and fiber-rich ${summary.mealSlot.toLowerCase()} to steady your energy.`);
  } else {
    if (proteinPct < 0.4) observations.push(`Protein is at ${Math.round(proteinPct * 100)}% of target — there is plenty of room left today.`);
    if (fiberPct < 0.5) observations.push(`Fibre is at ${Math.round(fiberPct * 100)}% of target; whole grains, vegetables or pulses would help.`);
    if (sugarPct >= 0.8) observations.push(`You are close to the daily sugar ceiling (${Math.round(sugarPct * 100)}%).`);
    if (sodiumPct >= 0.8) observations.push(`Sodium has reached ${Math.round(sodiumPct * 100)}% of the day's limit.`);
    if (kcalPct < 0.35) observations.push(`Calorie intake is ${Math.round(kcalPct * 100)}% of target so far.`);
  }

  if (glasses < 4) focus.push(`Have ${Math.max(1, 4 - glasses)} more glass${4 - glasses === 1 ? "" : "es"} of water before evening.`);
  if (proteinPct < 0.4) focus.push("Add a protein source (dal, curd, paneer, eggs or soy) to your next meal.");
  if (fiberPct < 0.5) focus.push("Pick a fibre-rich side — vegetables, salad or whole grains.");
  if (sugarPct >= 0.8) focus.push("Skip added sugars and sweet drinks for the rest of the day.");
  if (focus.length < 3) focus.push("Log each meal as you eat — the coach gets sharper with complete data.");

  const headline =
    summary.meals.length === 0
      ? "Let's get today started"
      : kcalPct >= 1
        ? "Daily target reached — choose light"
        : sugarPct >= 0.8
          ? "Watch the sugar for the rest of today"
          : proteinPct < 0.4
            ? "Protein needs a boost today"
            : "Steady day — keep the balance";

  return {
    headline,
    insight: observations.slice(0, 3).join(" ") || "Your day looks balanced so far — keep momentum with a varied next meal.",
    focus: focus.slice(0, 3),
    evidenceSources,
    engineSource: "deterministic_fallback",
    generatedAt: new Date().toISOString(),
    stale: false,
    aiNote: null,
  };
}
