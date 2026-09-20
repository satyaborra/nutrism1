"use client";

/**
 * HealthCondition3D — soft-embossed icon tile for health-condition rows.
 * Keeps the caller's color classes; adds a glass top-light, inset shadow and
 * a small hover raise. The row itself (form/checkbox/text) stays flat.
 */
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import { useDepthTier } from "./depth";

export function HealthCondition3D({
  icon: Icon,
  tileClassName,
  iconClassName = "h-4 w-4",
  label,
}: {
  icon: ComponentType<{ className?: string }>;
  /** Existing color classes (bg-X text-Y …) from the condition row. */
  tileClassName?: string;
  iconClassName?: string;
  /** Accessible description of the condition icon. */
  label: string;
}) {
  const tier = useDepthTier();
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        "glass-sheen relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl ring-1 ring-black/[0.04] transition-transform duration-200 dark:ring-white/10",
        tileClassName,
        tier === "full" && "hover:-translate-y-0.5",
      )}
      style={{ boxShadow: "inset 0 1px 1px rgb(255 255 255 / 0.65), 0 2px 6px -1px rgb(var(--depth-ink) / 0.18)" }}
    >
      <Icon className={iconClassName} />
    </span>
  );
}
