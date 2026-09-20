"use client";

/**
 * FoodScanner — decorative "AI is looking at your photo" overlay for the
 * Log-Meal preview: corner brackets, a faint perspective grid and a soft
 * green scanning beam while analysis is running. Overlay only — it never
 * blocks pointer events or alters the underlying image/semantics.
 */
import { cn } from "@/lib/utils";

export function FoodScanner({
  active,
  className,
  label = "Scanning your food with AI",
}: {
  /** While true the sweep beam animates; otherwise a calm idle frame shows. */
  active: boolean;
  className?: string;
  label?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]", className)}
      data-scanner={active ? "on" : "idle"}
    >
      {/* faint perspective grid */}
      <span className="absolute inset-0 opacity-[0.14]" style={{ backgroundImage: "linear-gradient(rgb(16 185 129 / 0.5) 1px, transparent 1px), linear-gradient(90deg, rgb(16 185 129 / 0.5) 1px, transparent 1px)", backgroundSize: "26px 26px" }} />
      {/* soft tint */}
      <span className={cn("absolute inset-0 bg-gradient-to-t from-emerald-500/10 via-transparent to-emerald-400/5 transition-opacity duration-500", active ? "opacity-100" : "opacity-60")} />
      {/* sweeping beam */}
      {active && <span className="scan-beam" />}
      {/* corner brackets */}
      <span className="absolute left-2 top-2 h-5 w-5 rounded-tl-md border-l-2 border-t-2 border-emerald-500/80" />
      <span className="absolute right-2 top-2 h-5 w-5 rounded-tr-md border-r-2 border-t-2 border-emerald-500/80" />
      <span className="absolute bottom-2 left-2 h-5 w-5 rounded-bl-md border-b-2 border-l-2 border-emerald-500/80" />
      <span className="absolute bottom-2 right-2 h-5 w-5 rounded-br-md border-b-2 border-r-2 border-emerald-500/80" />
      {/* status chip */}
      <span
        className={cn(
          "absolute left-1/2 top-2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-background/85 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 shadow-sm backdrop-blur-sm dark:text-emerald-300",
          active && "scan-glow",
        )}
      >
        <span className={cn("relative flex h-1.5 w-1.5", active && "animate-pulse")}>
          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
        </span>
        {label}
      </span>
    </span>
  );
}
