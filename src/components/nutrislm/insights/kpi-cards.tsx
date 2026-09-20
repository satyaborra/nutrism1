"use client";

/**
 * KPI hero row — Calories / Protein / Fiber / Water / Weight cards matching the
 * reference design: colored icon chip, big value, delta vs previous window and
 * a per-day sparkline (water shows glass ticks instead).
 */
import { ArrowDownRight, ArrowUpRight, Flame, Minus, Scale, Sprout, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sparkline } from "./sparkline";
import type { InsightsKpiSeries, InsightsResponse } from "@/lib/client/types";

const CARD =
  "group glass-sheen rounded-2xl border border-border/60 bg-card p-4 shadow-sm shadow-black/[0.03] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md hover:shadow-primary/5";

interface SeriesKpiProps {
  icon: React.ReactNode;
  iconClass: string;
  label: string;
  unit: string;
  series: InsightsKpiSeries;
  color: string;
  id: string;
  /** Which direction is the "good" one for the delta chip. */
  goodDirection: "up" | "down";
  comparisonLabel: string;
}

function SeriesKpiCard({ icon, iconClass, label, unit, series, color, id, goodDirection, comparisonLabel }: SeriesKpiProps) {
  const delta = series.deltaPct;
  const isGood = delta !== null && series.direction === goodDirection;
  const isBad = delta !== null && series.direction !== goodDirection && series.direction !== "flat";
  return (
    <div className={CARD}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-105", iconClass)} aria-hidden>
            {icon}
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
            <p className="text-xl font-bold leading-tight tracking-tight tabular-nums">
              {series.value.toLocaleString("en-US")}{" "}
              <span className="text-sm font-semibold text-muted-foreground">{unit}</span>
            </p>
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <div className="min-w-0">
          {delta === null ? (
            <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <Minus className="h-3 w-3" aria-hidden /> — {comparisonLabel}
            </p>
          ) : (
            <p
              className={cn(
                "flex items-center gap-1 text-xs font-semibold",
                isGood ? "text-emerald-600 dark:text-emerald-400" : isBad ? "text-rose-500" : "text-muted-foreground",
              )}
            >
              {series.direction === "up" ? (
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
              ) : series.direction === "down" ? (
                <ArrowDownRight className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Minus className="h-3 w-3" aria-hidden />
              )}
              {Math.abs(delta)}%{" "}
              <span className="font-medium text-muted-foreground">{comparisonLabel}</span>
            </p>
          )}
        </div>
        <Sparkline values={series.sparkline} color={color} id={id} className="h-8 w-[76px] shrink-0" />
      </div>
    </div>
  );
}

function WaterCard({ glasses, goal, pct }: { glasses: number; goal: number; pct: number }) {
  return (
    <div className={CARD}>
      <div className="flex items-center gap-2.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-600 transition-transform duration-300 group-hover:scale-105 dark:bg-sky-500/15 dark:text-sky-400" aria-hidden>
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M12 2.7s6.5 7.1 6.5 11.5a6.5 6.5 0 1 1-13 0C5.5 9.8 12 2.7 12 2.7Z" /></svg>
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-muted-foreground">Water</p>
          <p className="text-xl font-bold leading-tight tracking-tight tabular-nums">
            {glasses} <span className="text-sm font-semibold text-muted-foreground">/ {goal} glasses</span>
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <p className="text-xs font-semibold text-sky-600 dark:text-sky-400">{pct}%</p>
        <div className="flex items-end gap-1" role="img" aria-label={`${glasses} of ${goal} water glasses today`}>
          {Array.from({ length: goal }).map((_, i) => (
            <span
              key={i}
              aria-hidden
              className={cn(
                "w-[7px] rounded-full transition-all duration-500",
                i < glasses
                  ? "h-4 bg-gradient-to-t from-sky-600 to-sky-400 shadow-[0_1px_2px_rgba(14,165,233,0.4)]"
                  : "h-2.5 bg-sky-200/70 dark:bg-sky-500/15",
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function WeightCard({ valueKg, comparisonLabel }: { valueKg: number | null; comparisonLabel: string }) {
  return (
    <div className={CARD}>
      <div className="flex items-center gap-2.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600 transition-transform duration-300 group-hover:scale-105 dark:bg-violet-500/15 dark:text-violet-400" aria-hidden>
          <Scale className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-muted-foreground">Weight</p>
          <p className="text-xl font-bold leading-tight tracking-tight tabular-nums">
            {valueKg !== null ? valueKg.toLocaleString("en-US") : "—"}{" "}
            <span className="text-sm font-semibold text-muted-foreground">kg</span>
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground" title="Weight history isn't tracked yet — update it from your Health Profile">
          <Minus className="h-3 w-3" aria-hidden /> — {comparisonLabel}
        </p>
        <Sparkline values={[]} color="#8b5cf6" id="weight" className="h-8 w-[76px] shrink-0 opacity-40" />
      </div>
    </div>
  );
}

export function KpiCards({ data, comparisonLabel }: { data: InsightsResponse; comparisonLabel: string }) {
  const { kpis } = data;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-5" role="list" aria-label="Weekly key metrics">
      <div role="listitem">
        <SeriesKpiCard
          icon={<Flame className="h-5 w-5" />}
          iconClass="bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400"
          label="Calories"
          unit="kcal"
          series={kpis.calories}
          color="#f97316"
          id="kcal"
          goodDirection="down"
          comparisonLabel={comparisonLabel}
        />
      </div>
      <div role="listitem">
        <SeriesKpiCard
          icon={<Target className="h-5 w-5" />}
          iconClass="bg-teal-100 text-teal-600 dark:bg-teal-500/15 dark:text-teal-400"
          label="Protein"
          unit="g"
          series={kpis.protein}
          color="#14b8a6"
          id="protein"
          goodDirection="up"
          comparisonLabel={comparisonLabel}
        />
      </div>
      <div role="listitem" className="sm:col-span-1">
        <SeriesKpiCard
          icon={<Sprout className="h-5 w-5" />}
          iconClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400"
          label="Fiber"
          unit="g"
          series={kpis.fiber}
          color="#10b981"
          id="fiber"
          goodDirection="up"
          comparisonLabel={comparisonLabel}
        />
      </div>
      <div role="listitem">
        <WaterCard glasses={kpis.water.glasses} goal={kpis.water.goal} pct={kpis.water.pct} />
      </div>
      <div role="listitem" className="col-span-2 sm:col-span-1">
        <WeightCard valueKg={kpis.weight.valueKg} comparisonLabel={comparisonLabel} />
      </div>
    </div>
  );
}
