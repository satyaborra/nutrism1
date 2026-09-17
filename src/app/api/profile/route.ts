import { NextRequest, NextResponse } from "next/server";
import { withApi, parseJsonBody, AppError } from "@/lib/api-utils";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { computeDailyTargets } from "@/lib/nutrition/targets";
import { round } from "@/lib/format";

const DIET_PREFS = ["vegetarian", "vegan", "eggetarian", "non_vegetarian"];
const ACTIVITY = ["sedentary", "light", "moderate", "active", "very_active"];
const GOALS = ["lose_weight", "maintain", "gain_muscle"];
const CONDITIONS = ["T2DM", "CKD", "CVD"];
const ALLERGENS = ["dairy", "nuts", "peanuts", "gluten", "egg", "fish", "soy"];

function profileResponse(profile: Awaited<ReturnType<typeof db.profile.findUniqueOrThrow>>) {
  const targets = computeDailyTargets(profile);
  return {
    profile: {
      age: profile.age,
      sex: profile.sex,
      heightCm: profile.heightCm,
      weightKg: profile.weightKg,
      activityLevel: profile.activityLevel,
      goal: profile.goal,
      dietaryPreference: profile.dietaryPreference,
      allergies: safeJson(profile.allergies),
      healthConditions: safeJson(profile.healthConditions),
      language: profile.language,
      calorieTargetOverride: profile.calorieTargetOverride,
      proteinTargetOverride: profile.proteinTargetOverride,
    },
    computedTargets: {
      calories: targets.calories, protein: targets.protein, carbohydrates: targets.carbohydrates,
      fat: targets.fat, fiber: targets.fiber, sugar: targets.sugar, sodium: targets.sodium,
      bmr: targets.bmr, tdee: targets.tdee,
    },
    targetNotes: targets.notes,
  };
}

function safeJson(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export const GET = withApi("profile_get", async () => {
  const user = await requireUser();
  const profile = await db.profile.findUnique({ where: { userId: user.id } });
  if (!profile) {
    const created = await db.profile.create({ data: { userId: user.id } });
    return NextResponse.json(profileResponse(created));
  }
  return NextResponse.json(profileResponse(profile));
});

interface ProfilePutBody {
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

export const PUT = withApi("profile_put", async ({ req }: { req: NextRequest }) => {
  const user = await requireUser();
  const body = await parseJsonBody<ProfilePutBody>(req);

  const data: Record<string, unknown> = {};

  if (body.age !== undefined) {
    if (body.age !== null && (!Number.isFinite(body.age) || body.age < 5 || body.age > 120)) {
      throw new AppError("VALIDATION_FAILED", "Age must be between 5 and 120.");
    }
    data.age = body.age;
  }
  if (body.sex !== undefined) {
    if (body.sex !== null && !["male", "female", "other"].includes(body.sex)) {
      throw new AppError("VALIDATION_FAILED", "Invalid sex value.");
    }
    data.sex = body.sex;
  }
  if (body.heightCm !== undefined) {
    if (body.heightCm !== null && (!Number.isFinite(body.heightCm) || body.heightCm < 80 || body.heightCm > 250)) {
      throw new AppError("VALIDATION_FAILED", "Height must be between 80 and 250 cm.");
    }
    data.heightCm = body.heightCm;
  }
  if (body.weightKg !== undefined) {
    if (body.weightKg !== null && (!Number.isFinite(body.weightKg) || body.weightKg < 15 || body.weightKg > 400)) {
      throw new AppError("VALIDATION_FAILED", "Weight must be between 15 and 400 kg.");
    }
    data.weightKg = body.weightKg;
  }
  if (body.activityLevel !== undefined) {
    if (body.activityLevel !== null && !ACTIVITY.includes(body.activityLevel)) {
      throw new AppError("VALIDATION_FAILED", "Invalid activity level.");
    }
    data.activityLevel = body.activityLevel;
  }
  if (body.goal !== undefined) {
    if (body.goal !== null && !GOALS.includes(body.goal)) {
      throw new AppError("VALIDATION_FAILED", "Invalid goal.");
    }
    data.goal = body.goal;
  }
  if (body.dietaryPreference !== undefined) {
    if (!DIET_PREFS.includes(body.dietaryPreference)) throw new AppError("VALIDATION_FAILED", "Invalid dietary preference.");
    data.dietaryPreference = body.dietaryPreference;
  }
  if (body.allergies !== undefined) {
    if (!Array.isArray(body.allergies)) throw new AppError("VALIDATION_FAILED", "Allergies must be a list.");
    data.allergies = JSON.stringify(body.allergies.filter((a) => ALLERGENS.includes(a)));
  }
  if (body.healthConditions !== undefined) {
    if (!Array.isArray(body.healthConditions)) throw new AppError("VALIDATION_FAILED", "Health conditions must be a list.");
    data.healthConditions = JSON.stringify(body.healthConditions.filter((c) => CONDITIONS.includes(c)));
  }
  if (body.language !== undefined) {
    if (!["en", "ta", "te", "hi", "kn"].includes(body.language)) throw new AppError("VALIDATION_FAILED", "Unsupported language.");
    data.language = body.language;
  }
  if (body.calorieTargetOverride !== undefined) {
    if (body.calorieTargetOverride !== null && (!Number.isFinite(body.calorieTargetOverride) || body.calorieTargetOverride < 800 || body.calorieTargetOverride > 6000)) {
      throw new AppError("VALIDATION_FAILED", "Calorie override must be between 800 and 6000.");
    }
    data.calorieTargetOverride = body.calorieTargetOverride;
  }
  if (body.proteinTargetOverride !== undefined) {
    if (body.proteinTargetOverride !== null && (!Number.isFinite(body.proteinTargetOverride) || body.proteinTargetOverride < 20 || body.proteinTargetOverride > 300)) {
      throw new AppError("VALIDATION_FAILED", "Protein override must be between 20 and 300 g.");
    }
    data.proteinTargetOverride = body.proteinTargetOverride;
  }

  await db.profile.upsert({
    where: { userId: user.id },
    update: data,
    create: { userId: user.id, ...data },
  });

  const profile = await db.profile.findUniqueOrThrow({ where: { userId: user.id } });
  void round; // keep formatter import referenced
  return NextResponse.json(profileResponse(profile));
});
