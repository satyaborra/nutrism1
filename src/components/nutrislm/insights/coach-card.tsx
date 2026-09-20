"use client";

/**
 * Ask NutriSLM Coach — the reference design's lavender coach card, wired to the
 * REAL coach-chat API (grounded in the user's deterministic numbers). Suggestion
 * chips fill the input; sending expands an inline thread. Falls back to the
 * backend's rule-based guidance when the AI is unavailable (engineSource).
 */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Loader2, Send, Sparkles } from "lucide-react";
import { api } from "@/lib/client/api";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "Why is my sugar intake high?",
  "How can I improve protein?",
  "Suggest healthy dinner options?",
  "Am I on track with my goals?",
];

interface ChatLine {
  role: "user" | "assistant";
  content: string;
  fallback?: boolean;
}

export function CoachCard() {
  const [messages, setMessages] = useState<ChatLine[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const threadIdRef = useRef<string | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || sending) return;
    setInput("");
    setError(null);
    setMessages((m) => [...m, { role: "user", content: msg }]);
    setSending(true);
    try {
      const res = await api.coachChatSend(msg, threadIdRef.current);
      threadIdRef.current = res.threadId;
      setMessages((m) => [...m, { role: "assistant", content: res.reply.content, fallback: res.engineSource !== "ai" }]);
    } catch (e) {
      setError(
        e instanceof Error && e.message.includes("Too many requests")
          ? "The coach needs a short pause — try again in a couple of minutes."
          : "Could not reach the coach just now. Please try again.",
      );
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  return (
    <section
      aria-label="Ask NutriSLM Coach"
      className="relative flex flex-col overflow-hidden rounded-2xl border border-violet-200/70 bg-gradient-to-br from-violet-50 via-[#f3efff] to-[#e7ddff] p-5 shadow-sm shadow-black/[0.03] transition-shadow duration-300 hover:shadow-md hover:shadow-violet-500/10 dark:border-violet-500/20 dark:from-violet-950/70 dark:via-[#1d1533] dark:to-[#251b40] lg:col-span-4"
    >
      {/* mascot */}
      <img
        src="/images/coach-mascot.png"
        alt=""
        aria-hidden
        className="pointer-events-none absolute -right-3 top-2 hidden h-24 w-24 object-contain mix-blend-multiply sm:block dark:mix-blend-screen dark:opacity-80 [mask-image:radial-gradient(circle_at_center,black_55%,transparent_72%)]"
      />

      <header className="relative flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/15 text-violet-600 dark:text-violet-300" aria-hidden>
          <Sparkles className="h-[18px] w-[18px]" />
        </span>
        <div>
          <h3 className="text-[15px] font-bold leading-tight">Ask NutriSLM Coach</h3>
          <p className="text-xs text-muted-foreground">Grounded in your own numbers</p>
        </div>
      </header>

      <AnimatePresence initial={false}>
        {messages.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="relative overflow-hidden"
          >
            <div ref={scrollRef} className="mt-3 max-h-48 space-y-2.5 overflow-y-auto pr-1 [scrollbar-width:thin]">
              {messages.map((m, i) => (
                <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[12px] leading-relaxed shadow-sm",
                      m.role === "user"
                        ? "rounded-br-md bg-violet-600 text-white"
                        : "rounded-bl-md border border-border/50 bg-card text-foreground",
                    )}
                  >
                    {m.content}
                    {m.fallback && m.role === "assistant" && (
                      <span className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Bot className="h-3 w-3" aria-hidden /> offline guidance mode
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-border/50 bg-card px-3 py-2.5 shadow-sm" aria-label="Coach is typing">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400"
                        style={{ animationDelay: `${i * 140}ms` }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <p role="alert" className="relative mt-2 rounded-lg bg-rose-500/10 px-3 py-1.5 text-[11px] font-medium text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}

      <p className="relative mt-3 w-fit rounded-full bg-white/70 px-3 py-1 text-[11px] font-medium text-violet-900/70 shadow-sm dark:bg-white/10 dark:text-violet-100/70">
        What would you like to know?
      </p>

      <div className="relative mt-2 grid grid-cols-1 gap-1.5 @[330px]:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => void send(s)}
            disabled={sending}
            className="rounded-xl bg-white/80 px-3 py-2 text-left text-[11.5px] font-medium leading-snug text-violet-950/80 shadow-sm ring-1 ring-violet-500/10 transition-all duration-150 hover:-translate-y-px hover:bg-white hover:shadow focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60 dark:bg-white/10 dark:text-violet-100/90 dark:hover:bg-white/15"
          >
            {s}
          </button>
        ))}
      </div>

      <form
        className="relative mt-3 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <label htmlFor="coach-ask-input" className="sr-only">
          Ask anything about your nutrition
        </label>
        <input
          id="coach-ask-input"
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything about your nutrition..."
          autoComplete="off"
          maxLength={500}
          className="h-10 w-full rounded-full border border-white/60 bg-white/90 px-4 text-[12.5px] shadow-inner outline-none transition-shadow placeholder:text-violet-950/35 focus:ring-2 focus:ring-violet-400/50 dark:border-white/10 dark:bg-white/10 dark:placeholder:text-violet-100/30"
        />
        <button
          type="submit"
          disabled={sending || input.trim().length === 0}
          aria-label="Send question to the coach"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-md shadow-emerald-600/25 transition-all duration-150 hover:scale-105 hover:shadow-lg disabled:opacity-50 disabled:hover:scale-100"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4 -translate-x-px" aria-hidden />}
        </button>
      </form>
    </section>
  );
}
