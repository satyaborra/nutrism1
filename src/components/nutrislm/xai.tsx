"use client";

/**
 * Shared Explainable-AI (XAI) UI primitives.
 *
 * Design contract: explanations are composed from deterministic pipeline data
 * (AI perception confidence, portion conversions, verified database sources) —
 * the UI presents them honestly, it never invents reasoning.
 */

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  Calculator,
  ChevronDown,
  CircleAlert,
  Database,
  Scale,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import type { Contribution, LineExplanation, TotalsExplanation } from "@/lib/client/types";

// ---------------------------------------------------------------- confidence

const CONFIDENCE_TIERS = [
  { min: 0.8, cls: "border-emerald-600/40 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400", label: "high" },
  { min: 0.5, cls: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400", label: "medium" },
  { min: 0, cls: "border-destructive/40 bg-destructive/10 text-destructive", label: "low" },
] as const;

function tierOf(confidence: number) {
  return CONFIDENCE_TIERS.find((t) => confidence >= t.min) ?? CONFIDENCE_TIERS[CONFIDENCE_TIERS.length - 1];
}

const QTY_SOURCE_UI: Record<string, { label: string; hint: string }> = {
  user: { label: "You said", hint: "Quantity exactly as you specified" },
  estimated: { label: "AI estimated", hint: "AI inferred the portion from your description — verify it" },
  unknown: { label: "Quantity unclear", hint: "AI could not determine the portion — please set it" },
};

/**
 * Color-coded AI-confidence badge. Hides entirely for user-entered lines
 * (confidence === null) so manual entries stay uncluttered.
 */
export function ConfidenceBadge({
  confidence,
  quantitySource,
  className,
}: {
  confidence: number | null | undefined;
  quantitySource?: string | null;
  className?: string;
}) {
  const qty = quantitySource != null ? QTY_SOURCE_UI[quantitySource] : undefined;
  if (confidence == null && (qty == null || qty.label === "You said")) return null;

  const showConf = confidence != null;
  const tier = showConf ? tierOf(confidence) : null;

  return (
    <Badge
      variant="outline"
      title={
        showConf
          ? `AI recognized this with ${Math.round((confidence as number) * 100)}% confidence${qty ? ` · ${qty.hint}` : ""}`
          : qty?.hint
      }
      className={cn("text-[10px] font-medium", tier?.cls, className)}
    >
      {showConf && (
        <>
          <Sparkles aria-hidden className="mr-1 h-2.5 w-2.5" />
          AI {Math.round((confidence as number) * 100)}%
        </>
      )}
      {!showConf && qty?.label}
      {showConf && qty && qty.label !== "You said" && <span className="ml-1 opacity-80">· {qty.label}</span>}
    </Badge>
  );
}

// ------------------------------------------------------------ explain panel

const FACTOR_ICONS = [Calculator, Database, UserRound, Sparkles, ShieldCheck];

/** Collapsible "Why this number?" panel — per food line. */
export function ExplainPanel({ explain, className }: { explain: LineExplanation; className?: string }) {
  const [open, setOpen] = useState(false);
  const unmatched = explain.dataQuality === "unmatched";

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={className}>
      <CollapsibleTrigger
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors",
          unmatched
            ? "text-destructive hover:bg-destructive/10"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        {unmatched ? <CircleAlert aria-hidden className="h-3 w-3" /> : <ShieldCheck aria-hidden className="h-3 w-3" />}
        {unmatched ? "Why 0 nutrition?" : "Why this number?"}
        <ChevronDown aria-hidden className={cn("h-3 w-3 transition-transform duration-200", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1.5 rounded-lg border bg-muted/40 p-2.5">
          <p className="text-xs font-medium leading-relaxed">{explain.summary}</p>
          <ul className="mt-1.5 space-y-1">
            {explain.factors.map((f, i) => {
              const Icon = FACTOR_ICONS[i % FACTOR_ICONS.length];
              return (
                <li key={i} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  <Icon aria-hidden className="mt-0.5 h-3 w-3 shrink-0 opacity-70" />
                  <span>{f}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// --------------------------------------------------------- contribution list

/** Per-food calorie contribution bars — sorted by kcal, shows % of meal. */
export function ContributionList({ contributors }: { contributors: Contribution[] }) {
  if (contributors.length === 0) return null;
  return (
    <ul className="space-y-1">
      {contributors.map((c) => (
        <li key={c.name} className="flex items-center gap-2">
          <span className="w-28 min-w-0 shrink-0 truncate text-[11px] font-medium sm:w-36" title={c.name}>
            {c.name}
          </span>
          <span className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-primary/70 transition-all duration-500"
              style={{ width: `${Math.max(2, Math.min(100, c.pct))}%` }}
            />
          </span>
          <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">{c.pct}%</span>
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------ totals explain

/**
 * "How were these totals calculated?" — meal-level explanation:
 * plain-language summary, contribution bars, and method bullets.
 */
export function TotalsExplain({
  explanation,
  className,
  defaultOpen = false,
}: {
  explanation: TotalsExplanation;
  className?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn("rounded-lg border border-primary/15 bg-primary/[0.04] p-2.5", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-1.5 text-left"
      >
        <ShieldCheck aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold">How were these totals calculated?</span>
          <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">{explanation.summary}</span>
        </span>
        <ChevronDown aria-hidden className={cn("mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-2 space-y-2 border-t border-primary/10 pt-2">
          {explanation.contributors.length > 0 && <ContributionList contributors={explanation.contributors} />}
          <ul className="space-y-1">
            {explanation.factors.map((f, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                <Database aria-hidden className="mt-0.5 h-3 w-3 shrink-0 opacity-60" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------ target explain

/**
 * "How is this target calculated?" — explains the daily-target formula
 * (Mifflin-St Jeor BMR × activity × goal, ICMR-NIN protein, NIN fiber).
 * Deterministic and profile-driven; nothing here is AI-generated.
 */
export function TargetExplainer({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("rounded-lg border border-dashed border-border/70 bg-muted/30 px-2.5 py-2", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 text-left text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <Scale aria-hidden className="h-3 w-3 shrink-0" />
        How is this target calculated?
        <ChevronDown aria-hidden className={cn("ml-auto h-3 w-3 transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="mt-1.5 space-y-1 border-t border-border/60 pt-1.5">
          {[
            "Calories: Mifflin-St Jeor BMR (age, sex, height, weight) × your activity factor, then adjusted for your goal.",
            "Protein: ICMR-NIN recommended intake scaled to your body weight.",
            "Fiber: NIN adult guideline (per-2000-kcal basis).",
            "Targets update automatically whenever your profile or goal changes — no AI guessing involved.",
          ].map((f, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <Calculator aria-hidden className="mt-0.5 h-3 w-3 shrink-0 opacity-60" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------ provenance row

/** Compact provenance footer for saved meals: sources + estimated-portion flags. */
export function ProvenanceLine({
  foods,
  className,
}: {
  foods: { name?: string; confidence?: number | null; quantitySource?: string; source?: string | null }[];
  className?: string;
}) {
  if (foods.length === 0) return null;
  const sources = [...new Set(foods.map((f) => f.source).filter(Boolean))] as string[];
  const estimatedCount = foods.filter((f) => f.quantitySource === "estimated").length;
  const lowConfCount = foods.filter((f) => f.confidence != null && (f.confidence as number) < 0.5).length;
  const unmatchedCount = foods.filter((f) => f.source == null).length;

  const bits: string[] = [];
  if (sources.length > 0) bits.push(`Verified data: ${sources.join(", ")}`);
  if (estimatedCount > 0) bits.push(`${estimatedCount} AI-estimated portion${estimatedCount === 1 ? "" : "s"}`);
  if (lowConfCount > 0) bits.push(`${lowConfCount} low-confidence item${lowConfCount === 1 ? "" : "s"}`);
  if (unmatchedCount > 0) bits.push(`${unmatchedCount} unmapped item${unmatchedCount === 1 ? "" : "s"} (0 nutrition)`);

  if (bits.length === 0) return null;

  return (
    <p className={cn("flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-muted-foreground", className)}>
      <ShieldCheck aria-hidden className="h-3 w-3 shrink-0 opacity-60" />
      {bits.map((b, i) => (
        <span key={i} className={cn((b.includes("AI-estimated") || b.includes("low-confidence")) && "text-amber-600 dark:text-amber-400")}>
          {i > 0 && <span className="mr-2 opacity-50">·</span>}
          {b}
        </span>
      ))}
    </p>
  );
}
