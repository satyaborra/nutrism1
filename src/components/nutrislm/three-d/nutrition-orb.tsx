"use client";

/**
 * NutritionOrb — glossy glass sphere with a conic progress ring. A decorative
 * centerpiece for hero surfaces: the value lives inside as crisp, flat text
 * (numbers are never skewed or animated) while the orb itself carries the 3D.
 * Fully static under prefers-reduced-motion (ring + sheen remain).
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useDepthTier } from "./depth";

export function NutritionOrb({
  value,
  size = 96,
  label,
  children,
  className,
  tone = "emerald",
  float = true,
}: {
  /** 0–100 progress shown by the ring. */
  value: number;
  /** Rendered diameter in px. */
  size?: number;
  /** Accessible description, e.g. "62% of today's calorie target". */
  label: string;
  /** Center content — keep it plain text/numbers (rendered flat). */
  children: ReactNode;
  className?: string;
  tone?: "emerald" | "amber" | "sky";
  float?: boolean;
}) {
  const tier = useDepthTier();
  const pct = Math.max(0, Math.min(100, value));
  const ringTone =
    tone === "amber"
      ? "rgb(245 158 11 / 0.9) rgb(251 191 36 / 0.75)"
      : tone === "sky"
        ? "rgb(14 165 233 / 0.9) rgb(56 189 248 / 0.75)"
        : "rgb(5 150 105 / 0.95) rgb(52 211 153 / 0.8)";
  const glowTone =
    tone === "amber"
      ? "rgb(245 158 11 / 0.28)"
      : tone === "sky"
        ? "rgb(14 165 233 / 0.28)"
        : "rgb(16 185 129 / 0.3)";

  return (
    <span
      role="img"
      aria-label={label}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full",
        float && tier !== "flat" && "float-soft-slow",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {/* ambient glow puddle behind the orb */}
      <span
        aria-hidden
        className="absolute inset-[-14%] rounded-full"
        style={{ background: `radial-gradient(closest-side, ${glowTone}, transparent 74%)`, filter: "blur(4px)" }}
      />
      {/* conic progress ring */}
      <span
        aria-hidden
        className="absolute inset-0 rounded-full"
        style={{
          background: `conic-gradient(from -90deg, ${ringTone.split(" ")[0]} 0%, ${ringTone.split(" ")[1]} ${pct}%, rgb(16 185 129 / 0.12) ${pct}%, rgb(16 185 129 / 0.12) 100%)`,
        }}
      />
      {/* inner glass sphere */}
      <span
        aria-hidden
        className="glass-sheen absolute inset-[9%] rounded-full bg-background shadow-[inset_0_2px_6px_rgb(255_255_255/0.7),inset_0_-6px_12px_rgb(var(--depth-ink)/0.08)]"
      >
        <span
          aria-hidden
          className="absolute left-[16%] top-[10%] h-[34%] w-[46%] rounded-full bg-gradient-to-b from-white/90 to-white/0 dark:from-white/25"
        />
      </span>
      {/* flat value, centered above the glass */}
      <span aria-hidden className="relative z-10 flex flex-col items-center justify-center text-center leading-none">
        {children}
      </span>
    </span>
  );
}
