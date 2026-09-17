import { NextRequest, NextResponse } from "next/server";
import { withApi, parseJsonBody, AppError, rateLimit, getClientIp } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { verifyPassword, setSessionCookie } from "@/lib/auth";

interface LoginBody {
  email?: string;
  password?: string;
}

export const POST = withApi("auth_login", async ({ req }: { req: NextRequest }) => {
  rateLimit("auth", getClientIp(req), 30, 60_000);
  const body = await parseJsonBody<LoginBody>(req);
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";

  if (!email || !password) throw new AppError("VALIDATION_FAILED", "Email and password are required.");

  const user = await db.user.findUnique({ where: { email } });
  // Uniform error — do not reveal whether the email exists
  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw new AppError("UNAUTHORIZED", "Incorrect email or password.");
  }

  await setSessionCookie(user.id);
  return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } });
});
