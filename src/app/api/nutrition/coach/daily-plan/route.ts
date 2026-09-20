/**
 * POST /api/nutrition/coach/daily-plan { scope?: "full" | "rest" }
 *   Full-day plan (spec §20): logged slots stay LOGGED (never overwritten),
 *   remaining slots get deterministic engine candidates with verified nutrition.
 *   The timeline card is returned directly (and appears in chat when asked
 *   there) — logged meals are never overwritten by recommendations.
 */
import { NextRequest, NextResponse } from "next/server";
import { withApi, rateLimit } from "@/lib/api-utils";
import { requireUser } from "@/lib/auth";
import { buildCoachReply } from "@/lib/coach/responder";
import { invalidateCoachContext } from "@/lib/coach/context";
import type { RequestContext } from "@/lib/observability";

export const POST = withApi("coach_daily_plan", async ({ req, ctx: reqCtx }: { req: NextRequest; ctx: RequestContext }) => {
  const user = await requireUser();
  reqCtx.userId = user.id;
  rateLimit("coach_daily_plan", user.id, 12, 5 * 60 * 1000);

  let scope: "full" | "rest" = "full";
  try {
    const body = (await req.json().catch(() => ({}))) as { scope?: string };
    if (body?.scope === "rest") scope = "rest";
  } catch {
    /* empty body is fine — default full */
  }

  const { reply } = await buildCoachReply({
    userId: user.id,
    userName: user.name ?? "",
    message: scope === "rest" ? "Plan the rest of my day" : "Give me my complete diet plan for today",
    intentOverride: scope === "rest" ? "plan_rest_of_day" : "daily_plan",
  });

  invalidateCoachContext(user.id);

  return NextResponse.json({
    intent: reply.intent,
    text: reply.text,
    cards: reply.cards,
    engineSource: reply.engineSource,
    confidence: reply.confidence,
  });
});
