/**
 * GET  /api/nutrition/recent-meals?limit=10&date=YYYY-MM-DD
 * DELETE /api/nutrition/recent-meals?mealId=...
 * Meals shown with ACTUAL food names (never "Logged Meal" placeholders).
 */
import { NextRequest, NextResponse } from "next/server";
import { withApi, AppError } from "@/lib/api-utils";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getRecentMeals, serializeMeal } from "@/lib/nutrition/meal-service";

export const GET = withApi("recent_meals", async ({ req }: { req: NextRequest }) => {
  const user = await requireUser();
  const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 12) || 12));
  const meals = await getRecentMeals(user.id, limit);
  return NextResponse.json({
    meals: meals.map(serializeMeal),
    count: meals.length,
  });
});

export const DELETE = withApi("meal_delete", async ({ req }: { req: NextRequest }) => {
  const user = await requireUser();
  const mealId = req.nextUrl.searchParams.get("mealId");
  if (!mealId) throw new AppError("VALIDATION_FAILED", "mealId is required.");
  const meal = await db.meal.findUnique({ where: { id: mealId } });
  if (!meal || meal.userId !== user.id) throw new AppError("NOT_FOUND", "Meal not found.");
  await db.meal.delete({ where: { id: mealId } });
  return NextResponse.json({ ok: true, deletedId: mealId });
});
