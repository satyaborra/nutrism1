"use client";

/**
 * Goals view — the deterministic milestone board earned from logged data.
 *
 * Premium rebuild: gradient ViewHero with live milestone stats (unlocked count,
 * logging streak, next-badge progress, days logged), the compact celebration
 * strip, and a full responsive badge board — achieved badges on emerald
 * gradient cards, locked ones dashed with an amber progress bar. Everything is
 * computed server-side from the database; nothing here is an estimate.
 */
import { useCallback, useEffect, useState } from "react";
import { CalendarCheck, Flame, Lock, RefreshCcw, Target, TriangleAlert, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { api } from "@/lib/client/api";
import type { Milestone, MilestonesResponse } from "@/lib/client/types";
import { useNutriStore } from "../store";
import { FadeIn } from "../fade-in";
import { MilestonesStrip } from "../milestones-strip";
import { HeroStat, ViewHero } from "./view-hero";

/** Locked badge progress bar — track + amber fill with ARIA wiring. */
function LockedProgress({ m }: { m: Milestone }) {
  const pct = Math.min(100, Math.max(0, Math.round(m.progress * 100)));
  return (
    <div
      role="progressbar"
      aria-label={`${m.label} progress`}
      aria-valuemin={0}
      aria-valuemax={m.goal}
      aria-valuenow={m.value}
      className="h-2 w-full overflow-hidden rounded-full bg-primary/15"
    >
      <div
        className="h-full rounded-full bg-amber-500 transition-[width] duration-500 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** One badge board card — achieved (gradient) or locked (dashed). */
function BoardCard({ m }: { m: Milestone }) {
  const pct = Math.min(100, Math.max(0, Math.round(m.progress * 100)));
  if (m.achieved) {
    return (
      <div
        role="listitem"
        aria-label={`${m.label}: unlocked. ${m.description}`}
        className="group relative flex flex-col gap-3 rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/10 to-teal-500/5 p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
      >
        <div className="flex items-start justify-between gap-3">
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary shadow-sm"
          >
            <Trophy className="h-5 w-5" />
          </span>
          <span aria-hidden className="text-2xl leading-none opacity-80 transition-transform group-hover:scale-110">
            {m.icon}
          </span>
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{m.label}</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{m.description}</p>
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            <Trophy className="h-3 w-3" aria-hidden /> Unlocked
          </span>
          <span className="text-[11px] font-medium tabular-nums text-primary">
            {m.value} of {m.goal}
          </span>
        </div>
      </div>
    );
  }
  return (
    <div
      role="listitem"
      aria-label={`${m.label}: locked. ${m.value} of ${m.goal}. ${m.description}`}
      className="group relative flex flex-col gap-3 rounded-3xl border border-dashed border-muted-foreground/25 bg-card/50 p-5 transition-all hover:border-muted-foreground/40 hover:bg-card"
    >
      <div className="flex items-start justify-between gap-3">
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-muted-foreground/10 text-muted-foreground"
        >
          <Lock className="h-5 w-5" />
        </span>
        <span aria-hidden className="text-2xl leading-none opacity-30 grayscale">
          {m.icon}
        </span>
      </div>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-muted-foreground">{m.label}</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground/80">{m.description}</p>
      </div>
      <div className="mt-auto space-y-2 pt-1">
        <LockedProgress m={m} />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
            {m.value} / {m.goal}
          </span>
          <span className="text-[11px] font-semibold tabular-nums text-amber-600 dark:text-amber-400">{pct}%</span>
        </div>
      </div>
    </div>
  );
}

export function GoalsView() {
  const dataVersion = useNutriStore((s) => s.dataVersion);
  const [data, setData] = useState<MilestonesResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  /** All setState calls happen after await — safe for the effect + retry reuse. */
  const fetchMilestones = useCallback(async (isAlive: () => boolean) => {
    try {
      const res = await api.milestones();
      if (!isAlive()) return;
      setData(res);
      setFailed(false);
    } catch {
      if (isAlive()) setFailed(true);
    } finally {
      if (isAlive()) setLoading(false);
    }
  }, []);

  // Initial load + refetch whenever meals change (dataVersion bump).
  useEffect(() => {
    let alive = true;
    fetchMilestones(() => alive);
    return () => {
      alive = false;
    };
  }, [fetchMilestones, dataVersion]);

  function handleRetry() {
    setFailed(false);
    setLoading(true);
    void fetchMilestones(() => true);
  }

  // Achieved first, then locked by closeness to unlocking.
  const ordered: Milestone[] = data
    ? [
        ...data.milestones.filter((m) => m.achieved),
        ...data.milestones.filter((m) => !m.achieved).sort((a, b) => b.progress - a.progress),
      ]
    : [];
  const next = ordered.find((m) => !m.achieved) ?? null;

  // Hero stats — only rendered when derivable from the real response shape.
  const stats = data ? (
    <>
      <HeroStat
        icon={<Trophy className="h-4 w-4" />}
        label="unlocked"
        value={
          <>
            {data.achievedCount}
            <span className="text-sm font-semibold text-muted-foreground"> of {data.totalCount}</span>
          </>
        }
        tone="amber"
        title={`${data.achievedCount} of ${data.totalCount} milestones unlocked`}
      />
      {typeof data.stats.loggingStreak === "number" && (
        <HeroStat
          icon={<Flame className="h-4 w-4" />}
          label="day streak"
          value={data.stats.loggingStreak}
          tone="rose"
          title={`Logging streak: ${data.stats.loggingStreak} consecutive day${data.stats.loggingStreak === 1 ? "" : "s"}`}
        />
      )}
      {next && (
        <HeroStat
          icon={<Target className="h-4 w-4" />}
          label="next badge"
          value={`${Math.round(next.progress * 100)}%`}
          tone="teal"
          title={`${next.label}: ${next.value} of ${next.goal} — ${next.description}`}
        />
      )}
      {typeof data.stats.daysLogged90d === "number" && (
        <HeroStat
          icon={<CalendarCheck className="h-4 w-4" />}
          label="days logged"
          value={data.stats.daysLogged90d}
          tone="emerald"
          title="Days with at least one logged meal in the last 90 days"
        />
      )}
    </>
  ) : undefined;

  return (
    <div className="space-y-5">
      <FadeIn>
        <ViewHero
          title="Goals"
          subtitle="Small wins compound — every milestone is computed from your real logged meals, never estimates."
          script="Small Wins, Every Day"
          image="/images/hero-leaves.png"
          chip={
            data ? (
              <Badge
                variant="outline"
                className="gap-1 rounded-full border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary"
              >
                <Trophy className="h-3 w-3" aria-hidden />
                <span className="tabular-nums">
                  {data.achievedCount} of {data.totalCount} unlocked
                </span>
              </Badge>
            ) : undefined
          }
          stats={stats}
        />
      </FadeIn>

      <FadeIn delay={0.05}>
        <MilestonesStrip />
      </FadeIn>

      <FadeIn delay={0.1}>
        <section aria-labelledby="milestone-board-heading" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2 px-1">
            <div className="min-w-0">
              <h2 id="milestone-board-heading" className="text-lg font-bold tracking-tight text-foreground">
                Milestone board
              </h2>
              <p className="text-xs text-muted-foreground">
                Every badge is earned from verifiable logged data — nothing is guessed.
              </p>
            </div>
            {data && (
              <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-primary">
                {data.achievedCount} of {data.totalCount} unlocked
              </span>
            )}
          </div>

          {failed && (
            <Card role="alert" className="rounded-3xl border-amber-500/25 bg-amber-500/5 shadow-sm">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    aria-hidden
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400"
                  >
                    <TriangleAlert className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">Milestones could not be loaded</p>
                    <p className="text-xs text-muted-foreground">
                      Your badges are safe — they are recomputed from your logged meals. Check your connection and
                      retry.
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={handleRetry}
                  disabled={loading}
                  className="h-11 gap-1.5 rounded-xl border-primary/30 bg-primary/5 px-4 hover:bg-primary/10"
                >
                  <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden /> Retry
                </Button>
              </CardContent>
            </Card>
          )}

          {!data && !failed && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading milestone board">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-44 rounded-3xl" />
              ))}
            </div>
          )}

          {data && data.milestones.length === 0 && (
            <Card className="rounded-3xl border-muted-foreground/20 bg-muted/30 shadow-sm">
              <CardContent className="p-5 text-sm text-muted-foreground">
                No milestones are configured yet — log your first meal to start earning badges.
              </CardContent>
            </Card>
          )}

          {data && data.milestones.length > 0 && (
            <div role="list" aria-label="All milestones" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ordered.map((m) => (
                <BoardCard key={m.id} m={m} />
              ))}
            </div>
          )}
        </section>
      </FadeIn>
    </div>
  );
}
