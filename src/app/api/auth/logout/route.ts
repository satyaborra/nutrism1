import { NextResponse } from "next/server";
import { withApi } from "@/lib/api-utils";
import { clearSessionCookie } from "@/lib/auth";

export const POST = withApi("auth_logout", async () => {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
});
