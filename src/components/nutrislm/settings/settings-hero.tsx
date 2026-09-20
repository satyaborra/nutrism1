"use client";

/**
 * Settings hero — "Settings" title with green accent, the protection subtitle,
 * real guardrail chips (conditions / allergens / evidence) and the day-night
 * kitchen illustration (matches the reference page header, upgraded to the
 * full-height hero used across Meals / Profile / Goals).
 */
import { Heart, ShieldCheck } from "lucide-react";
import { useNutriStore } from "../store";

export function SettingsHero() {
  const profileBrief = useNutriStore((s) => s.profileBrief);
  const conditionCount = profileBrief?.healthConditions.length ?? 0;
  const allergenCount = profileBrief?.allergies.length ?? 0;

  const chips: string[] = [];
  if (conditionCount > 0) {
    chips.push(`${conditionCount} ${conditionCount === 1 ? "condition" : "conditions"} enforced`);
  }
  if (allergenCount > 0) {
    chips.push(`${allergenCount} ${allergenCount === 1 ? "allergen" : "allergens"} blocked`);
  }
  chips.push("Evidence-backed guardrails");

  return (
    <section
      aria-label="Settings overview"
      className="relative overflow-hidden rounded-3xl border border-primary/10 bg-gradient-to-r from-card via-card to-primary/[0.06] px-5 py-6 shadow-sm shadow-black/[0.03] sm:px-7"
    >
      <div aria-hidden className="pointer-events-none absolute -left-16 -top-20 h-52 w-52 rounded-full bg-primary/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 right-1/4 h-48 w-48 rounded-full bg-teal-500/10 blur-3xl" />

      <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Set<span className="text-primary">tings</span>
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground sm:text-[15px]">
            Appearance, language and how NutriSLM protects your plan.
          </p>
          <ul className="mt-3 flex flex-wrap items-center gap-1.5" aria-label="Active guardrails">
            {chips.map((chip) => (
              <li
                key={chip}
                className="flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/[0.07] px-2.5 py-1 text-[11px] font-semibold text-primary dark:bg-primary/10"
              >
                <ShieldCheck className="h-3 w-3" aria-hidden />
                {chip}
              </li>
            ))}
          </ul>
        </div>

        {/* script motto + day/night illustration */}
        <div className="relative flex items-center gap-4 md:shrink-0" aria-hidden>
          <p className="font-script select-none text-right text-[1.3rem] font-semibold leading-[1.15] text-primary">
            Tuned To You
            <br />
            Every Day <Heart className="inline h-3.5 w-3.5 fill-primary/70 text-primary/70" />
          </p>
          <div className="relative h-20 w-28 overflow-hidden rounded-2xl sm:h-24 sm:w-36">
            <img
              src="/images/settings-duo.png"
              alt=""
              className="h-full w-full object-cover [mask-image:linear-gradient(to_left,transparent,black_45%)] dark:hidden"
            />
            <span aria-hidden className="hidden h-full w-full rounded-2xl bg-gradient-to-l from-primary/25 via-teal-500/15 to-transparent dark:block" />
          </div>
        </div>
      </div>
    </section>
  );
}
