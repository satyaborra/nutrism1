"use client";

/**
 * DailyMealTimeline — right rail of the Coach screen. Auto-plans the rest of
 * the day on mount (deterministic engine candidates), distinguishes LOGGED from
 * RECOMMENDED, and offers Log this meal / Swap per recommendation.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarClock, Check, Clock, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { api } from "@/lib/client/api";
import type { CoachCard, CoachContextResponse } from "@/lib/client/types";
import { NutritionChips, SLOT_LABEL } from "./coach-cards";

type PlanSlot = Extract<CoachCard, { kind: "plan" }>["slots"][number];

interface TimelinePlan {
  scope: "rest" | "full";
  slots: PlanSlot[];
  projected: { calories: number; protein: number; fiber: number };
  summary: string;
}

export function CoachTimeline({
  ctx,
  onLoggedMeal,
}: {
  ctx: CoachContextResponse;
  onLoggedMeal: () => void;
}) {
  const { toast } = useToast();
  const [plan, setPlan] = useState<TimelinePlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [logSlot, setLogSlot] = useState<string | null>(null);
  const [swapSlot, setSwapSlot] = useState<string | null>(null);
  const [loggedSlots, setLoggedSlots] = useState<Set<string>>(new Set());
  const autoRanFor = useRef<string>("");

  const runPlan = useCallback(
    async (scope: "rest" | "full") => {
      setLoading(true);
      try {
        const res = scope === "rest" ? await api.coachPlanRestOfDay() : await api.coachDailyPlan(scope);
        const planCard = res.cards.find((c): c is Extract<CoachCard, { kind: "plan" }> => c.kind === "plan");
        setPlan(planCard ? { scope: planCard.scope, slots: planCard.slots, projected: planCard.projected, summary: planCard.summary } : null);
      } catch (e) {
        toast({
          title: "Could not build the plan",
          description: e instanceof Error ? e.message : "Please try again in a moment.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  // Auto-plan once per data version + date (fresh plans after every mutation)
  useEffect(() => {
    const key = `${ctx.date}:${ctx.mealsLogged}:${ctx.water.glasses}`;
    if (autoRanFor.current === key) return;
    autoRanFor.current = key;
    void runPlan("rest");
  }, [ctx.date, ctx.mealsLogged, ctx.water.glasses, runPlan]);

  async function handleLog(slot: PlanSlot) {
    if (!slot.items || slot.items.length === 0) return;
    setLogSlot(slot.slot);
    try {
      await api.logMeal({
        requestId: `rec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        mealType: slot.slot,
        foods: slot.items.map((i) => ({ foodId: i.foodId, name: i.name, quantity: i.quantity, unit: i.unit })),
        source: "recommendation",
        notes: `Coach plan: ${slot.name ?? "suggested meal"}`,
      });
      setLoggedSlots((prev) => new Set(prev).add(slot.slot));
      toast({ title: "Meal logged ✓", description: `${slot.name ?? "Suggested meal"} added to your ${slot.slot}. Numbers re-verified by the engine.` });
      onLoggedMeal();
      autoRanFor.current = ""; // force a fresh rest-of-day plan
      void runPlan("rest");
    } catch (e) {
      toast({
        title: "Could not log the meal",
        description: e instanceof Error ? e.message : "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setLogSlot(null);
    }
  }

  async function handleSwap(slot: PlanSlot) {
    if (!slot.candidateId) return;
    setSwapSlot(slot.slot);
    try {
      const res = await api.coachMealSwap({ excludeIds: [slot.candidateId], slot: slot.slot });
      const recCard = res.cards.find((c): c is Extract<CoachCard, { kind: "recommendation" }> => c.kind === "recommendation");
      if (recCard && plan) {
        setPlan({
          ...plan,
          slots: plan.slots.map((s) =>
            s.slot === slot.slot
              ? {
                  ...s,
                  name: recCard.name,
                  candidateId: recCard.candidateId,
                  items: recCard.items,
                  nutrition: recCard.nutrition,
                  why: recCard.why,
                }
              : s,
          ),
        });
        toast({ title: "Swapped", description: res.text.slice(0, 120) });
      } else {
        toast({ title: "No alternative found", description: res.text.slice(0, 140) });
      }
    } catch (e) {
      toast({
        title: "Swap failed",
        description: e instanceof Error ? e.message : "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setSwapSlot(null);
    }
  }

  const slots = plan?.slots ?? null;

  return (
    <section
      aria-label="Today's meal plan"
      className="flex w-full min-w-0 flex-col gap-3 rounded-3xl border border-border/60 bg-card p-5 shadow-sm shadow-black/[0.03]"
    >
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
          <CalendarClock className="h-4 w-4 text-primary" aria-hidden />
          Today&apos;s plan
        </h2>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Refresh plan" onClick={() => void runPlan("rest")} disabled={loading}>
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} aria-hidden />
        </Button>
      </div>

      {loading && !slots && (
        <div className="space-y-2.5" aria-busy="true" aria-label="Building your plan">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-2.5">
              <div className="h-6 w-14 animate-pulse rounded-lg bg-muted" />
              <div className="h-9 flex-1 animate-pulse rounded-xl bg-muted" />
            </div>
          ))}
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Sparkles className="h-3 w-3 animate-pulse text-primary" aria-hidden /> Checking candidates against your constraints…
          </p>
        </div>
      )}

      {slots && (
        <>
          <ol className="relative space-y-2.5 border-l border-border/70 pl-4">
            {slots.map((s) => {
              const logged = s.status === "logged" || loggedSlots.has(s.slot);
              return (
                <li key={s.slot} className="relative">
                  <span
                    className={cn(
                      "absolute -left-[21px] top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 bg-card",
                      logged ? "border-emerald-500 bg-emerald-500" : s.status === "recommended" ? "border-amber-400" : "border-muted-foreground/40",
                    )}
                    aria-hidden
                  >
                    {logged && <Check className="h-2 w-2 text-white" />}
                  </span>
                  <div
                    className={cn(
                      "rounded-2xl border p-2.5",
                      logged ? "border-emerald-500/30 bg-emerald-500/5" : s.status === "recommended" ? "border-amber-400/40 bg-amber-50/50 dark:bg-amber-500/10" : "border-dashed border-border/60 bg-muted/20",
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <p className="flex items-center gap-1.5 text-xs font-bold">
                        <Clock className="h-3 w-3 text-muted-foreground" aria-hidden />
                        <span className="tabular-nums">{s.time || "--:--"}</span>
                        {SLOT_LABEL[s.slot] ?? s.slot}
                      </p>
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                          logged ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : s.status === "recommended" ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-muted text-muted-foreground",
                        )}
                      >
                        {logged ? "logged" : s.status === "recommended" ? "recommended" : "window passed"}
                      </span>
                    </div>
                    {s.name && <p className="mt-1 text-[11.5px] font-medium leading-snug text-foreground/80">{s.name}</p>}
                    {s.status === "recommended" && s.nutrition && !loggedSlots.has(s.slot) && (
                      <>
                        <div className="mt-1.5">
                          <NutritionChips n={s.nutrition} compact />
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Button
                            size="sm"
                            className="h-7 gap-1 rounded-lg px-2.5 text-[11px] font-semibold"
                            disabled={logSlot === s.slot}
                            onClick={() => void handleLog(s)}
                          >
                            {logSlot === s.slot ? "Logging…" : "Log this meal"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 rounded-lg px-2.5 text-[11px] font-semibold"
                            disabled={swapSlot === s.slot || !s.candidateId}
                            onClick={() => void handleSwap(s)}
                          >
                            <RefreshCw className={cn("h-3 w-3", swapSlot === s.slot && "animate-spin")} aria-hidden />
                            {swapSlot === s.slot ? "Swapping…" : "Swap"}
                          </Button>
                        </div>
                      </>
                    )}
                    {loggedSlots.has(s.slot) && (
                      <p className="mt-1.5 text-[10.5px] font-semibold text-emerald-600 dark:text-emerald-300">Saved — day totals updated.</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>

          <p className="rounded-2xl bg-muted/50 px-3 py-2 text-[10.5px] italic leading-snug text-muted-foreground">
            Projected with the plan: {plan?.projected.calories.toLocaleString()} kcal · {plan?.projected.protein}g protein · {plan?.projected.fiber}g fiber. {plan?.summary}
          </p>

          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-8 flex-1 rounded-xl text-xs font-semibold" onClick={() => void runPlan("full")} disabled={loading}>
              Full-day plan
            </Button>
            <Button size="sm" variant="outline" className="h-8 flex-1 rounded-xl text-xs font-semibold" onClick={() => void runPlan("rest")} disabled={loading}>
              Rest of day
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
