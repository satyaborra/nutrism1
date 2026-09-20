"use client";

/**
 * Meals page hero — big title + subtitle on the left, the salad-bowl photo with
 * hand-written script accents on the right (matches the reference design).
 */
import { Heart } from "lucide-react";

export function MealsHero() {
  return (
    <section
      aria-label="Meals overview"
      className="relative overflow-hidden rounded-3xl border border-primary/10 bg-gradient-to-r from-card via-card to-primary/[0.06] px-5 py-6 shadow-sm shadow-black/[0.03] sm:px-7 sm:py-7"
    >
      {/* soft blobs */}
      <div aria-hidden className="pointer-events-none absolute -left-16 -top-20 h-52 w-52 rounded-full bg-primary/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 right-1/3 h-48 w-48 rounded-full bg-teal-500/10 blur-3xl" />

      <div className="relative flex flex-col gap-5 md:flex-row md:items-center">
        {/* title block */}
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Meals
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground sm:text-[15px]">
            Track, manage and get insights from your daily meals.
          </p>
        </div>

        {/* photo + script accents */}
        <div className="relative flex items-center justify-end gap-3 md:w-[380px] md:shrink-0" aria-hidden>
          <div className="pointer-events-none absolute -top-1 left-0 hidden select-none md:block">
            <p className="font-script text-[1.45rem] font-semibold leading-[1.1] text-primary">
              Healthy
              <br />
              <span className="pl-4">Meals</span>
              <br />
              Happier You <Heart className="inline h-3.5 w-3.5 fill-primary/70 text-primary/70" />
            </p>
          </div>
          <div className="pointer-events-none absolute -top-2 right-0 hidden select-none lg:block">
            <p className="font-script text-right text-[1.05rem] font-medium leading-[1.25] text-primary/90">
              Nourish Today
              <br />
              For a Better
              <br />
              Tomorrow
            </p>
          </div>
          <div className="relative h-24 w-36 overflow-hidden rounded-2xl shadow-md shadow-primary/10 sm:h-28 sm:w-44 md:mr-24">
            <img
              src="/images/hero-bowl.png"
              alt=""
              className="h-full w-full object-cover [mask-image:linear-gradient(to_right,transparent,black_22%)] dark:opacity-60 dark:[mask-image:linear-gradient(to_right,transparent,black_30%)]"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
