"use client";

/**
 * Health Profile view — mockup-exact rebuild (light, emerald).
 *
 * Layout: ViewHero (Health Profile + "Edit Profile" action) → identity card
 * (avatar, name, stat chips, script quote) → 3-column grid (Basic Information
 * inline editing with server-mirrored validation · Health Conditions for the
 * server-supported T2DM/CKD/CVD · Computed Daily Targets) → bottom row
 * (Dietary Preferences · Language Preference · Medical Notes) → evidence trust
 * strip. Numbers are ALWAYS server-computed (api.getProfile / api.updateProfile
 * responses) — never invented client-side.
 */
import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Cake,
  Check,
  Droplet,
  Droplets,
  Dumbbell,
  Filter,
  Flame,
  GlassWater,
  HeartPulse,
  Info,
  Languages,
  Leaf,
  Lightbulb,
  Loader2,
  Lock,
  Pencil,
  RefreshCw,
  Ruler,
  Scale,
  ShieldCheck,
  Stethoscope,
  UserRound,
  UtensilsCrossed,
  Wheat,
  X,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { api, ApiError } from "@/lib/client/api";
import { formatGrams, formatKcal, formatShort } from "@/lib/client/format";
import type { ActivityLevel, DietaryPreference, Goal, LangCode, ProfileResponse } from "@/lib/client/types";
import { useNutriStore } from "../store";
import { ProfileDialog } from "../profile-dialog";
import { FadeIn } from "../fade-in";
import { ViewHero } from "./view-hero";

// ---------- Humanized labels (display only — values stay server-side) ----------

const GOAL_LABELS: Record<Goal, string> = {
  lose_weight: "Lose Weight",
  maintain: "Maintain Weight",
  gain_muscle: "Gain Muscle",
};

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: "Sedentary",
  light: "Lightly active",
  moderate: "Moderately active",
  active: "Active",
  very_active: "Very active",
};

const DIET_OPTIONS: { value: DietaryPreference; label: string }[] = [
  { value: "vegetarian", label: "Vegetarian" },
  { value: "vegan", label: "Vegan" },
  { value: "eggetarian", label: "Eggetarian" },
  { value: "non_vegetarian", label: "Non-vegetarian" },
];

/** App UI languages — exactly the five profile codes. */
const LANGUAGES: { code: LangCode; native: string; label: string }[] = [
  { code: "en", native: "English", label: "English" },
  { code: "ta", native: "தமிழ்", label: "Tamil" },
  { code: "te", native: "తెలుగు", label: "Telugu" },
  { code: "hi", native: "हिन्दी", label: "Hindi" },
  { code: "kn", native: "ಕನ್ನಡ", label: "Kannada" },
];

/** EXACTLY the server-supported conditions (CONDITIONS in /api/profile) — nothing invented. */
const CONDITION_OPTIONS: { value: "T2DM" | "CKD" | "CVD"; label: string; desc: string; icon: LucideIcon; tone: string }[] = [
  {
    value: "T2DM",
    label: "Type 2 Diabetes Mellitus (T2DM)",
    desc: "Blood sugar management and glycemic control",
    icon: Droplet,
    tone: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  },
  {
    value: "CKD",
    label: "Chronic Kidney Disease (CKD)",
    desc: "Kidney-friendly diet and sodium/protein control",
    icon: Filter,
    tone: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
  },
  {
    value: "CVD",
    label: "Cardiovascular Disease (CVD)",
    desc: "Heart-healthy diet (low sodium, low saturated fat)",
    icon: HeartPulse,
    tone: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  },
];

// ---------- Inline-edit validation (MIRRORS the server ranges in /api/profile) ----------

type FieldKey = "age" | "heightCm" | "weightKg";

const FIELD_LIMITS: Record<FieldKey, { min: number; max: number; message: string }> = {
  age: { min: 5, max: 120, message: "Age must be between 5 and 120." },
  heightCm: { min: 80, max: 250, message: "Height must be between 80 and 250 cm." },
  weightKg: { min: 15, max: 400, message: "Weight must be between 15 and 400 kg." },
};

const FIELD_ORDER: FieldKey[] = ["age", "heightCm", "weightKg"];

/** Keep digits and a single decimal dot; drop everything else. */
function sanitizeNumeric(v: string): string {
  let out = "";
  let dot = false;
  for (const ch of v) {
    if (ch >= "0" && ch <= "9") out += ch;
    else if (ch === "." && !dot) {
      out += ".";
      dot = true;
    }
  }
  return out;
}

function validateDraft(draft: Record<FieldKey, string>): Partial<Record<FieldKey, string>> {
  const errors: Partial<Record<FieldKey, string>> = {};
  for (const key of FIELD_ORDER) {
    const raw = draft[key].trim();
    if (raw === "") continue; // empty = clear the value (null is allowed server-side)
    const n = Number(raw);
    if (!Number.isFinite(n) || n < FIELD_LIMITS[key].min || n > FIELD_LIMITS[key].max) {
      errors[key] = FIELD_LIMITS[key].message;
    }
  }
  return errors;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- Small shared pieces ----------

/** Tinted icon chip used across rows. */
function Chip({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span aria-hidden className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", className)}>
      {children}
    </span>
  );
}

/** Card header pattern: tinted icon chip + title over a muted description. */
function CardHeading({ icon, tone, title, desc }: { icon: React.ReactNode; tone: string; title: string; desc: string }) {
  return (
    <>
      <h2 className="flex items-center gap-2 text-base font-semibold leading-none">
        <span aria-hidden className={cn("flex h-7 w-7 items-center justify-center rounded-lg", tone)}>
          {icon}
        </span>
        {title}
      </h2>
      <p className="text-sm text-muted-foreground">{desc}</p>
    </>
  );
}

/** Identity stat chip: icon + tiny label + bold tabular value. */
function IdentityChip({ icon, label, value, unit }: { icon: React.ReactNode; label: string; value: string; unit?: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-primary/10 bg-muted/40 px-3 py-2">
      <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="block text-sm font-bold tabular-nums text-emerald-950 dark:text-emerald-50">
          {value}
          {unit ? <span className="ml-1 text-[10px] font-medium text-muted-foreground">{unit}</span> : null}
        </span>
      </span>
    </div>
  );
}

/**
 * One Basic-Information row: icon chip + label on the left; display value or
 * an editable control on the right. Optional inline error (role=alert).
 */
function InfoRow({
  icon,
  label,
  htmlFor,
  value,
  unit,
  control,
  error,
  errorId,
  fieldRef,
}: {
  icon: React.ReactNode;
  label: string;
  htmlFor?: string;
  /** Display value; null renders "— not set". Ignored when `control` is set. */
  value?: string | null;
  unit?: string;
  /** When set, the row renders this editable control instead of the value. */
  control?: React.ReactNode;
  error?: string;
  errorId?: string;
  fieldRef?: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div ref={fieldRef} className="scroll-mt-24 border-b border-dashed border-border/60 py-2.5 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Chip className="bg-primary/10 text-primary">{icon}</Chip>
          {htmlFor ? (
            <Label htmlFor={htmlFor} className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {label}
            </Label>
          ) : (
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
          )}
        </div>
        {control ? (
          control
        ) : (
          <div className="text-right">
            {value != null && value !== "" ? (
              <span className="text-lg font-bold tabular-nums text-emerald-950 dark:text-emerald-50">
                {value}
                {unit ? <span className="ml-1 text-xs font-medium text-muted-foreground">{unit}</span> : null}
              </span>
            ) : (
              <span className="text-lg font-bold text-muted-foreground/50">
                — <span className="text-xs font-medium">not set</span>
              </span>
            )}
          </div>
        )}
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-right text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** One Computed-Daily-Targets row: icon chip + label + optional badge + tabular value. */
function TargetRow({
  icon,
  tone,
  label,
  value,
  badge,
}: {
  icon: React.ReactNode;
  tone: string;
  label: string;
  value: string;
  badge?: string;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-dashed border-border/60 py-2.5 last:border-b-0">
      <Chip className={tone}>{icon}</Chip>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{label}</span>
        {badge && (
          <Badge
            variant="outline"
            className="mt-0.5 w-fit border-amber-500/40 bg-amber-500/10 text-[10px] font-semibold text-amber-700 dark:text-amber-300"
          >
            {badge}
          </Badge>
        )}
      </span>
      <span className="shrink-0 text-sm font-bold tabular-nums text-emerald-950 dark:text-emerald-50">{value}</span>
    </div>
  );
}

export function ProfileView() {
  const { toast } = useToast();
  const user = useNutriStore((s) => s.user);
  const profileBrief = useNutriStore((s) => s.profileBrief);
  const setSession = useNutriStore((s) => s.setSession);
  const dataVersion = useNutriStore((s) => s.dataVersion);
  const bumpData = useNutriStore((s) => s.bumpData);

  const [data, setData] = useState<ProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);

  // Inline editing state for the Basic Information card.
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Record<FieldKey, string>>({ age: "", heightCm: "", weightKg: "" });
  const [draftSex, setDraftSex] = useState("");
  const [draftActivity, setDraftActivity] = useState("");
  const [draftGoal, setDraftGoal] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const fieldRefs = useRef<Record<FieldKey, HTMLDivElement | null>>({ age: null, heightCm: null, weightKg: null });

  // Health conditions local draft (saved via its own button).
  const [condDraft, setCondDraft] = useState<string[]>([]);
  const [savingCond, setSavingCond] = useState(false);

  // Diet type + language in-flight flags.
  const [savingDiet, setSavingDiet] = useState(false);
  const [savingLang, setSavingLang] = useState(false);

  // Fetch on mount + whenever dataVersion changes, with ONE silent retry before
  // surfacing the error banner. While the editor dialog is open it refreshes
  // the data itself, so we do not refetch underneath it.
  useEffect(() => {
    if (editorOpen) return;
    let alive = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const run = (attempt: number) => {
      api
        .getProfile()
        .then((res) => {
          if (alive) {
            setData(res);
            setError(null);
          }
        })
        .catch(() => {
          if (!alive) return;
          if (attempt < 1) {
            retryTimer = setTimeout(() => {
              if (alive) run(attempt + 1);
            }, 900);
          } else {
            setError("Could not load your profile. Check your connection and try again.");
          }
        });
    };
    run(0);
    return () => {
      alive = false;
      clearTimeout(retryTimer);
    };
  }, [editorOpen, dataVersion, reloadKey]);

  const p = data?.profile;
  const t = data?.computedTargets;

  // Keep the conditions draft in sync with the freshest server profile.
  useEffect(() => {
    if (data) setCondDraft(data.profile.healthConditions);
  }, [data]);

  function startEdit() {
    if (!p) return;
    setDraft({
      age: p.age?.toString() ?? "",
      heightCm: p.heightCm?.toString() ?? "",
      weightKg: p.weightKg?.toString() ?? "",
    });
    setDraftSex(p.sex ?? "");
    setDraftActivity(p.activityLevel ?? "");
    setDraftGoal(p.goal ?? "");
    setFieldErrors({});
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setFieldErrors({});
  }

  function updateDraft(key: FieldKey, raw: string) {
    const clean = sanitizeNumeric(raw);
    setDraft((d) => ({ ...d, [key]: clean }));
    setFieldErrors((fe) => (fe[key] ? { ...fe, [key]: undefined } : fe));
  }

  function focusField(key: FieldKey) {
    const el = fieldRefs.current[key];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.querySelector("input")?.focus({ preventScroll: true });
  }

  async function saveBasics() {
    const errors = validateDraft(draft);
    if (FIELD_ORDER.some((k) => errors[k])) {
      setFieldErrors(errors);
      toast({ title: "Please correct the highlighted fields", variant: "destructive" });
      const first = FIELD_ORDER.find((k) => errors[k]);
      if (first) focusField(first);
      return;
    }
    setSaving(true);
    try {
      const num = (v: string) => (v.trim() === "" ? null : Number(v));
      const res = await api.updateProfile({
        age: num(draft.age),
        sex: draftSex || null,
        heightCm: num(draft.heightCm),
        weightKg: num(draft.weightKg),
        activityLevel: draftActivity || null,
        goal: draftGoal || null,
      });
      // The PUT response IS the fresh ProfileResponse — never recompute locally.
      setData(res);
      setEditing(false);
      setFieldErrors({});
      bumpData();
      toast({ title: "Profile updated", description: "Your daily targets were recomputed from the new numbers." });
    } catch (e) {
      toast({
        title: "Could not save profile",
        description: e instanceof ApiError ? e.message : "Unexpected error.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  function toggleCond(value: string) {
    setCondDraft((d) => (d.includes(value) ? d.filter((v) => v !== value) : [...d, value]));
  }

  async function saveConditions() {
    if (!p) return;
    const prev = p.healthConditions;
    setSavingCond(true);
    try {
      const res = await api.updateProfile({ healthConditions: condDraft });
      // The PUT response IS the fresh ProfileResponse — never recompute locally.
      setData(res);
      setCondDraft(res.profile.healthConditions);
      bumpData();
      toast({ title: "Conditions updated", description: "Disease-aware constraints were re-applied to your targets." });
    } catch (e) {
      setCondDraft(prev); // revert to the last saved server state
      toast({
        title: "Could not update conditions",
        description: e instanceof ApiError ? e.message : "Unexpected error.",
        variant: "destructive",
      });
    } finally {
      setSavingCond(false);
    }
  }

  const conditionsDirty = p
    ? condDraft.length !== p.healthConditions.length || condDraft.some((c) => !p.healthConditions.includes(c))
    : false;

  async function changeDiet(next: DietaryPreference) {
    if (!data || !p || savingDiet || next === p.dietaryPreference) return;
    const prevData = data;
    // Optimistic local update — reverted on any API failure.
    setData({ ...data, profile: { ...data.profile, dietaryPreference: next } });
    setSavingDiet(true);
    try {
      const res = await api.updateProfile({ dietaryPreference: next });
      setData(res);
      bumpData();
      toast({
        title: "Diet preference updated",
        description: `Recommendations will follow a ${DIET_OPTIONS.find((d) => d.value === next)?.label ?? next} plan.`,
      });
    } catch (err) {
      setData(prevData); // revert
      toast({
        title: "Could not update diet preference",
        description: err instanceof ApiError ? err.message : "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setSavingDiet(false);
    }
  }

  // Language switching — same optimistic + revert + session-refresh flow as Settings.
  const currentLang: LangCode = profileBrief?.language ?? data?.profile.language ?? "en";

  async function changeLanguage(next: LangCode) {
    if (savingLang || next === currentLang) return;
    const prevBrief = profileBrief;
    // Optimistic local set — the whole app reads the language from the store.
    setSession(user, prevBrief ? { ...prevBrief, language: next } : prevBrief);
    setSavingLang(true);
    try {
      await api.updateProfile({ language: next });
      toast({
        title: "Language updated",
        description: `NutriSLM will understand and reply in ${LANGUAGES.find((l) => l.code === next)?.label ?? next}.`,
      });
      // Refresh the session from the server so every section sees the saved profile.
      try {
        const me = await api.me();
        setSession(me.user, me.profile);
      } catch {
        /* session refresh is best-effort — the language save already succeeded */
      }
      bumpData();
    } catch (err) {
      // Revert to the previous language on any API failure.
      setSession(user, prevBrief);
      toast({
        title: "Could not update language",
        description: err instanceof ApiError ? err.message : "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setSavingLang(false);
    }
  }

  // ----- Identity card slots -----

  const initials =
    user?.name
      ?.split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join("") || "DU";

  const subline = profileBrief
    ? `${DIET_OPTIONS.find((d) => d.value === profileBrief.dietaryPreference)?.label ?? cap(profileBrief.dietaryPreference)} · ${
        profileBrief.healthConditions.length > 0
          ? `${profileBrief.healthConditions.length} condition${profileBrief.healthConditions.length === 1 ? "" : "s"}`
          : "no conditions"
      }`
    : (user?.email ?? "Add your details to personalize your targets");

  // ----- Condition-derived badges for the targets card -----

  const conds = p?.healthConditions ?? [];
  const calorieAdjusted = conds.filter((c) => c === "T2DM" || c === "CKD");
  const hasCkd = conds.includes("CKD");

  return (
    <div className="space-y-5">
      <FadeIn>
        <ViewHero
          title={
            <>
              Health <span className="text-primary">Profile</span>
            </>
          }
          subtitle="Your health details help NutriSLM create safe, personalized and disease-aware nutrition recommendations."
          script={
            <>
              Your Health
              <br />
              Our Priority ♡
            </>
          }
          image="/images/hero-leaves.png"
          actions={
            <Button
              size="sm"
              className="h-10 gap-1.5 rounded-xl px-4 font-semibold active:scale-[0.98]"
              onClick={() => setEditorOpen(true)}
            >
              <Pencil className="h-4 w-4" aria-hidden /> Edit Profile
            </Button>
          }
        />
      </FadeIn>

      {error && (
        <FadeIn delay={0.05}>
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
              <p className="text-sm font-medium text-destructive">{error}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5 active:scale-[0.98]"
              onClick={() => setReloadKey((k) => k + 1)}
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Retry
            </Button>
          </div>
        </FadeIn>
      )}

      {!data && !error && (
        <div role="status" aria-label="Loading your profile" className="space-y-5">
          <Skeleton className="h-44 w-full rounded-3xl" />
          <div className="grid gap-5 xl:grid-cols-3" aria-hidden>
            <Skeleton className="h-80 rounded-3xl" />
            <Skeleton className="h-80 rounded-3xl" />
            <Skeleton className="h-80 rounded-3xl" />
          </div>
          <div className="grid gap-5 xl:grid-cols-3" aria-hidden>
            <Skeleton className="h-64 rounded-3xl" />
            <Skeleton className="h-64 rounded-3xl" />
            <Skeleton className="h-64 rounded-3xl" />
          </div>
        </div>
      )}

      {data && p && t && (
        <>
          {/* ---------------- Identity card ---------------- */}
          <FadeIn delay={0.05}>
            <Card className="rounded-3xl border-primary/15 shadow-sm">
              <CardContent className="flex flex-col gap-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-4">
                    <Avatar className="h-16 w-16 border border-primary/20">
                      <AvatarFallback className="bg-primary/15 text-lg font-bold text-primary">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h2 className="truncate text-xl font-bold text-emerald-950 dark:text-emerald-50">
                          {user?.name ?? "Your profile"}
                        </h2>
                        <button
                          type="button"
                          onClick={() => setEditorOpen(true)}
                          aria-label="Edit profile details"
                          title="Edit profile details"
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </div>
                      <p className="mt-0.5 truncate text-sm text-muted-foreground">{subline}</p>
                    </div>
                  </div>
                  <p
                    aria-hidden
                    className="font-script hidden max-w-[220px] shrink-0 -rotate-2 text-right text-xl font-semibold leading-tight text-muted-foreground lg:block"
                  >
                    Better food choices today, a healthier tomorrow.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <IdentityChip
                    icon={<Cake className="h-4 w-4" />}
                    label="Age"
                    value={p.age != null ? formatShort(p.age) : "—"}
                    unit={p.age != null ? "years" : undefined}
                  />
                  <IdentityChip
                    icon={<Ruler className="h-4 w-4" />}
                    label="Height"
                    value={p.heightCm != null ? formatShort(p.heightCm) : "—"}
                    unit={p.heightCm != null ? "cm" : undefined}
                  />
                  <IdentityChip
                    icon={<Scale className="h-4 w-4" />}
                    label="Weight"
                    value={p.weightKg != null ? formatShort(p.weightKg) : "—"}
                    unit={p.weightKg != null ? "kg" : undefined}
                  />
                  {p.sex && (
                    <Badge
                      variant="outline"
                      className="gap-1.5 rounded-xl border-primary/25 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary"
                    >
                      <span aria-hidden>{p.sex === "male" ? "♂" : p.sex === "female" ? "♀" : "·"}</span>
                      {cap(p.sex)}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          </FadeIn>

          {/* ---------------- 3-column grid ---------------- */}
          <div className="grid items-start gap-5 xl:grid-cols-3">
            {/* Basic Information (inline editing) */}
            <FadeIn delay={0.1}>
              <Card className="h-full rounded-3xl border-primary/15 shadow-sm">
                <CardHeader>
                  <CardHeading
                    icon={<UserRound className="h-4 w-4" />}
                    tone="bg-primary/10 text-primary"
                    title="Basic Information"
                    desc="Drives BMR → TDEE → macro targets."
                  />
                  {!editing && (
                    <CardAction>
                      <Button size="sm" variant="outline" className="gap-1.5 rounded-xl active:scale-[0.98]" onClick={startEdit}>
                        <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
                      </Button>
                    </CardAction>
                  )}
                </CardHeader>
                <CardContent>
                  <div>
                    <InfoRow
                      icon={<Cake className="h-4 w-4" />}
                      label="Age"
                      htmlFor={editing ? "pfv-age" : undefined}
                      value={p.age != null ? formatShort(p.age) : null}
                      unit="years"
                      fieldRef={(el) => {
                        fieldRefs.current.age = el;
                      }}
                      control={
                        editing ? (
                          <div className="flex items-center gap-1.5">
                            <Input
                              id="pfv-age"
                              inputMode="decimal"
                              autoComplete="off"
                              value={draft.age}
                              onChange={(e) => updateDraft("age", e.target.value)}
                              aria-invalid={fieldErrors.age ? true : undefined}
                              aria-describedby={fieldErrors.age ? "pfv-age-error" : undefined}
                              disabled={saving}
                              className="h-10 w-24 text-right text-sm font-semibold tabular-nums"
                            />
                            <span className="w-10 text-xs text-muted-foreground">years</span>
                          </div>
                        ) : undefined
                      }
                      error={editing ? fieldErrors.age : undefined}
                      errorId="pfv-age-error"
                    />
                    <InfoRow
                      icon={<UserRound className="h-4 w-4" />}
                      label="Sex"
                      htmlFor={editing ? "pfv-sex" : undefined}
                      value={p.sex ? cap(p.sex) : null}
                      control={
                        editing ? (
                          <Select value={draftSex || undefined} onValueChange={(v) => setDraftSex(v)} disabled={saving}>
                            <SelectTrigger id="pfv-sex" aria-label="Sex" className="h-10 w-40 rounded-xl">
                              <SelectValue placeholder="Select sex" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="male">Male</SelectItem>
                              <SelectItem value="female">Female</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : undefined
                      }
                    />
                    <InfoRow
                      icon={<Ruler className="h-4 w-4" />}
                      label="Height"
                      htmlFor={editing ? "pfv-heightCm" : undefined}
                      value={p.heightCm != null ? formatShort(p.heightCm) : null}
                      unit="cm"
                      fieldRef={(el) => {
                        fieldRefs.current.heightCm = el;
                      }}
                      control={
                        editing ? (
                          <div className="flex items-center gap-1.5">
                            <Input
                              id="pfv-heightCm"
                              inputMode="decimal"
                              autoComplete="off"
                              value={draft.heightCm}
                              onChange={(e) => updateDraft("heightCm", e.target.value)}
                              aria-invalid={fieldErrors.heightCm ? true : undefined}
                              aria-describedby={fieldErrors.heightCm ? "pfv-heightCm-error" : undefined}
                              disabled={saving}
                              className="h-10 w-24 text-right text-sm font-semibold tabular-nums"
                            />
                            <span className="w-10 text-xs text-muted-foreground">cm</span>
                          </div>
                        ) : undefined
                      }
                      error={editing ? fieldErrors.heightCm : undefined}
                      errorId="pfv-heightCm-error"
                    />
                    <InfoRow
                      icon={<Scale className="h-4 w-4" />}
                      label="Weight"
                      htmlFor={editing ? "pfv-weightKg" : undefined}
                      value={p.weightKg != null ? formatShort(p.weightKg) : null}
                      unit="kg"
                      fieldRef={(el) => {
                        fieldRefs.current.weightKg = el;
                      }}
                      control={
                        editing ? (
                          <div className="flex items-center gap-1.5">
                            <Input
                              id="pfv-weightKg"
                              inputMode="decimal"
                              autoComplete="off"
                              value={draft.weightKg}
                              onChange={(e) => updateDraft("weightKg", e.target.value)}
                              aria-invalid={fieldErrors.weightKg ? true : undefined}
                              aria-describedby={fieldErrors.weightKg ? "pfv-weightKg-error" : undefined}
                              disabled={saving}
                              className="h-10 w-24 text-right text-sm font-semibold tabular-nums"
                            />
                            <span className="w-10 text-xs text-muted-foreground">kg</span>
                          </div>
                        ) : undefined
                      }
                      error={editing ? fieldErrors.weightKg : undefined}
                      errorId="pfv-weightKg-error"
                    />
                    <InfoRow
                      icon={<Flame className="h-4 w-4" />}
                      label="Activity level"
                      htmlFor={editing ? "pfv-activity" : undefined}
                      value={p.activityLevel ? (ACTIVITY_LABELS[p.activityLevel] ?? null) : null}
                      control={
                        editing ? (
                          <Select
                            value={draftActivity || undefined}
                            onValueChange={(v) => setDraftActivity(v)}
                            disabled={saving}
                          >
                            <SelectTrigger id="pfv-activity" aria-label="Activity level" className="h-10 w-40 rounded-xl">
                              <SelectValue placeholder="Select activity" />
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((k) => (
                                <SelectItem key={k} value={k}>
                                  {ACTIVITY_LABELS[k]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : undefined
                      }
                    />
                    <InfoRow
                      icon={<HeartPulse className="h-4 w-4" />}
                      label="Goal"
                      htmlFor={editing ? "pfv-goal" : undefined}
                      value={p.goal ? (GOAL_LABELS[p.goal] ?? null) : null}
                      control={
                        editing ? (
                          <Select value={draftGoal || undefined} onValueChange={(v) => setDraftGoal(v)} disabled={saving}>
                            <SelectTrigger id="pfv-goal" aria-label="Goal" className="h-10 w-40 rounded-xl">
                              <SelectValue placeholder="Select goal" />
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.keys(GOAL_LABELS) as Goal[]).map((k) => (
                                <SelectItem key={k} value={k}>
                                  {GOAL_LABELS[k]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : undefined
                      }
                    />
                  </div>
                  {editing && (
                    <div className="mt-4 flex flex-col gap-3 border-t border-primary/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        Validated against the same server ranges the engine uses: age 5–120, height 80–250 cm, weight
                        15–400 kg. Leave a field empty to clear it.
                      </p>
                      <div className="flex shrink-0 gap-2">
                        <Button size="sm" variant="ghost" className="gap-1" onClick={cancelEdit} disabled={saving}>
                          <X className="h-3.5 w-3.5" aria-hidden /> Cancel
                        </Button>
                        <Button
                          size="sm"
                          className="gap-1 active:scale-[0.98]"
                          onClick={() => void saveBasics()}
                          disabled={saving}
                        >
                          {saving ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          ) : (
                            <Check className="h-3.5 w-3.5" aria-hidden />
                          )}
                          Save
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </FadeIn>

            {/* Health Conditions */}
            <FadeIn delay={0.15}>
              <Card className="h-full rounded-3xl border-primary/15 shadow-sm">
                <CardHeader>
                  <CardHeading
                    icon={<HeartPulse className="h-4 w-4" />}
                    tone="bg-rose-500/10 text-rose-600 dark:text-rose-400"
                    title="Health Conditions"
                    desc="Select all that apply. This helps us provide safe and personalized nutrition recommendations."
                  />
                </CardHeader>
                <CardContent className="space-y-3">
                  <div role="group" aria-label="Health conditions" className="space-y-2.5">
                    {CONDITION_OPTIONS.map((c) => {
                      const checked = condDraft.includes(c.value);
                      return (
                        <label
                          key={c.value}
                          htmlFor={`pfv-cond-${c.value}`}
                          className={cn(
                            "flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition-colors",
                            checked ? "border-primary/30 bg-primary/5" : "hover:bg-muted/40",
                          )}
                        >
                          <Checkbox
                            id={`pfv-cond-${c.value}`}
                            checked={checked}
                            onCheckedChange={() => toggleCond(c.value)}
                            disabled={savingCond}
                            className="mt-0.5"
                            aria-label={c.label}
                          />
                          <Chip className={c.tone}>
                            <c.icon className="h-4 w-4" />
                          </Chip>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-bold leading-tight text-emerald-950 dark:text-emerald-50">
                              {c.label}
                            </span>
                            <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{c.desc}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <Button
                    className="w-full gap-1.5 rounded-xl active:scale-[0.99]"
                    onClick={() => void saveConditions()}
                    disabled={savingCond || !conditionsDirty}
                  >
                    {savingCond ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Check className="h-4 w-4" aria-hidden />
                    )}
                    Save conditions
                  </Button>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    More conditions (hypertension, thyroid) arrive with the next engine update.
                  </p>
                </CardContent>
              </Card>
            </FadeIn>

            {/* Computed Daily Targets */}
            <FadeIn delay={0.2}>
              <Card className="h-full rounded-3xl border-primary/15 shadow-sm">
                <CardHeader>
                  <CardHeading
                    icon={<Flame className="h-4 w-4" />}
                    tone="bg-orange-500/10 text-orange-600 dark:text-orange-400"
                    title="Computed Daily Targets"
                    desc="Customized for your profile and health conditions."
                  />
                  <CardAction>
                    <span
                      title="Computed deterministically on the server from your profile — never AI-invented."
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/70"
                    >
                      <Info className="h-4 w-4" aria-hidden />
                    </span>
                  </CardAction>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <TargetRow
                      icon={<Flame className="h-4 w-4" />}
                      tone="bg-orange-500/10 text-orange-600 dark:text-orange-400"
                      label="Calories"
                      value={formatKcal(t.calories)}
                      badge={
                        p.calorieTargetOverride != null
                          ? `Custom override · ${formatKcal(p.calorieTargetOverride)}`
                          : calorieAdjusted.length > 0
                            ? `Adjusted (for ${calorieAdjusted.join(", ")})`
                            : undefined
                      }
                    />
                    <TargetRow
                      icon={<Dumbbell className="h-4 w-4" />}
                      tone="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      label="Protein"
                      value={formatGrams(t.protein)}
                      badge={
                        p.proteinTargetOverride != null ? `Custom override · ${formatGrams(p.proteinTargetOverride)}` : undefined
                      }
                    />
                    <TargetRow
                      icon={<Wheat className="h-4 w-4" />}
                      tone="bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      label="Carbohydrates"
                      value={formatGrams(t.carbohydrates)}
                    />
                    <TargetRow
                      icon={<Droplet className="h-4 w-4" />}
                      tone="bg-rose-500/10 text-rose-600 dark:text-rose-400"
                      label="Fat"
                      value={formatGrams(t.fat)}
                    />
                    <TargetRow
                      icon={<Leaf className="h-4 w-4" />}
                      tone="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      label="Fiber"
                      value={formatGrams(t.fiber)}
                    />
                    <TargetRow
                      icon={<Droplets className="h-4 w-4" />}
                      tone="bg-teal-500/10 text-teal-600 dark:text-teal-400"
                      label="Sodium limit"
                      value={`${formatShort(t.sodium)} mg`}
                      badge={hasCkd ? "Reduced (for CKD, BP)" : undefined}
                    />
                    <p className="flex items-center gap-3 border-b border-dashed border-border/60 py-2.5 text-xs text-muted-foreground last:border-b-0">
                      <Chip className="bg-teal-500/10 text-teal-600 dark:text-teal-400">
                        <GlassWater className="h-4 w-4" />
                      </Chip>
                      Water guidance follows ICMR-NIN: ~2.5 L/day
                    </p>
                  </div>
                  <div className="rounded-xl bg-primary/5 p-3">
                    <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
                      <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                      These targets are deterministically computed based on ICMR, ADA, KDIGO and AHA guidelines.
                    </p>
                    {data.targetNotes.length > 0 && (
                      <ul className="mt-2 space-y-1.5">
                        {data.targetNotes.map((n, i) => (
                          <li key={i} className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" aria-hidden />
                            {n}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </CardContent>
              </Card>
            </FadeIn>
          </div>

          {/* ---------------- Bottom row ---------------- */}
          <div className="grid items-start gap-5 xl:grid-cols-3">
            {/* Dietary Preferences */}
            <FadeIn delay={0.25}>
              <Card className="h-full rounded-3xl border-primary/15 shadow-sm">
                <CardHeader>
                  <CardHeading
                    icon={<UtensilsCrossed className="h-4 w-4" />}
                    tone="bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    title="Dietary Preferences"
                    desc="Hard filters applied before ranking — never suggestions."
                  />
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="pfv-diet">Diet type</Label>
                    <Select
                      value={p.dietaryPreference}
                      onValueChange={(v) => void changeDiet(v as DietaryPreference)}
                      disabled={savingDiet}
                    >
                      <SelectTrigger id="pfv-diet" aria-label="Diet type" className="h-11 w-full rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DIET_OPTIONS.map((d) => (
                          <SelectItem key={d.value} value={d.value}>
                            {d.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Allergies — hard exclusions
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {p.allergies.length > 0 ? (
                        p.allergies.map((a) => (
                          <span
                            key={a}
                            className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-300"
                          >
                            {cap(a)}
                          </span>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">No allergens configured.</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditorOpen(true)}
                      className="mt-2 inline-flex items-center gap-1 rounded text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Pencil className="h-3 w-3" aria-hidden /> Edit allergens in the full profile dialog
                    </button>
                  </div>
                </CardContent>
              </Card>
            </FadeIn>

            {/* Language Preference */}
            <FadeIn delay={0.3}>
              <Card className="h-full rounded-3xl border-primary/15 shadow-sm">
                <CardHeader>
                  <CardHeading
                    icon={<Languages className="h-4 w-4" />}
                    tone="bg-teal-500/10 text-teal-600 dark:text-teal-400"
                    title="Language Preference"
                    desc="Get recommendations in your preferred language."
                  />
                </CardHeader>
                <CardContent className="space-y-3">
                  <Select
                    value={currentLang}
                    onValueChange={(v) => void changeLanguage(v as LangCode)}
                    disabled={savingLang}
                  >
                    <SelectTrigger aria-label="Preferred language" className="h-11 w-full rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((l) => (
                        <SelectItem key={l.code} value={l.code}>
                          {l.native} · {l.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <label
                    htmlFor="pfv-regional"
                    className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-primary/10 bg-muted/30 p-3"
                  >
                    <Checkbox
                      id="pfv-regional"
                      className="mt-0.5"
                      checked={currentLang !== "en"}
                      onCheckedChange={(c) => void changeLanguage(c === true ? "ta" : "en")}
                      disabled={savingLang}
                      aria-label="Enable regional language support"
                    />
                    <span className="text-sm leading-snug">
                      Enable regional language support (Tamil, Telugu, Hindi, Kannada)
                    </span>
                  </label>
                  {savingLang && (
                    <p className="flex items-center gap-1.5 text-xs text-primary" role="status">
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Saving…
                    </p>
                  )}
                </CardContent>
              </Card>
            </FadeIn>

            {/* Medical Notes */}
            <FadeIn delay={0.35}>
              <Card className="h-full rounded-3xl border-primary/15 shadow-sm">
                <CardHeader>
                  <CardHeading
                    icon={<Stethoscope className="h-4 w-4" />}
                    tone="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    title="Medical Notes"
                    desc="Engine guidance recorded for your current profile."
                  />
                </CardHeader>
                <CardContent className="space-y-4">
                  {data.targetNotes.length > 0 ? (
                    <ul className="space-y-1.5">
                      {data.targetNotes.map((n, i) => (
                        <li key={i} className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" aria-hidden />
                          {n}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No engine notes yet — save your basics or conditions to generate personalized guidance.
                    </p>
                  )}
                  <p className="flex items-center gap-1.5 border-t border-primary/10 pt-3 text-xs text-muted-foreground">
                    <Lock className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden /> Your health data is private and
                    secure.
                  </p>
                </CardContent>
              </Card>
            </FadeIn>
          </div>

          {/* ---------------- Trust strip ---------------- */}
          <FadeIn delay={0.4}>
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-primary/10 to-teal-500/5 p-5">
              <img
                src="/images/hero-leaves.png"
                alt=""
                aria-hidden
                className="pointer-events-none absolute inset-y-0 right-0 hidden h-full w-44 object-cover opacity-25 [mask-image:linear-gradient(to_left,black_45%,transparent_100%)] md:block"
              />
              <div className="relative flex items-center gap-4">
                <span
                  aria-hidden
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
                >
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-emerald-950 dark:text-emerald-50 sm:text-base">
                    Personalized. Safe. Evidence-Based.
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground sm:text-[13px]">
                    Your profile powers disease-aware meal plans using trusted guidelines (ICMR • ADA • KDIGO • AHA).
                  </p>
                </div>
              </div>
            </div>
          </FadeIn>
        </>
      )}

      <ProfileDialog onSaved={bumpData} open={editorOpen} onOpenChange={setEditorOpen} />
    </div>
  );
}
