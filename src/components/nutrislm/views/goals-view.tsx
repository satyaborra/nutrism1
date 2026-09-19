"use client";

/**
 * Goals view — rebuilt 1:1 to the reference mockup.
 *
 * Structure: gradient ViewHero (no stat row) → milestone header card (donut
 * "8/12 Completed" + streak chip + script quote + lightbulb tip) → scrollable
 * category pill tabs + status Select → emoji goal-card grid (achieved cards on
 * an emerald gradient with an "Unlocked ✓" chip, locked ones solid with muted
 * text) → bottom row (summary donut with legend, upcoming milestones, AI coach
 * suggestion). Every number is computed server-side from logged data and
 * refetched whenever dataVersion bumps (new meal logged anywhere in the app).
 *
 * The unlock celebration (confetti + toast, keyed off localStorage) is ported
 * from the old milestones strip so no feature is lost in the recomposition.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, ChevronRight, Lightbulb, Plus, RefreshCcw, TriangleAlert, TrendingUp, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { api } from "@/lib/client/api";
import type { CoachInsightResponse, Milestone, MilestonesResponse } from "@/lib/client/types";
import { Donut } from "../donut";
import { FadeIn } from "../fade-in";
import { useNutriStore } from "../store";
import { ViewHero } from "./view-hero";

// ---------------------------------------------------------------- categories

type GoalCategory = "Nutrition" | "Health & Medical" | "Lifestyle" | "Learning" | "Streaks" | "Others";
type CategoryFilter = GoalCategory | "all";
type StatusFilter = "all" | "progress" | "done";

const KNOWN_CATEGORIES: GoalCategory[] = ["Nutrition", "Health & Medical", "Lifestyle", "Learning", "Streaks"];

/**
 * Derive a milestone's bucket from its id (keyword rules over the actual ids
 * seen at runtime — hydration-N, meals-N, streak-N, explorer-10, photo-1,
 * coach-1, feedback-1, notes-3, …). Returns null when an id maps nowhere so
 * the caller can surface an "Others" pill for exactly those milestones.
 */
function matchCategory(id: string): GoalCategory | null {
  const s = id.toLowerCase();
  const rules: [RegExp, GoalCategory][] = [
    [/t2dm|ckd|cvd|sodium|bp|blood|diabet/, "Health & Medical"],
    [/photo|scan|lens|notes|journal/, "Lifestyle"],
    [/coach|ask|explore|learn|feedback/, "Learning"],
    [/streak|log|consistent|meal/, "Streaks"],
    [/hydration|water|veg|fruit|salt/, "Nutrition"],
  ];
  for (const [re, cat] of rules) if (re.test(s)) return cat;
  return null;
}

/** Unmatched ids land in "Others" (rendered only when that actually happens). */
function bucketOf(id: string): GoalCategory {
  return matchCategory(id) ?? "Others";
}

// ------------------------------------------------- unlock celebration (ported)

const SEEN_KEY = "nutrislm.unlocks.seen.v1";

function loadSeen(): Set<string> | null {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    if (!raw) return null; // first visit — seed silently
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.filter((x): x is string => typeof x === "string")) : null;
  } catch {
    return null;
  }
}

function saveSeen(ids: Iterable<string>) {
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify([...ids]));
  } catch {
    /* storage unavailable — celebration simply won't dedupe across reloads */
  }
}

const CONFETTI_COLORS = ["#059669", "#10b981", "#f59e0b", "#fbbf24", "#14b8a6", "#fb7185"];

/** Lightweight CSS confetti burst — auto-unmounts after the fall animation. */
function ConfettiBurst({ count = 36 }: { count?: number }) {
  const [alive, setAlive] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setAlive(false), 2600);
    return () => clearTimeout(t);
  }, []);
  if (!alive) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[80] overflow-hidden">
      {Array.from({ length: count }).map((_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 0.5;
        const duration = 1.6 + Math.random() * 1.1;
        const size = 6 + Math.random() * 6;
        const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
        const drift = (Math.random() - 0.5) * 160;
        return (
          <span
            key={i}
            className="absolute top-[-12px] block"
            style={{
              left: `${left}%`,
              width: size,
              height: size * (Math.random() > 0.5 ? 1 : 0.45),
              backgroundColor: color,
              borderRadius: Math.random() > 0.5 ? "50%" : "2px",
              animation: `confetti-fall ${duration}s linear ${delay}s forwards`,
              // @ts-expect-error CSS custom property for the horizontal drift
              "--confetti-drift": `${drift}px`,
              opacity: 0.9,
            }}
          />
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------- widgets

/** One goal card — emoji in a soft circle, counter + full-width progress bar. */
function GoalCard({ m }: { m: Milestone }) {
  const pct = Math.min(100, Math.max(0, Math.round(m.progress * 100)));
  return (
    <Card
      role="listitem"
      aria-label={`${m.label}${m.achieved ? " — unlocked" : ""}: ${m.value} of ${m.goal}. ${m.description}`}
      className={cn(
        "group gap-0 rounded-3xl p-5 text-center transition-all",
        m.achieved
          ? "border-primary/30 bg-gradient-to-br from-primary/10 to-teal-500/5 hover:-translate-y-0.5 hover:shadow-md"
          : "border-border bg-card hover:border-primary/20",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mx-auto flex h-14 w-14 items-center justify-center rounded-full transition-transform group-hover:scale-105",
          m.achieved ? "bg-primary/10" : "bg-muted",
        )}
      >
        <span className="text-3xl leading-none">{m.icon}</span>
      </span>
      <h3 className="mt-3 min-w-0 text-[15px] font-bold text-foreground">{m.label}</h3>
      <p className="mt-1 line-clamp-1 min-w-0 text-xs text-muted-foreground">{m.description}</p>
      <div className="mt-4 text-left">
        <p className={cn("text-xs font-semibold tabular-nums", m.achieved ? "text-foreground" : "text-muted-foreground")}>
          {m.value} / {m.goal}
        </p>
        <div
          role="progressbar"
          aria-label={`${m.label} progress`}
          aria-valuemin={0}
          aria-valuemax={m.goal}
          aria-valuenow={m.value}
          className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-primary/15"
        >
          <div
            className={cn("h-full rounded-full transition-[width] duration-500 ease-out", m.achieved ? "bg-emerald-500" : "bg-primary")}
            style={{ width: `${pct}%` }}
          />
        </div>
        {m.achieved && (
          <p className="mt-2 text-center">
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
              <Trophy className="h-3.5 w-3.5" aria-hidden /> Unlocked ✓
            </span>
          </p>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------- view

export function GoalsView() {
  const dataVersion = useNutriStore((s) => s.dataVersion);
  const setView = useNutriStore((s) => s.setView);
  const { toast } = useToast();

  const [data, setData] = useState<MilestonesResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  const [insight, setInsight] = useState<CoachInsightResponse | null>(null);
  const [insightLoading, setInsightLoading] = useState(true);
  const [insightFailed, setInsightFailed] = useState(false);

  const [category, setCategory] = useState<CategoryFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");

  const [newlyUnlocked, setNewlyUnlocked] = useState<Set<string>>(new Set());
  const [celebration, setCelebration] = useState<{ key: number } | null>(null);

  const gridRef = useRef<HTMLDivElement | null>(null);

  /**
   * Milestones drive the board; coach insight is fetched independently so a
   * slow AI call never delays the goal grid. All setState calls happen after
   * await, guarded by isAlive — safe for the effect + retry reuse.
   */
  const fetchAll = useCallback(
    (isAlive: () => boolean) => {
      void (async () => {
        try {
          const res = await api.milestones();
          if (!isAlive()) return;
          setData(res);
          setFailed(false);

          // Unlock celebration — ported from the old milestones strip so the
          // confetti + toast feature survives the recomposition.
          const unlockedNow = res.milestones.filter((m) => m.achieved).map((m) => m.id);
          const seen = loadSeen();
          if (seen === null) {
            saveSeen(unlockedNow); // first visit — seed silently, no fanfare
          } else {
            const fresh = unlockedNow.filter((id) => !seen.has(id));
            if (fresh.length > 0) {
              setNewlyUnlocked(new Set(fresh));
              const labels = res.milestones.filter((m) => fresh.includes(m.id)).map((m) => m.label);
              if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) setCelebration({ key: Date.now() });
              toast({
                title: `Milestone${labels.length > 1 ? "s" : ""} unlocked!`,
                description: `${labels.join(", ")} — earned from your logged data. Keep going!`,
              });
              saveSeen(unlockedNow);
              window.setTimeout(() => isAlive() && setNewlyUnlocked(new Set()), 6500);
            }
          }
        } catch {
          if (isAlive()) setFailed(true);
        } finally {
          if (isAlive()) setLoading(false);
        }
      })();
      void (async () => {
        try {
          const res = await api.coachInsight();
          if (!isAlive()) return;
          setInsight(res);
          setInsightFailed(false);
        } catch {
          if (isAlive()) setInsightFailed(true); // silent fail → coach card hides
        } finally {
          if (isAlive()) setInsightLoading(false);
        }
      })();
    },
    [toast],
  );

  // Initial load + refetch whenever meals change (dataVersion bump).
  useEffect(() => {
    let alive = true;
    fetchAll(() => alive);
    return () => {
      alive = false;
    };
  }, [fetchAll, dataVersion]);

  function handleRetry() {
    setFailed(false);
    setLoading(true);
    setInsightLoading(true);
    fetchAll(() => true);
  }

  function handleNewGoal() {
    setView("log");
    toast({ title: "Log today's meal", description: "Every milestone is computed from real logged data." });
  }

  function scrollToGrid() {
    gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const milestones: Milestone[] = data?.milestones ?? [];
  const totalCount = data?.totalCount ?? 0;
  const achievedCount = data?.achievedCount ?? 0;
  const streak = data?.stats.loggingStreak ?? 0;

  // Board order: unlocked first, then locked by closeness to unlocking.
  const ordered: Milestone[] = [...milestones].sort((a, b) =>
    a.achieved === b.achieved ? b.progress - a.progress : a.achieved ? -1 : 1,
  );

  // Category pills — "Others" appears only when some id maps nowhere.
  const hasOthers = milestones.some((m) => matchCategory(m.id) === null);
  const pills: { id: CategoryFilter; label: string }[] = [
    { id: "all", label: "All Goals" },
    ...KNOWN_CATEGORIES.map((c) => ({ id: c as CategoryFilter, label: c })),
    ...(hasOthers ? [{ id: "Others" as CategoryFilter, label: "Others" }] : []),
  ];

  const visible: Milestone[] = ordered.filter(
    (m) =>
      (category === "all" || bucketOf(m.id) === category) &&
      (status === "all" || (status === "done" ? m.achieved : !m.achieved)),
  );

  // Summary buckets — completed / in progress (0 < p < 1) / not started (p = 0).
  const inProgress = milestones.filter((m) => !m.achieved && m.progress > 0).length;
  const notStarted = Math.max(0, totalCount - achievedCount - inProgress);

  // Upcoming: next locked milestones, closest to unlocking first.
  const upcoming: Milestone[] = milestones
    .filter((m) => !m.achieved)
    .sort((a, b) => b.progress - a.progress)
    .slice(0, 5);

  const loadingState = loading || !data;

  return (
    <div className="space-y-5">
      {celebration && <ConfettiBurst key={celebration.key} />}

      {/* 1 — Hero (no stat row; the header card below carries the numbers) */}
      <FadeIn>
        <ViewHero
          title={<>Goals</>}
          subtitle="Turn your intentions into healthier habits. Track, achieve and unlock a better you."
          script={
            <>
              Progress Today
              <br />
              Healthier
              <br />
              Tomorrow ♡
            </>
          }
          image="/images/hero-mountains.png"
          actions={
            <Button size="sm" onClick={handleNewGoal} className="h-10 gap-1.5 rounded-xl px-4 font-semibold">
              <Plus className="h-4 w-4" aria-hidden /> Set a new goal
            </Button>
          }
        />
      </FadeIn>

      {failed ? (
        /* Error — role=alert + retry (refetch) */
        <FadeIn delay={0.05}>
          <Card role="alert" className="gap-0 rounded-2xl border-destructive/40 bg-destructive/10 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span
                  aria-hidden
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-destructive/15 text-destructive"
                >
                  <TriangleAlert className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">Could not load your goals</p>
                  <p className="text-xs text-muted-foreground">
                    Your milestones are recomputed from logged meals — nothing is lost. Check your connection and retry.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={handleRetry}
                disabled={loading}
                className="h-10 gap-1.5 rounded-xl border-destructive/30 bg-transparent px-4 hover:bg-destructive/10"
              >
                <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden /> Retry
              </Button>
            </div>
          </Card>
        </FadeIn>
      ) : (
        <>
          {/* 2 — Milestone header card */}
          <FadeIn delay={0.05}>
            {loadingState ? (
              <div aria-busy="true" aria-label="Loading milestone summary">
                <Skeleton className="h-36 rounded-3xl" />
              </div>
            ) : totalCount === 0 ? (
              <Card className="gap-0 rounded-3xl border-muted-foreground/20 bg-muted/30 p-5 text-sm text-muted-foreground">
                No milestones are configured yet — log your first meal to start earning badges.
              </Card>
            ) : (
              <Card className="gap-0 rounded-3xl border-primary/15 p-5 sm:p-6">
                <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                  <Donut value={achievedCount} max={totalCount} size={96} stroke={10} tone="emerald" className="shrink-0">
                    <span className="text-xl font-bold tabular-nums text-foreground">
                      {achievedCount}/{totalCount}
                    </span>
                    <span className="text-[10px] text-muted-foreground">Completed</span>
                  </Donut>
                  <div className="min-w-0 flex-1 basis-48">
                    <h2 className="text-base font-bold text-foreground sm:text-lg">Milestones unlocked</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">You&apos;re on a great journey!</p>
                    <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                      <TrendingUp className="h-3 w-3" aria-hidden />
                      {streak > 0 ? `↑ ${streak}-day logging streak` : "Log today to start a streak"}
                    </span>
                  </div>
                  <Separator orientation="vertical" className="hidden md:block" style={{ height: 56 }} />
                  <p className="hidden max-w-[220px] font-script text-xl font-semibold leading-tight text-primary lg:block">
                    “Discipline today, a healthier tomorrow.”
                  </p>
                  <span className="mx-auto inline-flex max-w-[240px] items-center gap-2 rounded-full bg-amber-500/10 px-4 py-2 text-xs font-medium leading-snug text-amber-700 dark:text-amber-400 sm:ml-auto sm:mr-0">
                    <Lightbulb className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Small steps — logged meals unlock everything.
                  </span>
                </div>
              </Card>
            )}
          </FadeIn>

          {/* 3 + 4 — Filter row and goal cards grid */}
          <FadeIn delay={0.1}>
            {loadingState ? (
              <div
                aria-busy="true"
                aria-label="Loading goal cards"
                className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
              >
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-52 rounded-3xl" />
                ))}
              </div>
            ) : (
              <section aria-label="Goal cards">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div
                    role="tablist"
                    aria-label="Filter goals by category"
                    className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]"
                  >
                    {pills.map((p) => {
                      const active = category === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setCategory(p.id)}
                          className={cn(
                            "h-9 shrink-0 whitespace-nowrap rounded-full px-4 text-sm font-medium transition-colors",
                            active ? "bg-primary text-white shadow-sm" : "border border-border bg-card text-foreground hover:bg-muted",
                          )}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                  <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
                    <SelectTrigger
                      aria-label="Filter goals by status"
                      className="h-9 w-[150px] rounded-full border-border bg-card px-4 text-sm font-medium"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All goals</SelectItem>
                      <SelectItem value="progress">In progress</SelectItem>
                      <SelectItem value="done">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div
                  ref={gridRef}
                  role="list"
                  aria-label="Goal cards"
                  className="mt-4 grid scroll-mt-24 gap-4 sm:grid-cols-2 lg:grid-cols-3"
                >
                  {visible.map((m) => (
                    <GoalCard key={m.id} m={m} />
                  ))}
                </div>

                {visible.length === 0 && (
                  <Card className="mt-4 gap-0 rounded-3xl border-muted-foreground/20 bg-muted/30 p-5 text-center text-sm text-muted-foreground">
                    No goals match this filter yet — keep logging to unlock more.
                  </Card>
                )}
              </section>
            )}
          </FadeIn>

          {/* 5 — Bottom row: summary / upcoming / AI coach */}
          <FadeIn delay={0.15}>
            {loadingState ? (
              <div className="grid gap-5 xl:grid-cols-3" aria-busy="true" aria-label="Loading goal summaries">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-64 rounded-3xl" />
                ))}
              </div>
            ) : (
              <div className="grid min-w-0 gap-5 xl:grid-cols-3">
                {/* a — Your Goals Summary */}
                <Card className="gap-0 min-w-0 rounded-3xl border-primary/15 p-5">
                  <h2 className="text-sm font-bold text-foreground">Your Goals Summary</h2>
                  <div className="mt-4 flex items-center gap-4 sm:gap-5">
                    <Donut
                      size={96}
                      stroke={10}
                      className="shrink-0"
                      segments={[
                        { value: achievedCount, tone: "emerald" },
                        { value: inProgress, tone: "amber" },
                        { value: notStarted, tone: "teal" },
                      ]}
                    >
                      <span className="text-lg font-bold tabular-nums text-foreground">
                        {achievedCount} / {totalCount}
                      </span>
                      <span className="text-[10px] text-muted-foreground">Completed</span>
                    </Donut>
                    <div className="min-w-0 flex-1 space-y-2">
                      {(
                        [
                          { label: "Completed", n: achievedCount, dot: "bg-emerald-500" },
                          { label: "In Progress", n: inProgress, dot: "bg-amber-500" },
                          { label: "Not Started", n: notStarted, dot: "bg-teal-500" },
                        ] as const
                      ).map((row) => (
                        <div key={row.label} className="flex items-center gap-2 text-xs">
                          <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", row.dot)} aria-hidden />
                          <span className="min-w-0 text-muted-foreground">{row.label}</span>
                          <span className="ml-auto font-semibold tabular-nums text-foreground">{row.n}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-3 rounded-xl bg-primary/5 p-3">
                    <span
                      aria-hidden
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
                    >
                      <Trophy className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-foreground">You&apos;re doing amazing!</p>
                      <p className="text-xs text-muted-foreground">Keep going — small steps make a big difference.</p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setView("log")}
                      aria-label="Log a meal to progress your goals"
                      className="h-9 w-9 shrink-0 rounded-full text-primary hover:bg-primary/10 hover:text-primary"
                    >
                      <ChevronRight className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                </Card>

                {/* b — Upcoming Milestones */}
                <Card className="gap-0 min-w-0 rounded-3xl border-primary/15 p-5">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="min-w-0 text-sm font-bold text-foreground">Upcoming Milestones</h2>
                    <button
                      type="button"
                      onClick={scrollToGrid}
                      className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-primary hover:underline"
                    >
                      View all <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                  <div className="mt-4 space-y-3.5">
                    {upcoming.map((m) => {
                      const pct = Math.min(100, Math.max(0, Math.round(m.progress * 100)));
                      return (
                        <div key={m.id} className="flex items-center gap-3">
                          <span
                            aria-hidden
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-base"
                          >
                            {m.icon}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-1 text-sm font-medium text-foreground">{m.label}</p>
                            <div
                              role="progressbar"
                              aria-label={`${m.label} progress`}
                              aria-valuemin={0}
                              aria-valuemax={m.goal}
                              aria-valuenow={m.value}
                              className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-primary/15"
                            >
                              <div
                                className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                          <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums text-muted-foreground">
                            {pct}%
                          </span>
                        </div>
                      );
                    })}
                    {upcoming.length === 0 && (
                      <p className="py-6 text-center text-xs text-muted-foreground">
                        All caught up — every milestone unlocked!
                      </p>
                    )}
                  </div>
                </Card>

                {/* c — AI Coach Suggestion (silent fail → hidden) */}
                {insightLoading ? (
                  <Skeleton className="h-64 min-w-0 rounded-3xl" aria-hidden />
                ) : insight && !insightFailed ? (
                  <Card className="gap-0 min-w-0 rounded-3xl border-primary/15 p-5">
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
                      >
                        <Bot className="h-4 w-4" />
                      </span>
                      <h2 className="min-w-0 text-sm font-bold text-foreground">AI Coach Suggestion</h2>
                    </div>
                    <p className="mt-3 line-clamp-2 min-w-0 text-sm font-semibold text-foreground">{insight.headline}</p>
                    <p className="mt-1.5 line-clamp-3 min-w-0 text-xs leading-relaxed text-muted-foreground">
                      {insight.insight}
                    </p>
                    {insight.aiNote && (
                      <p className="mt-2 min-w-0 text-[11px] italic text-muted-foreground/80">{insight.aiNote}</p>
                    )}
                    <Button
                      onClick={() => setView("insights")}
                      className="mt-3 h-10 w-full rounded-xl bg-primary/10 text-sm font-semibold text-primary hover:bg-primary/15"
                    >
                      View personalized plan →
                    </Button>
                  </Card>
                ) : null}
              </div>
            )}
          </FadeIn>
        </>
      )}
    </div>
  );
}
