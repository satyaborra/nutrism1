"use client";

/**
 * Daily hydration tracker — persisted per user per local day (1 glass ≈ 250 ml).
 */
import { useCallback, useEffect, useState } from "react";
import { Droplets, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { api } from "@/lib/client/api";
import type { HydrationResponse } from "@/lib/client/types";

export function HydrationWidget() {
  const { toast } = useToast();
  const [data, setData] = useState<HydrationResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    api
      .hydration()
      .then(setData)
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function update(delta: number) {
    if (busy) return;
    setBusy(true);
    // Optimistic update
    setData((d) => (d ? { ...d, glasses: Math.max(0, Math.min(30, d.glasses + delta)), ml: Math.max(0, Math.min(30, d.glasses + delta)) * 250 } : d));
    try {
      const res = await api.hydrationUpdate({ delta });
      setData(res);
    } catch {
      toast({ title: "Could not update water log", variant: "destructive" });
      load();
    } finally {
      setBusy(false);
    }
  }

  const glasses = data?.glasses ?? 0;
  const goal = data?.goal ?? 8;
  const percent = Math.min(100, Math.round((glasses / goal) * 100));
  const done = glasses >= goal;

  return (
    <Card className="border-primary/15 shadow-sm transition-shadow duration-300 hover:shadow-md hover:shadow-teal-500/10">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Droplets className="h-5 w-5 text-sky-600 dark:text-sky-400" aria-hidden />
          Water Intake
        </CardTitle>
        <CardDescription>1 glass ≈ 250 ml · goal {goal} glasses</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <p className="text-sm text-muted-foreground">Water log unavailable right now.</p>}
        {!data && !error && (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-2/3" />
          </div>
        )}
        {data && (
          <>
            <div className="flex items-end justify-between gap-2" aria-live="polite">
              {/* glass-shaped markers */}
              <div className="flex flex-wrap gap-1" role="img" aria-label={`${glasses} of ${goal} glasses`}>
                {Array.from({ length: goal }).map((_, i) => {
                  const filled = i < glasses;
                  return (
                    <span
                      key={i}
                      aria-hidden
                      className={cn(
                        "relative h-6 w-3.5 overflow-hidden rounded-b-md rounded-t-sm border transition-all duration-300",
                        filled ? "border-sky-500/70" : "border-border",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute inset-x-0 bottom-0 transition-all duration-500",
                          filled ? "bg-gradient-to-t from-sky-500 to-sky-300" : "bg-transparent",
                        )}
                        style={{ height: filled ? "88%" : "0%" }}
                      />
                      {/* glass rim highlight */}
                      <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-background/60" />
                    </span>
                  );
                })}
              </div>
              <div className="shrink-0 text-right">
                <span className={cn("text-2xl font-extrabold tabular-nums", done ? "text-sky-600 dark:text-sky-400" : "text-foreground")}>
                  {glasses}
                </span>
                <span className="text-sm text-muted-foreground">/{goal}</span>
                <p className="text-[10px] tabular-nums text-muted-foreground">
                  {data.ml.toLocaleString()} ml ({percent}%)
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full gap-1.5 border-sky-500/40 bg-sky-500/5 text-sky-700 transition-all hover:bg-sky-500/15 active:scale-[0.98] dark:text-sky-400"
              onClick={() => update(1)}
              disabled={busy}
              aria-label="Add a glass of water"
            >
              <Plus className="h-4 w-4" aria-hidden /> Add a Glass
            </Button>
            {done && (
              <p className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-center text-xs font-medium text-sky-700 dark:text-sky-400">
                💧 Goal reached — nicely hydrated!
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
