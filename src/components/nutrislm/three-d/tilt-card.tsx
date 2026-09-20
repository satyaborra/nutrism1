"use client";

/**
 * TiltCard — gentle perspective tilt + hover elevation for feature cards.
 * Wraps (never replaces) the existing Card markup; children layout unchanged.
 * - Desktop (fine pointer): subtle pointer-following tilt (≤5°) via useTilt.
 * - Tablet/touch: static premium depth (shadow) only.
 * - prefers-reduced-motion: no tilt, no transition — depth stays.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useTilt } from "./depth";

export function TiltCard({
  children,
  className,
  max = 4.5,
  lift = 2,
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  max?: number;
  lift?: number;
  "aria-label"?: string;
}) {
  const tiltRef = useTilt<HTMLDivElement>({ max, lift });
  return (
    <div className={cn("tilt-scene", className)} aria-label={ariaLabel}>
      <div ref={tiltRef} className="tilt-body depth-hover h-full rounded-[inherit]">
        {children}
      </div>
    </div>
  );
}
