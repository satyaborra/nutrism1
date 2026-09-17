"use client";

/**
 * Meals view — the full verified meal history plus the activity calendar
 * (click any day to drill into its meals or backfill one).
 */
import { UtensilsCrossed } from "lucide-react";
import { RecentMeals } from "../recent-meals";
import { ActivityCalendar } from "../activity-calendar";
import { FadeIn } from "../fade-in";
import { useNutriStore } from "../store";
import { PageHeader } from "./page-header";

export function MealsView() {
  const bumpData = useNutriStore((s) => s.bumpData);

  return (
    <div className="space-y-5">
      <FadeIn>
        <PageHeader
          icon={<UtensilsCrossed className="h-5 w-5" />}
          title="Meals"
          subtitle="Every logged meal with server-verified totals — expand, edit or backfill."
        />
      </FadeIn>
      <FadeIn delay={0.05}>
        <RecentMeals />
      </FadeIn>
      <FadeIn delay={0.1}>
        <ActivityCalendar />
      </FadeIn>
    </div>
  );
}
