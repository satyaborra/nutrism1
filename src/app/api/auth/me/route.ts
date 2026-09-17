import { NextResponse } from "next/server";
import { withApi } from "@/lib/api-utils";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { safeParseArray } from "@/lib/nutrition/targets";

export const GET = withApi("auth_me", async () => {
  const user = await requireUser();
  const profile = await db.profile.findUnique({ where: { userId: user.id } });
  return NextResponse.json({
    user,
    profile: profile
      ? {
          language: profile.language,
          dietaryPreference: profile.dietaryPreference,
          healthConditions: safeParseArray(profile.healthConditions),
          allergies: safeParseArray(profile.allergies),
        }
      : null,
  });
});
