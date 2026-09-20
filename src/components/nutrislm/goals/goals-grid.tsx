"use client";

/**
 * Goals grid — category pill tabs (All Goals / Nutrition / Health & Medical /
 * Lifestyle / Learning / Streaks), a status dropdown on the right, and the
 * responsive card grid (6-up on xl like the reference, down to 2-up on mobile).
 */
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { GoalItem } from "@/lib/client/types";
import { GoalCard } from "./goal-card";

const TABS: { key: string; label: string }[] = [
  { key: "all", label: "All Goals" },
  { key: "nutrition", label: "Nutrition" },
  { key: "health", label: "Health & Medical" },
  { key: "lifestyle", label: "Lifestyle" },
  { key: "learning", label: "Learning" },
  { key: "streaks", label: "Streaks" },
];

const STATUS_OPTIONS = [
  { key: "active", label: "Active Goals" },
  { key: "all", label: "All Statuses" },
  { key: "completed", label: "Completed" },
  { key: "not_started", label: "Not Started" },
];

export function GoalsGrid({
  goals,
  loading,
  failed,
  busyIds,
  onCheckIn,
  onDelete,
}: {
  goals: GoalItem[] | null;
  loading: boolean;
  failed: boolean;
  busyIds: Set<string>;
  onCheckIn: (goal: GoalItem) => void;
  onDelete: (goal: GoalItem) => void;
}) {
  const [tab, setTab] = useState("all");
  const [status, setStatus] = useState("active");

  const filtered = (goals ?? []).filter((g) => {
    if (tab !== "all" && g.category !== tab) return false;
    if (status === "active" && g.status === "completed") return false;
    if (status === "completed" && g.status !== "completed") return false;
    if (status === "not_started" && g.status !== "not_started") return false;
    return true;
  });

  return (
    <section aria-label="Your goals" className="space-y-4">
      {/* tabs + status filter */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div
          className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin] lg:pb-0"
          role="tablist"
          aria-label="Filter goals by category"
        >
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold transition-all",
                tab === t.key
                  ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25"
                  : "border border-border/70 bg-card text-foreground/75 hover:border-primary/30 hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger
            className="w-full shrink-0 rounded-full border-border/70 bg-card font-semibold sm:w-[170px]"
            aria-label="Filter goals by status"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.key} value={o.key}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* grid */}
      {loading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      )}

      {!loading && failed && (
        <div className="rounded-2xl border border-dashed border-muted-foreground/30 p-8 text-center text-sm text-muted-foreground">
          Your goals couldn&apos;t be loaded. They&apos;ll reappear on refresh or the next data change.
        </div>
      )}

      {!loading && !failed && filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-muted-foreground/30 p-8 text-center">
          <p className="text-sm font-medium">No goals match this view.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Try another category or status — or set a new goal from the banner above.
          </p>
        </div>
      )}

      {!loading && !failed && filtered.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-6">
          {filtered.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              busy={busyIds.has(g.id)}
              onCheckIn={onCheckIn}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </section>
  );
}
