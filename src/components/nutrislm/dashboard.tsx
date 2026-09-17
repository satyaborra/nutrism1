"use client";

/**
 * Authenticated dashboard: daily summary, food logger, recommendation, history.
 * Sections refetch when the store's dataVersion is bumped after logging.
 */
import { useCallback, useEffect, useState } from "react";
import { Greeting } from "./greeting";
import { FoodLogger } from "./food-logger";
import { RecommendationCard } from "./recommendation-card";
import { RecentMeals } from "./recent-meals";
import { ProfileDialog } from "./profile-dialog";
import { SummarySection } from "./summary";
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
    // dataVersion bump triggers summary + meals + recommendations refresh
    useNutriStore.getState().bumpData();
  }

  return (
    <div className="space-y-6">
      <Greeting />

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
        {summary && <SummarySection summary={summary} />}
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <section aria-label="Food logging" className="space-y-6 lg:col-span-3">
          <FoodLogger onLogged={handleLogged} />
          <RecentMeals />
        </section>
        <section aria-label="Recommendations and settings" className="space-y-6 lg:col-span-2">
          <RecommendationCard />
          <div className="flex justify-center lg:justify-start">
            <ProfileDialog onSaved={handleLogged} />
          </div>
          {profileBrief && profileBrief.allergies.length > 0 && (
            <p className="rounded-lg border border-dashed bg-muted/40 p-3 text-center text-xs text-muted-foreground lg:text-left">
              {MEAL_TYPE_ICON.snack} Hard-excluded allergens: <strong>{profileBrief.allergies.join(", ")}</strong>. Items
              containing these are filtered before ranking.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
