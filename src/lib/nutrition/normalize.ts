/** Shared normalization for food name lookup keys. */
export function normalizeKey(s: string): string {
  return s.toLowerCase().trim().replace(/[.,!?;:'"()\[\]-]/g, "").replace(/\s+/g, " ");
}
