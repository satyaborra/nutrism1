/**
 * Food Repository + Normalization Layer.
 * Resolves raw food text (English / native scripts / romanized) to a canonical,
 * language-independent Food entity. Never invents nutrition values.
 */
import { db } from "@/lib/db";
import type { Food } from "@prisma/client";
import { normalizeKey } from "@/lib/nutrition/normalize";

export interface ResolveResult {
  status: "matched" | "ambiguous" | "unmatched";
  food: Food | null;
  candidates: Food[];
  matchedAlias: string | null;
  matchedLanguage: string | null;
}

// In-memory alias index cache (rebuilt lazily, invalidated on seed).
let aliasCache: { map: Map<string, { foodId: string; language: string; alias: string }[]>; builtAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

async function getAliasIndex(): Promise<Map<string, { foodId: string; language: string; alias: string }[]>> {
  if (aliasCache && Date.now() - aliasCache.builtAt < CACHE_TTL_MS) return aliasCache.map;
  const aliases = await db.foodAlias.findMany();
  const map = new Map<string, { foodId: string; language: string; alias: string }[]>();
  for (const a of aliases) {
    const list = map.get(a.normalizedAlias) ?? [];
    list.push({ foodId: a.foodId, language: a.language, alias: a.alias });
    map.set(a.normalizedAlias, list);
  }
  aliasCache = { map, builtAt: Date.now() };
  return map;
}

export function invalidateFoodCache(): void {
  aliasCache = null;
}

const foodCache = new Map<string, Food>();

export async function getFood(id: string): Promise<Food | null> {
  const c = foodCache.get(id);
  if (c) return c;
  const food = await db.food.findUnique({ where: { id } });
  if (food) foodCache.set(id, food);
  return food;
}

export async function getFoods(ids: string[]): Promise<Map<string, Food>> {
  const out = new Map<string, Food>();
  const missing: string[] = [];
  for (const id of ids) {
    const c = foodCache.get(id);
    if (c) out.set(id, c);
    else missing.push(id);
  }
  if (missing.length > 0) {
    const rows = await db.food.findMany({ where: { id: { in: missing } } });
    for (const f of rows) {
      foodCache.set(f.id, f);
      out.set(f.id, f);
    }
  }
  return out;
}

/** Exact normalized alias lookup. */
async function exactLookup(normalized: string) {
  const index = await getAliasIndex();
  return index.get(normalized) ?? [];
}

/**
 * Resolve a raw food name to a canonical food.
 * Strategy: exact alias match → normalized substring/word match → unmatched.
 * Never guesses: ambiguous names return candidate list for user confirmation.
 */
export async function resolveFoodName(rawName: string): Promise<ResolveResult> {
  const key = normalizeKey(rawName);
  if (!key) return { status: "unmatched", food: null, candidates: [], matchedAlias: null, matchedLanguage: null };

  // 1. exact match
  const exact = await exactLookup(key);
  if (exact.length === 1) {
    const food = await getFood(exact[0].foodId);
    if (food) return { status: "matched", food, candidates: [food], matchedAlias: exact[0].alias, matchedLanguage: exact[0].language };
  }
  if (exact.length > 1) {
    const candidates = await getFoods(exact.map((e) => e.foodId));
    return { status: "ambiguous", food: null, candidates: [...candidates.values()], matchedAlias: key, matchedLanguage: exact[0].language };
  }

  // 2. word-level containment (e.g. "3 idli sambar" tokens, "masala dosa" inside "masala dosa with chutney")
  const index = await getAliasIndex();
  const tokens = key.split(" ").filter((t) => t.length >= 3);
  const scored: { foodId: string; score: number; language: string; alias: string }[] = [];

  for (const t of tokens) {
    for (const [normKey, entries] of index.entries()) {
      // exact token equals alias key, or multiword alias contained in query
      if (normKey === t) {
        for (const e of entries) scored.push({ foodId: e.foodId, score: 3, language: e.language, alias: e.alias });
      } else if (normKey.includes(" ") && (key.includes(normKey) || normKey.includes(t))) {
        for (const e of entries) scored.push({ foodId: e.foodId, score: 2, language: e.language, alias: e.alias });
      }
    }
  }

  if (scored.length > 0) {
    // prefer highest score, then prefer primary-language alias ("rom"/"en")
    const byFood = new Map<string, { score: number; language: string; alias: string }>();
    for (const s of scored) {
      const prev = byFood.get(s.foodId);
      const langBonus = s.language === "rom" || s.language === "en" ? 0.5 : 0;
      if (!prev || s.score + langBonus > prev.score) byFood.set(s.foodId, s);
    }
    const sorted = [...byFood.entries()].sort((a, b) => b[1].score - a[1].score);
    if (sorted.length === 1) {
      const food = await getFood(sorted[0][0]);
      if (food) return { status: "matched", food, candidates: [food], matchedAlias: sorted[0][1].alias, matchedLanguage: sorted[0][1].language };
    }
    const topScore = sorted[0][1].score;
    const top = sorted.filter(([, v]) => v.score === topScore);
    if (top.length === 1) {
      const food = await getFood(top[0][0]);
      if (food) return { status: "matched", food, candidates: [food], matchedAlias: top[0][1].alias, matchedLanguage: top[0][1].language };
    }
    const candidates = await getFoods(top.slice(0, 5).map(([id]) => id));
    return { status: "ambiguous", food: null, candidates: [...candidates.values()], matchedAlias: key, matchedLanguage: null };
  }

  return { status: "unmatched", food: null, candidates: [], matchedAlias: null, matchedLanguage: null };
}

/** Free-text food search for manual picking (dashboard food picker fallback). */
export async function searchFoods(query: string, limit = 15): Promise<Food[]> {
  const key = normalizeKey(query);
  if (!key) {
    return db.food.findMany({ orderBy: { canonicalName: "asc" }, take: limit });
  }
  const index = await getAliasIndex();
  const hits = new Set<string>();
  for (const [normKey, entries] of index.entries()) {
    if (normKey.includes(key) || key.includes(normKey)) {
      for (const e of entries) hits.add(e.foodId);
    }
  }
  if (hits.size === 0) {
    // fallback: canonical name prefix
    const rows = await db.food.findMany({
      where: { canonicalName: { contains: query, } },
      take: limit,
    });
    return rows;
  }
  const foods = await getFoods([...hits].slice(0, limit * 2));
  return [...foods.values()].slice(0, limit);
}

/**
 * Unit → reference-quantity conversion (deterministic).
 * Food rows express nutrients per their `servingUnit` reference (e.g. "1 piece", "100 g", "1 katori").
 * When the user's unit differs from the reference, we convert through approximate gram weights
 * of common household units (katori≈150g, glass≈200ml, piece≈50g ...). Such conversions are
 * flagged exact=false and surface as "estimated" in the UI.
 */
const UNIT_GRAMS: Record<string, number> = {
  g: 1, gram: 1, grams: 1, gm: 1, gms: 1, kg: 1000,
  ml: 1, millilitre: 1, millilitres: 1, l: 1000,
  katori: 150, bowl: 200, cups: 200, cup: 200, serving: 150, servings: 150, ladle: 120, scoop: 30, scoops: 60,
  glass: 200, glasses: 200, tumbler: 200,
  piece: 50, pieces: 50, pc: 50, pcs: 50, nos: 50, no: 50, number: 50,
  medium: 120, regular: 120, small: 80, large: 200,
  tsp: 5, teaspoon: 5, teaspoons: 5, tbsp: 15, tablespoon: 15, tablespoons: 15,
  slice: 25, slices: 25, "2 slices": 50,
};

const REF_AMOUNT_CACHE = new Map<string, number>();

function referenceGrams(referenceUnit: string): number {
  const key = normalizeKey(referenceUnit);
  const cached = REF_AMOUNT_CACHE.get(key);
  if (cached) return cached;

  // "1 piece" / "100 g" / "2 slices" — leading number × unit weight
  const m = key.match(/^([\d.]+)\s*(.*)$/);
  let grams: number;
  if (m) {
    const count = parseFloat(m[1]);
    const unitPart = m[2].trim();
    const unitGrams = UNIT_GRAMS[unitPart];
    if (unitGrams !== undefined) {
      grams = count * unitGrams;
    } else if (/^(g|gram|grams|ml)$/.test(unitPart)) {
      grams = count;
    } else {
      grams = count * 150; // unknown unit family → assume ~150g per reference
    }
  } else {
    grams = UNIT_GRAMS[key] ?? 150;
  }
  REF_AMOUNT_CACHE.set(key, grams);
  return grams;
}

export function convertQuantity(quantity: number, userUnit: string, referenceUnit: string): { quantityInRefs: number; exact: boolean; note?: string } {
  const uUser = normalizeKey(userUnit || referenceUnit);
  const uRef = normalizeKey(referenceUnit);

  if (!uUser || uUser === uRef) {
    return { quantityInRefs: quantity, exact: true };
  }

  const userGrams = UNIT_GRAMS[uUser];
  const refGrams = referenceGrams(referenceUnit);

  if (userGrams !== undefined && refGrams > 0) {
    const refs = (quantity * userGrams) / refGrams;
    const capped = Math.min(refs, 30);
    const rounded = Math.round(capped * 100) / 100;
    return {
      quantityInRefs: rounded,
      exact: uUser === uRef,
      note: `Converted ${quantity} ${userUnit} ≈ ${rounded} × ${referenceUnit} using standard portion weights.`,
    };
  }

  // Unknown unit → conservative: treat as 1 reference serving, flagged
  return {
    quantityInRefs: Math.min(quantity, 20),
    exact: false,
    note: `Unit "${userUnit}" differs from reference "${referenceUnit}"; please verify the quantity.`,
  };
}
