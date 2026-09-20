/**
 * COACH INTENT DETECTION — deterministic, multilingual, zero-latency.
 *
 * Classifies a free-form user message into one of the coach intents so the
 * right responder runs. Uses keyword/phrase rules across English, Tamil,
 * Telugu, Hindi, Kannada AND romanized Indian-language input. Deterministic
 * detection keeps the coach testable and avoids an extra AI round-trip.
 *
 * Supported intents (matches the product spec):
 *   today_summary | meal_history | next_meal | plan_rest_of_day | daily_plan
 *   nutrition_gap | nutrition_progress | meal_explanation
 *   recommendation_explanation | water_status | weekly_review
 *   meal_swap | food_question | general_nutrition_question
 */
import type { CoachContext } from "./context-builder";

export type CoachIntent =
  | "today_summary"
  | "meal_history"
  | "next_meal"
  | "plan_rest_of_day"
  | "daily_plan"
  | "nutrition_gap"
  | "nutrition_progress"
  | "meal_explanation"
  | "recommendation_explanation"
  | "water_status"
  | "weekly_review"
  | "meal_swap"
  | "food_question"
  | "general_nutrition_question";

export interface DetectedIntent {
  intent: CoachIntent;
  /** Optional structured extras parsed from the message. */
  meta: {
    /** For meal_history: which slice of history the user asks about. */
    historyScope?: "today" | "yesterday" | "week" | "breakfast_habit" | "recent_dinner" | "food_frequency";
    /** A food name extracted for frequency questions ("how often do I eat dosa"). */
    foodName?: string;
  };
}

// Ordered rules — first match wins. Each entry: [intent, patterns].
const RULES: [CoachIntent, RegExp][] = [
  // ---- planning ----
  ["daily_plan", /plan (my )?(entire|whole|full|complete) day|complete diet plan|full day (diet )?plan|entire day|நாள் முழுவதும்|రోజు మొత్తం|पूरा दिन|ದಿನ ಪೂರ್ತಿ/i],
  ["plan_rest_of_day", /plan (the )?rest of (my|the) day|plan my (remaining|day)|what should i plan|மீதி நாள்|మిగిలిన రోజు|बाकी दिन|ಉಳಿದ ದಿನ/i],

  // ---- next meal & swaps ----
  ["meal_swap", /another (meal|dinner|lunch|breakfast|snack|option)|don'?t want this|not this (one|meal)|swap|replace|alternative|give me something else|bejaru|மாற்று|మరో|मार्गदर्शन बदलें|बदलो|ಬದಲಿಸು/i],
  ["next_meal", /what should i eat (next|now|for (dinner|lunch|breakfast|snacks?))|eat next|next meal|suggest (a )?(meal|dinner|lunch|snack|breakfast)|recommend.{0,20}(meal|dinner|food|eat)|hungry|what to eat|em tinali|enna sapadalam|kya khau|enu tindu|என்ன சாப்பிட|ఏమి తినాలి|क्या खाऊँ|ಏನು ತಿನ್ನಬೇಕು/i],

  // ---- explanation ----
  ["recommendation_explanation", /why (this|that) (meal|recommendation|food|dish)|why did you recommend|why do you recommend|why this|reason for (this )?recommendation/i],
  ["meal_explanation", /why (should|do) i (need|eat)|why (more )?(fiber|protein|water|iron)|why are you/i],

  // ---- progress / gaps ----
  ["nutrition_gap", /gaps?|missing|lack(ing)?|deficien|short(fall)?|what am i missing|not eating enough|குறை|లోపం|कमी|ಕೊರತೆ/i],
  ["nutrition_progress", /how (am i|did i) (doing|do)|my progress|today'?s progress|how did i do|on track|doing today|epudu ela|eppadi irukku|kaisa (hai|raha)|hege ide|எப்படி இருக்கிறது|ఎలా ఉంది|कैसा चल रहा|ಹೇಗಿದೆ/i],

  // ---- water ----
  ["water_status", /water|hydrat|glass|paani|thanni|neellu|neeru|தண்ணீர்|నీరు|पानी|ನೀರು/i],

  // ---- weekly / trends ----
  ["weekly_review", /this week|weekly|week review|past (few )?days|last 7|average|consisten(t|cy)|trend|vaaram|vaara|haftar|vaara|வாரம்|వారం|हफ़्ते|वारದ/i],

  // ---- history ----
  ["meal_history", /what did i eat|what (did|have) i (eat|had|logged)|ate (today|yesterday)|yesterday|history|earlier|last (dinner|lunch|breakfast|meal)|usually eat|how often|most recent|logged this week|maine kya khaya|enna sapten|nenu em tinnanu|நேற்று|சாப்பிட்டேன்|నిన్న|తిన్నాను|कल क्या खाया|खाया|ನಿನ್ನೆ|ತಿಂದೆ/i],

  // ---- today summary ----
  ["today_summary", /(what|summary|show|tell).{0,20}today|today'?s (food|meal|summary|nutrition|diet)|my (nutrition )?day|so far today|aaj ka|indraiya|ivvala|இன்று|ఈరోజు|आज|ಇಂದು/i],
];

/** Strong signals checked before the ordered rules. */
const FOOD_ONLY_HINT =
  /calorie|protein|carb|fat|fiber|fibre|sugar|sodium|salt|potassium|phosphorus|cholesterol|saturated|vitamin|iron|calcium|nutrition|healthy|diet|food|meal|eat|drink/i;

export function detectIntent(rawMessage: string, ctx?: CoachContext): DetectedIntent {
  const message = rawMessage.trim();

  for (const [intent, re] of RULES) {
    const m = message.match(re);
    if (!m) continue;

    const meta: DetectedIntent["meta"] = {};

    if (intent === "meal_history") {
      if (/yesterday|நேற்று|నిన్న|निन्नೆ|कल|నిన్న/i.test(message)) meta.historyScope = "yesterday";
      else if (/usually|habit|regularly|mostly/i.test(message) && /breakfast|lunch|dinner|snack/i.test(message)) {
        meta.historyScope = /breakfast/i.test(message) ? "breakfast_habit" : "recent_dinner";
      } else if (/how often|frequency|times/i.test(message)) {
        meta.historyScope = "food_frequency";
        // Try to extract the food name: "how often do I eat dosa" / "dosa epudu"
        const foodMatch =
          message.match(/(?:eat|ate|had|have|order|take)\s+(?:a\s+|an\s+|the\s+)?([a-z][a-z\s]{2,30})/i) ??
          message.match(/([a-z][a-z\s]{2,30})\s+(?:epudu|eppadi|kitni|how many times)/i);
        meta.foodName = foodMatch?.[1]?.trim().replace(/\?+$/, "");
      } else if (/last|most recent|recent/i.test(message)) meta.historyScope = "recent_dinner";
      else if (/week/i.test(message)) meta.historyScope = "week";
      else meta.historyScope = "today";
    }

    return { intent, meta };
  }

  // No rule matched: food/nutrition flavored → general question, else unknown→general
  return { intent: FOOD_ONLY_HINT.test(message) || ctx ? "general_nutrition_question" : "general_nutrition_question", meta: {} };
}

/** Human-readable intent label for audit logs. */
export function intentLabel(intent: CoachIntent): string {
  return intent;
}
