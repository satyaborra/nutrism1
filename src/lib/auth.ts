/**
 * Lightweight session-based authentication.
 * - Passwords hashed with scrypt (salt:hash)
 * - Session = HMAC-signed token cookie (userId.expiry.signature), httpOnly
 * - Designed so NextAuth can replace it later without touching business logic.
 */
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { AppError } from "@/lib/api-utils";

const COOKIE_NAME = "nutrislm_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function secret(): string {
  return process.env.SESSION_SECRET || "nutrislm-dev-secret-change-in-production";
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

export function createSessionToken(userId: string): string {
  const payload = `${userId}.${Date.now() + SESSION_TTL_MS}`;
  return `${payload}.${sign(payload)}`;
}

export function parseSessionToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expiry, sig] = parts;
  const payload = `${userId}.${expiry}`;
  const expected = sign(payload);
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  if (Number(expiry) < Date.now()) return null;
  return userId;
}

export async function setSessionCookie(userId: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, createSessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS / 1000,
    path: "/",
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, "", { httpOnly: true, maxAge: 0, path: "/" });
}

/** Resolve authenticated user from the session cookie. Throws 401 AppError when absent. */
export async function requireUser(): Promise<{ id: string; email: string; name: string | null }> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  const userId = parseSessionToken(token);
  if (!userId) throw new AppError("UNAUTHORIZED", "Please sign in to continue.");
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true } });
  if (!user) throw new AppError("UNAUTHORIZED", "Session is no longer valid. Please sign in again.");
  return user;
}

/** For API route wrappers reading directly from NextRequest (cookie header). */
export function userIdFromRequest(req: NextRequest): string | null {
  return parseSessionToken(req.cookies.get(COOKIE_NAME)?.value);
}
