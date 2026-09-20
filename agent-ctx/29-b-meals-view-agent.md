# Task 29-b — Meals view mockup rebuild (work record)

**Owned file (only file touched):** `src/components/nutrislm/views/meals-view.tsx` — export `MealsView` unchanged.

## Data mappings used (exact, verified against types.ts + backend)
- `api.dailySummary(todayKey())` → `DailySummaryResponse`:
  - hero "Total Intake" = `consumed.calories` (formatKcal)
  - hero "Daily Target" = `targets.calories` (formatKcal), `progress = consumed.calories / targets.calories`, `sub = pct(consumed, targets) + "% achieved"` (format.ts `pct`, clamped 0–100)
  - hero "Meals Logged" = `${meals.length} / 5` + 5-dot row
  - Today timeline = `meals: MealDetail[]` in server order
  - "Today's Nutrients" rings = `consumed/targets` of `protein | carbohydrates | fat | fiber`
- `api.dailySummary(yesterdayKey)` → delta sub: `↑/↓ N% vs yesterday` (subTone up/down); yesterday=0 → "No intake logged yesterday"; summary missing → "First logged day" (muted)
- `api.weeklySummary()` → streak card (`streak`), Sparkline `days.map(d => d.calories)` tone rose
- `api.recentMeals()` → bottom strip `meals.slice(0, 4)` (`foods[0]?.name`, `totals.calories`, `eatenAt`)
- `api.hydrationUpdate({ delta: 1 })` → Quick-Add 💧 Water, then `bumpData()` + toast "+1 glass logged"
- **Field corrections vs brief:** `MealFoodDetail.name` (server maps DB `displayName` → `name`); `MealDetail.source` real values are `text|manual|image|recommendation|relog` — **no "verified"/"photo"**. Badge mapping: "Verified ✓" iff every line `foodId !== null`; else "From Scan" iff `source === "image"`; else none.
- Navigation: `setView("log")` (action row ×3, Log a Meal, Fruits/Snacks/Custom, empty state), `setView("insights")` (Details →, View all →, quote arrow).

## Features preserved / upgraded
- Weekly stats hero → upgraded to today/yesterday/week trio with Sparkline.
- `RecentMeals` (full edit/delete history) → lives in the **This Month** tab.
- `ActivityCalendar` → **This Week** (+ tip note) and **This Month** tabs.
- Meal detail expansion → inline expandable timeline cards (`expandedId` state).
- Edit/delete/relog remain reachable (This Month tab); backfill still available via calendar day detail.

## States
- Loading: skeleton StatCards, timeline skeleton, skeleton rings, skeleton strip (all `aria-busy` + sr-only text).
- Errors: `console.warn` only — hero renders without stats, muted dashed notes for day/rings/strip; nothing crashes. Single `Promise.all` on `[dataVersion, selectedDate]` (today + yesterday + weekly + selected-day when ≠ today); independent `recentMeals` effect on `[dataVersion]`.

## Concerns for tsc / next agents
- None known in meals-view.tsx (compiled clean in dev: `✓ Compiled in 180ms`, page 200).
- **Pre-existing, NOT mine:** `views/insights-view.tsx` L35 still imports `HeroStat` from `./view-hero` (export removed) — will fail when Insights compiles; insights owner must migrate to `StatCard`.
- Radix Tabs unmount inactive content → ActivityCalendar refetches on tab switches (by design).
