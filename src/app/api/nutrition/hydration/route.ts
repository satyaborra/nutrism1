/**
 * GET  /api/nutrition/hydration        → today's glasses + goal
 * POST /api/nutrition/hydration        → { delta?: number, glasses?: number } (clamped 0..30)
 * One glass ≈ 250 ml. Persisted per user per local day.
 */
import { NextRequest, NextResponse } from "next/server";
import { withApi, parseJsonBody, AppError } from "@/lib/api-utils";
import { requireUser } from "@/lib/auth";
import { invalidateCoachContext } from "@/lib/coach/context-builder";
import { db } from "@/lib/db";
import type { RequestContext } from "@/lib/observability";

export const HYDRATION_GOAL_GLASSES = 8;
const MAX_GLASSES = 30;

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function getOrCreate(userId: string, date: string) {
  return db.hydrationLog.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, glasses: 0 },
    update: {},
  });
}

export const GET = withApi("hydration_get", async (): Promise<NextResponse> => {
  const user = await requireUser();
  const date = todayKey();
  const row = await getOrCreate(user.id, date);
  return NextResponse.json({
    date,
    glasses: row.glasses,
    goal: HYDRATION_GOAL_GLASSES,
    ml: row.glasses * 250,
  });
});

export const POST = withApi("hydration_post", async ({ req }: { req: NextRequest; ctx: RequestContext }): Promise<NextResponse> => {
  const user = await requireUser();
  const body = await parseJsonBody<{ delta?: number; glasses?: number }>(req);
  const date = todayKey();

  let next: number;
  if (typeof body.glasses === "number") {
    next = Math.round(body.glasses);
  } else if (typeof body.delta === "number") {
    const current = await getOrCreate(user.id, date);
    next = current.glasses + Math.round(body.delta);
  } else {
    throw new AppError("VALIDATION_FAILED", "Provide delta or glasses.");
  }
  if (!Number.isFinite(next)) throw new AppError("VALIDATION_FAILED", "Invalid hydration value.");

  const row = await db.hydrationLog.upsert({
    where: { userId_date: { userId: user.id, date } },
    create: { userId: user.id, date, glasses: Math.max(0, Math.min(MAX_GLASSES, next)) },
    update: { glasses: Math.max(0, Math.min(MAX_GLASSES, next)) },
  });

  invalidateCoachContext(user.id); // water change → coach context rebuild (spec §18)

  return NextResponse.json({
    date,
    glasses: row.glasses,
    goal: HYDRATION_GOAL_GLASSES,
    ml: row.glasses * 250,
  });
});
