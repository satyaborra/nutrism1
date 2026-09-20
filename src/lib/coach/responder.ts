/**
 * Coach Responder — turns a classified intent + verified context into a
 * structured, UI-renderable reply.
 *
 * HARD RULES (spec §46, §48):
 *  • Every nutrition NUMBER shown in cards comes from the deterministic engine /
 *    DB aggregation — never from a model.
 *  • LLM text is narrative only; a validator scans it and any number+unit pair
 *    that is NOT in the verified allowed-set downgrades the whole reply to the
 *    deterministic template (database wins over the model, always).
 *  • On model failure the user still gets a full deterministic answer.
 */
import { db } from "@/lib/db";
import { getAiProvider } from "@/lib/ai/provider";
import { retrieveEvidence, type EvidenceChunk } from "@/lib/rag/retriever";
import { generateNextMealRecommendation, type RecommendationCandidate } from "@/lib/recommendation/engine";
import { getProfileFor } from "@/lib/nutrition/meal-service";
import { formatKcal, formatGrams, formatMg, round } from "@/lib/format";
import { getCoachContext, slotTime, daySlotStatuses, type CoachContext } from "./context";
import { classifyIntent, contextDigest, hasIndicScript, languageName, type CoachIntent } from "./intents";
import { zeroNutrition, type NutritionValues, type NutrientKey } from "@/lib/nutrition/types";

// ---------- card shapes (shared contract with the frontend) ----------

export interface CoachEvidenceRef {
  source: string;
  document: string;
  section: string;
  text: string;
}

export interface CoachRecCard {
  kind: "recommendation";
  slot: string;
  candidateId: string;
  name: string;
  items: { foodId: string; name: string; quantity: number; unit: string }[];
  nutrition: NutritionValues;
  why: string[];
}

export interface CoachPlanSlot {
  slot: string;
  time: string;
  status: "logged" | "recommended" | "skipped";
  name?: string;
  kcal?: number;
  nutrition?: NutritionValues;
  candidateId?: string;
  items?: { foodId: string; name: string; quantity: number; unit: string }[];
  why?: string[];
}

export interface CoachPlanCard {
  kind: "plan";
  scope: "rest" | "full";
  slots: CoachPlanSlot[];
  summary: string;
  projected: { calories: number; protein: number; fiber: number };
}

export interface CoachGapCard {
  kind: "gaps";
  items: { label: string; detail: string; pct: number }[];
}

export interface CoachProgressCard {
  kind: "progress";
  items: { label: string; pct: number }[];
  well: string[];
  focus: string[];
  next: string;
}

export interface CoachHistoryCard {
  kind: "history";
  title: string;
  groups: { label: string; lines: { name: string; kcal: number; time: string }[] }[];
  totals?: { label: string; value: string }[];
}

export interface CoachWaterCard {
  kind: "water";
  glasses: number;
  target: number;
}

export interface CoachEvidenceCard {
  kind: "evidence";
  items: CoachEvidenceRef[];
}

export type CoachCard =
  | CoachRecCard
  | CoachPlanCard
  | CoachGapCard
  | CoachProgressCard
  | CoachHistoryCard
  | CoachWaterCard
  | CoachEvidenceCard;

export interface CoachReply {
  v: 2;
  intent: CoachIntent;
  text: string;
  engineSource: "ai" | "deterministic_fallback";
  cards: CoachCard[];
  confidence: "low" | "moderate" | "high";
}

// ---------- helpers ----------

function toEvidenceRef(e: EvidenceChunk): CoachEvidenceRef {
  return { source: e.source, document: e.document, section: e.section, text: e.text.slice(0, 320) };
}

function candidateToRecCard(c: RecommendationCandidate, slot: string, why: string[]): CoachRecCard {
  return {
    kind: "recommendation",
    slot,
    candidateId: c.id,
    name: c.name,
    items: c.items.map((i) => ({ foodId: i.foodId, name: i.name, quantity: i.quantity, unit: i.unit })),
    nutrition: {
      calories: round(c.nutrition.calories, 0),
      protein: round(c.nutrition.protein, 0),
      carbohydrates: round(c.nutrition.carbohydrates, 0),
      fat: round(c.nutrition.fat, 0),
      fiber: round(c.nutrition.fiber, 0),
      sugar: round(c.nutrition.sugar, 0),
      sodium: round(c.nutrition.sodium, 0),
      potassium: round(c.nutrition.potassium, 0),
      phosphorus: round(c.nutrition.phosphorus, 0),
      cholesterol: round(c.nutrition.cholesterol, 0),
      saturatedFat: round(c.nutrition.saturatedFat, 0),
    },
    why,
  };
}

function zeroed(): NutritionValues {
  return zeroNutrition();
}

function sumNutrition(values: NutritionValues[]): NutritionValues {
  const out = zeroed();
  for (const v of values) {
    for (const k of Object.keys(out) as NutrientKey[]) out[k] += v[k] ?? 0;
  }
  return out;
}

interface HandlerEnv {
  ctx: CoachContext;
  userId: string;
  message: string;
  excludeIds: string[];
  slot?: string;
}

/** One aggregated "today" entry (full deterministic totals) + planned virtual meals. */
function mealsForEngine(env: HandlerEnv, virtual: { mealType: string; name: string; totals: NutritionValues }[]) {
  const todayEntry = {
    mealType: env.ctx.mealSlot,
    foods: env.ctx.meals.map((m) => ({ displayName: m.name.split(" + ")[0] ?? m.name })),
    ...Object.fromEntries(
      (Object.keys(env.ctx.consumedTotals) as NutrientKey[]).map((k) => [
        `total${k.charAt(0).toUpperCase()}${k.slice(1)}`,
        env.ctx.consumedTotals[k],
      ]),
    ),
  };
  const planned = virtual.map((v) => ({
    mealType: v.mealType,
    foods: [{ displayName: v.name }],
    totalCalories: v.totals.calories,
    totalProtein: v.totals.protein,
    totalCarbohydrates: v.totals.carbohydrates,
    totalFat: v.totals.fat,
    totalFiber: v.totals.fiber,
    totalSugar: v.totals.sugar,
    totalSodium: v.totals.sodium,
    totalPotassium: v.totals.potassium,
    totalPhosphorus: v.totals.phosphorus,
    totalCholesterol: v.totals.cholesterol,
    totalSaturatedFat: v.totals.saturatedFat,
  }));
  return [todayEntry, ...planned];
}

async function engineForSlot(
  env: HandlerEnv,
  slot: string,
  virtual: { mealType: string; name: string; totals: NutritionValues }[],
): Promise<{ selected: RecommendationCandidate | null; explanation: string; keyFactors: string[]; evidence: EvidenceChunk[]; source: "ai" | "deterministic_fallback" }> {
  const profile = await getProfileFor(env.userId);
  const rec = await generateNextMealRecommendation({
    userId: env.userId,
    profile,
    // engine expects the mealsToday totals shape — consumedTotals already carries the exact keys
    mealsToday: mealsForEngine(env, virtual) as unknown as Parameters<typeof generateNextMealRecommendation>[0]["mealsToday"],
    slotOverride: slot,
    excludeCandidateIds: env.excludeIds,
  });
  if (rec.selected.id === "fallback_simple") {
    return { selected: null, explanation: rec.explanation, keyFactors: [], evidence: rec.evidence, source: "deterministic_fallback" };
  }
  return { selected: rec.selected, explanation: rec.explanation, keyFactors: rec.keyFactors, evidence: rec.evidence, source: rec.engineSource };
}

// ---------- LLM phrasing + validator ----------

function unitSpecs(text: string): { num: number }[] {
  const out: { num: number }[] = [];
  const re = /(\d[\d,]*(?:\.\d+)?)\s*(kcal|calories?|cal\b|g\b|grams?\b|mg\b|milligrams?\b|glasses?\b|glass\b|ml\b|days?\b|%)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push({ num: Number(m[1].replace(/,/g, "")) });
  return out;
}

function textNumbersAllowed(text: string, allowed: Set<number>): boolean {
  for (const { num } of unitSpecs(text)) {
    if (!allowed.has(Math.round(num)) && !allowed.has(round(num, 1))) return false;
  }
  return true;
}

function allowedFromCards(cards: CoachCard[], base: Set<number>): Set<number> {
  const allowed = new Set(base);
  const addNutrition = (n: NutritionValues | undefined) => {
    if (!n) return;
    for (const v of Object.values(n)) {
      allowed.add(Math.round(v));
      allowed.add(round(v, 1));
    }
  };
  for (const card of cards) {
    if (card.kind === "recommendation") addNutrition(card.nutrition);
    if (card.kind === "plan") {
      for (const s of card.slots) addNutrition(s.nutrition);
      allowed.add(card.projected.calories);
      allowed.add(card.projected.protein);
      allowed.add(card.projected.fiber);
    }
    if (card.kind === "progress") for (const i of card.items) allowed.add(i.pct);
    if (card.kind === "water") {
      allowed.add(card.glasses);
      allowed.add(card.target);
      allowed.add(card.target - card.glasses);
    }
  }
  return allowed;
}

interface PhraseOpts {
  ctx: CoachContext;
  question: string;
  ask: string;
  maxWords?: number;
}

async function phrase({ ctx, question, ask, maxWords = 90 }: PhraseOpts): Promise<string | null> {
  const lang = hasIndicScript(question) ? languageName(scriptLang(question) ?? ctx.language) : languageName(ctx.language);
  const provider = getAiProvider();
  const system = `You are NutriSLM's AI nutrition coach. Verified data is provided; it is the ONLY source of numbers.

RULES (violating any voids the answer):
- Quote ONLY numbers that appear in the verified data or in the suggested meal(s) you are told about. Never compute new numbers.
- No medical advice, no diagnosis, no promises ("this will cure/control X" is forbidden). Use "may fit your targets", "considered your profile".
- Never suggest foods outside the diet preference or containing the listed allergens.
- ${ask}
- Max ~${maxWords} words. Warm, concrete, plain language. No markdown, no JSON, no headings.
- Reply in ${lang}.`;

  const ai = await provider.chat(
    [
      { role: "system", content: system },
      { role: "user", content: `Verified data:\n${contextDigest(ctx)}\n\nUser asked: "${question}"\n\nAnswer direction: ${ask}` },
    ],
    { maxTokens: 420 },
  );
  if (!ai.ok) return null;
  const text = ai.content.trim().replace(/^["']+|["']+$/g, "").slice(0, 900);
  if (text.length < 12) return null;
  return text;
}

function scriptLang(message: string): string | null {
  if (/[\u0B80-\u0BFF]/.test(message)) return "ta";
  if (/[\u0C00-\u0C7F]/.test(message)) return "te";
  if (/[\u0900-\u097F]/.test(message)) return "hi";
  if (/[\u0C80-\u0CFF]/.test(message)) return "kn";
  return null;
}

// ---------- deterministic templates (fallback + offline mode) ----------

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function tToday(ctx: CoachContext): string {
  if (ctx.meals.length === 0) {
    return `You haven't logged anything yet today. Log your first meal and I'll build your day from there — your targets are ${formatKcal(ctx.nutrition.calories.target)} kcal and ${formatGrams(ctx.nutrition.protein.target)} protein.`;
  }
  const parts = ctx.meals.map((m) => `${cap(m.mealType)}: ${m.name} (${m.kcal} kcal)`);
  return `So far today: ${parts.join("; ")}. That's ${formatKcal(ctx.nutrition.calories.consumed)} of your ${formatKcal(ctx.nutrition.calories.target)} kcal, with ${formatKcal(ctx.nutrition.calories.remaining)} kcal and ${formatGrams(ctx.nutrition.protein.remaining)} protein still remaining.`;
}

function tWater(ctx: CoachContext): string {
  const left = Math.max(0, ctx.water.target - ctx.water.glasses);
  if (left === 0) return `You've hit your ${ctx.water.target}-glass hydration target for today — nicely done.`;
  return `You've logged ${ctx.water.glasses} of your ${ctx.water.target} glasses today, so ${left} more would complete your target.`;
}

function tProgress(ctx: CoachContext): string {
  const n = ctx.nutrition;
  return `Today you're at ${n.calories.pct}% of your calorie target, ${n.protein.pct}% protein and ${n.fiber.pct}% fiber, with ${ctx.water.glasses}/${ctx.water.target} glasses of water.`;
}

// ---------- intent handlers ----------

async function respondNextMeal(env: HandlerEnv): Promise<CoachReply> {
  const { ctx, message } = env;
  const slot = ctx.mealSlot;
  const eng = await engineForSlot(env, slot, []);
  const evidence = eng.evidence.map(toEvidenceRef);
  if (!eng.selected) {
    return {
      v: 2,
      intent: "next_meal",
      text: "I couldn't generate a safe candidate with your current filters (diet, allergies, condition constraints). Try widening a profile setting and ask again.",
      engineSource: "deterministic_fallback",
      cards: [],
      confidence: "low",
    };
  }
  const card = candidateToRecCard(eng.selected, slot, eng.keyFactors);
  const allowed = allowedFromCards([card], new Set(ctx._allowedNumbers));
  const n = card.nutrition;
  const ask = `In 2-3 sentences, explain why "${eng.selected.name}" (~${Math.round(n.calories)} kcal, ${Math.round(n.protein)} g protein, ${Math.round(n.fiber)} g fiber) fits the user's remaining nutrition for ${slot}. Reference their remaining numbers, conditions and preference. Do NOT invent other numbers.`;
  const ai = await phrase({ ctx, question: message, ask });
  const text =
    ai && textNumbersAllowed(ai, allowed)
      ? ai
      : `For ${slot}, ${eng.selected.name} could fit your remaining nutrition — about ${formatKcal(n.calories)} kcal with ${formatGrams(n.protein)} protein and ${formatGrams(n.fiber)} fiber, matching your ${ctx.diet.type} preference${ctx.healthConditions.length ? ` and checked against your ${ctx.healthConditions.join("/")} constraints` : ""}.`;
  return {
    v: 2,
    intent: "next_meal",
    text,
    engineSource: ai ? "ai" : eng.source,
    cards: [card, ...(evidence.length ? [{ kind: "evidence" as const, items: evidence.slice(0, 2) }] : [])],
    confidence: ai ? "high" : "moderate",
  };
}

async function respondPlan(env: HandlerEnv, scope: "rest" | "full"): Promise<CoachReply> {
  const { ctx, message } = env;
  const statuses = daySlotStatuses(ctx);
  const slots: CoachPlanSlot[] = [];
  const virtual: { mealType: string; name: string; totals: NutritionValues }[] = [];
  const evidence: CoachEvidenceRef[] = [];
  let source: "ai" | "deterministic_fallback" = "deterministic_fallback";

  for (const s of statuses) {
    if (s.logged) {
      const m = ctx.meals.filter((x) => x.mealType === s.slot);
      const kcal = m.reduce((sum, x) => sum + x.kcal, 0);
      slots.push({ slot: s.slot, time: slotTime(s.slot), status: "logged", name: m.map((x) => x.name).join(" + ") || "Logged", kcal: Math.round(kcal) });
      continue;
    }
    if (scope === "rest" && s.passed) {
      slots.push({ slot: s.slot, time: slotTime(s.slot), status: "skipped" });
      continue;
    }
    const eng = await engineForSlot(env, s.slot, virtual);
    if (!eng.selected) {
      slots.push({ slot: s.slot, time: slotTime(s.slot), status: "skipped" });
      continue;
    }
    if (source !== "ai") source = eng.source;
    virtual.push({ mealType: s.slot, name: eng.selected.name, totals: eng.selected.nutrition });
    if (evidence.length < 2) for (const e of eng.evidence.slice(0, 1)) evidence.push(toEvidenceRef(e));
    slots.push({
      slot: s.slot,
      time: slotTime(s.slot),
      status: "recommended",
      name: eng.selected.name,
      candidateId: eng.selected.id,
      items: eng.selected.items.map((i) => ({ foodId: i.foodId, name: i.name, quantity: i.quantity, unit: i.unit })),
      nutrition: {
        calories: round(eng.selected.nutrition.calories, 0),
        protein: round(eng.selected.nutrition.protein, 0),
        carbohydrates: round(eng.selected.nutrition.carbohydrates, 0),
        fat: round(eng.selected.nutrition.fat, 0),
        fiber: round(eng.selected.nutrition.fiber, 0),
        sugar: round(eng.selected.nutrition.sugar, 0),
        sodium: round(eng.selected.nutrition.sodium, 0),
        potassium: round(eng.selected.nutrition.potassium, 0),
        phosphorus: round(eng.selected.nutrition.phosphorus, 0),
        cholesterol: round(eng.selected.nutrition.cholesterol, 0),
        saturatedFat: round(eng.selected.nutrition.saturatedFat, 0),
      },
      why: eng.keyFactors.slice(0, 3),
    });
  }

  const planned = sumNutrition(virtual.map((v) => v.totals));
  const projected = {
    calories: Math.round(ctx.nutrition.calories.consumed + planned.calories),
    protein: Math.round(ctx.nutrition.protein.consumed + planned.protein),
    fiber: Math.round(ctx.nutrition.fiber.consumed + planned.fiber),
  };

  const card: CoachPlanCard = {
    kind: "plan",
    scope,
    slots,
    summary:
      scope === "rest"
        ? `Remaining slots planned around the ${formatKcal(ctx.nutrition.calories.remaining)} kcal you still have available.`
        : "Your full day at a glance — logged meals plus checked recommendations.",
    projected,
  };

  const recommended = slots.filter((s) => s.status === "recommended");
  const ask = recommended.length
    ? `Summarize the plan in 2-3 sentences: for ${recommended.map((r) => r.slot).join(" and ")} suggest ${recommended.map((r) => `${r.name} (~${r.nutrition?.calories} kcal)`).join(" and ")}. Mention the projected day total (${projected.calories} kcal vs ${ctx.nutrition.calories.target} target) and one condition/preference reason. No new numbers.`
    : "Say warmly that every remaining slot today is already planned or logged, in 1-2 sentences. No new numbers.";

  const allowed = allowedFromCards([card], new Set(ctx._allowedNumbers));
  const ai = await phrase({ ctx, question: message, ask });
  const text =
    ai && textNumbersAllowed(ai, allowed)
      ? ai
      : scope === "rest"
        ? `Here's the rest of your day: ${recommended.map((r) => `${cap(r.slot)} — ${r.name}`).join(", ") || "everything is already covered"}. ${card.summary}`
        : `Your full day: ${slots.map((s) => `${cap(s.slot)} ${s.status === "logged" ? "logged" : s.status === "recommended" ? `→ ${s.name}` : "—"}`).join("; ")}. Projected total ${formatKcal(projected.calories)} kcal against your ${formatKcal(ctx.nutrition.calories.target)} target.`;

  return {
    v: 2,
    intent: scope === "rest" ? "plan_rest_of_day" : "daily_plan",
    text,
    engineSource: ai ? "ai" : source,
    cards: [card, ...(evidence.length ? [{ kind: "evidence" as const, items: evidence.slice(0, 2) }] : [])],
    confidence: ai ? "high" : "moderate",
  };
}

async function respondSwap(env: HandlerEnv): Promise<CoachReply> {
  const { ctx, message } = env;
  const swapSlot = env.slot ?? ctx.mealSlot;
  const eng = await engineForSlot(env, swapSlot, []);
  if (!eng.selected) {
    return {
      v: 2,
      intent: "meal_swap",
      text: `I couldn't find another ${swapSlot} option that passes your diet, allergen and condition filters right now. Everything you've logged stays saved — try again a bit later.`,
      engineSource: "deterministic_fallback",
      cards: [],
      confidence: "low",
    };
  }
  const card = candidateToRecCard(eng.selected, swapSlot, eng.keyFactors);
  const allowed = allowedFromCards([card], new Set(ctx._allowedNumbers));
  const ai = await phrase({
    ctx,
    question: message,
    ask: `Offer "${eng.selected.name}" (~${Math.round(card.nutrition.calories)} kcal, ${Math.round(card.nutrition.protein)} g protein) as an alternative ${swapSlot}. One short sentence plus one reason tied to their remaining nutrition. No new numbers.`,
  });
  const text =
    ai && textNumbersAllowed(ai, allowed)
      ? ai
      : `Sure — here's a different ${swapSlot} option: ${eng.selected.name}, about ${formatKcal(card.nutrition.calories)} kcal with ${formatGrams(card.nutrition.protein)} protein and ${formatGrams(card.nutrition.fiber)} fiber.`;
  return {
    v: 2,
    intent: "meal_swap",
    text,
    engineSource: ai ? "ai" : eng.source,
    cards: [card],
    confidence: ai ? "high" : "moderate",
  };
}

function gapItems(ctx: CoachContext): CoachGapCard["items"] {
  const n = ctx.nutrition;
  const items: CoachGapCard["items"] = [];
  if (n.protein.remaining >= Math.max(15, n.protein.target * 0.25))
    items.push({ label: "Protein", detail: `${formatGrams(n.protein.remaining)} still remaining of your ${formatGrams(n.protein.target)} target`, pct: n.protein.pct });
  if (n.fiber.remaining >= Math.max(8, n.fiber.target * 0.3))
    items.push({ label: "Fiber", detail: `${formatGrams(n.fiber.remaining)} below your configured ${formatGrams(n.fiber.target)} target`, pct: n.fiber.pct });
  if (ctx.water.glasses < 6)
    items.push({ label: "Water", detail: `${ctx.water.target - ctx.water.glasses} glass(es) left to reach your ${ctx.water.target}-glass target`, pct: Math.round((ctx.water.glasses / ctx.water.target) * 100) });
  if (n.calories.pct >= 100)
    items.push({ label: "Calories", detail: `You've reached ${formatKcal(n.calories.target)} kcal — keep anything further light`, pct: n.calories.pct });
  if ((ctx.healthConditions.includes("CKD") || ctx.healthConditions.includes("CVD")) && n.sodium.pct >= 80)
    items.push({ label: "Sodium", detail: `${formatMg(n.sodium.consumed)} of your ${formatMg(n.sodium.target)} limit — higher than ideal for your profile`, pct: n.sodium.pct });
  if (n.sugar.pct >= 80)
    items.push({ label: "Sugar", detail: `${formatGrams(n.sugar.consumed)} of ${formatGrams(n.sugar.target)} — close to your configured ceiling`, pct: n.sugar.pct });
  if (ctx.healthConditions.includes("CVD") && n.saturatedFat.pct >= 80)
    items.push({ label: "Saturated fat", detail: `${formatGrams(n.saturatedFat.consumed)} of ${formatGrams(n.saturatedFat.target)} — near your configured limit`, pct: n.saturatedFat.pct });
  if (n.calories.pct < 60)
    items.push({ label: "Calories", detail: `${formatKcal(n.calories.remaining)} kcal remaining — well below your target so far`, pct: n.calories.pct });
  return items.slice(0, 5);
}

async function respondGaps(env: HandlerEnv): Promise<CoachReply> {
  const { ctx, message } = env;
  const items = gapItems(ctx);
  const card: CoachGapCard = { kind: "gaps", items };
  const text0 = items.length
    ? `Based on your verified numbers: ${items.map((i) => i.label.toLowerCase()).join(", ")} still have room compared with your configured targets. Small, preference-fitting choices can close them.`
    : "Your day lines up well with your configured targets so far — protein, fiber, hydration and limits are all in range. Nothing stands out as a gap right now.";
  const evidence = await retrieveEvidence(`fiber protein hydration ${ctx.healthConditions.join(" ")}`, 2, [
    ...ctx.healthConditions.map((c) => c.toLowerCase()),
    ctx.diet.type.replace("_", " "),
  ]);
  const evCard: CoachEvidenceCard = { kind: "evidence", items: evidence.chunks.map(toEvidenceRef) };
  const ai = await phrase({
    ctx,
    question: message,
    ask: items.length
      ? `In 2 sentences, note the remaining items (${items.map((i) => `${i.label}: ${i.detail}`).join("; ")}) and one gentle food-direction suggestion matching their diet. No new numbers.`
      : "In 1-2 sentences, affirm their day is tracking well against targets. No new numbers.",
  });
  return {
    v: 2,
    intent: "nutrition_gap",
    text: ai && textNumbersAllowed(ai, new Set(ctx._allowedNumbers)) ? ai : text0,
    engineSource: ai ? "ai" : "deterministic_fallback",
    cards: [card, ...(evCard.items.length ? [evCard] : [])],
    confidence: ai ? "high" : "moderate",
  };
}

function progressItems(ctx: CoachContext): CoachProgressCard["items"] {
  const n = ctx.nutrition;
  return [
    { label: "Calories", pct: n.calories.pct },
    { label: "Protein", pct: n.protein.pct },
    { label: "Fiber", pct: n.fiber.pct },
    { label: "Water", pct: Math.round((ctx.water.glasses / ctx.water.target) * 100) },
  ];
}

async function respondProgress(env: HandlerEnv): Promise<CoachReply> {
  const { ctx, message } = env;
  const n = ctx.nutrition;
  const items = progressItems(ctx);
  const well: string[] = [];
  const focus: string[] = [];
  if (n.protein.pct >= 70) well.push(`Protein at ${n.protein.pct}% of target`);
  if (n.fiber.pct >= 70) well.push(`Fiber at ${n.fiber.pct}% of target`);
  if (ctx.water.glasses >= 6) well.push(`Hydration ${ctx.water.glasses}/${ctx.water.target} glasses`);
  if (ctx.mealsLogged >= 3) well.push(`${ctx.mealsLogged} meals logged today`);
  if (n.protein.pct < 70) focus.push(`Add ${formatGrams(n.protein.remaining)} protein before the day ends`);
  if (n.fiber.pct < 70) focus.push(`Close the ${formatGrams(n.fiber.remaining)} g fiber gap with vegetables or whole grains`);
  if (ctx.water.glasses < 6) focus.push(`${ctx.water.target - ctx.water.glasses} more glass(es) of water`);
  if (n.sugar.pct >= 80) focus.push("Keep the rest of the day low on added sugar");
  const next = focus[0] ?? "Hold the course — a light, balanced dinner fits what's left";
  const card: CoachProgressCard = {
    kind: "progress",
    items,
    well: well.length ? well : ["You've started — logging is the first win"],
    focus: focus.length ? focus : ["Stay steady through the evening"],
    next,
  };
  const ai = await phrase({
    ctx,
    question: message,
    ask: `In 2-3 sentences summarize today: ${n.calories.pct}% calories, ${n.protein.pct}% protein, ${n.fiber.pct}% fiber, water ${ctx.water.glasses}/${ctx.water.target}. Encourage without judgment; one focus area. No new numbers.`,
  });
  return {
    v: 2,
    intent: "nutrition_progress",
    text: ai && textNumbersAllowed(ai, new Set(ctx._allowedNumbers)) ? ai : tProgress(ctx),
    engineSource: ai ? "ai" : "deterministic_fallback",
    cards: [card],
    confidence: ai ? "high" : "moderate",
  };
}

async function respondToday(env: HandlerEnv): Promise<CoachReply> {
  const { ctx, message } = env;
  const card: CoachHistoryCard = {
    kind: "history",
    title: "Today's food",
    groups: (["breakfast", "lunch", "snack", "dinner"] as const).map((slot) => ({
      label: cap(slot),
      lines: ctx.meals.filter((m) => m.mealType === slot).map((m) => ({ name: m.name, kcal: m.kcal, time: m.time })),
    })),
    totals: [
      { label: "Calories", value: `${formatKcal(ctx.nutrition.calories.consumed)} / ${formatKcal(ctx.nutrition.calories.target)} kcal` },
      { label: "Protein", value: `${formatGrams(ctx.nutrition.protein.consumed)} / ${formatGrams(ctx.nutrition.protein.target)} g` },
      { label: "Carbs", value: `${formatGrams(ctx.nutrition.carbohydrates.consumed)} / ${formatGrams(ctx.nutrition.carbohydrates.target)} g` },
      { label: "Fat", value: `${formatGrams(ctx.nutrition.fat.consumed)} / ${formatGrams(ctx.nutrition.fat.target)} g` },
      { label: "Fiber", value: `${formatGrams(ctx.nutrition.fiber.consumed)} / ${formatGrams(ctx.nutrition.fiber.target)} g` },
      { label: "Water", value: `${ctx.water.glasses} / ${ctx.water.target} glasses` },
    ],
  };
  const ai = await phrase({
    ctx,
    question: message,
    ask: `In 2-3 sentences walk through what they ate today (${ctx.meals.map((m) => `${m.mealType}: ${m.name} (${m.kcal} kcal)`).join("; ") || "nothing logged yet"}) and the running total. Only these numbers.`,
  });
  return {
    v: 2,
    intent: "today_summary",
    text: ai && textNumbersAllowed(ai, new Set(ctx._allowedNumbers)) ? ai : tToday(ctx),
    engineSource: ai ? "ai" : "deterministic_fallback",
    cards: [card],
    confidence: ai ? "high" : "moderate",
  };
}

interface WeekMealRow {
  eatenAt: Date;
  totalCalories: number;
  mealType: string;
  foods: { displayName: string }[];
}

async function fetchWeekMeals(userId: string): Promise<WeekMealRow[]> {
  const start = new Date();
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  return db.meal.findMany({
    where: { userId, eatenAt: { gte: start } },
    select: { eatenAt: true, totalCalories: true, mealType: true, foods: { select: { displayName: true } } },
    orderBy: { eatenAt: "desc" },
  });
}

function dayLabel(d: Date): string {
  const today = new Date();
  const diff = Math.floor((today.setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return new Date(d).toLocaleDateString([], { weekday: "long" });
}

function hhmm(d: Date): string {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

async function respondHistory(env: HandlerEnv): Promise<CoachReply> {
  const { ctx, message } = env;
  const week = await fetchWeekMeals(env.userId);
  const text = message.toLowerCase();
  const wantsYesterday = /yesterday|ninna|நேற்று|నిన్న|ನಿನ್ನೆ|कल\b/i.test(text);
  const wantsRecent = /most recent|recent (dinner|lunch|breakfast|meal)/i.test(text);
  const wantsFrequency = /how (often|many times|frequently)|usually|repeat|most (often|common|repeated)/i.test(text);

  if (wantsFrequency && week.length) {
    const counts = new Map<string, number>();
    for (const m of week) for (const f of m.foods) counts.set(f.displayName, (counts.get(f.displayName) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    return {
      v: 2,
      intent: "meal_history",
      text: top.length
        ? `Over the last 7 days, your most-logged foods were: ${top.map(([name, count]) => `${name} (${count}×)`).join(", ")}.`
        : "I don't have enough logged meals to answer that yet.",
      engineSource: "deterministic_fallback",
      cards: [
        {
          kind: "history",
          title: "Most-logged this week",
          groups: [{ label: "Food frequency", lines: top.map(([name, count]) => ({ name, kcal: count, time: `${count}× this week` })) }],
        },
      ],
      confidence: "moderate",
    };
  }

  if (wantsYesterday) {
    const yStart = new Date();
    yStart.setDate(yStart.getDate() - 1);
    yStart.setHours(0, 0, 0, 0);
    const yEnd = new Date(yStart);
    yEnd.setHours(23, 59, 59, 999);
    const yMeals = week.filter((m) => m.eatenAt >= yStart && m.eatenAt <= yEnd);
    if (!yMeals.length) {
      return {
        v: 2,
        intent: "meal_history",
        text: "I don't see any meals logged for yesterday — once you log a day, I can walk you through it.",
        engineSource: "deterministic_fallback",
        cards: [],
        confidence: "moderate",
      };
    }
    const kcal = Math.round(yMeals.reduce((s, m) => s + m.totalCalories, 0));
    return {
      v: 2,
      intent: "meal_history",
      text: `Yesterday you logged ${yMeals.length} meal${yMeals.length === 1 ? "" : "s"} totalling about ${formatKcal(kcal)} kcal.`,
      engineSource: "deterministic_fallback",
      cards: [
        {
          kind: "history",
          title: "Yesterday's food",
          groups: (["breakfast", "lunch", "snack", "dinner"] as const).map((slot) => ({
            label: cap(slot),
            lines: yMeals
              .filter((m) => m.mealType === slot)
              .map((m) => ({ name: m.foods.map((f) => f.displayName).join(" + "), kcal: Math.round(m.totalCalories), time: hhmm(m.eatenAt) })),
          })),
        },
      ],
      confidence: "moderate",
    };
  }

  if (wantsRecent) {
    const latest = week[0];
    if (!latest) {
      return { v: 2, intent: "meal_history", text: "I don't have enough logged meals to answer that yet.", engineSource: "deterministic_fallback", cards: [], confidence: "low" };
    }
    return {
      v: 2,
      intent: "meal_history",
      text: `Your most recent meal was ${latest.foods.map((f) => f.displayName).join(" + ")} (${Math.round(latest.totalCalories)} kcal, ${dayLabel(latest.eatenAt)} ${hhmm(latest.eatenAt)}).`,
      engineSource: "deterministic_fallback",
      cards: [],
      confidence: "moderate",
    };
  }

  // default: last few days grouped per day
  const byDay = new Map<string, WeekMealRow[]>();
  for (const m of week) {
    const key = m.eatenAt.toISOString().slice(0, 10);
    byDay.set(key, [...(byDay.get(key) ?? []), m]);
  }
  const groups = [...byDay.entries()].slice(0, 4).map(([, meals]) => ({
    label: `${dayLabel(meals[0].eatenAt)} · ${Math.round(meals.reduce((s, m) => s + m.totalCalories, 0))} kcal`,
    lines: meals.map((m) => ({ name: m.foods.map((f) => f.displayName).join(" + "), kcal: Math.round(m.totalCalories), time: hhmm(m.eatenAt) })),
  }));
  return {
    v: 2,
    intent: "meal_history",
    text: week.length
      ? `Here's your recent meal history — ${ctx.week.daysLogged} days logged this week, averaging ${formatKcal(ctx.week.avgCalories)} kcal.`
      : "I don't have enough logged meals to answer that yet.",
    engineSource: "deterministic_fallback",
    cards: [{ kind: "history", title: "Recent meals", groups }],
    confidence: "moderate",
  };
}

async function respondWeekly(env: HandlerEnv): Promise<CoachReply> {
  const { ctx, message } = env;
  const week = await fetchWeekMeals(env.userId);
  const byDay = new Map<string, number>();
  for (const m of week) {
    const key = m.eatenAt.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + m.totalCalories);
  }
  const card: CoachHistoryCard = {
    kind: "history",
    title: "Your week at a glance",
    groups: [...byDay.entries()].slice(0, 7).map(([key, kcal]) => ({
      label: `${dayLabel(new Date(`${key}T12:00:00`))} · ${Math.round(kcal)} kcal`,
      lines: week
        .filter((m) => m.eatenAt.toISOString().slice(0, 10) === key)
        .map((m) => ({ name: m.foods.map((f) => f.displayName).join(" + "), kcal: Math.round(m.totalCalories), time: hhmm(m.eatenAt) })),
    })),
    totals: [
      { label: "Days logged", value: `${ctx.week.daysLogged} of 7` },
      { label: "Avg calories", value: `${formatKcal(ctx.week.avgCalories)} kcal / day` },
      { label: "Logging streak", value: `${ctx.week.streak} day${ctx.week.streak === 1 ? "" : "s"}` },
      ...(ctx.week.topRepeat ? [{ label: "Most repeated", value: `${ctx.week.topRepeat.name} (${ctx.week.topRepeat.count}×)` }] : []),
    ],
  };
  const targetPct = ctx.nutrition.calories.target > 0 ? Math.round((ctx.week.avgCalories / ctx.nutrition.calories.target) * 100) : 0;
  const ai = await phrase({
    ctx,
    question: message,
    ask: `In 2-3 sentences review the week: ${ctx.week.daysLogged}/7 days logged, average ${ctx.week.avgCalories} kcal/day vs ${ctx.nutrition.calories.target} target (~${targetPct}%), streak ${ctx.week.streak}. Supportive, specific, no new numbers.`,
  });
  return {
    v: 2,
    intent: "weekly_review",
    text: ai && textNumbersAllowed(ai, new Set(ctx._allowedNumbers))
      ? ai
      : `This week you logged ${ctx.week.daysLogged} of 7 days, averaging ${formatKcal(ctx.week.avgCalories)} kcal against your ${formatKcal(ctx.nutrition.calories.target)} target (${targetPct}%), with a ${ctx.week.streak}-day logging streak.`,
    engineSource: ai ? "ai" : "deterministic_fallback",
    cards: [card],
    confidence: ai ? "high" : "moderate",
  };
}

async function respondWater(env: HandlerEnv): Promise<CoachReply> {
  const { ctx, message } = env;
  const card: CoachWaterCard = { kind: "water", glasses: ctx.water.glasses, target: ctx.water.target };
  const ai = await phrase({
    ctx,
    question: message,
    ask: `One or two sentences on hydration: ${ctx.water.glasses} of ${ctx.water.target} glasses logged. No new numbers.`,
  });
  return {
    v: 2,
    intent: "water_status",
    text: ai && textNumbersAllowed(ai, new Set(ctx._allowedNumbers)) ? ai : tWater(ctx),
    engineSource: ai ? "ai" : "deterministic_fallback",
    cards: [card],
    confidence: ai ? "high" : "moderate",
  };
}

async function respondExplainRec(env: HandlerEnv): Promise<CoachReply> {
  const { ctx, message } = env;
  const last = ctx.recentRecommendations[0];
  const n = ctx.nutrition;
  const evidence = await retrieveEvidence(`${ctx.healthConditions.join(" ")} protein fiber ${ctx.diet.type}`, 2, [
    ...ctx.healthConditions.map((c) => c.toLowerCase()),
    ctx.diet.type.replace("_", " "),
  ]);
  const evCard: CoachEvidenceCard = { kind: "evidence", items: evidence.chunks.map(toEvidenceRef) };
  const base = last
    ? `Your latest recommendation was ${last}. It was chosen against your remaining nutrition (${formatGrams(n.protein.remaining)} protein and ${formatGrams(n.fiber.remaining)} fiber still left today), your ${ctx.diet.type} preference${ctx.healthConditions.length ? `, and your ${ctx.healthConditions.join("/")} constraints` : ""}.`
    : `I haven't generated a recommendation for you yet — ask "what should I eat next?" and I'll build one from your verified numbers.`;
  const ai = await phrase({
    ctx,
    question: message,
    ask: last
      ? `Explain in 2-3 sentences why "${last}" was recommended, referencing remaining protein (${formatGrams(n.protein.remaining)}) and fiber (${formatGrams(n.fiber.remaining)}), their diet and conditions. Only these numbers.`
      : `Say you haven't generated one yet and invite them to ask for a recommendation. One sentence.`,
  });
  return {
    v: 2,
    intent: "recommendation_explanation",
    text: ai && textNumbersAllowed(ai, new Set(ctx._allowedNumbers)) ? ai : base,
    engineSource: ai ? "ai" : "deterministic_fallback",
    cards: evCard.items.length ? [evCard] : [],
    confidence: ai ? "high" : "moderate",
  };
}

async function respondGeneral(env: HandlerEnv): Promise<CoachReply> {
  const { ctx, message } = env;
  const evidence = await retrieveEvidence(message, 2, [...ctx.healthConditions.map((c) => c.toLowerCase()), ctx.diet.type.replace("_", " ")]);
  const evCard: CoachEvidenceCard = { kind: "evidence", items: evidence.chunks.map(toEvidenceRef) };
  const n = ctx.nutrition;
  const ai = await phrase({
    ctx,
    question: message,
    ask: `Answer the user's food/nutrition question using the verified data. You may reference today's state (calories ${n.calories.consumed}/${n.calories.target}, protein ${n.protein.consumed}/${n.protein.target}, fiber ${n.fiber.consumed}/${n.fiber.target}, water ${ctx.water.glasses}/${ctx.water.target}) — no other numbers. If off-topic, gently steer back to food and nutrition.`,
    maxWords: 110,
  });
  if (ai) {
    return {
      v: 2,
      intent: "general_nutrition_question",
      text: ai,
      engineSource: "ai",
      cards: evCard.items.length ? [evCard] : [],
      confidence: "moderate",
    };
  }
  return {
    v: 2,
    intent: "general_nutrition_question",
    text: `${tToday(ctx)} ${tWater(ctx)} Your nutrition data is available; personalized coaching is temporarily unavailable for free-form questions, so here's your verified snapshot.`,
    engineSource: "deterministic_fallback",
    cards: [],
    confidence: "low",
  };
}

// ---------- main entry ----------

export async function buildCoachReply(input: {
  userId: string;
  userName: string;
  message: string;
  excludeIds?: string[];
  slot?: string;
  intentOverride?: CoachIntent | null;
}): Promise<{ reply: CoachReply; ctx: CoachContext }> {
  const ctx = await getCoachContext(input.userId, input.userName);
  const env: HandlerEnv = {
    ctx,
    userId: input.userId,
    message: input.message,
    excludeIds: input.excludeIds ?? [],
    slot: input.slot,
  };
  const intent = input.intentOverride ?? classifyIntent(input.message) ?? "general_nutrition_question";

  switch (intent) {
    case "next_meal":
      return { reply: await respondNextMeal(env), ctx };
    case "plan_rest_of_day":
      return { reply: await respondPlan(env, "rest"), ctx };
    case "daily_plan":
      return { reply: await respondPlan(env, "full"), ctx };
    case "meal_swap":
      return { reply: await respondSwap(env), ctx };
    case "nutrition_gap":
      return { reply: await respondGaps(env), ctx };
    case "nutrition_progress":
      return { reply: await respondProgress(env), ctx };
    case "today_summary":
      return { reply: await respondToday(env), ctx };
    case "meal_history":
      return { reply: await respondHistory(env), ctx };
    case "weekly_review":
      return { reply: await respondWeekly(env), ctx };
    case "water_status":
      return { reply: await respondWater(env), ctx };
    case "recommendation_explanation":
      return { reply: await respondExplainRec(env), ctx };
    case "general_nutrition_question":
    case "unknown":
    default:
      return { reply: await respondGeneral(env), ctx };
  }
}
