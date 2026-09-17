/**
 * GET  /api/nutrition/notes-journal
 *   Deterministic aggregation of the user's meal reflection notes (Meal.userNotes,
 *   display-only by design) over the last 30 days: newest-first list, mood
 *   distribution parsed from the known quick-chip phrases, plus weekly stats.
 *
 * POST /api/nutrition/notes-journal   (body: {})
 *   Optional AI reflection over ONLY the deterministic note data. The model
 *   never sees or produces nutrition numbers — it reflects on eating-context
 *   language (moods, occasions). Output JSON-validated; on AI failure a
 *   deterministic template reflection is returned instead.
 *   Rate limited (6 / 5 min / user), cached per note-signature (15 min TTL).
 */
import { NextRequest, NextResponse } from "next/server";
import { withApi, rateLimit } from "@/lib/api-utils";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAiProvider, parseJsonSafe } from "@/lib/ai/provider";

export interface JournalNote {
  id: string;
  date: string;
  mealType: string;
  note: string;
  moods: string[];
}

export interface NotesJournalPayload {
  notes: JournalNote[];
  stats: {
    total: number;
    last7: number;
    last30: number;
    topMood: string | null;
    moodCounts: { mood: string; count: number }[];
  };
}

export interface ReflectionPayload {
  headline: string;
  reflection: string;
  suggestions: string[];
  engineSource: "ai" | "deterministic_fallback";
  generatedAt: string;
  aiNote: string | null;
}

/** Known quick-chip phrases (client MOOD_CHIPS) mapped to stable mood keys. */
const MOOD_PATTERNS: { mood: string; re: RegExp }[] = [
  { mood: "enjoyed", re: /enjoyed it/i },
  { mood: "craving", re: /was craving this/i },
  { mood: "okay", re: /just okay/i },
  { mood: "habit", re: /ate out of habit/i },
  { mood: "stressed", re: /stressful day/i },
  { mood: "fuel", re: /post-workout fuel/i },
];

const MOOD_LABEL: Record<string, string> = {
  enjoyed: "Enjoyed", craving: "Craving", okay: "Just okay",
  habit: "Habit", stressed: "Stressed", fuel: "Fuel", freeform: "Free-form",
};

function moodsOf(note: string): string[] {
  const found = MOOD_PATTERNS.filter((p) => p.re.test(note)).map((p) => p.mood);
  return found.length > 0 ? found : ["freeform"];
}

// ---- reflection cache ----
interface CacheEntry { data: ReflectionPayload; signature: string; at: number }
const CACHE_TTL = 15 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

function signatureOf(notes: JournalNote[]): string {
  return `${notes.length}|${notes[0]?.id ?? "none"}|${notes.reduce((a, n) => a + n.note.length, 0)}`;
}

function buildFallbackReflection(notes: JournalNote[]): ReflectionPayload {
  const moodCounts = new Map<string, number>();
  for (const n of notes) for (const m of n.moods) moodCounts.set(m, (moodCounts.get(m) ?? 0) + 1);
  const top = [...moodCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const topLabel = top ? MOOD_LABEL[top[0]] ?? top[0] : null;
  const last7 = notes.filter((n) => Date.now() - new Date(n.date + "T23:59:59").getTime() <= 7 * 86400000).length;

  const headline = notes.length === 0
    ? "No reflection notes yet"
    : last7 > 0
      ? `${last7} note${last7 === 1 ? "" : "s"} this week`
      : `${notes.length} note${notes.length === 1 ? "" : "s"} in the last 30 days`;

  const body = notes.length === 0
    ? "Whenever a meal carries a feeling — enjoyed, craving, habit, stress — jot a quick note. Over a few weeks your journal becomes a gentle mirror of eating patterns worth noticing."
    : topLabel
      ? `Your most frequent note this month is “${topLabel}” (${top[1]} time${top[1] === 1 ? "" : "s"}). Notes are context, not judgment — looking back at when that feeling shows up (late meals, busy days, certain foods) is often more useful than the feeling itself.`
      : `You've written ${notes.length} free-form note${notes.length === 1 ? "" : "s"} this month. Reading your own words back after a few days is one of the most reliable ways to spot patterns — no scoring, no labels.`;

  const suggestions = notes.length === 0
    ? ["Tap a mood chip after your next meal", "Revisit the journal every Sunday", "Keep notes short — a few honest words beat long essays"]
    : ["Notice when your most common mood tends to appear", "Compare a noted week with an un-noted week", "Keep notes judgment-free — they're data, not grades"];

  return {
    headline,
    reflection: body,
    suggestions,
    engineSource: "deterministic_fallback",
    generatedAt: new Date().toISOString(),
    aiNote: null,
  };
}

async function loadJournal(userId: string): Promise<NotesJournalPayload> {
  const since = new Date(Date.now() - 30 * 86400000);
  const meals = await db.meal.findMany({
    where: { userId, userNotes: { not: null }, eatenAt: { gte: since } },
    select: { id: true, eatenAt: true, mealType: true, userNotes: true },
    orderBy: { eatenAt: "desc" },
    take: 40,
  });

  const notes: JournalNote[] = meals.map((m) => ({
    id: m.id,
    date: m.eatenAt.toISOString().slice(0, 10),
    mealType: m.mealType,
    note: (m.userNotes ?? "").slice(0, 500),
    moods: moodsOf(m.userNotes ?? ""),
  }));

  const moodCounts = new Map<string, number>();
  for (const n of notes) for (const m of n.moods) moodCounts.set(m, (moodCounts.get(m) ?? 0) + 1);
  const moodCountsArr = [...moodCounts.entries()]
    .map(([mood, count]) => ({ mood, count }))
    .sort((a, b) => b.count - a.count);
  const last7 = notes.filter((n) => Date.now() - new Date(n.date + "T23:59:59").getTime() <= 7 * 86400000).length;

  return {
    notes,
    stats: {
      total: notes.length,
      last7,
      last30: notes.length,
      topMood: moodCountsArr[0]?.mood ?? null,
      moodCounts: moodCountsArr,
    },
  };
}

export const GET = withApi("notes_journal", async () => {
  const user = await requireUser();
  return NextResponse.json(await loadJournal(user.id));
});

export const POST = withApi("notes_journal_reflect", async ({ req }: { req: NextRequest }) => {
  const user = await requireUser();
  rateLimit("notes_journal_reflect", user.id, 6, 5 * 60 * 1000);

  // Body intentionally ignored — the reflection always runs on server-computed data.
  await req.json().catch(() => null);

  const journal = await loadJournal(user.id);
  const sig = signatureOf(journal.notes);

  const cached = cache.get(user.id);
  if (cached && cached.signature === sig && Date.now() - cached.at < CACHE_TTL) {
    return NextResponse.json({ ...cached.data });
  }

  const fallback = buildFallbackReflection(journal.notes);

  const moodLine = journal.stats.moodCounts
    .map((m) => `${MOOD_LABEL[m.mood] ?? m.mood}: ${m.count}`)
    .join(", ") || "none";

  const noteExcerpts = journal.notes.slice(0, 20).map((n) => `- (${n.date} ${n.mealType}) "${n.note.slice(0, 120)}"`);

  const provider = getAiProvider();
  const prompt = [
    {
      role: "system" as const,
      content:
        "You are a warm, non-judgmental reflective journaling companion inside a nutrition tracking app. You receive the user's own meal notes (already collected) and their mood tallies. RULES: never mention specific nutrition numbers, calories, grams, or give medical/dietary advice; never suggest or avoid specific foods or allergens; reflect gently on patterns of context and feeling (timing, mood, habit); keep an encouraging, honest tone; keep every sentence under 40 words. Reply ONLY with JSON: {\"headline\": string (max 90 chars), \"reflection\": string (3-6 sentences), \"suggestions\": string[3] (each max 160 chars, behavioural nudges about noticing/journaling — NOT food advice)}.",
    },
    {
      role: "user" as const,
      content: [
        `Mood tallies (last 30 days): ${moodLine}`,
        `Notes (${journal.notes.length} total, ${journal.stats.last7} in the last 7 days):`,
        ...(noteExcerpts.length > 0 ? noteExcerpts : ["- (no notes yet)"]),
        "Write the reflection JSON now.",
      ].join("\n"),
    },
  ];

  const ai = await provider.chat(prompt, { maxTokens: 700 });
  let payload: ReflectionPayload = fallback;
  let aiNote: string | null = null;

  if (ai.ok) {
    const parsed = parseJsonSafe<Partial<ReflectionPayload>>(ai.content);
    if (
      parsed &&
      typeof parsed.headline === "string" && parsed.headline.trim().length > 3 && parsed.headline.length <= 120 &&
      typeof parsed.reflection === "string" && parsed.reflection.trim().length > 20 && parsed.reflection.length <= 1200 &&
      Array.isArray(parsed.suggestions) && parsed.suggestions.length >= 1 && parsed.suggestions.length <= 4 &&
      parsed.suggestions.every((s) => typeof s === "string" && s.trim().length > 5 && s.length <= 220)
    ) {
      payload = {
        headline: parsed.headline.trim(),
        reflection: parsed.reflection.trim(),
        suggestions: parsed.suggestions.map((s) => s.trim()).slice(0, 3),
        engineSource: "ai",
        generatedAt: new Date().toISOString(),
        aiNote: null,
      };
    } else {
      aiNote = "AI response did not pass validation — showing a rule-based reflection instead.";
      payload = { ...fallback, aiNote };
    }
  } else {
    aiNote = "AI was unavailable — showing a rule-based reflection instead.";
    payload = { ...fallback, aiNote };
  }

  cache.set(user.id, { data: payload, signature: sig, at: Date.now() });
  return NextResponse.json(payload);
});
