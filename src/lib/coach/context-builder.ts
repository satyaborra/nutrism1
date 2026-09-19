/**
 * COACH CONTEXT ENGINE — the AI Coach's memory of the user's nutrition day.
 *
 * Builds ONE structured, verified context object per user request:
 *   profile → health → diet → language → today → meals → nutrition → water →
 *   goals → history → constraints.
 *
 * HARD RULES (mirrors the product spec):
 *  - Every number comes from the deterministic pipeline (MealFood rows,
 *    computeDailyTargets, hydration log). The AI NEVER supplies these.
 *  - The context is cached briefly (45 s) so parallel UI renders do not
 *    regenerate it, and is invalidated on ANY meal/profile/water mutation.
 *  - User isolation: context is always keyed by the authenticated user id.
 */
import { db } from "@/lib/db";
import { getProfileFor, getMealsForDate, mealTotals } from "@/lib/nutrition/meal-service";
import { computeDailyTargets, inferMealSlot, safeParseArray } from "@/lib/nutrition/targets";
import { parseAllergies, evaluateCompliance } from "@/lib/nutrition/disease-engine";
import type { NutrientKey } from "@/lib/nutrition/types";
import type { Profile } from "@prisma/client";

const CACHE_TTL_MS = 45_000;

export type MealSlot = "breakfast" | "lunch" | "snack" | "dinner";

export const SLOT_ORDER: MealSlot[] = ["breakfast", "lunch", "snack", "dinner"];

export function dateKeyOf(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function shiftDateKey(key: string, deltaDays: number): string {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + deltaDays);
  return dateKeyOf(d);
}

export interface CoachContextMeal {
  id: string;
  mealType: string;
  time: string; // HH:MM
  foods: string[];
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
}

export interface NutrientState {
  consumed: number;
  target: number;
  remaining: number;
  pct: number; // 0..1 consumed/target
}

export type CoachNutrition = Record<
  "calories" | "protein" | "carbohydrates" | "fat" | "fiber" | "sugar" | "sodium" | "potassium" | "phosphorus" | "cholesterol" | "saturatedFat",
  NutrientState
>;

export interface CoachContext {
  userId: string;
  date: string;
  current_time: string; // HH:MM
  meal_slot: MealSlot;
  greetingName: string;

  profile: {
    age: number | null;
    sex: string;
    height_cm: number | null;
    weight_kg: number | null;
    activity: string;
    goal: string | null;
  };

  health_conditions: string[];
  diet: {
    type: string;
    cuisine: string | null;
    allergies: string[];
    intolerances: string[];
  };
  language: string; // en | ta | te | hi | kn | rom-*

  nutrition: CoachNutrition;

  meals: CoachContextMeal[]; // today, newest first
  mealsLogged: number; // distinct slots logged today

  water: { glasses: number; target: number; remaining: number };

  history: {
    yesterdayMeals: string[]; // food display names
    recentFoodNames: string[]; // last ~7 days, deduped recent-first
    loggingStreak: number;
    weekAvgCalories: number | null;
    weekTotals: { calories: number; protein: number; meals: number; daysLogged: number };
    recentRecommendationIds: string[]; // last engine picks (diversity)
    lastRecommendation: { templateId: string | null; name: string | null; mealSlot: string | null; reason: string | null } | null;
  };

  compliance: { state: string; violations: { condition: string; nutrient: string; message: string; severity: string; evidenceSource: string }[] };
}

// ------------------------------------------------------------------ cache

interface CacheEntry {
  context: CoachContext;
  profileRow: Profile;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/** Invalidate the cached coach context (call after ANY meal/profile/water/goal mutation). */
export function invalidateCoachContext(userId: string): void {
  cache.delete(userId);
}

// ------------------------------------------------------------------ builder

export async function buildCoachContext(userId: string, now = new Date()): Promise<{ context: CoachContext; profile: Profile }> {
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return { context: cached.context, profile: cached.profileRow };
  }

  const date = dateKeyOf(now);
  const yesterday = shiftDateKey(date, -1);
  const weekAgo = shiftDateKey(date, -6);

  const profile = await getProfileFor(userId);
  const userRow = await db.user.findUnique({ where: { id: userId }, select: { name: true } });

  const [mealsToday, mealsYesterday, recentMeals, hydration, recHistory, weekMeals] = await Promise.all([
    getMealsForDate(userId, date),
    getMealsForDate(userId, yesterday),
    db.meal.findMany({
      where: { userId, eatenAt: { gte: new Date(`${weekAgo}T00:00:00`) } },
      include: { foods: true },
      orderBy: { eatenAt: "desc" },
      take: 60,
    }),
    db.hydrationLog.findUnique({ where: { userId_date: { userId, date } } }),
    db.recommendationHistory.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    // Week aggregation: only scalar columns needed
    db.meal.findMany({
      where: { userId, eatenAt: { gte: new Date(`${weekAgo}T00:00:00`), lte: now } },
      select: { totalCalories: true, totalProtein: true, eatenAt: true },
    }),
  ]);

  const targets = computeDailyTargets(profile);
  const consumed = mealTotals(mealsToday);

  const nutrition = {} as CoachNutrition;
  for (const k of ["calories", "protein", "carbohydrates", "fat", "fiber", "sugar", "sodium", "potassium", "phosphorus", "cholesterol", "saturatedFat"] as NutrientKey[]) {
    const target = targets[k] ?? 0;
    const c = consumed[k];
    nutrition[k as keyof CoachNutrition] = {
      consumed: c,
      target,
      remaining: Math.max(0, target - c),
      pct: target > 0 ? Math.min(1, c / target) : 0,
    };
  }

  const glasses = hydration?.glasses ?? 0;
  const waterTarget = 8;

  // Distinct slots logged today (breakfast/lunch/snack/dinner)
  const loggedSlots = new Set(mealsToday.map((m) => m.mealType));

  // Logging streak: consecutive days (ending today or yesterday) with ≥1 meal
  const byDay = new Map<string, number>();
  for (const m of weekMeals) {
    const k = dateKeyOf(m.eatenAt);
    byDay.set(k, (byDay.get(k) ?? 0) + 1);
  }
  let streak = 0;
  const startOffset = (byDay.get(date) ?? 0) > 0 ? 0 : 1;
  for (let i = startOffset; i < 30; i++) {
    if ((byDay.get(shiftDateKey(date, -i)) ?? 0) > 0) streak += 1;
    else break;
  }

  const activeDays = new Set(weekMeals.map((m) => dateKeyOf(m.eatenAt))).size;
  const weekAvgCalories = activeDays > 0 ? Math.round(weekMeals.reduce((s, m) => s + m.totalCalories, 0) / activeDays) : null;

  const recentFoodNames: string[] = [];
  const seen = new Set<string>();
  for (const m of recentMeals) {
    for (const f of m.foods) {
      if (!seen.has(f.displayName)) {
        seen.add(f.displayName);
        recentFoodNames.push(f.displayName);
      }
    }
  }

  const conditions = safeParseArray(profile.healthConditions);
  const allergies = parseAllergies(profile);
  const intolerances: string[] = []; // no dedicated column yet — reserved for future use

  const dayCompliance = await evaluateCompliance(conditions, consumed, "day");

  const lastRec = recHistory[0] ?? null;
  let lastRecommendation: CoachContext["history"]["lastRecommendation"] = null;
  if (lastRec) {
    let lastName: string | null = null;
    try {
      const summary = JSON.parse(lastRec.candidatesSummary ?? "[]") as { id: string; name: string }[];
      lastName = summary.find((s) => s.id === lastRec.selectedTemplateId)?.name ?? null;
    } catch {
      /* ignore malformed history */
    }
    lastRecommendation = {
      templateId: lastRec.selectedTemplateId,
      name: lastName,
      mealSlot: lastRec.mealSlot,
      reason: lastRec.reason,
    };
  }

  const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  const context: CoachContext = {
    userId,
    date,
    current_time: hhmm(now),
    meal_slot: inferMealSlot(now),
    greetingName: ((userRow?.name ?? "there").split(" ")[0]) || "there",

    profile: {
      age: profile.age ?? null,
      sex: profile.sex ?? "unspecified",
      height_cm: profile.heightCm ?? null,
      weight_kg: profile.weightKg ?? null,
      activity: profile.activityLevel ?? "moderate",
      goal: profile.goal ?? null,
    },

    health_conditions: conditions,
    diet: {
      type: profile.dietaryPreference ?? "vegetarian",
      cuisine: null, // profile-level cuisine preference not modeled yet
      allergies,
      intolerances,
    },
    language: profile.language ?? "en",

    nutrition,
    meals: mealsToday.map((m) => ({
      id: m.id,
      mealType: m.mealType,
      time: hhmm(m.eatenAt),
      foods: m.foods.map((f) => f.displayName),
      calories: m.totalCalories,
      protein: m.totalProtein,
      carbohydrates: m.totalCarbohydrates,
      fat: m.totalFat,
      fiber: m.totalFiber,
      sugar: m.totalSugar,
      sodium: m.totalSodium,
    })),
    mealsLogged: loggedSlots.size,

    water: { glasses, target: waterTarget, remaining: Math.max(0, waterTarget - glasses) },

    history: {
      yesterdayMeals: mealsYesterday.flatMap((m) => m.foods.map((f) => f.displayName)),
      recentFoodNames: recentFoodNames.slice(0, 30),
      loggingStreak: streak,
      weekAvgCalories,
      weekTotals: {
        calories: Math.round(weekMeals.reduce((s, m) => s + m.totalCalories, 0)),
        protein: Math.round(weekMeals.reduce((s, m) => s + m.totalProtein, 0)),
        meals: weekMeals.length,
        daysLogged: activeDays,
      },
      recentRecommendationIds: recHistory.map((r) => r.selectedTemplateId).filter((x): x is string => !!x),
      lastRecommendation,
    },

    compliance: {
      state: dayCompliance.state,
      violations: dayCompliance.violations.map((v) => ({
        condition: v.condition, nutrient: v.nutrient, message: v.message, severity: v.severity, evidenceSource: v.evidenceSource,
      })),
    },
  };

  cache.set(userId, { context, profileRow: profile, expiresAt: Date.now() + CACHE_TTL_MS });
  return { context, profile };
}

/** Cached variant for read-heavy callers (UI snapshot, chat). */
export async function getCoachContext(userId: string): Promise<{ context: CoachContext; profile: Profile }> {
  return buildCoachContext(userId);
}

/** Remaining meal slots for "plan the rest of my day", ordered by slot time. */
export function remainingSlots(ctx: CoachContext, loggedTypes: Set<string>): MealSlot[] {
  const currentIdx = SLOT_ORDER.indexOf(ctx.meal_slot);
  return SLOT_ORDER.filter((s, i) => !loggedTypes.has(s) && i >= currentIdx);
}
