/**
 * DELETE /api/goals/[id] — delete a CUSTOM goal (and its check-ins, cascaded).
 * Default goals are part of the curated board and cannot be deleted.
 */
import { NextResponse } from "next/server";
import { withApi, AppError } from "@/lib/api-utils";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { invalidateCoachContext } from "@/lib/coach/context";

export const DELETE = withApi("goals_delete", async ({ params }) => {
  const user = await requireUser();
  const { id } = await params!;

  const goal = await db.goal.findFirst({ where: { id, userId: user.id } });
  if (!goal) throw new AppError("NOT_FOUND", "Goal not found.");
  if (!goal.isCustom) {
    throw new AppError("FORBIDDEN", "Default goals can't be deleted — they're part of your core board.");
  }

  await db.goal.delete({ where: { id: goal.id } });
  invalidateCoachContext(user.id);
  return NextResponse.json({ ok: true, id: goal.id });
});
