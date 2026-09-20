"use client";

/**
 * How it works — the architecture pipeline as a visual (AI understands → the
 * database answers → deterministic code calculates — never reversed), the
 * evidence sources as chips, and the medical-advice disclaimer.
 */
import { ArrowRight, Brain, Calculator, Database, ShieldCheck, Sparkles } from "lucide-react";

const SOURCES = ["IFCT 2017", "USDA", "WHO", "ICMR-NIN", "ADA", "KDIGO"];

const STEPS = [
  { label: "AI understands", sub: "text & photos", icon: Brain, iconClass: "bg-violet-100 text-violet-500 dark:bg-violet-500/15 dark:text-violet-400" },
  { label: "Database answers", sub: "verified facts", icon: Database, iconClass: "bg-sky-100 text-sky-500 dark:bg-sky-500/15 dark:text-sky-400" },
  { label: "Code calculates", sub: "deterministic", icon: Calculator, iconClass: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400" },
];

export function AboutCard() {
  return (
    <section
      aria-label="How NutriSLM works"
      className="rounded-3xl border border-border/60 bg-card p-5 shadow-sm shadow-black/[0.03] sm:p-6"
    >
      <header>
        <h2 className="flex items-center gap-2 text-base font-bold tracking-tight">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary"
            aria-hidden
          >
            <Sparkles className="h-4 w-4" />
          </span>
          How NutriSLM works
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          One direction only — never the other way around.
        </p>
      </header>

      <ol className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-stretch" aria-label="Nutrition pipeline">
        {STEPS.map(({ label, sub, icon: Icon, iconClass }, i) => (
          <li key={label} className="flex flex-1 items-center gap-2">
            <div className="flex flex-1 items-center gap-2.5 rounded-2xl border border-border/50 bg-background/60 px-3.5 py-2.5">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${iconClass}`} aria-hidden>
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[12.5px] font-bold leading-tight">{label}</span>
                <span className="block truncate text-[10.5px] text-muted-foreground">{sub}</span>
              </span>
              <span className="sr-only">{i < STEPS.length - 1 ? ", then" : ""}</span>
            </div>
            {i < STEPS.length - 1 && (
              <ArrowRight className="h-4 w-4 shrink-0 rotate-90 text-muted-foreground/50 sm:rotate-0" aria-hidden />
            )}
          </li>
        ))}
      </ol>

      <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Evidence sources">
        {SOURCES.map((s) => (
          <li
            key={s}
            className="rounded-full border border-border/70 bg-muted/60 px-2.5 py-1 text-[10.5px] font-semibold text-muted-foreground"
          >
            {s}
          </li>
        ))}
      </ul>

      <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" aria-hidden />
        Not medical advice — targets are configurable starting points. Confirm clinical targets with your care team.
      </p>
    </section>
  );
}
