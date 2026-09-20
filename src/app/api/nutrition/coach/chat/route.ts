/**
 * POST /api/nutrition/coach/chat  { message, threadId?, excludeIds?, slot? }
 *   The context-aware AI Coach chat (v2). Pipeline per spec:
 *   intent → coach context (cached, invalidated on any mutation) →
 *   deterministic cards (candidate engine / DB aggregates) → LLM narrative →
 *   number-validator (DB values always win) → persisted thread (CoachMessage).
 *
 * GET /api/nutrition/coach/chat?threadId=...
 *   Thread history; assistant v2 replies come back as structured `reply` objects.
 *
 * Rate limited: 20 posts / 5 min / user.
 */
import { NextRequest, NextResponse } from "next/server";
import { withApi, parseJsonBody, rateLimit, AppError } from "@/lib/api-utils";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildCoachReply, type CoachReply } from "@/lib/coach/responder";
import { invalidateCoachContext } from "@/lib/coach/context";
import type { RequestContext } from "@/lib/observability";

const MAX_MESSAGE_LEN = 500;
const THREAD_RE = /^th_[a-zA-Z0-9_]{6,40}$/;

interface ChatBody {
  message?: string;
  threadId?: string;
  excludeIds?: string[];
  slot?: string;
}

function parseAssistantContent(raw: string): { text: string; reply?: CoachReply } {
  if (raw.startsWith('{"v":2')) {
    try {
      const parsed = JSON.parse(raw) as CoachReply;
      if (parsed && parsed.v === 2 && typeof parsed.text === "string") {
        return { text: parsed.text, reply: parsed };
      }
    } catch {
      /* fall through to legacy text */
    }
  }
  return { text: raw };
}

export const POST = withApi("coach_chat_v2", async ({ req, ctx: reqCtx }: { req: NextRequest; ctx: RequestContext }) => {
  const user = await requireUser();
  reqCtx.userId = user.id;
  rateLimit("coach_chat_v2", user.id, 20, 5 * 60 * 1000);

  const body = await parseJsonBody<ChatBody>(req);
  const message = String(body.message ?? "").trim().slice(0, MAX_MESSAGE_LEN);
  if (message.length < 2) {
    throw new AppError("VALIDATION_FAILED", "Ask a question first (at least 2 characters).");
  }
  let threadId = typeof body.threadId === "string" && THREAD_RE.test(body.threadId) ? body.threadId : null;
  if (!threadId) threadId = `th_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  const excludeIds = Array.isArray(body.excludeIds)
    ? body.excludeIds.filter((x): x is string => typeof x === "string").slice(0, 10)
    : [];
  const slot = typeof body.slot === "string" && ["breakfast", "lunch", "snack", "dinner"].includes(body.slot) ? body.slot : undefined;

  // Persist the user's question BEFORE the AI call (never lose user input)
  await db.coachMessage.create({
    data: { userId: user.id, threadId, role: "user", content: message },
  });

  const { reply } = await buildCoachReply({
    userId: user.id,
    userName: user.name ?? "",
    message,
    excludeIds,
    slot,
  });

  const saved = await db.coachMessage.create({
    data: { userId: user.id, threadId, role: "assistant", content: JSON.stringify(reply) },
  });

  // The reply may reference a recommendation just persisted by the engine —
  // refresh the context cache on the next request so numbers stay fresh.
  invalidateCoachContext(user.id);

  return NextResponse.json({
    threadId,
    reply: {
      id: saved.id,
      role: "assistant" as const,
      intent: reply.intent,
      text: reply.text,
      cards: reply.cards,
      engineSource: reply.engineSource,
      confidence: reply.confidence,
      createdAt: saved.createdAt.toISOString(),
    },
  });
});

export const GET = withApi("coach_chat_v2_get", async ({ req, ctx: reqCtx }: { req: NextRequest; ctx: RequestContext }) => {
  const user = await requireUser();
  reqCtx.userId = user.id;

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
    messages: rows.map((m) => {
      if (m.role === "assistant") {
        const { text, reply } = parseAssistantContent(m.content);
        return {
          id: m.id,
          role: m.role,
          text,
          reply: reply ?? null,
          createdAt: m.createdAt.toISOString(),
        };
      }
      return { id: m.id, role: m.role, text: m.content, reply: null, createdAt: m.createdAt.toISOString() };
    }),
  });
});
