"use client";

/**
 * Upcoming milestones — the closest-to-unlock locked badges as a roadmap list
 * (icon + label + real progress bar). Reference shows calendar dates; those
 * would be fabricated here, so each row instead shows honest progress + the
 * exact remaining count. "View all" opens a dialog with the full board.
 */
import { useState } from "react";
import { ArrowRight, Flag, Lock, Trophy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { AchievementBadge3D } from "../three-d";
import { Skeleton } from "@/components/ui/skeleton";
import type { MilestonesResponse } from "@/lib/client/types";

function MilestoneRow({ m, rank }: { m: { icon: string; label: string; description: string; value: number; goal: number; progress: number }; rank: number }) {
  const remaining = Math.max(1, m.goal - m.value);
  return (
    <li className="flex items-center gap-3" title={m.description}>
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted/70 text-base"
      >
        {m.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[13px] font-semibold">{m.label}</span>
          <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
            {Math.round(m.progress * 100)}% there
          </span>
        </span>
        <span className="mt-1 flex items-center gap-2">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-[width] duration-700"
              style={{ width: `${Math.max(m.progress * 100, m.progress > 0 ? 6 : 0)}%` }}
            />
          </span>
          <span className="shrink-0 text-[10px] font-semibold tabular-nums text-muted-foreground">
            {m.value} / {m.goal}
          </span>
        </span>
      </span>
      <span className="sr-only">
        {rank === 0 ? "Closest milestone." : ""} {remaining} {remaining === 1 ? "step" : "steps"} remaining.
      </span>
    </li>
  );
}

export function UpcomingMilestones({
  milestones,
  loading,
}: {
  milestones: MilestonesResponse | null;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);

  const locked = (milestones?.milestones ?? [])
    .filter((m) => !m.achieved)
    .sort((a, b) => b.progress - a.progress);
  const unlocked = (milestones?.milestones ?? []).filter((m) => m.achieved);
  const top5 = locked.slice(0, 5);

  return (
    <Card className="flex h-full flex-col rounded-3xl border-border/80 shadow-sm shadow-black/[0.02]">
      <CardContent className="flex h-full flex-col gap-3.5 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-bold sm:text-[15px]">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden>
              <Flag className="h-4 w-4" />
            </span>
            Upcoming Milestones
          </h3>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <button
                type="button"
                className="flex shrink-0 items-center gap-1 rounded-md text-xs font-semibold text-primary transition hover:gap-1.5 hover:underline"
                aria-label="View all milestones"
              >
                View all <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-md rounded-2xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-amber-500" aria-hidden /> All milestones
                </DialogTitle>
                <DialogDescription>
                  {milestones
                    ? `${milestones.achievedCount} of ${milestones.totalCount} unlocked — earned automatically from your logged data.`
                    : "Loading your badge board…"}
                </DialogDescription>
              </DialogHeader>
              <ScrollArea className="max-h-[55vh] pr-3">
                <div className="space-y-5">
                  <section aria-label="Unlocked">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      Unlocked ({unlocked.length})
                    </p>
                    {unlocked.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Nothing yet — your first log will unlock one!</p>
                    ) : (
                      <ul className="space-y-2">
                        {unlocked.map((m) => (
                          <li key={m.id} className="depth-hover flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/[0.06] p-2.5">
                            <AchievementBadge3D
                              label={`${m.label} achievement`}
                              size={34}
                              tone={m.id.includes("streak") ? "amber" : m.id.includes("water") || m.id.includes("hydr") ? "teal" : "emerald"}
                            >
                              {m.icon}
                            </AchievementBadge3D>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-semibold">{m.label}</span>
                              <span className="block truncate text-[11px] text-muted-foreground">{m.description}</span>
                            </span>
                            <Trophy className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                  <section aria-label="In progress">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      In progress ({locked.length})
                    </p>
                    <ul className="space-y-3">
                      {locked.map((m) => (
                        <MilestoneRow key={m.id} m={m} rank={top5.indexOf(m)} />
                      ))}
                      {locked.length === 0 && (
                        <li className="text-xs text-muted-foreground">Everything unlocked — legendary.</li>
                      )}
                    </ul>
                  </section>
                </div>
              </ScrollArea>
            </DialogContent>
          </Dialog>
        </div>

        {loading || !milestones ? (
          <ul className="space-y-3.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-xl" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-2 w-full" />
                </div>
              </li>
            ))}
          </ul>
        ) : top5.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1.5 py-6 text-center">
            <span className="text-3xl" aria-hidden>
              🎉
            </span>
            <p className="text-sm font-semibold">All milestones unlocked!</p>
            <p className="text-xs text-muted-foreground">You&apos;ve earned every badge on the board.</p>
          </div>
        ) : (
          <ul className="flex-1 space-y-3.5" aria-label="Closest milestones">
            {top5.map((m, i) => (
              <MilestoneRow key={m.id} m={m} rank={i} />
            ))}
          </ul>
        )}

        <p className="flex items-center gap-1.5 text-[10.5px] leading-snug text-muted-foreground/80">
          <Lock className="h-3 w-3 shrink-0" aria-hidden />
          Badges unlock automatically from real logged data — never guessed.
        </p>
      </CardContent>
    </Card>
  );
}
