"use client";

/**
 * GoalCard — one tile on the goals board. Centered emoji bubble, title,
 * subtitle, value/target and a gradient progress bar (reference layout).
 * - completed: emerald tint + ring + check badge
 * - check-in goals: "Done today" toggle that writes a real GoalCheckIn row
 * - every card carries an info popover with the exact measurement method
 * - custom goals additionally get a delete action (AlertDialog confirm)
 */
import { useState } from "react";
import { CalendarCheck, CheckCircle2, Info, Loader2, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { GoalItem } from "@/lib/client/types";

const CATEGORY_BUBBLE: Record<string, string> = {
  nutrition: "from-emerald-100 to-teal-100 dark:from-emerald-500/15 dark:to-teal-500/15",
  health: "from-rose-100 to-orange-100 dark:from-rose-500/15 dark:to-orange-500/15",
  lifestyle: "from-amber-100 to-lime-100 dark:from-amber-500/15 dark:to-lime-500/15",
  learning: "from-violet-100 to-fuchsia-100 dark:from-violet-500/15 dark:to-fuchsia-500/15",
  streaks: "from-orange-100 to-amber-100 dark:from-orange-500/15 dark:to-amber-500/15",
};

export function GoalCard({
  goal,
  busy,
  onCheckIn,
  onDelete,
}: {
  goal: GoalItem;
  busy?: boolean;
  onCheckIn: (goal: GoalItem) => void;
  onDelete: (goal: GoalItem) => void;
}) {
  const [infoOpen, setInfoOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const completed = goal.status === "completed";

  return (
    <Card
      className={cn(
        "group relative overflow-hidden rounded-2xl border shadow-sm shadow-black/[0.02] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
        completed
          ? "border-emerald-500/40 bg-gradient-to-b from-emerald-500/[0.07] to-card dark:from-emerald-500/10"
          : "border-border/80",
      )}
    >
      <CardContent className="flex h-full flex-col items-center gap-1.5 p-3.5 text-center sm:p-4">
        {/* corner actions */}
        <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5">
          {goal.isCustom && (
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              aria-label={`Delete goal ${goal.title}`}
              className="rounded-md p-1 text-muted-foreground/50 opacity-0 transition hover:bg-rose-500/10 hover:text-rose-500 focus-visible:opacity-100 group-hover:opacity-100"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
          <Popover open={infoOpen} onOpenChange={setInfoOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={`How "${goal.title}" is measured`}
                className={cn(
                  "rounded-md p-1 text-muted-foreground/50 transition hover:bg-muted hover:text-foreground",
                  infoOpen && "bg-muted text-foreground opacity-100",
                )}
              >
                <Info className="h-3.5 w-3.5" aria-hidden />
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="end" className="w-60 text-xs leading-relaxed">
              <p className="mb-1 font-semibold">{goal.title}</p>
              <p className="text-muted-foreground">{goal.measure}</p>
            </PopoverContent>
          </Popover>
        </div>

        {completed && (
          <span
            className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm"
            title="Goal completed"
            aria-label={`${goal.title} completed`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          </span>
        )}

        {/* emoji bubble */}
        <span
          aria-hidden
          className={cn(
            "mt-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br text-[1.75rem] shadow-sm transition-transform duration-200 group-hover:scale-105 sm:text-3xl",
            CATEGORY_BUBBLE[goal.category] ?? CATEGORY_BUBBLE.lifestyle,
          )}
        >
          {goal.emoji}
        </span>

        <h3 className="mt-1 text-[13px] font-bold leading-tight sm:text-sm">{goal.title}</h3>
        <p className="text-[11px] leading-tight text-muted-foreground">{goal.subtitle}</p>

        <p className="mt-0.5 text-[11px] font-semibold tabular-nums text-foreground/80" aria-live="polite">
          {goal.rawValue > goal.target ? (
            <span title={`${goal.rawValue} total`}>
              {goal.value} / {goal.target}
            </span>
          ) : (
            <>
              {goal.value} / {goal.target}
            </>
          )}
          {completed && <span className="ml-1 font-bold text-emerald-600 dark:text-emerald-400">✓</span>}
        </p>

        {/* progress bar */}
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={Math.round(goal.progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${goal.title} progress`}
        >
          <div
            className={cn(
              "relative h-full rounded-full transition-[width] duration-700 ease-out",
              completed
                ? "bg-gradient-to-r from-emerald-500 to-teal-500"
                : "bg-gradient-to-r from-emerald-400 to-emerald-600",
            )}
            style={{ width: `${Math.max(goal.progress * 100, goal.progress > 0 ? 6 : 0)}%` }}
          >
            <span aria-hidden className="absolute inset-y-0 right-0 w-4 rounded-full bg-white/30 blur-[2px]" />
          </div>
        </div>

        {/* check-in action (habit goals only) */}
        {goal.kind === "checkin" && (
          <Button
            type="button"
            variant={goal.checkedToday ? "secondary" : "outline"}
            size="sm"
            disabled={busy}
            onClick={() => onCheckIn(goal)}
            className={cn(
              "mt-1.5 h-7 w-full gap-1.5 rounded-lg text-[11px] font-semibold",
              goal.checkedToday &&
                "border border-emerald-500/40 bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-300",
            )}
          >
            {busy ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            ) : (
              <CalendarCheck className="h-3 w-3" aria-hidden />
            )}
            {goal.checkedToday ? "Done today ✓" : "Mark today done"}
          </Button>
        )}
        {goal.kind === "auto" && (
          <p className="mt-auto pt-1.5 text-[10px] font-medium text-muted-foreground/70">
            {completed ? "Goal reached — brilliant!" : goal.period === "daily" ? "Auto-tracked today" : "Auto-tracked · last 7 days"}
          </p>
        )}
        {goal.kind === "checkin" && goal.checkedToday && !completed && (
          <p className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">Nice — see you tomorrow!</p>
        )}
      </CardContent>

      {/* delete confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{goal.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the goal and its check-in history. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDeleteOpen(false);
                onDelete(goal);
              }}
              className="bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-600"
            >
              Delete goal
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
