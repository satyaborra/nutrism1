/**
 * GET /api/nutrition/daily-summary?date=YYYY-MM-DD
 * All values aggregated from PERSISTED meals (database is the source of truth).
 */
import { NextRequest, NextResponse } from "next/server";
import { withApi } from "@/lib/api-utils";
import { requireUser } from "@/lib/auth";
import { buildDailySummary } from "@/lib/nutrition/meal-service";

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const GET = withApi("daily_summary", async ({ req }: { req: NextRequest }) => {
  const user = await requireUser();
  const date = req.nextUrl.searchParams.get("date") ?? todayKey();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: { code: "VALIDATION_FAILED", message: "date must be YYYY-MM-DD", request_id: "inline" } }, { status: 422 });
  }
  const summary = await buildDailySummary(user.id, date);
  return NextResponse.json(summary);
});
