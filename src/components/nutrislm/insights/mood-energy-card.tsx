"use client";

/**
 * Weekly Mood & Energy — how the user felt after meals (mood scores derived
 * deterministically from their own reflection-note quick-chips on the server)
 * plus the hydration line for context. Emoji markers sit on the mood curve.
 */
import { format, parseISO } from "date-fns";
import { Smile } from "lucide-react";
import type { InsightsResponse } from "@/lib/client/types";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const MOOD_LABELS: Record<number, string> = { 1: "Low", 2: "Okay", 3: "Good", 4: "Great" };

function moodEmoji(mood: number): string {
  if (mood >= 3.5) return "😄";
  if (mood >= 2.6) return "🙂";
  if (mood >= 1.8) return "😐";
  return "😕";
}

function MoodTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: { date: string; mood: number | null; hydration: number } }[];
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-xl border border-border/60 bg-popover/95 px-3 py-2 shadow-lg backdrop-blur">
      <p className="text-[11px] font-medium text-muted-foreground">
        {format(parseISO(`${d.date}T12:00:00`), "EEEE, d MMM")}
      </p>
      <p className="text-xs font-semibold">
        Mood: {d.mood !== null ? `${MOOD_LABELS[Math.round(d.mood)] ?? d.mood} ${moodEmoji(d.mood)}` : "no notes"}
      </p>
      <p className="text-[11px] text-muted-foreground">Hydration: {d.hydration} glass{d.hydration === 1 ? "" : "es"}</p>
    </div>
  );
}

interface MoodDatum {
  date: string;
  label: string;
  mood: number | null;
  hydration: number;
}

export function MoodEnergyCard({ data }: { data: InsightsResponse }) {
  const chartData: MoodDatum[] = data.moodHydration.map((d) => ({
    date: d.date,
    label: format(parseISO(`${d.date}T12:00:00`), "EEE"),
    mood: d.mood,
    hydration: d.hydration,
  }));
  const hasMood = chartData.some((d) => d.mood !== null);

  return (
    <section
      aria-label="Weekly mood and hydration chart"
      className="flex flex-col rounded-2xl border border-border/60 bg-card p-5 shadow-sm shadow-black/[0.03] transition-shadow duration-300 hover:shadow-md hover:shadow-primary/5 lg:col-span-5"
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-lime-100 text-lime-600 dark:bg-lime-500/15 dark:text-lime-400" aria-hidden>
            <Smile className="h-[18px] w-[18px]" />
          </span>
          <div>
            <h3 className="text-[15px] font-bold leading-tight">Weekly Mood &amp; Energy</h3>
            <p className="text-xs text-muted-foreground">How you felt after meals</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-medium text-muted-foreground" aria-hidden>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Mood
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-violet-500" /> Hydration
          </span>
        </div>
      </header>

      {!hasMood && (
        <p className="mt-2 rounded-lg bg-muted/60 px-3 py-1.5 text-[11px] text-muted-foreground">
          Add a mood chip when logging a meal (e.g. &ldquo;enjoyed it&rdquo;) and your mood curve will bloom here.
        </p>
      )}

      <div className="mt-1 h-44 w-full flex-1" role="img" aria-label="Two-line chart: daily mood from your meal notes and daily hydration glasses">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="moodGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.26} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="currentColor" className="text-border/70" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={10.5} tickMargin={8} className="fill-muted-foreground" />
            <YAxis
              tickLine={false}
              axisLine={false}
              fontSize={10.5}
              width={44}
              domain={[0.6, 4.4]}
              ticks={[1, 2, 3, 4]}
              tickFormatter={(v: number) => MOOD_LABELS[v] ?? ""}
              className="fill-muted-foreground"
            />
            {/* Hydration gets its own hidden 0–10 axis so it doesn't fight the 1–4 mood scale */}
            <YAxis yAxisId="hydration" hide domain={[0, 10]} />
            <Tooltip content={<MoodTooltip />} cursor={{ stroke: "rgba(139,92,246,0.3)", strokeWidth: 1.5 }} />
            <Area
              type="monotone"
              dataKey="mood"
              stroke="#10b981"
              strokeWidth={2.5}
              fill="url(#moodGrad)"
              connectNulls
              dot={(props: { cx?: number; cy?: number; payload?: MoodDatum; index?: number }) => {
                const { cx, cy, payload, index } = props;
                if (cx === undefined || cy === undefined || !payload || payload.mood === null) return <g key={index} />;
                return (
                  <text
                    key={payload.date}
                    x={cx}
                    y={cy}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={14}
                    role="img"
                    aria-label={`Mood ${MOOD_LABELS[Math.round(payload.mood)] ?? ""}`}
                  >
                    {moodEmoji(payload.mood)}
                  </text>
                );
              }}
              activeDot={{ r: 5, fill: "#10b981", stroke: "white", strokeWidth: 2 }}
            />
            <Line
              yAxisId="hydration"
              type="monotone"
              dataKey="hydration"
              stroke="#8b5cf6"
              strokeWidth={2}
              dot={{ r: 3.5, fill: "#8b5cf6", stroke: "white", strokeWidth: 1.5 }}
              activeDot={{ r: 5, stroke: "white", strokeWidth: 2 }}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
