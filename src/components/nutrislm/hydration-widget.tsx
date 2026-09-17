"use client";

/**
 * Daily hydration tracker — persisted per user per local day (1 glass ≈ 250 ml).
 */
import { useCallback, useEffect, useState } from "react";
import { Droplets, Minus, Plus } from "lucide-react";
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
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Droplets className="h-5 w-5 text-teal-600" aria-hidden />
          Water today
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
            <div className="flex items-center justify-between gap-2" aria-live="polite">
              <div className="flex flex-wrap gap-1" role="img" aria-label={`${glasses} of ${goal} glasses`}>
                {Array.from({ length: goal }).map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-6 w-2.5 rounded-full border transition-all duration-300",
                      i < glasses ? "border-teal-500 bg-teal-500/80" : "bg-muted",
                      i === glasses - 1 && i < glasses && "scale-y-110"
                    )}
                  />
                ))}
              </div>
              <div className="text-right">
                <span className={cn("text-2xl font-bold tabular-nums", done ? "text-teal-600" : "text-foreground")}>{glasses}</span>
                <span className="text-sm text-muted-foreground">/{goal}</span>
                <p className="text-[10px] text-muted-foreground tabular-nums">{data.ml} ml · {percent}%</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => update(-1)} disabled={busy || glasses === 0} aria-label="Remove a glass of water">
                <Minus className="h-4 w-4" aria-hidden />
              </Button>
              <Button size="sm" className="flex-[2] bg-teal-600 hover:bg-teal-700 text-white" onClick={() => update(1)} disabled={busy} aria-label="Add a glass of water">
                <Plus className="mr-1 h-4 w-4" aria-hidden /> Add a glass
              </Button>
            </div>
            {done && (
              <p className="rounded-lg border border-teal-500/30 bg-teal-500/10 px-3 py-1.5 text-center text-xs font-medium text-teal-700 dark:text-teal-400">
                💧 Goal reached — nicely hydrated!
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
