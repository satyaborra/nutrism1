"use client";

/**
 * Calorie Trend — 7/14/30-day intake vs target bar chart (recharts).
 * Gradient bars, dashed target reference line, rich tooltip with "% of target",
 * CSV export + weekly digest entry points preserved from the previous view.
 */
import { format, parseISO } from "date-fns";
import { Download, Loader2, TrendingUp } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { api } from "@/lib/client/api";
import type { InsightsResponse } from "@/lib/client/types";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface TrendDatum {
  label: string;
  date: string;
  calories: number;
  meals: number;
}

function CalorieTooltip({
  active,
  payload,
  target,
}: {
  active?: boolean;
  payload?: { payload: TrendDatum }[];
  target: number;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const pct = target > 0 && d.calories > 0 ? Math.round((d.calories / target) * 100) : null;
  return (
    <div className="rounded-xl border border-border/60 bg-popover/95 px-3.5 py-2.5 shadow-lg backdrop-blur">
      <p className="text-[11px] font-medium text-muted-foreground">
        {format(parseISO(`${d.date}T12:00:00`), "EEEE, d MMM")}
      </p>
      {d.meals === 0 ? (
        <p className="text-sm font-semibold">No meals logged</p>
      ) : (
        <>
          <p className="text-sm font-bold tabular-nums">{d.calories.toLocaleString("en-US")} kcal</p>
          {pct !== null && (
            <p className="text-[11px] font-medium text-muted-foreground">
              {pct}% of target · {d.meals} meal{d.meals > 1 ? "s" : ""}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export function CalorieTrendCard({ data }: { data: InsightsResponse }) {
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);
  const target = data.targets.calories;

  const chartData: TrendDatum[] = data.perDay.map((d) => ({
    label: format(parseISO(`${d.date}T12:00:00`), "EEE"),
    date: d.date,
    calories: d.calories,
    meals: d.meals,
  }));

  const maxVal = chartData.reduce((m, d) => Math.max(m, d.calories), 0);
  const yMax = Math.ceil((Math.max(target, maxVal) * 1.18) / 500) * 500 || 1000;

  async function handleExport() {
    setExporting(true);
    try {
      const { url, filename } = await api.exportCsv(7);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast({ title: "Export ready", description: `${filename} downloaded — one row per meal with the full nutrient panel.` });
    } catch (e) {
      toast({
        title: "Export failed",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <section
      aria-label="Calorie trend chart"
      className="flex flex-col rounded-2xl border border-border/60 bg-card p-5 shadow-sm shadow-black/[0.03] transition-shadow duration-300 hover:shadow-md hover:shadow-primary/5 lg:col-span-6"
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400" aria-hidden>
            <TrendingUp className="h-[18px] w-[18px]" />
          </span>
          <div>
            <h3 className="text-[15px] font-bold leading-tight">Calorie Trend</h3>
            <p className="text-xs text-muted-foreground">Your daily calorie intake vs target</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 text-[11px] font-medium text-muted-foreground" aria-hidden>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Actual Intake
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 border-t-2 border-dashed border-orange-500" /> Target ({target.toLocaleString("en-US")})
            </span>
          </div>
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={exporting}
            aria-label="Export the last 7 days of meals as CSV"
            title="Export last 7 days as CSV"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-primary focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
          </button>
        </div>
      </header>

      <div className="mt-3 h-56 w-full" role="img" aria-label={`Bar chart of daily calories for the last ${data.days} days versus a ${target} kcal target`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 14, right: 6, bottom: 0, left: -12 }} barCategoryGap="32%">
            <defs>
              <linearGradient id="calBarGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4ade80" />
                <stop offset="55%" stopColor="#10b981" />
                <stop offset="100%" stopColor="#059669" />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="currentColor" className="text-border/70" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} tickMargin={8} className="fill-muted-foreground" />
            <YAxis
              tickLine={false}
              axisLine={false}
              fontSize={10}
              width={46}
              tickCount={5}
              allowDecimals={false}
              domain={[0, yMax]}
              tickFormatter={(v: number) => (v >= 1000 ? `${(Math.round(v / 100) / 10).toFixed(1)}k` : `${Math.round(v)}`)}
              className="fill-muted-foreground"
            />
            <Tooltip content={<CalorieTooltip target={target} />} cursor={{ fill: "rgba(16,185,129,0.07)" }} />
            <ReferenceLine
              y={target}
              stroke="#f97316"
              strokeDasharray="7 5"
              strokeWidth={1.8}
              label={{
                value: `Target (${target.toLocaleString("en-US")})`,
                position: "insideTopRight",
                fontSize: 10,
                fontWeight: 600,
                fill: "#f97316",
              }}
            />
            <Bar dataKey="calories" radius={[7, 7, 3, 3]} maxBarSize={44}>
              {chartData.map((d, i) => (
                <Cell
                  key={i}
                  fill={d.meals === 0 ? "var(--muted)" : "url(#calBarGrad)"}
                  className={cn(d.date === data.range.end && d.meals > 0 && "[filter:drop-shadow(0_3px_6px_rgba(16,185,129,0.35))]")}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
