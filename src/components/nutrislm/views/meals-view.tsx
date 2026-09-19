"use client";

/**
 * Meals view — premium hero with live weekly stats (streak, meals, kcal/day,
 * days logged), then the verified meal history and the activity calendar
 * (click any day to drill into its meals or backfill one).
 */
import { useEffect, useState } from "react";
import { Activity, CalendarCheck, Flame, UtensilsCrossed } from "lucide-react";
import { RecentMeals } from "../recent-meals";
import { ActivityCalendar } from "../activity-calendar";
import { FadeIn } from "../fade-in";
import { useNutriStore } from "../store";
import { api } from "@/lib/client/api";
import { formatNumber } from "@/lib/client/format";
import type { WeeklySummaryResponse } from "@/lib/client/types";
import { HeroStat, ViewHero } from "./view-hero";

/** Hero stat chips — rendered only while the weekly summary is available. */
function MealsHeroStats({ summary }: { summary: WeeklySummaryResponse }) {
  const streakLabel = `${summary.streak} ${summary.streak === 1 ? "day" : "days"}`;
  return (
    <>
      <HeroStat
        icon={<Flame className="h-4 w-4" aria-hidden />}
        label="logging streak"
        value={streakLabel}
        tone="amber"
        title={`Logging streak: ${streakLabel}`}
      />
      <HeroStat
        icon={<UtensilsCrossed className="h-4 w-4" aria-hidden />}
        label="meals logged this week"
        value={formatNumber(summary.weekTotals.meals)}
        tone="emerald"
        title={`Meals logged this week: ${summary.weekTotals.meals}`}
      />
      <HeroStat
        icon={<Activity className="h-4 w-4" aria-hidden />}
        label="avg kcal/day"
        value={`${formatNumber(summary.avgCalories)} kcal`}
        tone="teal"
        title={`Average ${formatNumber(summary.avgCalories)} kcal per day over the last 7 days`}
      />
      <HeroStat
        icon={<CalendarCheck className="h-4 w-4" aria-hidden />}
        label="days logged"
        value={`${summary.weekTotals.daysLogged}/7`}
        tone="emerald"
        title={`${summary.weekTotals.daysLogged} of 7 days logged this week`}
      />
    </>
  );
}

export function MealsView() {
  const dataVersion = useNutriStore((s) => s.dataVersion);
  const [summary, setSummary] = useState<WeeklySummaryResponse | null>(null);

  // Refetch whenever meals change (recent-meals bumps dataVersion after
  // edits/deletes) so the hero stats always mirror the verified server data.
  useEffect(() => {
    let alive = true;
    api
      .weeklySummary()
      .then((res) => {
        if (alive) setSummary(res);
      })
      .catch((err) => {
        // Graceful fail — hero simply renders without stats, sections stay usable.
        console.warn("[meals] weekly summary unavailable:", err);
        if (alive) setSummary(null);
      });
    return () => {
      alive = false;
    };
  }, [dataVersion]);

  return (
    <div className="space-y-5">
      <FadeIn>
        <ViewHero
          title="Meals"
          subtitle="Your verified meal history — expand any entry for the full nutrient breakdown, edit lines, or backfill a missed day from the calendar."
          script="Every Bite, Accounted For"
          image="/images/banner-vegetables.png"
          stats={summary ? <MealsHeroStats summary={summary} /> : undefined}
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
