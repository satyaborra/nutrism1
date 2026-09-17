/**
 * POST /api/nutrition/recommendation-feedback
 *   { recommendationId, candidateId?, mealSlot?, rating: "up"|"down", reason? }
 *   Persists a thumbs up/down on a generated recommendation (one per user per
 *   recommendation — upsert). This is the human-feedback loop for future ranking.
 *
 * GET /api/nutrition/recommendation-feedback?recommendationId=xxx
 *   Returns the current user's saved feedback for that recommendation (or null).
 */
import { NextRequest, NextResponse } from "next/server";
import { withApi, parseJsonBody, AppError } from "@/lib/api-utils";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

const REASONS = ["too_many_carbs", "not_filling", "not_my_cuisine", "portion_off", "allergy_concern", "other"];

interface FeedbackBody {
  recommendationId?: string;
  candidateId?: string;
  mealSlot?: string;
  rating?: string;
  reason?: string;
}

export const POST = withApi("recommendation_feedback", async ({ req }: { req: NextRequest }) => {
  const user = await requireUser();
  const body = await parseJsonBody<FeedbackBody>(req);

  const recommendationId = String(body.recommendationId ?? "").trim().slice(0, 64);
  if (!recommendationId || !/^[a-zA-Z0-9_-]+$/.test(recommendationId)) {
    throw new AppError("VALIDATION_FAILED", "A valid recommendationId is required.");
  }
  const rating = String(body.rating ?? "");
  if (rating !== "up" && rating !== "down") {
    throw new AppError("VALIDATION_FAILED", "Rating must be 'up' or 'down'.");
  }

  const candidateId = body.candidateId ? String(body.candidateId).slice(0, 64) : null;
  const mealSlot = body.mealSlot ? String(body.mealSlot).slice(0, 24) : null;
  const reason = body.reason && REASONS.includes(String(body.reason)) ? String(body.reason) : null;

  const feedback = await db.recommendationFeedback.upsert({
    where: { userId_recommendationId: { userId: user.id, recommendationId } },
    create: { userId: user.id, recommendationId, candidateId, mealSlot, rating, reason },
    update: { rating, reason, candidateId, mealSlot },
  });

  return NextResponse.json({
    ok: true,
    feedback: {
      recommendationId: feedback.recommendationId,
      rating: feedback.rating,
      reason: feedback.reason,
      updatedAt: feedback.createdAt.toISOString(),
    },
  });
});

export const GET = withApi("recommendation_feedback_get", async ({ req }: { req: NextRequest }) => {
  const user = await requireUser();
  const recommendationId = req.nextUrl.searchParams.get("recommendationId") ?? "";
  if (!recommendationId || !/^[a-zA-Z0-9_-]+$/.test(recommendationId)) {
    throw new AppError("VALIDATION_FAILED", "A valid recommendationId is required.");
  }
  const feedback = await db.recommendationFeedback.findUnique({
    where: { userId_recommendationId: { userId: user.id, recommendationId } },
  });
  return NextResponse.json({
    feedback: feedback
      ? { recommendationId: feedback.recommendationId, rating: feedback.rating, reason: feedback.reason }
      : null,
  });
});
