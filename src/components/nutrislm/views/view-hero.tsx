"use client";

/**
 * Shared premium hero system for the sidebar views.
 *
 * ViewHero — a wide gradient band with the view title, a handwritten Caveat
 * accent line, an optional chip/actions slot and a right-edge photo masked
 * into the wash (desktop only).
 *
 * HeroStat — small glass stat chips used inside the hero (streak, targets…).
 */

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type HeroStatTone = "emerald" | "teal" | "amber" | "rose";

const TONE_ICON: Record<HeroStatTone, string> = {
  emerald: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  teal: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  rose: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
};

export function ViewHero({
  title,
  subtitle,
  script,
  image,
  chip,
  actions,
  stats,
}: {
  title: string;
  subtitle: string;
  /** Handwritten accent line under the subtitle (Caveat). */
  script?: string;
  /** Photo masked into the right edge of the wash (desktop only). */
  image?: string;
  /** Optional badge rendered above the title (e.g. goal chip). */
  chip?: React.ReactNode;
  /** Optional action buttons rendered top-right. */
  actions?: React.ReactNode;
  /** Optional row of HeroStat chips under the copy. */
  stats?: React.ReactNode;
}) {
  return (
    <Card className="relative overflow-hidden rounded-3xl border-primary/15 bg-gradient-to-br from-primary/15 via-primary/5 to-teal-500/5 p-0 shadow-sm">
      {image && (
        <img
          src={image}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 hidden h-full w-1/2 object-cover md:block [mask-image:linear-gradient(to_left,black_50%,transparent_96%)]"
        />
      )}
      <div className="relative flex items-start justify-between gap-4 p-6 sm:p-8">
        <div className="min-w-0 max-w-2xl">
          {chip && <div className="mb-3">{chip}</div>}
          <h1 className="text-2xl font-extrabold tracking-tight text-emerald-950 dark:text-emerald-50 sm:text-3xl lg:text-4xl">
            {title}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">{subtitle}</p>
          {script && (
            <p className="font-script mt-3 -rotate-2 text-xl font-semibold text-primary sm:text-2xl">{script}</p>
          )}
          {stats && <div className="mt-5 flex flex-wrap items-stretch gap-2.5">{stats}</div>}
        </div>
        {actions && <div className="flex shrink-0 items-start gap-2">{actions}</div>}
      </div>
    </Card>
  );
}

export function HeroStat({
  icon,
  label,
  value,
  tone = "emerald",
  title,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  tone?: HeroStatTone;
  /** Accessible description, e.g. "Logging streak: 4 days". */
  title?: string;
}) {
  return (
    <div
      title={title}
      className="flex items-center gap-2.5 rounded-2xl border border-white/50 bg-white/60 px-3.5 py-2.5 shadow-sm backdrop-blur-sm transition-transform hover:-translate-y-0.5 dark:border-white/10 dark:bg-white/5"
    >
      <span
        aria-hidden
        className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", TONE_ICON[tone])}
      >
        {icon}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-base font-bold tabular-nums text-emerald-950 dark:text-emerald-50">
          {value}
        </span>
        <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      </span>
    </div>
  );
}
