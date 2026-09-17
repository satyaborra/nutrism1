# NutriSLM — Worklog

Project: NutriSLM — Multimodal Personalized Nutrition Intelligence Platform
Stack: Next.js 16 (App Router, single route `/`), TypeScript, Prisma + SQLite, shadcn/ui, Tailwind 4, z-ai-web-dev-sdk (LLM+VLM, backend only).

Architecture principles (from product spec):
- AI understands food → DB provides facts → deterministic code calculates → RAG provides evidence → constraints protect personalization → SLM reasons/ranks → validators verify → UI presents. NEVER reversed.
- LLM is never the source of nutrition numbers. Never trust frontend nutrition values. Idempotent meal logging. Transactions for logging. Structured errors + observability. Configurable disease constraints (T2DM/CKD/CVD). Multilingual (en/ta/te/hi/kn + romanized).

---
Task ID: 0
Agent: Z.ai Code (orchestrator)
Task: Project inspection + plan

Work Log:
- Read full product spec (upload/Pasted Content_1789631420537.txt)
- Inspected scaffold: Next.js 16 + shadcn/ui + Prisma(SQLite at db/custom.db) template
- Loaded LLM + VLM skill docs (z-ai-web-dev-sdk backend usage: chat.completions.create / createVision)
- Created todo plan (tasks 1-10)

Stage Summary:
- Plan: schema+seed → core libs → AI/RAG → recommendation engine → APIs → frontend SPA → browser verification → docs → cron review job
- RAG note: sandbox cannot run FAISS/BGE; implementing honest lightweight TF-IDF cosine retrieval over a curated evidence corpus (WHO/ICMR/NIN/ADA/KDIGO-derived public guidance snippets) stored in DB with source metadata. Clearly documented, no false claims.

---
---
Task ID: 1-6 (backend foundation through APIs)
Agent: Z.ai Code (orchestrator)
Task: Database, seed, core libs, AI layer, RAG, recommendation engine, all API routes

Work Log:
- Prisma schema: User, Profile, Food, FoodAlias, Meal, MealFood, AnalysisDraft, Evidence, DiseaseConstraint, MealTemplate, RecommendationHistory, AuditLog. Pushed to db/custom.db.
- Seed (scripts/seed.ts, `bun run db:seed`): 52 canonical foods w/ IFCT2017/USDA-referenced nutrient values per reference unit; ~200 multilingual+romanized aliases (en/ta/te/hi/kn/rom); 20 evidence docs (WHO/ICMR-NIN/ADA/KDIGO/AHA/USDA/IFCT) w/ source metadata; 10 evidence-backed disease constraints (T2DM/CKD/CVD) stored in DB (configurable, not hard-coded); 21 meal templates; demo user demo@nutrislm.app/demo1234 (vegetarian, T2DM, peanut allergy).
- Core libs: format.ts (centralized rounding: 17.56->17.6 g), observability.ts (request_id spans + AuditLog persistence), api-utils.ts (AppError -> structured {error:{code,message,request_id}}, withApi wrapper, in-memory rate limiting), auth.ts (scrypt passwords + HMAC-signed httpOnly session cookie).
- i18n/languages.ts: script-based detection (Tamil/Telugu/Kannada/Devanagari ranges) + romanized heuristics ("rendu idli tinna" -> rom-ta). Latin is NOT assumed English.
- nutrition/: food-repository.ts (alias index cache, exact->word matching, ambiguous candidate lists, unit conversion via household-gram approximations), calculator.ts (NutrientValue = qty x per-reference; SUM for meal/day — ONLY source of numbers), targets.ts (Mifflin-St Jeor + activity + goal, ICMR-NIN protein, ADA fiber 14g/1000kcal, KDIGO CKD 0.8g/kg, WHO sodium), disease-engine.ts (applies DB constraints; COMPLIANT/POTENTIALLY_NON_COMPLIANT/INDETERMINATE), meal-service.ts (daily summary from persisted meals only).
- ai/: provider.ts (AiProvider interface + ZAiProvider via z-ai-web-dev-sdk; chat + createVision(model glm-4.6v); robust JSON extraction — swap-ready for Mistral/local SLM), food-analysis.ts (perception flow: text any-language + VLM image; never supplies nutrition; AI-failure fallback = offline token/alias parser; quantity_source user/estimated/unknown), ranking.ts (SLM reasoning over pre-validated candidates; numbers provided, DO-NOT-CHANGE rules), validator.ts (nutrition consistency ±2%, candidate existence, allergy + diet checks; deterministic fallback reason).
- rag/retriever.ts: honest TF-IDF cosine over evidence corpus w/ tag boosts + source attribution (documented as lightweight lexical retrieval, NOT FAISS/BGE).
- recommendation/engine.ts: full pipeline (context -> template candidates -> deterministic nutrition -> allergy/diet/constraint screen -> score vs remaining + diversity penalty -> RAG -> AI rank -> validate -> deterministic fallback -> persist RecommendationHistory).
- API routes: /api/auth/{register,login,logout,me}, /api/profile (GET/PUT, validated), /api/foods/search, /api/nutrition/{analyze-food,confirm-food,log-meal,recent-meals,daily-summary,next-meal}, /api/health. log-meal: idempotency via unique requestId, $transaction, server-side recompute, recommendation invalidation. analyze-food: rate limited 20/5min, image saved to disk (uploads/) not DB.
- tsc clean for src/.

Stage Summary:
- Full backend pipeline implemented per spec: AI understands -> DB facts -> deterministic calc -> constraints -> RAG -> SLM rank -> validator -> API. All routes ready for frontend integration. Demo user + seed data live.
---
Task ID: 7-8 (frontend SPA + browser verification)
Agent: Z.ai Code (orchestrator)
Task: Build the full NutriSLM frontend SPA on the single `/` route and verify end-to-end with agent-browser

Work Log:
- Theme: switched shadcn tokens to emerald/green primary (light+dark) in globals.css; next-themes ThemeProvider in layout.tsx; proper NutriSLM metadata + viewport.
- Frontend architecture (src/components/nutrislm/): app.tsx (session bootstrap via /api/auth/me), store.ts (zustand: user/profileBrief/bootstrapped/dataVersion bump), app-shell.tsx (sticky header + theme toggle + user menu; sticky footer via min-h-screen flex-col + mt-auto), auth-view.tsx (login/register tabs + one-click demo login), dashboard.tsx, greeting.tsx (time-slot aware), summary.tsx (SVG calorie ring, nutrient bars w/ over-target destructive state, compliance alerts w/ evidence sources), food-logger.tsx (3-step wizard: text/photo input -> AI analyze -> editable review with ambiguous-candidate chips, unmatched->DB search resolver, qty/unit editing, add-manual search, confirm-food preview with per-line source + conversion notes + compliance -> log-meal), recommendation-card.tsx (AI-ranked selected + alternatives + explanation + key factors + RAG evidence accordion + log-from-rec), recent-meals.tsx (collapsible per-food detail), profile-dialog.tsx (full profile editor, allergen/condition toggles, target overrides, computed targets grid + notes).
- lib/client/api.ts: typed fetch wrapper parsing structured {error:{code,message,request_id}} into ApiError; fileToDataUrl for photo upload.
- Backend fix: log-meal `source` now explicit ("text"|"manual"|"recommendation", body-validated, draftId=>"text" fallback) so text-logged meals no longer mislabeled "recommendation".
- Lint clean (fixed: setState-in-effect in ThemeToggle/Greeting via CSS-driven icons + rAF, empty interface in engine.ts, unused eslint-disable directives, unused imports). tsc clean for src/.
- Browser verification (agent-browser): auth view renders; demo login works; dashboard summary live-updates (246 kcal after log); analyze "2 idli and one cup sambar" (AI 13.5s) -> matched Idli+Sambar -> confirm (246 kcal, All items verified) -> logged; romanized Tamil "rendu dosa, oru cup chaya" -> Dosa matched 90%, Chaya unmatched -> search-resolved to Masala Chai -> 351 kcal verified w/ conversion note + IFCT2017 source; recommendation engine (AI-ranked, fit score, T2DM sugar warning, 2 alternatives, 3 evidence docs w/ KDIGO/ICMR-NIN sources) -> logged 255 kcal; recent meals expand w/ per-food totals; profile edit (weight 74->75) recomputed targets 2558->2573 kcal; register new user works w/ default targets; dark mode + 390px mobile verified; sticky footer verified on mobile; zero console errors / zero backend errors.

Stage Summary:
- Full-stack product complete: multimodal food logging (any-language text + photo), deterministic nutrition, configurable disease constraints with cited evidence, RAG-backed AI recommendations, idempotent logging, profile-driven targets.
- All flows browser-verified green-path. Demo data (2 meals) left on demo user for preview richness.
- Known minor: recommendations are session-only (fresh state on reload); photo flow uses VLM and was verified working earlier via API (image upload UI wired, untested in browser due to file-upload automation constraints).
---
Task ID: r2 (cron review round 2 — features + styling)
Agent: Z.ai Code (orchestrator, scheduled webDevReview)
Task: QA assessment + new features (hydration, weekly trends, streak) + styling polish

Work Log:
- QA baseline: browser smoke test passed (demo login, dashboard data intact, no runtime errors). Dev log clean apart from expected unauthenticated /api/auth/me 401s.
- FEATURE hydration: Prisma model HydrationLog (userId+date unique, glasses 0..30) pushed to DB; API GET/POST /api/nutrition/hydration (delta or absolute, server-clamped, 1 glass=250ml, goal 8); UI HydrationWidget with animated glass bars, optimistic +/-, goal-reached state, teal styling.
- FEATURE weekly trends: API GET /api/nutrition/weekly-summary (last-7-day deterministic aggregation over meals: calories/protein/fiber/sugar/sodium/day, meals count, calorie+protein targets, logging streak, week totals + avg); UI WeeklyTrends recharts bar chart with Calories/Protein tabs, orange dashed target ReferenceLine, muted bars for no-log days, custom tooltip, k-formatting for kcal axis, streak flame badge; refreshes on dataVersion bump.
- Registered new Operation names in observability.ts (hydration_get/hydration_post/weekly_summary).
- STYLING: greeting now a gradient panel (primary/10 -> background) with blurred decorative orbs; framer-motion FadeIn staggered entrance for all dashboard sections; auth hero gained icon feature bullets + stronger logo shadow; hydration teal theme accents.
- BUGFIX (infra): hydration initially returned INTERNAL_ERROR — running dev server held a stale PrismaClient (created before schema push; globalThis singleton). Killed old dev server tree and relaunched `bun run dev` (setsid, detached). Verified hydration endpoints incl. clamping (99->30, -100->0) and streak/weekly API responses.
- BUGFIX (chart): Y-axis ticks clipped by width=44 -> compact k-formatting + width 52 + tickCount 5; ReferenceLine now labelled "target 2,573" and always visible via domain [0, max(target,max)*1.2 rounded].
- Verified in browser: trends chart (both tabs, target line, streak badge), hydration widget interaction (4->5 glasses, 1250ml, 63%), greeting gradient, auth feature list; protein tab shows avg 2.7g vs 68g target. Lint + tsc clean; 0 console errors on fresh load (earlier console noise was stale HMR artifacts).

Stage Summary:
- Dashboard now has: daily summary, 7-day trends + streak, food logger, recommendations, hydration tracker, recent meals, profile.
- Dev server restarted (was stale-prisma); new Prisma models live: HydrationLog.
- Known minor: 401 audit noise from /api/auth/me when logged out is expected but could be downgraded to status "ok" w/ note to reduce alert fatigue; weekly chart server-local date keys (same convention as daily-summary).
- Next-round suggestions: (1) delete/edit logged meals UI, (2) food detail popover with full nutrient panel, (3) weekly CSV export, (4) AI coach insights (rate-limited LLM note on today's data), (5) photo-flow e2e via generated image, (6) reduce 401 audit noise.
