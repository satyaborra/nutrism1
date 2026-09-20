"use client";

/**
 * Three-segment donut for the goal board summary: completed (emerald),
 * in-progress (amber), not-started (muted). Pure SVG with soft segment gaps.
 */
export function GoalsDonut({
  completed,
  inProgress,
  notStarted,
  size = 150,
}: {
  completed: number;
  inProgress: number;
  notStarted: number;
  size?: number;
}) {
  const stroke = 17;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = Math.max(1, completed + inProgress + notStarted);
  const gap = c * 0.015;

  const segs = [
    { n: completed, cls: "stroke-emerald-500 dark:stroke-emerald-400" },
    { n: inProgress, cls: "stroke-amber-400 dark:stroke-amber-300" },
    { n: notStarted, cls: "stroke-muted-foreground/20" },
  ].filter((s) => s.n > 0);

  let acc = 0;
  const arcs = segs.map((s) => {
    const frac = s.n / total;
    const len = Math.max(0.5, frac * c - gap);
    const arc = { ...s, dasharray: `${len} ${c - len}`, dashoffset: -(acc * c) };
    acc += frac;
    return arc;
  });

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${completed} of ${completed + inProgress + notStarted} goals completed`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted/60" />
        {arcs.map((a, i) => (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            className={`${a.cls} transition-[stroke-dasharray,stroke-dashoffset] duration-700 ease-out`}
            strokeDasharray={a.dasharray}
            strokeDashoffset={a.dashoffset}
          />
        ))}
        {/* glass highlight */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r - stroke / 2 - 2}
          fill="none"
          strokeWidth={1.5}
          className="stroke-white/40 dark:stroke-white/10"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-extrabold tabular-nums leading-none">
          {completed} / {completed + inProgress + notStarted}
        </span>
        <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Completed</span>
      </div>
    </div>
  );
}
