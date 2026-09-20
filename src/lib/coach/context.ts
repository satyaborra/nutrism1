/**
 * Coach Context Engine — the single source of verified context for the AI Coach.
 *
 * Gathered from the DETERMINISTIC backend (never from a model):
 *   profile + health conditions + diet/allergies + language
 *   today's meals per slot + consumed/remaining vs targets
 *   hydration + week aggregates + recent recommendations
 *
 * Cached in memory per user with a short TTL and explicit invalidation — every
 * mutating route (meal/profile/goal/hydration/favorite) calls
 * invalidateCoachContext(userId) so the coach NEVER sees stale data (spec §18/§36).
 */
import { db } from "@/lib/db";
import { getProfileFor, getMealsForDate, mealTotals } from "@/lib/nutrition/meal-service";
import { computeDailyTargets, safeParseArray, inferMealSlot } from "@/lib/nutrition/targets";
import { zeroNutrition, type NutritionValues, type NutrientKey } from "@/lib/nutrition/types";
import { round } from "@/lib/format";

const TTL_MS = 30_000; // safety net; explicit invalidation is the primary mechanism

interface CacheEntry {
  builtAt: number;
  context: CoachContext;
}

const cache = new Map<string, CacheEntry>();

export function invalidateCoachContext(userId: string) {
  cache.delete(userId);
}

// ---------- public shapes ----------

export interface CoachNutrientLine {
  consumed: number;
  target: number;
  remaining: number;
  pct: number; // 0..100+ consumed vs target
}

export interface CoachMealLine {
  id: string;
  mealType: string;
  name: string; // foods joined
  kcal: number;
  protein: number;
  fiber: number;
  time: string; // HH:MM
  source: string;
}

export interface CoachContext {
  date: string;
  timeLabel: string;
  greeting: string;
  mealSlot: string;

  profile: {
    name: string;
    age: number | null;
    sex: string | null;
    heightCm: number | null;
    weightKg: number | null;
    activityLevel: string | null;
    goal: string | null;
  };
  healthConditions: string[];
  diet: { type: string; allergies: string[] };
  language: string;

  meals: CoachMealLine[];
  mealsLogged: number;
  slotsLogged: string[];
  /** Full deterministic day totals (all nutrients) — used for plan projections. */
  consumedTotals: NutritionValues;

  nutrition: Record<
    | "calories"
    | "protein"
    | "carbohydrates"
    | "fat"
    | "fiber"
    | "sugar"
    | "sodium"
    | "potassium"
    | "phosphorus"
    | "cholesterol"
    | "saturatedFat",
    CoachNutrientLine
  >;

  water: { glasses: number; target: number };

  week: {
    daysLogged: number;
    avgCalories: number;
    streak: number;
    topRepeat: { name: string; count: number } | null;
  };

  recentRecommendations: string[];

  /** Raw deterministic values for the responder validator (allowed number set). */
  _allowedNumbers: number[];
}

// ---------- helpers ----------

function dateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function greetingFor(name: string, d = new Date()): string {
  const h = d.getHours();
  const part = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
  return `Good ${part}, ${name || "there"} 👋`;
}

const SLOT_TIMES: Record<string, string> = { breakfast: "08:00", lunch: "13:00", snack: "16:30", dinner: "20:00" };

export function slotTime(slot: string): string {
  return SLOT_TIMES[slot] ?? "";
}

export const DAY_SLOTS = ["breakfast", "lunch", "snack", "dinner"] as const;

function line(consumed: number, target: number): CoachNutrientLine {
  const consumedR = round(consumed, consumed >= 100 ? 0 : 1);
  return {
    consumed: consumedR,
    target: round(target, 0),
    remaining: round(Math.max(0, target - consumed), consumed >= 100 ? 0 : 1),
    pct: target > 0 ? Math.round((consumed / target) * 100) : 0,
  };
}

// ---------- builder ----------

async function buildCoachContext(userId: string, userName: string): Promise<CoachContext> {
  const now = new Date();
  const today = dateKey(now);
  const profile = await getProfileFor(userId);
  const targets = computeDailyTargets(profile);
  const meals = await getMealsForDate(userId, today);
  const consumed = mealTotals(meals);

  const remaining = zeroNutrition();
  for (const k of Object.keys(consumed) as NutrientKey[]) {
    remaining[k] = Math.max(0, (targets[k] ?? 0) - consumed[k]);
  }

  const hydration = await db.hydrationLog.findUnique({ where: { userId_date: { userId, date: today } } });
  const conditions = safeParseArray(profile.healthConditions);
  const allergies = safeParseArray(profile.allergies);

  const nutrition = {
    calories: line(consumed.calories, targets.calories),
    protein: line(consumed.protein, targets.protein),
    carbohydrates: line(consumed.carbohydrates, targets.carbohydrates),
    fat: line(consumed.fat, targets.fat),
    fiber: line(consumed.fiber, targets.fiber),
    sugar: line(consumed.sugar, targets.sugar),
    sodium: line(consumed.sodium, targets.sodium),
    potassium: line(consumed.potassium, targets.potassium),
    phosphorus: line(consumed.phosphorus, targets.phosphorus),
    cholesterol: line(consumed.cholesterol, targets.cholesterol),
    saturatedFat: line(consumed.saturatedFat, targets.saturatedFat),
  };

  const mealLines: CoachMealLine[] = meals
    .slice()
    .sort((a, b) => a.eatenAt.getTime() - b.eatenAt.getTime())
    .map((m) => ({
      id: m.id,
      mealType: m.mealType,
      name: m.foods.map((f) => f.displayName).join(" + ") || m.notes || "Logged meal",
      kcal: Math.round(m.totalCalories),
      protein: round(m.totalProtein, 0),
      fiber: round(m.totalFiber, 0),
      time: m.eatenAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }),
      source: m.source,
    }));

  const slotsLogged = [...new Set(meals.map((m) => m.mealType))];

  // Week aggregates (deterministic DB aggregation)
  const weekStart = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
  weekStart.setHours(0, 0, 0, 0);
  const weekMeals = await db.meal.findMany({
    where: { userId, eatenAt: { gte: weekStart } },
    select: { eatenAt: true, totalCalories: true, foods: { select: { displayName: true } } },
  });
  const daySet = new Set(weekMeals.map((m) => dateKey(m.eatenAt)));
  const weekDaysLogged = daySet.size;
  const weekAvgCalories =
    weekDaysLogged > 0 ? Math.round(weekMeals.reduce((s, m) => s + m.totalCalories, 0) / weekDaysLogged) : 0;

  // streak: consecutive logged days ending today (or yesterday)
  let streak = 0;
  const cursor = new Date(now);
  if (!daySet.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (daySet.has(dateKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  // most-repeated food this week
  const nameCount = new Map<string, number>();
  for (const m of weekMeals) for (const f of m.foods) nameCount.set(f.displayName, (nameCount.get(f.displayName) ?? 0) + 1);
  let topRepeat: CoachContext["week"]["topRepeat"] = null;
  for (const [name, count] of nameCount) if (count > 1 && (!topRepeat || count > topRepeat.count)) topRepeat = { name, count };

  const recentRecs = await db.recommendationHistory.findMany({
    where: { userId, createdAt: { gte: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000) } },
    orderBy: { createdAt: "desc" },
    take: 8,
  });
  const recentRecommendations = recentRecs
    .map((r) => {
      try {
        const s = JSON.parse(r.candidatesSummary ?? "[]") as { id: string; name: string }[];
        return s.find((x) => x.id === r.selectedTemplateId)?.name ?? "";
      } catch {
        return "";
      }
    })
    .filter(Boolean);

  // Allowed numbers for the reply validator: every value the model may quote.
  const allowedNumbers = new Set<number>();
  for (const nl of Object.values(nutrition)) {
    for (const v of [nl.consumed, nl.target, nl.remaining, nl.pct]) {
      allowedNumbers.add(Math.round(v));
      allowedNumbers.add(round(v, 1));
    }
  }
  allowedNumbers.add(hydration?.glasses ?? 0);
  allowedNumbers.add(8); // water target
  for (const m of mealLines) for (const v of [m.kcal, m.protein, m.fiber]) allowedNumbers.add(v);
  allowedNumbers.add(weekDaysLogged);
  allowedNumbers.add(weekAvgCalories);
  allowedNumbers.add(streak);
  allowedNumbers.add(mealLines.length);
  for (const v of [7, 4, 3, 2, 1, 0, 100, 5, 6, 10, 11, 13, 16, 20, 14, 250]) allowedNumbers.add(v); // ordinals, slot hours, glass ml

  return {
    date: today,
    timeLabel: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }),
    greeting: greetingFor(userName, now),
    mealSlot: inferMealSlot(now),
    profile: {
      name: userName,
      age: profile.age,
      sex: profile.sex,
      heightCm: profile.heightCm,
      weightKg: profile.weightKg,
      activityLevel: profile.activityLevel,
      goal: profile.goal,
    },
    healthConditions: conditions,
    diet: { type: profile.dietaryPreference, allergies },
    language: profile.language,
    meals: mealLines,
    mealsLogged: mealLines.length,
    slotsLogged,
    consumedTotals: consumed,
    nutrition,
    water: { glasses: hydration?.glasses ?? 0, target: 8 },
    week: { daysLogged: weekDaysLogged, avgCalories: weekAvgCalories, streak, topRepeat },
    recentRecommendations,
    _allowedNumbers: [...allowedNumbers].filter((n) => Number.isFinite(n)),
  };
}

export async function getCoachContext(userId: string, userName: string): Promise<CoachContext> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.builtAt < TTL_MS) return hit.context;
  const context = await buildCoachContext(userId, userName);
  cache.set(userId, { builtAt: Date.now(), context });
  return context;
}

/** Slots for the whole day with their plan status (logged / passed). */
export function daySlotStatuses(ctx: CoachContext): { slot: string; logged: boolean; passed: boolean }[] {
  const order = [...DAY_SLOTS];
  const currentIdx = order.indexOf(ctx.mealSlot as (typeof DAY_SLOTS)[number]);
  return order.map((slot, i) => ({
    slot,
    logged: ctx.slotsLogged.includes(slot),
    passed: i < currentIdx,
  }));
}
