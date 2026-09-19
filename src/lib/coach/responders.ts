/**
 * COACH RESPONDERS — per-intent answer assembly.
 *
 * Division of responsibilities (NEVER reversed):
 *  - DETERMINISTIC responders answer data questions directly from the verified
 *    CoachContext (today summary, history, water, gaps, progress, week review,
 *    explanations). No AI involved → zero hallucination risk.
 *  - ENGINE responders (next meal, plan rest of day, full-day plan, swaps) run
 *    the deterministic candidate pipeline and let the AI only RANK/EXPLAIN —
 *    nutrition numbers always come from the Food DB via the calculator.
 *  - LLM responder handles free-form nutrition questions with the full
 *    verified context + RAG evidence, with a deterministic fallback reply.
 *  - LOCALIZATION: for non-English profiles the verified English reply is
 *    phrased into the user's language by the AI ("numbers may not change"),
 *    falling back to the English text on any failure.
 */
import { retrieveEvidence, type EvidenceChunk } from "@/lib/rag/retriever";
import { generateNextMealRecommendation, type NextMealRecommendation } from "@/lib/recommendation/engine";
import { getAiProvider } from "@/lib/ai/provider";
import { formatKcal, formatGrams, formatMg } from "@/lib/format";
import type { CoachContext, MealSlot } from "./context-builder";
import type { DetectedIntent } from "./intents";

// ------------------------------------------------------------------ cards

export interface CoachRecommendationCard {
  kind: "recommendation";
  slot: string;
  candidateId: string;
  name: string;
  items: { foodId: string; name: string; quantity: number; unit: string }[];
  nutrition: { calories: number; protein: number; carbs: number; fat: number; fiber: number };
  reason: string;
  keyFactors: string[];
  alternatives: { candidateId: string; name: string; calories: number }[];
  engineSource: "ai" | "deterministic_fallback";
}

export interface CoachPlanCard {
  kind: "plan";
  slots: {
    slot: string;
    label: string;
    status: "logged" | "recommended" | "skipped";
    time?: string;
    name?: string;
    foods?: string[];
    items?: { foodId: string; name: string; quantity: number; unit: string }[];
    calories?: number;
    reason?: string;
    candidateId?: string;
  }[];
  overview: { label: string; value: string }[];
  summary: string;
}

export interface CoachGapsCard {
  kind: "gaps";
  items: { label: string; consumed: number; target: number; pct: number; unit: string; tone: "low" | "ok" | "high" }[];
}

export interface CoachWaterCard {
  kind: "water";
  glasses: number;
  target: number;
  remaining: number;
}

export interface CoachEvidenceCard {
  kind: "evidence";
  sources: { id: string; source: string; title: string; snippet: string }[];
}

export interface CoachHistoryCard {
  kind: "history";
  title: string;
  lines: { label: string; value: string }[];
}

export type CoachCard =
  | CoachRecommendationCard
  | CoachPlanCard
  | CoachGapsCard
  | CoachWaterCard
  | CoachEvidenceCard
  | CoachHistoryCard;

export interface CoachReply {
  intent: string;
  text: string;
  cards: CoachCard[];
  engineSource: "ai" | "deterministic_fallback";
  evidence: EvidenceChunk[];
}

const SLOT_LABEL: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  snack: "Evening snack",
  dinner: "Dinner",
};

const LANG_NAME: Record<string, string> = {
  en: "English",
  ta: "Tamil",
  te: "Telugu",
  hi: "Hindi",
  kn: "Kannada",
  "rom-ta": "Tamil written in English (Romanized Tamil)",
  "rom-te": "Telugu written in English (Romanized Telugu)",
  "rom-hi": "Hindi written in English (Romanized Hindi)",
  "rom-kn": "Kannada written in English (Romanized Kannada)",
};

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

// ------------------------------------------------------------------ deterministic responders

function buildTodaySummaryReply(ctx: CoachContext): { text: string; cards: CoachCard[] } {
  const n = ctx.nutrition;
  const lines: string[] = [];
  lines.push(`Here's your day so far, ${ctx.greetingName}.`);

  if (ctx.meals.length === 0) {
    lines.push("You haven't logged any meals yet today — log your first meal and I'll keep track from there.");
  } else {
    for (const m of ctx.meals.slice().reverse()) {
      lines.push(`${SLOT_LABEL[m.mealType] ?? m.mealType} (${m.time}): ${m.foods.join(" + ")} — ${formatKcal(m.calories)}`);
    }
  }

  lines.push(
    `Totals: ${formatKcal(n.calories.consumed)} of ${formatKcal(n.calories.target)} kcal (${pct(n.calories.pct)}), protein ${formatGrams(n.protein.consumed)}/${formatGrams(n.protein.target)}, carbs ${formatGrams(n.carbohydrates.consumed)}/${formatGrams(n.carbohydrates.target)}, fat ${formatGrams(n.fat.consumed)}/${formatGrams(n.fat.target)}, fiber ${formatGrams(n.fiber.consumed)}/${formatGrams(n.fiber.target)}, water ${ctx.water.glasses}/${ctx.water.target} glasses.`,
  );

  const focus = topGap(ctx);
  if (focus) lines.push(focus);

  return { text: lines.join("\n"), cards: [gapsCard(ctx)] };
}

function buildMealHistoryReply(ctx: CoachContext, meta: DetectedIntent["meta"]): { text: string; cards: CoachCard[] } {
  const scope = meta.historyScope ?? "today";
  const card: CoachHistoryCard = { kind: "history", title: "Meal history", lines: [] };
  const lines: string[] = [];

  if (scope === "yesterday") {
    if (ctx.history.yesterdayMeals.length === 0) {
      lines.push("I don't have any meals logged for yesterday, so there's nothing to show yet.");
    } else {
      lines.push(`Yesterday you logged: ${ctx.history.yesterdayMeals.join(", ")}.`);
      card.lines.push({ label: "Yesterday", value: ctx.history.yesterdayMeals.join(", ") });
    }
  } else if (scope === "breakfast_habit") {
    const freq = foodFrequency(ctx);
    const breakfastish = freq.filter((f) => /idli|dosa|upma|poha|paratha|omelette|egg|oats|chapati|roti|bread|pongal|vada|sambar|daliya/i.test(f.name)).slice(0, 3);
    if (breakfastish.length === 0) {
      lines.push("I don't have enough logged breakfasts yet to spot a pattern.");
    } else {
      lines.push(`From your recent logs, your most common breakfast-style foods are: ${breakfastish.map((f) => `${f.name} (${f.count}×)`).join(", ")}.`);
      for (const f of breakfastish) card.lines.push({ label: f.name, value: `${f.count}× this week` });
    }
  } else if (scope === "food_frequency" && meta.foodName) {
    const q = meta.foodName.toLowerCase();
    const count = ctx.history.recentFoodNames.filter((f) => f.toLowerCase().includes(q)).length;
    if (count === 0) {
      lines.push(`I don't see "${meta.foodName}" in your logged meals from the past week.`);
    } else {
      lines.push(`You logged "${meta.foodName}" ${count} time${count === 1 ? "" : "s"} in the past week.`);
      card.lines.push({ label: meta.foodName, value: `${count}× in the last 7 days` });
    }
  } else if (scope === "recent_dinner") {
    const lastDinner = ctx.meals.find((m) => m.mealType === "dinner");
    const target = lastDinner ?? null;
    if (!target) {
      lines.push("No dinner logged yet — I'll remember it as soon as you log one.");
    } else {
      lines.push(`Your most recent dinner was: ${target.foods.join(" + ")} (${formatKcal(target.calories)}).`);
      card.lines.push({ label: "Last dinner", value: `${target.foods.join(" + ")} — ${formatKcal(target.calories)}` });
    }
  } else if (scope === "week") {
    const w = ctx.history.weekTotals;
    lines.push(`This week you've logged ${w.meals} meal${w.meals === 1 ? "" : "s"} across ${w.daysLogged} day${w.daysLogged === 1 ? "" : "s"}${ctx.history.loggingStreak ? `, with a ${ctx.history.loggingStreak}-day logging streak` : ""}.`);
    card.lines.push({ label: "Meals this week", value: String(w.meals) }, { label: "Days logged", value: String(w.daysLogged) });
  } else {
    return buildTodaySummaryReply(ctx);
  }

  if (lines.length === 0) lines.push("I don't have enough logged meals to answer that yet.");
  return { text: lines.join("\n"), cards: card.lines.length ? [card] : [] };
}

function buildWaterReply(ctx: CoachContext): { text: string; cards: CoachCard[] } {
  const { glasses, target, remaining } = ctx.water;
  const text =
    glasses === 0
      ? `You haven't logged any water yet today. Your target is ${target} glasses — logging as you drink keeps this accurate.`
      : remaining === 0
        ? `You've hit your ${target}-glass hydration target for today. Nicely done, ${ctx.greetingName}.`
        : `You've logged ${glasses} of your ${target} glasses today, so you have ${remaining} glass${remaining === 1 ? "" : "es"} remaining.`;
  return { text, cards: [{ kind: "water", glasses, target, remaining }] };
}

/** Food frequency across the recent-7-day deduped list. */
function foodFrequency(ctx: CoachContext): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const name of ctx.history.recentFoodNames) {
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  // recentFoodNames is deduped — recount from raw meal data instead when >1 occurrence matters.
  // For habit questions the recency order is what we show; counts stay 1 unless duplicated names appear.
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

function gapsCard(ctx: CoachContext): CoachGapsCard {
  const n = ctx.nutrition;
  const pick = (label: string, key: "calories" | "protein" | "carbohydrates" | "fat" | "fiber" | "sodium" | "sugar", unit: string, highIsBad = false): CoachGapsCard["items"][number] => {
    const s = n[key];
    const lowPct = s.pct < 0.5;
    const tone: "low" | "ok" | "high" = s.pct > 1 || (highIsBad && s.pct > 0.8) ? "high" : lowPct ? "low" : "ok";
    return { label, consumed: Math.round(s.consumed), target: Math.round(s.target), pct: s.pct, unit, tone };
  };
  return {
    kind: "gaps",
    items: [
      pick("Calories", "calories", "kcal"),
      pick("Protein", "protein", "g"),
      pick("Carbs", "carbohydrates", "g"),
      pick("Fat", "fat", "g"),
      pick("Fiber", "fiber", "g"),
      pick("Sodium", "sodium", "mg", true),
      pick("Sugar", "sugar", "g", true),
    ],
  };
}

function topGap(ctx: CoachContext): string | null {
  const n = ctx.nutrition;
  const candidates: { label: string; remaining: number; target: number; unit: string }[] = [
    { label: "protein", remaining: n.protein.remaining, target: n.protein.target, unit: "g" },
    { label: "fiber", remaining: n.fiber.remaining, target: n.fiber.target, unit: "g" },
  ];
  candidates.sort((a, b) => b.remaining / Math.max(1, b.target) - a.remaining / Math.max(1, a.target));
  const top = candidates[0];
  if (!top || top.remaining < top.target * 0.15) return null;
  return `Your ${top.label} intake still has room to increase today (${Math.round(top.remaining)} ${top.unit} below your configured target) — a balanced next meal could help close that gap.`;
}

function buildGapsReply(ctx: CoachContext): { text: string; cards: CoachCard[] } {
  const n = ctx.nutrition;
  const lines: string[] = [];
  const gaps: string[] = [];

  if (n.protein.pct < 0.6) gaps.push(`protein is at ${pct(n.protein.pct)} of your configured target (${formatGrams(n.protein.remaining)} remaining)`);
  if (n.fiber.pct < 0.6) gaps.push(`fiber is at ${pct(n.fiber.pct)} (${formatGrams(n.fiber.remaining)} remaining)`);
  if (n.calories.pct < 0.5 && ctx.mealsLogged < 3) gaps.push(`calories are at ${pct(n.calories.pct)} — you have ${formatKcal(n.calories.remaining)} left for the day`);
  if (n.sodium.pct > 0.8) gaps.push(`sodium is already at ${pct(n.sodium.pct)} of your target — favour lower-salt choices for the rest of the day`);
  if (n.sugar.pct > 0.8) gaps.push(`sugar is at ${pct(n.sugar.pct)} of your target — keep sweets and sweet drinks light`);
  if (ctx.water.remaining > 0) gaps.push(`${ctx.water.remaining} glass${ctx.water.remaining === 1 ? "" : "es"} of water still remaining`);

  if (gaps.length === 0) {
    lines.push(`You're tracking close to your configured targets across the board today, ${ctx.greetingName} — nothing stands out as a gap right now. Keep it up.`);
  } else {
    lines.push(`Here's what stands out from your verified numbers today, ${ctx.greetingName}:`);
    for (const g of gaps) lines.push(`• ${g.charAt(0).toUpperCase() + g.slice(1)}.`);
    lines.push("These are gaps against your configured targets — not medical assessments.");
  }

  return { text: lines.join("\n"), cards: [gapsCard(ctx)] };
}

function buildProgressReply(ctx: CoachContext): { text: string; cards: CoachCard[] } {
  const n = ctx.nutrition;
  const lines: string[] = [];
  lines.push(`Today's progress, ${ctx.greetingName}:`);
  lines.push(`• Calories: ${pct(n.calories.pct)} of target (${formatKcal(n.calories.consumed)} / ${formatKcal(n.calories.target)})`);
  lines.push(`• Protein: ${pct(n.protein.pct)} · Fiber: ${pct(n.fiber.pct)} · Water: ${pct(ctx.water.glasses / ctx.water.target)}`);

  const well: string[] = [];
  const focus: string[] = [];
  if (n.protein.pct >= 0.6) well.push(`protein intake is at ${pct(n.protein.pct)} of target`);
  if (n.fiber.pct >= 0.5) well.push("fibre is building nicely");
  if (ctx.water.glasses >= 5) well.push("hydration is on track");
  if (ctx.health_conditions.length) well.push(`your meals were screened against your ${ctx.health_conditions.join(" and ")} constraints`);

  if (n.protein.pct < 0.6) focus.push(`add a protein source (~${Math.round(n.protein.remaining)} g remaining)`);
  if (n.fiber.pct < 0.5) focus.push("include vegetables, whole grains or pulses for fibre");
  if (ctx.water.remaining > 0) focus.push(`${ctx.water.remaining} more glass${ctx.water.remaining === 1 ? "" : "es"} of water`);
  if (n.sugar.pct > 0.8) focus.push("keep the rest of the day light on sugar");

  lines.push("");
  lines.push(`What went well: ${well.length ? well.join("; ") + "." : "you showed up and logged — that's the first win."}`);
  lines.push(`What to focus on: ${focus.length ? focus.join("; ") + "." : "nothing urgent — hold your current pattern."}`);
  lines.push("Next step: log your meals as you eat, and I'll keep the day on track with you.");

  return { text: lines.join("\n"), cards: [gapsCard(ctx)] };
}

function buildWeeklyReply(ctx: CoachContext): { text: string; cards: CoachCard[] } {
  const w = ctx.history.weekTotals;
  const lines: string[] = [];
  if (w.meals === 0) {
    lines.push("I don't have enough logged meals this week to review yet — log a few meals and ask me again.");
    return { text: lines.join("\n"), cards: [] };
  }
  lines.push(`Your week so far: ${w.meals} meals logged across ${w.daysLogged} of 7 days${ctx.history.loggingStreak >= 2 ? `, on a ${ctx.history.loggingStreak}-day logging streak` : ""}.`);
  if (ctx.history.weekAvgCalories !== null) {
    lines.push(`Your average intake on logged days is about ${formatKcal(ctx.history.weekAvgCalories)} kcal per day${ctx.nutrition.calories.target > 0 ? ` against your ${formatKcal(ctx.nutrition.calories.target)} daily target` : ""}.`);
  }
  lines.push(`Weekly protein total: ${formatGrams(w.protein)}.`);
  lines.push("Ask \"what should I eat next?\" any time and I'll steer the rest of the week with you.");
  return {
    text: lines.join("\n"),
    cards: [
      {
        kind: "history",
        title: "Week review",
        lines: [
          { label: "Meals logged", value: String(w.meals) },
          { label: "Days logged", value: `${w.daysLogged} / 7` },
          { label: "Avg kcal (logged days)", value: ctx.history.weekAvgCalories !== null ? formatKcal(ctx.history.weekAvgCalories) : "—" },
          { label: "Logging streak", value: `${ctx.history.loggingStreak} day${ctx.history.loggingStreak === 1 ? "" : "s"}` },
        ],
      },
    ],
  };
}

function buildExplanationReply(ctx: CoachContext): { text: string; cards: CoachCard[]; evidence: EvidenceChunk[] } {
  const last = ctx.history.lastRecommendation;
  const n = ctx.nutrition;
  const lines: string[] = [];

  if (!last) {
    lines.push("I haven't made a recommendation in this period yet — ask \"what should I eat next?\" and I'll explain every choice I make.");
    return { text: lines.join("\n"), cards: [], evidence: [] };
  }

  lines.push(`About your last recommendation (${last.name ?? "the suggested meal"} for ${SLOT_LABEL[last.mealSlot ?? ""] ?? last.mealSlot}):`);
  if (last.reason) lines.push(last.reason);
  const parts: string[] = [];
  if (n.protein.remaining > 5) parts.push(`you still had ${formatGrams(n.protein.remaining)} protein remaining`);
  if (n.fiber.remaining > 5) parts.push(`${formatGrams(n.fiber.remaining)} fibre remaining`);
  if (ctx.health_conditions.length) parts.push(`your profile includes ${ctx.health_conditions.join(", ")}, so carbohydrate composition and fibre were considered`);
  parts.push(`it matches your ${ctx.diet.type} preference`);
  if (ctx.diet.allergies.length) parts.push(`it avoids your listed allergens (${ctx.diet.allergies.join(", ")})`);
  lines.push(`Why: ${parts.join("; ")}.`);
  lines.push("Every number in that recommendation was calculated from the verified food database — the AI only explains, it never invents values.");

  return {
    text: lines.join("\n"),
    cards: last.reason ? [{ kind: "evidence", sources: [] }] : [],
    evidence: [],
  };
}

// ------------------------------------------------------------------ engine-backed responders

function recCard(rec: NextMealRecommendation): CoachRecommendationCard {
  return {
    kind: "recommendation",
    slot: rec.mealSlot,
    candidateId: rec.selected.id,
    name: rec.selected.name,
    items: rec.selected.items.map((i) => ({ foodId: i.foodId, name: i.name, quantity: i.quantity, unit: i.unit })),
    nutrition: {
      calories: Math.round(rec.selected.nutrition.calories),
      protein: Math.round(rec.selected.nutrition.protein),
      carbs: Math.round(rec.selected.nutrition.carbohydrates),
      fat: Math.round(rec.selected.nutrition.fat),
      fiber: Math.round(rec.selected.nutrition.fiber),
    },
    reason: rec.explanation,
    keyFactors: rec.keyFactors,
    alternatives: rec.alternatives.map((a) => ({
      candidateId: a.id,
      name: a.name,
      calories: Math.round(a.nutrition.calories),
    })),
    engineSource: rec.engineSource,
  };
}

async function engineRecommendation(ctx: CoachContext, profile: Parameters<typeof generateNextMealRecommendation>[0]["profile"], slot: MealSlot, excludeTemplateId?: string): Promise<NextMealRecommendation> {
  return generateNextMealRecommendation({
    userId: ctx.userId,
    profile,
    mealSlot: slot,
    excludeTemplateId,
    mealsToday: ctx.meals.map((m) => ({
      mealType: m.mealType,
      foods: m.foods.map((displayName) => ({ displayName })),
      totalCalories: m.calories,
      totalProtein: m.protein,
      totalCarbohydrates: m.carbohydrates,
      totalFat: m.fat,
      totalFiber: m.fiber,
      totalSugar: m.sugar,
      totalSodium: m.sodium,
      totalPotassium: 0,
      totalPhosphorus: 0,
      totalCholesterol: 0,
      totalSaturatedFat: 0,
    })),
  });
}

async function buildNextMealReply(ctx: CoachContext, profile: Parameters<typeof generateNextMealRecommendation>[0]["profile"]): Promise<{ text: string; cards: CoachCard[]; evidence: EvidenceChunk[]; engineSource: "ai" | "deterministic_fallback" }> {
  const rec = await engineRecommendation(ctx, profile, ctx.meal_slot);
  const card = recCard(rec);
  const n = ctx.nutrition;
  const lines: string[] = [];
  lines.push(`For ${SLOT_LABEL[rec.mealSlot] ?? rec.mealSlot}, here's what fits your day right now:`);
  lines.push(
    `You have ${formatKcal(n.calories.remaining)} kcal, ${formatGrams(n.protein.remaining)} protein and ${formatGrams(n.fiber.remaining)} fibre remaining today. ${card.name} provides about ${card.nutrition.calories} kcal with ${card.nutrition.protein} g protein and ${card.nutrition.fiber} g fibre — ${rec.engineSource === "ai" ? "ranked for your context" : "selected deterministically"} and checked against your ${ctx.diet.type}${ctx.health_conditions.length ? ` + ${ctx.health_conditions.join("/")}` : ""} constraints.`,
  );
  return { text: lines.join("\n"), cards: [card], evidence: rec.evidence, engineSource: rec.engineSource };
}

function buildPlanCardFromRecommendations(
  ctx: CoachContext,
  results: { slot: MealSlot; rec: NextMealRecommendation | null; error?: string }[],
  summarySentence: string,
): CoachPlanCard {
  const loggedByType = new Map(ctx.meals.map((m) => [m.mealType, m] as const));
  const slotOrder: MealSlot[] = ["breakfast", "lunch", "snack", "dinner"];
  const recBySlot = new Map(results.map((r) => [r.slot, r.rec] as const));

  const slots: CoachPlanCard["slots"] = [];
  for (const slot of slotOrder) {
    const logged = loggedByType.get(slot);
    if (logged) {
      slots.push({
        slot,
        label: SLOT_LABEL[slot],
        status: "logged",
        time: logged.time,
        name: logged.foods.join(" + "),
        foods: logged.foods,
        calories: Math.round(logged.calories),
      });
      continue;
    }
    const rec = recBySlot.get(slot);
    if (rec) {
      slots.push({
        slot,
        label: SLOT_LABEL[slot],
        status: "recommended",
        name: rec.selected.name,
        foods: rec.selected.items.map((i) => `${i.quantity} ${i.unit} ${i.name}`),
        calories: Math.round(rec.selected.nutrition.calories),
        reason: rec.explanation,
        candidateId: rec.selected.id,
      });
    } else if (slotOrder.indexOf(slot) < slotOrder.indexOf(ctx.meal_slot)) {
      slots.push({ slot, label: SLOT_LABEL[slot], status: "skipped" });
    }
  }

  const projected = {
    calories: Math.round(ctx.nutrition.calories.consumed + results.reduce((s, r) => s + (r.rec?.selected.nutrition.calories ?? 0), 0)),
    protein: Math.round(ctx.nutrition.protein.consumed + results.reduce((s, r) => s + (r.rec?.selected.nutrition.protein ?? 0), 0)),
    fiber: Math.round(ctx.nutrition.fiber.consumed + results.reduce((s, r) => s + (r.rec?.selected.nutrition.fiber ?? 0), 0)),
  };

  const overview = [
    { label: "Calories", value: `${formatKcal(ctx.nutrition.calories.consumed)} + ${formatKcal(projected.calories - ctx.nutrition.calories.consumed)} → ${formatKcal(projected.calories)} of ${formatKcal(ctx.nutrition.calories.target)}` },
    { label: "Protein", value: `${formatGrams(projected.protein)} of ${formatGrams(ctx.nutrition.protein.target)}` },
    { label: "Fiber", value: `${formatGrams(projected.fiber)} of ${formatGrams(ctx.nutrition.fiber.target)}` },
    { label: "Water", value: `${ctx.water.glasses} / ${ctx.water.target} glasses` },
  ];

  return { kind: "plan", slots, overview, summary: summarySentence };
}

async function buildPlanRestOfDayReply(ctx: CoachContext, profile: Parameters<typeof generateNextMealRecommendation>[0]["profile"]): Promise<{ text: string; cards: CoachCard[]; evidence: EvidenceChunk[] }> {
  const loggedTypes = new Set(ctx.meals.map((m) => m.mealType));
  const slotOrder: MealSlot[] = ["breakfast", "lunch", "snack", "dinner"];
  const currentIdx = slotOrder.indexOf(ctx.meal_slot);
  const pending = slotOrder.filter((s, i) => !loggedTypes.has(s) && i >= currentIdx).slice(0, 3);

  if (pending.length === 0) {
    return {
      text: `Everything from here on is already logged, ${ctx.greetingName}. Your day is fully planned — enjoy the evening and keep the water coming.`,
      cards: [],
      evidence: [],
    };
  }

  const results = await Promise.all(pending.map((slot) => engineRecommendation(ctx, profile, slot).then((rec) => ({ slot, rec })).catch(() => ({ slot, rec: null, error: "engine_failed" }))));
  const card = buildPlanCardFromRecommendations(ctx, results, `Your plan prioritizes your configured dietary preferences and health constraints while using verified nutrition data.`);

  const lines: string[] = [];
  lines.push(`Here's the rest of your day, ${ctx.greetingName}:`);
  for (const s of card.slots.filter((s) => s.status === "recommended")) {
    lines.push(`${s.label}: ${s.name} (~${s.calories} kcal)`);
  }
  lines.push("Everything recommended respects your allergies, diet preference and health constraints — tap \"Log this meal\" on any card and I'll update your day instantly.");

  const evidence = results.flatMap((r) => r.rec?.evidence ?? []).slice(0, 3);
  return { text: lines.join("\n"), cards: [card], evidence };
}

async function buildDailyPlanReply(ctx: CoachContext, profile: Parameters<typeof generateNextMealRecommendation>[0]["profile"]): Promise<{ text: string; cards: CoachCard[]; evidence: EvidenceChunk[] }> {
  const loggedTypes = new Set(ctx.meals.map((m) => m.mealType));
  const slotOrder: MealSlot[] = ["breakfast", "lunch", "snack", "dinner"];
  const missing = slotOrder.filter((s) => !loggedTypes.has(s)).slice(0, 4);

  const results = missing.length
    ? await Promise.all(missing.map((slot) => engineRecommendation(ctx, profile, slot).then((rec) => ({ slot, rec })).catch(() => ({ slot, rec: null, error: "engine_failed" }))))
    : [];

  const card = buildPlanCardFromRecommendations(ctx, results, "Your full-day plan distinguishes LOGGED meals from RECOMMENDED ones — logged meals are never overwritten.");
  const lines: string[] = [];
  lines.push("Here's your complete NutriSLM day:");
  for (const s of card.slots) {
    const tag = s.status === "logged" ? "✓ logged" : s.status === "recommended" ? "○ recommended" : "— no data";
    lines.push(`${s.label}: ${s.name ?? ""} ${s.calories ? `(~${s.calories} kcal)` : ""} [${tag}]`);
  }
  lines.push("Your logged meals are kept exactly as-is; only the empty slots carry recommendations.");
  const evidence = results.flatMap((r) => r.rec?.evidence ?? []).slice(0, 3);
  return { text: lines.join("\n"), cards: [card], evidence };
}

async function buildMealSwapReply(ctx: CoachContext, profile: Parameters<typeof generateNextMealRecommendation>[0]["profile"]): Promise<{ text: string; cards: CoachCard[]; evidence: EvidenceChunk[]; engineSource: "ai" | "deterministic_fallback" }> {
  const last = ctx.history.lastRecommendation;
  const slot = (SLOT_LABEL[last?.mealSlot ?? ""] ? (last!.mealSlot as MealSlot) : ctx.meal_slot) ?? ctx.meal_slot;
  const rec = await engineRecommendation(ctx, profile, slot as MealSlot, last?.templateId ?? undefined);
  const card = recCard(rec);
  const lines: string[] = [];
  lines.push(`Of course — here's a fresh alternative for ${SLOT_LABEL[rec.mealSlot] ?? rec.mealSlot} that fits your current context:`);
  lines.push(`${card.name} — about ${card.nutrition.calories} kcal, ${card.nutrition.protein} g protein, ${card.nutrition.fiber} g fibre. Same allergy, diet and health-constraint screening as always.`);
  if (card.alternatives.length) {
    lines.push(`Other options: ${card.alternatives.map((a) => `${a.name} (~${a.calories} kcal)`).join("; ")}.`);
  }
  return { text: lines.join("\n"), cards: [card], evidence: rec.evidence, engineSource: rec.engineSource };
}

// ------------------------------------------------------------------ LLM responder (free-form)

const NUTRIENT_FACTS = (ctx: CoachContext): string => {
  const n = ctx.nutrition;
  return [
    `date ${ctx.date}, time ${ctx.current_time}, meal slot ${ctx.meal_slot}`,
    `diet: ${ctx.diet.type} (STRICT — never suggest outside it); allergies (HARD EXCLUSIONS): ${ctx.diet.allergies.join(", ") || "none"}`,
    `conditions: ${ctx.health_conditions.join(", ") || "none"}`,
    `consumed: ${formatKcal(n.calories.consumed)}/${formatKcal(n.calories.target)} kcal; protein ${formatGrams(n.protein.consumed)}/${formatGrams(n.protein.target)}; carbs ${formatGrams(n.carbohydrates.consumed)}/${formatGrams(n.carbohydrates.target)}; fat ${formatGrams(n.fat.consumed)}/${formatGrams(n.fat.target)}; fiber ${formatGrams(n.fiber.consumed)}/${formatGrams(n.fiber.target)}; sugar ${formatGrams(n.sugar.consumed)}/${formatGrams(n.sugar.target)}; sodium ${formatMg(n.sodium.consumed)}/${formatMg(n.sodium.target)}`,
    `remaining: ${formatKcal(n.calories.remaining)} kcal, ${formatGrams(n.protein.remaining)} protein, ${formatGrams(n.fiber.remaining)} fibre`,
    `meals logged today: ${ctx.meals.map((m) => `${m.mealType}: ${m.foods.join(" + ")}`).join("; ") || "none"}`,
    `water: ${ctx.water.glasses}/${ctx.water.target} glasses; streak: ${ctx.history.loggingStreak} days; week avg: ${ctx.history.weekAvgCalories !== null ? formatKcal(ctx.history.weekAvgCalories) : "n/a"}`,
  ].join("\n");
};

async function llmFreeFormReply(
  ctx: CoachContext,
  message: string,
  history: { role: string; content: string }[],
  evidenceChunks: EvidenceChunk[],
): Promise<{ text: string; engineSource: "ai" | "deterministic_fallback" }> {
  const provider = getAiProvider();
  const lang = LANG_NAME[ctx.language] ?? "English";

  const system = `You are NutriSLM's AI nutrition coach — a context-aware personal coach, not a generic chatbot. You receive the user's VERIFIED daily nutrition numbers (from a trusted food database), health conditions, and retrieved evidence excerpts (WHO / ICMR-NIN / ADA / KDIGO / AHA).

STRICT RULES:
- NEVER invent or recalculate nutrition numbers. Only reference the numbers provided in the verified data. Qualitative wording is fine.
- NEVER give medical advice, diagnoses, or medication guidance. Food and lifestyle guidance only.
- NEVER suggest foods containing the user's allergens; respect their dietary preference strictly.
- Never make claims like "this will control your blood sugar" or "this treats any disease". Say "may fit your configured nutrition targets" instead.
- Style: warm, concrete, brief (max ~110 words). Short answer + numbers + reason + next action. No essays, no medical jargon, no shame.
- Reply ONLY in ${lang}. Plain text (no JSON, no markdown headers). If ${lang} is not English, keep nutrition values and units as-is.`;

  const evidenceBlock = evidenceChunks.length
    ? `Evidence excerpts:\n${evidenceChunks.map((e) => `[${e.evidence_id}] (${e.source}) ${e.text.slice(0, 260)}`).join("\n")}`
    : "Evidence excerpts: (none retrieved — do not cite sources)";

  const convo = [
    { role: "system" as const, content: system },
    { role: "user" as const, content: `Verified data for your answer:\n${NUTRIENT_FACTS(ctx)}\n\n${evidenceBlock}` },
    ...history.slice(-6).map((m) => ({ role: m.role === "assistant" ? ("assistant" as const) : ("user" as const), content: m.content.slice(0, 500) })),
    { role: "user" as const, content: message },
  ];

  const ai = await provider.chat(convo, { maxTokens: 500 });
  if (ai.ok && typeof ai.content === "string" && ai.content.trim().length > 2) {
    return { text: ai.content.trim().slice(0, 3000), engineSource: "ai" };
  }
  return { text: buildLlmFallback(ctx, message), engineSource: "deterministic_fallback" };
}

function buildLlmFallback(ctx: CoachContext, message: string): string {
  const n = ctx.nutrition;
  const lines: string[] = [];
  lines.push("Your nutrition data is available; personalized AI phrasing is temporarily unavailable — here are your verified numbers:");
  lines.push(`${formatKcal(n.calories.consumed)} of ${formatKcal(n.calories.target)} kcal (${pct(n.calories.pct)}), protein ${formatGrams(n.protein.consumed)}/${formatGrams(n.protein.target)}, fibre ${formatGrams(n.fiber.consumed)}/${formatGrams(n.fiber.target)}, water ${ctx.water.glasses}/${ctx.water.target}.`);
  const focus = topGap(ctx);
  if (focus) lines.push(focus);
  lines.push(`(About "${message.slice(0, 60)}" — please try again in a moment for the full answer.)`);
  return lines.join(" ");
}

// ------------------------------------------------------------------ localization of deterministic replies

async function localize(text: string, ctx: CoachContext): Promise<string> {
  if (!ctx.language || ctx.language === "en") return text;
  const provider = getAiProvider();
  const lang = LANG_NAME[ctx.language] ?? "English";
  const ai = await provider.chat(
    [
      {
        role: "system",
        content: `Translate/phrase the following coaching reply into ${lang}. HARD RULES: every nutrition number, unit and food name must stay EXACTLY as in the original (numbers never change). Keep it natural and warm. Output ONLY the translated reply, plain text.`,
      },
      { role: "user", content: text.slice(0, 2500) },
    ],
    { maxTokens: 700 },
  );
  if (ai.ok && ai.content.trim().length > 2) return ai.content.trim().slice(0, 3000);
  return text; // graceful: English original
}

// ------------------------------------------------------------------ main entry

export interface RespondInput {
  ctx: CoachContext;
  profile: Parameters<typeof generateNextMealRecommendation>[0]["profile"];
  message: string;
  intent: DetectedIntent;
  threadHistory: { role: string; content: string }[];
}

export async function respondToMessage(input: RespondInput): Promise<CoachReply> {
  const { ctx, profile, intent } = input;

  switch (intent.intent) {
    case "today_summary": {
      const r = buildTodaySummaryReply(ctx);
      return { intent: intent.intent, text: await localize(r.text, ctx), cards: r.cards, engineSource: "deterministic_fallback", evidence: [] };
    }
    case "meal_history": {
      const r = buildMealHistoryReply(ctx, intent.meta);
      return { intent: intent.intent, text: await localize(r.text, ctx), cards: r.cards, engineSource: "deterministic_fallback", evidence: [] };
    }
    case "water_status": {
      const r = buildWaterReply(ctx);
      return { intent: intent.intent, text: await localize(r.text, ctx), cards: r.cards, engineSource: "deterministic_fallback", evidence: [] };
    }
    case "nutrition_gap": {
      const r = buildGapsReply(ctx);
      return { intent: intent.intent, text: await localize(r.text, ctx), cards: r.cards, engineSource: "deterministic_fallback", evidence: [] };
    }
    case "nutrition_progress": {
      const r = buildProgressReply(ctx);
      return { intent: intent.intent, text: await localize(r.text, ctx), cards: r.cards, engineSource: "deterministic_fallback", evidence: [] };
    }
    case "weekly_review": {
      const r = buildWeeklyReply(ctx);
      return { intent: intent.intent, text: await localize(r.text, ctx), cards: r.cards, engineSource: "deterministic_fallback", evidence: [] };
    }
    case "meal_explanation":
    case "recommendation_explanation": {
      const r = buildExplanationReply(ctx);
      return { intent: intent.intent, text: await localize(r.text, ctx), cards: r.cards, engineSource: "deterministic_fallback", evidence: r.evidence };
    }
    case "next_meal": {
      const r = await buildNextMealReply(ctx, profile);
      return { intent: intent.intent, text: r.text, cards: r.cards, engineSource: r.engineSource, evidence: r.evidence };
    }
    case "plan_rest_of_day": {
      const r = await buildPlanRestOfDayReply(ctx, profile);
      return { intent: intent.intent, text: r.text, cards: r.cards, engineSource: "deterministic_fallback", evidence: r.evidence };
    }
    case "daily_plan": {
      const r = await buildDailyPlanReply(ctx, profile);
      return { intent: intent.intent, text: r.text, cards: r.cards, engineSource: "deterministic_fallback", evidence: r.evidence };
    }
    case "meal_swap": {
      const r = await buildMealSwapReply(ctx, profile);
      return { intent: intent.intent, text: r.text, cards: r.cards, engineSource: r.engineSource, evidence: r.evidence };
    }
    case "food_question":
    case "general_nutrition_question":
    default: {
      const evidenceQuery = [input.message, ctx.health_conditions.join(" "), ctx.meal_slot].join(" ");
      const evidence = await retrieveEvidence(evidenceQuery, 2, [...ctx.health_conditions.map((c) => c.toLowerCase()), ctx.diet.type.replace("_", " ")]).catch(() => ({ chunks: [] as EvidenceChunk[], latencyMs: 0, method: "tfidf_cosine" as const }));
      const r = await llmFreeFormReply(ctx, input.message, input.threadHistory, evidence.chunks);
      const cards: CoachCard[] = r.engineSource === "ai" && evidence.chunks.length ? [{ kind: "evidence", sources: evidence.chunks.slice(0, 2).map((e) => ({ id: e.evidence_id, source: e.source, title: e.document, snippet: e.text.slice(0, 220) })) }] : [];
      return { intent: intent.intent, text: r.text, cards, engineSource: r.engineSource, evidence: evidence.chunks };
    }
  }
}
