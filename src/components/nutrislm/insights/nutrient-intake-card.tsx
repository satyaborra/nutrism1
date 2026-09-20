"use client";

/**
 * Nutrient Intake — daily-average vs recommended-intake progress bars with
 * emoji icon chips, "value / target" captions and % chips (reference design).
 */
import { motion } from "framer-motion";
import { Apple } from "lucide-react";
import type { InsightsResponse } from "@/lib/client/types";

const ICONS: Record<string, React.ReactNode> = {
  protein: <span aria-hidden className="text-[15px] leading-none">🫘</span>,
  carbohydrates: <span aria-hidden className="text-[15px] leading-none">🍞</span>,
  fat: <span aria-hidden className="text-[15px] leading-none">🥑</span>,
  fiber: <span aria-hidden className="text-[15px] leading-none">🥦</span>,
};

const PCT_CHIP: Record<string, string> = {
  protein: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
  carbohydrates: "bg-amber-500/12 text-amber-700 dark:text-amber-400",
  fat: "bg-orange-500/12 text-orange-700 dark:text-orange-400",
  fiber: "bg-violet-500/12 text-violet-700 dark:text-violet-400",
};

export function NutrientIntakeCard({ data }: { data: InsightsResponse }) {
  const rows = data.nutrientIntake;

  return (
    <section
      aria-label="Nutrient intake versus recommended daily intake"
      className="flex flex-col rounded-2xl border border-border/60 bg-card p-5 shadow-sm shadow-black/[0.03] transition-shadow duration-300 hover:shadow-md hover:shadow-primary/5 lg:col-span-4"
    >
      <header className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400" aria-hidden>
          <Apple className="h-[18px] w-[18px]" />
        </span>
        <div>
          <h3 className="text-[15px] font-bold leading-tight">Nutrient Intake</h3>
          <p className="text-xs text-muted-foreground">How you&apos;re doing vs recommended daily intake</p>
        </div>
      </header>

      {data.daysLogged === 0 ? (
        <div className="flex flex-1 items-center justify-center py-8">
          <p className="max-w-[16rem] text-center text-xs text-muted-foreground">
            Nothing logged in this window — nutrient averages appear after your first meal.
          </p>
        </div>
      ) : (
        <ul className="mt-4 flex-1 space-y-4">
          {rows.map((r, i) => (
            <li key={r.key} className="flex items-center gap-3">
              <span
                aria-hidden
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/70"
              >
                {ICONS[r.key]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-[13px] font-semibold">{r.label}</p>
                  <p className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    <span className="font-bold text-foreground">{Math.round(r.value)}</span> / {Math.round(r.target)} g
                  </p>
                </div>
                <div className="mt-1.5 h-[7px] overflow-hidden rounded-full bg-muted" role="img" aria-label={`${r.label} at ${r.pct}% of the ${Math.round(r.target)} g daily target`}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{
                      background: `linear-gradient(90deg, ${r.color}bb, ${r.color})`,
                      boxShadow: `0 0 6px ${r.color}55`,
                    }}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, r.pct)}%` }}
                    transition={{ duration: 0.9, delay: 0.15 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
              </div>
              <span
                className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${PCT_CHIP[r.key]}`}
              >
                {r.pct}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
