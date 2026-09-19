"use client";

/**
 * Insights view — premium hero with weekly-digest stats, the 7-day trends
 * chart beside a deterministic Weekly Digest spotlight card, then the AI
 * coach and the notes journal. The spotlight card hosts the shared
 * WeeklyDigestDialog (which owns its own trigger) behind a styled
 * "View full digest" control.
 */
import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  Award,
  CalendarCheck,
  CalendarDays,
  Droplets,
  Scale,
  Target,
  UtensilsCrossed,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { WeeklyTrends } from "../weekly-trends";
import { WeeklyDigestDialog } from "../weekly-digest";
import { AiCoach } from "../ai-coach";
import { NotesJournal } from "../notes-journal";
import { FadeIn } from "../fade-in";
import { useNutriStore } from "../store";
import { api } from "@/lib/client/api";
import { formatNumber, formatShort } from "@/lib/client/format";
import type { WeeklyDigestResponse } from "@/lib/client/types";
import { HeroStat, ViewHero } from "./view-hero";

/** Hero stat chips — rendered only while the weekly digest is available. */
function InsightsHeroStats({ digest }: { digest: WeeklyDigestResponse }) {
  const avg = digest.hydration.avgGlasses;
  return (
    <>
      <HeroStat
        icon={<Target className="h-4 w-4" aria-hidden />}
        label="days on target"
        value={`${digest.adherence}%`}
        tone="emerald"
        title={`${digest.adherence}% of logged days inside the ±10% calorie band`}
      />
      <HeroStat
        icon={<CalendarCheck className="h-4 w-4" aria-hidden />}
        label="days logged"
        value={`${digest.daysLogged}`}
        tone="teal"
        title={`${digest.daysLogged} of 7 days logged this week`}
      />
      <HeroStat
        icon={<Droplets className="h-4 w-4" aria-hidden />}
        label="avg hydration"
        value={`${avg !== null ? formatShort(avg) : "0"} / ${digest.hydration.goal} glasses`}
        tone={avg !== null && avg < digest.hydration.goal ? "rose" : "teal"}
        title={`Average ${avg !== null ? formatShort(avg) : "no"} glasses of water per day (goal ${digest.hydration.goal})`}
      />
      <HeroStat
        icon={<Award className="h-4 w-4" aria-hidden />}
        label="best day"
        value={digest.bestDay ? format(parseISO(`${digest.bestDay.date}T12:00:00`), "EEE d MMM") : "—"}
        tone="amber"
        title={
          digest.bestDay
            ? `Closest to target: ${formatNumber(digest.bestDay.calories)} kcal (${digest.bestDay.deltaPct}% off)`
            : "No best day yet"
        }
      />
    </>
  );
}

/** Tint for the calorie-band adherence bar: emerald ≥80, amber 50–79, rose <50. */
function bandFor(adherence: number): { bar: string; value: string } {
  if (adherence >= 80) return { bar: "[&>div]:bg-emerald-500", value: "text-emerald-600 dark:text-emerald-400" };
  if (adherence >= 50) return { bar: "[&>div]:bg-amber-500", value: "text-amber-600 dark:text-amber-400" };
  return { bar: "[&>div]:bg-rose-500", value: "text-rose-600 dark:text-rose-400" };
}

/**
 * Local spotlight card for the deterministic weekly digest. weekly-digest.tsx
 * only exports the self-triggering WeeklyDigestDialog, so the trigger is
 * stretched invisibly over a styled "View full digest" label — one real,
 * keyboard-focusable control, no child modifications.
 */
function DigestSpotlightCard({
  digest,
  failed,
}: {
  digest: WeeklyDigestResponse | null;
  failed: boolean;
}) {
  const band = bandFor(digest?.adherence ?? 0);
  return (
    <Card className="h-full rounded-3xl border-primary/15 shadow-sm">
      <CardHeader>
        <CardTitle className="flex min-w-0 flex-wrap items-center gap-2 text-base">
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
          >
            <Scale className="h-4 w-4" />
          </span>
          Weekly digest
          {digest && (
            <Badge variant="outline" className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
              week of {format(parseISO(`${digest.weekOf}T12:00:00`), "d MMM")}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>A deterministic report card — no AI, every number reproducible.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {!digest && !failed && (
          <div className="space-y-4" aria-busy="true">
            <Skeleton className="h-14 w-36" />
            <Skeleton className="h-2.5 w-full" />
            <Skeleton className="h-16 w-full" />
            <span className="sr-only">Loading weekly digest…</span>
          </div>
        )}
        {!digest && failed && (
          <p className="rounded-xl border border-dashed border-primary/25 bg-primary/5 p-4 text-sm text-muted-foreground">
            The digest is unavailable right now — it will return with your next sync. You can still try the full report below.
          </p>
        )}
        {digest &&
          (digest.daysLogged === 0 ? (
            <p className="rounded-xl border border-dashed border-primary/25 bg-primary/5 p-4 text-sm text-muted-foreground">
              No meals logged this week yet — log your first meal and the digest lights up.
            </p>
          ) : (
            <div className="flex flex-1 flex-col">
              <div className="min-w-0">
                <p className={cn("text-5xl font-extrabold tracking-tight tabular-nums", band.value)}>
                  {digest.adherence}
                  <span className="ml-0.5 text-2xl">%</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">of logged days inside the ±10% calorie band</p>
              </div>
              <Progress
                value={digest.adherence}
                className={cn("mt-3 h-2.5", band.bar)}
                aria-label={`Calorie-band adherence ${digest.adherence}%`}
              />
              <dl className="mt-5 space-y-2.5 text-sm">
                <div className="flex items-center gap-2.5">
                  <UtensilsCrossed className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <dt className="min-w-0 text-muted-foreground">Days logged</dt>
                  <dd className="ml-auto shrink-0 font-semibold tabular-nums">
                    {digest.daysLogged}
                    <span className="text-muted-foreground">/7</span>
                  </dd>
                </div>
                <div className="flex items-center gap-2.5">
                  <Droplets className="h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" aria-hidden />
                  <dt className="min-w-0 text-muted-foreground">Hydration avg</dt>
                  <dd className="ml-auto shrink-0 font-semibold tabular-nums">
                    {digest.hydration.avgGlasses !== null ? formatShort(digest.hydration.avgGlasses) : "—"}
                    <span className="text-muted-foreground"> / {digest.hydration.goal} glasses</span>
                  </dd>
                </div>
              </dl>
              {digest.bestDay && (
                <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                  <Award className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">Best day</span> ·{" "}
                    {format(parseISO(`${digest.bestDay.date}T12:00:00`), "EEE d MMM")} ·{" "}
                    {formatNumber(digest.bestDay.calories)} kcal
                    <span className="opacity-80"> ({digest.bestDay.deltaPct}% off)</span>
                  </span>
                </div>
              )}
            </div>
          ))}

        <div className="mt-auto pt-4">
          <p className="text-[11px] text-muted-foreground">
            Regenerated from the database every time you open it — not medical advice.
          </p>
          <div className="group relative mt-3">
            <div className="rounded-xl has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background">
              <span
                aria-hidden
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-background px-4 text-sm font-semibold text-primary transition-colors group-hover:bg-primary/5 dark:bg-white/5 dark:group-hover:bg-primary/10"
              >
                <CalendarDays className="h-4 w-4" aria-hidden />
                View full digest
              </span>
              {/* WeeklyDigestDialog owns its trigger; stretch it invisibly over the styled label. */}
              <div className="absolute inset-0 [&>button]:h-full [&>button]:w-full [&>button]:cursor-pointer [&>button]:opacity-0">
                <WeeklyDigestDialog />
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function InsightsView() {
  const dataVersion = useNutriStore((s) => s.dataVersion);
  const [digest, setDigest] = useState<WeeklyDigestResponse | null>(null);
  const [digestFailed, setDigestFailed] = useState(false);

  // Refetch whenever meals change (edits/deletes bump dataVersion) so the
  // hero stats and the spotlight card stay in sync with verified server data.
  useEffect(() => {
    let alive = true;
    api
      .weeklyDigest()
      .then((res) => {
        if (!alive) return;
        setDigest(res);
        setDigestFailed(false);
      })
      .catch((err) => {
        // Graceful fail — hero simply renders without stats, sections stay usable.
        console.warn("[insights] weekly digest unavailable:", err);
        if (alive) setDigestFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [dataVersion]);

  return (
    <div className="space-y-5">
      <FadeIn>
        <ViewHero
          title="Insights"
          subtitle="Seven-day trends, a deterministic weekly digest, grounded coach guidance and your own reflections."
          script="Patterns, Not Guesswork"
          image="/images/hero-bowl.png"
          stats={digest ? <InsightsHeroStats digest={digest} /> : undefined}
        />
      </FadeIn>

      <div className="grid gap-4 xl:grid-cols-2 xl:gap-6">
        <FadeIn delay={0.05} className="min-w-0 [&>[data-slot=card]]:h-full">
          <WeeklyTrends />
        </FadeIn>
        <FadeIn delay={0.1} className="min-w-0">
          <DigestSpotlightCard digest={digest} failed={digestFailed} />
        </FadeIn>
      </div>

      <FadeIn delay={0.15}>
        <AiCoach />
      </FadeIn>
      <FadeIn delay={0.2}>
        <NotesJournal />
      </FadeIn>
    </div>
  );
}
