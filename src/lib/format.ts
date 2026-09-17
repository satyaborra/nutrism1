/**
 * Centralized formatting utilities.
 * All nutrition numbers displayed to users MUST pass through here so that
 * floating point artifacts (17.560000000000002) never reach the UI.
 */

export function round(n: number, decimals: number = 1): number {
  if (!Number.isFinite(n)) return 0;
  const f = Math.pow(10, decimals);
  return Math.round((n + Number.EPSILON) * f) / f;
}

/** 350.00000000004 -> "350 kcal" */
export function formatKcal(n: number): string {
  return `${round(n, 0)} kcal`;
}

/** 17.560000000000002 -> "17.6 g" */
export function formatGrams(n: number): string {
  return `${round(n, 1)} g`;
}

/** 452.3 -> "452 mg" */
export function formatMg(n: number): string {
  return `${round(n, 0)} mg`;
}

/** Raw numbers for charts / progress bars (rounded, no unit). */
export function num(n: number, decimals: number = 1): number {
  return round(n, decimals);
}

/** ISO date (YYYY-MM-DD) in the given timezone offset (minutes). */
export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatDateDisplay(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function formatTimeDisplay(d: Date): string {
  return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
}
