"use client";

/**
 * AI Coach suggestion card — the real coach insight (grounded in the user's
 * deterministic numbers), mascot artwork, and a jump to the personalized plan
 * (home recommendation pipeline).
 */
import { ArrowRight, Lightbulb, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useNutriStore } from "../store";

export function CoachSuggestion({
  insight,
  loading,
  failed,
}: {
  insight: string | null;
  loading: boolean;
  failed: boolean;
}) {
  const setView = useNutriStore((s) => s.setView);

  return (
    <Card className="flex h-full flex-col overflow-hidden rounded-3xl border-primary/15 bg-gradient-to-b from-primary/[0.05] via-card to-card shadow-sm shadow-black/[0.02]">
      <CardContent className="flex h-full flex-col gap-3.5 p-4 sm:p-5">
        <h3 className="flex items-center gap-2 text-sm font-bold sm:text-[15px]">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-200 to-fuchsia-200 text-violet-700 dark:from-violet-500/25 dark:to-fuchsia-500/15 dark:text-violet-300" aria-hidden>
            <Sparkles className="h-4 w-4" />
          </span>
          AI Coach Suggestion
        </h3>

        <div className="flex items-start gap-3">
          <img
            src="/images/coach-mascot.png"
            alt=""
            aria-hidden
            className="h-16 w-16 shrink-0 rounded-2xl object-contain dark:opacity-90"
          />
          <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm border border-border/70 bg-muted/40 p-3">
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-5/6" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ) : failed || !insight ? (
              <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                Log a few meals and the coach will start grounding suggestions in your own numbers.
              </p>
            ) : (
              <p className="text-[12.5px] leading-relaxed text-foreground/90">
                <span aria-hidden className="mr-1 font-serif text-base font-bold text-primary">
                  &ldquo;
                </span>
                {insight}
              </p>
            )}
          </div>
        </div>

        <Button
          type="button"
          variant="secondary"
          onClick={() => setView("home")}
          className="group mt-auto w-full justify-between rounded-xl bg-primary/10 font-semibold text-primary hover:bg-primary/15"
        >
          View personalized plan
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Button>

        <p className="flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
          <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
          Consistent habits today, a healthier tomorrow.
        </p>
      </CardContent>
    </Card>
  );
}
