/**
 * Typed API contract for the NutriSLM frontend.
 * Mirrors the backend responses exactly (see src/lib/nutrition/types.ts, api routes).
 */

export const NUTRIENT_KEYS = [
  "calories", "protein", "carbohydrates", "fat", "fiber",
  "sugar", "sodium", "potassium", "phosphorus", "cholesterol", "saturatedFat",
] as const;

export type NutrientKey = (typeof NUTRIENT_KEYS)[number];
export type NutritionValues = Record<NutrientKey, number>;

export type MealType = "breakfast" | "lunch" | "snack" | "dinner";
export type MatchStatus = "matched" | "ambiguous" | "unmatched";
export type QuantitySource = "user" | "estimated" | "unknown";
export type ComplianceState = "COMPLIANT" | "POTENTIALLY_NON_COMPLIANT" | "INDETERMINATE";
export type LangCode = "en" | "ta" | "te" | "hi" | "kn";

export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type Goal = "lose_weight" | "maintain" | "gain_muscle";
export type DietaryPreference = "vegetarian" | "vegan" | "eggetarian" | "non_vegetarian";
export type HealthCondition = "T2DM" | "CKD" | "CVD";
export type Allergen = "dairy" | "nuts" | "peanuts" | "gluten" | "egg" | "fish" | "soy";

// ---------- Auth ----------

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface AuthProfileBrief {
  language: LangCode;
  dietaryPreference: string;
  healthConditions: string[];
  allergies: string[];
}

export interface MeResponse {
  user: User;
  profile: AuthProfileBrief | null;
}

export interface AuthResponse {
  user: User;
}

// ---------- Profile ----------

export interface ComputedTargets {
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
  bmr: number;
  tdee: number;
}

export interface ProfileData {
  age: number | null;
  sex: string | null;
  heightCm: number | null;
  weightKg: number | null;
  activityLevel: ActivityLevel | null;
  goal: Goal | null;
  dietaryPreference: DietaryPreference;
  allergies: string[];
  healthConditions: string[];
  language: LangCode;
  calorieTargetOverride: number | null;
  proteinTargetOverride: number | null;
}

export interface ProfileResponse {
  profile: ProfileData;
  computedTargets: ComputedTargets;
  targetNotes: string[];
}

export interface ProfileUpdateInput {
  age?: number | null;
  sex?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
  activityLevel?: string | null;
  goal?: string | null;
  dietaryPreference?: string;
  allergies?: string[];
  healthConditions?: string[];
  language?: string;
  calorieTargetOverride?: number | null;
  proteinTargetOverride?: number | null;
}

// ---------- Foods ----------

export interface FoodSearchItem {
  id: string;
  name: string;
  category: string;
  servingUnit: string;
  isVeg: boolean;
  allergens: string[];
}

export interface FoodSearchResponse {
  foods: FoodSearchItem[];
}

// ---------- Analyze / confirm / log ----------

export interface DetectedLanguage {
  language: string;
  script: string;
  confidence: number;
  method: string;
}

export interface DetectedFood {
  lineId: string;
  originalName: string;
  displayName: string;
  foodId: string | null;
  matchStatus: MatchStatus;
  candidates?: { foodId: string; name: string }[];
  quantity: number;
  unit: string;
  preparation?: string | null;
  confidence: number;
  quantitySource: QuantitySource;
  language?: string;
}

export interface AnalyzeFoodResponse {
  analysisId: string;
  draftId: string;
  status: string;
  detectedLanguage: DetectedLanguage;
  mealTypeGuess: string;
  foods: DetectedFood[];
  aiOk: boolean;
  aiNote: string | null;
  aiLatencyMs: number | null;
}

export interface ConfirmFoodLine {
  lineId: string;
  foodId: string | null;
  displayName: string;
  originalName: string | null;
  quantity: number;
  unit: string;
  preparation: string | null;
  confidence: number | null;
  quantitySource: string;
  nutrition: NutritionValues;
  source: string | null;
  perReference: string | null;
  conversionNote: string | null;
}

export interface ConfirmFoodRequest {
  draftId: string;
  mealType: string;
  foods: {
    lineId: string;
    foodId?: string | null;
    name: string;
    quantity: number;
    unit: string;
    preparation?: string | null;
  }[];
}

export interface ConfirmFoodResponse {
  draftId: string;
  mealType: string;
  foods: ConfirmFoodLine[];
  totals: NutritionValues;
  compliance: Compliance;
  incomplete: boolean;
  note: string | null;
}

export interface LogMealItemInput {
  foodId?: string | null;
  name: string;
  quantity: number;
  unit: string;
  preparation?: string | null;
}

export interface LogMealRequest {
  requestId: string;
  draftId?: string;
  mealType: string;
  foods: LogMealItemInput[];
  notes?: string;
  source?: "text" | "image" | "manual" | "recommendation";
  /** ISO datetime — only sent for backfilled (past-day) logs; omitted = "now". */
  eatenAt?: string;
}

export interface ConstraintViolation {
  condition: string;
  nutrient: string;
  message: string;
  severity: string;
  evidenceSource: string;
}

export interface Compliance {
  state: ComplianceState;
  violations: ConstraintViolation[];
}

export interface MealFoodSummary {
  name: string;
  quantity: number;
  unit: string;
  nutrition: Partial<NutritionValues>;
}

export interface MealSummary {
  id: string;
  mealType: string;
  eatenAt: string;
  foods: MealFoodSummary[];
  totals: Partial<NutritionValues>;
}

export interface LogMealResponse {
  mealId: string;
  duplicate: boolean;
  meal: MealSummary;
  totals: NutritionValues;
  compliance: Compliance;
  recommendationInvalidated: boolean;
}

// ---------- Meals / daily summary ----------

export interface MealFoodDetail {
  id: string;
  foodId: string | null;
  name: string;
  originalName: string | null;
  quantity: number;
  unit: string;
  preparation: string | null;
  confidence: number | null;
  quantitySource: string;
  nutrition: NutritionValues;
}

export interface MealDetail {
  id: string;
  mealType: string;
  source: string | null;
  notes: string | null;
  /** User-authored reflection ("why I ate / how I felt") — display only. */
  userNotes?: string | null;
  eatenAt: string;
  loggedAt: string;
  foods: MealFoodDetail[];
  totals: NutritionValues;
  compliance?: Compliance;
}

export interface RecentMealsResponse {
  meals: MealDetail[];
  count: number;
}

export interface DailySummaryResponse {
  date: string;
  mealSlot: string;
  meals: MealDetail[];
  consumed: NutritionValues;
  targets: NutritionValues;
  remaining: NutritionValues;
  compliance: Compliance;
  healthConditions: string[];
  language: string;
}

// ---------- Next-meal recommendation ----------

export interface RecommendationItem {
  foodId: string;
  name: string;
  quantity: number;
  unit: string;
  perReference: string;
}

export interface CandidateViolation {
  nutrient: string;
  message: string;
  severity: string;
  evidenceSource: string;
}

export interface RecommendationCandidate {
  id: string;
  name: string;
  description: string;
  items: RecommendationItem[];
  nutrition: NutritionValues;
  score: number;
  dietTags: string[];
  cuisine: string;
  violations: CandidateViolation[];
  indeterminate: boolean;
}

export interface EvidenceChunk {
  evidence_id: string;
  source: string;
  document: string;
  section: string;
  text: string;
  score: number;
}

export interface NextMealResponse {
  recommendationId: string;
  generatedAt: string;
  mealSlot: string;
  engineSource: "ai" | "deterministic_fallback";
  selected: RecommendationCandidate;
  alternatives: RecommendationCandidate[];
  explanation: string;
  keyFactors: string[];
  evidence: EvidenceChunk[];
  feedbackSignal?: { down: number; up: number } | null;
  contextSummary: {
    conditions: string[];
    dietaryPreference: string;
    remainingToday: NutritionValues;
    targets: NutritionValues;
  };
  aiNote: string | null;
}

// ---------- Hydration / weekly trends ----------

export interface HydrationResponse {
  date: string;
  glasses: number;
  goal: number;
  ml: number;
}

export interface WeeklyDay {
  date: string;
  calories: number;
  protein: number;
  fiber: number;
  sugar: number;
  sodium: number;
  meals: number;
  onTarget: boolean;
}

export interface WeeklySummaryResponse {
  days: WeeklyDay[];
  streak: number;
  targets: { calories: number; protein: number };
  weekTotals: { calories: number; protein: number; meals: number; daysLogged: number };
  avgCalories: number;
}

// ---------- AI coach / meal management ----------

export interface CoachInsightResponse {
  headline: string;
  insight: string;
  focus: string[];
  evidenceSources: string[];
  engineSource: "ai" | "deterministic_fallback";
  generatedAt: string;
  stale: boolean;
  aiNote: string | null;
}

export interface MealDeleteResponse {
  ok: boolean;
  deletedMealId: string;
  removedCalories: number;
  removedFoods: number;
  recommendationInvalidated: boolean;
}

export interface MealEditLineInput {
  lineId: string;
  quantity?: number;
  unit?: string;
  remove?: boolean;
}

export interface MealEditConversionNote {
  lineId: string;
  food: string;
  note: string;
  exact: boolean;
}

export interface MealEditResponse {
  ok: boolean;
  editedMealId: string;
  previousCalories: number;
  totals: NutritionValues;
  foodsCount: number;
  userNotes?: string | null;
  conversionNotes: MealEditConversionNote[];
  recommendationInvalidated: boolean;
}

// ---------- Recommendation feedback ----------

export type FeedbackRating = "up" | "down";
export type FeedbackReason =
  | "too_many_carbs"
  | "not_filling"
  | "not_my_cuisine"
  | "portion_off"
  | "allergy_concern"
  | "other";

export interface FeedbackSendRequest {
  recommendationId: string;
  candidateId?: string;
  mealSlot?: string;
  rating: FeedbackRating;
  reason?: FeedbackReason;
}

export interface FeedbackSendResponse {
  ok: boolean;
  feedback: {
    recommendationId: string;
    rating: FeedbackRating;
    reason: FeedbackReason | null;
    updatedAt: string;
  };
}

export interface FeedbackGetResponse {
  feedback: { recommendationId: string; rating: FeedbackRating; reason: FeedbackReason | null } | null;
}

export const FEEDBACK_REASON_LABELS: Record<FeedbackReason, string> = {
  too_many_carbs: "Too many carbs for me",
  not_filling: "Wouldn't fill me up",
  not_my_cuisine: "Not my cuisine/taste",
  portion_off: "Portion size is off",
  allergy_concern: "Allergy concern",
  other: "Something else",
};

// ---------- Health ----------

export interface CoachChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface CoachChatThreadResponse {
  threadId: string | null;
  messages: CoachChatMessage[];
}

export interface CoachChatSendResponse {
  threadId: string;
  reply: CoachChatMessage;
  engineSource: "ai" | "deterministic_fallback";
}

export interface CoachThreadSummary {
  threadId: string;
  title: string;
  messageCount: number;
  lastActivity: string;
  startedAt: string;
}

export interface CoachThreadsResponse {
  threads: CoachThreadSummary[];
  count: number;
}

export interface HealthResponse {
  status: string;
  service?: string;
  database: string;
  dbLatencyMs?: number;
  seed: { foods: number; evidence: number; templates: number; constraints: number };
  time?: string;
}

// ---------- Food library (browse + detail) ----------

export interface FoodLibraryItem {
  id: string;
  name: string;
  category: string;
  servingUnit: string;
  isVeg: boolean;
  containsEgg?: boolean;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  allergens: string[];
}

export interface FoodLibraryResponse {
  foods: FoodLibraryItem[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  /** Facets computed across ALL rows matching the query (not just this page). */
  facets?: {
    categories: string[];
    vegCount: number;
  };
}

export interface FoodDetailResponse {
  food: {
    id: string;
    name: string;
    category: string;
    isVeg: boolean;
    containsEgg: boolean;
    servingSize: number;
    servingUnit: string;
    source: string;
    sourceReference: string | null;
    tags: string[];
    allergens: string[];
    aliases: { alias: string; language: string; isPrimary: boolean }[];
    nutrients: {
      calories: number;
      protein: number;
      carbohydrates: number;
      fat: number;
      saturatedFat: number;
      fiber: number;
      sugar: number;
      sodium: number;
      potassium: number;
      phosphorus: number;
      cholesterol: number;
    };
    per100g: {
      estimated: boolean;
      basisNote: string;
      calories: number;
      protein: number;
      carbohydrates: number;
      fat: number;
      saturatedFat: number;
      fiber: number;
      sugar: number;
      sodium: number;
      potassium: number;
      phosphorus: number;
      cholesterol: number;
    };
  };
}

export const FOOD_LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  ta: "தமிழ்",
  te: "తెలుగు",
  hi: "हिन्दी",
  kn: "ಕನ್ನಡ",
  rom: "Romanized",
};

// ---------- Log again (re-log a previous meal) ----------

export interface RelogResponse {
  ok: boolean;
  mealId: string;
  totals: NutritionValues;
  source: string;
  recommendationInvalidated: boolean;
}

// ---------- Favorites (pinned quick-log meals) ----------

export interface FavoriteItem {
  id: string;
  name: string;
  mealType: string;
  itemCount: number;
  itemNames: string[];
  /** Deterministic server estimate (matched recomputed from DB, unmatched snapshot). */
  estimateKcal: number;
  useCount: number;
  sourceMealId: string | null;
}

export interface FavoritesResponse {
  favorites: FavoriteItem[];
  count: number;
}

export interface FavoriteCreateResponse {
  ok: boolean;
  favorite: FavoriteItem;
  snapshotCalories: number;
}

export interface FavoriteDeleteResponse {
  ok: boolean;
  id: string;
}

export interface FavoriteRenameResponse {
  ok: boolean;
  favorite: { id: string; name: string };
}

export interface FavoriteLogResponse {
  ok: boolean;
  mealId: string;
  mealType: string;
  name: string;
  totals: NutritionValues;
  source: string;
  compliance: Compliance;
  recommendationInvalidated: boolean;
}

// ---------- Weekly digest (deterministic report card) ----------

export type DigestGrade = "great" | "good" | "watch" | "off";

export interface DigestMetric {
  key: string;
  label: string;
  unit: string;
  avg: number | null;
  target: number | null;
  direction: "under" | "over" | "atLeast";
  grade: DigestGrade;
  score: number | null;
}

export interface WeeklyDigestResponse {
  weekOf: string;
  daysLogged: number;
  metrics: DigestMetric[];
  /** % of logged days within ±10% of the calorie target. */
  adherence: number;
  bestDay: { date: string; calories: number; deltaPct: number } | null;
  worstSodiumDay: { date: string; sodium: number } | null;
  topFoods: { name: string; count: number }[];
  comparison: {
    available: boolean;
    caloriesDelta: number | null;
    proteinDelta: number | null;
    mealsDelta: number;
  };
  hydration: { avgGlasses: number | null; mlPerGlass: number; goal: number };
  evidence: { source: string; document: string; section: string; text: string } | null;
  targets: { calories: number; protein: number };
}

// ---------- Milestones (deterministic achievements) ----------

export interface Milestone {
  id: string;
  label: string;
  description: string;
  icon: string;
  value: number;
  goal: number;
  achieved: boolean;
  /** 0..1 — how far along this milestone is. */
  progress: number;
}

export interface MilestonesResponse {
  milestones: Milestone[];
  achievedCount: number;
  totalCount: number;
  stats: {
    totalMeals: number;
    loggingStreak: number;
    daysLogged90d: number;
    hydrationHeroDays: number;
    foodsTried: number;
  };
}

// ---------- Activity calendar (deterministic heatmap) ----------

export interface ActivityCalendarMeal {
  id: string;
  mealType: string;
  kcal: number;
  foods: string;
}

export interface ActivityDay {
  date: string;
  meals: number;
  calories: number;
  water: number;
  items: ActivityCalendarMeal[];
}

export interface ActivityCalendarResponse {
  weeks: number;
  start: string;
  today: string;
  days: ActivityDay[];
  calorieTarget: number;
  streak: number;
  activeDays: number;
}

// ---------- Notes journal (meal reflections) ----------

export interface JournalNote {
  id: string;
  date: string;
  mealType: string;
  note: string;
  moods: string[];
}

export interface NotesJournalResponse {
  notes: JournalNote[];
  stats: {
    total: number;
    last7: number;
    last30: number;
    topMood: string | null;
    moodCounts: { mood: string; count: number }[];
  };
}

export interface NotesReflectionResponse {
  headline: string;
  reflection: string;
  suggestions: string[];
  engineSource: "ai" | "deterministic_fallback";
  generatedAt: string;
  aiNote: string | null;
}

// ============ AI COACH (context-aware) ============

export interface CoachNutrientState {
  consumed: number;
  target: number;
  remaining: number;
  pct: number;
}

export interface CoachContextMeal {
  id: string;
  mealType: string;
  time: string;
  foods: string[];
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
}

export interface CoachNutritionState {
  calories: CoachNutrientState;
  protein: CoachNutrientState;
  carbohydrates: CoachNutrientState;
  fat: CoachNutrientState;
  fiber: CoachNutrientState;
  sugar: CoachNutrientState;
  sodium: CoachNutrientState;
  potassium: CoachNutrientState;
  phosphorus: CoachNutrientState;
  cholesterol: CoachNutrientState;
  saturatedFat: CoachNutrientState;
}

export interface CoachContextPayload {
  userId: string;
  date: string;
  current_time: string;
  meal_slot: string;
  greetingName: string;
  profile: { age: number | null; sex: string; height_cm: number | null; weight_kg: number | null; activity: string; goal: string | null };
  health_conditions: string[];
  diet: { type: string; cuisine: string | null; allergies: string[]; intolerances: string[] };
  language: string;
  nutrition: CoachNutritionState;
  meals: CoachContextMeal[];
  mealsLogged: number;
  water: { glasses: number; target: number; remaining: number };
  history: {
    yesterdayMeals: string[];
    recentFoodNames: string[];
    loggingStreak: number;
    weekAvgCalories: number | null;
    weekTotals: { calories: number; protein: number; meals: number; daysLogged: number };
    recentRecommendationIds: string[];
    lastRecommendation: { templateId: string | null; name: string | null; mealSlot: string | null; reason: string | null } | null;
  };
  compliance: { state: string; violations: { condition: string; nutrient: string; message: string; severity: string; evidenceSource: string }[] };
}

export interface CoachContextResponse {
  context: CoachContextPayload;
}

export interface CoachSnapshotResponse {
  date: string;
  greeting: string;
  mealsLogged: number;
  mealsTotal: number;
  calories: { consumed: number; target: number; remaining: number; pct: number };
  protein: { consumed: number; target: number; remaining: number; pct: number };
  fiber: { consumed: number; target: number; remaining: number; pct: number };
  water: { glasses: number; target: number; remaining: number };
  nextSlot: string | null;
  priorities: string[];
  streak: number;
  summaryLine: string;
}

export interface CoachRecommendationCard {
  kind: "recommendation";
  slot: string;
  candidateId: string;
  name: string;
  items: { foodId: string; name: string; quantity: number; unit: string }[];
  nutrition: { calories: number; protein: number; carbs: number; fat: number; fiber: number };
  reason: string;
  keyFactors: string[];
  alternatives: { candidateId: string; name: string; calories: number }[];
  engineSource: "ai" | "deterministic_fallback";
}

export interface CoachPlanCard {
  kind: "plan";
  slots: {
    slot: string;
    label: string;
    status: "logged" | "recommended" | "skipped";
    time?: string;
    name?: string;
    foods?: string[];
    items?: { foodId: string; name: string; quantity: number; unit: string }[];
    calories?: number;
    reason?: string;
    candidateId?: string;
  }[];
  overview: { label: string; value: string }[];
  summary: string;
}

export interface CoachGapsCard {
  kind: "gaps";
  items: { label: string; consumed: number; target: number; pct: number; unit: string; tone: "low" | "ok" | "high" }[];
}

export interface CoachWaterCard {
  kind: "water";
  glasses: number;
  target: number;
  remaining: number;
}

export interface CoachEvidenceCard {
  kind: "evidence";
  sources: { id: string; source: string; title: string; snippet: string }[];
}

export interface CoachHistoryCard {
  kind: "history";
  title: string;
  lines: { label: string; value: string }[];
}

export type CoachCard =
  | CoachRecommendationCard
  | CoachPlanCard
  | CoachGapsCard
  | CoachWaterCard
  | CoachEvidenceCard
  | CoachHistoryCard;

export interface CoachChatV2Response {
  threadId: string;
  intent: string;
  message: { id: string; role: "assistant"; content: string; createdAt: string };
  cards: CoachCard[];
  engineSource: "ai" | "deterministic_fallback";
}

export interface CoachThreadV2Response {
  threadId: string | null;
  messages: { id: string; role: "user" | "assistant"; content: string; intent: string | null; createdAt: string }[];
}

export interface CoachPlanEndpointResponse {
  date: string;
  card: CoachPlanCard;
  text: string;
}

export interface CoachSwapEndpointResponse {
  card: CoachRecommendationCard;
  text: string;
}
