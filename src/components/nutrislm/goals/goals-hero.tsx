"use client";

/**
 * Goals page hero — big "Goals" title + habit mission subtitle on the left, the
 * rolling-hills illustration with hand-written script accents on the right
 * (matches the reference design).
 */
import { Heart } from "lucide-react";

export function GoalsHero() {
  return (
    <section
      aria-label="Goals overview"
      className="relative overflow-hidden rounded-3xl border border-primary/10 bg-gradient-to-r from-card via-card to-primary/[0.06] px-5 py-6 shadow-sm shadow-black/[0.03] sm:px-7 sm:py-7"
    >
      {/* soft blobs */}
      <div aria-hidden className="pointer-events-none absolute -left-16 -top-20 h-52 w-52 rounded-full bg-primary/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 right-1/4 h-48 w-48 rounded-full bg-amber-400/10 blur-3xl" />

      <div className="relative flex flex-col gap-4 md:flex-row md:items-center">
        {/* title block */}
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            <span className="text-primary">G</span>oals
          </h1>
          <p className="mt-1.5 max-w-xl text-sm text-muted-foreground sm:text-[15px]">
            Turn your intentions into healthier habits. Track, achieve and unlock a better you.
          </p>
        </div>

        {/* illustration + script accents */}
        <div className="relative flex items-center justify-end md:w-[400px] md:shrink-0" aria-hidden>
          <div className="pointer-events-none absolute -top-2 left-0 hidden select-none md:block">
            <p className="font-script text-[1.4rem] font-semibold leading-[1.12] text-primary">
              Progress
              <br />
              <span className="pl-5">Today</span>
              <br />
              Healthier
              <br />
              <span className="pl-4">Tomorrow</span> <Heart className="inline h-3.5 w-3.5 fill-primary/70 text-primary/70" />
            </p>
          </div>
          <div className="relative h-24 w-44 overflow-hidden rounded-2xl shadow-md shadow-primary/10 sm:h-28 sm:w-52 md:mr-28">
            <img
              src="/images/goals-hills.png"
              alt=""
              className="h-full w-full object-cover [mask-image:radial-gradient(ellipse_at_center,black_55%,transparent_98%)] dark:opacity-55 dark:saturate-[0.85]"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
