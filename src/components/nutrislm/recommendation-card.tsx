"use client";

/**
 * Next-meal recommendation: context → candidates → constraints → RAG evidence →
 * AI ranking → validation (all server-side). This UI only presents the result
 * and can log the recommended meal directly (foodIds included server-side).
 */
import { useState } from "react";
import {
  BookOpen,
  BrainCircuit,
  ChevronDown,
  FlaskConical,
  Loader2,
  RefreshCw,
  Salad,
  Sparkles,
  UtensilsCrossed,
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
import { api, ApiError } from "@/lib/client/api";
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

  async function fetchRec(refresh = false) {
    setLoading(true);
    setError(null);
    try {
      const res = await api.nextMeal(refresh);
      setRec(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not generate a recommendation.");
    } finally {
      setLoading(false);
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
    <Card id="recommendation" className="scroll-mt-20 transition-shadow duration-300 hover:shadow-md hover:shadow-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UtensilsCrossed className="h-5 w-5 text-primary" aria-hidden />
          What should I eat next?
        </CardTitle>
        <CardDescription>
          Ranked for your remaining macros, health conditions and preferences — with cited evidence.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!rec && !loading && !error && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-6 text-center">
            <Salad className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">
              Get a personalized meal idea based on what you&apos;ve eaten today.
            </p>
            <Button onClick={() => fetchRec(false)} className="mt-1">
              <Sparkles className="mr-2 h-4 w-4" aria-hidden /> Suggest my next meal
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
            {rec.explanation && (
              <div className="rounded-xl border border-primary/25 bg-primary/5 p-3">
                <p className="flex items-start gap-2 text-xs leading-relaxed text-foreground/90">
                  <BrainCircuit className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <span>{rec.explanation}</span>
                </p>
              </div>
            )}
            <CandidateView c={rec.selected} primary logged={isLogged(rec.selected)} onLog={() => logCandidate(rec.selected)} logging={loggingAlt === rec.selected.id} />

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
  logged,
  onLog,
  logging,
}: {
  c: RecommendationCandidate;
  primary?: boolean;
  logged: boolean;
  onLog: () => void;
  logging: boolean;
}) {
  return (
    <div className={cn("rounded-xl border p-3", primary && "border-primary/40 bg-primary/5")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-snug">{c.name}</p>
          {primary && c.description && <p className="mt-0.5 text-xs text-muted-foreground">{c.description}</p>}
        </div>
        <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
          fit {Math.round(c.score * 100)}
        </Badge>
      </div>

      <ul className="mt-2 flex flex-wrap gap-1.5">
        {c.items.map((i) => (
          <li key={`${i.foodId}-${i.name}`} className="rounded-full bg-muted/70 px-2.5 py-0.5 text-xs">
            {i.name} <span className="text-muted-foreground">· {i.quantity} {i.unit}</span>
          </li>
        ))}
      </ul>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span><strong className="text-foreground">{formatKcal(c.nutrition.calories)}</strong></span>
        <span>protein {formatGrams(c.nutrition.protein)}</span>
        <span>carbs {formatGrams(c.nutrition.carbohydrates)}</span>
        <span>fat {formatGrams(c.nutrition.fat)}</span>
        <span>fiber {formatGrams(c.nutrition.fiber)}</span>
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

      <Button size="sm" className="mt-2.5 w-full" onClick={onLog} disabled={logging || logged}>
        {logged ? "Logged ✓" : logging ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
        {logged ? "Added to today" : "Log this meal"}
      </Button>
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
