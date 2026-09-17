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
