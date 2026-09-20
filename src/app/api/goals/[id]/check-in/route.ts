/**
 * POST /api/goals/[id]/check-in — toggle today's check-in on a habit goal.
 * Second call on the same day undoes the check-in. Auto goals reject manual
 * check-ins (they track themselves from logged data).
 */
import { NextResponse } from "next/server";
import { withApi, AppError } from "@/lib/api-utils";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { computeAllGoals } from "@/lib/nutrition/goals-service";
import { invalidateCoachContext } from "@/lib/coach/context";

export const POST = withApi("goals_checkin", async ({ params }) => {
  const user = await requireUser();
  const { id } = await params!;

  const goal = await db.goal.findFirst({ where: { id, userId: user.id, archived: false } });
  if (!goal) throw new AppError("NOT_FOUND", "Goal not found.");
  if (goal.kind !== "checkin") {
    throw new AppError("BAD_REQUEST", "This goal tracks itself from your logged data — no manual check-in needed.");
  }

  const today = new Date().toISOString().slice(0, 10);
  const existing = await db.goalCheckIn.findUnique({
    where: { goalId_date: { goalId: goal.id, date: today } },
  });

  let checked: boolean;
  if (existing) {
    await db.goalCheckIn.delete({ where: { id: existing.id } });
    checked = false;
  } else {
    await db.goalCheckIn.create({ data: { goalId: goal.id, userId: user.id, date: today } });
    checked = true;
  }

  const board = await computeAllGoals(user.id);
  const updated = board.goals.find((g) => g.id === goal.id);
  invalidateCoachContext(user.id);
  return NextResponse.json({ ok: true, checked, goal: updated ?? null });
});
