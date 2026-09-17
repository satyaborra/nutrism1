"use client";

/**
 * Food Library — makes the verified food database visible and explorable.
 * The DB is the product's single source of nutrition truth; this section lets
 * users browse it: multilingual search, category filters, per-serving facts,
 * an honest per-100 g panel (exact for mass/volume references, flagged
 * estimated for household units), aliases, tags, allergens and sources.
 * All numbers come from the server — nothing is computed or invented here.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Egg, Flame, Leaf, Loader2, Search, Sparkles, Wheat } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { api } from "@/lib/client/api";
import { FOOD_LANGUAGE_LABELS } from "@/lib/client/types";
import type { FoodDetailResponse, FoodLibraryItem, FoodLibraryResponse } from "@/lib/client/types";

/** Category presentation: emoji + human label (data values stay canonical). */
const CATEGORY_META: Record<string, { emoji: string; label: string }> = {
  grain: { emoji: "🌾", label: "Grains" },
  legume: { emoji: "🫘", label: "Legumes" },
  vegetable: { emoji: "🥦", label: "Vegetables" },
  fruit: { emoji: "🍎", label: "Fruits" },
  dairy: { emoji: "🥛", label: "Dairy" },
  meat: { emoji: "🍖", label: "Meat" },
  egg: { emoji: "🍳", label: "Egg" },
  fat: { emoji: "🫒", label: "Fats & oils" },
  sweet: { emoji: "🍯", label: "Sweets" },
  beverage: { emoji: "☕", label: "Beverages" },
  dish: { emoji: "🍛", label: "Dishes" },
  condiment: { emoji: "🧂", label: "Condiments" },
};

const DETAIL_ROWS: { label: string; key: keyof FoodDetailResponse["food"]["nutrients"]; unit: string; tone?: "watch" }[] = [
  { label: "Calories", key: "calories", unit: "kcal" },
  { label: "Protein", key: "protein", unit: "g" },
  { label: "Carbs", key: "carbohydrates", unit: "g" },
  { label: "Fat", key: "fat", unit: "g" },
  { label: "Sat. fat", key: "saturatedFat", unit: "g", tone: "watch" },
  { label: "Fiber", key: "fiber", unit: "g" },
  { label: "Sugar", key: "sugar", unit: "g", tone: "watch" },
  { label: "Sodium", key: "sodium", unit: "mg", tone: "watch" },
  { label: "Potassium", key: "potassium", unit: "mg" },
  { label: "Phosphorus", key: "phosphorus", unit: "mg" },
  { label: "Cholesterol", key: "cholesterol", unit: "mg", tone: "watch" },
];

function VegMark({ isVeg, containsEgg }: { isVeg: boolean; containsEgg?: boolean }) {
  if (isVeg) {
    return (
      <span
        title="Vegetarian"
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border border-emerald-600/70 dark:border-emerald-400/70"
        aria-label="Vegetarian"
      >
        <span className="h-2 w-2 rounded-full bg-emerald-600 dark:bg-emerald-400" />
      </span>
    );
  }
  return (
    <span
      title={containsEgg ? "Contains egg" : "Non-vegetarian"}
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border border-rose-600/70 dark:border-rose-400/70"
      aria-label={containsEgg ? "Contains egg" : "Non-vegetarian"}
    >
      <span className={cn("h-2 w-2 rounded-full bg-rose-600 dark:bg-rose-400", containsEgg && "rounded-none bg-amber-500 dark:bg-amber-400")} />
    </span>
  );
}

/** Macro share bar — visualization of server-supplied numbers (4/4/9 kcal per g). */
function MacroBar({ protein, carbs, fat }: { protein: number; carbs: number; fat: number }) {
  const kcalP = protein * 4;
  const kcalC = carbs * 4;
  const kcalF = fat * 9;
  const total = kcalP + kcalC + kcalF;
  if (total <= 0) return null;
  const p = Math.round((kcalP / total) * 100);
  const c = Math.round((kcalC / total) * 100);
  const f = Math.max(0, 100 - p - c);
  return (
    <div aria-label={`Macro split: protein ${p}%, carbs ${c}%, fat ${f}%`}>
      <div className="flex h-2 overflow-hidden rounded-full">
        <div className="bg-emerald-500" style={{ width: `${p}%` }} />
        <div className="bg-amber-400" style={{ width: `${c}%` }} />
        <div className="bg-rose-400" style={{ width: `${f}%` }} />
      </div>
      <div className="mt-1 flex gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> protein {p}%</span>
        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> carbs {c}%</span>
        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-rose-400" /> fat {f}%</span>
      </div>
    </div>
  );
}

/** Loads and renders one food's detail. Remounted per foodId (key prop) so state resets naturally. */
function FoodDetailBody({ foodId }: { foodId: string }) {
  const [detail, setDetail] = useState<FoodDetailResponse["food"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [per100, setPer100] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .foodDetail(foodId)
      .then((res) => alive && setDetail(res.food))
      .catch(() => alive && setError("Could not load this food's details."));
    return () => {
      alive = false;
    };
  }, [foodId]);

  const rows = detail ? DETAIL_ROWS.map((r) => ({ ...r, value: (per100 ? detail.per100g : detail.nutrients)[r.key] })) : [];
  // "1 piece" already embeds the amount; "g" needs servingSize prepended → "100 g".
  const servingLabel = /^\d/.test(detail?.servingUnit.trim() ?? "")
    ? detail!.servingUnit
    : `${detail?.servingSize ?? ""} ${detail?.servingUnit ?? ""}`;

  return (
    <>
      {error && (
        <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      {!detail && !error && (
        <div className="space-y-3 py-2">
          <DialogTitle className="sr-only">Food details</DialogTitle>
          <DialogDescription className="sr-only">Loading verified nutrition facts</DialogDescription>
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
          <p className="sr-only">Loading food details…</p>
        </div>
      )}
      {detail && (
        <>
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2 pr-6">
              <VegMark isVeg={detail.isVeg} containsEgg={detail.containsEgg} />
              <span>{detail.name}</span>
              <Badge variant="outline" className="text-[10px] capitalize text-muted-foreground">
                {CATEGORY_META[detail.category]?.emoji ?? "🍽️"} {CATEGORY_META[detail.category]?.label ?? detail.category}
              </Badge>
            </DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>
                Reference serving: <strong className="text-foreground">{servingLabel}</strong>
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide">
                <BookOpen className="h-3 w-3" aria-hidden /> {detail.source}
              </span>
              {detail.sourceReference && <span className="text-[11px] text-muted-foreground">{detail.sourceReference}</span>}
            </DialogDescription>
          </DialogHeader>

          {/* Per-serving / per-100g switch */}
          <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
            <p className="text-xs text-muted-foreground">
              {per100 ? "Values per 100 g" : `Values per ${servingLabel}`}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px]"
              onClick={() => setPer100((v) => !v)}
              aria-pressed={per100}
            >
              <Flame className="mr-1 h-3 w-3 text-primary" aria-hidden />
              Show per 100 g
            </Button>
          </div>
          {per100 && (
            <p
              className={cn(
                "-mt-2 rounded-md border px-2.5 py-1.5 text-[11px]",
                detail.per100g.estimated
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                  : "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
              )}
            >
              {detail.per100g.estimated ? "≈ Estimated — " : "✓ Exact — "}
              {detail.per100g.basisNote}
            </p>
          )}

          {/* Nutrient grid */}
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
            {rows.map((r) => (
              <div
                key={r.key}
                className={cn(
                  "rounded-md border px-2 py-1.5",
                  r.tone === "watch" && r.value > 0 ? "border-amber-500/30 bg-amber-500/5" : "border-border/60 bg-background/60",
                )}
              >
                <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{r.label}</p>
                <p className={cn("text-xs font-semibold tabular-nums", r.tone === "watch" && r.value > 0 && "text-amber-700 dark:text-amber-400")}>
                  {r.value}
                  <span className="ml-0.5 font-normal text-muted-foreground">{r.unit}</span>
                </p>
              </div>
            ))}
          </div>

          {/* Macro split */}
          <div className="rounded-lg border bg-background/60 p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Macro energy split</p>
            <MacroBar
              protein={per100 ? detail.per100g.protein : detail.nutrients.protein}
              carbs={per100 ? detail.per100g.carbohydrates : detail.nutrients.carbohydrates}
              fat={per100 ? detail.per100g.fat : detail.nutrients.fat}
            />
          </div>

          {/* Aliases */}
          {detail.aliases.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Sparkles className="h-3 w-3" aria-hidden /> Also known as
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {detail.aliases.map((a) => (
                  <li
                    key={`${a.language}-${a.alias}`}
                    className="rounded-full bg-muted/70 px-2.5 py-0.5 text-xs"
                    title={FOOD_LANGUAGE_LABELS[a.language] ?? a.language}
                  >
                    {a.alias}
                    <span className="ml-1 text-[9px] uppercase tracking-wide text-muted-foreground">{a.language}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Tags + allergens */}
          <div className="flex flex-wrap items-center gap-1.5">
            {detail.tags.map((t) => (
              <Badge key={t} variant="secondary" className="text-[10px] lowercase">
                {t.replace(/_/g, " ")}
              </Badge>
            ))}
            {detail.allergens.map((a) => (
              <Badge key={a} variant="outline" className="border-destructive/40 bg-destructive/5 text-[10px] lowercase text-destructive">
                ⚠ {a}
              </Badge>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function FoodDetailDialog({ foodId, open, onOpenChange }: { foodId: string | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg [scrollbar-width:thin]">
        {/* Keyed by foodId: each food gets fresh state — no manual resets. */}
        {open && foodId && <FoodDetailBody key={foodId} foodId={foodId} />}
      </DialogContent>
    </Dialog>
  );
}

export function FoodLibrary() {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [category, setCategory] = useState<string>("");
  const [vegOnly, setVegOnly] = useState(false);
  const [data, setData] = useState<FoodLibraryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageRef = useRef(1);

  // Debounce the search box (300 ms) — keeps keystrokes cheap.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQ(q.trim());
      pageRef.current = 1;
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q]);

  const fetchPage = useCallback(
    (targetPage: number, append: boolean) => {
      api
        .browseFoods({ q: debouncedQ || undefined, category: category || undefined, veg: vegOnly || undefined, page: targetPage, pageSize: 24 })
        .then((res) => {
          setData((prev) =>
            append && prev ? { ...res, foods: [...prev.foods, ...res.foods] } : res,
          );
          setError(null);
        })
        .catch(() => setError("Could not load the food library."))
        .finally(() => {
          setLoading(false);
          setLoadingMore(false);
        });
    },
    [debouncedQ, category, vegOnly],
  );

  // Filter changes (incl. first mount) trigger a fresh page-1 fetch.
  // Scheduled on the next tick so state updates happen outside the effect body.
  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      fetchPage(1, false);
    }, 0);
    return () => clearTimeout(t);
  }, [fetchPage]);

  const categories = useMemo(() => {
    if (data?.foods) {
      const present = new Set(data.foods.map((f) => f.category));
      return Object.keys(CATEGORY_META).filter((c) => present.has(c));
    }
    return Object.keys(CATEGORY_META);
  }, [data]);

  function openDetail(id: string) {
    setSelected(id);
    setDetailOpen(true);
  }

  return (
    <Card className="transition-shadow duration-300 hover:shadow-md hover:shadow-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" aria-hidden />
          Food library
        </CardTitle>
        <CardDescription>
          Browse the verified database behind every number in this app — per-serving facts, multilingual names and sources.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search + filters */}
        <div className="flex flex-col gap-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search any language — idli, दाल, పెరుగు, dosai…"
              aria-label="Search the food library"
              className="pl-9"
            />
            {q && (
              <button
                onClick={() => setQ("")}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full px-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                ×
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => { setCategory(""); pageRef.current = 1; }}
              aria-pressed={category === ""}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs transition-colors",
                category === "" ? "border-primary bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted",
              )}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => { setCategory(category === c ? "" : c); pageRef.current = 1; }}
                aria-pressed={category === c}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition-colors",
                  category === c ? "border-primary bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {CATEGORY_META[c]?.emoji} {CATEGORY_META[c]?.label ?? c}
              </button>
            ))}
            <button
              onClick={() => { setVegOnly(!vegOnly); pageRef.current = 1; }}
              aria-pressed={vegOnly}
              className={cn(
                "ml-auto flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors",
                vegOnly ? "border-emerald-500 bg-emerald-500/10 font-medium text-emerald-700 dark:text-emerald-400" : "text-muted-foreground hover:bg-muted",
              )}
            >
              <Leaf className="h-3 w-3" aria-hidden /> Veg only
            </button>
          </div>
        </div>

        {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</p>}

        {loading && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
            <p className="sr-only">Loading foods…</p>
          </div>
        )}

        {!loading && data && data.foods.length === 0 && (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            No foods match that search — try another name or clear the filters.
          </p>
        )}

        {!loading && data && data.foods.length > 0 && (
          <>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {data.foods.map((f: FoodLibraryItem) => (
                <li key={f.id}>
                  <button
                    onClick={() => openDetail(f.id)}
                    className="group h-full w-full rounded-xl border bg-background/60 p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md hover:shadow-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`View details for ${f.name}`}
                  >
                    <span className="flex items-start justify-between gap-1.5">
                      <span className="min-w-0 truncate text-sm font-medium group-hover:text-primary">{f.name}</span>
                      <VegMark isVeg={f.isVeg} containsEgg={f.containsEgg} />
                    </span>
                    <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-muted-foreground">
                      {CATEGORY_META[f.category]?.emoji} {CATEGORY_META[f.category]?.label ?? f.category}
                    </span>
                    <span className="mt-2 flex items-baseline gap-1">
                      <span className="text-base font-semibold tabular-nums text-primary">{f.calories}</span>
                      <span className="text-[10px] text-muted-foreground">kcal / {f.servingUnit}</span>
                    </span>
                    <span className="mt-1 flex gap-2 text-[10px] text-muted-foreground tabular-nums">
                      <span>P {f.protein}g</span>
                      <span>C {f.carbs}g</span>
                      <span>F {f.fat}g</span>
                      {f.fiber >= 3 && (
                        <span className="ml-auto inline-flex items-center gap-0.5 rounded bg-emerald-500/10 px-1 text-emerald-700 dark:text-emerald-400">
                          <Wheat className="h-2.5 w-2.5" aria-hidden /> fiber
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Showing {data.foods.length} of {data.total} verified foods
              </span>
              {data.hasMore && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => {
                    setLoadingMore(true);
                    const next = pageRef.current + 1;
                    pageRef.current = next;
                    fetchPage(next, true);
                  }}
                  disabled={loadingMore}
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden /> Loading…
                    </>
                  ) : (
                    "Load more"
                  )}
                </Button>
              )}
            </div>
          </>
        )}

        {/* Egg-allergen footer note keeps the trust story visible */}
        <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Egg className="h-3 w-3" aria-hidden />
          Egg items show an amber mark. Values come straight from IFCT 2017 / USDA references — this library is the same source the AI logger verifies against.
        </p>
      </CardContent>

      <FoodDetailDialog foodId={selected} open={detailOpen} onOpenChange={setDetailOpen} />
    </Card>
  );
}
