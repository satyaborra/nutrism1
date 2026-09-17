/**
 * DELETE /api/nutrition/meals/[id]
 * Deletes a meal owned by the authenticated user. Transactional: removes the
 * meal + its food lines in one atomic operation, then invalidates stale
 * recommendations from the last hour so the engine re-ranks against new totals.
 */
import { NextRequest, NextResponse } from "next/server";
import { withApi, AppError } from "@/lib/api-utils";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const DELETE = withApi("meal_delete", async ({ req }: { req: NextRequest }) => {
  const user = await requireUser();

  // Extract meal id from the URL path (keeps handler signature compatible with withApi)
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const id = parts[parts.length - 1];
  if (!id || id.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new AppError("VALIDATION_FAILED", "Invalid meal id.");
  }

  const result = await db.$transaction(async (tx) => {
    const meal = await tx.meal.findUnique({ where: { id }, include: { foods: true } });
    if (!meal) throw new AppError("NOT_FOUND", "Meal not found. It may have been already deleted.");
    if (meal.userId !== user.id) throw new AppError("FORBIDDEN", "You can only delete your own meals.");

    await tx.mealFood.deleteMany({ where: { mealId: meal.id } });
    await tx.meal.delete({ where: { id: meal.id } });

    // Invalidate recent recommendations — remaining budget changed
    await tx.recommendationHistory.deleteMany({
      where: {
        userId: user.id,
        date: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10) },
        createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
      },
    });

    return { id: meal.id, totals: { calories: meal.totalCalories }, foodsCount: meal.foods.length };
  });

  return NextResponse.json({
    ok: true,
    deletedMealId: result.id,
    removedCalories: result.totals.calories,
    removedFoods: result.foodsCount,
    recommendationInvalidated: true,
  });
});
