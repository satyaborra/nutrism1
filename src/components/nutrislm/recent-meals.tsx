"use client";

/**
 * Recent meals list — from persisted server data only.
 */
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ChevronDown, History, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { useNutriStore, MEAL_TYPE_ICON, mealLabel } from "./store";
import { formatGrams, formatKcal } from "@/lib/client/format";
import type { RecentMealsResponse } from "@/lib/client/types";
import { api } from "@/lib/client/api";

export function RecentMeals() {
  const dataVersion = useNutriStore((s) => s.dataVersion);
  const [data, setData] = useState<RecentMealsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary" aria-hidden />
          Recent meals
        </CardTitle>
        <CardDescription>Your last logged meals with server-verified totals.</CardDescription>
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
                  <CollapsibleTrigger className="group flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-muted/50">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-base" aria-hidden>
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
                  <CollapsibleContent>
                    <ul className="mx-3 mt-1 space-y-1 rounded-lg border bg-muted/30 p-2.5">
                      {m.foods.map((f, i) => (
                        <li key={i} className="flex items-center justify-between gap-2 text-xs">
                          <span className="min-w-0 truncate">
                            <span className="font-medium">{f.name}</span>
                            <span className="text-muted-foreground"> · {f.quantity} {f.unit}</span>
                            {f.preparation && <span className="capitalize text-muted-foreground"> · {f.preparation}</span>}
                          </span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {formatKcal(f.nutrition.calories)} · P {formatGrams(f.nutrition.protein)}
                          </span>
                        </li>
                      ))}
                      <li className="flex items-center justify-between gap-2 border-t pt-1.5 text-xs font-semibold">
                        <span>Meal total</span>
                        <span className="tabular-nums">
                          {formatKcal(m.totals.calories)} · fiber {formatGrams(m.totals.fiber)} · sodium{" "}
                          {Math.round(m.totals.sodium)} mg
                        </span>
                      </li>
                    </ul>
                  </CollapsibleContent>
                </Collapsible>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
