"use client";

/**
 * Shared presentational pieces: compliance alerts, macro progress, calorie ring.
 * All numbers rendered via format helpers — never raw floats.
 */
import { AlertTriangle, BadgeCheck, CircleHelp, BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatGrams, formatKcal, formatMg, formatNumber, pct } from "@/lib/client/format";
import type { Compliance, ComplianceState, DailySummaryResponse, NutritionValues } from "@/lib/client/types";
import { cn } from "@/lib/utils";

const COMPLIANCE_UI: Record<ComplianceState, { label: string; className: string; icon: React.ReactNode }> = {
  COMPLIANT: {
    label: "Within your plan",
    className: "bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 border-emerald-600/30",
    icon: <BadgeCheck className="h-3.5 w-3.5" aria-hidden />,
  },
  POTENTIALLY_NON_COMPLIANT: {
    label: "Needs attention",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
    icon: <AlertTriangle className="h-3.5 w-3.5" aria-hidden />,
  },
  INDETERMINATE: {
    label: "Cannot fully verify",
    className: "bg-muted text-muted-foreground border-border",
    icon: <CircleHelp className="h-3.5 w-3.5" aria-hidden />,
  },
};

export function ComplianceBadge({ state, className }: { state: ComplianceState; className?: string }) {
  const ui = COMPLIANCE_UI[state];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        ui.className,
        className
      )}
    >
      {ui.icon}
      {ui.label}
    </span>
  );
}

export function ComplianceAlerts({ compliance, conditions }: { compliance: Compliance; conditions: string[] }) {
  if (compliance.violations.length === 0) return null;
  return (
    <div className="space-y-2" role="alert">
      {compliance.violations.map((v, i) => (
        <div
          key={`${v.condition}-${v.nutrient}-${i}`}
          className={cn(
            "rounded-lg border p-3 text-sm",
            v.severity === "danger"
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
          )}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="bg-background/60 font-mono text-[10px]">
              {v.condition}
            </Badge>
            <span className="font-semibold">{v.nutrient}</span>
            <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <BookOpen className="h-3 w-3" aria-hidden />
              {v.evidenceSource}
            </span>
          </div>
          <p className="mt-1 leading-snug">{v.message}</p>
        </div>
      ))}
      {conditions.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Checked against your conditions: {conditions.join(", ")} — configurable in your profile.
        </p>
      )}
    </div>
  );
}

const BAR_TONE: Record<string, string> = {
  calories: "bg-orange-500",
  protein: "bg-emerald-600",
  carbohydrates: "bg-amber-500",
  fat: "bg-rose-500",
  fiber: "bg-lime-600",
  sugar: "bg-pink-500",
  sodium: "bg-red-500",
  potassium: "bg-teal-600",
  phosphorus: "bg-violet-500",
  cholesterol: "bg-yellow-600",
  saturatedFat: "bg-red-400",
};

function formatByKey(key: keyof NutritionValues, value: number): string {
  if (key === "calories") return formatKcal(value);
  if (key === "sodium" || key === "potassium" || key === "phosphorus" || key === "cholesterol") return formatMg(value);
  return formatGrams(value);
}

export function NutrientBar({
  label,
  nutrient,
  consumed,
  target,
}: {
  label: string;
  nutrient: keyof NutritionValues;
  consumed: number;
  target: number;
}) {
  const percent = pct(consumed, target);
  const over = target > 0 && consumed > target;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-foreground/90">{label}</span>
        <span className={cn("tabular-nums", over ? "font-semibold text-destructive" : "text-muted-foreground")}>
          {formatByKey(nutrient, consumed)} / {formatByKey(nutrient, target)}
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label} progress`}
      >
        <div
          className={cn("h-full rounded-full transition-all duration-500", over ? "bg-destructive" : BAR_TONE[nutrient] ?? "bg-primary")}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function CalorieRing({ consumed, target }: { consumed: number; target: number }) {
  const percent = pct(consumed, target);
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const dash = (percent / 100) * circumference;
  const over = target > 0 && consumed > target;
  return (
    <div className="relative h-32 w-32 shrink-0" role="img" aria-label={`${formatNumber(consumed)} of ${formatNumber(target)} kilocalories consumed`}>
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={radius} fill="none" strokeWidth="10" className="stroke-muted" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          className={over ? "stroke-destructive" : "stroke-primary"}
          strokeDasharray={`${dash} ${circumference - dash}`}
          style={{ transition: "stroke-dasharray 600ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums">{formatNumber(consumed)}</span>
        <span className="text-[11px] text-muted-foreground">of {formatNumber(target)} kcal</span>
        <span className={cn("mt-0.5 text-xs font-semibold", over ? "text-destructive" : "text-primary")}>{percent}%</span>
      </div>
    </div>
  );
}

export function SummarySection({ summary }: { summary: DailySummaryResponse }) {
  const s = summary;
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Today at a glance</CardTitle>
          <ComplianceBadge state={s.compliance.state} />
        </div>
        <p className="text-xs text-muted-foreground">
          {s.date} · current slot: <span className="font-medium capitalize">{s.mealSlot}</span>
          {s.healthConditions.length > 0 && <> · managing {s.healthConditions.join(", ")}</>}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <CalorieRing consumed={s.consumed.calories} target={s.targets.calories} />
          <div className="grid w-full flex-1 gap-3 sm:grid-cols-2">
            <NutrientBar label="Protein" nutrient="protein" consumed={s.consumed.protein} target={s.targets.protein} />
            <NutrientBar label="Carbs" nutrient="carbohydrates" consumed={s.consumed.carbohydrates} target={s.targets.carbohydrates} />
            <NutrientBar label="Fat" nutrient="fat" consumed={s.consumed.fat} target={s.targets.fat} />
            <NutrientBar label="Fiber" nutrient="fiber" consumed={s.consumed.fiber} target={s.targets.fiber} />
            <NutrientBar label="Sugar" nutrient="sugar" consumed={s.consumed.sugar} target={s.targets.sugar} />
            <NutrientBar label="Sodium" nutrient="sodium" consumed={s.consumed.sodium} target={s.targets.sodium} />
          </div>
        </div>
        <ComplianceAlerts compliance={s.compliance} conditions={s.healthConditions} />
      </CardContent>
    </Card>
  );
}
