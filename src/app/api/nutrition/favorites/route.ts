/**
 * GET  /api/nutrition/favorites — list the user's pinned quick-log meals.
 *      Includes a deterministic kcal estimate per favorite (matched foods
 *      recomputed fresh from the Food table; unmatched lines use their
 *      persisted snapshot) so chips can show an honest "≈ N kcal" hint.
 * POST /api/nutrition/favorites — pin a previously logged meal as a favorite
 *      ({ mealId, name? }). Lines snapshot quantity/unit; nutrition is NOT
 *      trusted from the client — everything is recomputed at log time.
 */
import { NextRequest, NextResponse } from "next/server";
import { withApi, parseJsonBody, AppError } from "@/lib/api-utils";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getFood, convertQuantity } from "@/lib/nutrition/food-repository";
import { calculateFoodLine, foodToRef, sumNutrition } from "@/lib/nutrition/calculator";
import { round } from "@/lib/format";
import type { NutritionValues } from "@/lib/nutrition/types";

interface FavoriteItem {
  foodId: string | null;
  displayName: string;
  originalName?: string | null;
  quantity: number;
  unit: string;
  preparation?: string | null;
  confidence?: number | null;
  quantitySource: string;
  nutrition: NutritionValues;
}

function parseItems(json: string): FavoriteItem[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? (v as FavoriteItem[]) : [];
  } catch {
    return [];
  }
}

/** Deterministic estimate: matched → recompute from DB; unmatched → snapshot. */
async function estimateKcal(items: FavoriteItem[]): Promise<number> {
  let kcal = 0;
  for (const item of items) {
    const food = item.foodId ? await getFood(item.foodId) : null;
    if (food) {
      const conv = convertQuantity(item.quantity, item.unit, food.servingUnit);
      kcal += calculateFoodLine(foodToRef(food), conv.quantityInRefs).calories;
    } else {
      kcal += item.nutrition?.calories ?? 0;
    }
  }
  return Math.round(kcal);
}

export const GET = withApi("favorites_list", async (): Promise<NextResponse> => {
  const user = await requireUser();

  const rows = await db.favorite.findMany({
    where: { userId: user.id },
    orderBy: [{ updatedAt: "desc" }],
    take: 24,
  });

  const favorites = await Promise.all(
    rows.map(async (f) => {
      const items = parseItems(f.items);
      return {
        id: f.id,
        name: f.name,
        mealType: f.mealType,
        itemCount: items.length,
        itemNames: items.map((i) => i.displayName),
        estimateKcal: items.length > 0 ? await estimateKcal(items) : 0,
        useCount: f.useCount,
        sourceMealId: f.sourceMealId,
      };
    }),
  );

  return NextResponse.json({ favorites, count: favorites.length });
});

export const POST = withApi("favorites_create", async ({ req }: { req: NextRequest }): Promise<NextResponse> => {
  const user = await requireUser();
  const body = await parseJsonBody<{ mealId?: string; name?: string }>(req);

  const mealId = String(body.mealId ?? "").trim();
  if (!mealId || mealId.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(mealId)) {
    throw new AppError("VALIDATION_FAILED", "Invalid meal id.");
  }

  const meal = await db.meal.findUnique({ where: { id: mealId }, include: { foods: true } });
  if (!meal) throw new AppError("NOT_FOUND", "That meal no longer exists.");
  if (meal.userId !== user.id) throw new AppError("FORBIDDEN", "You can only favorite your own meals.");
  if (meal.foods.length === 0) throw new AppError("VALIDATION_FAILED", "That meal has no foods to save.");

  // Default name: first two item names — concise, human-readable label.
  const autoName =
    meal.foods
      .slice(0, 2)
      .map((f) => `${Math.round(f.quantity * 10) / 10} ${f.displayName}`)
      .join(" + ") + (meal.foods.length > 2 ? ` +${meal.foods.length - 2}` : "");

  const name = (String(body.name ?? "").trim() || autoName).slice(0, 80);

  const items: FavoriteItem[] = meal.foods.map((f) => ({
    foodId: f.foodId,
    displayName: f.displayName,
    originalName: f.originalName,
    quantity: f.quantity,
    unit: f.unit,
    preparation: f.preparation,
    confidence: f.confidence,
    quantitySource: f.quantitySource,
    nutrition: {
      calories: f.calories, protein: f.protein, carbohydrates: f.carbohydrates,
      fat: f.fat, fiber: f.fiber, sugar: f.sugar, sodium: f.sodium,
      potassium: f.potassium, phosphorus: f.phosphorus, cholesterol: f.cholesterol,
      saturatedFat: f.saturatedFat,
    },
  }));

  try {
    const favorite = await db.favorite.create({
      data: {
        userId: user.id,
        name,
        mealType: meal.mealType,
        items: JSON.stringify(items),
        sourceMealId: meal.id,
      },
    });
    const estimate = await estimateKcal(items);
    const totals = sumNutrition(items.map((i) => i.nutrition));
    return NextResponse.json({
      ok: true,
      favorite: {
        id: favorite.id,
        name: favorite.name,
        mealType: favorite.mealType,
        itemCount: items.length,
        itemNames: items.map((i) => i.displayName),
        estimateKcal: estimate,
        useCount: 0,
        sourceMealId: favorite.sourceMealId,
      },
      snapshotCalories: round(totals.calories, 0),
    });
  } catch (e: unknown) {
    // P2002 = unique constraint (userId, name) — already favorited with this name.
    if (typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === "P2002") {
      throw new AppError("CONFLICT", "This meal is already in your favorites.");
    }
    throw e;
  }
});
