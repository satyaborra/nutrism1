"use client";

/**
 * Condition constraints — the engine-backed hard limits per condition, with
 * the actual seeded thresholds surfaced as chips (T2DM/CKD/CVD are the exact
 * rules the DiseaseConstraint table enforces before anything is ranked).
 */
import { ChevronRight, Droplet, Filter, Heart, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useNutriStore } from "../store";

interface ConditionMeta {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  badgeClass: string;
  rules: string[];
}

/** Mirrors scripts/seed.ts DiseaseConstraint rows (per-meal limits). */
const CONDITION_META: Record<string, ConditionMeta> = {
  T2DM: {
    label: "Type 2 Diabetes",
    icon: Droplet,
    iconClass: "bg-red-100 text-red-500 dark:bg-red-500/15 dark:text-red-400",
    badgeClass: "border-red-500/30 bg-red-500/[0.07] text-red-600 dark:text-red-400",
    rules: ["Carbs ≤ 75 g / meal", "Added sugar ≤ 12 g / meal", "Fiber ≥ 5 g / meal"],
  },
  CKD: {
    label: "Chronic Kidney Disease",
    icon: Filter,
    iconClass: "bg-rose-100 text-rose-500 dark:bg-rose-500/15 dark:text-rose-400",
    badgeClass: "border-rose-500/30 bg-rose-500/[0.07] text-rose-600 dark:text-rose-400",
    rules: ["Sodium ≤ 500 mg / meal", "Potassium ≤ 1,200 mg / meal", "Phosphorus ≤ 450 mg / meal", "Protein ≤ 30 g / meal"],
  },
  CVD: {
    label: "Cardiovascular Disease",
    icon: Heart,
    iconClass: "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400",
    badgeClass: "border-red-500/30 bg-red-500/[0.07] text-red-600 dark:text-red-400",
    rules: ["Sodium ≤ 600 mg / meal", "Saturated fat ≤ 5 g / meal", "Cholesterol ≤ 100 mg / meal"],
  },
};

export function ConstraintsCard() {
  const profileBrief = useNutriStore((s) => s.profileBrief);
  const setView = useNutriStore((s) => s.setView);
  const conditions = profileBrief?.healthConditions ?? [];

  return (
    <section
      aria-label="Condition constraints"
      className="flex flex-col rounded-3xl border border-border/60 bg-card p-5 shadow-sm shadow-black/[0.03]"
    >
      <header>
        <h2 className="flex items-center gap-2 text-base font-bold tracking-tight">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary"
            aria-hidden
          >
            <ShieldCheck className="h-4 w-4" />
          </span>
          Condition constraints
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          Hard nutrient limits enforced before anything is ranked.
        </p>
      </header>

      {conditions.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {conditions.map((code) => {
            const meta = CONDITION_META[code];
            const Icon = meta?.icon ?? ShieldCheck;
            return (
              <li key={code} className="rounded-2xl border border-border/50 bg-background/60 px-3.5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", meta?.iconClass)} aria-hidden>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span
                    className={cn(
                      "rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wide",
                      meta?.badgeClass ?? "border-border bg-muted text-muted-foreground",
                    )}
                  >
                    {code}
                  </span>
                  <span className="text-[13px] font-semibold leading-tight">{meta?.label ?? "Custom condition"}</span>
                </div>
                {meta && (
                  <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={`${meta.label} active limits`}>
                    {meta.rules.map((rule) => (
                      <li
                        key={rule}
                        className="rounded-full bg-muted/80 px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground dark:bg-muted/50"
                      >
                        {rule}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-4 flex-1 rounded-2xl border border-dashed border-border/70 px-3.5 py-5 text-center">
          <p className="text-[13px] font-medium text-muted-foreground">No conditions configured.</p>
          <p className="mt-1 text-[11px] text-muted-foreground/80">
            Add T2DM, CKD or CVD in your Health Profile to activate guardrails.
          </p>
        </div>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-3">
        <p className="text-[10.5px] leading-snug text-muted-foreground/80">
          Warnings flag meals; hard breaches exclude candidates outright.
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="-mr-2 h-8 shrink-0 gap-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setView("profile")}
        >
          Manage
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>
    </section>
  );
}
