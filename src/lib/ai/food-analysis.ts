/**
 * AI Food Understanding (perception flow).
 * The AI's ONLY job here: understand WHAT was eaten and HOW MUCH — from text
 * (any supported language / romanized) or images. It NEVER supplies nutrition values.
 *
 * Unknown quantities are surfaced as quantity_source="unknown" — never silently invented.
 */
import { getAiProvider, parseJsonSafe } from "./provider";
import { detectLanguage, type LanguageDetection } from "@/lib/i18n/languages";
import { resolveFoodName } from "@/lib/nutrition/food-repository";
import type { DetectedFood, QuantitySource } from "@/lib/nutrition/types";

export interface RawAIFood {
  name?: string;
  quantity?: number | string;
  unit?: string;
  preparation?: string;
  confidence?: number;
  quantity_source?: string;
}

export interface AIAnalysisOutput {
  meal_type?: string;
  foods: RawAIFood[];
  notes?: string;
}

export interface FoodAnalysisResult {
  detectedLanguage: LanguageDetection;
  mealTypeGuess: string | null;
  foods: DetectedFood[];
  aiLatencyMs: number;
  aiOk: boolean;
  aiNote: string | null;
}

function newLineId(): string {
  return `line_${Math.random().toString(36).slice(2, 10)}`;
}

const SYSTEM_PROMPT = `You are a food perception module for a nutrition application. Your job is ONLY to identify foods, quantities, and meal type from user input (which may be English, Tamil, Telugu, Hindi, Kannada, romanized Indian languages, or a food photo description). You MUST NOT provide nutrition values, calories, or health advice — another system computes those.

Number word hints:
- English: one=1 two=2 three=3 four=4 five=5
- Tamil: onru=1, rendu=2, moonu=3, naalu=4, anju=5
- Telugu: okati=1, rendu=2, moodu=3, nalugu=4, aidu=5
- Hindi: ek=1, do=2, teen=3, char=4, paanch=5
- Kannada: ondu=1, eradu=2, mooru=3, naalku=4, aidu=5

Output STRICT JSON only, with this exact schema:
{
  "meal_type": "breakfast" | "lunch" | "snack" | "dinner",
  "foods": [
    {
      "name": "<food name in a recognizable form>",
      "quantity": <number>,          // numeric only
      "unit": "piece|pieces|katori|bowl|glass|cup|g|ml|tsp|tbsp|medium",
      "preparation": "<steamed|fried|boiled|raw|grilled|cooked|...>",
      "confidence": <0..1>,
      "quantity_source": "user" | "estimated" | "unknown"
    }
  ]
}

Rules:
- If the user states a quantity, use it and set quantity_source="user".
- If you estimate from a photo or context, set quantity_source="estimated".
- If quantity is genuinely unknown, set quantity=1, unit to the most likely unit, and quantity_source="unknown".
- Keep the food name as close to a standard name as possible (e.g. "Idli", "Sambar", "Roti", "Curd").
- Do not merge distinct foods; list each separately (e.g. "2 idli and sambar" → two entries).
- meal_type: infer from the food/time hints; default to your best guess.`;

function buildUserPrompt(text: string, language: LanguageDetection): string {
  const langNote =
    language.method === "script"
      ? `The input is written in ${language.script} script.`
      : language.method === "romanized_heuristic"
        ? "The input appears to be ROMANIZED Indian language text (Latin letters, not English). Interpret accordingly."
        : "The input is in English.";
  return `${langNote}\nUser input: "${text}"\n\nReturn the JSON now.`;
}

function normalizeAiFoods(raw: AIAnalysisOutput): DetectedFood[] {
  const out: DetectedFood[] = [];
  const foods = Array.isArray(raw.foods) ? raw.foods.slice(0, 15) : [];
  for (const f of foods) {
    if (!f || typeof f.name !== "string" || !f.name.trim()) continue;
    let quantity = typeof f.quantity === "number" ? f.quantity : parseFloat(String(f.quantity ?? ""));
    if (!Number.isFinite(quantity) || quantity <= 0) quantity = 1;
    quantity = Math.min(quantity, 50);
    const qsrc = (["user", "estimated", "unknown"].includes(String(f.quantity_source)) ? f.quantity_source : "estimated") as QuantitySource;
    out.push({
      lineId: newLineId(),
      originalName: f.name.trim(),
      displayName: f.name.trim(),
      foodId: null,
      matchStatus: "unmatched",
      quantity,
      unit: (f.unit ?? "pieces").toString().trim(),
      preparation: f.preparation ?? null,
      confidence: Math.min(1, Math.max(0, typeof f.confidence === "number" ? f.confidence : 0.6)),
      quantitySource: qsrc,
    });
  }
  return out;
}

/** Normalize + resolve every detected food against the canonical food database. */
export async function normalizeDetectedFoods(foods: DetectedFood[]): Promise<DetectedFood[]> {
  const out: DetectedFood[] = [];
  for (const food of foods) {
    try {
      const res = await resolveFoodName(food.originalName);
      if (res.status === "matched" && res.food) {
        out.push({
          ...food,
          foodId: res.food.id,
          displayName: res.food.canonicalName,
          matchStatus: "matched",
        });
      } else if (res.status === "ambiguous" && res.candidates.length > 0) {
        out.push({
          ...food,
          matchStatus: "ambiguous",
          candidates: res.candidates.map((c) => ({ foodId: c.id, name: c.canonicalName })),
          displayName: food.originalName,
        });
      } else {
        out.push({ ...food, matchStatus: "unmatched", foodId: null });
      }
    } catch {
      out.push({ ...food, matchStatus: "unmatched", foodId: null });
    }
  }
  return out;
}

/** Text-based analysis (any language). */
export async function analyzeFoodText(text: string): Promise<FoodAnalysisResult> {
  const language = detectLanguage(text);
  const provider = getAiProvider();
  const result = await provider.chat([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(text, language) },
  ]);

  if (!result.ok) {
    // AI failure must not crash the flow — fall back to naive token splitting via alias index
    const fallback = await fallbackTextParse(text);
    return {
      detectedLanguage: language,
      mealTypeGuess: fallback.mealType,
      foods: await normalizeDetectedFoods(fallback.foods),
      aiLatencyMs: result.latencyMs,
      aiOk: false,
      aiNote: "AI perception was unavailable; used offline food-name matching. Please verify items and quantities.",
    };
  }

  const parsed = parseJsonSafe<AIAnalysisOutput>(result.content);
  if (!parsed || !Array.isArray(parsed.foods)) {
    const fallback = await fallbackTextParse(text);
    return {
      detectedLanguage: language,
      mealTypeGuess: fallback.mealType,
      foods: await normalizeDetectedFoods(fallback.foods),
      aiLatencyMs: result.latencyMs,
      aiOk: false,
      aiNote: "AI output could not be parsed; used offline food-name matching. Please verify items and quantities.",
    };
  }

  const aiFoods = normalizeAiFoods(parsed);
  return {
    detectedLanguage: language,
    mealTypeGuess: ["breakfast", "lunch", "snack", "dinner"].includes(String(parsed.meal_type)) ? String(parsed.meal_type) : null,
    foods: await normalizeDetectedFoods(aiFoods),
    aiLatencyMs: result.latencyMs,
    aiOk: true,
    aiNote: null,
  };
}

const VISION_PROMPT = `${SYSTEM_PROMPT}

Analyze the food photo and identify each distinct food/dish visible with estimated portions. If the image contains no identifiable food, return {"meal_type": null, "foods": []} . Return the JSON now.`;

/** Image-based analysis (VLM). imageDataUrl must be a data: URL. */
export async function analyzeFoodImage(imageDataUrl: string, hint?: string): Promise<FoodAnalysisResult> {
  const provider = getAiProvider();
  const prompt = hint
    ? `${VISION_PROMPT}\nUser note: "${hint}"`
    : VISION_PROMPT;
  const result = await provider.vision(prompt, imageDataUrl);

  if (!result.ok) {
    return {
      detectedLanguage: { language: "en", script: "latin", confidence: 0.5, method: "default" },
      mealTypeGuess: null,
      foods: [],
      aiLatencyMs: result.latencyMs,
      aiOk: false,
      aiNote: "Image analysis is temporarily unavailable. Please describe the food in text instead.",
    };
  }

  const parsed = parseJsonSafe<AIAnalysisOutput>(result.content);
  if (!parsed || !Array.isArray(parsed.foods)) {
    return {
      detectedLanguage: { language: "en", script: "latin", confidence: 0.5, method: "default" },
      mealTypeGuess: null,
      foods: [],
      aiLatencyMs: result.latencyMs,
      aiOk: false,
      aiNote: "Image analysis returned an unreadable result. Please describe the food in text instead.",
    };
  }

  const aiFoods = normalizeAiFoods(parsed);
  return {
    detectedLanguage: { language: "en", script: "latin", confidence: 0.5, method: "default" },
    mealTypeGuess: ["breakfast", "lunch", "snack", "dinner"].includes(String(parsed.meal_type)) ? String(parsed.meal_type) : null,
    foods: await normalizeDetectedFoods(aiFoods),
    aiLatencyMs: result.latencyMs,
    aiOk: true,
    aiNote: parsed.notes ?? null,
  };
}

// ---------- Offline fallback parser (AI-failure resilience) ----------

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5,
  rendu: 2, eradu: 2, moonu: 3, mooru: 3, naalu: 4, nalugu: 4, anju: 5, aidu: 5,
  onru: 1, ondu: 1, okati: 1, moodu: 3, naalku: 4,
  aadai: 6, aaru: 6, aaru_2: 6,
};

const FILLER_WORDS = new Set([
  "i", "ate", "eaten", "had", "have", "a", "an", "the", "and", "with", "for", "my", "some", "today",
  "naan", "naanu", "nanu", "nenu", "maine", "main", "tinned", "tinna", "sapten", "saapten", "khaya",
  "khaaya", "saptenu", "tindenu", "thinden", "tinnanu", "hanikide", "kuride", "ite", "kolla",
  "pieces", "piece", "of", "nos", "numbers",
]);

/**
 * Deterministic offline parser: tokenized alias matching when AI is unavailable.
 * Supports patterns like "2 idli sambar", "rendu idli tinna", "3 dosa".
 */
async function fallbackTextParse(text: string): Promise<{ foods: DetectedFood[]; mealType: string | null }> {
  const tokens = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  const { resolveFoodName } = await import("@/lib/nutrition/food-repository");
  const foods: DetectedFood[] = [];
  let pendingQty: number | null = null;

  for (const tok of tokens) {
    if (FILLER_WORDS.has(tok)) continue;
    let qty: number | undefined;
    if (/^\d+(\.\d+)?$/.test(tok)) {
      qty = parseFloat(tok);
    } else if (tok in NUMBER_WORDS) {
      qty = NUMBER_WORDS[tok];
    }
    if (qty !== undefined && Number.isFinite(qty) && qty > 0) {
      pendingQty = qty;
      continue;
    }
    const res = await resolveFoodName(tok);
    if (res.status === "matched" && res.food) {
      foods.push({
        lineId: newLineId(),
        originalName: tok,
        displayName: res.food.canonicalName,
        foodId: res.food.id,
        matchStatus: "matched",
        quantity: pendingQty ?? 1,
        unit: res.food.servingUnit.split(" ").slice(1).join(" ") || "serving",
        preparation: null,
        confidence: 0.5,
        quantitySource: pendingQty !== null ? "user" : "unknown",
      });
      pendingQty = null;
    }
    // unmatched tokens are ignored in offline mode (user can add manually)
  }

  return { foods, mealType: null };
}
