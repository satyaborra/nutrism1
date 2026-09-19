"use client";

/**
 * Dependency-free SVG donut ring used across the premium views
 * (Today's Nutrition, Today's Nutrients, Goals summary, Macro distribution).
 *
 * Single-ring mode:  <Donut value={566} max={2573} tone="emerald">…center…</Donut>
 * Segments mode:     <Donut segments={[{value, tone}, …]}>…</Donut>
 */

import { cn } from "@/lib/utils";
import type { Tone } from "./views/view-hero";
import { toneStroke } from "./views/view-hero";

export function Donut({
  value,
  max,
  segments,
  size = 120,
  stroke = 11,
  tone = "emerald",
  trackClassName = "stroke-primary/15",
  className,
  children,
}: {
  /** Current value (single-ring mode). */
  value?: number;
  /** Max value (single-ring mode). */
  max?: number;
  /** Multi-segment mode — values are normalised against their sum. */
  segments?: { value: number; tone: Tone }[];
  size?: number;
  stroke?: number;
  tone?: Tone;
  trackClassName?: string;
  className?: string;
  /** Center content (e.g. kcal + %). */
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  let arcs: { offset: number; frac: number; color: string }[] = [];
  if (segments && segments.length) {
    const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0) || 1;
    let acc = 0;
    arcs = segments.map((s) => {
      const frac = Math.max(0, s.value) / total;
      const arc = { offset: acc, frac, color: toneStroke(s.tone) };
      acc += frac;
      return arc;
    });
  } else {
    const frac = max && max > 0 ? Math.max(0, Math.min(1, (value ?? 0) / max)) : 0;
    arcs = [{ offset: 0, frac, color: toneStroke(tone) }];
  }

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className={trackClassName} stroke="currentColor" />
        {arcs.map((a, i) =>
          a.frac > 0 ? (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={a.color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${(a.frac * c).toFixed(2)} ${c.toFixed(2)}`}
              strokeDashoffset={`${(-a.offset * c).toFixed(2)}`}
            />
          ) : null
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-tight">{children}</div>
    </div>
  );
}
