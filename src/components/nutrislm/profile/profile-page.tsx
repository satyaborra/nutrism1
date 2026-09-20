"use client";

/**
 * Health Profile page — reference-design rebuild. The whole page IS the editor:
 * identity card → Basic Information / Health Conditions / Computed Targets
 * → Dietary Preferences / Language / Medical Notes (with the single Save
 * Profile button) → evidence banner.
 *
 * Honesty rules: server-computed targets are rendered as returned; cuisine and
 * medical notes have no backend field, so they persist on this device and say
 * so. Conditions beyond T2DM/CKD/CVD are disabled (engine-supported only).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Cake,
  Check,
  Globe,
  Lock,
  Pencil,
  Save,
  Scale,
  ScrollText,
  ShieldCheck,
  Sparkles,
  UtensilsCrossed,
  VenusAndMars,
} from "lucide-react";
import { Ruler } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { api, ApiError } from "@/lib/client/api";
import type { ProfileResponse } from "@/lib/client/types";
import { useNutriStore } from "../store";
import { FadeIn } from "../fade-in";
import { ProfileHero } from "./profile-hero";
import { ConditionsCard } from "./conditions-card";
import { TargetsCard } from "./targets-card";

const ACTIVITY_OPTIONS: { value: string; label: string }[] = [
  { value: "sedentary", label: "Sedentary" },
  { value: "light", label: "Lightly Active" },
  { value: "moderate", label: "Moderately Active" },
  { value: "active", label: "Active" },
  { value: "very_active", label: "Very Active" },
];

const GOAL_OPTIONS: { value: string; label: string }[] = [
  { value: "lose_weight", label: "Lose Weight" },
  { value: "maintain", label: "Maintain Weight" },
  { value: "gain_muscle", label: "Gain Muscle" },
];

const SEX_OPTIONS = ["Male", "Female", "Other"];

const DIET_OPTIONS: { value: string; label: string }[] = [
  { value: "vegetarian", label: "Vegetarian" },
  { value: "vegan", label: "Vegan" },
  { value: "eggetarian", label: "Eggetarian" },
  { value: "non_vegetarian", label: "Non-Vegetarian" },
];

const ALLERGENS = ["dairy", "nuts", "peanuts", "gluten", "egg", "fish", "soy"];

const LANGUAGE_OPTIONS: { value: string; label: string }[] = [
  { value: "en", label: "English" },
  { value: "ta", label: "தமிழ் Tamil" },
  { value: "te", label: "తెలుగు Telugu" },
  { value: "hi", label: "हिन्दी Hindi" },
  { value: "kn", label: "ಕನ್ನಡ Kannada" },
];

const CUISINE_OPTIONS = ["Indian", "South Indian", "North Indian", "Continental", "Mediterranean", "Fusion"];

const NOTES_KEY = "nutrislm.medicalNotes";
const CUISINE_KEY = "nutrislm.cuisine";
const OTHER_KEY = "nutrislm.otherCondition";

interface Draft {
  age: string;
  sex: string;
  heightCm: string;
  weightKg: string;
  activityLevel: string;
  goal: string;
  dietaryPreference: string;
  allergies: string[];
  healthConditions: string[];
  language: string;
  regional: boolean;
}

function draftFromServer(data: ProfileResponse): Draft {
  const p = data.profile;
  return {
    age: p.age?.toString() ?? "",
    sex: p.sex ? p.sex.charAt(0).toUpperCase() + p.sex.slice(1).toLowerCase() : "Male",
    heightCm: p.heightCm?.toString() ?? "",
    weightKg: p.weightKg?.toString() ?? "",
    activityLevel: p.activityLevel ?? "moderate",
    goal: p.goal ?? "maintain",
    dietaryPreference: p.dietaryPreference ?? "vegetarian",
    allergies: p.allergies ?? [],
    healthConditions: p.healthConditions ?? [],
    language: p.language ?? "en",
    regional: (p.language ?? "en") !== "en",
  };
}

/** Server stores sex lowercase — the UI shows display case. */
function sexForServer(display: string): string {
  return display.toLowerCase();
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
      {children}
    </Label>
  );
}

function SuffixedInput({
  id,
  value,
  onChange,
  suffix,
  placeholder,
  error,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  suffix: string;
  placeholder?: string;
  error?: string;
}) {
  return (
    <div>
      <div className="relative">
        <Input
          id={id}
          value={value}
          inputMode="decimal"
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) =>
            onChange(e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1"))
          }
          className={cn(
            "h-10 rounded-xl bg-background pr-14 text-sm font-semibold transition-shadow",
            error && "border-destructive/60 pr-14 ring-2 ring-destructive/25 focus-visible:ring-destructive/35",
          )}
        />
        <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
          {suffix}
        </span>
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-[11px] font-semibold text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** Mirror of the server-side PUT /api/profile range rules — surfaced before save. */
function validateBasic(d: Draft | null): { age?: string; heightCm?: string; weightKg?: string } {
  const errs: { age?: string; heightCm?: string; weightKg?: string } = {};
  if (!d) return errs;
  const num = (v: string) => (v === "" ? null : Number(v));
  const age = num(d.age);
  if (age !== null && (!Number.isFinite(age) || age < 5 || age > 120)) {
    errs.age = "Age must be between 5 and 120 years.";
  }
  const h = num(d.heightCm);
  if (h !== null && (!Number.isFinite(h) || h < 80 || h > 250)) {
    errs.heightCm = "Height must be between 80 and 250 cm.";
  }
  const w = num(d.weightKg);
  if (w !== null && (!Number.isFinite(w) || w < 15 || w > 400)) {
    errs.weightKg = "Weight must be between 15 and 400 kg.";
  }
  return errs;
}

export function ProfilePage() {
  const user = useNutriStore((s) => s.user);
  const bumpData = useNutriStore((s) => s.bumpData);
  const { toast } = useToast();
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [notes, setNotes] = useState("");
  const [cuisine, setCuisine] = useState("Indian");
  const [otherCondition, setOtherCondition] = useState("");
  const [saving, setSaving] = useState(false);
  const [highlight, setHighlight] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const basicCardRef = useRef<HTMLElement>(null);
  const fieldErrors = useMemo(() => validateBasic(draft), [draft]);

  // local-only prefs
  useEffect(() => {
    try {
      setNotes(window.localStorage.getItem(NOTES_KEY) ?? "");
      setCuisine(window.localStorage.getItem(CUISINE_KEY) ?? "Indian");
      setOtherCondition(window.localStorage.getItem(OTHER_KEY) ?? "");
    } catch {
      /* storage unavailable */
    }
  }, []);

  const load = useCallback(() => {
    let alive = true;
    api
      .getProfile()
      .then((res) => {
        if (!alive) return;
        setData(res);
        setDraft((prev) => prev ?? draftFromServer(res));
        setLoading(false);
      })
      .catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => load(), [load]);

  const dirty = useMemo(() => {
    if (!data || !draft) return false;
    const d = draftFromServer(data);
    return (
      d.age !== draft.age ||
      d.sex !== draft.sex ||
      d.heightCm !== draft.heightCm ||
      d.weightKg !== draft.weightKg ||
      d.activityLevel !== draft.activityLevel ||
      d.goal !== draft.goal ||
      d.dietaryPreference !== draft.dietaryPreference ||
      JSON.stringify([...d.allergies].sort()) !== JSON.stringify([...draft.allergies].sort()) ||
      JSON.stringify([...d.healthConditions].sort()) !== JSON.stringify([...draft.healthConditions].sort()) ||
      (draft.regional ? draft.language : "en") !== d.language
    );
  }, [data, draft]);

  function focusEditor() {
    editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setHighlight(true);
    window.setTimeout(() => setHighlight(false), 1800);
  }

  async function save() {
    if (!draft) return;
    const errs = validateBasic(draft);
    if (Object.keys(errs).length > 0) {
      basicCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      toast({
        title: "Please fix the highlighted fields",
        description: Object.values(errs)[0],
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const num = (v: string) => (v === "" ? null : Number(v));
      await api.updateProfile({
        age: num(draft.age),
        sex: sexForServer(draft.sex),
        heightCm: num(draft.heightCm),
        weightKg: num(draft.weightKg),
        activityLevel: draft.activityLevel,
        goal: draft.goal,
        dietaryPreference: draft.dietaryPreference,
        allergies: draft.allergies,
        healthConditions: draft.healthConditions.filter((c) => c !== "OTHER"),
        language: draft.regional ? draft.language : "en",
      });
      try {
        window.localStorage.setItem(NOTES_KEY, notes);
        window.localStorage.setItem(CUISINE_KEY, cuisine);
        window.localStorage.setItem(OTHER_KEY, otherCondition);
      } catch {
        /* storage unavailable */
      }
      const res = await api.getProfile();
      setData(res);
      setDraft(draftFromServer(res));
      bumpData();
      toast({
        title: "Profile saved",
        description: "Your daily targets were recomputed deterministically.",
      });
    } catch (err) {
      toast({
        title: "Could not save profile",
        description:
          err instanceof ApiError
            ? err.message
            : "Please check your connection and try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  const p = data?.profile;

  return (
    <div className="space-y-4 sm:space-y-5">
      <FadeIn>
        <ProfileHero />
      </FadeIn>

      {/* ---------- identity card ---------- */}
      <FadeIn delay={0.04}>
        <section
          aria-label="Your identity"
          className="flex flex-col gap-4 rounded-3xl border border-border/60 bg-card p-5 shadow-sm shadow-black/[0.03] lg:flex-row lg:items-center lg:gap-6"
        >
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <span
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-lg font-bold text-white shadow-md shadow-emerald-600/25 sm:h-[4.5rem] sm:w-[4.5rem]"
              aria-hidden
            >
              {user ? initialsOf(user.name) : "—"}
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-lg font-extrabold tracking-tight">
                <span className="truncate">{user?.name ?? "—"}</span>
                <button
                  type="button"
                  onClick={focusEditor}
                  aria-label="Edit your profile details below"
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                </button>
              </p>
              <p className="truncate text-xs font-medium text-muted-foreground">{user?.email ?? ""}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                {p?.sex && (
                  <span className="flex items-center gap-1 rounded-full border border-border/70 bg-muted/60 px-2 py-0.5 text-[11px] font-semibold">
                    <VenusAndMars className="h-3 w-3 text-primary" aria-hidden /> {p.sex}
                  </span>
                )}
                <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Cake className="h-3.5 w-3.5" aria-hidden /> Age{" "}
                  <strong className="text-foreground">{p?.age ?? "—"}</strong>
                </span>
                <span className="hidden items-center gap-1.5 text-xs font-medium text-muted-foreground sm:flex">
                  <Ruler className="h-3.5 w-3.5" aria-hidden /> Height{" "}
                  <strong className="text-foreground">{p?.heightCm ? `${p.heightCm} cm` : "—"}</strong>
                </span>
                <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Scale className="h-3.5 w-3.5" aria-hidden /> Weight{" "}
                  <strong className="text-foreground">{p?.weightKg ? `${p.weightKg} kg` : "—"}</strong>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 lg:justify-end">
            <p className="hidden max-w-[15rem] text-right text-[13px] font-semibold italic leading-snug text-primary md:block">
              “Better food choices today, a healthier tomorrow.”
            </p>
            <Button
              className="h-11 shrink-0 rounded-xl px-5 text-sm font-bold shadow-md shadow-primary/25 active:scale-[0.98]"
              onClick={focusEditor}
            >
              <Pencil className="mr-1.5 h-4 w-4" aria-hidden /> Edit Profile
            </Button>
          </div>
        </section>
      </FadeIn>

      {/* ---------- editor grid ---------- */}
      <div ref={editorRef} className="scroll-mt-24">
        <div
          className={cn(
            "grid grid-cols-1 gap-4 rounded-3xl transition-all duration-500 sm:gap-5 xl:grid-cols-3",
            highlight && "ring-2 ring-primary ring-offset-4 ring-offset-background rounded-[1.7rem]",
          )}
        >
          {/* ----- Basic Information ----- */}
          <FadeIn delay={0.06} className="min-w-0">
            <section
              ref={basicCardRef}
              aria-label="Basic information"
              className="h-full scroll-mt-24 rounded-3xl border border-border/60 bg-card p-5 shadow-sm shadow-black/[0.03]"
            >
              <h2 className="flex items-center gap-2 text-base font-bold tracking-tight">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-100 text-sky-500 dark:bg-sky-500/15 dark:text-sky-400" aria-hidden>
                  <Pencil className="h-4 w-4" />
                </span>
                Basic Information
              </h2>

              {loading || !draft ? (
                <div className="mt-4 space-y-3" aria-hidden>
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-10 rounded-xl" />
                  ))}
                </div>
              ) : (
                <div className="mt-4 space-y-3.5">
                  <div className="space-y-1.5">
                    <FieldLabel htmlFor="pf-age">Age</FieldLabel>
                    <SuffixedInput id="pf-age" value={draft.age} onChange={(v) => setDraft({ ...draft, age: v })} suffix="years" placeholder="—" error={fieldErrors.age} />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel>Sex</FieldLabel>
                    <Select value={draft.sex} onValueChange={(v) => setDraft({ ...draft, sex: v })}>
                      <SelectTrigger className="h-10 w-full rounded-xl bg-background text-sm font-semibold" aria-label="Sex">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SEX_OPTIONS.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel htmlFor="pf-height">Height</FieldLabel>
                    <SuffixedInput id="pf-height" value={draft.heightCm} onChange={(v) => setDraft({ ...draft, heightCm: v })} suffix="cm" placeholder="—" error={fieldErrors.heightCm} />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel htmlFor="pf-weight">Weight</FieldLabel>
                    <SuffixedInput id="pf-weight" value={draft.weightKg} onChange={(v) => setDraft({ ...draft, weightKg: v })} suffix="kg" placeholder="—" error={fieldErrors.weightKg} />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel>Activity level</FieldLabel>
                    <Select value={draft.activityLevel} onValueChange={(v) => setDraft({ ...draft, activityLevel: v })}>
                      <SelectTrigger className="h-10 w-full rounded-xl bg-background text-sm font-semibold" aria-label="Activity level">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ACTIVITY_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel>Goal</FieldLabel>
                    <Select value={draft.goal} onValueChange={(v) => setDraft({ ...draft, goal: v })}>
                      <SelectTrigger className="h-10 w-full rounded-xl bg-background text-sm font-semibold" aria-label="Goal">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {GOAL_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </section>
          </FadeIn>

          {/* ----- Health Conditions ----- */}
          <FadeIn delay={0.08} className="min-w-0">
            {draft && (
              <ConditionsCard
                selected={draft.healthConditions}
                onToggle={(id) =>
                  setDraft((d) => {
                    if (!d) return d;
                    const has = d.healthConditions.includes(id);
                    return {
                      ...d,
                      healthConditions: has
                        ? d.healthConditions.filter((c) => c !== id)
                        : [...d.healthConditions, id],
                    };
                  })
                }
                otherText={otherCondition}
                onOtherText={setOtherCondition}
              />
            )}
          </FadeIn>

          {/* ----- Computed Daily Targets ----- */}
          <FadeIn delay={0.1} className="min-w-0">
            <TargetsCard data={data} loading={loading} />
          </FadeIn>
        </div>
      </div>

      {/* ---------- second row ---------- */}
      <div className="grid grid-cols-1 gap-4 sm:gap-5 xl:grid-cols-3">
        {/* ----- Dietary Preferences ----- */}
        <FadeIn delay={0.12} className="min-w-0">
          <section aria-label="Dietary preferences" className="h-full rounded-3xl border border-border/60 bg-card p-5 shadow-sm shadow-black/[0.03]">
            <h2 className="flex items-center gap-2 text-base font-bold tracking-tight">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400" aria-hidden>
                <UtensilsCrossed className="h-4 w-4" />
              </span>
              Dietary Preferences
            </h2>

            {loading || !draft ? (
              <div className="mt-4 space-y-3" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-10 rounded-xl" />
                ))}
              </div>
            ) : (
              <div className="mt-4 space-y-3.5">
                <div className="space-y-1.5">
                  <FieldLabel>Diet type</FieldLabel>
                  <Select value={draft.dietaryPreference} onValueChange={(v) => setDraft({ ...draft, dietaryPreference: v })}>
                    <SelectTrigger className="h-10 w-full rounded-xl bg-background text-sm font-semibold" aria-label="Diet type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DIET_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="pf-cuisine">Cuisine preference</FieldLabel>
                  <Select
                    value={cuisine}
                    onValueChange={(v) => {
                      setCuisine(v);
                      try {
                        window.localStorage.setItem(CUISINE_KEY, v);
                      } catch { /* ignore */ }
                    }}
                  >
                    <SelectTrigger id="pf-cuisine" className="h-10 w-full rounded-xl bg-background text-sm font-semibold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CUISINE_OPTIONS.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">Saved on this device · recipes are IFCT-calibrated.</p>
                </div>
                <div className="space-y-1.5">
                  <FieldLabel>Allergies / Intolerances</FieldLabel>
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Allergies">
                    {ALLERGENS.map((a) => {
                      const active = draft.allergies.includes(a);
                      return (
                        <button
                          key={a}
                          type="button"
                          aria-pressed={active}
                          onClick={() =>
                            setDraft((d) => {
                              if (!d) return d;
                              return {
                                ...d,
                                allergies: active ? d.allergies.filter((x) => x !== a) : [...d.allergies, a],
                              };
                            })
                          }
                          className={cn(
                            "rounded-full border px-3 py-1.5 text-[11.5px] font-semibold capitalize transition-all duration-150 active:scale-95 focus-visible:outline-2 focus-visible:outline-ring",
                            active
                              ? "border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-400"
                              : "border-border/70 bg-background text-muted-foreground hover:border-amber-400/40 hover:text-foreground",
                          )}
                        >
                          {a}
                        </button>
                      );
                    })}
                  </div>
                  {draft.allergies.length > 0 && (
                    <p className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
                      Hard-excluded from every recommendation.
                    </p>
                  )}
                </div>
              </div>
            )}
          </section>
        </FadeIn>

        {/* ----- Language Preference ----- */}
        <FadeIn delay={0.14} className="min-w-0">
          <section aria-label="Language preference" className="h-full rounded-3xl border border-border/60 bg-card p-5 shadow-sm shadow-black/[0.03]">
            <h2 className="flex items-center gap-2 text-base font-bold tracking-tight">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-100 text-teal-600 dark:bg-teal-500/15 dark:text-teal-400" aria-hidden>
                <Globe className="h-4 w-4" />
              </span>
              Language Preference
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">Get recommendations in your preferred language.</p>

            {loading || !draft ? (
              <div className="mt-4 space-y-3" aria-hidden>
                <Skeleton className="h-10 rounded-xl" />
                <Skeleton className="h-12 rounded-xl" />
              </div>
            ) : (
              <div className="mt-4 space-y-3.5">
                <div className="space-y-1.5">
                  <FieldLabel>App &amp; voice language</FieldLabel>
                  <Select
                    value={draft.regional ? draft.language : "en"}
                    disabled={!draft.regional}
                    onValueChange={(v) => setDraft({ ...draft, language: v })}
                  >
                    <SelectTrigger className="h-10 w-full rounded-xl bg-background text-sm font-semibold" aria-label="Language">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!draft.regional && (
                    <p className="text-[10px] text-muted-foreground">Enable regional support to pick a language.</p>
                  )}
                </div>
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-2xl border px-3.5 py-3 transition-colors",
                    draft.regional ? "border-primary/30 bg-primary/[0.05]" : "border-border/60 bg-background hover:bg-muted/40",
                  )}
                >
                  <Checkbox
                    checked={draft.regional}
                    onCheckedChange={(v) =>
                      setDraft((d) => {
                        if (!d) return d;
                        const on = v === true;
                        return { ...d, regional: on, language: on ? (d.language !== "en" ? d.language : "ta") : "en" };
                      })
                    }
                    aria-label="Enable regional language support"
                    className="mt-0.5 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                  />
                  <span>
                    <span className="block text-[13px] font-bold leading-tight">Enable regional language support</span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      (Tamil, Telugu, Hindi, Kannada) — drives voice input and food descriptions.
                    </span>
                  </span>
                </label>
              </div>
            )}
          </section>
        </FadeIn>

        {/* ----- Medical Notes + save ----- */}
        <FadeIn delay={0.16} className="min-w-0">
          <section aria-label="Medical notes and save" className="flex h-full flex-col rounded-3xl border border-border/60 bg-card p-5 shadow-sm shadow-black/[0.03]">
            <h2 className="flex items-center gap-2 text-base font-bold tracking-tight">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-100 text-violet-500 dark:bg-violet-500/15 dark:text-violet-400" aria-hidden>
                <ScrollText className="h-4 w-4" />
              </span>
              Medical Notes <span className="text-xs font-medium text-muted-foreground">(Optional)</span>
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">Private context for your own reference.</p>

            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any additional details (e.g., medications, lab values, specific dietary restrictions)…"
              aria-label="Medical notes"
              className="mt-4 min-h-[92px] flex-1 resize-none rounded-2xl bg-background text-[13px]"
            />
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              Stored only on this device — never uploaded.
            </p>

            <Button
              onClick={save}
              disabled={saving || loading || !draft}
              className={cn(
                "mt-4 h-12 w-full rounded-xl text-sm font-bold shadow-md shadow-primary/25 transition-all active:scale-[0.98]",
                dirty && "ring-2 ring-primary/40 ring-offset-2 ring-offset-card",
              )}
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
                  Saving…
                </span>
              ) : dirty ? (
                <>
                  <Save className="mr-1.5 h-4 w-4" aria-hidden /> Save Profile
                  <span aria-hidden className="ml-1 h-2 w-2 rounded-full bg-amber-300" />
                </>
              ) : (
                <>
                  <Check className="mr-1.5 h-4 w-4" aria-hidden /> Saved
                </>
              )}
            </Button>
            <p className="mt-2.5 flex items-center justify-center gap-1.5 text-[10.5px] font-medium text-muted-foreground">
              <Lock className="h-3 w-3" aria-hidden /> Your health data is private and secure.
            </p>
          </section>
        </FadeIn>
      </div>

      {/* ---------- evidence banner ---------- */}
      <FadeIn delay={0.18}>
        <div className="relative flex flex-col items-start gap-3 overflow-hidden rounded-3xl border border-primary/15 bg-gradient-to-r from-primary/[0.07] via-card to-teal-500/[0.06] px-5 py-4 sm:flex-row sm:items-center sm:px-6">
          <img
            src="/images/hero-leaves.png"
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 h-full w-40 object-cover opacity-25 [mask-image:linear-gradient(to_left,black_30%,transparent)] dark:opacity-15"
          />
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary" aria-hidden>
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold tracking-tight">Personalized. Safe. Evidence-Based.</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Your profile powers disease-aware meal plans using trusted guidelines
              (ICMR · ADA · KDIGO · AHA).
            </p>
          </div>
          <span className="relative hidden items-center gap-1.5 rounded-full border border-primary/25 bg-card px-3 py-1.5 text-[11px] font-bold text-primary lg:flex">
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> Zero fabricated numbers
          </span>
        </div>
      </FadeIn>
    </div>
  );
}
