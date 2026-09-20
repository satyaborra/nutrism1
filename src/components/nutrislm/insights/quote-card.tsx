"use client";

/**
 * Motivation panel — script quote over a soft sage gradient with leaf decor,
 * plus the three mindfulness habit chips from the reference design.
 */
import { Dumbbell, Heart, Droplets } from "lucide-react";

const HABITS = [
  { icon: Heart, label: "Eat Mindfully" },
  { icon: Dumbbell, label: "Stay Active" },
  { icon: Droplets, label: "Stay Hydrated" },
];

export function QuoteCard() {
  return (
    <section
      aria-label="Daily motivation"
      className="relative flex flex-col justify-between overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-emerald-50 via-[#e6f2e3] to-[#cfe7cb] p-5 shadow-sm shadow-black/[0.03] dark:border-primary/20 dark:from-emerald-950/60 dark:via-emerald-900/40 dark:to-teal-950/60 lg:col-span-4"
    >
      {/* decorative leaves */}
      <img
        src="/images/hero-leaves.png"
        alt=""
        aria-hidden
        className="pointer-events-none absolute -right-4 -top-6 h-28 w-28 object-contain opacity-60 [mask-image:radial-gradient(closest-side,black,transparent)] dark:opacity-25"
      />
      <img
        src="/images/hero-leaves.png"
        alt=""
        aria-hidden
        className="pointer-events-none absolute -bottom-8 -left-6 h-24 w-24 -scale-x-100 object-contain opacity-45 [mask-image:radial-gradient(closest-side,black,transparent)] dark:opacity-20"
      />

      <div className="relative pt-1">
        <p className="font-script text-[2rem] font-semibold leading-[1.12] text-emerald-900 dark:text-emerald-100">
          &ldquo;Progress,
          <br />
          not perfection.&rdquo;
        </p>
        <p className="mt-1.5 text-[11px] font-medium tracking-wide text-emerald-800/70 dark:text-emerald-200/60">— NutriSLM</p>
      </div>

      <div className="relative mt-6 grid grid-cols-3 gap-2">
        {HABITS.map(({ icon: Icon, label }) => (
          <div
            key={label}
            className="flex flex-col items-center gap-1.5 rounded-xl bg-white/70 px-2 py-2.5 text-center shadow-sm backdrop-blur-sm transition-transform duration-200 hover:-translate-y-0.5 dark:bg-white/10"
          >
            <Icon className="h-4 w-4 text-emerald-700 dark:text-emerald-300" aria-hidden />
            <span className="text-[10.5px] font-semibold leading-tight text-emerald-900/80 dark:text-emerald-100/80">{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
