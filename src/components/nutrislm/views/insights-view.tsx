"use client";

/**
 * Insights view — weekly trends + digest, the AI coach and the notes journal.
 */
import { BarChart3 } from "lucide-react";
import { WeeklyTrends } from "../weekly-trends";
import { AiCoach } from "../ai-coach";
import { NotesJournal } from "../notes-journal";
import { FadeIn } from "../fade-in";
import { PageHeader } from "./page-header";

export function InsightsView() {
  return (
    <div className="space-y-5">
      <FadeIn>
        <PageHeader
          icon={<BarChart3 className="h-5 w-5" />}
          title="Insights"
          subtitle="Trends, weekly digest, coach guidance and your reflections."
        />
      </FadeIn>
      <FadeIn delay={0.05}>
        <WeeklyTrends />
      </FadeIn>
      <FadeIn delay={0.1}>
        <AiCoach />
      </FadeIn>
      <FadeIn delay={0.15}>
        <NotesJournal />
      </FadeIn>
    </div>
  );
}
