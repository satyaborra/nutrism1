"use client";

/**
 * Health Profile hero — "Health Profile" title with green accent word, the
 * mission subtitle, script motto and leaves imagery (matches the reference).
 */
import { Heart } from "lucide-react";

export function ProfileHero() {
  return (
    <section
      aria-label="Health profile overview"
      className="relative overflow-hidden rounded-3xl border border-primary/10 bg-gradient-to-r from-card via-card to-primary/[0.06] px-5 py-6 shadow-sm shadow-black/[0.03] sm:px-7"
    >
      <div aria-hidden className="pointer-events-none absolute -left-16 -top-20 h-52 w-52 rounded-full bg-primary/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 right-1/4 h-48 w-48 rounded-full bg-teal-500/10 blur-3xl" />

      <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Health <span className="text-primary">Profile</span>
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground sm:text-[15px]">
            Your health details help NutriSLM create safe, personalized and disease-aware
            nutrition recommendations.
          </p>
        </div>

        {/* script motto + leaves */}
        <div className="relative flex items-center gap-4 md:shrink-0" aria-hidden>
          <p className="font-script select-none text-right text-[1.3rem] font-semibold leading-[1.15] text-primary">
            Your Health
            <br />
            Our Priority <Heart className="inline h-3.5 w-3.5 fill-primary/70 text-primary/70" />
          </p>
          <div className="relative h-20 w-28 overflow-hidden rounded-2xl sm:h-24 sm:w-36">
            <img
              src="/images/hero-leaves.png"
              alt=""
              className="h-full w-full object-cover [mask-image:linear-gradient(to_left,transparent,black_45%)] dark:hidden"
            />
            <span aria-hidden className="hidden h-full w-full rounded-2xl bg-gradient-to-l from-primary/25 to-transparent dark:block" />
          </div>
        </div>
      </div>
    </section>
  );
}
