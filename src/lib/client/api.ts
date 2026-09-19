/**
 * Typed fetch wrapper for the NutriSLM SPA.
 * Parses structured backend errors ({ error: { code, message, request_id } }) and
 * throws ApiError with a user-presentable message. NEVER builds nutrition numbers.
 */
import type {
  AnalyzeFoodResponse,
  AuthResponse,
  CoachChatSendResponse,
  CoachChatThreadResponse,
  CoachInsightResponse,
  ConfirmFoodRequest,
  ConfirmFoodResponse,
  DailySummaryResponse,
  FeedbackGetResponse,
  FeedbackSendRequest,
  FeedbackSendResponse,
  HydrationResponse,
  LogMealRequest,
  LogMealResponse,
  MealDeleteResponse,
  MealEditLineInput,
  MealEditResponse,
  MeResponse,
  NextMealResponse,
  ProfileResponse,
  ProfileUpdateInput,
  RecentMealsResponse,
  RelogResponse,
  FoodLibraryResponse,
  FoodDetailResponse,
  WeeklySummaryResponse,
  FavoritesResponse,
  FavoriteCreateResponse,
  FavoriteDeleteResponse,
  FavoriteRenameResponse,
  FavoriteLogResponse,
  WeeklyDigestResponse,
  MilestonesResponse,
  CoachThreadsResponse,
  ActivityCalendarResponse,
  NotesJournalResponse,
  NotesReflectionResponse,
  CoachContextResponse,
  CoachSnapshotResponse,
  CoachChatV2Response,
  CoachThreadV2Response,
  CoachPlanEndpointResponse,
  CoachSwapEndpointResponse,
} from "./types";

export class ApiError extends Error {
  code: string;
  requestId?: string;
  status: number;
  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

// ---------------------------------------------------------------------------
// Global 401 handling: when the session dies (server restart, DB reset, expired
// cookie) every section used to fire its own error toast — a wall of "Please
// sign in to continue". Instead we broadcast ONE `nutrislm:unauthorized`
// window event per burst so the app can return to sign-in gracefully, and we
// expose isSessionExpiring() so the toast system can silence the burst.
// ---------------------------------------------------------------------------

const UNAUTHORIZED_EVENT = "nutrislm:unauthorized";
let authBurstUntil = 0;

/** True while a 401 burst is being handled (the app is heading back to sign-in). */
export function isSessionExpiring(): boolean {
  return typeof window !== "undefined" && Date.now() < authBurstUntil;
}

function notifyUnauthorized(message: string, path: string): void {
  if (typeof window === "undefined") return;
  // Auth endpoints 401 as part of normal flow (bootstrap me(), bad login) —
  // the app handles those locally; never treat them as a session expiry.
  if (path.startsWith("/api/auth/")) return;
  if (Date.now() < authBurstUntil) return;
  authBurstUntil = Date.now() + 4_000;
  window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT, { detail: { message } }));
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Cannot reach the server. Check your connection and try again.");
  }

  if (!res.ok) {
    let code = "UNKNOWN";
    let message = `Request failed (${res.status}).`;
    let requestId: string | undefined;
    try {
      const body = await res.json();
      if (body?.error?.code) code = body.error.code;
      if (body?.error?.message) message = body.error.message;
      if (body?.error?.request_id) requestId = body.error.request_id;
    } catch {
      /* non-JSON error body */
    }
    if (res.status === 401 && code === "UNKNOWN") code = "UNAUTHORIZED";
    if (res.status === 401) notifyUnauthorized(message, path);
    throw new ApiError(res.status, code, message, requestId);
  }
  return (await res.json()) as T;
}

// ---------- Auth ----------

export const api = {
  me: () => request<MeResponse>("/api/auth/me"),
  login: (email: string, password: string) =>
    request<AuthResponse>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  register: (name: string, email: string, password: string) =>
    request<AuthResponse>("/api/auth/register", { method: "POST", body: JSON.stringify({ name, email, password }) }),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),

  getProfile: () => request<ProfileResponse>("/api/profile"),
  updateProfile: (input: ProfileUpdateInput) =>
    request<ProfileResponse>("/api/profile", { method: "PUT", body: JSON.stringify(input) }),

  analyzeFood: (payload: { text?: string; imageDataUrl?: string; hint?: string }) =>
    request<AnalyzeFoodResponse>("/api/nutrition/analyze-food", { method: "POST", body: JSON.stringify(payload) }),
  confirmFood: (payload: ConfirmFoodRequest) =>
    request<ConfirmFoodResponse>("/api/nutrition/confirm-food", { method: "POST", body: JSON.stringify(payload) }),
  logMeal: (payload: LogMealRequest) =>
    request<LogMealResponse>("/api/nutrition/log-meal", { method: "POST", body: JSON.stringify(payload) }),
  recentMeals: () => request<RecentMealsResponse>("/api/nutrition/recent-meals"),
  dailySummary: (date: string) =>
    request<DailySummaryResponse>(`/api/nutrition/daily-summary?date=${encodeURIComponent(date)}`),
  nextMeal: (refresh = false) =>
    request<NextMealResponse>(`/api/nutrition/next-meal${refresh ? "?refresh=1" : ""}`),
  hydration: () => request<HydrationResponse>("/api/nutrition/hydration"),
  hydrationUpdate: (payload: { delta?: number; glasses?: number }) =>
    request<HydrationResponse>("/api/nutrition/hydration", { method: "POST", body: JSON.stringify(payload) }),
  weeklySummary: () => request<WeeklySummaryResponse>("/api/nutrition/weekly-summary"),
  deleteMeal: (mealId: string) =>
    request<MealDeleteResponse>(`/api/nutrition/meals/${encodeURIComponent(mealId)}`, { method: "DELETE" }),
  editMeal: (mealId: string, payload: { foods: MealEditLineInput[]; notes?: string | null; userNotes?: string | null }) =>
    request<MealEditResponse>(`/api/nutrition/meals/${encodeURIComponent(mealId)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  coachInsight: (refresh = false) =>
    request<CoachInsightResponse>(`/api/nutrition/coach-insight${refresh ? "?refresh=1" : ""}`),
  coachChatThread: (threadId?: string) =>
    request<CoachChatThreadResponse>(
      `/api/nutrition/coach-chat${threadId ? `?threadId=${encodeURIComponent(threadId)}` : ""}`,
    ),
  coachChatSend: (message: string, threadId?: string) =>
    request<CoachChatSendResponse>("/api/nutrition/coach-chat", {
      method: "POST",
      body: JSON.stringify({ message, ...(threadId ? { threadId } : {}) }),
    }),
  coachChatThreads: () => request<CoachThreadsResponse>("/api/nutrition/coach-chat/threads"),

  // ---------- AI Coach (context-aware) ----------
  coachContext: () => request<CoachContextResponse>("/api/coach/context"),
  coachSnapshot: () => request<CoachSnapshotResponse>("/api/coach/snapshot"),
  coachChatSendV2: (message: string, threadId?: string) =>
    request<CoachChatV2Response>("/api/coach/chat", {
      method: "POST",
      body: JSON.stringify({ message, ...(threadId ? { threadId } : {}) }),
    }),
  coachChatThreadV2: (threadId?: string) =>
    request<CoachThreadV2Response>(`/api/coach/chat${threadId ? `?threadId=${encodeURIComponent(threadId)}` : ""}`),
  coachDailyPlan: () => request<CoachPlanEndpointResponse>("/api/coach/daily-plan", { method: "POST" }),
  coachPlanRestOfDay: () => request<CoachPlanEndpointResponse>("/api/coach/plan-rest-of-day", { method: "POST" }),
  coachMealSwap: (slot?: string, excludeTemplateId?: string) =>
    request<CoachSwapEndpointResponse>("/api/coach/meal-swap", {
      method: "POST",
      body: JSON.stringify({ ...(slot ? { slot } : {}), ...(excludeTemplateId ? { excludeTemplateId } : {}) }),
    }),
  sendFeedback: (payload: FeedbackSendRequest) =>
    request<FeedbackSendResponse>("/api/nutrition/recommendation-feedback", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getFeedback: (recommendationId: string) =>
    request<FeedbackGetResponse>(
      `/api/nutrition/recommendation-feedback?recommendationId=${encodeURIComponent(recommendationId)}`,
    ),

  // Food library (verified DB — the single source of nutrition truth)
  browseFoods: (params: { q?: string; category?: string; veg?: boolean; page?: number; pageSize?: number }) => {
    const sp = new URLSearchParams();
    if (params.q) sp.set("q", params.q);
    if (params.category) sp.set("category", params.category);
    if (params.veg) sp.set("veg", "true");
    sp.set("page", String(params.page ?? 1));
    sp.set("pageSize", String(params.pageSize ?? 24));
    return request<FoodLibraryResponse>(`/api/foods?${sp.toString()}`);
  },
  foodDetail: (id: string) =>
    request<FoodDetailResponse>(`/api/foods/${encodeURIComponent(id)}`),

  // One-tap re-log of a previously logged meal (server recomputes all numbers)
  relogMeal: (mealId: string) =>
    request<RelogResponse>("/api/nutrition/meals/relog", {
      method: "POST",
      body: JSON.stringify({ mealId }),
    }),

  // Favorites: pinned quick-log meals (same trust model as re-log)
  favorites: () => request<FavoritesResponse>("/api/nutrition/favorites"),
  createFavorite: (mealId: string, name?: string) =>
    request<FavoriteCreateResponse>("/api/nutrition/favorites", {
      method: "POST",
      body: JSON.stringify(name ? { mealId, name } : { mealId }),
    }),
  deleteFavorite: (favoriteId: string) =>
    request<FavoriteDeleteResponse>(`/api/nutrition/favorites/${encodeURIComponent(favoriteId)}`, { method: "DELETE" }),
  renameFavorite: (favoriteId: string, name: string) =>
    request<FavoriteRenameResponse>(`/api/nutrition/favorites/${encodeURIComponent(favoriteId)}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
  logFavorite: (favoriteId: string) =>
    request<FavoriteLogResponse>(`/api/nutrition/favorites/${encodeURIComponent(favoriteId)}/log`, { method: "POST" }),

  // Weekly digest — deterministic report card over the last 7 days
  weeklyDigest: () => request<WeeklyDigestResponse>("/api/nutrition/weekly-digest"),

  // Milestones — deterministic achievements from the database
  milestones: () => request<MilestonesResponse>("/api/nutrition/milestones"),

  // Activity calendar — deterministic per-day heatmap data
  activityCalendar: (weeks = 12) =>
    request<ActivityCalendarResponse>(`/api/nutrition/activity-calendar?weeks=${weeks}`),

  // Notes journal — meal reflection notes + optional AI reflection
  notesJournal: () => request<NotesJournalResponse>("/api/nutrition/notes-journal"),
  notesReflect: () =>
    request<NotesReflectionResponse>("/api/nutrition/notes-journal", {
      method: "POST",
      body: JSON.stringify({}),
    }),

  /**
   * Download the meals CSV via blob so auth errors surface as ApiError instead of
   * navigating to a raw JSON page. Returns the generated object URL (caller must revoke).
   */
  exportCsv: async (days = 7): Promise<{ url: string; filename: string }> => {
    let res: Response;
    try {
      res = await fetch(`/api/nutrition/export?days=${days}`, { credentials: "same-origin", cache: "no-store" });
    } catch {
      throw new ApiError(0, "NETWORK", "Cannot reach the server. Check your connection and try again.");
    }
    if (!res.ok) {
      let code = "UNKNOWN";
      let message = `Export failed (${res.status}).`;
      try {
        const body = await res.json();
        if (body?.error?.code) code = body.error.code;
        if (body?.error?.message) message = body.error.message;
      } catch {
        /* non-JSON error body */
      }
      throw new ApiError(res.status, code, message);
    }
    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") ?? "";
    const match = disposition.match(/filename="?([^";]+)"?/);
    return { url: URL.createObjectURL(blob), filename: match?.[1] ?? `nutrislm-meals-${days}d.csv` };
  },
};

/** Helper for image File -> data URL (client side). */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the selected image."));
    reader.readAsDataURL(file);
  });
}
