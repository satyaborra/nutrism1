# Task 29-e — goals-view.tsx mockup rebuild (work record)

Agent: Z.ai Code (subagent 29-e)
Ownership: ONLY /home/z/my-project/src/components/nutrislm/views/goals-view.tsx (full rewrite, export GoalsView unchanged). No other file touched. tsc/eslint/dev-server-restart intentionally NOT run per task rules.

## What was read first
- worklog.md Task 28 (+ 28-a/b/c): project state, file-ownership rules, premium design language.
- goals-view.tsx (old): preserved api.milestones() usage, refetch-on-dataVersion, alive-guard + post-await setState pattern.
- milestones-strip.tsx: celebration logic ported verbatim (localStorage "nutrislm.unlocks.seen.v1", ConfettiBurst, toast) because the strip is no longer mounted and had no other consumer.
- store.ts: dataVersion, setView("log"/"insights"). api.ts: milestones() L189, coachInsight() L126 (NOT weeklySummary — hero has no stats per mockup). types.ts: MilestonesResponse L698 {milestones, achievedCount, totalCount, stats{totalMeals, loggingStreak, daysLogged90d, hydrationHeroDays, foodsTried}}, Milestone L686 {id,label,description,icon,value,goal,achieved,progress 0..1}, CoachInsightResponse L381 {headline,insight,focus,evidenceSources,engineSource,aiNote,...}.
- view-hero.tsx: exports ViewHero/StatCard/Sparkline/toneStroke/Tone — NO HeroStat export (other views' in-flight HeroStat imports caused transient 500s in dev.log; not my file).
- donut.tsx: single-ring (value/max/tone) + segments mode ({value,tone}[] normalized by sum), children center slot.
- ui/: card (rounded-xl py-6 gap-6 defaults → overridden gap-0 rounded-3xl p-5), select, separator (vertical), skeleton, button, badge unused.
- milestones route.ts: actual ids → category mapping source of truth. public/images/hero-mountains.png exists. globals.css has confetti-fall/unlock-pulse/font-script.

## Category mapping (from runtime ids)
Rules over milestone.id (lowercased regex):
- t2dm|ckd|cvd|sodium|bp|blood|diabet → Health & Medical
- photo|scan|lens|notes|journal → Lifestyle
- coach|ask|explore|learn|feedback → Learning
- streak|log|consistent|meal → Streaks
- hydration|water|veg|fruit|salt → Nutrition
- no match → "Others" pill (rendered only when this happens; never with current ids)

Found ids → buckets: first-meal/meals-10/meals-50/streak-3/streak-7 → Streaks (5); hydration-1/hydration-5 → Nutrition (2); explorer-10/coach-1/feedback-1 → Learning (3); photo-1/notes-3 → Lifestyle (2); Health & Medical → 0 (pill still renders per spec; empty-filter card covers clicks).

## Data mappings
- Header donut: value=achievedCount max=totalCount, center "{a}/{t}" + "Completed"; streak chip stats.loggingStreak (0 → "Log today to start a streak").
- Summary donut segments: completed=achievedCount (emerald), inProgress=count(!achieved && progress>0) (amber), notStarted=totalCount−completed−inProgress (teal) — subtraction guarantees segment proportions sum to the ring.
- Grid: achieved first then progress desc; filter = category pill ∧ status select (all/progress/done where progress=!achieved).
- Upcoming: locked, progress desc, top 5; mini bar + pct.
- Coach card: independent fetch (so a slow AI call never blocks the board), loading skeleton, silent fail → hidden; button → setView("insights").

## Decisions / spec interpretations (flag to orchestrator)
1. Status Select: options exactly "All goals / In progress / Completed", default "All goals" (trigger shows the selection). The mockup's literal "Active Goals" trigger text was treated as decorative — showing "Active Goals" while filtering everything would be dishonest, and a default of in-progress-only would hide achieved cards that spec §4 explicitly styles.
2. "notStarted" donut tone: Donut's Tone union has no gray; used "teal" per the spec's own suggestion (legend dots match bg-teal-500). True gray would need a donut.tsx Tone extension (not my file).
3. meal→Streaks: "meal" isn't in the spec keyword lists; milestone descriptions ("Log your very first meal", "Log 10/50 meals") make them logging achievements, so they ride the streak/log/consistent bucket. Notes→Lifestyle, feedback→Learning are the same class of sensible extension.
4. Separator vertical height set via inline style (56px) — the component's data-[orientation=vertical]:h-full utility would out-specify a plain h-14.
5. Unlock celebration (confetti+toast) ported into goals-view instead of mounting MilestonesStrip — mockup has no strip; keeping both would duplicate milestone UI and double-toast.

## Concerns for tsc
- None known. Strict-safe typing (useRef<HTMLDivElement | null>, Select onValueChange cast to StatusFilter, pills typed CategoryFilter). The ConfettiBurst "@ts-expect-error" CSS-var line was copied verbatim from milestones-strip (it does suppress a real error there; if the underlying error ever disappears, the expect-error itself would flag — identical risk profile as the existing strip, no new surface).
- dev.log verified: my file produced zero compile errors; transient GET / 500s during the session came from meals-view/insights-view importing HeroStat (parallel agents, since resolved — page returns 200).
