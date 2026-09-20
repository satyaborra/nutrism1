"use client";

/**
 * Computed Daily Targets — server-computed numbers only (never client math),
 * with deterministic context chips derived from the active health conditions,
 * plus the guideline footer and the full targetNotes in an info popover.
 */
import { Droplet, Droplets, Flame, FlaskConical, Info, Leaf, Lightbulb, Target, Wheat } from "lucide-react";
import { Dumbbell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ProfileResponse } from "@/lib/client/types";

interface TargetRow {
  key: string;
  label: string;
  value: string;
  unit: string;
  chip: string | null;
  chipClass: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
}

function deriveChips(profile: ProfileResponse): TargetRow[] {
  const t = profile.computedTargets;
  const p = profile.profile;
  const cond = new Set(p.healthConditions);
  const has = (c: string) => cond.has(c);
  const sodium = Math.round(t.sodium);

  return [
    {
      key: "calories",
      label: "Calories",
      value: Math.round(t.calories).toLocaleString("en-US"),
      unit: "kcal",
      chip: cond.size > 0 ? `Adjusted (for ${[...cond].join(", ")})` : "Standard",
      chipClass: cond.size > 0
        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
        : "bg-muted text-muted-foreground",
      icon: Flame,
      iconClass: "bg-orange-100 text-orange-500 dark:bg-orange-500/15 dark:text-orange-400",
    },
    {
      key: "protein",
      label: "Protein",
      value: `${Math.round(t.protein)}`,
      unit: "g",
      chip: has("CKD") ? "CKD-moderated" : p.goal === "gain_muscle" ? "Elevated" : "Moderate",
      chipClass: has("CKD")
        ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
        : "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
      icon: Dumbbell,
      iconClass: "bg-sky-100 text-sky-500 dark:bg-sky-500/15 dark:text-sky-400",
    },
    {
      key: "carbs",
      label: "Carbohydrates",
      value: `${Math.round(t.carbohydrates)}`,
      unit: "g",
      chip: has("T2DM") ? "Low-GI" : "Balanced",
      chipClass: has("T2DM")
        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
        : "bg-muted text-muted-foreground",
      icon: Wheat,
      iconClass: "bg-yellow-100 text-yellow-600 dark:bg-yellow-500/15 dark:text-yellow-400",
    },
    {
      key: "fat",
      label: "Fat",
      value: `${Math.round(t.fat)}`,
      unit: "g",
      chip: has("CVD") ? "Heart-healthy" : "Balanced",
      chipClass: has("CVD")
        ? "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400"
        : "bg-muted text-muted-foreground",
      icon: Droplet,
      iconClass: "bg-amber-100 text-amber-500 dark:bg-amber-500/15 dark:text-amber-400",
    },
    {
      key: "fiber",
      label: "Fiber",
      value: `${Math.round(t.fiber)}`,
      unit: "g",
      chip: t.fiber >= 30 ? "High" : t.fiber >= 25 ? "Adequate" : "Low",
      chipClass: t.fiber >= 30
        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
        : "bg-muted text-muted-foreground",
      icon: Leaf,
      iconClass: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
    },
    {
      key: "sodium",
      label: "Sodium limit",
      value: sodium.toLocaleString("en-US"),
      unit: "mg",
      chip: sodium < 2000 ? "Reduced (for CKD, BP)" : "Standard cap",
      chipClass: sodium < 2000
        ? "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400"
        : "bg-muted text-muted-foreground",
      icon: FlaskConical,
      iconClass: "bg-slate-100 text-slate-500 dark:bg-slate-500/15 dark:text-slate-400",
    },
    {
      key: "water",
      label: "Water intake",
      value: "2.0",
      unit: "L",
      chip: "Stay hydrated",
      chipClass: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-400",
      icon: Droplets,
      iconClass: "bg-sky-100 text-sky-500 dark:bg-sky-500/15 dark:text-sky-400",
    },
  ];
}

export function TargetsCard({ data, loading }: { data: ProfileResponse | null; loading: boolean }) {
  const rows = data ? deriveChips(data) : [];
  const conditions = data?.profile.healthConditions ?? [];

  return (
    <section
      aria-label="Computed daily targets"
      className="rounded-3xl border border-border/60 bg-card p-5 shadow-sm shadow-black/[0.03]"
    >
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold tracking-tight">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden>
              <Target className="h-4 w-4" />
            </span>
            Computed Daily Targets
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">Customized for your profile and health conditions.</p>
        </div>
        {data && data.targetNotes.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                aria-label="How these targets are computed"
              >
                <Info className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80">
              <p className="text-xs font-bold">How your targets are computed</p>
              <ul className="mt-2 space-y-1.5">
                {data.targetNotes.map((n, i) => (
                  <li key={i} className="flex gap-2 text-[11px] leading-relaxed text-muted-foreground">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" aria-hidden />
                    {n}
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
        )}
      </header>

      <ul className="mt-4 space-y-1.5">
        {loading || !data
          ? [0, 1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-12 rounded-2xl" />)
          : rows.map(({ key, label, value, unit, chip, chipClass, icon: Icon, iconClass }) => (
              <li
                key={key}
                className="flex items-center gap-2.5 rounded-2xl border border-transparent px-2 py-2 transition-colors hover:border-border/60 hover:bg-muted/30"
              >
                <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", iconClass)} aria-hidden>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1 text-[13px] font-semibold">{label}</span>
                <span className="shrink-0 text-[13px] font-extrabold tabular-nums">
                  {value} <span className="text-[11px] font-semibold text-muted-foreground">{unit}</span>
                </span>
                {chip && (
                  <span className={cn("hidden max-w-[8rem] shrink-0 items-center justify-center whitespace-normal rounded-full px-2.5 py-1 text-center text-[9px] font-bold leading-[1.15] sm:flex", chipClass)}>
                    {chip}
                  </span>
                )}
              </li>
            ))}
      </ul>

      <div className="mt-3 flex items-start gap-2.5 rounded-2xl border border-emerald-200/60 bg-emerald-50/60 px-3.5 py-3 dark:border-emerald-500/25 dark:bg-emerald-500/10">
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
        <p className="text-[11px] font-medium leading-relaxed text-emerald-800 dark:text-emerald-300">
          These targets are deterministically computed based on ICMR, ADA, KDIGO and AHA
          guidelines{conditions.length > 0 ? ` — tuned for ${conditions.join(", ")}` : ""}.
        </p>
      </div>
    </section>
  );
}
