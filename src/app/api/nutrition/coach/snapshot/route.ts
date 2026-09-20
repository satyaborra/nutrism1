/**
 * GET /api/nutrition/coach/snapshot — compact daily coach snapshot
 * (spec §19): meals logged, calories/protein/fiber/water progress, next slot,
 * and the day's coaching priority (deterministically derived).
 */
import { NextResponse } from "next/server";
import { withApi } from "@/lib/api-utils";
import { requireUser } from "@/lib/auth";
import { getCoachContext } from "@/lib/coach/context";
import { formatKcal, formatGrams } from "@/lib/format";
import type { RequestContext } from "@/lib/observability";

export const GET = withApi("coach_snapshot", async ({ ctx }: { ctx: RequestContext }) => {
  const user = await requireUser();
  ctx.userId = user.id;

  const c = await getCoachContext(user.id, user.name ?? "");
  const priorities: string[] = [];
  if (c.nutrition.protein.remaining >= 20) priorities.push(`add ${formatGrams(c.nutrition.protein.remaining)} protein`);
  if (c.nutrition.fiber.remaining >= 10) priorities.push(`close the ${formatGrams(c.nutrition.fiber.remaining)} g fiber gap`);
  if (c.water.glasses < 6) priorities.push(`${c.water.target - c.water.glasses} more glasses of water`);
  if (c.nutrition.calories.pct < 60) priorities.push(`use the ${formatKcal(c.nutrition.calories.remaining)} kcal remaining wisely`);

  return NextResponse.json({
    date: c.date,
    timeLabel: c.timeLabel,
    greeting: c.greeting,
    mealSlot: c.mealSlot,
    mealsLogged: c.mealsLogged,
    totalSlots: 4,
    calories: c.nutrition.calories,
    protein: c.nutrition.protein,
    fiber: c.nutrition.fiber,
    water: c.water,
    conditions: c.healthConditions,
    priority:
      priorities.length > 0
        ? `Priority: ${priorities.slice(0, 2).join(" · ")}, respecting your profile constraints.`
        : "Priority: hold the course — you're tracking well against your configured targets.",
  });
});
