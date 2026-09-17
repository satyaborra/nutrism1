/**
 * Central formatting helpers — NEVER render raw floats in the UI.
 */
import type { NutrientKey } from "./types";

export function formatKcal(n: number): string {
  return `${Math.round(n)} kcal`;
}

export function formatGrams(n: number): string {
  return `${(Math.round(n * 10) / 10).toFixed(1)} g`;
}

export function formatMg(n: number): string {
  return `${Math.round(n)} mg`;
}

/** Percentage of target, clamped to 0-100. */
export function pct(consumed: number, target: number): number {
  if (!Number.isFinite(consumed) || !Number.isFinite(target)) return 0;
  if (target <= 0) return consumed > 0 ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round((consumed / target) * 100)));
}

/** Thousands-separated integer, e.g. 1240 -> "1,240". */
export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** "2.5" style plain number for compact chips. */
export function formatShort(n: number): string {
  return `${Math.round(n * 10) / 10}`;
}

export const NUTRIENT_UNIT: Record<NutrientKey, "kcal" | "g" | "mg"> = {
  calories: "kcal",
  protein: "g",
  carbohydrates: "g",
  fat: "g",
  fiber: "g",
  sugar: "g",
  sodium: "mg",
  potassium: "mg",
  phosphorus: "mg",
  cholesterol: "mg",
  saturatedFat: "g",
};

/** Format any nutrient value with its unit, using the rounding rules above. */
export function formatNutrient(key: NutrientKey, value: number): string {
  const unit = NUTRIENT_UNIT[key];
  if (unit === "kcal") return formatKcal(value);
  if (unit === "mg") return formatMg(value);
  return formatGrams(value);
}

/** Local YYYY-MM-DD key for "today" on the client. */
export function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Locale code used for Intl date formatting per app language. */
export function localeFor(lang: string): string {
  switch (lang) {
    case "ta": return "ta-IN";
    case "te": return "te-IN";
    case "hi": return "hi-IN";
    case "kn": return "kn-IN";
    default: return "en-IN";
  }
}
