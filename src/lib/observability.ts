/**
 * Structured observability: request-scoped logging + audit trail.
 * Never logs secrets, API keys, passwords, or unnecessary raw health data.
 */
import { db } from "@/lib/db";

export type Operation =
  | "auth_register" | "auth_login" | "auth_logout" | "auth_me"
  | "analyze_food" | "confirm_food" | "log_meal"
  | "recent_meals" | "daily_summary" | "next_meal"
  | "profile_get" | "profile_put" | "foods_search" | "health_check"
  | "meal_delete" | "meal_edit" | "recommendation_feedback" | "recommendation_feedback_get"
  | "hydration_get" | "hydration_post" | "weekly_summary"
  | "coach_insight" | "coach_chat" | "coach_chat_get" | "coach_chat_threads" | "nutrition_export"
  | "foods_browse" | "food_detail" | "meal_relog"
  | "favorites_list" | "favorites_create" | "favorites_delete" | "favorites_log" | "favorites_rename"
  | "weekly_digest" | "milestones"
  | "activity_calendar" | "notes_journal" | "notes_journal_reflect"
  | "coach_context" | "coach_snapshot" | "coach_chat_v2" | "coach_daily_plan" | "coach_plan_rest_of_day" | "coach_meal_swap";

export interface RequestContext {
  requestId: string;
  operation: Operation;
  userId?: string;
  startTime: number;
}

export function newRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function startRequest(operation: Operation, requestId: string): RequestContext {
  return { requestId, operation, startTime: Date.now() };
}

/** Structured console log (JSON line). */
function log(level: "info" | "warn" | "error", ctx: RequestContext, msg: string, meta?: Record<string, unknown>) {
  const line = {
    ts: new Date().toISOString(),
    level,
    request_id: ctx.requestId,
    user_id: ctx.userId ?? undefined,
    operation: ctx.operation,
    latency_ms: Date.now() - ctx.startTime,
    msg,
    ...(meta ? { meta } : {}),
  };
  const serialized = JSON.stringify(line);
  if (level === "error") console.error(serialized);
  else if (level === "warn") console.warn(serialized);
  else console.log(serialized);
}

/** Persist audit entry (fire-and-forget; never throws into request path). */
export function audit(ctx: RequestContext, status: "ok" | "error", errorType?: string, meta?: Record<string, unknown>): void {
  log(status === "error" ? "error" : "info", ctx, status === "ok" ? "operation completed" : `operation failed: ${errorType}`, meta);
  const latencyMs = Date.now() - ctx.startTime;
  db.auditLog
    .create({
      data: {
        requestId: ctx.requestId,
        userId: ctx.userId ?? null,
        operation: ctx.operation,
        status,
        latencyMs,
        errorType: errorType ?? null,
        meta: meta ? JSON.stringify(meta) : null,
      },
    })
    .catch((e) => {
      console.error(JSON.stringify({ level: "warn", msg: "audit write failed", error: String(e).slice(0, 200) }));
    });
}

/** Wrap an AI/DB span for latency tracking within a request. */
export async function span<T>(ctx: RequestContext, name: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  try {
    const result = await fn();
    log("info", ctx, `span ${name} ok`, { span_ms: Date.now() - t0 });
    return result;
  } catch (e) {
    log("error", ctx, `span ${name} failed`, { span_ms: Date.now() - t0, error: String(e).slice(0, 300) });
    throw e;
  }
}
