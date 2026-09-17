/**
 * POST /api/nutrition/analyze-food
 * AI perception only — creates an analysis draft. NEVER logs a meal.
 * Body: { text?: string, imageDataUrl?: string, hint?: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { withApi, parseJsonBody, AppError, rateLimit } from "@/lib/api-utils";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { analyzeFoodText, analyzeFoodImage } from "@/lib/ai/food-analysis";
import { startRequest, type RequestContext } from "@/lib/observability";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

interface AnalyzeBody {
  text?: string;
  imageDataUrl?: string;
  hint?: string;
}

const ALLOWED_IMAGE_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

export const POST = withApi("analyze_food", handle);

async function handle({ req, ctx }: { req: NextRequest; ctx: RequestContext }): Promise<NextResponse> {
  const user = await requireUser();
  ctx.userId = user.id;
  rateLimit("analyze", user.id, 20, 5 * 60_000);

  const body = await parseJsonBody<AnalyzeBody>(req);
  const hasText = typeof body.text === "string" && body.text.trim().length > 0;
  const hasImage = typeof body.imageDataUrl === "string" && body.imageDataUrl.startsWith("data:image/");
  if (!hasText && !hasImage) {
    throw new AppError("VALIDATION_FAILED", "Provide either food text or a food image.");
  }
  if (hasText && body.text!.length > 2000) {
    throw new AppError("VALIDATION_FAILED", "Food description is too long (max 2000 characters).");
  }

  let imagePath: string | null = null;
  let inputType: "text" | "image" | "image_text" = "text";

  if (hasImage) {
    inputType = hasText ? "image_text" : "image";
    imagePath = await persistImage(body.imageDataUrl!, ctx.requestId);
  }

  // ---- AI perception ----
  const analysis = hasImage
    ? await analyzeFoodImage(body.imageDataUrl!, hasText ? body.text : undefined)
    : await analyzeFoodText(body.text!);

  const aiSpan = startRequest("analyze_food", ctx.requestId); // latency bookkeeping for log line
  void aiSpan;

  // ---- Persist draft (analysis artifact) ----
  const draft = await db.analysisDraft.create({
    data: {
      userId: user.id,
      status: analysis.foods.some((f) => f.matchStatus !== "matched") ? "NEEDS_CONFIRMATION" : "DETECTED",
      inputType,
      rawInput: hasText ? body.text!.slice(0, 2000) : null,
      imagePath,
      detectedLanguage: analysis.detectedLanguage.language,
      mealTypeGuess: analysis.mealTypeGuess,
      foods: JSON.stringify(analysis.foods),
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    },
  });

  return NextResponse.json({
    analysisId: draft.id,
    draftId: draft.id,
    status: draft.status,
    detectedLanguage: analysis.detectedLanguage,
    mealTypeGuess: analysis.mealTypeGuess,
    foods: analysis.foods,
    aiOk: analysis.aiOk,
    aiNote: analysis.aiNote,
    aiLatencyMs: analysis.aiLatencyMs,
  });
}

/** Store image on disk (never in the DB) and return the path reference. */
async function persistImage(dataUrl: string, requestId: string): Promise<string> {
  const match = dataUrl.match(/^data:(image\/[\w.+-]+);base64,(.+)$/);
  if (!match) throw new AppError("VALIDATION_FAILED", "Unsupported image encoding.");
  const [, mime, base64] = match;
  if (!ALLOWED_IMAGE_MIME.includes(mime)) {
    throw new AppError("VALIDATION_FAILED", "Only JPEG, PNG, WebP or GIF images are supported.");
  }
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new AppError("VALIDATION_FAILED", "Image too large (max 6 MB).");
  }
  const ext = mime === "image/jpeg" ? "jpg" : mime.split("/")[1].replace("svg", "bin");
  const dir = path.join(process.cwd(), "uploads");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${requestId}_${randomUUID().slice(0, 8)}.${ext}`);
  await writeFile(file, buffer);
  return file;
}
