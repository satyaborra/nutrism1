"use client";

/**
 * Health Profile view — premium rebuild.
 *
 * Hero (ViewHero) with goal chip + live target stats, "Basic Information" card
 * with inline editing (server-mirrored validation), a "Daily targets" card with
 * the calorie hero + macro grid, "Diet & safety" condition/allergy chips and a
 * muted "How your plan is computed" explainer. Numbers are ALWAYS
 * server-computed (api.getProfile / api.updateProfile responses) — never
 * invented client-side.
 */
import { Fragment, useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Cake,
  Check,
  Drumstick,
  Droplets,
  Flame,
  Footprints,
  Info,
  Loader2,
  Pencil,
  RefreshCw,
  Ruler,
  Scale,
  ShieldCheck,
  Sprout,
  Trophy,
  UserRound,
  Wheat,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { api, ApiError } from "@/lib/client/api";
import { formatGrams, formatKcal, formatShort } from "@/lib/client/format";
import type { ActivityLevel, Goal, ProfileResponse } from "@/lib/client/types";
import { useNutriStore, languageLabel } from "../store";
import { ProfileDialog } from "../profile-dialog";
import { FadeIn } from "../fade-in";
import { HeroStat, ViewHero } from "./view-hero";

// ---------- Humanized labels (display only — values stay server-side) ----------

const GOAL_LABELS: Record<Goal, string> = {
  lose_weight: "Lose weight",
  maintain: "Maintain",
  gain_muscle: "Gain muscle",
};

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: "Sedentary",
  light: "Lightly active",
  moderate: "Moderately active",
  active: "Active",
  very_active: "Very active",
};

const EVIDENCE_SOURCES = ["IFCT 2017", "USDA", "WHO", "ICMR-NIN", "ADA", "KDIGO"];

const PIPELINE_STEPS = [
  "BMR (Mifflin-St Jeor)",
  "TDEE (× activity)",
  "Goal adjustment",
  "Clinical constraints",
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

// ---------- Pieces ----------

/** One basic-information row: icon chip + uppercase label + big value, or an inline input. */
function BasicRow({
  icon,
  iconTone,
  label,
  unit,
  value,
  inputId,
  editValue,
  error,
  onChange,
  fieldRef,
  disabled,
}: {
  icon: React.ReactNode;
  iconTone?: string;
  label: string;
  unit?: string;
  /** Server value; null renders "— not set". */
  value: string | null;
  /** When set, the row renders an editable input instead of the value. */
  inputId?: string;
  editValue?: string;
  error?: string;
  onChange?: (v: string) => void;
  fieldRef?: (el: HTMLDivElement | null) => void;
  disabled?: boolean;
}) {
  return (
    <div ref={fieldRef} className="scroll-mt-24 border-b border-dashed border-border/60 py-2.5 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
              iconTone ?? "bg-primary/10 text-primary",
            )}
          >
            {icon}
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        </div>
        {inputId ? (
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1.5">
              <Input
                id={inputId}
                inputMode="decimal"
                autoComplete="off"
                value={editValue ?? ""}
                onChange={(e) => onChange?.(e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${inputId}-error` : undefined}
                disabled={disabled}
                className="h-10 w-24 text-right text-sm font-semibold tabular-nums"
              />
              <span className="w-10 text-xs text-muted-foreground">{unit}</span>
            </div>
            {error && (
              <p id={`${inputId}-error`} role="alert" className="max-w-56 text-right text-xs font-medium text-destructive">
                {error}
              </p>
            )}
          </div>
        ) : (
          <div className="text-right">
            {value != null ? (
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
    </div>
  );
}

export function ProfileView() {
  const { toast } = useToast();
  const user = useNutriStore((s) => s.user);
  const profileBrief = useNutriStore((s) => s.profileBrief);
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
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const fieldRefs = useRef<Record<FieldKey, HTMLDivElement | null>>({ age: null, heightCm: null, weightKg: null });

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
  const firstName = user?.name.split(" ")[0];

  function startEdit() {
    if (!p) return;
    setDraft({
      age: p.age?.toString() ?? "",
      heightCm: p.heightCm?.toString() ?? "",
      weightKg: p.weightKg?.toString() ?? "",
    });
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
        heightCm: num(draft.heightCm),
        weightKg: num(draft.weightKg),
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

  // ----- Hero slots -----
  const goalChip = data && p ? (
    <Badge variant="outline" className="gap-1.5 rounded-full border-primary/30 bg-primary/10 px-3 py-1 text-primary">
      <span aria-hidden>🎯</span>
      {p.goal ? GOAL_LABELS[p.goal] : "No goal set yet"}
    </Badge>
  ) : undefined;

  const heroAction = (
    <Button size="sm" className="gap-1.5 active:scale-[0.98]" onClick={() => setEditorOpen(true)}>
      <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit full profile
    </Button>
  );

  const heroStats = data && t ? (
    <>
      <HeroStat
        icon={<Flame className="h-4 w-4" aria-hidden />}
        label="Calorie target"
        value={formatKcal(t.calories)}
        tone="emerald"
        title="Daily calorie target — computed server-side"
      />
      <HeroStat
        icon={<Drumstick className="h-4 w-4" aria-hidden />}
        label="Protein target"
        value={formatGrams(t.protein)}
        tone="teal"
        title="Daily protein target — computed server-side"
      />
      <HeroStat
        icon={<Zap className="h-4 w-4" aria-hidden />}
        label="TDEE"
        value={formatKcal(t.tdee)}
        tone="amber"
        title="Total daily energy expenditure — computed server-side"
      />
    </>
  ) : null;

  // ----- Basic information rows -----
  const basicsEditable: { key: FieldKey; label: string; unit: string; icon: React.ReactNode }[] = [
    { key: "age", label: "Age", unit: "years", icon: <Cake className="h-4 w-4" /> },
    { key: "heightCm", label: "Height", unit: "cm", icon: <Ruler className="h-4 w-4" /> },
    { key: "weightKg", label: "Weight", unit: "kg", icon: <Scale className="h-4 w-4" /> },
  ];

  const basicsStatic: { label: string; icon: React.ReactNode; value: string | null }[] = [
    { label: "Sex", icon: <UserRound className="h-4 w-4" />, value: p?.sex ? cap(p.sex) : null },
    {
      label: "Activity",
      icon: <Footprints className="h-4 w-4" />,
      value: p?.activityLevel ? (ACTIVITY_LABELS[p.activityLevel] ?? null) : null,
    },
    {
      label: "Goal",
      icon: <Trophy className="h-4 w-4" />,
      value: p?.goal ? (GOAL_LABELS[p.goal] ?? null) : null,
    },
  ];

  // ----- Daily targets mini grid -----
  const targetCells = t
    ? [
        {
          icon: <Activity className="h-3.5 w-3.5" />,
          label: "BMR",
          value: formatKcal(t.bmr),
          tone: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
        },
        {
          icon: <Zap className="h-3.5 w-3.5" />,
          label: "TDEE",
          value: formatKcal(t.tdee),
          tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
        },
        {
          icon: <Drumstick className="h-3.5 w-3.5" />,
          label: "Protein",
          value: formatGrams(t.protein),
          tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        },
        {
          icon: <Wheat className="h-3.5 w-3.5" />,
          label: "Carbs",
          value: formatGrams(t.carbohydrates),
          tone: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
        },
        {
          icon: <Droplets className="h-3.5 w-3.5" />,
          label: "Fat",
          value: formatGrams(t.fat),
          tone: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
        },
        {
          icon: <Sprout className="h-3.5 w-3.5" />,
          label: "Fiber",
          value: formatGrams(t.fiber),
          tone: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
        },
      ]
    : [];

  return (
    <div className="space-y-5">
      <FadeIn>
        <ViewHero
          title="Health Profile"
          subtitle={
            firstName
              ? `${firstName}, these are the inputs behind every target and constraint — the AI never invents them.`
              : "The inputs behind every target and constraint — the AI never invents them."
          }
          script="Know Your Numbers"
          image="/images/dish-dosa.png"
          chip={goalChip}
          actions={heroAction}
          stats={heroStats}
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
          <Skeleton className="h-48 w-full rounded-3xl" />
          <div className="grid gap-5 md:grid-cols-2" aria-hidden>
            <Skeleton className="h-80 rounded-3xl" />
            <Skeleton className="h-80 rounded-3xl" />
            <Skeleton className="h-72 rounded-3xl" />
            <Skeleton className="h-72 rounded-3xl" />
          </div>
        </div>
      )}

      {data && p && t && (
        <div className="grid items-start gap-5 md:grid-cols-2">
          {/* ---------------- Basic Information (inline editing) ---------------- */}
          <FadeIn delay={0.05}>
            <Card className="h-full rounded-3xl border-primary/15 shadow-sm">
              <CardHeader>
                <h2 className="flex items-center gap-2 text-base font-semibold leading-none">
                  <span
                    aria-hidden
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary"
                  >
                    <UserRound className="h-4 w-4" />
                  </span>
                  Basic Information
                </h2>
                <p className="text-sm text-muted-foreground">Drives BMR → TDEE → macro targets.</p>
                <CardAction>
                  {editing ? (
                    <div className="flex items-center gap-1.5">
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
                  ) : (
                    <Button size="sm" variant="outline" className="gap-1.5 active:scale-[0.98]" onClick={startEdit}>
                      <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
                    </Button>
                  )}
                </CardAction>
              </CardHeader>
              <CardContent>
                <div>
                  {basicsEditable.map((row) => (
                    <BasicRow
                      key={row.key}
                      icon={row.icon}
                      label={row.label}
                      unit={row.unit}
                      value={
                        row.key === "age"
                          ? p.age != null
                            ? formatShort(p.age)
                            : null
                          : row.key === "heightCm"
                            ? p.heightCm != null
                              ? formatShort(p.heightCm)
                              : null
                            : p.weightKg != null
                              ? formatShort(p.weightKg)
                              : null
                      }
                      inputId={editing ? `pfv-${row.key}` : undefined}
                      editValue={draft[row.key]}
                      error={fieldErrors[row.key]}
                      onChange={(v) => updateDraft(row.key, v)}
                      fieldRef={(el) => {
                        fieldRefs.current[row.key] = el;
                      }}
                      disabled={saving}
                    />
                  ))}
                  {basicsStatic.map((row) => (
                    <BasicRow key={row.label} icon={row.icon} label={row.label} value={row.value} />
                  ))}
                </div>
                {editing && (
                  <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                    Validated against the same server ranges the engine uses: age 5–120, height 80–250 cm, weight
                    15–400 kg. Leave a field empty to clear it.
                  </p>
                )}
              </CardContent>
            </Card>
          </FadeIn>

          {/* ---------------- Daily targets ---------------- */}
          <FadeIn delay={0.1}>
            <Card className="h-full rounded-3xl border-primary/15 shadow-sm">
              <CardHeader>
                <h2 className="flex items-center gap-2 text-base font-semibold leading-none">
                  <span
                    aria-hidden
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400"
                  >
                    <Flame className="h-4 w-4" />
                  </span>
                  Daily targets
                </h2>
                <p className="text-sm text-muted-foreground">Calculated from your basics — never AI-invented.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/10 via-primary/5 to-amber-500/5 p-4">
                  <div className="flex items-center gap-3.5">
                    <span
                      aria-hidden
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary"
                    >
                      <Flame className="h-6 w-6" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Calorie target
                      </p>
                      <p className="text-3xl font-extrabold leading-tight tabular-nums text-emerald-950 dark:text-emerald-50">
                        {formatKcal(t.calories)}
                      </p>
                    </div>
                    <span className="ml-auto self-start rounded-lg bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
                      per day
                    </span>
                  </div>
                </div>

                {(p.calorieTargetOverride != null || p.proteinTargetOverride != null) && (
                  <div className="flex flex-wrap gap-1.5">
                    {p.calorieTargetOverride != null && (
                      <Badge
                        variant="outline"
                        className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                      >
                        <span aria-hidden>⚡</span> Custom override · {formatKcal(p.calorieTargetOverride)}
                      </Badge>
                    )}
                    {p.proteinTargetOverride != null && (
                      <Badge
                        variant="outline"
                        className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                      >
                        <span aria-hidden>⚡</span> Custom override · {formatGrams(p.proteinTargetOverride)}
                      </Badge>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {targetCells.map((c) => (
                    <div key={c.label} className="rounded-xl bg-muted/50 p-2.5">
                      <span
                        aria-hidden
                        className={cn("flex h-7 w-7 items-center justify-center rounded-lg", c.tone)}
                      >
                        {c.icon}
                      </span>
                      <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {c.label}
                      </p>
                      <p className="text-sm font-bold tabular-nums text-emerald-950 dark:text-emerald-50">{c.value}</p>
                    </div>
                  ))}
                </div>

                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Zap className="h-3 w-3 shrink-0" aria-hidden />
                  Deterministic engine output — recomputed on every profile save.
                </p>
              </CardContent>
            </Card>
          </FadeIn>

          {/* ---------------- Diet & safety ---------------- */}
          <FadeIn delay={0.15}>
            <Card className="h-full rounded-3xl border-primary/15 shadow-sm">
              <CardHeader>
                <h2 className="flex items-center gap-2 text-base font-semibold leading-none">
                  <span
                    aria-hidden
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400"
                  >
                    <ShieldCheck className="h-4 w-4" />
                  </span>
                  Diet &amp; safety
                </h2>
                <p className="text-sm text-muted-foreground">Applied before ranking — hard filters, not suggestions.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Dietary preference
                    </h3>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <span className="rounded-lg border bg-muted/50 px-2 py-1 font-mono text-[11px] font-medium uppercase tracking-wide">
                        {p.dietaryPreference.replace(/_/g, " ")}
                      </span>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Language
                    </h3>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <span className="rounded-lg border bg-muted/50 px-2 py-1 font-mono text-[11px] font-medium uppercase tracking-wide">
                        {languageLabel(p.language ?? profileBrief?.language)}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Health conditions
                  </h3>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {p.healthConditions.length > 0 ? (
                      p.healthConditions.map((c) => (
                        <span
                          key={c}
                          className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-2 py-1 font-mono text-[11px] font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300"
                        >
                          {c}
                        </span>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">No conditions recorded</p>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Hard-excluded allergens
                  </h3>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {p.allergies.length > 0 ? (
                      p.allergies.map((a) => (
                        <span
                          key={a}
                          className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1 font-mono text-[11px] font-medium text-amber-700 dark:text-amber-300"
                        >
                          {cap(a)}
                        </span>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">No allergies recorded</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </FadeIn>

          {/* ---------------- How your plan is computed ---------------- */}
          <FadeIn delay={0.2}>
            <Card className="h-full rounded-3xl border-dashed border-primary/15 bg-muted/30 shadow-sm">
              <CardHeader>
                <h2 className="flex items-center gap-2 text-base font-semibold leading-none">
                  <span
                    aria-hidden
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-muted-foreground"
                  >
                    <Info className="h-4 w-4" />
                  </span>
                  How your plan is computed
                </h2>
                <p className="text-sm text-muted-foreground">Fixed server pipeline — same inputs, same targets.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-1 text-[11px] font-medium">
                  {PIPELINE_STEPS.map((step, i) => (
                    <Fragment key={step}>
                      <span className="rounded-lg bg-muted/70 px-2 py-1 text-foreground/80">{step}</span>
                      {i < PIPELINE_STEPS.length - 1 && (
                        <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                      )}
                    </Fragment>
                  ))}
                </div>

                {data.targetNotes.length > 0 && (
                  <div>
                    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Engine notes for your current numbers
                    </h3>
                    <ul className="mt-1.5 space-y-1.5">
                      {data.targetNotes.map((n, i) => (
                        <li key={i} className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                          {n}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex flex-wrap gap-1.5">
                  {EVIDENCE_SOURCES.map((s) => (
                    <span
                      key={s}
                      className="rounded-md border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                    >
                      {s}
                    </span>
                  ))}
                </div>

                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Educational estimates only — not medical advice. For medical nutrition therapy, please consult your
                  clinician or a registered dietitian.
                </p>
              </CardContent>
            </Card>
          </FadeIn>
        </div>
      )}

      <ProfileDialog onSaved={bumpData} open={editorOpen} onOpenChange={setEditorOpen} />
    </div>
  );
}
