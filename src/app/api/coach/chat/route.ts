/**
 * POST /api/coach/chat  { message, threadId? }
 * THE context-aware coach conversation.
 *
 * Flow: verify session → rate limit → build (cached) CoachContext → persist
 * user message with detected intent → route to the right responder
 * (deterministic / recommendation engine / LLM synthesis) → persist assistant
 * reply with intent → return text + structured cards (recommendations, plan
 * timeline, gaps, water, evidence).
 *
 * Source-of-truth rules enforced in responders.ts: nutrition numbers ALWAYS
 * come from the deterministic pipeline; the AI ranks, explains and phrases.
 *
 * GET /api/coach/chat?threadId=... returns a thread's messages (compat with
 * the legacy coach chat surface, now enriched with intent labels).
 */
import { NextRequest, NextResponse } from "next/server";
import { withApi, parseJsonBody, rateLimit, AppError } from "@/lib/api-utils";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getCoachContext, invalidateCoachContext } from "@/lib/coach/context-builder";
import { detectIntent } from "@/lib/coach/intents";
import { respondToMessage } from "@/lib/coach/responders";

const MAX_MESSAGE_LEN = 600;
const MAX_STORED_LEN = 4000;
const THREAD_RE = /^th_[a-zA-Z0-9_]{6,40}$/;

interface ChatBody {
  message?: string;
  threadId?: string;
}

export const POST = withApi("coach_chat_v2", async ({ req }: { req: NextRequest }) => {
  const user = await requireUser();
  rateLimit("coach_chat_v2", user.id, 20, 5 * 60 * 1000);

  const body = await parseJsonBody<ChatBody>(req);
  const message = String(body.message ?? "").trim().slice(0, MAX_MESSAGE_LEN);
  if (message.length < 2) {
    throw new AppError("VALIDATION_FAILED", "Ask your coach a question first (at least 2 characters).");
  }

  let threadId = typeof body.threadId === "string" && THREAD_RE.test(body.threadId) ? body.threadId : null;
  if (!threadId) threadId = `th_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  // 1. Verified context (cached; invalidation happens on every mutation)
  const { context, profile } = await getCoachContext(user.id);

  // 2. Intent detection (deterministic, multilingual)
  const intent = detectIntent(message, context);

  // 3. Persist the user's question BEFORE any AI call (never lose input)
  await db.coachMessage.create({
    data: { userId: user.id, threadId, role: "user", content: message.slice(0, MAX_STORED_LEN), intent: intent.intent },
  });

  // 4. Thread history for conversational continuity
  const history = await db.coachMessage.findMany({
    where: { userId: user.id, threadId },
    orderBy: { createdAt: "desc" },
    take: 12,
  });
  const threadHistory = history
    .slice()
    .reverse()
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));

  // 5. Respond (deterministic / engine / LLM — per intent)
  const reply = await respondToMessage({ ctx: context, profile, message, intent, threadHistory });

  // 6. Persist the assistant reply
  const saved = await db.coachMessage.create({
    data: { userId: user.id, threadId, role: "assistant", content: reply.text.slice(0, MAX_STORED_LEN), intent: reply.intent },
  });

  return NextResponse.json({
    threadId,
    intent: reply.intent,
    message: {
      id: saved.id,
      role: "assistant" as const,
      content: reply.text,
      createdAt: saved.createdAt.toISOString(),
    },
    cards: reply.cards,
    engineSource: reply.engineSource,
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
    take: 60,
  });

  return NextResponse.json({
    threadId,
    messages: rows.map((m) => ({
      id: m.id,
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
      intent: m.intent ?? null,
      createdAt: m.createdAt.toISOString(),
    })),
  });
});

// ensure invalidateCoachContext is importable elsewhere; referenced here to keep tree-shaking honest
void invalidateCoachContext;
