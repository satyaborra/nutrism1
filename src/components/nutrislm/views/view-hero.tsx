"use client";

/**
 * Shared premium hero system (matches the reference mockups):
 *
 * ViewHero  — light gradient band: title + subtitle left; handwritten Caveat
 *             accent + optional illustration right; optional `stats` slot
 *             rendered as a row of StatCards under the copy.
 * StatCard  — white rounded card: tinted icon chip, big tabular-nums value,
 *             small sub-line (deltas) and optional progress bar / extra slot.
 * Sparkline — tiny SVG polyline for the stat cards.
 */

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type Tone = "emerald" | "teal" | "amber" | "rose" | "blue" | "purple" | "orange";

const TONE_CHIP: Record<Tone, string> = {
  emerald: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  teal: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  rose: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  blue: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  purple: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  orange: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
};

const TONE_STROKE: Record<Tone, string> = {
  emerald: "#10b981",
  teal: "#14b8a6",
  amber: "#f59e0b",
  rose: "#f43f5e",
  blue: "#0ea5e9",
  purple: "#a855f7",
  orange: "#f97316",
};

export function toneStroke(tone: Tone): string {
  return TONE_STROKE[tone];
}

export function ViewHero({
  title,
  subtitle,
  script,
  image,
  actions,
  stats,
  className,
}: {
  title: React.ReactNode;
  subtitle: string;
  /** Handwritten accent rendered top-right (Caveat, slightly rotated). */
  script?: React.ReactNode;
  /** Illustration shown on the right edge of the band (desktop only). */
  image?: string;
  /** Optional action buttons rendered top-right beside the script. */
  actions?: React.ReactNode;
  /** StatCard row rendered as a grid under the hero band. */
  stats?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-4", className)}>
      <Card className="relative overflow-hidden rounded-3xl border-primary/15 bg-gradient-to-br from-primary/10 via-primary/5 to-teal-500/5 p-0 pb-6 shadow-sm">
        {image && (
          <img
            src={image}
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 hidden h-full w-[38%] object-cover object-center md:block [mask-image:linear-gradient(to_left,black_55%,transparent_100%)]"
          />
        )}
        <div className="relative flex items-start justify-between gap-6 p-6 sm:p-8 sm:pb-2">
          <div className="min-w-0 max-w-2xl">
            <h1 className="text-3xl font-extrabold tracking-tight text-emerald-950 dark:text-emerald-50 sm:text-4xl">
              {title}
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-[15px]">{subtitle}</p>
          </div>
          <div className="relative z-10 hidden shrink-0 flex-col items-end gap-2 sm:flex">
            {script && (
              <p className="font-script max-w-[220px] -rotate-3 rounded-2xl bg-white/70 px-3 py-1.5 text-right text-xl font-semibold leading-tight text-primary shadow-sm backdrop-blur-sm dark:bg-emerald-950/50 sm:text-2xl">
                {script}
              </p>
            )}
            {actions && <div className="mt-1 flex items-center gap-2">{actions}</div>}
          </div>
        </div>
        {/* Stat cards span the full band width below the copy so values never truncate */}
        {stats && <div className="relative z-10 mt-2 hidden gap-4 px-6 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:px-8">{stats}</div>}
      </Card>
      {/* Stat cards stack on mobile */}
      {stats && <div className="grid grid-cols-2 gap-3 sm:hidden">{stats}</div>}
    </div>
  );
}

export function StatCard({
  icon,
  tone = "emerald",
  label,
  value,
  sub,
  subTone = "muted",
  progress,
  extra,
  className,
}: {
  icon: React.ReactNode;
  tone?: Tone;
  label: string;
  value: React.ReactNode;
  /** Small line under the value, e.g. "↓ 28% vs yesterday". */
  sub?: React.ReactNode;
  subTone?: "muted" | "up" | "down";
  /** 0..1 — renders a green progress bar under the content. */
  progress?: number;
  /** Optional extra (dots, mini chart, badge) rendered to the right / below. */
  extra?: React.ReactNode;
  className?: string;
}) {
  const subColor =
    subTone === "up" ? "text-emerald-600 dark:text-emerald-400" : subTone === "down" ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground";
  return (
    <Card className={cn("rounded-2xl border-primary/10 bg-card/90 p-4 shadow-sm backdrop-blur-sm", className)}>
      <div className="flex items-center gap-2.5">
        <span aria-hidden className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", TONE_CHIP[tone])}>
          {icon}
        </span>
        <span className="truncate text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <span className="min-w-0 truncate text-xl font-bold tabular-nums text-foreground">{value}</span>
        {extra && <div className="shrink-0">{extra}</div>}
      </div>
      {sub && <p className={cn("mt-1 text-xs font-medium", subColor)}>{sub}</p>}
      {typeof progress === "number" && (
        <div className="mt-2.5">
          <div className="h-2 w-full overflow-hidden rounded-full bg-primary/15">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500"
              style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }}
            />
          </div>
        </div>
      )}
    </Card>
  );
}

export function Sparkline({
  data,
  tone = "emerald",
  width = 56,
  height = 26,
  className,
}: {
  data: number[];
  tone?: Tone;
  width?: number;
  height?: number;
  className?: string;
}) {
  if (!data.length) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const step = data.length > 1 ? width / (data.length - 1) : width;
  const points = data
    .map((v, i) => `${(i * step).toFixed(1)},${(height - 3 - ((v - min) / span) * (height - 6)).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className={className}>
      <polyline
        points={points}
        fill="none"
        stroke={TONE_STROKE[tone]}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
    </svg>
  );
}
