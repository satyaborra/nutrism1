"use client";

/**
 * Small SVG progress donut used in the "Today's Nutrients" rail card.
 * Pure SVG — animated stroke with a glass highlight, no chart dependency.
 */
import { cn } from "@/lib/utils";

export function NutrientDonut({
  pct,
  color,
  trackClass,
  size = 86,
  stroke = 9,
  id,
}: {
  /** 0..100+ (clamped to 100 for the ring; the label shows the real number). */
  pct: number;
  color: string;
  /** Tailwind class for the ring background track. */
  trackClass: string;
  size?: number;
  stroke?: number;
  id: string;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${Math.round(pct)} percent complete`}
      className={cn("-rotate-90")}
    >
      <defs>
        <linearGradient id={`donut-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.95" />
          <stop offset="100%" stopColor={color} stopOpacity="0.75" />
        </linearGradient>
      </defs>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        className={trackClass}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        stroke={`url(#donut-${id})`}
        strokeDasharray={c}
        strokeDashoffset={offset}
        className="transition-[stroke-dashoffset] duration-700 ease-out"
      />
      {/* glass highlight */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r - stroke / 2 - 2.5}
        fill="none"
        stroke="white"
        strokeOpacity={0.18}
        strokeWidth={1.5}
      />
    </svg>
  );
}
