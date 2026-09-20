"use client";

/**
 * Macro Distribution — donut of the window's calorie contribution by macro
 * (Atwater shares computed server-side), center total, side legend and a
 * deterministic "well balanced" verdict chip.
 */
import { Leaf, PieChart as PieIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InsightsResponse } from "@/lib/client/types";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

const TONE_CLASS: Record<InsightsResponse["macros"]["tone"], string> = {
  great: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  good: "bg-teal-500/10 text-teal-700 dark:text-teal-400",
  watch: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
};

export function MacroDonutCard({ data }: { data: InsightsResponse }) {
  const { macros } = data;
  const hasData = macros.totalCalories > 0;

  return (
    <section
      aria-label="Macro distribution chart"
      className="@container glass-sheen flex flex-col rounded-2xl border border-border/60 bg-card p-5 shadow-sm shadow-black/[0.03] transition-shadow duration-300 hover:shadow-md hover:shadow-primary/5 lg:col-span-3"
    >
      <header className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-100 text-rose-500 dark:bg-rose-500/15 dark:text-rose-400" aria-hidden>
          <PieIcon className="h-[18px] w-[18px]" />
        </span>
        <div>
          <h3 className="text-[15px] font-bold leading-tight">Macro Distribution</h3>
          <p className="text-xs text-muted-foreground">Share of calories by macro</p>
        </div>
      </header>

      {hasData ? (
        <div className="mt-1 flex flex-1 flex-col items-center justify-center gap-3 @[310px]:flex-row @[310px]:gap-2">
          <div className="relative h-36 w-36 shrink-0" role="img" aria-label={`Donut chart: ${macros.slices.map((s) => `${s.label} ${s.grams} g (${s.pct}%)`).join(", ")}`}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={macros.slices}
                  dataKey="pct"
                  nameKey="label"
                  innerRadius="66%"
                  outerRadius="94%"
                  paddingAngle={3}
                  cornerRadius={7}
                  strokeWidth={0}
                  startAngle={90}
                  endAngle={-270}
                >
                  {macros.slices.map((s) => (
                    <Cell key={s.key} fill={s.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-extrabold leading-none tracking-tight tabular-nums">
                {macros.totalCalories.toLocaleString("en-US")}
              </span>
              <span className="text-[10.5px] font-medium text-muted-foreground">kcal total</span>
            </div>
          </div>
          <ul className="min-w-0 flex-1 space-y-2 @[310px]:min-w-[8.5rem]" aria-label="Macro legend">
            {macros.slices.map((s) => (
              <li key={s.key} className="flex items-center gap-2 text-xs">
                <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="min-w-0 flex-1 truncate font-medium">{s.label}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {Math.round(s.grams).toLocaleString("en-US")} g{" "}
                  <span className="font-semibold text-foreground">({s.pct}%)</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center py-8">
          <p className="max-w-[16rem] text-center text-xs text-muted-foreground">
            No meals in this window yet — log a few to see your macro balance.
          </p>
        </div>
      )}

      <footer className="mt-3">
        <p
          className={cn(
            "flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11.5px] font-medium leading-snug",
            TONE_CLASS[macros.tone],
          )}
        >
          <Leaf className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {macros.verdict}
        </p>
      </footer>
    </section>
  );
}
