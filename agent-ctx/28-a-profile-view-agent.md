# Task 28-a — profile-view agent work record

Task ID: 28-a
Agent: Z.ai Code (profile-view agent)
Sole file ownership: src/components/nutrislm/views/profile-view.tsx (no other file modified)

## What was done
- Rebuilt `/home/z/my-project/src/components/nutrislm/views/profile-view.tsx` from the old PageHeader version to the premium design language (ViewHero + HeroStat, rounded-3xl emerald/sage cards, amber/rose accents, staggered FadeIn, tabular-nums, dark-mode variants).
- Read prior context: worklog 25-backfill entry, view-hero.tsx APIs, old profile-view, store.ts, types.ts, profile-dialog.tsx, card.tsx (CardAction verified), fade-in.tsx, api.ts, format.ts, /api/profile route (server validation ranges).

## Key implementation points
- Hero: ViewHero with firstName-aware subtitle (store `user?.name.split(" ")[0]`), script "Know Your Numbers", image /images/dish-dosa.png, 🎯 goal chip (`border-primary/30 bg-primary/10 text-primary`, humanized GOAL_LABELS, "No goal set yet" when null), "Edit full profile" button -> controlled ProfileDialog, 3 HeroStats (Flame calories emerald, Drumstick protein teal, Zap TDEE amber) only when `data` present.
- Basic Information inline editing: Age/Height/Weight inputs with `sanitizeNumeric` (digits + single dot), server-mirrored ranges age 5-120 / heightCm 80-250 / weightKg 15-400 with exact server messages; inline `role="alert"` errors, `aria-invalid` red ring (Input built-in), save blocked, first invalid scrolled into view (scroll-mt-24 + scrollIntoView + focus), destructive toast "Please correct the highlighted fields"; valid -> `api.updateProfile` -> `setData(response)` + `bumpData()` + success toast; ApiError -> "Could not save profile" toast, editing kept. Sex/Activity/Goal display-only rows; "— not set" for nulls.
- Daily targets: gradient calorie hero + amber "⚡ Custom override · <value>" Badges (calorie/protein overrides), 6 mini cells BMR/TDEE/Protein/Carbs/Fat/Fiber with icons and tones, footnote "Deterministic engine output — recomputed on every profile save."
- Diet & safety: mono uppercase chips for dietaryPreference + language (`languageLabel(p.language ?? profileBrief?.language)`), rose chips for T2DM/CKD/CVD, amber chips for allergies, muted empty states.
- How computed: pipeline chips (BMR -> TDEE -> goal -> clinical constraints), preserved `targetNotes` bullets, source chips IFCT 2017 · USDA · WHO · ICMR-NIN · ADA · KDIGO, not-medical-advice disclaimer.
- Data loading: effect keyed `[editorOpen, dataVersion, reloadKey]` (NO useCallback), one silent 900ms retry before error banner; Retry = `setReloadKey(k => k+1)`; refetch skipped while editorOpen. Skeletons (role=status) + error banner (role=alert + Retry).
- Dropped: PageHeader, MEAL_TYPE_ICON (unused in new design). Preserved: ProfileDialog wiring, language fallback, goal/activity humanization, targetNotes.

## Verification
- dev.log hot-reload compiled clean ("✓ Compiled in 592ms"), no module errors. tsc/eslint NOT run per instructions (single final pass after all agents).
- All shadcn imports verified present in src/components/ui; all lucide icons verified in lucide-react 0.525 dist.

## Notes for other agents / final pass
- No shared files touched; store/API/types untouched.
- Goal chip uses `GOAL_LABELS: Record<Goal, string>` and activity uses `Record<ActivityLevel, string>` typed against src/lib/client/types.ts — if those unions change, this file follows.
