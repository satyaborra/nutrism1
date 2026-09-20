/**
 * GET /api/coach/snapshot
 * Compact daily coach snapshot for the Home card and the Coach header:
 *   meals logged x/4, calories/protein/fiber/water progress, next slot,
 *   one-line priority. All values deterministic.
 */
import { NextResponse } from "next/server";
import { withApi } from "@/lib/api-utils";
import { requireUser } from "@/lib/auth";
import { getCoachContext, remainingSlots, SLOT_ORDER } from "@/lib/coach/context-builder";
import { formatKcal, formatGrams } from "@/lib/format";

export const GET = withApi("coach_snapshot", async () => {
  const user = await requireUser();
  const { context: ctx } = await getCoachContext(user.id);

  const loggedTypes = new Set(ctx.meals.map((m) => m.mealType));
  const pending = remainingSlots(ctx, loggedTypes);
  const n = ctx.nutrition;

  const priorities: string[] = [];
  if (n.protein.pct < 0.6) priorities.push(`Increase protein (${Math.round(n.protein.remaining)} g remaining)`);
  if (n.fiber.pct < 0.6) priorities.push(`Add fibre (${Math.round(n.fiber.remaining)} g remaining)`);
  if (ctx.water.remaining > 0) priorities.push(`${ctx.water.remaining} more glass${ctx.water.remaining === 1 ? "" : "es"} of water`);
  if (ctx.health_conditions.length) priorities.push(`Keep ${ctx.health_conditions.join(" + ")} constraints in view`);

  return NextResponse.json({
    date: ctx.date,
    greeting: `Good ${greetingPart(ctx.current_time)}, ${ctx.greetingName}`,
    mealsLogged: ctx.mealsLogged,
    mealsTotal: SLOT_ORDER.length,
    calories: { consumed: Math.round(n.calories.consumed), target: Math.round(n.calories.target), remaining: Math.round(n.calories.remaining), pct: n.calories.pct },
    protein: { consumed: Math.round(n.protein.consumed), target: Math.round(n.protein.target), remaining: Math.round(n.protein.remaining), pct: n.protein.pct },
    fiber: { consumed: Math.round(n.fiber.consumed), target: Math.round(n.fiber.target), remaining: Math.round(n.fiber.remaining), pct: n.fiber.pct },
    water: { glasses: ctx.water.glasses, target: ctx.water.target, remaining: ctx.water.remaining },
    nextSlot: pending[0] ?? null,
    priorities: priorities.slice(0, 3),
    streak: ctx.history.loggingStreak,
    summaryLine:
      `${ctx.mealsLogged} meal${ctx.mealsLogged === 1 ? "" : "s"} logged · ${formatKcal(n.calories.consumed)} consumed · ${formatKcal(n.calories.remaining)} remaining` +
      (n.protein.remaining > 5 ? ` · Protein: ${formatGrams(n.protein.remaining)} remaining` : "") +
      (n.fiber.remaining > 5 ? ` · Fiber: ${formatGrams(n.fiber.remaining)} remaining` : ""),
  });
});

function greetingPart(hhmm: string): string {
  const h = Number(hhmm.slice(0, 2));
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}
