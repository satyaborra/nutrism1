"use client";

/**
 * AI COACH home card (spec §31): "Your nutrition snapshot is ready." —
 * meals logged, kcal consumed/remaining, protein + fiber remaining, next
 * slot, and the "Plan the rest of my day →" jump into the coach view.
 * All numbers come from /api/coach/snapshot (deterministic).
 */
import { useEffect, useState } from "react";
import { ArrowRight, Bot, Flame, Leaf, Loader2, UtensilsCrossed, Wheat } from "lucide-react";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/client/api";
import type { CoachSnapshotResponse } from "@/lib/client/types";
import { useNutriStore } from "./store";
import { SLOT_TITLES } from "./slot-labels";

export function CoachHomeCard() {
  const dataVersion = useNutriStore((s) => s.dataVersion);
  const setView = useNutriStore((s) => s.setView);
  const [snapshot, setSnapshot] = useState<CoachSnapshotResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api
      .coachSnapshot()
      .then((s) => {
        if (alive) {
          setSnapshot(s);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [dataVersion]);

  return (
    <Card className="relative overflow-hidden rounded-3xl border-primary/25 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5">
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/10 blur-2xl" />
      <div className="relative flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <Bot className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">AI Coach</p>
          <p className="mt-0.5 text-sm font-bold leading-tight">
            {loading ? "Preparing your snapshot…" : snapshot ? "Your nutrition snapshot is ready." : "Snapshot unavailable"}
          </p>
        </div>
      </div>

      {loading && (
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Reading your verified day…
        </div>
      )}

      {!loading && snapshot && (
        <>
          <dl className="mt-3.5 grid grid-cols-2 gap-2 text-[13px]">
            <div className="flex items-center gap-1.5">
              <UtensilsCrossed className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              <dt className="text-muted-foreground">Meals</dt>
              <dd className="font-bold tabular-nums">
                {snapshot.mealsLogged}/{snapshot.mealsTotal}
              </dd>
            </div>
            <div className="flex items-center gap-1.5">
              <Flame className="h-3.5 w-3.5 text-rose-500" aria-hidden />
              <dt className="text-muted-foreground">Remaining</dt>
              <dd className="font-bold tabular-nums">{snapshot.calories.remaining.toLocaleString()} kcal</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <Wheat className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
              <dt className="text-muted-foreground">Protein</dt>
              <dd className="font-bold tabular-nums">{snapshot.protein.remaining} g left</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <Leaf className="h-3.5 w-3.5 text-teal-500" aria-hidden />
              <dt className="text-muted-foreground">Fiber</dt>
              <dd className="font-bold tabular-nums">{snapshot.fiber.remaining} g left</dd>
            </div>
          </dl>

          {snapshot.nextSlot && (
            <p className="mt-3 text-xs text-muted-foreground">
              Next: <span className="font-semibold text-foreground/80">{SLOT_TITLES[snapshot.nextSlot] ?? snapshot.nextSlot}</span>
              {snapshot.priorities[0] ? ` · ${snapshot.priorities[0]}` : ""}
            </p>
          )}
        </>
      )}

      <button
        type="button"
        onClick={() => setView("coach")}
        className="mt-4 flex w-full items-center justify-between rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-transform hover:scale-[1.01] focus-visible:outline-2 focus-visible:outline-ring"
      >
        Plan the rest of my day
        <ArrowRight className="h-4 w-4" aria-hidden />
      </button>
    </Card>
  );
}
