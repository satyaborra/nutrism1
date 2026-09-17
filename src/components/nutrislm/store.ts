/**
 * Minimal client state: session + a data version counter that sections
 * subscribe to, so logging a meal refreshes the summary / history / recs.
 */
import { create } from "zustand";
import type { AuthProfileBrief, User } from "@/lib/client/types";

interface NutriStore {
  user: User | null;
  profileBrief: AuthProfileBrief | null;
  bootstrapped: boolean;
  /** Bumped whenever meals change so sections refetch. */
  dataVersion: number;
  /** Request from the activity calendar to preselect a date in the logger.
   *  nonce lets the same date be requested twice in a row. */
  backfillRequest: { date: string; nonce: number } | null;
  setSession: (user: User | null, profileBrief: AuthProfileBrief | null) => void;
  clearSession: () => void;
  bumpData: () => void;
  requestBackfill: (date: string) => void;
  clearBackfill: () => void;
}

export const useNutriStore = create<NutriStore>((set) => ({
  user: null,
  profileBrief: null,
  bootstrapped: false,
  dataVersion: 0,
  backfillRequest: null,
  setSession: (user, profileBrief) => set({ user, profileBrief, bootstrapped: true }),
  clearSession: () => set({ user: null, profileBrief: null, bootstrapped: true }),
  bumpData: () => set((s) => ({ dataVersion: s.dataVersion + 1 })),
  requestBackfill: (date) => set({ backfillRequest: { date, nonce: Date.now() } }),
  clearBackfill: () => set({ backfillRequest: null }),
}));

export const MEAL_TYPES = ["breakfast", "lunch", "snack", "dinner"] as const;

export const MEAL_TYPE_ICON: Record<string, string> = {
  breakfast: "🌅",
  lunch: "🍛",
  snack: "🥜",
  dinner: "🌙",
};

/** Subtle left-accent colors per meal slot on history rows. */
export const MEAL_TYPE_ACCENT: Record<string, string> = {
  breakfast: "bg-amber-400/70",
  lunch: "bg-emerald-500/70",
  snack: "bg-orange-400/70",
  dinner: "bg-rose-400/70",
};

export function mealLabel(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function languageLabel(code: string | undefined | null): string {
  if (!code) return "English";
  const map: Record<string, string> = {
    en: "English",
    ta: "தமிழ் Tamil",
    te: "తెలుగు Telugu",
    hi: "हिन्दी Hindi",
    kn: "ಕನ್ನಡ Kannada",
    "rom-ta": "Tamil (Romanized)",
    "rom-te": "Telugu (Romanized)",
    "rom-hi": "Hindi (Romanized)",
    "rom-kn": "Kannada (Romanized)",
    "rom-en": "English (casual)",
  };
  return map[code] ?? code;
}
