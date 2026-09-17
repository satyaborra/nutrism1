"use client";

/**
 * Recent meals list — from persisted server data only.
 * Supports: expandable full nutrient breakdown per meal + delete with confirmation.
 */
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ChevronDown, History, Loader2, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useNutriStore, MEAL_TYPE_ICON, mealLabel } from "./store";
import { formatGrams, formatKcal } from "@/lib/client/format";
import type { MealDetail, RecentMealsResponse } from "@/lib/client/types";
import { api } from "@/lib/client/api";

/** Full nutrient panel rows: (label, key, unit, decimals). Order = display order. */
const NUTRIENT_ROWS: { label: string; key: keyof MealDetail["totals"]; unit: string; decimals: number; tone?: "watch" }[] = [
  { label: "Calories", key: "calories", unit: "kcal", decimals: 0 },
  { label: "Protein", key: "protein", unit: "g", decimals: 1 },
  { label: "Carbs", key: "carbohydrates", unit: "g", decimals: 1 },
  { label: "Fat", key: "fat", unit: "g", decimals: 1 },
  { label: "Sat. fat", key: "saturatedFat", unit: "g", decimals: 1, tone: "watch" },
  { label: "Fiber", key: "fiber", unit: "g", decimals: 1 },
  { label: "Sugar", key: "sugar", unit: "g", decimals: 1, tone: "watch" },
  { label: "Sodium", key: "sodium", unit: "mg", decimals: 0, tone: "watch" },
  { label: "Potassium", key: "potassium", unit: "mg", decimals: 0 },
  { label: "Phosphorus", key: "phosphorus", unit: "mg", decimals: 0 },
  { label: "Cholesterol", key: "cholesterol", unit: "mg", decimals: 0, tone: "watch" },
];

function formatValue(n: number, decimals: number): string {
  if (decimals === 0) return String(Math.round(n));
  return (Math.round((n + Number.EPSILON) * 10) / 10).toFixed(1);
}

export function RecentMeals() {
  const dataVersion = useNutriStore((s) => s.dataVersion);
  const bumpData = useNutriStore((s) => s.bumpData);
  const { toast } = useToast();
  const [data, setData] = useState<RecentMealsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MealDetail | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .recentMeals()
      .then((res) => alive && (setData(res), setError(null)))
      .catch(() => alive && setError("Could not load your meals."));
    return () => {
      alive = false;
    };
  }, [dataVersion]);

  async function handleDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const res = await api.deleteMeal(pendingDelete.id);
      toast({
        title: "Meal deleted",
        description: `${res.removedFoods} item${res.removedFoods === 1 ? "" : "s"} · ${formatKcal(res.removedCalories)} removed from today's totals.`,
      });
      setPendingDelete(null);
      bumpData();
    } catch (e) {
      toast({
        title: "Could not delete meal",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card className="transition-shadow duration-300 hover:shadow-md hover:shadow-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary" aria-hidden />
          Recent meals
        </CardTitle>
        <CardDescription>Your last logged meals with server-verified totals. Expand for the full nutrient panel or delete a mistaken entry.</CardDescription>
      </CardHeader>
      <CardContent>
        {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

        {!data && !error && (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {data && data.count === 0 && (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nothing logged yet — log your first meal above and it will appear here.
          </p>
        )}

        {data && data.count > 0 && (
          <ul className="max-h-96 space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin]">
            {data.meals.map((m) => (
              <li key={m.id}>
                <Collapsible>
                  <div className="group/meal relative rounded-xl border transition-colors hover:border-primary/40 hover:bg-muted/30 data-[state=open]:border-primary/40">
                    <CollapsibleTrigger className="flex w-full items-center gap-3 rounded-xl p-3 pr-12 text-left transition-colors hover:bg-muted/50">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-base transition-transform group-hover/meal:scale-105" aria-hidden>
                        {MEAL_TYPE_ICON[m.mealType] ?? "🍽️"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold">{mealLabel(m.mealType)}</span>
                          <span className="text-xs text-muted-foreground">{format(new Date(m.eatenAt), "d MMM, HH:mm")}</span>
                          {m.source === "recommendation" && (
                            <Badge variant="secondary" className="text-[9px] uppercase tracking-wide">
                              from rec
                            </Badge>
                          )}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {m.foods.map((f) => f.name).join(" · ")}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-semibold tabular-nums">{formatKcal(m.totals.calories)}</span>
                        <span className="block text-[10px] text-muted-foreground tabular-nums">
                          P {formatGrams(m.totals.protein)} · C {formatGrams(m.totals.carbohydrates)} · F {formatGrams(m.totals.fat)}
                        </span>
                      </span>
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" aria-hidden />
                    </CollapsibleTrigger>

                    {/* Delete trigger — overlays the row's right edge, above the collapsible button */}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${mealLabel(m.mealType)} logged at ${format(new Date(m.eatenAt), "HH:mm")}`}
                      className="absolute right-2 top-2 h-7 w-7 text-muted-foreground/50 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover/meal:opacity-100"
                      onClick={() => setPendingDelete(m)}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </Button>

                    <CollapsibleContent>
                      <div className="mx-3 mb-3 mt-1 space-y-2.5 rounded-lg border bg-muted/30 p-3">
                        {/* Per-food lines */}
                        <ul className="space-y-1">
                          {m.foods.map((f, i) => (
                            <li key={i} className="flex items-center justify-between gap-2 text-xs">
                              <span className="min-w-0 truncate">
                                <span className="font-medium">{f.name}</span>
                                <span className="text-muted-foreground"> · {f.quantity} {f.unit}</span>
                                {f.preparation && <span className="capitalize text-muted-foreground"> · {f.preparation}</span>}
                                {f.quantitySource === "estimated" && (
                                  <Badge variant="outline" className="ml-1.5 px-1 py-0 text-[9px] uppercase tracking-wide text-muted-foreground">
                                    est. qty
                                  </Badge>
                                )}
                              </span>
                              <span className="shrink-0 tabular-nums text-muted-foreground">
                                {formatKcal(f.nutrition.calories)} · P {formatGrams(f.nutrition.protein)}
                              </span>
                            </li>
                          ))}
                        </ul>

                        {/* Full nutrient panel */}
                        <div>
                          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Full nutrient panel — meal totals
                          </p>
                          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4">
                            {NUTRIENT_ROWS.map((row) => {
                              const v = m.totals[row.key] ?? 0;
                              return (
                                <div
                                  key={row.key}
                                  className={`rounded-md border px-2 py-1.5 ${
                                    row.tone === "watch" && v > 0
                                      ? "border-amber-500/30 bg-amber-500/5"
                                      : "border-border/60 bg-background/60"
                                  }`}
                                  title={row.tone === "watch" ? "Keep an eye on this nutrient for your conditions" : undefined}
                                >
                                  <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{row.label}</p>
                                  <p className={`text-xs font-semibold tabular-nums ${row.tone === "watch" && v > 0 ? "text-amber-700 dark:text-amber-400" : ""}`}>
                                    {formatValue(v, row.decimals)}
                                    <span className="ml-0.5 font-normal text-muted-foreground">{row.unit}</span>
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {/* Delete confirmation */}
      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this meal?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete && (
                <>
                  {mealLabel(pendingDelete.mealType)} logged at {format(new Date(pendingDelete.eatenAt), "d MMM, HH:mm")} —{" "}
                  {pendingDelete.foods.map((f) => f.name).join(", ")} ({formatKcal(pendingDelete.totals.calories)}). This
                  cannot be undone and today&apos;s totals will be recalculated.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Deleting…
                </>
              ) : (
                "Delete meal"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
