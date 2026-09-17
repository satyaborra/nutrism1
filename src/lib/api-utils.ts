/**
 * Centralized API utilities: structured errors, request handling, rate limiting.
 * Every API route returns errors in the shape:
 *   { error: { code, message, request_id } }
 */
import { NextRequest, NextResponse } from "next/server";
import { newRequestId, RequestContext, startRequest, audit, Operation } from "@/lib/observability";

// ---------- Structured errors ----------

export type ErrorCode =
  | "BAD_REQUEST" | "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT"
  | "VALIDATION_FAILED" | "FOOD_NOT_RECOGNIZED" | "AMBIGUOUS_FOOD"
  | "RATE_LIMITED" | "AI_UNAVAILABLE" | "AI_OUTPUT_INVALID"
  | "DATABASE_ERROR" | "INTERNAL_ERROR" | "SERVICE_UNAVAILABLE" | "TIMEOUT";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  BAD_REQUEST: 400, UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404, CONFLICT: 409,
  VALIDATION_FAILED: 422, FOOD_NOT_RECOGNIZED: 422, AMBIGUOUS_FOOD: 422,
  RATE_LIMITED: 429, AI_UNAVAILABLE: 502, AI_OUTPUT_INVALID: 502,
  DATABASE_ERROR: 500, INTERNAL_ERROR: 500, SERVICE_UNAVAILABLE: 503, TIMEOUT: 504,
};

export class AppError extends Error {
  code: ErrorCode;
  details?: unknown;
  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export function errorResponse(code: ErrorCode, message: string, requestId: string, details?: unknown) {
  return NextResponse.json(
    { error: { code, message, request_id: requestId, ...(details !== undefined ? { details } : {}) } },
    { status: STATUS_BY_CODE[code] },
  );
}

// ---------- Request wrapper ----------

export function getClientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

interface HandlerArgs {
  req: NextRequest;
  ctx: RequestContext;
}

/**
 * Wrap a route handler with request-id, structured error mapping, and audit logging.
 * Usage: export const GET = withApi("health_check", async ({req, ctx}) => {...})
 *
 * opts.quietUnauthorized: audit expected 401s (e.g. session probes) as "ok" with a
 * note instead of "error" — keeps logs/alerts focused on real failures.
 */
export function withApi(
  operation: Operation,
  handler: (args: HandlerArgs) => Promise<NextResponse>,
  opts: { quietUnauthorized?: boolean } = {},
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const requestId = req.headers.get("x-request-id") || newRequestId();
    const ctx = startRequest(operation, requestId);
    try {
      const res = await handler({ req, ctx });
      audit(ctx, "ok");
      return res;
    } catch (e) {
      if (e instanceof AppError) {
        if (opts.quietUnauthorized && e.code === "UNAUTHORIZED") {
          audit(ctx, "ok", undefined, { note: "expected unauthenticated probe" });
          return errorResponse(e.code, e.message, requestId, e.details);
        }
        audit(ctx, "error", e.code, { message: e.message.slice(0, 200) });
        return errorResponse(e.code, e.message, requestId, e.details);
      }
      // Unknown error — never leak stack traces
      console.error(`[${requestId}] unhandled:`, e);
      audit(ctx, "error", "INTERNAL_ERROR", { raw: String(e).slice(0, 200) });
      return errorResponse("INTERNAL_ERROR", "Something went wrong. Please try again.", requestId);
    }
  };
}

// ---------- Rate limiting (in-memory token bucket per key) ----------

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Simple sliding-window-ish limiter. Suitable for single-instance deployment.
 * key: `${ip}|${userId ?? anon}|${scope}`
 */
export function rateLimit(scope: string, key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const k = `${key}|${scope}`;
  let b = buckets.get(k);
  if (!b) {
    b = { tokens: limit, lastRefill: now };
    buckets.set(k, b);
  }
  const elapsed = now - b.lastRefill;
  if (elapsed > windowMs) {
    // full refill after window
    b.tokens = limit;
    b.lastRefill = now;
  }
  if (b.tokens <= 0) {
    throw new AppError("RATE_LIMITED", "Too many requests. Please wait a moment and try again.");
  }
  b.tokens -= 1;
  // opportunistic cleanup
  if (buckets.size > 10000) {
    for (const [bk, bv] of buckets) {
      if (now - bv.lastRefill > windowMs * 4) buckets.delete(bk);
    }
  }
}

// ---------- Parsing helpers ----------

export async function parseJsonBody<T>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new AppError("BAD_REQUEST", "Request body must be valid JSON.");
  }
}

export function requireString(value: unknown, field: string, maxLen = 2000): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AppError("VALIDATION_FAILED", `Field "${field}" is required.`);
  }
  if (value.length > maxLen) {
    throw new AppError("VALIDATION_FAILED", `Field "${field}" exceeds maximum length of ${maxLen}.`);
  }
  return value.trim();
}
