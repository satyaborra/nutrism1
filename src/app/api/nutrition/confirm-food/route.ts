/**
 * POST /api/nutrition/confirm-food
 * User confirms/edits detected foods → backend normalizes, validates, looks up
 * trusted nutrition data, calculates deterministically. Still NOT logged yet.
 *
 * Body: { draftId: string, mealType?: string, foods: [{ lineId, foodId?, name, quantity, unit, preparation? }] }
 */
import { NextRequest, NextResponse } from "next/server";
import { withApi, parseJsonBody, AppError } from "@/lib/api-utils";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getFood, convertQuantity, resolveFoodName, getFoods } from "@/lib/nutrition/food-repository";
import { calculateFoodLine, sumNutrition, foodToRef } from "@/lib/nutrition/calculator";
import { zeroNutrition, type NutritionValues } from "@/lib/nutrition/types";
import { safeParseArray } from "@/lib/nutrition/targets";
import { getProfileFor, mealComplianceSummary } from "@/lib/nutrition/meal-service";

interface ConfirmFoodItem {
  lineId?: string;
  foodId?: string | null;
  name?: string;
  quantity?: number;
  unit?: string;
  preparation?: string | null;
}

interface ConfirmBody {
  draftId?: string;
  mealType?: string;
  foods?: ConfirmFoodItem[];
}

export const POST = withApi("confirm_food", async ({ req }: { req: NextRequest }) => {
  const user = await requireUser();
  const body = await parseJsonBody<ConfirmBody>(req);

  if (!body.draftId) throw new AppError("VALIDATION_FAILED", "draftId is required.");
  const draft = await db.analysisDraft.findUnique({ where: { id: body.draftId } });
  if (!draft || draft.userId !== user.id) throw new AppError("NOT_FOUND", "Analysis draft not found or expired.");
  if (draft.expiresAt < new Date()) throw new AppError("NOT_FOUND", "This analysis has expired. Please analyze the food again.");

  const foods = Array.isArray(body.foods) ? body.foods.slice(0, 20) : [];
  if (foods.length === 0) throw new AppError("VALIDATION_FAILED", "No foods to confirm.");

  const profile = await getProfileFor(user.id);
  const conditions = safeParseArray(profile.healthConditions);

  const lines: CalculatedLine[] = [];
  const nutritionParts: NutritionValues[] = [];
  let incomplete = false;
  let anyConversionNote: string | null = null;

  for (const item of foods) {
    const quantity = Number(item.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100) {
      throw new AppError("VALIDATION_FAILED", `Invalid quantity for "${item.name ?? "food"}" (must be 0-100).`);
    }

    // Resolve canonical food: client-provided id → re-resolve by name → unmapped
    let food = item.foodId ? await getFood(item.foodId) : null;
    if (!food && item.name) {
      const res = await resolveFoodName(item.name);
      food = res.status === "matched" ? res.food : null;
    }

    if (!food) {
      incomplete = true;
      const lineId = item.lineId ?? `line_${Math.random().toString(36).slice(2, 8)}`;
      lines.push({
        lineId,
        foodId: null,
        displayName: item.name ?? "Unknown food",
        originalName: item.name ?? null,
        quantity,
        unit: item.unit ?? "serving",
        preparation: item.preparation ?? null,
        confidence: null,
        quantitySource: "user",
        nutrition: zeroNutrition(),
        source: null,
        perReference: null,
        conversionNote: "This food is not in our database yet — nutrition unavailable. Please pick a close match from the food search.",
      });
      continue;
    }

    const ref = foodToRef(food);
    const conv = convertQuantity(quantity, item.unit ?? food.servingUnit, food.servingUnit);
    if (conv.note && !conv.exact) anyConversionNote = conv.note;
    const nutrition = calculateFoodLine(ref, conv.quantityInRefs);
    nutritionParts.push(nutrition);

    lines.push({
      lineId: item.lineId ?? `line_${Math.random().toString(36).slice(2, 8)}`,
      foodId: food.id,
      displayName: food.canonicalName,
      originalName: item.name ?? food.canonicalName,
      quantity,
      unit: item.unit ?? food.servingUnit,
      preparation: item.preparation ?? null,
      confidence: null,
      quantitySource: "user",
      nutrition,
      source: food.source,
      perReference: food.servingUnit,
      conversionNote: conv.exact ? null : conv.note ?? null,
    });
  }

  const totals = sumNutrition(nutritionParts);
  const compliance = await mealComplianceSummary(conditions, totals, incomplete);

  // Mark draft confirmed (state machine: CONFIRMED)
  await db.analysisDraft.update({ where: { id: draft.id }, data: { status: "CONFIRMED" } });

  const mealType = ["breakfast", "lunch", "snack", "dinner"].includes(String(body.mealType))
    ? String(body.mealType)
    : (draft.mealTypeGuess ?? "snack");

  // Resolve display names for ambiguous→resolved items in bulk (for response completeness)
  void (await getFoods(lines.map((l) => l.foodId).filter((x): x is string => !!x)));

  return NextResponse.json({
    draftId: draft.id,
    mealType,
    foods: lines,
    totals,
    compliance,
    incomplete,
    note: anyConversionNote,
  });
});

interface CalculatedLine {
  lineId: string;
  foodId: string | null;
  displayName: string;
  originalName: string | null;
  quantity: number;
  unit: string;
  preparation: string | null;
  confidence: number | null;
  quantitySource: string;
  nutrition: NutritionValues;
  source: string | null;
  perReference: string | null;
  conversionNote: string | null;
}
