"use client";

/**
 * Language & preferences — current AI/response language with the five
 * supported languages surfaced as chips (the active one highlighted). Chips
 * deep-link into the Health Profile where the real select lives (gated by the
 * regional-support checkbox there).
 */
import { ChevronRight, Globe, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { languageLabel, useNutriStore } from "../store";

const SUPPORTED = [
  { code: "en", native: "English" },
  { code: "ta", native: "தமிழ்" },
  { code: "te", native: "తెలుగు" },
  { code: "hi", native: "हिन्दी" },
  { code: "kn", native: "ಕನ್ನಡ" },
];

export function LanguageCard() {
  const profileBrief = useNutriStore((s) => s.profileBrief);
  const setView = useNutriStore((s) => s.setView);
  const current = profileBrief?.language ?? "en";
  const currentBase = current.split("-")[0];

  return (
    <section
      aria-label="Language and preferences"
      className="flex flex-col rounded-3xl border border-border/60 bg-card p-5 shadow-sm shadow-black/[0.03]"
    >
      <header>
        <h2 className="flex items-center gap-2 text-base font-bold tracking-tight">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-100 text-sky-500 dark:bg-sky-500/15 dark:text-sky-400"
            aria-hidden
          >
            <Languages className="h-4 w-4" />
          </span>
          Language &amp; preferences
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          Used for AI perception and localized responses.
        </p>
      </header>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/[0.07] px-3 py-1.5 text-sm font-bold text-primary dark:bg-primary/10">
          <Globe className="h-3.5 w-3.5" aria-hidden />
          {languageLabel(current)}
        </span>
      </div>

      <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Supported languages">
        {SUPPORTED.map(({ code, native }) => {
          const active = code === currentBase;
          return (
            <li key={code}>
              <button
                type="button"
                onClick={() => setView("profile")}
                aria-label={`${native} — manage in Health Profile`}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                  active
                    ? "bg-primary/15 text-primary ring-1 ring-primary/40"
                    : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {native}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto pt-3">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setView("profile")}
        >
          Change it in your Health Profile
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>
    </section>
  );
}
