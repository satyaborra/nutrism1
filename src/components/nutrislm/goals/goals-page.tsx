"use client";

/**
 * Goals page — orchestrates the full reference-design board:
 * hero → milestones banner → category/status-filtered goal grid →
 * summary donut | upcoming milestones | AI coach suggestion.
 *
 * Data: GET /api/goals (auto-seeded defaults + deterministic progress),
 * GET /api/nutrition/milestones (real badge board), GET coach-insight.
 * Check-ins are optimistic with server confirmation; hydration-driven and
 * other auto goals refresh on the shared dataVersion (e.g. after logging water
 * on the Meals page).
 */
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import type {
  CoachInsightResponse,
  GoalItem,
  GoalsResponse,
  MilestonesResponse,
} from "@/lib/client/types";
import { api } from "@/lib/client/api";
import { useNutriStore } from "../store";
import { FadeIn } from "../fade-in";
import { GoalsHero } from "./goals-hero";
import { MilestonesBanner } from "./milestones-banner";
import { GoalsGrid } from "./goals-grid";
import { GoalsSummary } from "./goals-summary";
import { UpcomingMilestones } from "./upcoming-milestones";
import { CoachSuggestion } from "./coach-suggestion";
import { NewGoalDialog } from "./new-goal-dialog";

export function GoalsPage() {
  const dataVersion = useNutriStore((s) => s.dataVersion);
  const { toast } = useToast();

  const [board, setBoard] = useState<GoalsResponse | null>(null);
  const [milestones, setMilestones] = useState<MilestonesResponse | null>(null);
  const [coach, setCoach] = useState<CoachInsightResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [newOpen, setNewOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([
      api.goals(),
      api.milestones(),
      api.coachInsight().catch(() => null), // coach is decorative here — never block the board
    ])
      .then(([g, m, c]) => {
        if (!alive) return;
        setBoard(g);
        setMilestones(m);
        setCoach(c);
        setFailed(false);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [dataVersion]);

  /** Replace one goal (and recompute the summary counts) without a refetch. */
  const applyGoal = useCallback((updated: GoalItem) => {
    setBoard((prev) => {
      if (!prev) return prev;
      const goals = prev.goals.map((g) => (g.id === updated.id ? updated : g));
      const summary = {
        completed: goals.filter((g) => g.status === "completed").length,
        inProgress: goals.filter((g) => g.status === "in_progress").length,
        notStarted: goals.filter((g) => g.status === "not_started").length,
        total: goals.length,
      };
      return { goals, summary };
    });
  }, []);

  const handleCheckIn = useCallback(
    async (goal: GoalItem) => {
      setBusyIds((prev) => new Set(prev).add(goal.id));
      const wasChecked = goal.checkedToday;
      try {
        const res = await api.goalCheckIn(goal.id);
        if (res.goal) applyGoal(res.goal);
        toast({
          title: res.checked ? (res.goal?.status === "completed" ? "Goal unlocked! 🎉" : "Checked in ✓") : "Check-in removed",
          description: res.checked
            ? `${goal.title} — ${res.goal ? `${res.goal.value} of ${res.goal.target} days` : "progress updated"}.`
            : `${goal.title} — today's check-in was undone.`,
        });
      } catch {
        toast({
          title: "Check-in failed",
          description: "Please try again in a moment.",
          variant: "destructive" as const,
        });
      } finally {
        setBusyIds((prev) => {
          const next = new Set(prev);
          next.delete(goal.id);
          return next;
        });
        void wasChecked;
      }
    },
    [applyGoal, toast],
  );

  const handleDelete = useCallback(
    async (goal: GoalItem) => {
      try {
        await api.deleteGoal(goal.id);
        setBoard((prev) =>
          prev
            ? {
                goals: prev.goals.filter((g) => g.id !== goal.id),
                summary: {
                  ...prev.summary,
                  total: prev.summary.total - 1,
                },
              }
            : prev,
        );
        toast({ title: "Goal deleted", description: `${goal.title} was removed from your board.` });
      } catch {
        toast({ title: "Could not delete goal", description: "Please try again in a moment." });
      }
    },
    [toast],
  );

  const handleCreated = useCallback(() => {
    toast({ title: "Goal created 🎯", description: "Check in each day you complete it." });
    // Refresh via dataVersion bump (shared bridge) so board + milestones reload.
    useNutriStore.getState().bumpData();
  }, [toast]);

  const loading = !board && !failed;

  return (
    <div className="space-y-4 sm:space-y-5">
      <FadeIn>
        <GoalsHero />
      </FadeIn>

      <FadeIn delay={0.05}>
        <MilestonesBanner milestones={milestones} onSetNewGoal={() => setNewOpen(true)} />
      </FadeIn>

      <FadeIn delay={0.1}>
        <GoalsGrid
          goals={board?.goals ?? null}
          loading={loading}
          failed={failed}
          busyIds={busyIds}
          onCheckIn={(g) => void handleCheckIn(g)}
          onDelete={(g) => void handleDelete(g)}
        />
      </FadeIn>

      <FadeIn delay={0.15}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <GoalsSummary goals={board?.goals ?? null} milestones={milestones} loading={loading} />
          <UpcomingMilestones milestones={milestones} loading={!milestones} />
          <CoachSuggestion
            insight={coach?.insight ?? null}
            loading={!coach}
            failed={!coach && !loading}
          />
        </div>
      </FadeIn>

      <NewGoalDialog open={newOpen} onOpenChange={setNewOpen} onCreated={handleCreated} />
    </div>
  );
}
