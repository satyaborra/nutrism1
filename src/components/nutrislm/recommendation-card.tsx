"use client";

/**
 * Next-meal recommendation: context → candidates → constraints → RAG evidence →
 * AI ranking → validation (all server-side). This UI only presents the result
 * and can log the recommended meal directly (foodIds included server-side).
 */
import { useState, useEffect } from "react";
import {
  ArrowRight,
  BookOpen,
  BrainCircuit,
  ChevronDown,
  FlaskConical,
  HeartHandshake,
  Loader2,
  RefreshCw,
  Salad,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatGrams, formatKcal } from "@/lib/client/format";
import type { NextMealResponse, RecommendationCandidate } from "@/lib/client/types";
import { FEEDBACK_REASON_LABELS } from "@/lib/client/types";
import type { FeedbackReason, FeedbackRating } from "@/lib/client/types";
import { api, ApiError } from "@/lib/client/api";
import { mealImageFor } from "@/lib/client/meal-images";
import { useNutriStore } from "./store";

export function RecommendationCard() {
  const { toast } = useToast();
  const dataVersion = useNutriStore((s) => s.dataVersion);
  const bumpData = useNutriStore((s) => s.bumpData);

  const [rec, setRec] = useState<NextMealResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loggingAlt, setLoggingAlt] = useState<string | null>(null);
  const [loggedIds, setLoggedIds] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<{ rating: FeedbackRating; reason: FeedbackReason | null } | null>(null);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [showReasons, setShowReasons] = useState(false);

  // Load any previously saved feedback when a new recommendation appears
  useEffect(() => {
    if (!rec?.recommendationId) {
      setFeedback(null);
      setShowReasons(false);
      return;
    }
    let alive = true;
    api
      .getFeedback(rec.recommendationId)
      .then((res) => {
        if (!alive) return;
        if (res.feedback) setFeedback({ rating: res.feedback.rating, reason: res.feedback.reason });
        else setFeedback(null);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [rec?.recommendationId]);

  async function fetchRec(refresh = false) {
    setLoading(true);
    setError(null);
    setFeedback(null);
    setShowReasons(false);
    try {
      const res = await api.nextMeal(refresh);
      setRec(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not generate a recommendation.");
    } finally {
      setLoading(false);
    }
  }

  async function sendFeedback(rating: FeedbackRating, reason?: FeedbackReason) {
    if (!rec?.recommendationId || feedbackBusy) return;
    setFeedbackBusy(true);
    // Optimistic update
    const prev = feedback;
    setFeedback({ rating, reason: reason ?? null });
    if (rating === "down" && reason === undefined) setShowReasons(true);
    try {
      await api.sendFeedback({
        recommendationId: rec.recommendationId,
        candidateId: rec.selected.id,
        mealSlot: rec.mealSlot,
        rating,
        ...(reason !== undefined ? { reason } : {}),
      });
      if (rating === "up") toast({ title: "Thanks for the feedback!", description: "Helps rank future suggestions for you." });
      if (rating === "down" && reason) toast({ title: "Feedback saved", description: "We'll steer future suggestions away from this." });
    } catch {
      setFeedback(prev); // roll back on failure
      toast({ title: "Could not save feedback", description: "Please try again.", variant: "destructive" });
    } finally {
      setFeedbackBusy(false);
    }
  }

  async function logCandidate(c: RecommendationCandidate) {
    setLoggingAlt(c.id);
    try {
      const res = await api.logMeal({
        requestId: crypto.randomUUID(),
        mealType: rec?.mealSlot && ["breakfast", "lunch", "snack", "dinner"].includes(rec.mealSlot) ? rec.mealSlot : "snack",
        foods: c.items.map((i) => ({ foodId: i.foodId, name: i.name, quantity: i.quantity, unit: i.unit })),
        notes: `From recommendation ${rec?.recommendationId ?? ""}`.trim(),
        source: "recommendation",
      });
      toast({
        title: res.duplicate ? "Meal already logged" : "Recommended meal logged",
        description: `${c.name} · ${formatKcal(res.totals.calories)}`,
      });
      setLoggedIds((prev) => [...prev, c.id]);
      bumpData();
    } catch (e) {
      toast({
        title: "Could not log meal",
        description: e instanceof ApiError ? e.message : "Unexpected error.",
        variant: "destructive",
      });
    } finally {
      setLoggingAlt(null);
    }
  }

  const isLogged = (c: RecommendationCandidate) => loggedIds.includes(c.id);

  return (
    <Card id="recommendation" className="scroll-mt-20 border-primary/15 shadow-sm transition-shadow duration-300 hover:shadow-md hover:shadow-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
            <Sparkles className="h-4 w-4" aria-hidden />
          </span>
          Next Meal Recommendation
        </CardTitle>
        <CardDescription>
          Ranked for your remaining macros, health conditions and preferences — with cited evidence.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!rec && !loading && !error && (
          <div className="relative flex flex-col items-center gap-3 overflow-hidden rounded-xl border border-dashed bg-gradient-to-b from-primary/5 to-transparent p-6 text-center">
            <img
              src="/images/meal-generic.png"
              alt=""
              aria-hidden
              className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full object-cover opacity-20"
            />
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-teal-500/10 ring-1 ring-primary/20">
              <Salad className="h-6 w-6 text-primary" aria-hidden />
            </span>
            <p className="text-sm text-muted-foreground">
              Get a personalized meal idea based on what you&apos;ve eaten today.
            </p>
            <Button onClick={() => fetchRec(false)} className="mt-1 gap-2 shadow-sm shadow-primary/20 transition-all active:scale-[0.98]">
              <Sparkles className="h-4 w-4" aria-hidden /> Suggest my next meal
            </Button>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center" aria-live="polite">
            <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
            <p className="text-sm text-muted-foreground">Checking your day, constraints & evidence, then ranking…</p>
          </div>
        )}

        {error && !loading && (
          <div className="space-y-3">
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {error}
            </p>
            <Button variant="outline" onClick={() => fetchRec(false)}>
              Try again
            </Button>
          </div>
        )}

        {rec && !loading && (
          <div className="space-y-3">
            <CandidateView
              c={rec.selected}
              primary
              explanation={rec.explanation}
              logged={isLogged(rec.selected)}
              onLog={() => logCandidate(rec.selected)}
              logging={loggingAlt === rec.selected.id}
            />

            {/* Feedback loop — persisted per recommendation */}
            <FeedbackRow
              rating={feedback?.rating ?? null}
              busy={feedbackBusy}
              showReasons={showReasons && feedback?.rating === "down"}
              activeReason={feedback?.reason ?? null}
              onRate={(r) => void sendFeedback(r)}
              onReason={(reason) => void sendFeedback("down", reason)}
              onToggleReasons={() => setShowReasons((v) => !v)}
            />

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {rec.engineSource === "ai" ? (
                <Badge variant="secondary" className="gap-1">
                  <BrainCircuit className="h-3 w-3" aria-hidden /> AI-ranked
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1">
                  <FlaskConical className="h-3 w-3" aria-hidden /> Deterministic fallback
                </Badge>
              )}
              {rec.feedbackSignal && (rec.feedbackSignal.down > 0 || rec.feedbackSignal.up > 0) && (
                <Badge
                  variant="outline"
                  title="This ranking was adjusted using your recent thumbs up/down feedback."
                  className="gap-1 border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-400"
                >
                  <ThumbsUp className="h-3 w-3" aria-hidden /> tuned by your feedback
                  {rec.feedbackSignal.down > 0 && <span className="tabular-nums">· {rec.feedbackSignal.down}↓</span>}
                  {rec.feedbackSignal.up > 0 && <span className="tabular-nums">· {rec.feedbackSignal.up}↑</span>}
                </Badge>
              )}
              {rec.aiNote && <span className="min-w-0 flex-1 truncate">{rec.aiNote}</span>}
            </div>

            {rec.alternatives.length > 0 && (
              <Collapsible>
                <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/60">
                  Alternatives ({rec.alternatives.length})
                  <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" aria-hidden />
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-2">
                  {rec.alternatives.map((a) => (
                    <CandidateView key={a.id} c={a} logged={isLogged(a)} onLog={() => logCandidate(a)} logging={loggingAlt === a.id} />
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}

            <EvidenceList rec={rec} />

            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => fetchRec(true)} disabled={loading}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Suggest another
              </Button>
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="pb-4">
        <p className="text-[11px] text-muted-foreground">
          Recommendations re-verify your constraints from the database every time — nothing is hard-coded.
        </p>
      </CardFooter>
    </Card>
  );
}

function CandidateView({
  c,
  primary = false,
  explanation,
  logged,
  onLog,
  logging,
}: {
  c: RecommendationCandidate;
  primary?: boolean;
  /** AI explanation — shown as the "Why this meal?" collapsible on the primary. */
  explanation?: string | null;
  logged: boolean;
  onLog: () => void;
  logging: boolean;
}) {
  const img = mealImageFor(c.name, ...c.items.map((i) => i.name));
  const pills = [
    { label: formatKcal(c.nutrition.calories), sub: "kcal", strong: true },
    { label: formatGrams(c.nutrition.protein), sub: "Protein" },
    { label: formatGrams(c.nutrition.carbohydrates), sub: "Carbs" },
    { label: formatGrams(c.nutrition.fat), sub: "Fat" },
    { label: formatGrams(c.nutrition.fiber), sub: "Fiber" },
  ];

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border p-3 transition-shadow duration-300",
        primary
          ? "border-primary/40 bg-gradient-to-br from-primary/10 via-primary/5 to-teal-500/5 shadow-sm shadow-primary/10"
          : "bg-background/60 hover:border-primary/25 hover:shadow-sm",
      )}
    >
      {primary && <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/60 via-teal-400/50 to-transparent" />}

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {primary && (
            <span className="mb-1 inline-flex items-center rounded-full bg-primary/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
              <Sparkles className="mr-1 h-3 w-3" aria-hidden /> Best match for you
            </span>
          )}
          <p className="text-base font-bold leading-snug">{c.name}</p>
          {primary && c.description && <p className="mt-0.5 text-xs text-muted-foreground">{c.description}</p>}
        </div>
        <div className="shrink-0 text-right">
          <Badge variant="outline" className="font-mono text-[10px]">
            fit {Math.round(c.score * 100)}
          </Badge>
          <div className="mt-1 h-1 w-16 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-teal-400 transition-all duration-500"
              style={{ width: `${Math.max(4, Math.min(100, Math.round(c.score * 100)))}%` }}
            />
          </div>
        </div>
      </div>

      {/* photo + item list */}
      <div className="mt-2.5 flex items-start gap-3">
        <img
          src={img}
          alt=""
          aria-hidden
          className="h-20 w-20 shrink-0 rounded-xl border object-cover shadow-sm sm:h-24 sm:w-24"
        />
        <ul className="min-w-0 flex-1 space-y-1">
          {c.items.map((i) => (
            <li key={`${i.foodId}-${i.name}`} className="truncate text-xs" title={i.perReference ? `${i.name} — nutrition computed per ${i.perReference} (database reference serving)` : i.name}>
              <span className="font-medium">{i.name}</span> <span className="text-muted-foreground">· {i.quantity} {i.unit}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* macro pills */}
      <div className="mt-2.5 grid grid-cols-3 gap-1.5 sm:grid-cols-5">
        {pills.map((p) => (
          <div
            key={p.sub}
            className={cn(
              "rounded-lg border bg-background/80 px-1.5 py-1.5 text-center",
              p.strong && "border-primary/30 bg-primary/5",
            )}
          >
            <p className={cn("truncate text-xs font-bold tabular-nums", p.strong && "text-primary")}>{p.label}</p>
            <p className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">{p.sub}</p>
          </div>
        ))}
      </div>

      {c.violations.length > 0 && (
        <ul className="mt-2 space-y-1">
          {c.violations.map((v, i) => (
            <li key={i} className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-800 dark:text-amber-300">
              ⚠ {v.message}
            </li>
          ))}
        </ul>
      )}
      {c.indeterminate && (
        <p className="mt-2 rounded-md border px-2 py-1 text-[11px] text-muted-foreground">
          Some constraints could not be verified for this candidate.
        </p>
      )}

      <div className="mt-2.5 flex items-center gap-2">
        {explanation && (
          <Collapsible>
            <CollapsibleTrigger className="group inline-flex items-center gap-1 rounded-full border border-primary/30 bg-background/70 px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10">
              <HeartHandshake className="h-3.5 w-3.5" aria-hidden /> Why this meal?
              <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" aria-hidden />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <p className="mt-2 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-2.5 text-xs leading-relaxed text-foreground/90">
                <BrainCircuit className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span>{explanation}</span>
              </p>
            </CollapsibleContent>
          </Collapsible>
        )}
        <Button
          size="sm"
          className="ml-auto w-auto shrink-0 gap-2 transition-all active:scale-[0.98]"
          onClick={onLog}
          disabled={logging || logged}
        >
          {logged ? "Logged ✓" : logging ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          {logged ? "Added to today" : "Log this meal"}
          {!logged && !logging && <ArrowRight className="h-3.5 w-3.5" aria-hidden />}
        </Button>
      </div>
    </div>
  );
}

/** Thumbs up/down row — persisted feedback loop (one per recommendation). */
function FeedbackRow({
  rating,
  busy,
  showReasons,
  activeReason,
  onRate,
  onReason,
  onToggleReasons,
}: {
  rating: FeedbackRating | null;
  busy: boolean;
  showReasons: boolean;
  activeReason: FeedbackReason | null;
  onRate: (r: FeedbackRating) => void;
  onReason: (reason: FeedbackReason) => void;
  onToggleReasons: () => void;
}) {
  return (
    <div className="rounded-lg border border-dashed bg-muted/20 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {rating === null ? "Was this a good fit for you?" : rating === "up" ? "Glad you liked it — noted ✓" : "Noted — help us improve:"}
        </p>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            aria-pressed={rating === "up"}
            aria-label="Good recommendation"
            disabled={busy}
            onClick={() => onRate("up")}
            className={cn(
              "h-7 gap-1 px-2.5 text-xs transition-all",
              rating === "up" && "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
            )}
          >
            <ThumbsUp className="h-3.5 w-3.5" aria-hidden /> Good
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-pressed={rating === "down"}
            aria-label="Not a good recommendation"
            aria-expanded={showReasons}
            disabled={busy}
            onClick={() => {
              if (rating !== "down") onRate("down");
              else onToggleReasons();
            }}
            className={cn(
              "h-7 gap-1 px-2.5 text-xs transition-all",
              rating === "down" && "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400",
            )}
          >
            <ThumbsDown className="h-3.5 w-3.5" aria-hidden /> Not for me
          </Button>
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden />}
        </div>
      </div>

      {showReasons && (
        <div className="mt-2 flex flex-wrap gap-1.5 border-t border-dashed pt-2">
          {(Object.keys(FEEDBACK_REASON_LABELS) as FeedbackReason[]).map((r) => (
            <button
              key={r}
              type="button"
              disabled={busy}
              onClick={() => onReason(r)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-[11px] transition-colors",
                activeReason === r
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              {FEEDBACK_REASON_LABELS[r]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EvidenceList({ rec }: { rec: NextMealResponse }) {
  if (rec.evidence.length === 0) return null;
  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/60">
        <span className="inline-flex items-center gap-1.5">
          <BookOpen className="h-4 w-4 text-primary" aria-hidden /> Why — evidence used ({rec.evidence.length})
        </span>
        <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" aria-hidden />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-2">
        <ul className="space-y-1.5">
          {rec.keyFactors.slice(0, 6).map((f, i) => (
            <li key={i} className="flex gap-2 text-xs">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
              <span>{f}</span>
            </li>
          ))}
        </ul>
        <ul className="space-y-2 pt-1">
          {rec.evidence.map((ev) => (
            <li key={ev.evidence_id} className="rounded-lg border bg-muted/40 p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="text-xs font-semibold">{ev.document}</span>
                <Badge variant="outline" className="font-mono text-[9px] text-muted-foreground">
                  {ev.source} · {ev.section}
                </Badge>
              </div>
              <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-muted-foreground">{ev.text}</p>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
