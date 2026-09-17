/**
 * POST /api/nutrition/coach-chat  { message, threadId? }
 *   Threaded follow-up Q&A with the AI coach. The SLM receives ONLY
 *   deterministic numbers (buildDailySummary + hydration) + RAG evidence +
 *   the recent thread history. It never invents nutrition values, never gives
 *   medical advice, never suggests allergen-containing foods.
 *   Both sides of the conversation are persisted (CoachMessage).
 *
 * GET /api/nutrition/coach-chat?threadId=... (or no threadId = latest thread)
 *   Returns the thread messages (max 50).
 *
 * Rate limited: 12 posts / 5 min / user.
 */
import { NextRequest, NextResponse } from "next/server";
import { withApi, parseJsonBody, rateLimit, AppError } from "@/lib/api-utils";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildDailySummary, getProfileFor } from "@/lib/nutrition/meal-service";
import { computeDailyTargets, safeParseArray } from "@/lib/nutrition/targets";
import { retrieveEvidence } from "@/lib/rag/retriever";
import { getAiProvider } from "@/lib/ai/provider";
import { formatKcal, formatGrams, formatMg } from "@/lib/format";
import type { NutritionValues } from "@/lib/nutrition/types";

const MAX_MESSAGE_LEN = 500;
const MAX_STORED_LEN = 4000;
const THREAD_RE = /^th_[a-zA-Z0-9_]{6,40}$/;

interface ChatBody {
  message?: string;
  threadId?: string;
}

export const POST = withApi("coach_chat", async ({ req }: { req: NextRequest }) => {
  const user = await requireUser();
  rateLimit("coach_chat", user.id, 12, 5 * 60 * 1000);

  const body = await parseJsonBody<ChatBody>(req);
  const message = String(body.message ?? "").trim().slice(0, MAX_MESSAGE_LEN);
  if (message.length < 2) {
    throw new AppError("VALIDATION_FAILED", "Ask a question first (at least 2 characters).");
  }

  // Resolve or create the thread
  let threadId = typeof body.threadId === "string" && THREAD_RE.test(body.threadId) ? body.threadId : null;
  if (!threadId) threadId = `th_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  // Context: deterministic numbers (never AI-supplied)
  const dateKey = new Date().toISOString().slice(0, 10);
  const [summary, profile, hydration, history] = await Promise.all([
    buildDailySummary(user.id, dateKey),
    getProfileFor(user.id),
    db.hydrationLog.findUnique({ where: { userId_date: { userId: user.id, date: dateKey } } }),
    db.coachMessage.findMany({
      where: { userId: user.id, threadId },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);
  const glasses = hydration?.glasses ?? 0;
  const targets = computeDailyTargets(profile);
  const conditions = safeParseArray(profile.healthConditions);
  const allergies = safeParseArray(profile.allergies);

  // RAG evidence driven by the question + conditions
  const evidence = await retrieveEvidence([message, conditions.join(" "), summary.mealSlot].join(" "), 2, conditions);
  const evidenceChunks = evidence.chunks;

  // Persist the user's question BEFORE calling the AI (never lose user input)
  await db.coachMessage.create({
    data: { userId: user.id, threadId, role: "user", content: message.slice(0, MAX_STORED_LEN) },
  });

  const provider = getAiProvider();
  const messages = buildChatPrompt({ summary, targets, conditions, allergies, dietaryPreference: profile.dietaryPreference, glasses, evidenceChunks, history, question: message });

  const ai = await provider.chat(messages, { maxTokens: 600 });

  let reply: string;
  let engineSource: "ai" | "deterministic_fallback" = "deterministic_fallback";

  if (ai.ok && typeof ai.content === "string" && ai.content.trim().length > 2) {
    reply = ai.content.trim().slice(0, MAX_STORED_LEN);
    engineSource = "ai";
  } else {
    reply = buildFallbackReply(summary, targets, glasses, message);
  }

  const saved = await db.coachMessage.create({
    data: { userId: user.id, threadId, role: "assistant", content: reply },
  });

  return NextResponse.json({
    threadId,
    reply: {
      id: saved.id,
      role: "assistant",
      content: reply,
      createdAt: saved.createdAt.toISOString(),
    },
    engineSource,
  });
});

export const GET = withApi("coach_chat_get", async ({ req }: { req: NextRequest }) => {
  const user = await requireUser();

  const requested = new URL(req.url).searchParams.get("threadId");
  let threadId = requested && THREAD_RE.test(requested) ? requested : null;

  if (!threadId) {
    const latest = await db.coachMessage.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: { threadId: true },
    });
    threadId = latest?.threadId ?? null;
  }

  if (!threadId) return NextResponse.json({ threadId: null, messages: [] });

  const rows = await db.coachMessage.findMany({
    where: { userId: user.id, threadId },
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  return NextResponse.json({
    threadId,
    messages: rows.map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.createdAt.toISOString() })),
  });
});

// ---------- prompt ----------

function buildChatPrompt(input: {
  summary: Awaited<ReturnType<typeof buildDailySummary>>;
  targets: NutritionValues;
  conditions: string[];
  allergies: string[];
  dietaryPreference: string;
  glasses: number;
  evidenceChunks: { evidence_id: string; source: string; text: string }[];
  history: { role: string; content: string }[];
  question: string;
}): { role: "system" | "user" | "assistant"; content: string }[] {
  const { summary, targets, glasses } = input;
  const c = summary.consumed;
  const r = summary.remaining;

  const system = `You are NutriSLM's AI nutrition coach in a follow-up chat. You receive the user's verified daily nutrition numbers (computed from a trusted food database), their health conditions, thread history, and retrieved evidence excerpts (WHO / ICMR-NIN / ADA / KDIGO / AHA).

STRICT RULES:
- NEVER invent or recalculate nutrition numbers. Only reference the numbers provided. Qualitative wording ("well under target") is fine.
- NEVER give medical advice or medication guidance. Food and lifestyle guidance only.
- NEVER suggest foods containing the user's allergens, and respect the user's dietary preference strictly.
- If asked about something unrelated to food/nutrition/hydration, politely steer back.
- Be warm, concrete and brief (max ~120 words). Plain language.
- Reply in English with plain text only (no JSON, no markdown headers).`;

  const contextMsg = `Verified data for your answer (today ${summary.date}, slot ${summary.mealSlot}):
- Diet: ${input.dietaryPreference} (NEVER suggest foods outside this preference).
- Consumed: ${formatKcal(c.calories)} kcal of ${formatKcal(targets.calories)}; protein ${formatGrams(c.protein)}/${formatGrams(targets.protein)}; carbs ${formatGrams(c.carbohydrates)}/${formatGrams(targets.carbohydrates)}; fat ${formatGrams(c.fat)}/${formatGrams(targets.fat)}; fiber ${formatGrams(c.fiber)}/${formatGrams(targets.fiber)}; sugar ${formatGrams(c.sugar)}/${formatGrams(targets.sugar)}; sodium ${formatMg(c.sodium)}/${formatMg(targets.sodium)}.
- Remaining today: ${formatKcal(r.calories)} kcal, protein ${formatGrams(r.protein)}, fiber ${formatGrams(r.fiber)}.
- Meals logged: ${summary.meals.length}; water ${glasses}/8 glasses (~${glasses * 250} ml).
- Conditions: ${input.conditions.length ? input.conditions.join(", ") : "none"}; allergies (hard exclusions): ${input.allergies.length ? input.allergies.join(", ") : "none"}.
- Day constraint state: ${summary.compliance.state}.

Evidence excerpts:
${input.evidenceChunks.map((e) => `[${e.evidence_id}] (${e.source}) ${e.text.slice(0, 280)}`).join("\n") || "(none retrieved)"}`;

  // Thread history (oldest first, capped)
  const historyMsgs = input.history
    .slice()
    .reverse()
    .slice(-8)
    .map((m) => ({ role: m.role === "assistant" ? ("assistant" as const) : ("user" as const), content: m.content.slice(0, 700) }));

  const convo: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: system },
    { role: "user", content: contextMsg },
    ...historyMsgs,
    { role: "user", content: input.question },
  ];
  return convo;
}

// ---------- deterministic fallback ----------

function buildFallbackReply(
  summary: Awaited<ReturnType<typeof buildDailySummary>>,
  targets: NutritionValues,
  glasses: number,
  question: string,
): string {
  const r = summary.remaining;
  const kcalPct = targets.calories > 0 ? summary.consumed.calories / targets.calories : 0;
  const parts: string[] = [];

  parts.push("The AI coach is unavailable right now, so here is a quick rule-based answer based on your verified numbers:");
  if (r.calories > 400) parts.push(`You still have about ${formatKcal(r.calories)} kcal and ${formatGrams(r.protein)} protein left today.`);
  else if (kcalPct >= 1) parts.push("You have reached your calorie target for today — keep anything further light.");
  if (r.fiber > targets.fiber * 0.5) parts.push("Fibre has room — vegetables, whole grains or pulses would fit well.");
  if (summary.consumed.sugar > summary.targets.sugar * 0.8) parts.push("You are near the daily sugar ceiling, so skip sweets and sweet drinks for now.");
  if (glasses < 6) parts.push(`Also, ${6 - glasses} more glass${6 - glasses === 1 ? "" : "es"} of water would round off your hydration.`);
  if (summary.meals.length === 0) parts.push("Log your meals as you eat so the coaching gets sharper.");

  parts.push(`(Your question — "${question.slice(0, 80)}" — deserves a fuller answer; please try again in a moment.)`);
  return parts.join(" ");
}
