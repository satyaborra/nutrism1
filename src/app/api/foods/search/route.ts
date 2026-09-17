import { NextRequest, NextResponse } from "next/server";
import { withApi, AppError } from "@/lib/api-utils";
import { requireUser } from "@/lib/auth";
import { searchFoods } from "@/lib/nutrition/food-repository";
import { rateLimit } from "@/lib/api-utils";

export const GET = withApi("foods_search", async ({ req }: { req: NextRequest }) => {
  const user = await requireUser();
  void user;
  rateLimit("foods_search", req.headers.get("x-forwarded-for") ?? "local", 120, 60_000);

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length > 100) throw new AppError("VALIDATION_FAILED", "Search query too long.");

  const foods = await searchFoods(q, 15);
  return NextResponse.json({
    foods: foods.map((f) => ({
      id: f.id,
      name: f.canonicalName,
      category: f.category,
      servingUnit: f.servingUnit,
      isVeg: f.isVeg,
      allergens: safeJson(f.allergens),
    })),
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
