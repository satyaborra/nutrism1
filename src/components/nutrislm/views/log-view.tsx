"use client";

/**
 * Log Food view — the full multimodal logging wizard plus the verified food
 * library beneath it.
 */
import { UtensilsCrossed } from "lucide-react";
import { FoodLogger } from "../food-logger";
import { FoodLibrary } from "../food-explorer";
import { FadeIn } from "../fade-in";
import { useNutriStore } from "../store";
import { PageHeader } from "./page-header";

export function LogView() {
  const bumpData = useNutriStore((s) => s.bumpData);

  return (
    <div className="space-y-5">
      <FadeIn>
        <PageHeader
          icon={<UtensilsCrossed className="h-5 w-5" />}
          title="Log Food"
          subtitle="Describe it in any language, snap a photo, or pick from your favorites."
        />
      </FadeIn>
      <FadeIn delay={0.05}>
        <FoodLogger onLogged={bumpData} />
      </FadeIn>
      <FadeIn delay={0.1}>
        <FoodLibrary />
      </FadeIn>
    </div>
  );
}
