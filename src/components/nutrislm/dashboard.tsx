"use client";

/**
 * Authenticated dashboard: daily summary, weekly trends, food logger,
 * recommendation, hydration, history. Sections refetch when the store's
 * dataVersion is bumped after logging.
 */
import { useCallback, useEffect, useState } from "react";
import { Greeting } from "./greeting";
import { FoodLogger } from "./food-logger";
import { RecommendationCard } from "./recommendation-card";
import { RecentMeals } from "./recent-meals";
import { ProfileDialog } from "./profile-dialog";
import { SummarySection } from "./summary";
import { WeeklyTrends } from "./weekly-trends";
import { HydrationWidget } from "./hydration-widget";
import { AiCoach } from "./ai-coach";
import { FoodLibrary } from "./food-explorer";
import { FadeIn } from "./fade-in";
import { useNutriStore, MEAL_TYPE_ICON } from "./store";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/client/api";
import { todayKey } from "@/lib/client/format";
import type { DailySummaryResponse } from "@/lib/client/types";

export function Dashboard() {
  const dataVersion = useNutriStore((s) => s.dataVersion);
  const profileBrief = useNutriStore((s) => s.profileBrief);
  const [summary, setSummary] = useState<DailySummaryResponse | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const refreshSummary = useCallback(() => {
    api
      .dailySummary(todayKey())
      .then((res) => {
        setSummary(res);
        setSummaryError(null);
      })
      .catch(() => setSummaryError("Could not load today's summary."));
  }, []);

  useEffect(() => {
    refreshSummary();
  }, [refreshSummary, dataVersion]);

  function handleLogged() {
    // dataVersion bump triggers summary + trends + meals + recommendations refresh
    useNutriStore.getState().bumpData();
  }

  return (
    <div className="space-y-6">
      <FadeIn>
        <Greeting />
      </FadeIn>

      <section aria-label="Daily nutrition summary" className="space-y-3">
        {summaryError && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {summaryError}
          </p>
        )}
        {!summary && !summaryError && (
          <div className="space-y-3">
            <Skeleton className="h-40 w-full" />
            <p className="sr-only">Loading daily summary…</p>
          </div>
        )}
        {summary && (
          <FadeIn delay={0.05}>
            <SummarySection summary={summary} />
          </FadeIn>
        )}
      </section>

      <FadeIn delay={0.1}>
        <WeeklyTrends />
      </FadeIn>

      <FadeIn delay={0.12}>
        <AiCoach />
      </FadeIn>

      <div className="grid gap-6 lg:grid-cols-5">
        <section aria-label="Food logging" className="space-y-6 lg:col-span-3">
          <FadeIn delay={0.15}>
            <FoodLogger onLogged={handleLogged} />
          </FadeIn>
          <FadeIn delay={0.2}>
            <RecentMeals />
          </FadeIn>
          <FadeIn delay={0.25}>
            <FoodLibrary />
          </FadeIn>
        </section>
        <section aria-label="Recommendations and settings" className="space-y-6 lg:col-span-2">
          <FadeIn delay={0.15}>
            <RecommendationCard />
          </FadeIn>
          <FadeIn delay={0.2}>
            <HydrationWidget />
          </FadeIn>
          <FadeIn delay={0.25}>
            <div className="flex justify-center lg:justify-start">
              <ProfileDialog onSaved={handleLogged} />
            </div>
            {profileBrief && profileBrief.allergies.length > 0 && (
              <p className="mt-4 rounded-lg border border-dashed bg-muted/40 p-3 text-center text-xs text-muted-foreground lg:text-left">
                {MEAL_TYPE_ICON.snack} Hard-excluded allergens: <strong>{profileBrief.allergies.join(", ")}</strong>. Items
                containing these are filtered before ranking.
              </p>
            )}
          </FadeIn>
        </section>
      </div>
    </div>
  );
}
