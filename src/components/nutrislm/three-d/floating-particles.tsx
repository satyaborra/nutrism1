"use client";

/**
 * FloatingParticles — barely-there ambient motes for hero surfaces. Renders
 * only on the "full" tier (desktop fine-pointer), never when reduced motion
 * is preferred, and stays aria-hidden decorative. Deterministic layout (no
 * re-render jitter); very low opacity so it reads as atmosphere, not action.
 */
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useDepthTier } from "./depth";

export function FloatingParticles({
  count = 10,
  variant = "dots",
  className,
}: {
  count?: number;
  variant?: "dots" | "leaves";
  className?: string;
}) {
  const tier = useDepthTier();

  const motes = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        // deterministic pseudo-random from index — stable across renders
        const r = (n: number) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
        return {
          left: 4 + r(1) * 92,
          size: variant === "leaves" ? 8 + r(2) * 8 : 3 + r(2) * 5,
          dur: 13 + r(3) * 11,
          delay: -r(4) * 18,
          drift: (r(5) - 0.5) * 60,
          opacity: variant === "leaves" ? 0.16 + r(6) * 0.1 : 0.22 + r(6) * 0.16,
          round: r(7) > 0.4,
        };
      }),
    [count, variant],
  );

  if (tier !== "full") return null;

  return (
    <span aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      {motes.map((m, i) => (
        <span
          key={i}
          className={cn("particle bg-emerald-400/70 dark:bg-emerald-300/60", m.round ? "" : "rotate-45 rounded-[2px]")}
          style={{
            left: `${m.left}%`,
            width: m.size,
            height: m.size,
            borderRadius: m.round ? undefined : "3px",
            ["--particle-dur" as string]: `${m.dur}s`,
            ["--particle-delay" as string]: `${m.delay}s`,
            ["--particle-drift" as string]: `${m.drift}px`,
            ["--particle-opacity" as string]: `${m.opacity}`,
          }}
        />
      ))}
    </span>
  );
}
