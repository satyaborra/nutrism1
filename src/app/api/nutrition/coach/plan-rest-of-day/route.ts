/**
 * POST /api/nutrition/coach/plan-rest-of-day
 *   Thin dedicated endpoint for "Plan the rest of my day" (spec §21) —
 *   delegates to the same deterministic builder as the daily plan (scope: rest).
 */
import { NextResponse } from "next/server";
import { withApi, rateLimit } from "@/lib/api-utils";
import { requireUser } from "@/lib/auth";
import { buildCoachReply } from "@/lib/coach/responder";
import { invalidateCoachContext } from "@/lib/coach/context";
import type { RequestContext } from "@/lib/observability";

export const POST = withApi("coach_plan_rest", async ({ ctx: reqCtx }: { ctx: RequestContext }) => {
  const user = await requireUser();
  reqCtx.userId = user.id;
  rateLimit("coach_plan_rest", user.id, 12, 5 * 60 * 1000);

  const { reply } = await buildCoachReply({
    userId: user.id,
    userName: user.name ?? "",
    message: "Plan the rest of my day",
    intentOverride: "plan_rest_of_day",
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
