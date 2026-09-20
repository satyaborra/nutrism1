"use client";

/**
 * WaterDrop3D — glossy droplet with a live fill level and glass highlights.
 * Decorative twin of the numeric readout (which stays flat): the drop shows
 * the same percent at a glance. Static shell + fill under reduced motion.
 */
import { cn } from "@/lib/utils";
import { useDepthTier } from "./depth";

export function WaterDrop3D({
  percent,
  size = 52,
  label,
  className,
}: {
  /** 0–100 fill level. */
  percent: number;
  size?: number;
  /** Accessible description, e.g. "Water goal 63% complete". */
  label: string;
  className?: string;
}) {
  const tier = useDepthTier();
  const pct = Math.max(0, Math.min(100, percent));
  return (
    <span
      role="img"
      aria-label={label}
      className={cn("relative inline-block shrink-0", tier !== "flat" && "drop-bob", className)}
      style={{ width: size, height: size * 1.14 }}
    >
      {/* drop body */}
      <span
        aria-hidden
        className="absolute inset-0 overflow-hidden border border-sky-300/60 bg-gradient-to-b from-sky-100/70 to-sky-50/40 shadow-[inset_0_1px_2px_rgb(255_255_255/0.9),0_6px_14px_-6px_rgb(14_165_233/0.5)] dark:border-sky-400/30 dark:from-sky-500/15 dark:to-sky-500/5"
        style={{ borderRadius: "6% 100% 58% 58% / 6% 62% 38% 100%", transform: "rotate(0deg)" }}
      >
        {/* liquid fill */}
        <span
          className="absolute inset-x-0 bottom-0 transition-[height] duration-700 ease-out"
          style={{
            height: `${pct}%`,
            background: "linear-gradient(to top, rgb(2 132 199 / 0.85), rgb(56 189 248 / 0.75) 70%, rgb(125 211 252 / 0.65))",
          }}
        >
          {/* liquid surface wobble line */}
          <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-sky-200/80" />
        </span>
        {/* glass highlight */}
        <span aria-hidden className="absolute left-[18%] top-[10%] h-[26%] w-[30%] -rotate-12 rounded-full bg-gradient-to-b from-white/95 to-white/0 dark:from-white/30" />
        <span aria-hidden className="absolute bottom-[10%] right-[20%] h-[12%] w-[14%] rounded-full bg-white/40" />
      </span>
    </span>
  );
}
