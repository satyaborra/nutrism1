/**
 * GET /api/foods — browse the verified food library (the DB is the single source
 * of nutrition truth; this endpoint makes that source visible and explorable).
 *
 * Query params:
 *  q        — optional search (reuses the multilingual alias-aware searchFoods)
 *  category — optional exact category filter (grain | legume | ... | dish | condiment)
 *  veg      — "true" → vegetarian only
 *  page     — 1-based page number (default 1)
 *  pageSize — 6..48 (default 24)
 *
 * Always ordered deterministically (canonicalName asc). All numbers come straight
 * from the Food table per its reference serving — never computed client-side.
 */
import { NextRequest, NextResponse } from "next/server";
import { withApi, AppError, rateLimit } from "@/lib/api-utils";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { searchFoods } from "@/lib/nutrition/food-repository";
import { round } from "@/lib/format";

export const GET = withApi("foods_browse", async ({ req }: { req: NextRequest }) => {
  const user = await requireUser();
  void user;
  rateLimit("foods_browse", req.headers.get("x-forwarded-for") ?? "local", 120, 60_000);

  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim() ?? "";
  if (q.length > 100) throw new AppError("VALIDATION_FAILED", "Search query too long.");

  const category = sp.get("category")?.trim() ?? "";
  const vegOnly = sp.get("veg") === "true";
  const page = Math.max(1, Math.min(50, Number(sp.get("page")) || 1));
  const pageSize = Math.max(6, Math.min(48, Number(sp.get("pageSize")) || 24));

  // Search path (alias-aware, multilingual) narrows first; category/veg filter in memory
  // (the library is ~50 rows — smaller than the index cost of a dynamic where on JSON-ish filters).
  const base = q ? await searchFoods(q, 60) : await db.food.findMany({ orderBy: { canonicalName: "asc" } });

  let rows = base;
  if (category) rows = rows.filter((f) => f.category === category);
  if (vegOnly) rows = rows.filter((f) => f.isVeg);

  const total = rows.length;
  const start = (page - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);

  return NextResponse.json({
    foods: pageRows.map((f) => ({
      id: f.id,
      name: f.canonicalName,
      category: f.category,
      servingUnit: f.servingUnit,
      isVeg: f.isVeg,
      containsEgg: f.containsEgg,
      calories: round(f.calories, 1),
      protein: round(f.protein, 1),
      carbs: round(f.carbohydrates, 1),
      fat: round(f.fat, 1),
      fiber: round(f.fiber, 1),
      allergens: safeJson(f.allergens),
    })),
    total,
    page,
    pageSize,
    hasMore: start + pageRows.length < total,
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
