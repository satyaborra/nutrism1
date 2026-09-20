"use client";

/**
 * Meals right rail — Log a Meal promo, Quick Add tiles (water actually logs a
 * glass), Today's Nutrients donuts from the daily summary, and the brand quote.
 */
import { ArrowRight, Camera, Cookie, Droplet, Plus, Zap } from "lucide-react";
import { BarChart3 } from "lucide-react";
import { Apple } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { api } from "@/lib/client/api";
import type { DailySummaryResponse, InsightsResponse } from "@/lib/client/types";
import { useNutriStore } from "../store";
import { NutrientDonut } from "./nutrient-donut";

function LogAMealCard() {
  const setView = useNutriStore((s) => s.setView);
  const requestLogger = useNutriStore((s) => s.requestLogger);
  return (
    <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/15 via-primary/8 to-teal-500/10 p-5">
      <div aria-hidden className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-primary/15 blur-2xl" />
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/30" aria-hidden>
          <Camera className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-bold tracking-tight">Log a Meal</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Take a photo, describe, or choose from your recent meals.
          </p>
        </div>
      </div>
      <Button
        className="mt-4 h-11 w-full rounded-xl text-sm font-bold shadow-md shadow-primary/25 transition-all hover:shadow-lg hover:shadow-primary/30 active:scale-[0.98]"
        onClick={() => {
          requestLogger({ tab: "photo" });
          setView("log");
        }}
      >
        Log Food <ArrowRight className="ml-auto h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
      </Button>
    </div>
  );
}

function QuickAddCard({ water }: { water: { glasses: number; goal: number } | null }) {
  const setView = useNutriStore((s) => s.setView);
  const requestLogger = useNutriStore((s) => s.requestLogger);
  const bumpData = useNutriStore((s) => s.bumpData);
  const { toast } = useToast();

  async function addWater() {
    try {
      await api.hydrationUpdate({ delta: 1 });
      bumpData();
      toast({ title: "💧 Glass of water logged" });
    } catch {
      toast({ title: "Could not log water", variant: "destructive" });
    }
  }

  const tiles = [
    {
      label: "Water",
      sub: water ? `${water.glasses}/${water.goal}` : undefined,
      icon: Droplet,
      tile: "bg-sky-100 text-sky-500 dark:bg-sky-500/15 dark:text-sky-400",
      onClick: addWater,
    },
    {
      label: "Fruits",
      icon: Apple,
      tile: "bg-rose-100 text-rose-500 dark:bg-rose-500/15 dark:text-rose-400",
      onClick: () => {
        requestLogger({ tab: "text", text: "a bowl of fresh fruits" });
        setView("log");
      },
    },
    {
      label: "Snacks",
      icon: Cookie,
      tile: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400",
      onClick: () => {
        requestLogger({ tab: "text", text: "a handful of roasted almonds" });
        setView("log");
      },
    },
    {
      label: "Custom",
      icon: Plus,
      tile: "bg-muted text-muted-foreground",
      onClick: () => {
        requestLogger({ tab: "text" });
        setView("log");
      },
    },
  ];

  return (
    <Card className="rounded-3xl border-border/60 shadow-sm shadow-black/[0.03]">
      <CardContent className="p-4">
        <p className="flex items-center gap-2 text-sm font-bold tracking-tight">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400" aria-hidden>
            <Zap className="h-3.5 w-3.5" />
          </span>
          Quick Add
        </p>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {tiles.map(({ label, sub, icon: Icon, tile, onClick }) => (
            <button
              key={label}
              type="button"
              onClick={onClick}
              className="group flex flex-col items-center gap-1.5 rounded-2xl border border-transparent px-1 py-2.5 transition-all duration-150 hover:border-border hover:bg-muted/60 hover:shadow-sm active:scale-[0.95] focus-visible:outline-2 focus-visible:outline-ring"
            >
              <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110", tile)} aria-hidden>
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <span className="text-[10.5px] font-semibold leading-none">{label}</span>
              {sub && <span className="text-[9.5px] font-medium leading-none text-muted-foreground tabular-nums">{sub}</span>}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

const NUTRIENT_META = [
  { key: "protein", label: "Protein", color: "#10b981", track: "stroke-emerald-100 dark:stroke-emerald-500/15" },
  { key: "carbohydrates", label: "Carbs", color: "#3b82f6", track: "stroke-sky-100 dark:stroke-sky-500/15" },
  { key: "fat", label: "Fat", color: "#f97316", track: "stroke-orange-100 dark:stroke-orange-500/15" },
  { key: "fiber", label: "Fiber", color: "#8b5cf6", track: "stroke-violet-100 dark:stroke-violet-500/15" },
] as const;

function NutrientsCard({ summary }: { summary: DailySummaryResponse | null }) {
  const setView = useNutriStore((s) => s.setView);
  const consumed = summary?.consumed;
  const targets = summary?.targets;

  return (
    <Card className="rounded-3xl border-border/60 shadow-sm shadow-black/[0.03]">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-bold tracking-tight">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400" aria-hidden>
              <BarChart3 className="h-3.5 w-3.5" />
            </span>
            Today&apos;s Nutrients
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 rounded-lg px-2 text-xs font-semibold text-primary hover:bg-primary/10 hover:text-primary"
            onClick={() => setView("insights")}
          >
            Details <ArrowRight className="h-3 w-3" aria-hidden />
          </Button>
        </div>

        {!summary ? (
          <div className="mt-4 grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="mx-auto h-[118px] w-full rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3">
            {NUTRIENT_META.map(({ key, label, color, track }, i) => {
              const val = consumed?.[key] ?? 0;
              const tgt = targets?.[key] ?? 0;
              const pct = tgt > 0 ? (val / tgt) * 100 : 0;
              return (
                <div key={key} className="flex flex-col items-center rounded-2xl border border-border/50 bg-muted/30 px-2 py-3 transition-colors hover:bg-muted/50">
                  <div className="relative">
                    <NutrientDonut pct={pct} color={color} trackClass={track} id={`m-${key}-${i}`} />
                    <span className="absolute inset-0 flex items-center justify-center text-[13px] font-extrabold tabular-nums">
                      {Math.round(pct)}%
                    </span>
                  </div>
                  <p className="mt-2 text-xs font-bold">{label}</p>
                  <p className="text-[10.5px] font-medium tabular-nums text-muted-foreground">
                    {Math.round(val)} / {Math.round(tgt)} g
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QuoteCard() {
  const setView = useNutriStore((s) => s.setView);
  return (
    <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-emerald-600 to-teal-700 p-5 text-white shadow-md shadow-emerald-700/20 dark:border-primary/25">
      <img
        src="/images/hero-leaves.png"
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-25 [mask-image:linear-gradient(to_right,transparent,black_70%)]"
      />
      <p className="font-script relative text-[1.5rem] font-semibold leading-[1.2]">
        Healthy meals today,
        <br />
        a brighter tomorrow.
      </p>
      <div className="relative mt-2 flex items-center justify-between">
        <p className="text-xs font-medium text-white/80">— NutriSLM</p>
        <button
          type="button"
          onClick={() => setView("insights")}
          aria-label="Open nutrition insights"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 ring-1 ring-white/40 backdrop-blur transition-all hover:bg-white/30 hover:ring-white/60 active:scale-95 focus-visible:outline-2 focus-visible:outline-white"
        >
          <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

export function MealsRail({
  summary,
  insights,
}: {
  summary: DailySummaryResponse | null;
  insights: InsightsResponse | null;
}) {
  const water = insights ? { glasses: insights.kpis.water.glasses, goal: insights.kpis.water.goal } : null;
  return (
    <aside aria-label="Meals shortcuts" className="flex w-full flex-col gap-4">
      <LogAMealCard />
      <QuickAddCard water={water} />
      <NutrientsCard summary={summary} />
      <QuoteCard />
    </aside>
  );
}
