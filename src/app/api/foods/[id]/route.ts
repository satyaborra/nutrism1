/**
 * GET /api/foods/[id] — full detail for one verified food:
 *  - all 11 nutrients per its DB reference serving (deterministic source of truth)
 *  - a per-100 g panel: exact when the reference is mass/volume ("100 g"), honestly
 *    flagged "estimated" when the reference is a household unit ("1 katori" ≈ 150 g)
 *  - multilingual aliases (en/ta/te/hi/kn/rom) so users see how the food is known
 *  - tags, allergens, source (IFCT2017/USDA) + optional source reference
 */
import { NextRequest, NextResponse } from "next/server";
import { withApi, AppError } from "@/lib/api-utils";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { referenceGrams } from "@/lib/nutrition/food-repository";
import { round } from "@/lib/format";

function extractId(url: string): string {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  const id = parts[parts.length - 1];
  if (!id || id.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new AppError("VALIDATION_FAILED", "Invalid food id.");
  }
  return id;
}

export const GET = withApi("food_detail", async ({ req }: { req: NextRequest }) => {
  await requireUser();
  const id = extractId(req.url);

  const food = await db.food.findUnique({
    where: { id },
    include: { aliases: { orderBy: [{ isPrimary: "desc" }, { language: "asc" }] } },
  });
  if (!food) throw new AppError("NOT_FOUND", "Food not found in the verified library.");

  // Per-100 g scaling: mass/volume references convert exactly; household units
  // go through documented gram approximations (flagged estimated, never silent).
  const refGrams = referenceGrams(food.servingUnit);
  const scale = refGrams > 0 ? 100 / refGrams : 1;
  const massVolume = /^(g|ml)/.test(food.servingUnit.trim().toLowerCase());
  const per100 = (v: number) => round(v * scale, 1);

  return NextResponse.json({
    food: {
      id: food.id,
      name: food.canonicalName,
      category: food.category,
      isVeg: food.isVeg,
      containsEgg: food.containsEgg,
      servingSize: food.servingSize,
      servingUnit: food.servingUnit,
      source: food.source,
      sourceReference: food.sourceReference,
      tags: safeJson(food.tags),
      allergens: safeJson(food.allergens),
      aliases: food.aliases.map((a) => ({ alias: a.alias, language: a.language, isPrimary: a.isPrimary })),
      nutrients: {
        calories: round(food.calories, 1),
        protein: round(food.protein, 1),
        carbohydrates: round(food.carbohydrates, 1),
        fat: round(food.fat, 1),
        saturatedFat: round(food.saturatedFat, 1),
        fiber: round(food.fiber, 1),
        sugar: round(food.sugar, 1),
        sodium: round(food.sodium, 0),
        potassium: round(food.potassium, 0),
        phosphorus: round(food.phosphorus, 0),
        cholesterol: round(food.cholesterol, 0),
      },
      per100g: {
        estimated: !massVolume,
        basisNote: massVolume
          ? "Exact conversion — the reference itself is a mass/volume amount."
          : `Estimated from the household reference "${food.servingUnit}" (≈ ${refGrams} g).`,
        calories: per100(food.calories),
        protein: per100(food.protein),
        carbohydrates: per100(food.carbohydrates),
        fat: per100(food.fat),
        saturatedFat: per100(food.saturatedFat),
        fiber: per100(food.fiber),
        sugar: per100(food.sugar),
        sodium: per100(food.sodium),
        potassium: per100(food.potassium),
        phosphorus: per100(food.phosphorus),
        cholesterol: per100(food.cholesterol),
      },
    },
  });
});

function safeJson(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
