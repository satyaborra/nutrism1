/**
 * GET /api/nutrition/milestones — deterministic achievements computed entirely
 * from the database (no AI, no client input). Covers: total meals logged,
 * logging streak (consecutive days ending today or yesterday), distinct days
 * logged, hydration-hero days (≥8 glasses), distinct foods tried, photo logs,
 * coach conversations, and recommendation feedback given.
 * Each milestone carries a progress fraction so the UI can show partial rings.
 */
import { NextResponse } from "next/server";
import { withApi } from "@/lib/api-utils";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Count consecutive logged days ending today (or yesterday if today not yet logged). */
function computeStreak(dates: Set<string>): number {
  const cursor = new Date();
  if (!dates.has(dayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!dates.has(dayKey(cursor))) return 0; // streak requires continuity up to yesterday/today
  }
  let streak = 0;
  while (dates.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export const GET = withApi("milestones", async (): Promise<NextResponse> => {
  const user = await requireUser();
  const since = new Date();
  since.setDate(since.getDate() - 90); // scan window: 90 days is plenty for streaks

  const [totalMeals, meals, hydration, foodsTried, photoLogs, coachMessages, feedback, notesCount] = await Promise.all([
    db.meal.count({ where: { userId: user.id } }),
    db.meal.findMany({
      where: { userId: user.id, eatenAt: { gte: since } },
      select: { eatenAt: true, source: true },
      orderBy: { eatenAt: "asc" },
    }),
    db.hydrationLog.findMany({
      where: { userId: user.id, glasses: { gte: 8 } },
      select: { date: true },
    }),
    db.mealFood.findMany({
      where: { meal: { userId: user.id }, foodId: { not: null } },
      select: { foodId: true },
      distinct: ["foodId"],
    }),
    db.meal.count({ where: { userId: user.id, source: "image" } }),
    db.coachMessage.count({ where: { userId: user.id, role: "user" } }),
    db.recommendationFeedback.count({ where: { userId: user.id } }),
    db.meal.count({ where: { userId: user.id, userNotes: { not: null } } }),
  ]);

  const loggedDays = new Set(meals.map((m) => dayKey(m.eatenAt)));
  const streak = computeStreak(loggedDays);
  const heroDays = hydration.length;

  interface Milestone {
    id: string;
    label: string;
    description: string;
    icon: string;
    value: number;
    goal: number;
    achieved: boolean;
    progress: number;
  }
  const build = (
    id: string,
    label: string,
    description: string,
    icon: string,
    value: number,
    goal: number,
  ): Milestone => ({
    id,
    label,
    description,
    icon,
    value,
    goal,
    achieved: value >= goal,
    progress: Math.min(1, goal > 0 ? value / goal : 0),
  });

  const milestones: Milestone[] = [
    build("first-meal", "First bite", "Log your very first meal", "🍽️", totalMeals, 1),
    build("meals-10", "Getting started", "Log 10 meals", "📝", totalMeals, 10),
    build("meals-50", "Consistent logger", "Log 50 meals", "📚", totalMeals, 50),
    build("streak-3", "3-day streak", "Log meals 3 days in a row", "🔥", streak, 3),
    build("streak-7", "Week warrior", "Log meals 7 days in a row", "🏅", streak, 7),
    build("hydration-1", "Hydration hero", "Reach 8 glasses in one day", "💧", heroDays, 1),
    build("hydration-5", "Water regular", "Hit 8 glasses on 5 days", "🌊", heroDays, 5),
    build("explorer-10", "Food explorer", "Try 10 different verified foods", "🧭", foodsTried.length, 10),
    build("photo-1", "Lens ready", "Log your first meal from a photo", "📸", photoLogs, 1),
    build("coach-1", "Curious mind", "Ask the coach your first question", "💡", coachMessages, 1),
    build("feedback-1", "Tuning in", "Rate a recommendation", "🎯", feedback, 1),
    build("notes-3", "Notes keeper", "Add feelings notes to 3 meals", "🗒️", notesCount, 3),
  ];

  const achievedCount = milestones.filter((m) => m.achieved).length;

  return NextResponse.json({
    milestones,
    achievedCount,
    totalCount: milestones.length,
    stats: {
      totalMeals,
      loggingStreak: streak,
      daysLogged90d: loggedDays.size,
      hydrationHeroDays: heroDays,
      foodsTried: foodsTried.length,
      notesWritten: notesCount,
    },
  });
});
