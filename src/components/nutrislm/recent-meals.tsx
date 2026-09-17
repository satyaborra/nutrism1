"use client";

/**
 * Recent meals list — from persisted server data only.
 * Supports: expandable full nutrient breakdown, per-meal disease-compliance badge
 * (server-evaluated against DB constraints), edit quantities/units, delete with confirmation.
 */
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { CheckCircle2, ChevronDown, HelpCircle, History, Loader2, Pencil, Repeat, Star, Trash2, TriangleAlert, Camera } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useNutriStore, MEAL_TYPE_ICON, MEAL_TYPE_ACCENT, mealLabel } from "./store";
import { formatGrams, formatKcal } from "@/lib/client/format";
import type { Compliance, MealDetail, RecentMealsResponse } from "@/lib/client/types";
import { api } from "@/lib/client/api";

/** Full nutrient panel rows: (label, key, unit, decimals). Order = display order. */
const NUTRIENT_ROWS: { label: string; key: keyof MealDetail["totals"]; unit: string; decimals: number; tone?: "watch" }[] = [
  { label: "Calories", key: "calories", unit: "kcal", decimals: 0 },
  { label: "Protein", key: "protein", unit: "g", decimals: 1 },
  { label: "Carbs", key: "carbohydrates", unit: "g", decimals: 1 },
  { label: "Fat", key: "fat", unit: "g", decimals: 1 },
  { label: "Sat. fat", key: "saturatedFat", unit: "g", decimals: 1, tone: "watch" },
  { label: "Fiber", key: "fiber", unit: "g", decimals: 1 },
  { label: "Sugar", key: "sugar", unit: "g", decimals: 1, tone: "watch" },
  { label: "Sodium", key: "sodium", unit: "mg", decimals: 0, tone: "watch" },
  { label: "Potassium", key: "potassium", unit: "mg", decimals: 0 },
  { label: "Phosphorus", key: "phosphorus", unit: "mg", decimals: 0 },
  { label: "Cholesterol", key: "cholesterol", unit: "mg", decimals: 0, tone: "watch" },
];

/** Common household units offered when editing a line (merged with the line's current unit). */
const EDIT_UNITS = ["piece", "cup", "katori", "bowl", "glass", "serving", "tsp", "tbsp", "slice", "g", "ml", "medium", "small", "large"];

function formatValue(n: number, decimals: number): string {
  if (decimals === 0) return String(Math.round(n));
  return (Math.round((n + Number.EPSILON) * 10) / 10).toFixed(1);
}

/** Compact per-meal compliance badge — states evaluated server-side from DB constraints. */
function ComplianceBadge({ compliance, conditions }: { compliance?: Compliance; conditions: string[] }) {
  if (!compliance || conditions.length === 0) return null;
  if (compliance.state === "COMPLIANT") {
    return (
      <Badge variant="outline" className="gap-1 border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0 text-[9px] uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-2.5 w-2.5" aria-hidden /> ok
      </Badge>
    );
  }
  if (compliance.state === "POTENTIALLY_NON_COMPLIANT") {
    const tip = compliance.violations.map((v) => `${v.condition}: ${v.message}`).join("\n");
    return (
      <Badge
        variant="outline"
        title={tip}
        className="gap-1 border-amber-500/40 bg-amber-500/10 px-1.5 py-0 text-[9px] uppercase tracking-wide text-amber-700 dark:text-amber-400"
      >
        <TriangleAlert className="h-2.5 w-2.5" aria-hidden /> watch
      </Badge>
    );
  }
  return (
    <Badge variant="outline" title="Not all values were available to verify your conditions." className="gap-1 px-1.5 py-0 text-[9px] uppercase tracking-wide text-muted-foreground">
      <HelpCircle className="h-2.5 w-2.5" aria-hidden /> unclear
    </Badge>
  );
}

interface EditLineState {
  qty: string;
  unit: string;
  removed: boolean;
}

function EditMealDialog({
  meal,
  open,
  onOpenChange,
  onSaved,
}: {
  meal: MealDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [lines, setLines] = useState<Record<string, EditLineState>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (meal && open) {
      const init: Record<string, EditLineState> = {};
      for (const f of meal.foods) init[f.id] = { qty: String(f.quantity), unit: f.unit, removed: false };
      setLines(init);
    }
  }, [meal, open]);

  const changePreview = useMemo(() => {
    if (!meal) return { any: false, approxKcal: 0 };
    let approx = 0;
    let any = false;
    for (const f of meal.foods) {
      const st = lines[f.id];
      if (!st) continue;
      if (st.removed) {
        any = true;
        continue;
      }
      const q = Number(st.qty);
      if (!Number.isFinite(q) || q <= 0) continue;
      if (q !== f.quantity || st.unit !== f.unit) any = true;
      // Rough client preview only — the server recalculates exact values from the Food table.
      approx += (f.nutrition.calories ?? 0) * (q / f.quantity);
    }
    return { any, approxKcal: approx };
  }, [lines, meal]);

  if (!meal) return null;

  function setLine(id: string, patch: Partial<EditLineState>) {
    setLines((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function handleSave() {
    if (!meal) return;
    const built: { lineId: string; remove?: true; quantity?: number; unit?: string }[] = [];
    let invalid = false;
    for (const f of meal.foods) {
      const st = lines[f.id];
      if (!st) continue;
      if (st.removed) {
        built.push({ lineId: f.id, remove: true });
        continue;
      }
      const q = Number(st.qty);
      if (!Number.isFinite(q) || q <= 0) {
        invalid = true;
        break;
      }
      if (q !== f.quantity || st.unit !== f.unit) built.push({ lineId: f.id, quantity: q, unit: st.unit });
    }

    if (invalid) {
      toast({ title: "Check quantities", description: "Every kept line needs a quantity above 0.", variant: "destructive" });
      return;
    }
    if (built.length === 0) {
      toast({ title: "Nothing changed", description: "Adjust a quantity, switch a unit, or remove a line." });
      return;
    }
    const removedCount = built.filter((f) => f.remove).length;
    if (meal.foods.length - removedCount === 0) {
      toast({ title: "Cannot remove everything", description: "A meal needs at least one item — delete the meal instead.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const res = await api.editMeal(meal.id, { foods: built });
      const convNote = res.conversionNotes?.[0]?.note;
      toast({
        title: "Meal updated",
        description: convNote
          ? `${formatKcal(res.previousCalories)} → ${formatKcal(res.totals.calories)} · ${convNote}`
          : `${formatKcal(res.previousCalories)} → ${formatKcal(res.totals.calories)} · recalculated from the food database.`,
      });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast({
        title: "Could not update meal",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  const unitsFor = (current: string) => Array.from(new Set([current, ...EDIT_UNITS]));

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-primary" aria-hidden />
            Edit {mealLabel(meal.mealType).toLowerCase()}
          </DialogTitle>
          <DialogDescription>
            Adjust quantities or units — totals are recalculated server-side from the food database, never from this form.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin]">
          {meal.foods.map((f) => {
            const st = lines[f.id];
            if (!st) return null;
            const qNum = Number(st.qty);
            const approx = Number.isFinite(qNum) && qNum > 0 ? (f.nutrition.calories ?? 0) * (qNum / f.quantity) : 0;
            const changed = qNum !== f.quantity || st.unit !== f.unit;
            return (
              <div
                key={f.id}
                className={cn(
                  "rounded-lg border p-2.5 transition-opacity",
                  st.removed ? "border-destructive/30 bg-destructive/5 opacity-60" : "bg-muted/30",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-medium">{f.name}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn("h-7 px-2 text-xs", st.removed ? "text-foreground" : "text-muted-foreground hover:text-destructive")}
                    onClick={() => setLine(f.id, { removed: !st.removed })}
                  >
                    {st.removed ? "Keep" : "Remove"}
                  </Button>
                </div>
                <div className="mt-2 flex items-end gap-2">
                  <div className="w-24 space-y-1">
                    <Label htmlFor={`qty-${f.id}`} className="text-[10px] uppercase tracking-wide text-muted-foreground">Quantity</Label>
                    <Input
                      id={`qty-${f.id}`}
                      type="number"
                      inputMode="decimal"
                      min={0.1}
                      max={100}
                      step={0.5}
                      value={st.qty}
                      disabled={st.removed}
                      onChange={(e) => setLine(f.id, { qty: e.target.value })}
                      className="h-8 tabular-nums"
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label htmlFor={`unit-${f.id}`} className="text-[10px] uppercase tracking-wide text-muted-foreground">Unit</Label>
                    <Select value={st.unit} onValueChange={(v) => setLine(f.id, { unit: v })} disabled={st.removed}>
                      <SelectTrigger id={`unit-${f.id}`} className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {unitsFor(f.unit).map((u) => (
                          <SelectItem key={u} value={u}>{u}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className={cn("pb-1.5 text-right text-xs tabular-nums", changed ? "font-semibold text-primary" : "text-muted-foreground")}>
                    ≈{Math.round(approx)} kcal
                  </p>
                </div>
                {changed && !st.removed && (
                  <p className="mt-1.5 text-[10px] text-muted-foreground">
                    Was {f.quantity} {f.unit} · {formatKcal(f.nutrition.calories ?? 0)} — preview is approximate, server recalculates.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs">
          <span className="text-muted-foreground">New meal total (preview): </span>
          <span className="font-semibold tabular-nums">≈{Math.round(changePreview.approxKcal)} kcal</span>
          <span className="text-muted-foreground"> · exact values computed on save</span>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={() => void handleSave()} disabled={saving || !changePreview.any}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Recalculating…
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RecentMeals() {
  const dataVersion = useNutriStore((s) => s.dataVersion);
  const bumpData = useNutriStore((s) => s.bumpData);
  const healthConditions = useNutriStore((s) => s.profileBrief?.healthConditions ?? []);
  const { toast } = useToast();
  const [data, setData] = useState<RecentMealsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MealDetail | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState<MealDetail | null>(null);
  const [pendingRelog, setPendingRelog] = useState<MealDetail | null>(null);
  const [relogging, setRelogging] = useState(false);
  const [favSourceMealIds, setFavSourceMealIds] = useState<Set<string>>(new Set());
  const [favoritingId, setFavoritingId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .recentMeals()
      .then((res) => alive && (setData(res), setError(null)))
      .catch(() => alive && setError("Could not load your meals."));
    // Favorites (only their sourceMealIds are needed here) — non-fatal on failure.
    api
      .favorites()
      .then((res) => {
        if (!alive) return;
        setFavSourceMealIds(new Set(res.favorites.map((f) => f.sourceMealId).filter((v): v is string => v !== null)));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [dataVersion]);

  async function handleFavorite(m: MealDetail) {
    if (favSourceMealIds.has(m.id)) {
      toast({ title: "Already in favorites", description: "Use the ⭐ chips in the food logger to quick-log or remove it." });
      return;
    }
    setFavoritingId(m.id);
    try {
      const res = await api.createFavorite(m.id);
      toast({ title: "Saved to favorites", description: `${res.favorite.name} is now one tap away in the food logger.` });
      setFavSourceMealIds((prev) => new Set(prev).add(m.id));
      // Bump so the logger's FavoritesBar refetches and shows the new chip.
      bumpData();
    } catch (e) {
      toast({
        title: "Could not save favorite",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setFavoritingId(null);
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const res = await api.deleteMeal(pendingDelete.id);
      toast({
        title: "Meal deleted",
        description: `${res.removedFoods} item${res.removedFoods === 1 ? "" : "s"} · ${formatKcal(res.removedCalories)} removed from today's totals.`,
      });
      setPendingDelete(null);
      bumpData();
    } catch (e) {
      toast({
        title: "Could not delete meal",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  }

  async function handleRelog() {
    if (!pendingRelog) return;
    setRelogging(true);
    try {
      const res = await api.relogMeal(pendingRelog.id);
      toast({
        title: "Logged again",
        description: `${res.totals.calories} kcal · recalculated fresh from the food database.`,
      });
      setPendingRelog(null);
      bumpData();
    } catch (e) {
      toast({
        title: "Could not log this meal again",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setRelogging(false);
    }
  }

  return (
    <Card className="transition-shadow duration-300 hover:shadow-md hover:shadow-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary" aria-hidden />
          Recent meals
        </CardTitle>
        <CardDescription>
          Your last logged meals with server-verified totals. Expand for the full nutrient panel, or edit and delete a mistaken entry.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

        {!data && !error && (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {data && data.count === 0 && (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nothing logged yet — log your first meal above and it will appear here.
          </p>
        )}

        {data && data.count > 0 && (
          <ul className="max-h-96 space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin]">
            {data.meals.map((m) => (
              <li key={m.id}>
                <Collapsible>
                  <div className="group/meal relative overflow-hidden rounded-xl border transition-colors hover:border-primary/40 hover:bg-muted/30 data-[state=open]:border-primary/40">
                    {/* Slot accent stripe */}
                    <span
                      aria-hidden
                      className={cn(
                        "absolute inset-y-0 left-0 w-1 transition-opacity",
                        MEAL_TYPE_ACCENT[m.mealType] ?? "bg-muted-foreground/30",
                      )}
                    />
                    <CollapsibleTrigger className="flex w-full items-center gap-3 rounded-xl p-3 pl-4 pr-28 text-left transition-colors hover:bg-muted/50">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-base transition-transform group-hover/meal:scale-105" aria-hidden>
                        {MEAL_TYPE_ICON[m.mealType] ?? "🍽️"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold">{mealLabel(m.mealType)}</span>
                          <span className="text-xs text-muted-foreground">{format(new Date(m.eatenAt), "d MMM, HH:mm")}</span>
                          <ComplianceBadge compliance={m.compliance} conditions={healthConditions} />
                          {m.source === "recommendation" && (
                            <Badge variant="secondary" className="text-[9px] uppercase tracking-wide">
                              from rec
                            </Badge>
                          )}
                          {m.source === "image" && (
                            <Badge variant="secondary" className="gap-0.5 text-[9px] uppercase tracking-wide">
                              <Camera className="h-2.5 w-2.5" aria-hidden /> photo
                            </Badge>
                          )}
                          {m.source === "relog" && (
                            <Badge variant="secondary" className="gap-0.5 text-[9px] uppercase tracking-wide">
                              <Repeat className="h-2.5 w-2.5" aria-hidden /> again
                            </Badge>
                          )}
                          {m.source === "favorite" && (
                            <Badge variant="secondary" className="gap-0.5 text-[9px] uppercase tracking-wide">
                              <Star className="h-2.5 w-2.5" aria-hidden /> fav
                            </Badge>
                          )}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {m.foods.map((f) => f.name).join(" · ")}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-semibold tabular-nums">{formatKcal(m.totals.calories)}</span>
                        <span className="block text-[10px] text-muted-foreground tabular-nums">
                          P {formatGrams(m.totals.protein)} · C {formatGrams(m.totals.carbohydrates)} · F {formatGrams(m.totals.fat)}
                        </span>
                      </span>
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" aria-hidden />
                    </CollapsibleTrigger>

                    {/* Favorite + edit + delete — overlay the row's right edge. Always visible on touch-sized
                        screens (no hover), hover-revealed from sm up. */}
                    <div className="absolute right-2 top-2 flex gap-1 opacity-100 transition-all focus-within:opacity-100 sm:opacity-0 sm:group-hover/meal:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={favSourceMealIds.has(m.id) ? `Saved in favorites` : `Save ${mealLabel(m.mealType)} logged at ${format(new Date(m.eatenAt), "HH:mm")} to favorites`}
                        aria-pressed={favSourceMealIds.has(m.id)}
                        title={favSourceMealIds.has(m.id) ? "Saved in favorites" : "Save to favorites"}
                        className={cn(
                          "h-7 w-7 transition-all",
                          favSourceMealIds.has(m.id)
                            ? "text-amber-500"
                            : "text-muted-foreground/50 hover:bg-amber-500/10 hover:text-amber-500",
                        )}
                        onClick={() => void handleFavorite(m)}
                        disabled={favoritingId === m.id}
                      >
                        {favoritingId === m.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : (
                          <Star className={cn("h-3.5 w-3.5", favSourceMealIds.has(m.id) && "fill-amber-500")} aria-hidden />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${mealLabel(m.mealType)} logged at ${format(new Date(m.eatenAt), "HH:mm")}`}
                        className="h-7 w-7 text-muted-foreground/50 transition-all hover:bg-primary/10 hover:text-primary"
                        onClick={() => setEditing(m)}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${mealLabel(m.mealType)} logged at ${format(new Date(m.eatenAt), "HH:mm")}`}
                        className="h-7 w-7 text-muted-foreground/50 transition-all hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setPendingDelete(m)}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                    </div>

                    <CollapsibleContent>
                      <div className="mx-3 mb-3 mt-1 space-y-2.5 rounded-lg border bg-muted/30 p-3">
                        {/* Compliance violations (if any) */}
                        {m.compliance && m.compliance.violations.length > 0 && (
                          <ul className="space-y-1">
                            {m.compliance.violations.map((v, i) => (
                              <li key={i} className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-800 dark:text-amber-300">
                                ⚠ {v.condition} · {v.message} <span className="text-amber-700/70 dark:text-amber-400/70">({v.evidenceSource})</span>
                              </li>
                            ))}
                          </ul>
                        )}

                        {/* Per-food lines */}
                        <ul className="space-y-1">
                          {m.foods.map((f, i) => (
                            <li key={i} className="flex items-center justify-between gap-2 text-xs">
                              <span className="min-w-0 truncate">
                                <span className="font-medium">{f.name}</span>
                                <span className="text-muted-foreground"> · {f.quantity} {f.unit}</span>
                                {f.preparation && <span className="capitalize text-muted-foreground"> · {f.preparation}</span>}
                                {f.quantitySource === "estimated" && (
                                  <Badge variant="outline" className="ml-1.5 px-1 py-0 text-[9px] uppercase tracking-wide text-muted-foreground">
                                    est. qty
                                  </Badge>
                                )}
                              </span>
                              <span className="shrink-0 tabular-nums text-muted-foreground">
                                {formatKcal(f.nutrition.calories)} · P {formatGrams(f.nutrition.protein)}
                              </span>
                            </li>
                          ))}
                        </ul>

                        {/* One-tap re-log — server recomputes everything from the Food table */}
                        <div className="flex justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1.5 text-[11px]"
                            onClick={() => setPendingRelog(m)}
                          >
                            <Repeat className="h-3 w-3 text-primary" aria-hidden />
                            Log this again
                          </Button>
                        </div>

                        {/* Full nutrient panel */}
                        <div>
                          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Full nutrient panel — meal totals
                          </p>
                          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4">
                            {NUTRIENT_ROWS.map((row) => {
                              const v = m.totals[row.key] ?? 0;
                              return (
                                <div
                                  key={row.key}
                                  className={`rounded-md border px-2 py-1.5 ${
                                    row.tone === "watch" && v > 0
                                      ? "border-amber-500/30 bg-amber-500/5"
                                      : "border-border/60 bg-background/60"
                                  }`}
                                  title={row.tone === "watch" ? "Keep an eye on this nutrient for your conditions" : undefined}
                                >
                                  <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{row.label}</p>
                                  <p className={`text-xs font-semibold tabular-nums ${row.tone === "watch" && v > 0 ? "text-amber-700 dark:text-amber-400" : ""}`}>
                                    {formatValue(v, row.decimals)}
                                    <span className="ml-0.5 font-normal text-muted-foreground">{row.unit}</span>
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {/* Edit dialog */}
      <EditMealDialog
        meal={editing}
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        onSaved={() => {
          setEditing(null);
          bumpData();
        }}
      />

      {/* Re-log confirmation */}
      <AlertDialog open={pendingRelog !== null} onOpenChange={(open) => !open && setPendingRelog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Log this meal again?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRelog && (
                <>
                  Adds a new entry with the same items — {pendingRelog.foods.map((f) => f.name).join(", ")} (
                  {formatKcal(pendingRelog.totals.calories)}). All values are recalculated fresh from the food database.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={relogging}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleRelog();
              }}
              disabled={relogging}
            >
              {relogging ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Logging…
                </>
              ) : (
                "Log it again"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this meal?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete && (
                <>
                  {mealLabel(pendingDelete.mealType)} logged at {format(new Date(pendingDelete.eatenAt), "d MMM, HH:mm")} —{" "}
                  {pendingDelete.foods.map((f) => f.name).join(", ")} ({formatKcal(pendingDelete.totals.calories)}). This
                  cannot be undone and today&apos;s totals will be recalculated.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Deleting…
                </>
              ) : (
                "Delete meal"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
