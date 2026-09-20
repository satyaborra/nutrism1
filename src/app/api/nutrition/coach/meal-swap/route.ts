/**
 * POST /api/nutrition/coach/meal-swap { excludeIds?: string[], slot?: string }
 *   "Give me another option" (spec §25): same allergy/diet/constraint filters,
 *   excluding the rejected candidate ids.
 */
import { NextRequest, NextResponse } from "next/server";
import { withApi, parseJsonBody, rateLimit, AppError } from "@/lib/api-utils";
import { requireUser } from "@/lib/auth";
import { buildCoachReply } from "@/lib/coach/responder";
import { invalidateCoachContext } from "@/lib/coach/context";
import type { RequestContext } from "@/lib/observability";

interface SwapBody {
  excludeIds?: string[];
  slot?: string;
  message?: string;
}

export const POST = withApi("coach_meal_swap", async ({ req, ctx: reqCtx }: { req: NextRequest; ctx: RequestContext }) => {
  const user = await requireUser();
  reqCtx.userId = user.id;
  rateLimit("coach_meal_swap", user.id, 15, 5 * 60 * 1000);

  const body = await parseJsonBody<SwapBody>(req);
  const excludeIds = Array.isArray(body.excludeIds)
    ? body.excludeIds.filter((x): x is string => typeof x === "string").slice(0, 10)
    : [];
  const slot = typeof body.slot === "string" && ["breakfast", "lunch", "snack", "dinner"].includes(body.slot) ? body.slot : undefined;
  if (excludeIds.length === 0 && !slot) {
    throw new AppError("VALIDATION_FAILED", "Tell me which meal to replace (slot or the candidate to exclude).");
  }

  const { reply } = await buildCoachReply({
    userId: user.id,
    userName: user.name ?? "",
    message: body.message ?? `Give me another ${slot ?? "meal"} option`,
    excludeIds,
    slot,
    intentOverride: "meal_swap",
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
