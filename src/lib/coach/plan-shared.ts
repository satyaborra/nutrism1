/**
 * COACH PLAN SHARED — the LOGGED vs RECOMMENDED day-plan builder used by the
 * chat responder, /api/coach/daily-plan and /api/coach/plan-rest-of-day.
 * Logged meals are NEVER modified; recommendations carry engine nutrition.
 */
import type { CoachContext, MealSlot } from "./context-builder";
import type { NextMealRecommendation } from "@/lib/recommendation/engine";
import type { CoachPlanCard } from "./responders";
import { formatKcal, formatGrams } from "@/lib/format";

const SLOT_LABEL: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  snack: "Evening snack",
  dinner: "Dinner",
};

export interface SlotEngineResult {
  slot: MealSlot;
  rec: NextMealRecommendation | null;
  error?: string;
}

export function buildPlanCardFromCoach(
  ctx: CoachContext,
  results: SlotEngineResult[],
  opts: { fullDay?: boolean } = {},
): CoachPlanCard {
  const loggedByType = new Map(ctx.meals.map((m) => [m.mealType, m] as const));
  const slotOrder: MealSlot[] = ["breakfast", "lunch", "snack", "dinner"];
  const recBySlot = new Map(results.filter((r) => r.rec).map((r) => [r.slot, r.rec!] as const));
  const currentIdx = slotOrder.indexOf(ctx.meal_slot);

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
        items: rec.selected.items.map((i) => ({ foodId: i.foodId, name: i.name, quantity: i.quantity, unit: i.unit })),
        calories: Math.round(rec.selected.nutrition.calories),
        reason: rec.explanation,
        candidateId: rec.selected.id,
      });
    } else if (!opts.fullDay && slotOrder.indexOf(slot) < currentIdx) {
      // Rest-of-day view: earlier unlogged slots are simply not shown as recommendations
      slots.push({ slot, label: SLOT_LABEL[slot], status: "skipped" });
    } else {
      slots.push({ slot, label: SLOT_LABEL[slot], status: "skipped" });
    }
  }

  const extraCalories = results.reduce((s, r) => s + (r.rec?.selected.nutrition.calories ?? 0), 0);
  const extraProtein = results.reduce((s, r) => s + (r.rec?.selected.nutrition.protein ?? 0), 0);
  const extraFiber = results.reduce((s, r) => s + (r.rec?.selected.nutrition.fiber ?? 0), 0);

  const overview = [
    { label: "Calories", value: `${formatKcal(ctx.nutrition.calories.consumed)}${extraCalories > 0 ? ` + ${formatKcal(extraCalories)} → ${formatKcal(ctx.nutrition.calories.consumed + extraCalories)} of ${formatKcal(ctx.nutrition.calories.target)}` : ` of ${formatKcal(ctx.nutrition.calories.target)}`}` },
    { label: "Protein", value: `${formatGrams(ctx.nutrition.protein.consumed + extraProtein)} of ${formatGrams(ctx.nutrition.protein.target)}` },
    { label: "Fiber", value: `${formatGrams(ctx.nutrition.fiber.consumed + extraFiber)} of ${formatGrams(ctx.nutrition.fiber.target)}` },
    { label: "Water", value: `${ctx.water.glasses} / ${ctx.water.target} glasses` },
  ];

  return {
    kind: "plan",
    slots,
    overview,
    summary: "Your plan prioritizes your configured dietary preferences and health constraints while using verified nutrition data. Logged meals are never overwritten.",
  };
}

export function planSummaryText(ctx: CoachContext, card: CoachPlanCard): string {
  const lines: string[] = [];
  lines.push(`Here's ${ctx.mealsLogged > 0 ? "the rest of" : ""} your day, ${ctx.greetingName}:`.replace("Here's  the", "Here's the"));
  for (const s of card.slots) {
    if (s.status === "logged") lines.push(`${s.label} (${s.time}): ✓ logged — ${s.name} (~${s.calories} kcal)`);
    else if (s.status === "recommended") lines.push(`${s.label}: ○ ${s.name} (~${s.calories} kcal)`);
  }
  lines.push("Everything recommended respects your allergies, diet preference and health constraints — tap \"Log this meal\" on any card and your day updates instantly.");
  return lines.join("\n");
}
