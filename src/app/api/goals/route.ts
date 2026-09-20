/**
 * GET  /api/goals — the user's goal board. Seeds the 12 default goals on first
 *                  visit, then computes every goal's progress deterministically
 *                  from logged data + habit check-ins.
 * POST /api/goals — create a custom check-in goal ("Set a new goal").
 */
import { NextResponse } from "next/server";
import { withApi, parseJsonBody, AppError, requireString } from "@/lib/api-utils";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { computeAllGoals, ensureDefaultGoals } from "@/lib/nutrition/goals-service";
import { invalidateCoachContext } from "@/lib/coach/context";

export const GET = withApi("goals_list", async () => {
  const user = await requireUser();
  await ensureDefaultGoals(user.id);
  const result = await computeAllGoals(user.id);
  return NextResponse.json(result);
});

const CATEGORIES = new Set(["nutrition", "health", "lifestyle", "learning", "streaks"]);
const PERIODS = new Set(["weekly", "monthly"]);
const EMOJI_CHOICES = new Set([
  "🎯", "💧", "🥗", "👟", "🌙", "🍎", "📘", "🩸", "🫘", "❤️", "⚖️", "🌿", "🔥", "🧘", "🚶", "☀️", "🥕", "💪", "🧠", "✨",
]);

interface CreateGoalBody {
  title?: unknown;
  subtitle?: unknown;
  emoji?: unknown;
  category?: unknown;
  period?: unknown;
  target?: unknown;
}

export const POST = withApi("goals_create", async ({ req }) => {
  const user = await requireUser();
  const body = await parseJsonBody<CreateGoalBody>(req);

  const title = requireString(body.title, "title", 60);
  const subtitleRaw = typeof body.subtitle === "string" ? body.subtitle.trim().slice(0, 90) : "";
  const emoji = typeof body.emoji === "string" && EMOJI_CHOICES.has(body.emoji) ? body.emoji : "🎯";
  const category = typeof body.category === "string" && CATEGORIES.has(body.category) ? body.category : "lifestyle";
  const period = typeof body.period === "string" && PERIODS.has(body.period) ? body.period : "weekly";
  const targetRaw = Number(body.target);
  const target = Number.isFinite(targetRaw) ? Math.min(30, Math.max(1, Math.round(targetRaw))) : 7;

  const count = await db.goal.count({ where: { userId: user.id, isCustom: true, archived: false } });
  if (count >= 12) {
    throw new AppError("CONFLICT", "You have reached the limit of 12 custom goals. Delete one to add another.");
  }

  const goal = await db.goal.create({
    data: {
      userId: user.id,
      key: `custom-${crypto.randomUUID()}`,
      title,
      subtitle: subtitleRaw || "Personal habit goal",
      emoji,
      category,
      kind: "checkin",
      autoMetric: null,
      period,
      target,
      isCustom: true,
    },
  });

  invalidateCoachContext(user.id);
  return NextResponse.json({ ok: true, goal: { id: goal.id } }, { status: 201 });
});
