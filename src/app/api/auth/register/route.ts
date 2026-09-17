import { NextRequest, NextResponse } from "next/server";
import { withApi, parseJsonBody, AppError, rateLimit, getClientIp } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { hashPassword, setSessionCookie } from "@/lib/auth";

interface RegisterBody {
  email?: string;
  name?: string;
  password?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST = withApi("auth_register", async ({ req }: { req: NextRequest }) => {
  rateLimit("auth", getClientIp(req), 20, 60_000);
  const body = await parseJsonBody<RegisterBody>(req);
  const email = (body.email ?? "").trim().toLowerCase();
  const name = (body.name ?? "").trim();
  const password = body.password ?? "";

  if (!EMAIL_RE.test(email)) throw new AppError("VALIDATION_FAILED", "Please enter a valid email address.");
  if (password.length < 8) throw new AppError("VALIDATION_FAILED", "Password must be at least 8 characters.");

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) throw new AppError("CONFLICT", "An account with this email already exists. Please sign in.");

  const user = await db.user.create({
    data: {
      email,
      name: name || email.split("@")[0],
      passwordHash: hashPassword(password),
      profile: { create: { language: "en" } },
    },
    select: { id: true, email: true, name: true },
  });

  await setSessionCookie(user.id);
  return NextResponse.json({ user });
});
