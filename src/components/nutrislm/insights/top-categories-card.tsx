"use client";

/**
 * Top Food Categories — calorie share by food group over the window, with
 * emoji chips and proportional progress bars (bar widths are scaled so the
 * largest category fills the track, matching the reference design).
 */
import { BarChart3 } from "lucide-react";
import { motion } from "framer-motion";
import type { InsightsResponse } from "@/lib/client/types";

const BAR_COLORS = ["#10b981", "#84cc16", "#f59e0b", "#f97316", "#8b5cf6"];

export function TopCategoriesCard({ data }: { data: InsightsResponse }) {
  const cats = data.topCategories;
  const maxPct = cats.reduce((m, c) => Math.max(m, c.pct), 0) || 1;

  return (
    <section
      aria-label="Top food categories"
      className="flex flex-col rounded-2xl border border-border/60 bg-card p-5 shadow-sm shadow-black/[0.03] transition-shadow duration-300 hover:shadow-md hover:shadow-primary/5 lg:col-span-4"
    >
      <header className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-100 text-teal-600 dark:bg-teal-500/15 dark:text-teal-400" aria-hidden>
          <BarChart3 className="h-[18px] w-[18px]" />
        </span>
        <div>
          <h3 className="text-[15px] font-bold leading-tight">Top Food Categories</h3>
          <p className="text-xs text-muted-foreground">
            What you ate the most {data.days === 7 ? "this week" : `in the last ${data.days} days`}
          </p>
        </div>
      </header>

      {cats.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-8">
          <p className="max-w-[16rem] text-center text-xs text-muted-foreground">
            No categorized foods yet — logged meals build this breakdown automatically.
          </p>
        </div>
      ) : (
        <ul className="mt-4 flex-1 space-y-3.5">
          {cats.map((c, i) => (
            <li key={c.category} className="flex items-center gap-3">
              <span aria-hidden className="w-[10.5rem] shrink-0 truncate text-[12.5px] font-medium">
                <span className="mr-1.5">{c.emoji}</span>
                {c.label}
              </span>
              <div
                className="h-[7px] flex-1 overflow-hidden rounded-full bg-muted"
                role="img"
                aria-label={`${c.label}: ${c.pct}% of calories`}
              >
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background: `linear-gradient(90deg, ${BAR_COLORS[i % BAR_COLORS.length]}aa, ${BAR_COLORS[i % BAR_COLORS.length]})`,
                    boxShadow: `0 0 6px ${BAR_COLORS[i % BAR_COLORS.length]}44`,
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(6, (c.pct / maxPct) * 100)}%` }}
                  transition={{ duration: 0.85, delay: 0.1 + i * 0.07, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
              <span className="w-9 shrink-0 text-right text-xs font-bold tabular-nums">{c.pct}%</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
