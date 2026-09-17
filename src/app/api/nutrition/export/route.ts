/**
 * GET /api/nutrition/export?days=7
 * CSV export of the user's logged meals (one row per meal, per-food list flattened).
 * Deterministic numbers straight from the database — same source as the UI.
 */
import { NextRequest, NextResponse } from "next/server";
import { withApi } from "@/lib/api-utils";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { round } from "@/lib/format";

function csvEscape(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const HEADERS = [
  "date", "time", "meal_type", "source", "foods",
  "calories_kcal", "protein_g", "carbohydrates_g", "fat_g", "fiber_g", "sugar_g",
  "sodium_mg", "potassium_mg", "phosphorus_mg", "cholesterol_mg", "saturated_fat_g",
];

export const GET = withApi("nutrition_export", async ({ req }: { req: NextRequest }) => {
  const user = await requireUser();
  const url = new URL(req.url);
  const daysRaw = Number(url.searchParams.get("days") ?? "7");
  const days = Number.isFinite(daysRaw) ? Math.min(90, Math.max(1, Math.floor(daysRaw))) : 7;

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const meals = await db.meal.findMany({
    where: { userId: user.id, eatenAt: { gte: since } },
    include: { foods: true },
    orderBy: { eatenAt: "desc" },
  });

  const rows: string[] = [HEADERS.join(",")];
  for (const m of meals) {
    const foods = m.foods.map((f) => `${f.displayName} ${f.quantity} ${f.unit}`).join("; ");
    rows.push(
      [
        m.eatenAt.toISOString().slice(0, 10),
        m.eatenAt.toISOString().slice(11, 16),
        m.mealType,
        m.source ?? "",
        foods,
        round(m.totalCalories, 0),
        round(m.totalProtein, 1),
        round(m.totalCarbohydrates, 1),
        round(m.totalFat, 1),
        round(m.totalFiber, 1),
        round(m.totalSugar, 1),
        round(m.totalSodium, 0),
        round(m.totalPotassium, 0),
        round(m.totalPhosphorus, 0),
        round(m.totalCholesterol, 0),
        round(m.totalSaturatedFat, 1),
      ]
        .map(csvEscape)
        .join(","),
    );
  }

  // CRLF per RFC 4180; BOM keeps Excel happy with UTF-8 food names
  const body = "\uFEFF" + rows.join("\r\n") + "\r\n";
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="nutrislm-meals-${days}d-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
