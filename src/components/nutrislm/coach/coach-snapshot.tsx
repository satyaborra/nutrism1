"use client";

/**
 * DailyNutritionSnapshot — left rail of the Coach screen. TODAY numbers,
 * hydration glasses, week chips. All values verified server-side.
 */
import { Flame, GlassWater, Salad, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CoachContextResponse } from "@/lib/client/types";

function NutrientRow({
  label,
  consumed,
  target,
  unit,
}: {
  label: string;
  consumed: number;
  target: number;
  unit: string;
}) {
  const pct = target > 0 ? Math.min(100, Math.round((consumed / target) * 100)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-bold text-foreground/80">{label}</span>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          <span className="font-bold text-foreground">{Math.round(consumed).toLocaleString()}</span> / {Math.round(target).toLocaleString()} {unit}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" role="presentation">
        <div
          className={cn("h-full rounded-full transition-all", pct >= 100 ? "bg-emerald-500" : pct >= 65 ? "bg-primary" : "bg-amber-500")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function CoachSnapshot({ ctx }: { ctx: CoachContextResponse }) {
  const n = ctx.nutrition;
  return (
    <section
      aria-label="Today's nutrition snapshot"
      className="flex w-full min-w-0 flex-col gap-4 rounded-3xl border border-border/60 bg-card p-5 shadow-sm shadow-black/[0.03]"
    >
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
          <Salad className="h-4 w-4 text-primary" aria-hidden />
          Today
        </h2>
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold text-primary">
          {ctx.mealsLogged} meal{ctx.mealsLogged === 1 ? "" : "s"} logged
        </span>
      </div>

      <div className="rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-teal-500/10 p-3.5">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary/80">Calories</p>
            <p className="mt-0.5 text-2xl font-extrabold tabular-nums leading-none tracking-tight">
              {Math.round(n.calories.consumed).toLocaleString()}
              <span className="text-sm font-semibold text-muted-foreground"> / {Math.round(n.calories.target).toLocaleString()}</span>
            </p>
          </div>
          <span className="text-[11px] font-bold tabular-nums text-primary">{n.calories.pct}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-background/70">
          <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600" style={{ width: `${Math.min(100, n.calories.pct)}%` }} />
        </div>
        <p className="mt-1.5 text-[10.5px] font-medium text-muted-foreground">
          {Math.round(n.calories.remaining).toLocaleString()} kcal remaining · slot: {ctx.mealSlot}
        </p>
      </div>

      <div className="grid gap-3">
        <NutrientRow label="Protein" consumed={n.protein.consumed} target={n.protein.target} unit="g" />
        <NutrientRow label="Carbohydrates" consumed={n.carbohydrates.consumed} target={n.carbohydrates.target} unit="g" />
        <NutrientRow label="Fat" consumed={n.fat.consumed} target={n.fat.target} unit="g" />
        <NutrientRow label="Fiber" consumed={n.fiber.consumed} target={n.fiber.target} unit="g" />
      </div>

      <div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[11px] font-bold text-foreground/80">
            <GlassWater className="h-3.5 w-3.5 text-sky-500" aria-hidden /> Water
          </span>
          <span className="text-[11px] font-bold tabular-nums text-sky-600 dark:text-sky-300">
            {ctx.water.glasses}/{ctx.water.target}
          </span>
        </div>
        <div className="mt-1.5 flex items-center gap-1.5" aria-hidden>
          {Array.from({ length: ctx.water.target }).map((_, i) => (
            <span key={i} className={cn("h-5 w-3.5 rounded-full border", i < ctx.water.glasses ? "border-sky-500 bg-sky-500" : "border-sky-300/60 dark:border-sky-400/30")} />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 border-t border-border/50 pt-3">
        <div className="rounded-xl bg-muted/50 px-2 py-1.5 text-center">
          <p className="flex items-center justify-center gap-1 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
            <Flame className="h-3 w-3 text-orange-500" aria-hidden /> Streak
          </p>
          <p className="text-sm font-extrabold tabular-nums">{ctx.week.streak}d</p>
        </div>
        <div className="rounded-xl bg-muted/50 px-2 py-1.5 text-center">
          <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">Week avg</p>
          <p className="text-sm font-extrabold tabular-nums">{ctx.week.avgCalories.toLocaleString()}</p>
        </div>
        <div className="rounded-xl bg-muted/50 px-2 py-1.5 text-center">
          <p className="flex items-center justify-center gap-1 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
            <Trophy className="h-3 w-3 text-amber-500" aria-hidden /> Days
          </p>
          <p className="text-sm font-extrabold tabular-nums">{ctx.week.daysLogged}/7</p>
        </div>
      </div>
    </section>
  );
}
