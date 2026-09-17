/**
 * GET /api/health — lightweight system health probe.
 */
import { NextResponse } from "next/server";
import { withApi } from "@/lib/api-utils";
import { db } from "@/lib/db";

export const GET = withApi("health_check", async () => {
  const t0 = Date.now();
  let dbOk = true;
  let counts = { foods: 0, evidence: 0, templates: 0, constraints: 0 };
  try {
    const [foods, evidence, templates, constraints] = await Promise.all([
      db.food.count(), db.evidence.count(), db.mealTemplate.count(), db.diseaseConstraint.count(),
    ]);
    counts = { foods, evidence, templates, constraints };
  } catch {
    dbOk = false;
  }
  return NextResponse.json({
    status: dbOk ? "ok" : "degraded",
    service: "nutrislm",
    database: dbOk ? "connected" : "unavailable",
    dbLatencyMs: Date.now() - t0,
    seed: counts,
    time: new Date().toISOString(),
  });
});
