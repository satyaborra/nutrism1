# Task 29-c — Insights view mockup rebuild (work record)

**Owned file (only file touched):** `src/components/nutrislm/views/insights-view.tsx` — export `InsightsView` unchanged. No other file modified; no tsc/lint run; dev server untouched.

## Data mappings used (verified against types.ts + api.ts + backend log)
- One `Promise.all([api.weeklySummary(), api.weeklyDigest(), api.dailySummary(todayKey()), api.hydration()])` in `useEffect` keyed `[dataVersion]`; silent `catch` → `console.warn` + `failed` flag (hero renders without stats, cards show dashed unavailable notes, one full-width reassurance banner).
- **StatCards** (own full-width grid `grid-cols-2 lg:grid-cols-5` below the hero band):
  - Calories: Flame rose, `formatKcal(weeklySummary.avgCalories)`; sub = delta vs last week — `pct = round(|caloriesDelta| / (avgCalories − caloriesDelta) × 100)` when `comparison.available && caloriesDelta != null && prevAvg > 0`, ↓→"up"/↑→"down" per spec, else `${daysLogged}/7 days logged`; Sparkline `days.map(calories)` rose.
  - Protein: Target emerald, `formatNumber(weekTotals.protein) + " g"` (rounded — raw float would render "412.75 g"); sub = proteinDelta pattern (increase→up/good, decrease→down) else `target ${targets.protein} g`; Sparkline protein emerald.
  - Fiber: Leaf teal, avg of `days[].fiber` → `.toFixed(1) g`; sub `↑ fiber-rich week` (≥25) / `aim for 25 g+`; Sparkline fiber teal.
  - Water: Droplet blue, `${formatShort(digest.hydration.avgGlasses ?? 0)} / goal glasses`; `progress = avg/goal`; extra = 8 tiny bars (`bg-sky-500` filled `round(avg)` capped 8, rest `bg-muted`); sub `today ${hydration.glasses} / ${hydration.goal}` (this is the honest use of the 4th Promise.all member).
  - Days logged: CalendarCheck purple, `${digest.daysLogged} / 7`; sub `${digest.adherence}% on target`; extra = 7 dots (purple when `day.calories > 0`) — spec offered "Sparkline(0/1) or dots".
- **Calorie Trend**: recharts BarChart over `weeklySummary.days` (label = `format(parseISO(date), "EEE")`, calories gated on `meals > 0`), h-64 ResponsiveContainer; gradient `#10b981→#5eead4` via `<defs><linearGradient id="insights-cal-bar">`, today solid `#059669` (`d.date === todayKey()`); ReferenceLine `y=targets.calories` `#f59e0b` "6 4" + insideTopRight label; YAxis `0..ceil(max(target,max)×1.2/100)×100`; CartesianGrid `stroke #94a3b8` opacity .25 (theme-agnostic per spec); custom kcal tooltip; HTML legend (dot Actual / dashed Target N).
- **Macro Distribution**: Donut `segments=[{carbohydrates:orange},{protein:emerald},{fat:amber},{fiber:purple}]` size 150 stroke 16, center `formatNumber(consumed.calories)` + "kcal"; legend rows dot+name+`formatGrams`+pct of macro-sum; pill: `protein >= targets.protein` → "Well balanced!…" else "Boost protein — you're at X% of target." (X raw, unclamped); zero-macro → "Log your meals today…" empty state; CardDescription "Today".
- **Meal Timing**: 4 rows Breakfast/Lunch/Dinner/Snacks = `dailySummary.meals` grouped by `mealType`, `sum(totals.calories)`, pct of slot-sum; tones amber/emerald/teal/purple (spec order); no meals → "Log meals to see timing."
- **Nutrient Intake**: protein/carbohydrates/fat/fiber vs `today.targets`, tones emerald/blue(sky)/orange/purple; `x / y g` (Math.round); pct Badge emerald 60–110 / amber >110 / rose <40 / muted 40–59 (spec had no rule for 40–59 — chose muted as the honest default); progress fill clamped 0..1.
- **Coach Focus**: own `api.coachInsight(false)` on `[dataVersion]` (cached server-side), refresh → `coachInsight(true)`; headline bold + engineSource badge, insight muted, `focus[]` as outline Badges, `evidenceSources.join(" · ")` tiny with BadgeCheck; 429 → "coach needs a short break" note; failure → deterministic fallback note. **Honest substitution for the mockup's mood chart (no mood API exists).**
- **Key Insights**: 3 real digest rows — `${adherence}% of logged days on target`/"within ±10% of the calorie goal" (Target emerald); bestDay `EEE d MMM` at N kcal + "Δ% off target" or "No best day yet" (Award emerald); `${formatShort(avg) or 0} / goal glasses` + "daily water average vs goal" (Droplet blue). "See all →" opens WeeklyDigestDialog by stretching its invisible internal DialogTrigger over the styled label (28-b proven pattern, has-[:focus-visible] ring).
- **Top Foods**: `digest.topFoods.slice(0, 5)`, bar width `count/maxCount` (min 6% visual), count tabular-nums; empty + unavailable states.
- **Quote card**: static, hero-leaves.png at 8% masked, font-script "Progress, not perfection." — NutriSLM, 3 outline chips (Heart/Activity/Droplet icons).
- **Coach card**: `AiCoach` wrapped in premium Card titled "Ask NutriSLM Coach". **`NotesJournal`** full-width below.

## Deviations (documented, intentional)
1. **StatCards render below the hero band, not via the `stats` prop**: ViewHero hardcodes its in-band stats grid to `sm:grid-cols-2 lg:grid-cols-4` inside a `max-w-2xl` text column — 5 columns there ≈122px/card (severe value truncation). Own grid outside gives the spec'd `grid-cols-2 lg:grid-cols-5` and matches the mockup (stats row under the gradient band). ViewHero untouched.
2. Water card gained a `sub` ("today X / Y glasses") so the spec-mandated `hydration()` fetch is used honestly instead of being destructured away.
3. "Days logged" extra = dots (spec's second option) — reads better than a 0/1 step sparkline.
4. Protein week total rendered via `formatNumber` (rounds) — `${raw}` could print "412.75000001 g".

## States / a11y / dark
- Loading: skeleton StatCards + per-card skeletons (all `aria-busy` + sr-only text). Failure: `console.warn` only; per-card dashed notes + one banner; rows 1–2 hidden when bundle fails, bottom row still renders (Quote/Coach are data-free).
- Single h1 (in ViewHero); CardTitle is a `<div>` (no heading-order issue); decorative icons/chips/dots/bars `aria-hidden`; tabular-nums on every number; `min-w-0` on grid cards/rows; recharts only inside ResponsiveContainer; gradient/axis/grid colors are hex (theme-safe), text colors use dark: variants.
- Blue appears ONLY as water/carb data accents (sky bars, Droplet chips, carb row) — no blue/indigo chrome.

## Verification / concerns for tsc
- dev.log after write: `✓ Compiled` (180ms), zero insights-view errors; the `HeroStat`-import errors earlier in dev.log were the pre-rewrite state (insights L35) and an intermediate meals-view state — both since fixed (meals-view now imports StatCard; my file never used HeroStat).
- Only expected unauthenticated 401 probes in log (coach-insight/milestones/notes-journal) — CoachFocusCard auto-fetch + NotesJournal degrade gracefully when signed out.
- tsc risks reviewed: recharts custom Tooltip matches the proven weekly-trends pattern; `LucideIcon` type import used for NUTRIENT_ROWS; `React.ReactNode` UMD-type usage mirrors view-hero.tsx/donut.tsx precedent; Donut segments typed `{value:number; tone:Tone}`; duplicate `./view-hero` import statements (value + `import type { Tone }`) mirror donut.tsx precedent.
- **Coordinator note:** `WeeklyDigestDialog` remains self-triggering — "See all →" uses the invisible-trigger overlay; there are now 3 dialog instances across views (independent Radix roots, no conflict).
