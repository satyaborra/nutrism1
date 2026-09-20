"use client";

/**
 * CoachChat — the conversation core of the AI Coach screen.
 * Suggestion chips → structured intents; assistant messages render text +
 * structured cards (recommendation / plan / gaps / progress / history / water /
 * evidence). Every number in cards is deterministic; the prose is narrative.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Send, Sparkles, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { api } from "@/lib/client/api";
import type {
  CoachCard,
  CoachStructuredReply,
  CoachThreadMessage,
} from "@/lib/client/types";
import { CoachCardRenderer, EngineSourceBadge, SLOT_LABEL, type RecCardActions } from "./coach-cards";

const SUGGESTIONS = [
  { emoji: "🍽", label: "What did I eat today?", message: "What did I eat today?" },
  { emoji: "🥗", label: "What should I eat next?", message: "What should I eat next?" },
  { emoji: "📅", label: "Plan the rest of my day", message: "Plan the rest of my day" },
  { emoji: "📊", label: "How am I doing today?", message: "How am I doing today?" },
  { emoji: "💧", label: "How much water do I have left?", message: "How much water do I have left?" },
  { emoji: "🔄", label: "Give me another dinner", message: "Give me another dinner option", slot: "dinner" },
  { emoji: "💡", label: "What should I improve?", message: "What are my nutrition gaps today?" },
  { emoji: "🗓", label: "Review my week", message: "How have my meals been this week?" },
];

interface ChatEntry {
  id: string;
  role: "user" | "assistant" | "pending";
  text: string;
  reply?: CoachStructuredReply | null;
  createdAt: string;
}

export function CoachChat({
  dataKey,
  onLoggedMeal,
}: {
  /** Changing key (date/mealsLogged) marks stale plans for re-check but keeps history. */
  dataKey: string;
  onLoggedMeal: () => void;
}) {
  const { toast } = useToast();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [logId, setLogId] = useState<string | null>(null);
  const [swapId, setSwapId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const lastDataKey = useRef(dataKey);

  // Load latest thread once
  useEffect(() => {
    let alive = true;
    api
      .coachThreadV2()
      .then((res) => {
        if (!alive) return;
        setThreadId(res.threadId);
        setEntries(
          res.messages.map((m: CoachThreadMessage) => ({
            id: m.id,
            role: m.role,
            text: m.text,
            reply: m.reply,
            createdAt: m.createdAt,
          })),
        );
        setLoaded(true);
      })
      .catch(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  // Keep newest message in view
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [entries, sending]);

  async function send(message: string, opts?: { slot?: string; excludeIds?: string[] }) {
    const text = message.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);
    const pendingId = `pending_${Date.now()}`;
    setEntries((prev) => [
      ...prev,
      { id: `u_${Date.now()}`, role: "user", text, createdAt: new Date().toISOString() },
      { id: pendingId, role: "pending", text: "", createdAt: new Date().toISOString() },
    ]);
    try {
      const res = await api.coachChatV2({ message: text, threadId: threadId ?? undefined, slot: opts?.slot, excludeIds: opts?.excludeIds });
      setThreadId(res.threadId);
      setEntries((prev) => [
        ...prev.filter((e) => e.id !== pendingId),
        {
          id: res.reply.id,
          role: "assistant",
          text: res.reply.text,
          reply: res.reply,
          createdAt: res.reply.createdAt,
        },
      ]);
    } catch (e) {
      setEntries((prev) => prev.filter((e) => e.id !== pendingId));
      toast({
        title: "The coach could not answer",
        description: e instanceof Error ? e.message : "Please try again in a moment.",
        variant: "destructive",
      });
      setInput(text); // restore for retry
    } finally {
      setSending(false);
    }
  }

  async function handleLog(reply: CoachStructuredReply, card: Extract<CoachCard, { kind: "recommendation" }>) {
    setLogId(reply.id);
    try {
      await api.logMeal({
        requestId: `rec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        mealType: card.slot,
        foods: card.items.map((i) => ({ foodId: i.foodId, name: i.name, quantity: i.quantity, unit: i.unit })),
        source: "recommendation",
        notes: `Coach: ${card.name}`,
      });
      toast({ title: "Meal logged ✓", description: `${card.name} added to your ${SLOT_LABEL[card.slot] ?? card.slot}.` });
      onLoggedMeal();
    } catch (e) {
      toast({
        title: "Could not log the meal",
        description: e instanceof Error ? e.message : "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setLogId(null);
    }
  }

  const handleSwap = useCallback(
    async (reply: CoachStructuredReply, card: Extract<CoachCard, { kind: "recommendation" }>) => {
      setSwapId(reply.id);
      try {
        const res = await api.coachMealSwap({ excludeIds: [card.candidateId], slot: card.slot });
        // Render the swap as a fresh assistant message
        const swapReply: CoachStructuredReply = {
          id: `swap_${Date.now()}`,
          role: "assistant",
          intent: res.intent,
          text: res.text,
          cards: res.cards,
          engineSource: res.engineSource,
          confidence: res.confidence,
          createdAt: new Date().toISOString(),
        };
        setEntries((prev) => [...prev, { id: swapReply.id, role: "assistant", text: swapReply.text, reply: swapReply, createdAt: swapReply.createdAt }]);
      } catch (e) {
        toast({
          title: "Swap failed",
          description: e instanceof Error ? e.message : "Please try again in a moment.",
          variant: "destructive",
        });
      } finally {
        setSwapId(null);
      }
    },
    [toast],
  );

  const actionsFor = (reply: CoachStructuredReply): RecCardActions => ({
    logging: logId === reply.id,
    swapping: swapId === reply.id,
    onLog: (card) => card.kind === "recommendation" && void handleLog(reply, card),
    onSwap: (card) => card.kind === "recommendation" && void handleSwap(reply, card),
  });

  return (
    <section
      aria-label="Ask your coach"
      className="flex min-h-[420px] w-full min-w-0 flex-col rounded-3xl border border-border/60 bg-card shadow-sm shadow-black/[0.03] lg:h-[calc(100vh-13rem)] lg:min-h-0 lg:sticky lg:top-24"
    >
      <div className="flex items-center gap-2.5 border-b border-border/60 px-4 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-md shadow-emerald-600/25" aria-hidden>
          <Bot className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-bold tracking-tight">Ask your coach</h2>
          <p className="truncate text-[11px] text-muted-foreground">Grounded in your verified numbers — never guesswork.</p>
        </div>
      </div>

      <div ref={listRef} className="min-w-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 [scrollbar-width:thin]" aria-live="polite" aria-label="Coach conversation">
        {loaded && entries.length === 0 && (
          <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-4 text-center">
            <Sparkles className="mx-auto h-5 w-5 text-primary" aria-hidden />
            <p className="mt-1.5 text-[12.5px] font-semibold">Your coach has read today&apos;s log.</p>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">Start with a suggestion below, or ask anything about your day.</p>
          </div>
        )}

        {entries.map((e) =>
          e.role === "user" ? (
            <div key={e.id} className="flex justify-end">
              <div className="flex max-w-[85%] items-start gap-2">
                <div className="whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-[12.5px] leading-relaxed text-primary-foreground shadow-sm">
                  {e.text}
                </div>
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted" aria-hidden>
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                </span>
              </div>
            </div>
          ) : e.role === "pending" ? (
            <div key={e.id} className="flex justify-start" aria-label="Coach is thinking">
              <span className="mr-2 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15" aria-hidden>
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              </span>
              <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm border bg-background px-3.5 py-2.5">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:300ms]" />
              </div>
            </div>
          ) : (
            <div key={e.id} className="flex justify-start">
              <span className="mr-2 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15" aria-hidden>
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              </span>
              <div className="max-w-[88%] space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <EngineSourceBadge source={e.reply?.engineSource ?? "deterministic_fallback"} />
                  {e.reply?.intent && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                      {(e.reply.intent ?? "").replace(/_/g, " ")}
                    </span>
                  )}
                </div>
                <div className="whitespace-pre-wrap rounded-2xl rounded-bl-sm border bg-background px-3.5 py-2 text-[12.5px] leading-relaxed">
                  {e.text}
                </div>
                {e.reply && e.reply.cards.length > 0 && (
                  <div className="space-y-2">
                    {e.reply.cards.map((card, i) => (
                      <CoachCardRenderer key={i} card={card} actions={card.kind === "recommendation" ? actionsFor(e.reply!) : undefined} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ),
        )}
      </div>

      <div className="min-w-0 border-t border-border/60 px-4 pb-3.5 pt-2.5">
        <div className="flex w-full min-w-0 gap-1.5 overflow-x-auto pb-2 [scrollbar-width:thin]" role="list" aria-label="Suggested questions">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.label}
              type="button"
              role="listitem"
              disabled={sending}
              onClick={() => void send(s.message, { slot: s.slot })}
              className="shrink-0 rounded-full border border-primary/25 bg-primary/5 px-3 py-1.5 text-[11px] font-semibold text-foreground/80 transition-colors hover:border-primary/50 hover:bg-primary/10 disabled:opacity-50"
            >
              {s.emoji} {s.label}
            </button>
          ))}
        </div>
        <form
          className="flex items-end gap-2"
          onSubmit={(ev) => {
            ev.preventDefault();
            void send(input);
          }}
        >
          <Textarea
            value={input}
            onChange={(ev) => setInput(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter" && !ev.shiftKey) {
                ev.preventDefault();
                void send(input);
              }
            }}
            placeholder="Ask your coach anything about your day…"
            maxLength={500}
            rows={1}
            aria-label="Your question for the coach"
            className="max-h-28 min-h-[42px] flex-1 resize-none rounded-2xl bg-background"
            disabled={sending}
          />
          <Button type="submit" size="icon" className="h-[42px] w-[42px] shrink-0 rounded-2xl" disabled={sending || input.trim().length < 2} aria-label="Send question">
            <Send className="h-4 w-4" aria-hidden />
          </Button>
        </form>
      </div>
    </section>
  );
}
