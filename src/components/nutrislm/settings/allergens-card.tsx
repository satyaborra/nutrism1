"use client";

/**
 * Allergen hard-exclusions — amber badges with per-allergen icons, matching
 * the reference. These act as pre-ranking hard filters in the recommendation
 * engine, so the card says exactly that.
 */
import { Ban, ChevronRight, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNutriStore } from "../store";

const ALLERGEN_EMOJI: Record<string, string> = {
  dairy: "🥛",
  nuts: "🌰",
  peanuts: "🥜",
  gluten: "🌾",
  egg: "🥚",
  fish: "🐟",
  soy: "🫘",
};

function allergenLabel(raw: string): string {
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function AllergensCard() {
  const profileBrief = useNutriStore((s) => s.profileBrief);
  const setView = useNutriStore((s) => s.setView);
  const allergies = profileBrief?.allergies ?? [];

  return (
    <section
      aria-label="Allergen hard-exclusions"
      className="flex flex-col rounded-3xl border border-border/60 bg-card p-5 shadow-sm shadow-black/[0.03]"
    >
      <header>
        <h2 className="flex items-center gap-2 text-base font-bold tracking-tight">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-500 dark:bg-amber-500/15 dark:text-amber-400"
            aria-hidden
          >
            <Ban className="h-4 w-4" />
          </span>
          Allergen hard-exclusions
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          Filtered out before ranking — never surfaced, even as alternatives.
        </p>
      </header>

      {allergies.length > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Excluded allergens">
          {allergies.map((a) => (
            <li
              key={a}
              className="flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[13px] font-semibold text-amber-700 dark:text-amber-400"
            >
              <span aria-hidden>{ALLERGEN_EMOJI[a] ?? "⚠️"}</span>
              {allergenLabel(a)}
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4 flex-1 rounded-2xl border border-dashed border-border/70 px-3.5 py-5 text-center">
          <p className="text-[13px] font-medium text-muted-foreground">No allergens configured.</p>
          <p className="mt-1 text-[11px] text-muted-foreground/80">
            Mark allergies carefully — they become hard filters across suggestions.
          </p>
        </div>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-3">
        <p className="flex items-center gap-1.5 text-[10.5px] leading-snug text-muted-foreground/80">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-500/80" aria-hidden />
          Applied to meal ranking and next-meal suggestions.
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="-mr-2 h-8 shrink-0 gap-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setView("profile")}
        >
          Manage
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>
    </section>
  );
}
