/**
 * GET /api/nutrition/coach-chat/threads — list the user's coach conversations.
 * Deterministic aggregation over CoachMessage rows: per thread we return the
 * first user question as the title, message counts, and last-activity time so
 * the UI can present a browsable history. Capped at the 12 most recent threads.
 */
import { NextResponse } from "next/server";
import { withApi } from "@/lib/api-utils";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

const MAX_THREADS = 12;
const MAX_SCAN = 400;

export const GET = withApi("coach_chat_threads", async (): Promise<NextResponse> => {
  const user = await requireUser();

  const rows = await db.coachMessage.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: MAX_SCAN,
    select: { id: true, threadId: true, role: true, content: true, createdAt: true },
  });

  // Reduce newest-first rows into threads. firstUserMessage is overwritten by
  // each user row we meet, so after the scan it holds the chronologically FIRST
  // user message — the natural conversation title.
  const map = new Map<
    string,
    {
      threadId: string;
      messageCount: number;
      lastActivity: Date;
      startedAt: Date;
      firstUserMessage: string;
      lastUserMessage: string;
    }
  >();

  for (const r of rows) {
    const existing = map.get(r.threadId);
    if (!existing) {
      map.set(r.threadId, {
        threadId: r.threadId,
        messageCount: 1,
        lastActivity: r.createdAt,
        startedAt: r.createdAt,
        firstUserMessage: "",
        lastUserMessage: "",
      });
    } else {
      existing.messageCount += 1;
      if (r.createdAt < existing.startedAt) existing.startedAt = r.createdAt;
    }
    if (r.role === "user") {
      const t = map.get(r.threadId)!;
      if (!t.firstUserMessage) t.firstUserMessage = r.content;
      t.lastUserMessage = r.content;
    }
  }

  const threads = Array.from(map.values())
    .sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime())
    .slice(0, MAX_THREADS)
    .map((t) => ({
      threadId: t.threadId,
      title: (t.firstUserMessage || t.lastUserMessage || "(conversation)").slice(0, 90),
      messageCount: t.messageCount,
      lastActivity: t.lastActivity.toISOString(),
      startedAt: t.startedAt.toISOString(),
    }));

  return NextResponse.json({ threads, count: threads.length });
});
