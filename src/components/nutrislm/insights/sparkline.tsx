"use client";

/**
 * Tiny smooth sparkline (pure SVG) used inside the KPI cards.
 * Renders a soft gradient area under a rounded stroke with an end dot —
 * matches the reference design's hand-drawn feel without a chart dependency.
 */

const W = 76;
const H = 30;
const PAD = 3;

function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

export function Sparkline({
  values,
  color,
  id,
  className,
}: {
  values: number[];
  /** Stroke color (hex/oklch). */
  color: string;
  /** Unique id for the gradient def. */
  id: string;
  className?: string;
}) {
  const clean = values.length > 0 ? values : [0, 0];
  const max = Math.max(...clean);
  const min = Math.min(...clean);
  const span = max - min || 1;
  const step = (W - PAD * 2) / Math.max(1, clean.length - 1);

  const points = clean.map((v, i) => ({
    x: PAD + i * step,
    // Invert: larger values sit higher.
    y: H - PAD - ((v - min) / span) * (H - PAD * 2),
  }));

  const line = smoothPath(points);
  const area = `${line} L ${points[points.length - 1].x} ${H - 1} L ${points[0].x} ${H - 1} Z`;
  const last = points[points.length - 1];
  const flat = max === 0;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      aria-hidden="true"
      role="presentation"
    >
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark-${id})`} />
      <path
        d={line}
        fill="none"
        stroke={flat ? "currentColor" : color}
        strokeWidth={2}
        strokeLinecap="round"
        opacity={flat ? 0.3 : 0.95}
      />
      {!flat && (
        <circle cx={last.x} cy={last.y} r={2.6} fill={color} stroke="white" strokeWidth={1.2} />
      )}
    </svg>
  );
}
