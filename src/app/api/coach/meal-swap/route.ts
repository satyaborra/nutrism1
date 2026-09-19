/**
 * POST /api/coach/meal-swap  { slot?, excludeTemplateId? }
 * "I don't want this dinner" — returns a fresh alternative for the slot with
 * the same allergy / diet / disease / nutrition filtering, excluding the
 * previously recommended template when provided (or the user's last one).
 */
import { NextRequest, NextResponse } from "next/server";
import { withApi, parseJsonBody, rateLimit, AppError } from "@/lib/api-utils";
import { requireUser } from "@/lib/auth";
import { getCoachContext, type MealSlot, SLOT_ORDER } from "@/lib/coach/context-builder";
import { generateNextMealRecommendation } from "@/lib/recommendation/engine";
import { formatKcal, formatGrams } from "@/lib/format";

const SLOT_RE = /^(breakfast|lunch|snack|dinner)$/;

export const POST = withApi("coach_meal_swap", async ({ req }: { req: NextRequest }) => {
  const user = await requireUser();
  rateLimit("coach_meal_swap", user.id, 12, 5 * 60 * 1000);

  const body = await parseJsonBody<{ slot?: string; excludeTemplateId?: string }>(req);

  const { context: ctx, profile } = await getCoachContext(user.id);
  const last = ctx.history.lastRecommendation;

  const slot: MealSlot =
    body.slot && SLOT_RE.test(body.slot)
      ? (body.slot as MealSlot)
      : ((last?.mealSlot as MealSlot | undefined) ?? ctx.meal_slot);
  if (!SLOT_ORDER.includes(slot)) throw new AppError("VALIDATION_FAILED", "Unknown meal slot.");

  const exclude = typeof body.excludeTemplateId === "string" && body.excludeTemplateId.length > 0 ? body.excludeTemplateId : (last?.templateId ?? undefined);

  const rec = await generateNextMealRecommendation({
    userId: ctx.userId,
    profile,
    mealSlot: slot,
    excludeTemplateId: exclude,
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

  const n = ctx.nutrition;
  return NextResponse.json({
    card: {
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
      alternatives: rec.alternatives.map((a) => ({ candidateId: a.id, name: a.name, calories: Math.round(a.nutrition.calories) })),
      engineSource: rec.engineSource,
    },
    text:
      `Here's a fresh alternative for ${slot} that fits your current context: ${rec.selected.name} — about ${formatKcal(rec.selected.nutrition.calories)}, ` +
      `${formatGrams(rec.selected.nutrition.protein)} protein, ${formatGrams(rec.selected.nutrition.fiber)} fibre. Same allergy, diet and health-constraint screening as always.`,
  });
});
