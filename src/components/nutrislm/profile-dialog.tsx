"use client";

/**
 * Health profile editor. Saving recomputes targets server-side (Mifflin-St Jeor,
 * ICMR-NIN, ADA, KDIGO, WHO) and shows the notes the engine produced.
 */
import { useEffect, useState } from "react";
import { Loader2, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Toggle } from "@/components/ui/toggle";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatGrams, formatKcal, formatMg } from "@/lib/client/format";
import type { Allergen, ComputedTargets, HealthCondition, ProfileResponse } from "@/lib/client/types";
import { api, ApiError } from "@/lib/client/api";

const ACTIVITIES = [
  { value: "sedentary", label: "Sedentary (desk job)" },
  { value: "light", label: "Lightly active (1-3 d/wk)" },
  { value: "moderate", label: "Moderately active (3-5 d/wk)" },
  { value: "active", label: "Active (6-7 d/wk)" },
  { value: "very_active", label: "Very active / athlete" },
];
const GOALS = [
  { value: "lose_weight", label: "Lose weight" },
  { value: "maintain", label: "Maintain" },
  { value: "gain_muscle", label: "Gain muscle" },
];
const DIETS = [
  { value: "vegetarian", label: "Vegetarian" },
  { value: "vegan", label: "Vegan" },
  { value: "eggetarian", label: "Eggetarian" },
  { value: "non_vegetarian", label: "Non-vegetarian" },
];
const LANGS = [
  { value: "en", label: "English" },
  { value: "ta", label: "தமிழ் Tamil" },
  { value: "te", label: "తెలుగు Telugu" },
  { value: "hi", label: "हिन्दी Hindi" },
  { value: "kn", label: "ಕನ್ನಡ Kannada" },
];
const ALLERGENS: { value: Allergen; label: string }[] = [
  { value: "dairy", label: "Dairy" },
  { value: "nuts", label: "Tree nuts" },
  { value: "peanuts", label: "Peanuts" },
  { value: "gluten", label: "Gluten" },
  { value: "egg", label: "Egg" },
  { value: "fish", label: "Fish" },
  { value: "soy", label: "Soy" },
];
const CONDITIONS: { value: HealthCondition; label: string; hint: string }[] = [
  { value: "T2DM", label: "Type 2 Diabetes", hint: "Carb/fiber/sugar pacing (ADA)" },
  { value: "CKD", label: "Chronic Kidney Disease", hint: "Protein/sodium/potassium/phosphorus (KDIGO)" },
  { value: "CVD", label: "Heart Disease", hint: "Sodium/saturated fat/cholesterol (AHA)" },
];

interface FormState {
  age: string;
  sex: string;
  heightCm: string;
  weightKg: string;
  activityLevel: string;
  goal: string;
  dietaryPreference: string;
  language: string;
  allergies: string[];
  healthConditions: string[];
  calorieTargetOverride: string;
  proteinTargetOverride: string;
}

function fromProfile(p: ProfileResponse): FormState {
  const pr = p.profile;
  return {
    age: pr.age?.toString() ?? "",
    sex: pr.sex ?? "",
    heightCm: pr.heightCm?.toString() ?? "",
    weightKg: pr.weightKg?.toString() ?? "",
    activityLevel: pr.activityLevel ?? "",
    goal: pr.goal ?? "",
    dietaryPreference: pr.dietaryPreference || "vegetarian",
    language: pr.language || "en",
    allergies: pr.allergies ?? [],
    healthConditions: pr.healthConditions ?? [],
    calorieTargetOverride: pr.calorieTargetOverride?.toString() ?? "",
    proteinTargetOverride: pr.proteinTargetOverride?.toString() ?? "",
  };
}

export function ProfileDialog({ onSaved }: { onSaved: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<ProfileResponse | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await api.getProfile();
      setLoaded(res);
      setForm(fromProfile(res));
    } catch (e) {
      toast({
        title: "Could not load profile",
        description: e instanceof ApiError ? e.message : "Unexpected error.",
        variant: "destructive",
      });
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && !loaded) void load();

  }, [open]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  function toggleIn(key: "allergies" | "healthConditions", value: string) {
    setForm((f) => {
      if (!f) return f;
      const has = f[key].includes(value);
      return { ...f, [key]: has ? f[key].filter((v) => v !== value) : [...f[key], value] };
    });
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      const num = (s: string) => (s.trim() === "" ? null : Number(s));
      const res = await api.updateProfile({
        age: num(form.age),
        sex: form.sex || null,
        heightCm: num(form.heightCm),
        weightKg: num(form.weightKg),
        activityLevel: form.activityLevel || null,
        goal: form.goal || null,
        dietaryPreference: form.dietaryPreference,
        language: form.language,
        allergies: form.allergies,
        healthConditions: form.healthConditions,
        calorieTargetOverride: num(form.calorieTargetOverride),
        proteinTargetOverride: num(form.proteinTargetOverride),
      });
      setLoaded(res);
      setForm(fromProfile(res));
      toast({ title: "Profile saved", description: "Targets and disease constraints were recomputed." });
      onSaved();
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

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) return;
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="mr-1.5 h-4 w-4" aria-hidden /> My health profile
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Your health profile</DialogTitle>
          <DialogDescription>
            Targets (BMR → TDEE → macros) and disease constraints are computed from this — never invented by AI.
          </DialogDescription>
        </DialogHeader>

        {loading || !form ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading profile" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <NumField id="pf-age" label="Age" value={form.age} onChange={(v) => set("age", v)} min={2} max={120} />
              <div className="space-y-1.5">
                <Label htmlFor="pf-sex">Sex</Label>
                <Select value={form.sex || undefined} onValueChange={(v) => set("sex", v)}>
                  <SelectTrigger id="pf-sex" aria-label="Sex">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <NumField id="pf-height" label="Height (cm)" value={form.heightCm} onChange={(v) => set("heightCm", v)} min={80} max="260" />
              <NumField id="pf-weight" label="Weight (kg)" value={form.weightKg} onChange={(v) => set("weightKg", v)} min={10} max="300" />
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="pf-activity">Activity level</Label>
                <Select value={form.activityLevel || undefined} onValueChange={(v) => set("activityLevel", v)}>
                  <SelectTrigger id="pf-activity" aria-label="Activity level">
                    <SelectValue placeholder="Select activity" />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTIVITIES.map((a) => (
                      <SelectItem key={a.value} value={a.value}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pf-goal">Goal</Label>
                <Select value={form.goal || undefined} onValueChange={(v) => set("goal", v)}>
                  <SelectTrigger id="pf-goal" aria-label="Goal">
                    <SelectValue placeholder="Select goal" />
                  </SelectTrigger>
                  <SelectContent>
                    {GOALS.map((g) => (
                      <SelectItem key={g.value} value={g.value}>
                        {g.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pf-diet">Dietary preference</Label>
                <Select value={form.dietaryPreference} onValueChange={(v) => set("dietaryPreference", v)}>
                  <SelectTrigger id="pf-diet" aria-label="Dietary preference">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DIETS.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pf-lang">Preferred language</Label>
                <Select value={form.language} onValueChange={(v) => set("language", v)}>
                  <SelectTrigger id="pf-lang" aria-label="Preferred language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGS.map((l) => (
                      <SelectItem key={l.value} value={l.value}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            <div>
              <p className="mb-2 text-sm font-medium">Allergies — hard exclusions</p>
              <div className="flex flex-wrap gap-1.5">
                {ALLERGENS.map((a) => (
                  <Toggle
                    key={a.value}
                    size="sm"
                    variant="outline"
                    pressed={form.allergies.includes(a.value)}
                    onPressedChange={() => toggleIn("allergies", a.value)}
                    aria-pressed={form.allergies.includes(a.value)}
                    className={cn(form.allergies.includes(a.value) && "border-destructive/50 bg-destructive/10 text-destructive")}
                  >
                    {a.label}
                  </Toggle>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">Health conditions — evidence-based constraints</p>
              <div className="space-y-1.5">
                {CONDITIONS.map((c) => {
                  const active = form.healthConditions.includes(c.value);
                  return (
                    <Toggle
                      key={c.value}
                      size="sm"
                      variant="outline"
                      pressed={active}
                      onPressedChange={() => toggleIn("healthConditions", c.value)}
                      aria-pressed={active}
                      className={cn("w-full justify-start", active && "border-primary/50 bg-primary/10")}
                    >
                      <span className="flex flex-col items-start">
                        <span className="font-medium">{c.label}</span>
                        <span className="text-[10px] font-normal text-muted-foreground">{c.hint}</span>
                      </span>
                    </Toggle>
                  );
                })}
              </div>
            </div>

            <Separator />

            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">Advanced — override targets</summary>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <NumField
                  id="pf-cal-ovr"
                  label="Calorie target (kcal/day)"
                  value={form.calorieTargetOverride}
                  onChange={(v) => set("calorieTargetOverride", v)}
                  min={800}
                  max="6000"
                  placeholder="Auto"
                />
                <NumField
                  id="pf-pro-ovr"
                  label="Protein target (g/day)"
                  value={form.proteinTargetOverride}
                  onChange={(v) => set("proteinTargetOverride", v)}
                  min={20}
                  max="300"
                  placeholder="Auto"
                />
              </div>
            </details>

            {loaded && (
              <div className="rounded-xl bg-muted/50 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Computed daily targets
                </p>
                <TargetGrid targets={loaded.computedTargets} />
                {loaded.targetNotes.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {loaded.targetNotes.map((n, i) => (
                      <li key={i} className="flex gap-1.5 text-[11px] text-muted-foreground">
                        <Badge variant="outline" className="h-4 shrink-0 px-1 font-mono text-[8px]">
                          {i + 1}
                        </Badge>
                        {n}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button onClick={save} disabled={saving || loading || !form}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            Save profile
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NumField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  min?: number;
  max?: number | string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function TargetGrid({ targets }: { targets: ComputedTargets }) {
  const items: [string, string][] = [
    ["Energy", formatKcal(targets.calories)],
    ["Protein", formatGrams(targets.protein)],
    ["Carbs", formatGrams(targets.carbohydrates)],
    ["Fat", formatGrams(targets.fat)],
    ["Fiber", formatGrams(targets.fiber)],
    ["Sugar cap", formatGrams(targets.sugar)],
    ["Sodium cap", formatMg(targets.sodium)],
    ["BMR", formatKcal(targets.bmr)],
    ["TDEE", formatKcal(targets.tdee)],
  ];
  return (
    <ul className="grid grid-cols-3 gap-1.5">
      {items.map(([label, value]) => (
        <li key={label} className="rounded-lg bg-background px-2 py-1.5 text-center">
          <span className="block text-[9px] uppercase tracking-wide text-muted-foreground">{label}</span>
          <span className="text-xs font-bold tabular-nums">{value}</span>
        </li>
      ))}
    </ul>
  );
}
