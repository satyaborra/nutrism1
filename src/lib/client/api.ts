/**
 * Typed fetch wrapper for the NutriSLM SPA.
 * Parses structured backend errors ({ error: { code, message, request_id } }) and
 * throws ApiError with a user-presentable message. NEVER builds nutrition numbers.
 */
import type {
  AnalyzeFoodResponse,
  AuthResponse,
  ConfirmFoodRequest,
  ConfirmFoodResponse,
  DailySummaryResponse,
  LogMealRequest,
  LogMealResponse,
  MeResponse,
  NextMealResponse,
  ProfileResponse,
  ProfileUpdateInput,
  RecentMealsResponse,
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
