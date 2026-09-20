"use client";

/**
 * AI COACH — the context-aware nutrition intelligence screen.
 *
 * Desktop (spec §42): LEFT today's verified nutrition · CENTER coach
 * conversation · RIGHT today's meal plan timeline. Mobile: stacked, chat last.
 *
 * Source-of-truth rules visible in the UI: recommendation cards show
 * DETERMINISTIC nutrition (computed server-side from the food DB), a "Why?"
 * grounded in the user's context, and [Log this meal] / [Swap] actions that
 * go through the same verified pipeline as manual logging. Evidence is shown
 * as compact cards with "View source" — never raw RAG chunks.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUp,
  Bot,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  Circle,
  Droplets,
  Flame,
  Info,
  Leaf,
  Loader2,
  RefreshCw,
  Sparkles,
  ArrowLeftRight as SwapHorizontal,
  UtensilsCrossed,
  Wheat,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { api, ApiError } from "@/lib/client/api";
import type {
  CoachCard,
  CoachContextPayload,
  CoachEvidenceCard,
  CoachGapsCard,
  CoachHistoryCard,
  CoachPlanCard,
  CoachRecommendationCard,
  CoachSnapshotResponse,
  CoachWaterCard,
} from "@/lib/client/types";
import { useNutriStore } from "../store";
import { FadeIn } from "../fade-in";

const SUGGESTIONS = [
  { emoji: "🍽", label: "What did I eat today?" },
  { emoji: "🥗", label: "What should I eat next?" },
  { emoji: "📅", label: "Plan the rest of my day" },
  { emoji: "📊", label: "How am I doing today?" },
  { emoji: "💧", label: "How much water do I have left?" },
  { emoji: "🔄", label: "Give me another dinner" },
  { emoji: "💡", label: "What should I improve?" },
  { emoji: "📈", label: "Review my week" },
];

interface CoachUIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  cards?: CoachCard[];
  intent?: string | null;
  engineSource?: "ai" | "deterministic_fallback";
}

const SLOT_ICONS: Record<string, string> = { breakfast: "🌅", lunch: "🍛", snack: "🥜", dinner: "🌙" };
const SLOT_TITLES: Record<string, string> = { breakfast: "Breakfast", lunch: "Lunch", snack: "Snack", dinner: "Dinner" };

export function CoachView() {
  const dataVersion = useNutriStore((s) => s.dataVersion);
  const bumpData = useNutriStore((s) => s.bumpData);
  const { toast } = useToast();

  const [ctx, setCtx] = useState<CoachContextPayload | null>(null);
  const [snapshot, setSnapshot] = useState<CoachSnapshotResponse | null>(null);
  const [messages, setMessages] = useState<CoachUIMessage[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [logSlot, setLogSlot] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ctxError, setCtxError] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const refreshContext = useCallback(async () => {
    try {
      const [c, s] = await Promise.all([api.coachContext(), api.coachSnapshot()]);
      setCtx(c.context);
      setSnapshot(s);
      setCtxError(null);
    } catch (e) {
      setCtxError(e instanceof ApiError ? e.message : "Could not load your nutrition context.");
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      await refreshContext();
      try {
        const t = await api.coachChatThreadV2();
        if (alive && t.threadId) {
          setThreadId(t.threadId);
          setMessages(
            t.messages.map((m) => ({ id: m.id, role: m.role, content: m.content, intent: m.intent })),
          );
        }
      } catch {
        /* fresh thread */
      }
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Any meal/water/profile mutation elsewhere bumps dataVersion → refresh context
  useEffect(() => {
    if (dataVersion > 0) void refreshContext();
  }, [dataVersion, refreshContext]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  const greeting = useMemo(() => {
    if (!ctx) return "";
    const h = Number(ctx.current_time.slice(0, 2));
    const part = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
    return `Good ${part}, ${ctx.greetingName} 👋`;
  }, [ctx]);

  async function send(raw?: string) {
    const message = (raw ?? input).trim();
    if (!message || sending) return;
    setInput("");
    setSending(true);
    setMessages((prev) => [...prev, { id: `u_${Date.now()}`, role: "user", content: message }]);
    try {
      const res = await api.coachChatSendV2(message, threadId ?? undefined);
      setThreadId(res.threadId);
      setMessages((prev) => [
        ...prev,
        { id: res.message.id, role: "assistant", content: res.message.content, cards: res.cards, intent: res.intent, engineSource: res.engineSource },
      ]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          id: `e_${Date.now()}`,
          role: "assistant",
          content: e instanceof ApiError ? e.message : "I couldn't reach the coaching service. Please try again in a moment.",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  async function planRestOfDay() {
    if (planning) return;
    setPlanning(true);
    setMessages((prev) => [...prev, { id: `u_${Date.now()}`, role: "user", content: "Plan the rest of my day" }]);
    try {
      const res = await api.coachPlanRestOfDay();
      setMessages((prev) => [...prev, { id: `p_${Date.now()}`, role: "assistant", content: res.text, cards: [res.card] }]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { id: `pe_${Date.now()}`, role: "assistant", content: e instanceof ApiError ? e.message : "Planning is unavailable right now — please try again shortly." },
      ]);
    } finally {
      setPlanning(false);
    }
  }

  async function logRecommended(card: CoachRecommendationCard | CoachPlanCard["slots"][number]) {
    const items = "kind" in card ? card.items : (card.items ?? []);
    if (items.length === 0) {
      toast({ title: "This recommendation doesn't have loggable items", variant: "destructive" });
      return;
    }
    const slot = card.slot;
    setLogSlot(slot);
    try {
      await api.logMeal({
        requestId: `coach_${Date.now().toString(36)}`,
        mealType: slot,
        source: "recommendation",
        foods: items.map((i) => ({ foodId: i.foodId, name: i.name, quantity: i.quantity, unit: i.unit })),
      });
      bumpData();
      toast({ title: `${SLOT_TITLES[slot] ?? "Meal"} logged`, description: "Your day and coach context were updated instantly." });
      // Replace recommended card state: mark thread panel fresh (context refresh handles numbers)
    } catch (e) {
      toast({ title: "Could not log this meal", description: e instanceof ApiError ? e.message : "Please try again.", variant: "destructive" });
    } finally {
      setLogSlot(null);
    }
  }

  async function swap(card: CoachRecommendationCard) {
    if (sending) return;
    setSending(true);
    try {
      const res = await api.coachMealSwap(card.slot, card.candidateId);
      setMessages((prev) => [
        ...prev,
        { id: `s_${Date.now()}`, role: "user", content: `Give me another ${SLOT_TITLES[res.card.slot]?.toLowerCase() ?? res.card.slot}` },
        { id: `s2_${Date.now()}`, role: "assistant", content: res.text, cards: [res.card] },
      ]);
    } catch (e) {
      toast({ title: "Could not swap the meal", description: e instanceof ApiError ? e.message : "Please try again.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3" aria-busy="true">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
        <p className="text-sm text-muted-foreground">Preparing your nutrition context…</p>
      </div>
    );
  }

  if (ctxError || !ctx) {
    return (
      <Card className="mx-auto mt-10 max-w-md p-6 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" aria-hidden />
        <p className="mt-3 font-semibold">Coach context unavailable</p>
        <p className="mt-1 text-sm text-muted-foreground">{ctxError}</p>
        <Button className="mt-4" variant="outline" onClick={() => void refreshContext()}>
          <RefreshCw className="h-4 w-4" aria-hidden /> Retry
        </Button>
      </Card>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
      {/* ---------------- hero ---------------- */}
      <FadeIn className="relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-emerald-50 via-white to-teal-50/60 p-6 sm:p-8 dark:from-emerald-950/40 dark:via-background dark:to-teal-950/20">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
          <Bot className="absolute right-8 top-6 h-16 w-16 rotate-6 text-primary/15" strokeWidth={1.2} />
        </div>
        <div className="relative flex items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary shadow-sm">
            <Bot className="h-7 w-7" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">AI Coach · Your personalized nutrition companion</p>
            <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight sm:text-3xl">
              {greeting} <span className="font-script text-primary">here&apos;s your nutrition day so far.</span>
            </h1>
            {snapshot && (
              <p className="mt-2 text-sm text-muted-foreground">
                {snapshot.summaryLine}
                {snapshot.nextSlot ? ` · Next: ${SLOT_TITLES[snapshot.nextSlot] ?? snapshot.nextSlot}` : ""}
              </p>
            )}
          </div>
        </div>
      </FadeIn>

      {/* ---------------- 3-column desktop layout ---------------- */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[300px_minmax(0,1fr)_320px]">
        {/* LEFT — today's nutrition + meals + focus */}
        <div className="order-2 flex flex-col gap-5 lg:order-1">
          <TodayPanel ctx={ctx} />
          <MealsTodayPanel ctx={ctx} onAsk={(q) => void send(q)} />
          <FocusPanel ctx={ctx} />
        </div>

        {/* CENTER — conversation */}
        <Card className="order-1 flex min-h-[560px] flex-col overflow-hidden rounded-3xl border-border/70 lg:order-2">
          <div className="flex items-center gap-2.5 border-b border-border/60 px-5 py-3.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/12 text-primary">
              <Sparkles className="h-4.5 w-4.5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold leading-tight">Ask your coach</p>
              <p className="text-xs text-muted-foreground">Context-aware · grounded in your verified numbers</p>
            </div>
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 rounded-full text-xs" onClick={() => void planRestOfDay()} disabled={planning}>
              {planning ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <CalendarRange className="h-3.5 w-3.5" aria-hidden />}
              Plan rest of day
            </Button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5 [max-height:640px]" role="log" aria-label="Coach conversation" aria-live="polite">
            {messages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center gap-3 py-10 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Bot className="h-7 w-7" aria-hidden />
                </span>
                <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                  I already know your day — meals logged, macros remaining, water and your health profile. Ask me anything below, or start with a suggestion.
                </p>
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className="space-y-2.5">
                <MessageBubble message={m} />
                {m.cards?.map((card, i) => (
                  <CardRenderer
                    key={`${m.id}_card_${i}`}
                    card={card}
                    onLog={(c) => void logRecommended(c)}
                    onSwap={(c) => void swap(c)}
                    loggingSlot={logSlot}
                  />
                ))}
              </div>
            ))}
            {sending && (
              <div className="flex items-center gap-2 pl-1 text-sm text-muted-foreground" aria-live="polite">
                <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
                Coach is thinking…
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* starter chips */}
          <div className="flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:px-5 [&::-webkit-scrollbar]:hidden">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.label}
                type="button"
                disabled={sending}
                onClick={() => void send(s.label)}
                className="shrink-0 rounded-full border border-primary/25 bg-primary/5 px-3.5 py-1.5 text-xs font-medium text-foreground/85 transition-colors hover:bg-primary/15 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
              >
                <span aria-hidden className="mr-1">{s.emoji}</span>
                {s.label}
              </button>
            ))}
          </div>

          <form
            className="flex items-center gap-2 border-t border-border/60 p-3.5 sm:px-5"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask your coach… (e.g. what should I eat tonight?)"
              maxLength={600}
              aria-label="Ask your coach"
              className="h-11 flex-1 rounded-full bg-background"
            />
            <Button type="submit" size="icon" className="h-11 w-11 shrink-0 rounded-full" disabled={sending || input.trim().length < 2} aria-label="Send question">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArrowUp className="h-4 w-4" aria-hidden />}
            </Button>
          </form>
        </Card>

        {/* RIGHT — meal plan timeline */}
        <div className="order-3 flex flex-col gap-5">
          <PlanSidePanel ctx={ctx} onPlan={() => void planRestOfDay()} planning={planning} />
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ left panels

function TodayPanel({ ctx }: { ctx: CoachContextPayload }) {
  const n = ctx.nutrition;
  const rows = [
    { label: "Calories", icon: Flame, tone: "text-rose-500", consumed: n.calories.consumed, target: n.calories.target, unit: "kcal", pct: n.calories.pct, decimals: 0 },
    { label: "Protein", icon: Wheat, tone: "text-emerald-500", consumed: n.protein.consumed, target: n.protein.target, unit: "g", pct: n.protein.pct, decimals: 0 },
    { label: "Carbs", icon: UtensilsCrossed, tone: "text-amber-500", consumed: n.carbohydrates.consumed, target: n.carbohydrates.target, unit: "g", pct: n.carbohydrates.pct, decimals: 0 },
    { label: "Fat", icon: Droplets, tone: "text-rose-400", consumed: n.fat.consumed, target: n.fat.target, unit: "g", pct: n.fat.pct, decimals: 0 },
    { label: "Fiber", icon: Leaf, tone: "text-teal-500", consumed: n.fiber.consumed, target: n.fiber.target, unit: "g", pct: n.fiber.pct, decimals: 0 },
  ];
  return (
    <Card className="rounded-3xl border-border/70 p-5">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Today</p>
      <div className="mt-3 space-y-3.5">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-1.5 font-semibold text-foreground/85">
                <r.icon className={`h-4 w-4 ${r.tone}`} aria-hidden />
                {r.label}
              </span>
              <span className="tabular-nums text-muted-foreground">
                <span className="font-bold text-foreground">{r.consumed.toFixed(r.decimals)}</span> / {r.target.toFixed(r.decimals)} {r.unit}
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-primary/10">
              <div
                className={`h-full rounded-full transition-[width] duration-500 ${r.pct > 1 ? "bg-rose-400" : "bg-primary"}`}
                style={{ width: `${Math.min(100, r.pct * 100)}%` }}
              />
            </div>
          </div>
        ))}
        {/* water */}
        <div>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-1.5 font-semibold text-foreground/85">
              <Droplets className="h-4 w-4 text-sky-500" aria-hidden />
              Water
            </span>
            <span className="tabular-nums text-muted-foreground">
              <span className="font-bold text-foreground">{ctx.water.glasses}</span> / {ctx.water.target} glasses
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-primary/10">
            <div className="h-full rounded-full bg-sky-400 transition-[width] duration-500" style={{ width: `${Math.min(100, (ctx.water.glasses / ctx.water.target) * 100)}%` }} />
          </div>
        </div>
      </div>
    </Card>
  );
}

function MealsTodayPanel({ ctx, onAsk }: { ctx: CoachContextPayload; onAsk: (q: string) => void }) {
  const slotOrder = ["breakfast", "lunch", "snack", "dinner"];
  const byType = new Map(ctx.meals.map((m) => [m.mealType, m] as const));
  return (
    <Card className="rounded-3xl border-border/70 p-5">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Meals today</p>
      <ul className="mt-3 space-y-2.5">
        {slotOrder.map((slot) => {
          const m = byType.get(slot);
          return (
            <li key={slot} className="flex items-center justify-between gap-2 rounded-2xl bg-muted/40 px-3 py-2">
              <span className="flex min-w-0 items-center gap-2 text-sm">
                <span aria-hidden>{SLOT_ICONS[slot]}</span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold leading-tight">{SLOT_TITLES[slot]}</span>
                  <span className="block truncate text-xs text-muted-foreground">{m ? m.foods.join(" + ") : "Not logged yet"}</span>
                </span>
              </span>
              <span className="shrink-0 text-xs font-bold tabular-nums text-foreground/70">{m ? `${Math.round(m.calories)} kcal` : "—"}</span>
            </li>
          );
        })}
      </ul>
      <Button variant="ghost" size="sm" className="mt-2.5 h-8 w-full justify-center rounded-full text-xs text-primary hover:bg-primary/10" onClick={() => onAsk("What did I eat today?")}>
        Ask for a full recap →
      </Button>
    </Card>
  );
}

function FocusPanel({ ctx }: { ctx: CoachContextPayload }) {
  const n = ctx.nutrition;
  const gaps: string[] = [];
  if (n.protein.remaining > n.protein.target * 0.25) gaps.push(`~${Math.round(n.protein.remaining)} g protein`);
  if (n.fiber.remaining > n.fiber.target * 0.25) gaps.push(`~${Math.round(n.fiber.remaining)} g fibre`);
  if (ctx.water.remaining > 0) gaps.push(`${ctx.water.remaining} glass${ctx.water.remaining === 1 ? "" : "es"} of water`);
  return (
    <Card className="rounded-3xl border-primary/20 bg-primary/5 p-5">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-primary">
        <Sparkles className="h-3.5 w-3.5" aria-hidden /> Your next focus
      </p>
      <p className="mt-2 text-sm leading-relaxed text-foreground/85">
        {gaps.length
          ? `${gaps.join(" · ")} still remaining today. A balanced next meal — protein source, vegetables and a suitable carbohydrate portion — could fit your remaining nutrition.`
          : "You're close to your configured targets across the board — hold the current pattern and keep logging."}
      </p>
      {ctx.health_conditions.length > 0 && (
        <p className="mt-2.5 text-xs text-muted-foreground">
          Screened for {ctx.health_conditions.join(" · ")} · diet: {ctx.diet.type}
          {ctx.diet.allergies.length ? ` · allergen-free: ${ctx.diet.allergies.join(", ")}` : ""}
        </p>
      )}
    </Card>
  );
}

function PlanSidePanel({ ctx, onPlan, planning }: { ctx: CoachContextPayload; onPlan: () => void; planning: boolean }) {
  const slotOrder = ["breakfast", "lunch", "snack", "dinner"];
  const byType = new Map(ctx.meals.map((m) => [m.mealType, m] as const));
  const currentHour = Number(ctx.current_time.slice(0, 2));
  const defaultTimes: Record<string, string> = { breakfast: "08:00", lunch: "13:00", snack: "16:30", dinner: "20:00" };
  return (
    <Card className="rounded-3xl border-border/70 p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Today&apos;s plan</p>
        <Button variant="ghost" size="sm" className="h-7 rounded-full px-2.5 text-xs text-primary hover:bg-primary/10" onClick={onPlan} disabled={planning}>
          {planning ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <RefreshCw className="h-3 w-3" aria-hidden />}
          Refresh
        </Button>
      </div>
      <ol className="relative mt-4 space-y-4 border-l-2 border-primary/15 pl-4">
        {slotOrder.map((slot) => {
          const m = byType.get(slot);
          const isFuture = Number(defaultTimes[slot].slice(0, 2)) > currentHour;
          const status = m ? "logged" : isFuture ? "recommended" : "open";
          return (
            <li key={slot} className="relative">
              <span
                className={`absolute -left-[26px] top-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full ${
                  status === "logged" ? "bg-primary text-primary-foreground" : status === "recommended" ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                }`}
              >
                {status === "logged" ? <CheckCircle2 className="h-3 w-3" aria-hidden /> : status === "recommended" ? <Circle className="h-2 w-2" aria-hidden /> : <Circle className="h-2 w-2" aria-hidden />}
              </span>
              <p className="text-xs font-semibold tabular-nums text-muted-foreground">{m ? m.time : defaultTimes[slot]}</p>
              <p className="text-[13px] font-bold leading-tight">{SLOT_TITLES[slot]}</p>
              <p className={`text-xs leading-snug ${status === "logged" ? "text-foreground/80" : "text-muted-foreground"}`}>
                {m ? `${m.foods.join(" + ")} — ${Math.round(m.calories)} kcal ✓` : isFuture ? "Recommended once you tap Plan" : "Not logged"}
              </p>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
        ✓ Logged meals come from your verified entries · ○ Recommended slots are generated on demand and never overwrite logs.
      </p>
    </Card>
  );
}

// ------------------------------------------------------------------ chat bubbles + cards

function MessageBubble({ message }: { message: CoachUIMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
          isUser ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md border border-border/60 bg-muted/50 text-foreground"
        }`}
      >
        {message.content}
      </div>
    </div>
  );
}

function CardRenderer({
  card,
  onLog,
  onSwap,
  loggingSlot,
}: {
  card: CoachCard;
  onLog: (card: CoachRecommendationCard | CoachPlanCard["slots"][number]) => void;
  onSwap: (card: CoachRecommendationCard) => void;
  loggingSlot: string | null;
}) {
  switch (card.kind) {
    case "recommendation":
      return <RecommendationCardUI card={card} onLog={onLog} onSwap={onSwap} loggingSlot={loggingSlot} />;
    case "plan":
      return <PlanCardUI card={card} onLog={onLog} />;
    case "gaps":
      return <GapsCardUI card={card} />;
    case "water":
      return <WaterCardUI card={card} />;
    case "evidence":
      return <EvidenceCardUI card={card} />;
    case "history":
      return <HistoryCardUI card={card} />;
    default:
      return null;
  }
}

function RecommendationCardUI({
  card,
  onLog,
  onSwap,
  loggingSlot,
}: {
  card: CoachRecommendationCard;
  onLog: (card: CoachRecommendationCard) => void;
  onSwap: (card: CoachRecommendationCard) => void;
  loggingSlot: string | null;
}) {
  const busy = loggingSlot === card.slot;
  return (
    <Card className="overflow-hidden rounded-2xl border-primary/25 bg-gradient-to-br from-primary/5 to-transparent p-0">
      <div className="border-b border-primary/15 bg-primary/5 px-4 py-2.5">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-primary">
          <UtensilsCrossed className="h-3.5 w-3.5" aria-hidden />
          Recommended {SLOT_TITLES[card.slot] ?? card.slot}
          <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold normal-case text-primary/80">
            {card.engineSource === "ai" ? "AI-ranked · verified nutrition" : "deterministic pick"}
          </span>
        </p>
      </div>
      <div className="px-4 py-3.5">
        <p className="text-[15px] font-bold leading-snug">{card.name}</p>
        {card.items.length > 0 && (
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {card.items.map((i) => (
              <li key={`${i.foodId}_${i.name}`} className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground/75">
                {i.quantity} {i.unit} {i.name}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[
            { label: `${card.nutrition.calories} kcal`, className: "bg-rose-500/10 text-rose-600 dark:text-rose-300" },
            { label: `${card.nutrition.protein} g protein`, className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" },
            { label: `${card.nutrition.carbs} g carbs`, className: "bg-amber-500/10 text-amber-600 dark:text-amber-300" },
            { label: `${card.nutrition.fat} g fat`, className: "bg-rose-400/10 text-rose-500 dark:text-rose-300" },
            { label: `${card.nutrition.fiber} g fiber`, className: "bg-teal-500/10 text-teal-600 dark:text-teal-300" },
          ].map((chip) => (
            <span key={chip.label} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${chip.className}`}>
              {chip.label}
            </span>
          ))}
        </div>
        {card.reason && (
          <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground/80">Why: </span>
            {card.reason}
          </p>
        )}
        {card.alternatives.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">Also fits: {card.alternatives.map((a) => a.name).join(" · ")}</p>
        )}
        <div className="mt-3.5 flex gap-2">
          <Button size="sm" className="h-9 flex-1 rounded-full text-xs font-semibold" onClick={() => onLog(card)} disabled={busy}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}
            Log this meal
          </Button>
          <Button size="sm" variant="outline" className="h-9 flex-1 rounded-full text-xs font-semibold" onClick={() => onSwap(card)} disabled={busy}>
            <SwapHorizontal className="h-3.5 w-3.5" aria-hidden />
            Swap
          </Button>
        </div>
        <p className="mt-2 text-[10.5px] leading-relaxed text-muted-foreground">
          Nutrition is calculated from the verified food database — not generated by AI. This may fit your configured targets; discuss individualized medical targets with your care team.
        </p>
      </div>
    </Card>
  );
}

function PlanCardUI({ card, onLog }: { card: CoachPlanCard; onLog: (slot: CoachPlanCard["slots"][number]) => void }) {
  return (
    <Card className="overflow-hidden rounded-2xl border-teal-500/25 p-0">
      <div className="border-b border-teal-500/15 bg-teal-500/5 px-4 py-2.5">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-teal-600 dark:text-teal-300">
          <CalendarRange className="h-3.5 w-3.5" aria-hidden /> Your NutriSLM day
        </p>
      </div>
      <div className="px-4 py-3.5">
        <ol className="relative space-y-3 border-l-2 border-teal-500/20 pl-4">
          {card.slots
            .filter((s) => s.status !== "skipped" || s.name)
            .map((s) => (
              <li key={s.slot} className="relative">
                <span className={`absolute -left-[25px] top-1 h-3 w-3 rounded-full ${s.status === "logged" ? "bg-teal-500" : "bg-teal-300"}`} aria-hidden />
                <div className="flex flex-wrap items-center gap-x-2">
                  <p className="text-[13px] font-bold">{s.label}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${s.status === "logged" ? "bg-teal-500/15 text-teal-600 dark:text-teal-300" : "bg-primary/10 text-primary"}`}>
                    {s.status === "logged" ? "✓ Logged" : s.status === "recommended" ? "○ Recommended" : "—"}
                  </span>
                  {s.time && <span className="text-[11px] tabular-nums text-muted-foreground">{s.time}</span>}
                </div>
                {s.name && <p className="text-[13px] text-foreground/85">{s.name}{s.calories ? ` — ~${s.calories} kcal` : ""}</p>}
                {s.reason && <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{s.reason}</p>}
                {s.status === "recommended" && s.candidateId && (
                  <Button size="sm" variant="outline" className="mt-1.5 h-7 rounded-full px-3 text-[11px]" onClick={() => onLog(s)}>
                    <CheckCircle2 className="h-3 w-3" aria-hidden /> Log this meal
                  </Button>
                )}
              </li>
            ))}
        </ol>
        <div className="mt-3.5 grid grid-cols-2 gap-1.5 rounded-2xl bg-muted/50 p-3">
          {card.overview.map((o) => (
            <div key={o.label}>
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">{o.label}</p>
              <p className="text-xs font-bold text-foreground/90">{o.value}</p>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function GapsCardUI({ card }: { card: CoachGapsCard }) {
  return (
    <Card className="rounded-2xl border-border/70 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Nutrition state today</p>
      <div className="mt-2.5 space-y-2">
        {card.items.map((i) => (
          <div key={i.label} className="flex items-center gap-2.5">
            <span className="w-16 shrink-0 text-xs font-semibold text-foreground/80">{i.label}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${i.tone === "high" ? "bg-rose-400" : i.tone === "low" ? "bg-amber-400" : "bg-primary"}`}
                style={{ width: `${Math.min(100, i.pct * 100)}%` }}
              />
            </div>
            <span className="w-24 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
              {i.consumed}/{i.target} {i.unit}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function WaterCardUI({ card }: { card: CoachWaterCard }) {
  return (
    <Card className="rounded-2xl border-sky-500/25 bg-sky-500/5 p-4">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-sky-600 dark:text-sky-300">
        <Droplets className="h-3.5 w-3.5" aria-hidden /> Hydration
      </p>
      <div className="mt-2 flex items-center gap-1.5">
        {Array.from({ length: card.target }).map((_, i) => (
          <span key={i} className={`h-5 w-5 rounded-md border ${i < card.glasses ? "border-sky-400 bg-sky-400" : "border-sky-300/50 bg-transparent"}`} aria-hidden />
        ))}
        <span className="ml-2 text-sm font-bold tabular-nums">
          {card.glasses} / {card.target}
        </span>
      </div>
    </Card>
  );
}

function EvidenceCardUI({ card }: { card: CoachEvidenceCard }) {
  if (card.sources.length === 0) return null;
  return (
    <Card className="rounded-2xl border-border/70 p-0">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground [&::-webkit-details-marker]:hidden">
          <Info className="h-3.5 w-3.5 text-primary" aria-hidden /> Evidence ({card.sources.length})
          <span className="ml-auto text-[10px] font-medium normal-case text-primary group-open:hidden">View source</span>
          <ChevronDown className="ml-auto h-3.5 w-3.5 text-muted-foreground group-open:ml-1" aria-hidden />
        </summary>
        <div className="space-y-2 border-t border-border/60 px-4 py-3">
          <p className="text-[10.5px] text-muted-foreground">Why am I seeing this? These excerpts were retrieved because your question touches them.</p>
          {card.sources.map((s) => (
            <div key={s.id} className="rounded-xl bg-muted/50 p-2.5">
              <p className="text-[11px] font-bold text-foreground/85">{s.source}</p>
              {s.title && <p className="text-[10.5px] text-muted-foreground">{s.title}</p>}
              <p className="mt-1 text-[11px] leading-relaxed text-foreground/75">{s.snippet}…</p>
            </div>
          ))}
        </div>
      </details>
    </Card>
  );
}

function HistoryCardUI({ card }: { card: CoachHistoryCard }) {
  return (
    <Card className="rounded-2xl border-border/70 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{card.title}</p>
      <dl className="mt-2 space-y-1.5">
        {card.lines.map((l) => (
          <div key={l.label} className="flex items-baseline justify-between gap-3 text-sm">
            <dt className="text-muted-foreground">{l.label}</dt>
            <dd className="text-right font-semibold text-foreground/90">{l.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
