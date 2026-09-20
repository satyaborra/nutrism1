/**
 * Goals service — deterministic goal board shared by the /api/goals routes.
 *
 * Two goal kinds, both honest by construction:
 *  - "auto"    progress is computed from the user's logged data (hydration logs,
 *              meals joined to verified foods, daily targets). No invented numbers.
 *  - "checkin" habit goals the user marks day-by-day; progress = distinct days
 *              checked within the evaluation window.
 *
 * Condition-titled goals (T2DM / CKD / CVD) adapt their wording to the user's
 * active profile conditions: clinical title when the condition is on the
 * profile, a preventive title otherwise. The underlying metric is identical.
 */
import { db } from "@/lib/db";
import { computeDailyTargets, safeParseArray } from "./targets";
import type { DailyTargets } from "./targets";

export interface GoalDefaults {
  key: string;
  title: string;
  subtitle: string;
  emoji: string;
  category: "nutrition" | "health" | "lifestyle" | "learning" | "streaks";
  kind: "auto" | "checkin";
  autoMetric: string | null;
  period: "daily" | "weekly" | "monthly";
  target: number;
}

/** The 12 default goals shown on the Goals board. */
export const DEFAULT_GOALS: GoalDefaults[] = [
  { key: "hydration", title: "Hydration Hero", subtitle: "Drink 8 glasses daily", emoji: "💧", category: "nutrition", kind: "auto", autoMetric: "hydration_day", period: "daily", target: 8 },
  { key: "veggies", title: "More Veggies", subtitle: "Eat vegetables daily", emoji: "🥗", category: "nutrition", kind: "auto", autoMetric: "veggie_days", period: "weekly", target: 7 },
  { key: "exercise", title: "Stay Active", subtitle: "30 mins exercise", emoji: "👟", category: "lifestyle", kind: "checkin", autoMetric: null, period: "weekly", target: 7 },
  { key: "sleep", title: "Better Sleep", subtitle: "Sleep 7-8 hours", emoji: "🌙", category: "lifestyle", kind: "checkin", autoMetric: null, period: "weekly", target: 7 },
  { key: "mindful", title: "Mindful Eating", subtitle: "Eat without distractions", emoji: "🍎", category: "nutrition", kind: "checkin", autoMetric: null, period: "weekly", target: 7 },
  { key: "learn", title: "Learn & Grow", subtitle: "Explore nutrition tips", emoji: "📘", category: "learning", kind: "checkin", autoMetric: null, period: "weekly", target: 5 },
  { key: "sugar", title: "Blood Sugar Balance", subtitle: "Keep sugar in check", emoji: "🩸", category: "health", kind: "auto", autoMetric: "sugar_days", period: "weekly", target: 7 },
  { key: "sodium", title: "Sodium Watch", subtitle: "Keep sodium in check", emoji: "🫘", category: "health", kind: "auto", autoMetric: "sodium_days", period: "weekly", target: 7 },
  { key: "fiber", title: "Heart Health", subtitle: "Heart-healthy habits", emoji: "❤️", category: "health", kind: "auto", autoMetric: "fiber_days", period: "weekly", target: 7 },
  { key: "weight", title: "Maintain Weight", subtitle: "Stay within calorie target", emoji: "⚖️", category: "health", kind: "auto", autoMetric: "calorie_days", period: "weekly", target: 7 },
  { key: "logging", title: "Consistent Logging", subtitle: "Log meals daily", emoji: "🎯", category: "streaks", kind: "auto", autoMetric: "logging_days", period: "monthly", target: 30 },
  { key: "stress", title: "Stress Management", subtitle: "Stay calm & balanced", emoji: "🌿", category: "lifestyle", kind: "checkin", autoMetric: null, period: "weekly", target: 5 },
];

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysAgoKey(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return dayKey(d);
}

/** Create any of the default goals missing for this user (first visit / new goals shipped later). */
export async function ensureDefaultGoals(userId: string): Promise<void> {
  const existing = await db.goal.findMany({
    where: { userId, archived: false },
    select: { key: true },
  });
  const have = new Set(existing.map((g) => g.key));
  const missing = DEFAULT_GOALS.filter((d) => !have.has(d.key));
  if (missing.length === 0) return;
  await db.goal.createMany({
    data: missing.map((d) => ({
      userId,
      key: d.key,
      title: d.title,
      subtitle: d.subtitle,
      emoji: d.emoji,
      category: d.category,
      kind: d.kind,
      autoMetric: d.autoMetric,
      period: d.period,
      target: d.target,
      isCustom: false,
    })),
  });
}

/** Human explanation of exactly how a goal's number is produced. */
function measureFor(goal: { kind: string; autoMetric: string | null; target: number; period: string }): string {
  if (goal.kind === "checkin") {
    const window = goal.period === "monthly" ? "the last 30 days" : goal.period === "daily" ? "today" : "the last 7 days";
    return `Habit check-in — tap "Done today" each day you complete it. Unlocks at ${goal.target} checked ${goal.target === 1 ? "day" : "days"} in ${window}.`;
  }
  switch (goal.autoMetric) {
    case "hydration_day":
      return "Counted live from your water logs — today's glasses against your 8-glass goal.";
    case "veggie_days":
      return "Days in the last 7 with a vegetable-rich meal (a verified vegetable food logged).";
    case "sugar_days":
      return "Days in the last 7 where your sugar total stayed within your personal daily target.";
    case "sodium_days":
      return "Days in the last 7 where your sodium total stayed within your personal daily target.";
    case "fiber_days":
      return "Days in the last 7 where your fiber met your personal daily target.";
    case "calorie_days":
      return "Days in the last 7 within ±10% of your personal calorie target.";
    case "logging_days":
      return "Days in the last 30 with at least one meal logged.";
    default:
      return "Measured from your logged data.";
  }
}

export interface GoalRow {
  id: string;
  key: string;
  title: string;
  subtitle: string;
  emoji: string;
  category: string;
  kind: string;
  autoMetric: string | null;
  period: string;
  target: number;
  isCustom: boolean;
}

export interface ComputedGoal {
  id: string;
  key: string;
  title: string;
  subtitle: string;
  emoji: string;
  category: string;
  kind: "auto" | "checkin";
  period: "daily" | "weekly" | "monthly";
  target: number;
  value: number;
  rawValue: number;
  progress: number;
  status: "completed" | "in_progress" | "not_started";
  isCustom: boolean;
  checkedToday: boolean;
  measure: string;
}

/** Per-day nutrient totals indexed by YYYY-MM-DD (only days with meals). */
export interface DayTotals {
  [date: string]: { meals: number; calories: number; sugar: number; sodium: number; fiber: number };
}

/**
 * Compute progress for one goal given the pre-fetched aggregates.
 * value is capped at target for display; rawValue keeps the true number.
 */
export function computeGoal(
  goal: GoalRow,
  ctx: {
    today: string;
    targets: DailyTargets;
    conditions: string[];
    dayTotals: DayTotals;
    veggieDays: Set<string>;
    glassesToday: number;
    checkInDates: Set<string>;
  },
): ComputedGoal {
  const { today, targets, conditions, dayTotals, veggieDays, glassesToday, checkInDates } = ctx;

  // Condition-adaptive wording (same metric either way).
  let title = goal.title;
  let subtitle = goal.subtitle;
  if (goal.key === "sugar") {
    if (conditions.includes("T2DM")) {
      title = "Type 2 Diabetes";
      subtitle = "Manage blood sugar";
    }
  } else if (goal.key === "sodium") {
    if (conditions.includes("CKD")) {
      title = "Chronic Kidney Disease";
      subtitle = "Kidney-friendly diet";
    }
  } else if (goal.key === "fiber") {
    if (conditions.includes("CVD")) {
      title = "Cardiovascular Health";
      subtitle = "Heart-healthy habits";
    }
  }

  const windowDays = goal.period === "daily" ? 1 : goal.period === "monthly" ? 30 : 7;
  // last-N-day keys including today: [today-(N-1) … today]
  const windowKeys: string[] = [];
  for (let i = windowDays - 1; i >= 0; i -= 1) windowKeys.push(daysAgoKey(i));

  let value = 0;
  let checkedToday = false;

  if (goal.kind === "checkin") {
    for (const k of windowKeys) if (checkInDates.has(k)) value += 1;
    checkedToday = checkInDates.has(today);
  } else {
    switch (goal.autoMetric) {
      case "hydration_day":
        value = glassesToday;
        checkedToday = glassesToday >= goal.target;
        break;
      case "veggie_days":
        for (const k of windowKeys) if (veggieDays.has(k)) value += 1;
        break;
      case "sugar_days":
        for (const k of windowKeys) {
          const d = dayTotals[k];
          if (d && d.meals > 0 && d.sugar <= targets.sugar) value += 1;
        }
        break;
      case "sodium_days":
        for (const k of windowKeys) {
          const d = dayTotals[k];
          if (d && d.meals > 0 && d.sodium <= targets.sodium) value += 1;
        }
        break;
      case "fiber_days":
        for (const k of windowKeys) {
          const d = dayTotals[k];
          if (d && d.meals > 0 && d.fiber >= targets.fiber) value += 1;
        }
        break;
      case "calorie_days": {
        const t = targets.calories;
        const tol = t * 0.1;
        for (const k of windowKeys) {
          const d = dayTotals[k];
          if (d && d.meals > 0 && Math.abs(d.calories - t) <= tol) value += 1;
        }
        break;
      }
      case "logging_days":
        for (const k of windowKeys) {
          const d = dayTotals[k];
          if (d && d.meals > 0) value += 1;
        }
        break;
      default:
        value = 0;
    }
  }

  const progress = goal.target > 0 ? Math.min(1, value / goal.target) : 0;
  const status = progress >= 1 ? "completed" : progress > 0 ? "in_progress" : "not_started";

  return {
    id: goal.id,
    key: goal.key,
    title,
    subtitle,
    emoji: goal.emoji,
    category: goal.category,
    kind: goal.kind === "auto" ? "auto" : "checkin",
    period: goal.period === "daily" ? "daily" : goal.period === "monthly" ? "monthly" : "weekly",
    target: goal.target,
    value: Math.min(value, goal.target),
    rawValue: value,
    progress,
    status,
    isCustom: goal.isCustom,
    checkedToday,
    measure: measureFor(goal),
  };
}

/** Fetch all aggregate inputs once, then compute every goal. */
export async function computeAllGoals(userId: string) {
  const today = dayKey(new Date());
  const since30Key = daysAgoKey(29);
  const since7Date = new Date();
  since7Date.setDate(since7Date.getDate() - 6);
  since7Date.setHours(0, 0, 0, 0);
  const since30Date = new Date();
  since30Date.setDate(since30Date.getDate() - 29);
  since30Date.setHours(0, 0, 0, 0);

  const [goals, profile, meals, vegMealFoods, hydrationToday, checkIns] = await Promise.all([
    db.goal.findMany({ where: { userId, archived: false }, orderBy: [{ isCustom: "asc" }, { createdAt: "asc" }] }),
    db.profile.findUnique({ where: { userId } }),
    db.meal.findMany({
      where: { userId, eatenAt: { gte: since30Date } },
      select: { eatenAt: true, totalCalories: true, totalSugar: true, totalSodium: true, totalFiber: true },
    }),
    db.mealFood.findMany({
      where: { meal: { userId, eatenAt: { gte: since7Date } }, food: { category: "vegetable" } },
      select: { meal: { select: { eatenAt: true } } },
    }),
    db.hydrationLog.findFirst({ where: { userId, date: today }, select: { glasses: true } }),
    db.goalCheckIn.findMany({ where: { userId, date: { gte: since30Key } }, select: { goalId: true, date: true } }),
  ]);

  const targets = computeDailyTargets(profile);
  const conditions = safeParseArray(profile?.healthConditions);

  const dayTotals: DayTotals = {};
  for (const m of meals) {
    const k = dayKey(m.eatenAt);
    const agg = dayTotals[k] ?? { meals: 0, calories: 0, sugar: 0, sodium: 0, fiber: 0 };
    agg.meals += 1;
    agg.calories += m.totalCalories;
    agg.sugar += m.totalSugar;
    agg.sodium += m.totalSodium;
    agg.fiber += m.totalFiber;
    dayTotals[k] = agg;
  }

  const veggieDays = new Set(vegMealFoods.map((v) => dayKey(v.meal.eatenAt)));
  // Per-goal check-in dates — never leak one goal's check-ins into another.
  const checkInsByGoal = new Map<string, Set<string>>();
  for (const c of checkIns) {
    let s = checkInsByGoal.get(c.goalId);
    if (!s) {
      s = new Set<string>();
      checkInsByGoal.set(c.goalId, s);
    }
    s.add(c.date);
  }
  const glassesToday = hydrationToday?.glasses ?? 0;

  const computed = goals.map((g) =>
    computeGoal(
      { ...g, isCustom: g.isCustom },
      {
        today,
        targets,
        conditions,
        dayTotals,
        veggieDays,
        glassesToday,
        checkInDates: checkInsByGoal.get(g.id) ?? new Set<string>(),
      },
    ),
  );

  const summary = {
    completed: computed.filter((g) => g.status === "completed").length,
    inProgress: computed.filter((g) => g.status === "in_progress").length,
    notStarted: computed.filter((g) => g.status === "not_started").length,
    total: computed.length,
  };

  return { goals: computed, summary, hydrationToday: glassesToday, hydrationGoal: 8 };
}
