"use client";

/**
 * AI Coach — a rate-limited SLM insight over today's deterministic numbers and
 * RAG evidence. Button-triggered (costly call), cached server-side until the
 * user's data changes; refresh forces regeneration within rate limits.
 * Includes a threaded follow-up chat grounded in the same verified numbers.
 */
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, BadgeCheck, Lightbulb, MessageCircle, RefreshCw, Send, Sparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useNutriStore } from "./store";
import { api } from "@/lib/client/api";
import type { CoachChatMessage, CoachInsightResponse } from "@/lib/client/types";

export function AiCoach() {
  const dataVersion = useNutriStore((s) => s.dataVersion);
  const { toast } = useToast();
  const [data, setData] = useState<CoachInsightResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchInsight(refresh = false) {
    setLoading(true);
    setError(null);
    try {
      const res = await api.coachInsight(refresh);
      setData(res);
    } catch (e) {
      const msg =
        e instanceof Error && e.message.includes("Too many requests")
          ? "The coach needs a short break — try again in a few minutes."
          : "Could not generate the coach insight right now.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  function handleDataVersionBump() {
    // Mark current insight stale visually when meals change; keep it visible until next fetch
    if (data) setData({ ...data, stale: true });
  }

  // subscribe to dataVersion changes
  const [lastSeenVersion, setLastSeenVersion] = useState(dataVersion);
  if (dataVersion !== lastSeenVersion) {
    setLastSeenVersion(dataVersion);
    handleDataVersionBump();
  }

  return (
    <Card className="overflow-hidden border-primary/25 bg-gradient-to-br from-primary/8 via-background to-teal-500/8 dark:from-primary/10 dark:to-teal-500/10">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary" aria-hidden>
                <Sparkles className="h-4 w-4" />
              </span>
              Coach insight
              {data && (
                <Badge
                  variant="outline"
                  className={
                    data.engineSource === "ai"
                      ? "border-primary/40 bg-primary/10 text-[9px] uppercase tracking-wide text-primary"
                      : "border-muted-foreground/40 bg-muted text-[9px] uppercase tracking-wide text-muted-foreground"
                  }
                >
                  {data.engineSource === "ai" ? "AI" : "rule-based"}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              {data
                ? "A note on today's verified numbers and what to aim for next."
                : "Ask the SLM coach to review today's verified numbers — numbers come from the database, never the model."}
            </CardDescription>
          </div>
          {data ? (
            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => fetchInsight(true)} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden />
              {loading ? "Re-thinking…" : "Refresh"}
            </Button>
          ) : (
            <Button size="sm" className="h-8 gap-1.5" onClick={() => fetchInsight(false)} disabled={loading}>
              {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />}
              {loading ? "Coach is thinking…" : "Get today's insight"}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {error && (
          <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {error}
          </p>
        )}

        {loading && !data && (
          <div className="space-y-2" aria-busy="true" aria-label="Coach is analyzing today's data">
            <div className="h-5 w-2/3 animate-pulse rounded-md bg-primary/15" />
            <div className="h-4 w-full animate-pulse rounded-md bg-muted" />
            <div className="h-4 w-5/6 animate-pulse rounded-md bg-muted" />
            <div className="grid gap-1.5 pt-1 sm:grid-cols-3">
              <div className="h-10 animate-pulse rounded-md bg-muted" />
              <div className="h-10 animate-pulse rounded-md bg-muted" />
              <div className="h-10 animate-pulse rounded-md bg-muted" />
            </div>
          </div>
        )}

        {data && (
          <div className={`space-y-3 transition-opacity ${data.stale ? "opacity-60" : ""}`}>
            {data.stale && (
              <p className="text-xs italic text-muted-foreground">You logged something new — refresh the coach for an up-to-date insight.</p>
            )}
            <div>
              <p className="text-sm font-semibold tracking-tight text-foreground">{data.headline}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{data.insight}</p>
            </div>

            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Focus for the rest of today</p>
              <ul className="grid gap-1.5 sm:grid-cols-3">
                {data.focus.map((tip, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 rounded-lg border border-primary/15 bg-background/70 p-2.5 text-xs leading-snug backdrop-blur-sm transition-colors hover:border-primary/35"
                  >
                    <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>

            {data.aiNote && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                {data.aiNote}
              </p>
            )}

            {data.evidenceSources.length > 0 && (
              <p className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                <BadgeCheck className="h-3.5 w-3.5 text-primary" aria-hidden />
                Grounded in:
                {data.evidenceSources.map((s, i) => (
                  <Badge key={i} variant="outline" className="px-1.5 py-0 text-[9px] font-normal">
                    {s}
                  </Badge>
                ))}
              </p>
            )}
          </div>
        )}

        {!data && !loading && !error && (
          <p className="rounded-xl border border-dashed border-primary/30 bg-background/50 p-4 text-center text-sm text-muted-foreground">
            The coach looks at what you logged, your condition constraints and cited clinical evidence — then tells you what to focus on.
          </p>
        )}

        <CoachChat />
      </CardContent>
    </Card>
  );
}

/** Threaded follow-up chat with the coach — grounded in the same verified numbers. */
function CoachChat() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<CoachChatMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Lazy-load the latest thread the first time the chat is opened
  useEffect(() => {
    if (!open || loaded) return;
    let alive = true;
    api
      .coachChatThread()
      .then((res) => {
        if (!alive) return;
        setThreadId(res.threadId);
        setMessages(res.messages);
        setLoaded(true);
      })
      .catch(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [open, loaded]);

  // Keep the newest message in view
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, sending]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);
    const optimistic: CoachChatMessage = {
      id: `tmp_${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      const res = await api.coachChatSend(text, threadId ?? undefined);
      setThreadId(res.threadId);
      setMessages((prev) => [...prev.filter((m) => m.id !== optimistic.id), optimistic, res.reply]);
      if (res.engineSource === "deterministic_fallback") {
        toast({ title: "Coach answered offline", description: "AI was unreachable — reply generated from your verified numbers." });
      }
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setInput(text); // restore so the user can retry
      toast({
        title: "Message not sent",
        description: e instanceof Error ? e.message : "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-4 border-t border-primary/15 pt-3">
      {!open ? (
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground hover:text-foreground" onClick={() => setOpen(true)}>
          <MessageCircle className="h-4 w-4" aria-hidden /> Ask a follow-up question
        </Button>
      ) : (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <MessageCircle className="h-3.5 w-3.5 text-primary" aria-hidden /> Follow-up chat
              <span className="font-normal text-muted-foreground">— grounded in today&apos;s verified numbers</span>
            </p>
            <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Close chat" onClick={() => setOpen(false)}>
              <X className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>

          {loaded && messages.length > 0 && (
            <div ref={listRef} className="max-h-64 space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin]" aria-live="polite">
              {messages.map((m) => (
                <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  {m.role === "assistant" && (
                    <span className="mr-2 mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15" aria-hidden>
                      <Sparkles className="h-3 w-3 text-primary" />
                    </span>
                  )}
                  <div
                    className={cn(
                      "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-xs leading-relaxed",
                      m.role === "user"
                        ? "rounded-br-sm bg-primary text-primary-foreground shadow-sm"
                        : "rounded-bl-sm border bg-background/80 text-foreground",
                    )}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start" aria-label="Coach is typing">
                  <span className="mr-2 mt-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary/15" aria-hidden>
                    <Sparkles className="h-3 w-3 text-primary" />
                  </span>
                  <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm border bg-background/80 px-3 py-2.5">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:300ms]" />
                  </div>
                </div>
              )}
            </div>
          )}

          {loaded && messages.length === 0 && (
            <p className="rounded-lg border border-dashed bg-background/50 px-3 py-2 text-xs text-muted-foreground">
              Ask things like “what should I prioritize for dinner?” — the coach answers from your logged data, not guesswork.
            </p>
          )}

          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend();
            }}
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask the coach…"
              maxLength={500}
              aria-label="Your question for the coach"
              className="h-9 rounded-full bg-background"
              disabled={sending}
            />
            <Button type="submit" size="icon" className="h-9 w-9 shrink-0 rounded-full" disabled={sending || input.trim().length < 2} aria-label="Send question">
              {sending ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
