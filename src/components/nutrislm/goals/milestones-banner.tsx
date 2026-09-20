"use client";

/**
 * Milestones banner — the reference design's top strip: progress ring with
 * unlocked count, a rotating deterministic quote, and the "Set a new goal"
 * action. The "+N" chip shows the user's REAL logging streak (no invented
 * unlock dates) and the ring is driven by the existing milestones endpoint.
 */
import { Flame, Plus, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { MilestonesResponse } from "@/lib/client/types";
import { ProgressRing } from "./progress-ring";

/** Deterministic quote-of-the-day (no randomness across renders). */
const QUOTES = [
  "Discipline today, a healthier tomorrow.",
  "Small steps every day still count.",
  "Consistency is louder than intensity.",
  "Progress, not perfection.",
  "Every logged meal is a vote for you.",
  "Your habits today shape your health tomorrow.",
];

export function MilestonesBanner({
  milestones,
  onSetNewGoal,
}: {
  milestones: MilestonesResponse | null;
  onSetNewGoal: () => void;
}) {
  const dayIndex = Math.floor(Date.now() / 86_400_000) % QUOTES.length;
  const quote = QUOTES[dayIndex];

  return (
    <Card className="overflow-hidden rounded-3xl border-primary/10 shadow-sm shadow-black/[0.03]">
      <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:gap-0 lg:divide-x lg:divide-border/70">
        {/* ring + copy */}
        <div className="flex min-w-0 flex-1 items-center gap-4">
          {milestones ? (
            <>
              <ProgressRing
                progress={milestones.totalCount > 0 ? milestones.achievedCount / milestones.totalCount : 0}
                size={78}
                stroke={9}
              >
                <span className="text-base font-extrabold tabular-nums leading-none">
                  {milestones.achievedCount}
                  <span className="text-muted-foreground">/{milestones.totalCount}</span>
                </span>
              </ProgressRing>
              <div className="min-w-0">
                <h2 className="text-base font-bold leading-tight sm:text-lg">Milestones unlocked</h2>
                <p className="truncate text-xs text-muted-foreground sm:text-sm">You&apos;re on a great journey!</p>
                <span
                  className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400"
                  title="Real logging streak computed from your meal history"
                >
                  <Flame className="h-3 w-3" aria-hidden />
                  {milestones.stats.loggingStreak}-day streak
                </span>
              </div>
            </>
          ) : (
            <>
              <Skeleton className="h-[78px] w-[78px] rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>
            </>
          )}
        </div>

        {/* quote */}
        <div className="min-w-0 flex-1 lg:px-6">
          <figure className="rounded-2xl border border-primary/10 bg-muted/40 px-4 py-3">
            <blockquote className="flex items-start gap-1.5 font-serif text-sm italic leading-snug text-foreground/90 sm:text-[15px]">
              <span aria-hidden className="text-lg font-bold leading-none text-primary">
                &ldquo;
              </span>
              {quote}
              <span aria-hidden className="self-end text-lg font-bold leading-none text-primary">
                &rdquo;
              </span>
            </blockquote>
            <figcaption className="sr-only">Motivation of the day</figcaption>
          </figure>
        </div>

        {/* action */}
        <div className="flex shrink-0 lg:pl-6">
          <Button
            onClick={onSetNewGoal}
            size="lg"
            className="w-full gap-2 rounded-xl text-sm font-semibold shadow-sm shadow-primary/20 lg:w-auto"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Set a new goal
          </Button>
        </div>
      </div>
      {/* visually-hidden summary for screen readers while loading */}
      {!milestones && (
        <p className="sr-only">
          <TrendingUp className="inline" /> Loading your milestone progress…
        </p>
      )}
    </Card>
  );
}
