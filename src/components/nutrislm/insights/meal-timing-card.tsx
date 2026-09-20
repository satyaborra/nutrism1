"use client";

/**
 * Meal Timing — smooth curved area chart of the window's calorie share by meal
 * slot, with per-slot colored dots and % labels (reference design style).
 */
import { Clock } from "lucide-react";
import type { InsightsResponse } from "@/lib/client/types";
import { Area, AreaChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const SLOT_DOT_COLORS: Record<string, string> = {
  breakfast: "#38bdf8",
  lunch: "#10b981",
  dinner: "#f97316",
  snack: "#8b5cf6",
};

function TimingTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: { label: string; pct: number; kcal: number } }[];
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-xl border border-border/60 bg-popover/95 px-3 py-2 shadow-lg backdrop-blur">
      <p className="text-sm font-bold">{d.pct}%</p>
      <p className="text-[11px] text-muted-foreground">
        {d.label} · ~{d.kcal.toLocaleString("en-US")} kcal
      </p>
    </div>
  );
}

interface TimingDatum {
  slot: string;
  label: string;
  pct: number;
  kcal: number;
}

export function MealTimingCard({ data }: { data: InsightsResponse }) {
  const total = data.macros.totalCalories;
  const chartData: TimingDatum[] = data.mealTiming.map((s) => ({
    slot: s.slot,
    label: s.slot === "snack" ? "Snacks" : s.label,
    pct: s.pct,
    kcal: total > 0 ? Math.round((s.pct / 100) * total) : 0,
  }));

  return (
    <section
      aria-label="Meal timing chart"
      className="flex flex-col rounded-2xl border border-border/60 bg-card p-5 shadow-sm shadow-black/[0.03] transition-shadow duration-300 hover:shadow-md hover:shadow-primary/5 lg:col-span-3"
    >
      <header className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400" aria-hidden>
          <Clock className="h-[18px] w-[18px]" />
        </span>
        <div>
          <h3 className="text-[15px] font-bold leading-tight">Meal Timing</h3>
          <p className="text-xs text-muted-foreground">Your calorie intake by time of day</p>
        </div>
      </header>

      <div className="mt-2 h-44 w-full flex-1" role="img" aria-label={`Area chart of calorie share per meal slot: ${chartData.map((d) => `${d.label} ${d.pct}%`).join(", ")}`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 22, right: 20, bottom: 0, left: 28 }}>
            <defs>
              <linearGradient id="timingGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.32} />
                <stop offset="60%" stopColor="#10b981" stopOpacity={0.08} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={10.5} tickMargin={10} interval={0} className="fill-muted-foreground" />
            <YAxis hide domain={[0, 50]} />
            <Tooltip content={<TimingTooltip />} cursor={{ stroke: "rgba(16,185,129,0.3)", strokeWidth: 1.5 }} />
            <Area
              type="monotone"
              dataKey="pct"
              stroke="#10b981"
              strokeWidth={2.5}
              fill="url(#timingGrad)"
              dot={(props: { cx?: number; cy?: number; payload?: TimingDatum; index?: number }) => {
                const { cx, cy, payload, index } = props;
                if (cx === undefined || cy === undefined || !payload) return <g key={index} />;
                const color = SLOT_DOT_COLORS[payload.slot] ?? "#10b981";
                return (
                  <g key={payload.slot ?? index}>
                    <circle cx={cx} cy={cy} r={4.5} fill={color} stroke="white" strokeWidth={2} />
                  </g>
                );
              }}
              activeDot={{ r: 6, strokeWidth: 2, stroke: "white" }}
            >
              <LabelList
                dataKey="pct"
                position="top"
                offset={12}
                formatter={(v: React.ReactNode) => `${String(v)}%`}
                className="fill-foreground"
                style={{ fontSize: 11, fontWeight: 700 }}
              />
            </Area>
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
