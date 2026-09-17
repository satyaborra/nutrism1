"use client";

/**
 * AI Coach — a rate-limited SLM insight over today's deterministic numbers and
 * RAG evidence. Button-triggered (costly call), cached server-side until the
 * user's data changes; refresh forces regeneration within rate limits.
 */
import { useState } from "react";
import { AlertTriangle, BadgeCheck, Lightbulb, RefreshCw, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useNutriStore } from "./store";
import { api } from "@/lib/client/api";
import type { CoachInsightResponse } from "@/lib/client/types";

export function AiCoach() {
  const dataVersion = useNutriStore((s) => s.dataVersion);
  const { toast } = useToast();
  const [data, setData] = useState<CoachInsightResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchInsight(refresh = false) {
    setLoading(true);
    setError(null);
    try {
      const res = await api.coachInsight(refresh);
      setData(res);
    } catch (e) {
      const msg =
        e instanceof Error && e.message.includes("Too many requests")
          ? "The coach needs a short break — try again in a few minutes."
          : "Could not generate the coach insight right now.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  function handleDataVersionBump() {
    // Mark current insight stale visually when meals change; keep it visible until next fetch
    if (data) setData({ ...data, stale: true });
  }

  // subscribe to dataVersion changes
  const [lastSeenVersion, setLastSeenVersion] = useState(dataVersion);
  if (dataVersion !== lastSeenVersion) {
    setLastSeenVersion(dataVersion);
    handleDataVersionBump();
  }

  return (
    <Card className="overflow-hidden border-primary/25 bg-gradient-to-br from-primary/8 via-background to-teal-500/8 dark:from-primary/10 dark:to-teal-500/10">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary" aria-hidden>
                <Sparkles className="h-4 w-4" />
              </span>
              Coach insight
              {data && (
                <Badge
                  variant="outline"
                  className={
                    data.engineSource === "ai"
                      ? "border-primary/40 bg-primary/10 text-[9px] uppercase tracking-wide text-primary"
                      : "border-muted-foreground/40 bg-muted text-[9px] uppercase tracking-wide text-muted-foreground"
                  }
                >
                  {data.engineSource === "ai" ? "AI" : "rule-based"}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              {data
                ? "A note on today's verified numbers and what to aim for next."
                : "Ask the SLM coach to review today's verified numbers — numbers come from the database, never the model."}
            </CardDescription>
          </div>
          {data ? (
            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => fetchInsight(true)} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden />
              {loading ? "Re-thinking…" : "Refresh"}
            </Button>
          ) : (
            <Button size="sm" className="h-8 gap-1.5" onClick={() => fetchInsight(false)} disabled={loading}>
              {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />}
              {loading ? "Coach is thinking…" : "Get today's insight"}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {error && (
          <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {error}
          </p>
        )}

        {loading && !data && (
          <div className="space-y-2" aria-busy="true" aria-label="Coach is analyzing today's data">
            <div className="h-5 w-2/3 animate-pulse rounded-md bg-primary/15" />
            <div className="h-4 w-full animate-pulse rounded-md bg-muted" />
            <div className="h-4 w-5/6 animate-pulse rounded-md bg-muted" />
            <div className="grid gap-1.5 pt-1 sm:grid-cols-3">
              <div className="h-10 animate-pulse rounded-md bg-muted" />
              <div className="h-10 animate-pulse rounded-md bg-muted" />
              <div className="h-10 animate-pulse rounded-md bg-muted" />
            </div>
          </div>
        )}

        {data && (
          <div className={`space-y-3 transition-opacity ${data.stale ? "opacity-60" : ""}`}>
            {data.stale && (
              <p className="text-xs italic text-muted-foreground">You logged something new — refresh the coach for an up-to-date insight.</p>
            )}
            <div>
              <p className="text-sm font-semibold tracking-tight text-foreground">{data.headline}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{data.insight}</p>
            </div>

            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Focus for the rest of today</p>
              <ul className="grid gap-1.5 sm:grid-cols-3">
                {data.focus.map((tip, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 rounded-lg border border-primary/15 bg-background/70 p-2.5 text-xs leading-snug backdrop-blur-sm transition-colors hover:border-primary/35"
                  >
                    <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>

            {data.aiNote && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                {data.aiNote}
              </p>
            )}

            {data.evidenceSources.length > 0 && (
              <p className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                <BadgeCheck className="h-3.5 w-3.5 text-primary" aria-hidden />
                Grounded in:
                {data.evidenceSources.map((s, i) => (
                  <Badge key={i} variant="outline" className="px-1.5 py-0 text-[9px] font-normal">
                    {s}
                  </Badge>
                ))}
              </p>
            )}
          </div>
        )}

        {!data && !loading && !error && (
          <p className="rounded-xl border border-dashed border-primary/30 bg-background/50 p-4 text-center text-sm text-muted-foreground">
            The coach looks at what you logged, your condition constraints and cited clinical evidence — then tells you what to focus on.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
