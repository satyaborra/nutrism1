"use client";

/**
 * AchievementBadge3D — a glossy "coin" treatment for earned milestone chips:
 * conic metal rim, embossed inner disc, glass sheen and a hover tilt. Locked
 * badges stay flat and dim (depth is a reward). Content is the caller's icon
 * node (emoji/lucide), kept centered and untouched.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useDepthTier } from "./depth";

const TONES = {
  emerald: {
    rim: "conic-gradient(from 210deg, #34d399, #059669 30%, #a7f3d0 50%, #047857 72%, #34d399)",
    face: "radial-gradient(120% 120% at 30% 20%, #ffffff 0%, #ecfdf5 38%, #d1fae5 100%)",
    shadow: "rgb(5 150 105 / 0.35)",
  },
  amber: {
    rim: "conic-gradient(from 210deg, #fcd34d, #d97706 30%, #fef3c7 50%, #b45309 72%, #fcd34d)",
    face: "radial-gradient(120% 120% at 30% 20%, #ffffff 0%, #fffbeb 38%, #fef3c7 100%)",
    shadow: "rgb(217 119 6 / 0.32)",
  },
  teal: {
    rim: "conic-gradient(from 210deg, #5eead4, #0d9488 30%, #ccfbf1 50%, #0f766e 72%, #5eead4)",
    face: "radial-gradient(120% 120% at 30% 20%, #ffffff 0%, #f0fdfa 38%, #ccfbf1 100%)",
    shadow: "rgb(13 148 136 / 0.32)",
  },
} as const;

export function AchievementBadge3D({
  children,
  label,
  tone = "emerald",
  size = 38,
  className,
}: {
  /** Icon node (emoji or lucide) — rendered flat and centered. */
  children: ReactNode;
  /** Accessible description of the achievement. */
  label: string;
  tone?: keyof typeof TONES;
  size?: number;
  className?: string;
}) {
  const tier = useDepthTier();
  const t = TONES[tone];
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn("group/coin relative inline-flex shrink-0 items-center justify-center rounded-full", className)}
      style={{ width: size, height: size }}
    >
      {/* contact shadow */}
      <span
        aria-hidden
        className="absolute inset-x-[8%] bottom-[-3px] h-[6px] rounded-[50%]"
        style={{ background: "radial-gradient(closest-side, rgb(var(--depth-ink) / 0.28), transparent 80%)" }}
      />
      {/* metal rim */}
      <span aria-hidden className="absolute inset-0 rounded-full" style={{ background: t.rim }} />
      {/* embossed face */}
      <span
        aria-hidden
        className="glass-sheen absolute inset-[12%] rounded-full"
        style={{ background: t.face, boxShadow: `inset 0 1px 2px rgb(255 255 255 / 0.9), inset 0 -3px 6px rgb(var(--depth-ink) / 0.14), 0 2px 5px ${t.shadow}` }}
      />
      {/* sheen sweep on hover (desktop, motion allowed) */}
      {tier === "full" && <span aria-hidden className="coin-sheen" />}
      {/* icon */}
      <span aria-hidden className="relative z-10 flex items-center justify-center leading-none" style={{ fontSize: size * 0.46 }}>
        {children}
      </span>
    </span>
  );
}
