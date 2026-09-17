"use client";

/**
 * Milestones — deterministic achievements computed entirely from the database
 * (no AI). A compact horizontal strip: unlocked badges render as colored
 * gradient chips with a shine sweep; locked ones show a mini progress ring and
 * the current/goal count. Refreshes with the shared dataVersion so a new log
 * can unlock something right away.
 */
import { useEffect, useState } from "react";
import { Lock, Trophy } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Milestone, MilestonesResponse } from "@/lib/client/types";
import { api } from "@/lib/client/api";
import { useNutriStore } from "./store";

/** 20px progress ring (SVG) showing 0..1 progress. */
function MiniRing({ progress }: { progress: number }) {
  const r = 8;
  const c = 2 * Math.PI * r;
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" className="shrink-0 -rotate-90" aria-hidden>
      <circle cx="10" cy="10" r={r} fill="none" strokeWidth="2.5" className="stroke-muted-foreground/25" />
      <circle
        cx="10"
        cy="10"
        r={r}
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        className="stroke-amber-500 transition-[stroke-dashoffset] duration-500"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(1, Math.max(0, progress)))}
      />
    </svg>
  );
}

function MilestoneChip({ m }: { m: Milestone }) {
  if (m.achieved) {
    return (
      <div
        className="group relative flex w-40 shrink-0 items-center gap-2.5 overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-r from-primary/12 via-primary/5 to-teal-500/10 p-2.5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
        title={`${m.description} — unlocked (${m.value})`}
        tabIndex={0}
        role="listitem"
        aria-label={`${m.label}: unlocked. ${m.description}`}
      >
        {/* shine sweep */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-hover:animate-[shine_0.9s_ease-out]"
        />
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background/80 text-lg shadow-sm" aria-hidden>
          {m.icon}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-xs font-semibold">{m.label}</span>
          <span className="flex items-center gap-1 text-[10px] font-medium text-primary">
            <Trophy className="h-2.5 w-2.5" aria-hidden /> Unlocked
          </span>
        </span>
      </div>
    );
  }
  return (
    <div
      className="flex w-40 shrink-0 items-center gap-2.5 rounded-xl border border-dashed bg-muted/30 p-2.5 opacity-80 transition-colors hover:border-muted-foreground/40 hover:opacity-100"
      title={`${m.description} — ${m.value} of ${m.goal}`}
      tabIndex={0}
      role="listitem"
      aria-label={`${m.label}: locked. ${m.value} of ${m.goal}. ${m.description}`}
    >
      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center">
        <MiniRing progress={m.progress} />
        <span className="absolute text-[11px] opacity-60" aria-hidden>
          <Lock className="h-3 w-3" />
        </span>
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium text-muted-foreground">{m.label}</span>
        <span className="text-[10px] tabular-nums text-muted-foreground/80">
          {m.value} / {m.goal}
        </span>
      </span>
    </div>
  );
}

export function MilestonesStrip() {
  const dataVersion = useNutriStore((s) => s.dataVersion);
  const [data, setData] = useState<MilestonesResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .milestones()
      .then((res) => alive && setData(res))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [dataVersion]);

  // Featured order: unlocked first (newest unlock feel), then closest-to-unlock.
  const ordered: Milestone[] | null = data
    ? [...data.milestones].sort((a, b) => {
        if (a.achieved !== b.achieved) return a.achieved ? -1 : 1;
        if (!a.achieved && !b.achieved) return b.progress - a.progress;
        return 0;
      })
    : null;

  return (
    <Card className="overflow-hidden border-amber-500/20 bg-gradient-to-r from-amber-500/5 via-background to-primary/5">
      <CardHeader className="pb-2 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400" aria-hidden>
                <Trophy className="h-4 w-4" />
              </span>
              Milestones
            </CardTitle>
            <CardDescription>
              Earned automatically from your logged data — every badge is verifiable, nothing is guessed.
            </CardDescription>
          </div>
          {data && (
            <span
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] font-semibold tabular-nums",
                data.achievedCount > 0
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-muted-foreground/30 bg-muted text-muted-foreground",
              )}
            >
              {data.achievedCount} of {data.totalCount} unlocked
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="pb-4">
        {failed && (
          <p className="text-xs text-muted-foreground">Milestones could not be loaded — they will reappear on refresh.</p>
        )}
        {!data && !failed && (
          <div className="flex gap-2 overflow-hidden" aria-busy="true" aria-label="Loading milestones">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-40 shrink-0 rounded-xl" />
            ))}
          </div>
        )}
        {ordered && (
          <div
            className="flex gap-2 overflow-x-auto pb-1 pt-0.5 [scrollbar-width:thin]"
            role="list"
            aria-label="Nutrition milestones"
          >
            {ordered.map((m) => (
              <MilestoneChip key={m.id} m={m} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
