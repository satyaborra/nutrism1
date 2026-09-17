"use client";

/**
 * Notes journal — a reflective view over the meal notes users write when
 * logging/editing (Meal.userNotes, display-only). Deterministic list + mood
 * tally from the server; the optional "Reflect with AI" call sends ONLY those
 * deterministic note excerpts to the SLM (no nutrition numbers in, none out)
 * and falls back to a rule-based reflection if AI is unavailable.
 */
import { useCallback, useEffect, useState } from "react";
import { BookOpenCheck, BrainCircuit, RefreshCw, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { api } from "@/lib/client/api";
import type { NotesJournalResponse, NotesReflectionResponse } from "@/lib/client/types";
import { MEAL_TYPE_ICON, useNutriStore } from "./store";

const MOOD_STYLE: Record<string, { label: string; chip: string; bar: string }> = {
  enjoyed: { label: "Enjoyed", chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400", bar: "bg-emerald-500" },
  craving: { label: "Craving", chip: "bg-amber-500/15 text-amber-700 dark:text-amber-400", bar: "bg-amber-500" },
  okay: { label: "Just okay", chip: "bg-stone-500/15 text-stone-700 dark:text-stone-400", bar: "bg-stone-400" },
  habit: { label: "Habit", chip: "bg-teal-500/15 text-teal-700 dark:text-teal-400", bar: "bg-teal-500" },
  stressed: { label: "Stressed", chip: "bg-rose-500/15 text-rose-700 dark:text-rose-400", bar: "bg-rose-500" },
  fuel: { label: "Fuel", chip: "bg-lime-500/15 text-lime-700 dark:text-lime-400", bar: "bg-lime-500" },
  freeform: { label: "Free-form", chip: "bg-muted text-muted-foreground", bar: "bg-muted-foreground/50" },
};

function moodStyle(mood: string) {
  return MOOD_STYLE[mood] ?? MOOD_STYLE.freeform;
}

function dayLabel(dateKey: string): string {
  const d = new Date(dateKey + "T12:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((today.getTime() - d.getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function NotesJournal() {
  const dataVersion = useNutriStore((s) => s.dataVersion);
  const { toast } = useToast();
  const [data, setData] = useState<NotesJournalResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reflection, setReflection] = useState<NotesReflectionResponse | null>(null);
  const [reflecting, setReflecting] = useState(false);
  const [reflectError, setReflectError] = useState<string | null>(null);

  useEffect(() => {
    api
      .notesJournal()
      .then(setData)
      .catch(() => setError("Could not load your notes journal."));
  }, [dataVersion]);

  const reflect = useCallback(async () => {
    setReflecting(true);
    setReflectError(null);
    try {
      const res = await api.notesReflect();
      setReflection(res);
    } catch (e) {
      setReflectError(
        e instanceof Error && e.message.includes("Too many requests")
          ? "Too many reflections in a row — try again in a few minutes."
          : "Could not generate the reflection right now.",
      );
    } finally {
      setReflecting(false);
    }
  }, []);

  const maxMood = data?.stats.moodCounts[0]?.count ?? 0;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpenCheck className="size-4 text-teal-600 dark:text-teal-400" aria-hidden />
              Notes journal
            </CardTitle>
            <CardDescription className="mt-1">
              The &ldquo;how did you feel?&rdquo; notes on your meals — mirrored back as a quiet, judgment-free log.
            </CardDescription>
          </div>
          {data && data.stats.total > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="rounded-full bg-teal-500/15 px-2.5 py-1 font-medium text-teal-700 dark:text-teal-400">
                {data.stats.total} note{data.stats.total === 1 ? "" : "s"} · 30 days
              </span>
              {data.stats.last7 > 0 && (
                <span className="rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground">
                  {data.stats.last7} this week
                </span>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        {!data && !error && (
          <div className="space-y-2" aria-hidden>
            <Skeleton className="h-4 w-52" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        )}

        {data && (
          <>
            {/* mood distribution */}
            {data.stats.moodCounts.length > 0 && (
              <div className="space-y-1.5" aria-label="Mood distribution across your notes">
                {data.stats.moodCounts.slice(0, 4).map((m) => {
                  const style = moodStyle(m.mood);
                  return (
                    <div key={m.mood} className="flex items-center gap-2 text-xs">
                      <span className="w-20 shrink-0 text-muted-foreground">{style.label}</span>
                      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted/70">
                        <div
                          className={cn("h-full rounded-full transition-all duration-500", style.bar)}
                          style={{ width: `${Math.max(8, (m.count / Math.max(1, maxMood)) * 100)}%` }}
                        />
                      </div>
                      <span className="w-6 shrink-0 text-right font-mono tabular-nums text-muted-foreground">{m.count}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* AI reflection */}
            <div className="rounded-lg border bg-gradient-to-br from-teal-500/[0.06] to-transparent p-3">
              {!reflection && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <BrainCircuit className="size-4 text-teal-600 dark:text-teal-400" aria-hidden />
                    See a gentle theme across your recent notes — feelings only, never numbers.
                  </p>
                  <Button size="sm" variant="outline" onClick={reflect} disabled={reflecting} className="gap-1.5 active:scale-[0.98]">
                    {reflecting ? <RefreshCw className="size-3.5 animate-spin" aria-hidden /> : <Sparkles className="size-3.5" aria-hidden />}
                    {reflecting ? "Reflecting…" : "Reflect with AI"}
                  </Button>
                </div>
              )}
              {reflecting && (
                <div className="space-y-2" aria-hidden>
                  <Skeleton className="h-4 w-44" />
                  <Skeleton className="h-12 w-full" />
                </div>
              )}
              {reflectError && (
                <p className="text-xs text-destructive" role="alert">
                  {reflectError}
                </p>
              )}
              {reflection && !reflecting && (
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold">{reflection.headline}</p>
                    <Badge
                      variant="outline"
                      className={cn(
                        "shrink-0 px-1.5 py-0 text-[9px] font-normal",
                        reflection.engineSource === "ai" ? "border-teal-500/40 text-teal-600 dark:text-teal-400" : "text-muted-foreground",
                      )}
                    >
                      {reflection.engineSource === "ai" ? "AI" : "rule-based"}
                    </Badge>
                  </div>
                  <p className="text-sm leading-relaxed text-foreground/90">{reflection.reflection}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {reflection.suggestions.map((s, i) => (
                      <span
                        key={i}
                        className="rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-1 text-[11px] text-teal-800 dark:text-teal-300"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                  {reflection.aiNote && <p className="text-[11px] italic text-muted-foreground">{reflection.aiNote}</p>}
                  <button
                    type="button"
                    onClick={() => setReflection(null)}
                    className="text-[11px] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
                  >
                    Hide reflection
                  </button>
                </div>
              )}
            </div>

            {/* notes list */}
            {data.notes.length === 0 ? (
              <p className="rounded-lg border border-dashed bg-muted/40 p-4 text-center text-sm text-muted-foreground">
                No reflection notes yet — open any logged meal and add a quick &ldquo;how did you feel?&rdquo; note with mood chips.
              </p>
            ) : (
              <ul className="max-h-72 space-y-2.5 overflow-y-auto pr-1 [scrollbar-width:thin]" aria-label="Your notes">
                {data.notes.map((n) => (
                  <li
                    key={n.id}
                    className="rounded-md border-l-[3px] border-l-teal-500/70 bg-muted/40 px-3 py-2 transition-colors hover:bg-muted/70"
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground/80">{dayLabel(n.date)}</span>
                      <span aria-hidden>{MEAL_TYPE_ICON[n.mealType] ?? MEAL_TYPE_ICON.snack}</span>
                      <span className="capitalize">{n.mealType}</span>
                      <span className="ml-auto flex gap-1">
                        {n.moods.map((m) => (
                          <span
                            key={m}
                            className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", moodStyle(m).chip)}
                          >
                            {moodStyle(m).label}
                          </span>
                        ))}
                      </span>
                    </div>
                    <p className="mt-1 text-sm italic leading-snug text-foreground/85">&ldquo;{n.note}&rdquo;</p>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
