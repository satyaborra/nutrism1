/**
 * POST /api/nutrition/confirm-food
 * User confirms/edits detected foods → backend normalizes, validates, looks up
 * trusted nutrition data, calculates deterministically. Still NOT logged yet.
 *
 * XAI: preserves the analyze-stage AI confidence/quantitySource (previously
 * dropped), detects user edits, and attaches deterministic per-line + totals
 * explanations so the UI can show "why this number?".
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
import { buildLineExplanation, buildTotalsExplanation, type LineExplanation, type TotalsExplanation } from "@/lib/nutrition/xai";

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

/** Shape of the per-food entries stored in AnalysisDraft.foods (JSON). */
interface DraftFood {
  lineId?: string;
  originalName?: string;
  displayName?: string;
  foodId?: string | null;
  quantity?: number;
  unit?: string;
  confidence?: number;
  quantitySource?: string;
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

  // ---- XAI: recover the analyze-stage perception metadata for each line ----
  let draftFoods: DraftFood[] = [];
  try {
    const parsed = JSON.parse(draft.foods);
    if (Array.isArray(parsed)) draftFoods = parsed as DraftFood[];
  } catch {
    draftFoods = [];
  }
  const draftByLine = new Map<string, DraftFood>();
  const draftByName = new Map<string, DraftFood>();
  for (const d of draftFoods) {
    if (d?.lineId) draftByLine.set(d.lineId, d);
    if (d?.originalName) draftByName.set(String(d.originalName).toLowerCase(), d);
  }

  const profile = await getProfileFor(user.id);
  const conditions = safeParseArray(profile.healthConditions);

  const lines: CalculatedLine[] = [];
  const nutritionParts: NutritionValues[] = [];
  let incomplete = false;
  let anyConversionNote: string | null = null;
  let anyConverted = false;
  let anyEstimated = false;

  for (const item of foods) {
    const quantity = Number(item.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100) {
      throw new AppError("VALIDATION_FAILED", `Invalid quantity for "${item.name ?? "food"}" (must be 0-100).`);
    }

    // XAI: find the originating draft line (by lineId, then by raw name).
    const draftLine =
      (item.lineId ? draftByLine.get(item.lineId) : undefined) ??
      (item.name ? draftByName.get(String(item.name).toLowerCase()) : undefined) ??
      null;
    // The user edited this line when qty/unit/food differ from what the AI produced.
    const userEdited =
      !!draftLine &&
      (quantity !== Number(draftLine.quantity ?? quantity) ||
        (item.unit ?? "") !== String(draftLine.unit ?? item.unit ?? "") ||
        (!!item.foodId && !!draftLine.foodId && item.foodId !== draftLine.foodId) ||
        !draftLine); // manually added line counts as user-authored

    const rawConfidence = typeof draftLine?.confidence === "number" ? draftLine.confidence : null;
    const confidence = userEdited ? 1 : rawConfidence != null ? Math.min(1, Math.max(0, rawConfidence)) : null;
    const rawQtySource = draftLine?.quantitySource ?? "user";
    const quantitySource: "user" | "estimated" | "unknown" = userEdited
      ? "user"
      : rawQtySource === "estimated"
        ? "estimated"
        : rawQtySource === "unknown"
          ? "unknown"
          : "user";
    if (quantitySource === "estimated" && !userEdited) anyEstimated = true;

    // Resolve canonical food: client-provided id → re-resolve by name → unmapped
    let food = item.foodId ? await getFood(item.foodId) : null;
    if (!food && item.name) {
      const res = await resolveFoodName(item.name);
      food = res.status === "matched" ? res.food : null;
    }

    if (!food) {
      incomplete = true;
      const lineId = item.lineId ?? `line_${Math.random().toString(36).slice(2, 8)}`;
      const displayName = item.name ?? "Unknown food";
      const explain = buildLineExplanation({
        displayName,
        originalName: item.name ?? null,
        quantity,
        unit: item.unit ?? "serving",
        matched: false,
        source: null,
        reference: null,
        conversionNote: null,
        converted: false,
        confidence: null,
        quantitySource: "user",
        userEdited: false,
      });
      lines.push({
        lineId,
        foodId: null,
        displayName,
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
        explain,
      });
      continue;
    }

    const ref = foodToRef(food);
    const conv = convertQuantity(quantity, item.unit ?? food.servingUnit, food.servingUnit);
    if (conv.note && !conv.exact) anyConversionNote = conv.note;
    if (!conv.exact) anyConverted = true;
    const nutrition = calculateFoodLine(ref, conv.quantityInRefs);
    nutritionParts.push(nutrition);

    const reference = /^\d/.test(food.servingUnit)
      ? food.servingUnit // unit already carries its count, e.g. "1 katori"
      : `${food.servingSize} ${food.servingUnit}`; // e.g. "100 g" | "1 piece"
    const explain = buildLineExplanation({
      displayName: food.canonicalName,
      originalName: item.name ?? null,
      quantity,
      unit: item.unit ?? food.servingUnit,
      matched: true,
      source: food.source,
      reference,
      conversionNote: conv.exact ? null : conv.note ?? null,
      converted: !conv.exact,
      confidence,
      quantitySource,
      userEdited,
      quantityInRefs: conv.quantityInRefs,
    });

    lines.push({
      lineId: item.lineId ?? `line_${Math.random().toString(36).slice(2, 8)}`,
      foodId: food.id,
      displayName: food.canonicalName,
      originalName: item.name ?? food.canonicalName,
      quantity,
      unit: item.unit ?? food.servingUnit,
      preparation: item.preparation ?? null,
      confidence,
      quantitySource,
      nutrition,
      source: food.source,
      perReference: reference,
      conversionNote: conv.exact ? null : conv.note ?? null,
      explain,
    });
  }

  const totals = sumNutrition(nutritionParts);
  const compliance = await mealComplianceSummary(conditions, totals, incomplete);

  const totalsExplain = buildTotalsExplanation({
    lines: lines.map((l) => ({
      displayName: l.displayName,
      kcal: l.nutrition.calories,
      matched: l.foodId != null,
      source: l.source,
    })),
    totalsKcal: totals.calories,
    incomplete,
    anyConverted,
    anyEstimated,
  });

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
    totalsExplain,
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
  explain: LineExplanation;
}

export type { TotalsExplanation };
