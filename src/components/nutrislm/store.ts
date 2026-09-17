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
  setSession: (user: User | null, profileBrief: AuthProfileBrief | null) => void;
  clearSession: () => void;
  bumpData: () => void;
}

export const useNutriStore = create<NutriStore>((set) => ({
  user: null,
  profileBrief: null,
  bootstrapped: false,
  dataVersion: 0,
  setSession: (user, profileBrief) => set({ user, profileBrief, bootstrapped: true }),
  clearSession: () => set({ user: null, profileBrief: null, bootstrapped: true }),
  bumpData: () => set((s) => ({ dataVersion: s.dataVersion + 1 })),
}));

export const MEAL_TYPES = ["breakfast", "lunch", "snack", "dinner"] as const;

export const MEAL_TYPE_ICON: Record<string, string> = {
  breakfast: "🌅",
  lunch: "🍛",
  snack: "🥜",
  dinner: "🌙",
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
