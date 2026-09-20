"use client";

/**
 * Coach structured-card renderers — shared between the chat stream and the
 * day-plan timeline. Every number rendered here came from the deterministic
 * backend; the cards NEVER parse numbers out of AI prose.
 */
import { useState } from "react";
import {
  BadgeCheck,
  Check,
  ChevronDown,
  Clock,
  Droplets,
  Flame,
  Lightbulb,
  ListChecks,
  Plus,
  RefreshCw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CoachCard, CoachNutrition } from "@/lib/client/types";

export const SLOT_LABEL: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  snack: "Snack",
  dinner: "Dinner",
};

export function NutritionChips({ n, compact = false }: { n: CoachNutrition; compact?: boolean }) {
  const chips = [
    { label: "kcal", value: String(Math.round(n.calories)), icon: Flame },
    { label: "protein", value: `${Math.round(n.protein)}g`, icon: null },
    { label: "carbs", value: `${Math.round(n.carbohydrates)}g`, icon: null },
    { label: "fat", value: `${Math.round(n.fat)}g`, icon: null },
    ...(compact ? [] : [{ label: "fiber", value: `${Math.round(n.fiber)}g`, icon: null }]),
  ];
  return (
    <div className="flex flex-wrap gap-1.5" aria-label={`Estimated nutrition: ${chips.map((c) => `${c.value} ${c.label}`).join(", ")}`}>
      {chips.map((c) => (
        <span
          key={c.label}
          className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-primary"
        >
          {c.icon ? <c.icon className="h-3 w-3" aria-hidden /> : null}
          {c.value} {c.label}
        </span>
      ))}
    </div>
  );
}

export function EvidenceList({ items }: { items: { source: string; document: string; section: string; text: string }[] }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <div className="rounded-2xl border border-border/60 bg-muted/30 p-3">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] font-semibold text-foreground/80">
          <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
          Evidence
          {items.slice(0, 3).map((e, i) => (
            <Badge key={i} variant="outline" className="px-1.5 py-0 text-[9px] font-normal text-muted-foreground">
              {e.source}
            </Badge>
          ))}
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div className="mt-2 space-y-2" aria-label="Why am I seeing this evidence">
          {items.map((e, i) => (
            <div key={i} className="rounded-xl border border-border/50 bg-background/70 p-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-primary">
                {e.source}
                {e.document ? ` · ${e.document}` : ""}
                {e.section ? ` — ${e.section}` : ""}
              </p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">{e.text}</p>
            </div>
          ))}
          <p className="text-[10px] italic text-muted-foreground/70">
            Why am I seeing this? Guidance excerpts linked to your question, profile conditions and today&apos;s gaps.
          </p>
        </div>
      )}
    </div>
  );
}

function WhyList({ why }: { why: string[] }) {
  if (why.length === 0) return null;
  return (
    <ul className="space-y-1">
      {why.slice(0, 4).map((w, i) => (
        <li key={i} className="flex items-start gap-1.5 text-[11.5px] leading-snug text-muted-foreground">
          <Lightbulb className="mt-0.5 h-3 w-3 shrink-0 text-primary/80" aria-hidden />
          <span>{w}</span>
        </li>
      ))}
    </ul>
  );
}

export interface RecCardActions {
  onLog?: (card: Extract<CoachCard, { kind: "recommendation" }>) => void;
  onSwap?: (card: Extract<CoachCard, { kind: "recommendation" }>) => void;
  onRegenerate?: () => void;
  logging?: boolean;
  swapping?: boolean;
  regenerating?: boolean;
  loggedSlot?: boolean;
}

export function RecommendationCard({
  card,
  actions,
}: {
  card: Extract<CoachCard, { kind: "recommendation" }>;
  actions?: RecCardActions;
}) {
  return (
    <div className="depth-hover rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-background to-teal-500/5 p-3.5 dark:from-primary/10 dark:to-teal-500/10">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-primary/80">
            {SLOT_LABEL[card.slot] ?? card.slot} · suggested
          </p>
          <p className="mt-0.5 truncate text-sm font-bold tracking-tight">{card.name}</p>
        </div>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-sm shadow-emerald-600/25" aria-hidden>
          <Sparkles className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-2">
        <NutritionChips n={card.nutrition} />
      </div>
      <div className="mt-2.5">
        <WhyList why={card.why} />
      </div>
      {actions && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            className="h-8 gap-1.5 rounded-xl px-3 text-xs font-semibold"
            disabled={actions.logging || actions.loggedSlot}
            onClick={() => actions.onLog?.(card)}
          >
            {actions.loggedSlot ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Plus className="h-3.5 w-3.5" aria-hidden />}
            {actions.loggedSlot ? "Logged" : actions.logging ? "Logging…" : "Log this meal"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 rounded-xl px-3 text-xs font-semibold"
            disabled={actions.swapping}
            onClick={() => actions.onSwap?.(card)}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", actions.swapping && "animate-spin")} aria-hidden />
            {actions.swapping ? "Swapping…" : "Swap"}
          </Button>
        </div>
      )}
    </div>
  );
}

export function PlanCard({
  card,
  actions,
}: {
  card: Extract<CoachCard, { kind: "plan" }>;
  actions?: RecCardActions;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/60 p-3">
      <p className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        <ListChecks className="h-3.5 w-3.5 text-primary" aria-hidden />
        {card.scope === "rest" ? "Rest of today" : "Full-day plan"} · projected {card.projected.calories} kcal / {card.projected.protein}g protein
      </p>
      <ol className="mt-2 space-y-2">
        {card.slots.map((s) => (
          <li key={`${card.scope}-${s.slot}`} className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-6 w-14 shrink-0 items-center justify-center rounded-lg bg-muted text-[10px] font-bold tabular-nums text-muted-foreground" aria-hidden>
              {s.time || "--:--"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
                {SLOT_LABEL[s.slot] ?? s.slot}
                {s.status === "logged" && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                    <Check className="h-2.5 w-2.5" aria-hidden /> Logged
                  </span>
                )}
                {s.status === "recommended" && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                    <Clock className="h-2.5 w-2.5" aria-hidden /> Recommended
                  </span>
                )}
                {s.status === "skipped" && (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">window passed</span>
                )}
                {typeof s.kcal === "number" && <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">{s.kcal} kcal</span>}
              </p>
              {s.name && <p className="mt-0.5 text-[11.5px] text-muted-foreground">{s.name}</p>}
              {s.status === "recommended" && s.nutrition && (
                <div className="mt-1.5">
                  <NutritionChips n={s.nutrition} compact />
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-2.5 text-[10.5px] italic leading-snug text-muted-foreground/80">{card.summary}</p>
      {actions?.onRegenerate && (
        <div className="mt-2.5 flex gap-2">
          <Button size="sm" variant="outline" className="h-7 gap-1 rounded-lg px-2.5 text-[11px]" onClick={actions.onRegenerate} disabled={actions.regenerating}>
            <RefreshCw className={cn("h-3 w-3", actions.regenerating && "animate-spin")} aria-hidden />
            Regenerate plan
          </Button>
        </div>
      )}
    </div>
  );
}

export function GapsCard({ card }: { card: Extract<CoachCard, { kind: "gaps" }> }) {
  return (
    <div className="rounded-2xl border border-amber-300/50 bg-amber-50/60 p-3 dark:border-amber-500/25 dark:bg-amber-500/10">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
        <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
        Nutrition gaps vs your targets
      </p>
      <ul className="mt-2 space-y-1.5">
        {card.items.map((g, i) => (
          <li key={i} className="text-[11.5px] leading-snug">
            <span className="font-bold text-foreground/85">{g.label}</span>{" "}
            <span className="text-muted-foreground">{g.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ProgressCard({ card }: { card: Extract<CoachCard, { kind: "progress" }> }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/60 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Today&apos;s progress</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {card.items.map((i) => (
          <div key={i.label}>
            <div className="flex items-center justify-between text-[11px] font-semibold">
              <span>{i.label}</span>
              <span className="tabular-nums text-muted-foreground">{i.pct}%</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" role="presentation">
              <div
                className={cn("h-full rounded-full transition-all", i.pct >= 100 ? "bg-emerald-500" : i.pct >= 70 ? "bg-primary" : "bg-amber-500")}
                style={{ width: `${Math.min(100, i.pct)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2.5 grid gap-1.5 text-[11px] leading-snug sm:grid-cols-2">
        <div className="rounded-xl bg-emerald-500/10 p-2">
          <p className="font-bold text-emerald-700 dark:text-emerald-300">What went well</p>
          <ul className="mt-1 space-y-0.5 text-muted-foreground">
            {card.well.map((w, i) => (
              <li key={i}>· {w}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl bg-primary/10 p-2">
          <p className="font-bold text-primary">What to focus on</p>
          <ul className="mt-1 space-y-0.5 text-muted-foreground">
            {card.focus.map((f, i) => (
              <li key={i}>· {f}</li>
            ))}
          </ul>
        </div>
      </div>
      <p className="mt-2 rounded-xl bg-muted/60 px-2.5 py-1.5 text-[11px] font-semibold text-foreground/80">
        Next step: {card.next}
      </p>
    </div>
  );
}

export function HistoryCard({ card }: { card: Extract<CoachCard, { kind: "history" }> }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/60 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{card.title}</p>
      <div className="mt-2 space-y-2.5">
        {card.groups.map((g, gi) => (
          <div key={gi}>
            <p className="text-[11px] font-bold text-foreground/80">{g.label}</p>
            {g.lines.length === 0 ? (
              <p className="text-[11px] italic text-muted-foreground/70">Not logged</p>
            ) : (
              <ul className="mt-0.5 space-y-0.5">
                {g.lines.map((l, li) => (
                  <li key={li} className="flex items-baseline justify-between gap-2 text-[11.5px]">
                    <span className="min-w-0 truncate text-muted-foreground">{l.name}</span>
                    <span className="shrink-0 tabular-nums text-[10.5px] text-muted-foreground/80">
                      {l.kcal} kcal · {l.time}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
      {card.totals && card.totals.length > 0 && (
        <div className="mt-2.5 grid grid-cols-2 gap-1.5 border-t border-border/50 pt-2.5 sm:grid-cols-3">
          {card.totals.map((t, i) => (
            <div key={i} className="rounded-lg bg-muted/50 px-2 py-1">
              <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{t.label}</p>
              <p className="text-[11px] font-semibold tabular-nums">{t.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function WaterCard({ card }: { card: Extract<CoachCard, { kind: "water" }> }) {
  return (
    <div className="rounded-2xl border border-sky-300/50 bg-sky-50/60 p-3 dark:border-sky-400/25 dark:bg-sky-500/10">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">
        <Droplets className="h-3.5 w-3.5" aria-hidden />
        Hydration
      </p>
      <div className="mt-2 flex items-center gap-1.5" aria-label={`${card.glasses} of ${card.target} glasses`}>
        {Array.from({ length: card.target }).map((_, i) => (
          <span
            key={i}
            className={cn("h-4 w-3 rounded-full border", i < card.glasses ? "border-sky-500 bg-sky-500" : "border-sky-300/60 bg-transparent dark:border-sky-400/30")}
            aria-hidden
          />
        ))}
        <span className="ml-1 text-[11px] font-bold tabular-nums text-sky-700 dark:text-sky-300">
          {card.glasses}/{card.target}
        </span>
      </div>
    </div>
  );
}

export function CoachCardRenderer({ card, actions }: { card: CoachCard; actions?: RecCardActions }) {
  switch (card.kind) {
    case "recommendation":
      return <RecommendationCard card={card} actions={actions} />;
    case "plan":
      return <PlanCard card={card} />;
    case "gaps":
      return <GapsCard card={card} />;
    case "progress":
      return <ProgressCard card={card} />;
    case "history":
      return <HistoryCard card={card} />;
    case "water":
      return <WaterCard card={card} />;
    case "evidence":
      return <EvidenceList items={card.items} />;
    default:
      return null;
  }
}

export function EngineSourceBadge({ source }: { source: "ai" | "deterministic_fallback" }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "px-1.5 py-0 text-[9px] font-bold uppercase tracking-wide",
        source === "ai" ? "border-primary/40 bg-primary/10 text-primary" : "border-muted-foreground/40 bg-muted text-muted-foreground",
      )}
    >
      {source === "ai" ? "AI reasoned" : "rule-based"}
    </Badge>
  );
}
