"use client";

/**
 * Goals summary card — completed / in-progress / not-started donut with legend,
 * plus a "You're doing amazing!" banner whose hint is the user's REAL closest
 * locked milestone (never a fabricated line).
 */
import { BarChart3, Trophy } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { GoalItem, MilestonesResponse } from "@/lib/client/types";
import { AchievementBadge3D, TiltCard } from "../three-d";
import { GoalsDonut } from "./goals-donut";

function nextHint(goals: GoalItem[] | null, milestones: MilestonesResponse | null): string {
  if (goals && milestones) {
    const locked = milestones.milestones
      .filter((m) => !m.achieved)
      .sort((a, b) => b.progress - a.progress)[0];
    if (locked) {
      const remaining = Math.max(1, locked.goal - locked.value);
      return `${locked.label} is only ${remaining} ${remaining === 1 ? "step" : "steps"} away — keep going!`;
    }
    return "Every milestone unlocked — you're incredible!";
  }
  return "Small steps make a big difference.";
}

export function GoalsSummary({
  goals,
  milestones,
  loading,
}: {
  goals: GoalItem[] | null;
  milestones: MilestonesResponse | null;
  loading: boolean;
}) {
  const s = goals
    ? {
        completed: goals.filter((g) => g.status === "completed").length,
        inProgress: goals.filter((g) => g.status === "in_progress").length,
        notStarted: goals.filter((g) => g.status === "not_started").length,
      }
    : null;

  return (
    <TiltCard max={3.5} lift={2}>
      <Card className="flex h-full flex-col rounded-3xl border-border/80 shadow-sm shadow-black/[0.02]">
      <CardContent className="flex h-full flex-col gap-4 p-4 sm:p-5">
        <h3 className="flex items-center gap-2 text-sm font-bold sm:text-[15px]">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden>
            <BarChart3 className="h-4 w-4" />
          </span>
          Your Goals Summary
        </h3>

        {loading || !s ? (
          <div className="flex items-center gap-5">
            <Skeleton className="h-[150px] w-[150px] rounded-full" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <GoalsDonut completed={s.completed} inProgress={s.inProgress} notStarted={s.notStarted} size={134} />
            <ul className="min-w-0 flex-1 space-y-2.5" aria-label="Goal status breakdown">
              {[
                { label: "Completed", n: s.completed, dot: "bg-emerald-500" },
                { label: "In Progress", n: s.inProgress, dot: "bg-amber-400" },
                { label: "Not Started", n: s.notStarted, dot: "bg-muted-foreground/25" },
              ].map((row) => (
                <li key={row.label} className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="flex items-center gap-2 font-medium">
                    <span aria-hidden className={cnDot(row.dot)} />
                    {row.label}
                  </span>
                  <span className="font-bold tabular-nums">{row.n}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* trophy banner */}
        <div className="mt-auto rounded-2xl border border-amber-500/25 bg-gradient-to-r from-amber-500/10 via-emerald-500/[0.07] to-transparent p-3.5">
          <button
            type="button"
            className="group flex w-full items-center gap-3 text-left"
            aria-label="Milestone encouragement"
          >
            <AchievementBadge3D label="Milestone encouragement" tone="amber" size={36}>
              🏆
            </AchievementBadge3D>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-[13px] font-bold text-amber-700 dark:text-amber-300">
                <Trophy className="h-3.5 w-3.5" aria-hidden />
                You&apos;re doing amazing!
              </span>
              <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-muted-foreground">
                {nextHint(goals, milestones)}
              </span>
            </span>
          </button>
        </div>
      </CardContent>
      </Card>
    </TiltCard>
  );
}

function cnDot(dot: string): string {
  return `h-2.5 w-2.5 shrink-0 rounded-full ${dot}`;
}
