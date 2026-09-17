/**
 * Multilingual system: supported languages, script-based detection, romanized hints.
 * Canonical food identity is language-independent — detection only guides UX and AI prompting.
 */

export const SUPPORTED_LANGUAGES = ["en", "ta", "te", "hi", "kn"] as const;
export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_META: Record<LanguageCode, { label: string; native: string }> = {
  en: { label: "English", native: "English" },
  ta: { label: "Tamil", native: "தமிழ்" },
  te: { label: "Telugu", native: "తెలుగు" },
  hi: { label: "Hindi", native: "हिन्दी" },
  kn: { label: "Kannada", native: "ಕನ್ನಡ" },
};

export type DetectedLanguage = LanguageCode | `rom-${LanguageCode}`;

interface ScriptRange {
  code: LanguageCode;
  name: string;
  regex: RegExp;
}

const SCRIPTS: ScriptRange[] = [
  { code: "ta", name: "Tamil", regex: /[\u0B80-\u0BFF]/ },
  { code: "te", name: "Telugu", regex: /[\u0C00-\u0C7F]/ },
  { code: "kn", name: "Kannada", regex: /[\u0C80-\u0CFF]/ },
  { code: "hi", name: "Devanagari", regex: /[\u0900-\u097F]/ },
];

// Romanized Indic vocabulary — presence suggests the Latin text is NOT plain English.
const ROMANIZED_HINTS = [
  "tinna", "tinda", "thinna", "sapten", "saptenu", "saapten", "sapta", "khaaya", "khaya",
  "tinava", "tinnava", "saapidicha", "thindruven", "hanikide", "tindenu",
  "rendu", "eradu", "naanu", "nanu", "naan", "nenu", "idli", "dosai", "vadai", "sambar",
  "saaru", "rasam", "chaaru", "katori", "pachadi", "chudu", "konum", "vaangi", "thindu",
  "roti", "chapati", "annam", "sadam", "chawal", "dal", "pappu", "paruppu", "doodh", "paal", "haalu",
  "thayir", "perugu", "mosaru", "dahi", "kela", "aratikaya", "balehannu",
  "kaapi", "chai", "chaaya", "elaneer", "majjiga", "moru", "chaas",
];

export interface LanguageDetection {
  language: DetectedLanguage;
  script: string;
  confidence: number;
  method: "script" | "romanized_heuristic" | "default";
}

/** Detect language from raw input. Latin alphabet is NOT assumed to be English. */
export function detectLanguage(input: string): LanguageDetection {
  const text = input.trim();
  if (!text) return { language: "en", script: "latin", confidence: 0.3, method: "default" };

  for (const s of SCRIPTS) {
    const matches = text.match(new RegExp(s.regex, "g"));
    if (matches && matches.length > 0) {
      const letterCount = text.replace(/\s/g, "").length || 1;
      return {
        language: s.code,
        script: s.name,
        confidence: Math.min(0.95, 0.5 + matches.length / letterCount),
        method: "script",
      };
    }
  }

  // Romanized heuristic: token overlap with known Indic romanized vocabulary
  const tokens = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  let hits = 0;
  for (const t of tokens) {
    if (ROMANIZED_HINTS.some((h) => t === h || (t.length > 3 && t.startsWith(h)))) hits++;
  }
  if (hits > 0 && tokens.length > 0) {
    const base: LanguageCode = guessRomanizedBase(tokens);
    return {
      language: `rom-${base}`,
      script: "latin_romanized",
      confidence: Math.min(0.85, 0.45 + hits / tokens.length),
      method: "romanized_heuristic",
    };
  }

  return { language: "en", script: "latin", confidence: 0.5, method: "default" };
}

function guessRomanizedBase(tokens: string[]): LanguageCode {
  const joined = tokens.join(" ");
  if (/(tinna|sapten|saapten|thinna|saapidicha|thindruven|vazhai|thayir|kaapi|saapida|vaangi)/.test(joined)) return "ta";
  if (/(tinava|tinnava|chudu|nenu|perugu|pulusu|tinanu|mirapakaya)/.test(joined)) return "te";
  if (/(tindenu|hanikide|balehannu|mosaru|annatone|maadidenu|tinde)/.test(joined)) return "kn";
  if (/(khaya|khaaya|maine|khana|doodh)/.test(joined)) return "hi";
  return "en";
}

export function isSupportedLanguage(v: string | null | undefined): v is LanguageCode {
  return !!v && (SUPPORTED_LANGUAGES as readonly string[]).includes(v);
}
