/**
 * GET /api/nutrition/coach/context
 * Verified coach context for the Coach screen — snapshot numbers, today's
 * meals, week aggregates. Numbers come ONLY from deterministic aggregation.
 * `_allowedNumbers` (validator internals) is stripped before the response.
 */
import { NextResponse } from "next/server";
import { withApi } from "@/lib/api-utils";
import { requireUser } from "@/lib/auth";
import { getCoachContext } from "@/lib/coach/context";
import type { RequestContext } from "@/lib/observability";

export const GET = withApi("coach_context", async ({ ctx }: { ctx: RequestContext }) => {
  const user = await requireUser();
  ctx.userId = user.id;

  const context = await getCoachContext(user.id, user.name ?? "");
  const { _allowedNumbers, ...safe } = context;
  void _allowedNumbers;

  return NextResponse.json({
    ...safe,
    snapshot: {
      date: context.date,
      mealsLogged: context.mealsLogged,
      calories: context.nutrition.calories,
      protein: context.nutrition.protein,
      fiber: context.nutrition.fiber,
      water: context.water,
      nextSlot: context.mealSlot,
    },
  });
});
