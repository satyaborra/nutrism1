"use client";

/**
 * Goals view — the deterministic milestone board earned from logged data.
 */
import { Target } from "lucide-react";
import { MilestonesStrip } from "../milestones-strip";
import { FadeIn } from "../fade-in";
import { PageHeader } from "./page-header";

export function GoalsView() {
  return (
    <div className="space-y-5">
      <FadeIn>
        <PageHeader
          icon={<Target className="h-5 w-5" />}
          title="Goals"
          subtitle="Badges earned automatically from your logged data — verifiable, never guessed."
        />
      </FadeIn>
      <FadeIn delay={0.05}>
        <MilestonesStrip />
      </FadeIn>
    </div>
  );
}
