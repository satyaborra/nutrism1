"use client";

/**
 * Meals timeline — the heart of the Meals page:
 *  • Range tabs (Today / This Week / This Month / Custom) with date navigation
 *  • Single-day vertical timeline (slot icon, time, photo thumbnail, verified
 *    badge, macro dots, kcal, kebab actions, expandable nutrient breakdown)
 *  • This Week: 7-day accordion from the activity-calendar aggregation
 *  • This Month: intensity calendar grid — click a day to load its timeline
 *  • Bottom action row: Add Meal / Scan Food / Quick Add
 * All data comes from the deterministic daily-summary + activity-calendar APIs.
 */
import { useMemo, useState } from "react";
import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import {
  BadgeCheck,
  CalendarDays,
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Coffee,
  MoonStar,
  MoreVertical,
  Plus,
  Repeat,
  ScanLine,
  Sun,
  Sunrise,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { api } from "@/lib/client/api";
import { mealImageFor } from "@/lib/client/meal-images";
import type {
  ActivityCalendarResponse,
  ActivityDay,
  DailySummaryResponse,
  MealDetail,
} from "@/lib/client/types";
import { useNutriStore, mealLabel } from "../store";

export type MealsRange = "today" | "week" | "month" | "custom";

const RANGES: { id: MealsRange; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "This Week" },
  { id: "month", label: "This Month" },
  { id: "custom", label: "Custom" },
];

const SLOT_STYLE: Record<string, { icon: React.ComponentType<{ className?: string }>; chip: string }> = {
  breakfast: { icon: Sunrise, chip: "bg-amber-100 text-amber-500 dark:bg-amber-500/15 dark:text-amber-400" },
  lunch: { icon: Sun, chip: "bg-orange-100 text-orange-500 dark:bg-orange-500/15 dark:text-orange-400" },
  snack: { icon: Coffee, chip: "bg-rose-100 text-rose-500 dark:bg-rose-500/15 dark:text-rose-400" },
  dinner: { icon: MoonStar, chip: "bg-violet-100 text-violet-500 dark:bg-violet-500/15 dark:text-violet-400" },
};

function slotStyle(t: string) {
  return SLOT_STYLE[t] ?? { icon: UtensilsCrossed, chip: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400" };
}

function timeOf(iso: string): string {
  try {
    return format(new Date(iso), "hh:mm a");
  } catch {
    return "";
  }
}

function foodNames(meal: MealDetail): string {
  const names = meal.foods.map((f) => f.name);
  return names.length > 0 ? names.join(" + ") : "Mixed meal";
}

function MacroDot({ label, grams, color }: { label: string; grams: number; color: string }) {
  return (
    <span className="flex items-center gap-1 whitespace-nowrap text-[11.5px] font-medium text-muted-foreground">
      <span aria-hidden className={cn("h-2 w-2 rounded-full", color)} />
      {label} {grams.toFixed(1)} g
    </span>
  );
}

function mealBadge(meal: MealDetail) {
  // daily-summary rows carry no per-meal compliance — derive "Verified" from
  // database-matched foods (every line resolved to a Food row = verified totals).
  const state = meal.compliance?.state;
  const dbMatched = meal.foods.length > 0 && meal.foods.every((f) => f.foodId);
  if (state === "COMPLIANT" || (state === undefined && dbMatched)) {
    return (
      <Badge className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400">
        <BadgeCheck className="h-3 w-3" aria-hidden /> Verified
      </Badge>
    );
  }
  if (state === "POTENTIALLY_NON_COMPLIANT") {
    return (
      <Badge className="border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400">
        Needs review
      </Badge>
    );
  }
  if (state === "INDETERMINATE") {
    return (
      <Badge className="border-border bg-muted text-muted-foreground hover:bg-muted">AI estimate</Badge>
    );
  }
  return null;
}

/* ---------------- single-day timeline ---------------- */

function MealRow({ meal }: { meal: MealDetail }) {
  const bumpData = useNutriStore((s) => s.bumpData);
  const requestLogger = useNutriStore((s) => s.requestLogger);
  const setView = useNutriStore((s) => s.setView);
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const { icon: SlotIcon, chip } = slotStyle(meal.mealType);
  const totals = meal.totals;
  const kcal = Math.round(totals.calories ?? 0);

  async function logAgain() {
    setBusy(true);
    try {
      await api.relogMeal(meal.id);
      bumpData();
      toast({ title: "Meal logged again", description: foodNames(meal) });
    } catch {
      toast({ title: "Could not log again", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.deleteMeal(meal.id);
      bumpData();
      toast({ title: "Meal deleted" });
    } catch {
      toast({ title: "Could not delete meal", variant: "destructive" });
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  return (
    <li className="relative flex gap-3 sm:gap-4">
      {/* icon + time column */}
      <div className="flex w-12 shrink-0 flex-col items-center sm:w-14">
        <span
          className={cn(
            "z-10 flex h-9 w-9 items-center justify-center rounded-full shadow-sm ring-4 ring-card sm:h-10 sm:w-10",
            chip,
          )}
          aria-hidden
        >
          <SlotIcon className="h-4.5 w-4.5" />
        </span>
        <span className="mt-1 text-[10.5px] font-semibold leading-tight text-muted-foreground">
          {timeOf(meal.eatenAt)}
        </span>
      </div>

      {/* meal card */}
      <div className="min-w-0 flex-1 pb-4">
        <div
          className={cn(
            "group/row depth-hover rounded-2xl border border-border/60 bg-card p-3 shadow-sm shadow-black/[0.02] transition-all duration-200 hover:border-primary/25 hover:shadow-md hover:shadow-primary/5",
          )}
        >
          <div className="flex items-center gap-3">
            <img
              src={mealImageFor(foodNames(meal), meal.mealType)}
              alt=""
              className="h-12 w-12 shrink-0 rounded-xl object-cover ring-1 ring-border/60 sm:h-14 sm:w-14"
              loading="lazy"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="text-sm font-bold tracking-tight">{mealLabel(meal.mealType)}</p>
                {mealBadge(meal)}
                {meal.source === "photo" && (
                  <Badge className="gap-1 border-border bg-muted text-muted-foreground hover:bg-muted">
                    <Camera className="h-3 w-3" aria-hidden /> From Scan
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{foodNames(meal)}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                <MacroDot label="P" grams={totals.protein ?? 0} color="bg-emerald-500" />
                <MacroDot label="C" grams={totals.carbohydrates ?? 0} color="bg-sky-500" />
                <MacroDot label="F" grams={totals.fat ?? 0} color="bg-orange-400" />
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5 self-stretch">
              <div className="flex items-center gap-0.5">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      aria-label={`Actions for ${mealLabel(meal.mealType)}`}
                      disabled={busy}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem className="cursor-pointer" onClick={() => setOpen((v) => !v)}>
                      <ChevronDown className="mr-2 h-4 w-4" aria-hidden /> {open ? "Hide details" : "View details"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onClick={() => {
                        requestLogger({ tab: "text", text: foodNames(meal) });
                        setView("log");
                      }}
                    >
                      <Repeat className="mr-2 h-4 w-4" aria-hidden /> Log again
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="cursor-pointer text-rose-600 focus:text-rose-600 dark:text-rose-400" onClick={() => setConfirmDelete(true)}>
                      <Trash2 className="mr-2 h-4 w-4" aria-hidden /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="mt-auto flex items-center gap-1">
                <p className="whitespace-nowrap text-sm font-extrabold tabular-nums sm:text-[15px]">
                  {kcal.toLocaleString("en-US")}{" "}
                  <span className="text-[11px] font-semibold text-muted-foreground">kcal</span>
                </p>
                <button
                  type="button"
                  onClick={() => setOpen((v) => !v)}
                  aria-expanded={open}
                  aria-label={open ? "Hide meal details" : "Show meal details"}
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <ChevronRight className={cn("h-4 w-4 transition-transform duration-200", open && "rotate-90")} />
                </button>
              </div>
            </div>
          </div>

          {/* expanded breakdown */}
          {open && (
            <div className="mt-3 space-y-3 rounded-xl border border-border/50 bg-muted/40 p-3 animate-in fade-in slide-in-from-top-1 duration-200">
              <ul className="space-y-1.5">
                {meal.foods.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="min-w-0 truncate font-medium">
                      {f.name}
                      <span className="ml-1.5 text-muted-foreground">
                        ({f.quantity} {f.unit})
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {Math.round(f.nutrition.calories ?? 0)} kcal
                    </span>
                  </li>
                ))}
              </ul>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-border/60 pt-2.5 text-[11.5px] sm:grid-cols-4">
                {[
                  ["Fiber", totals.fiber, "g"],
                  ["Sugar", totals.sugar, "g"],
                  ["Sodium", totals.sodium, "mg"],
                  ["Sat. fat", totals.saturatedFat, "g"],
                ].map(([label, val, unit]) => (
                  <p key={label as string} className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">{label as string}</span>
                    <span className="font-semibold tabular-nums">
                      {(val as number | undefined)?.toFixed(1) ?? "—"} {unit as string}
                    </span>
                  </p>
                ))}
              </div>
              {meal.userNotes && (
                <p className="border-t border-border/60 pt-2.5 text-xs italic text-muted-foreground">
                  “{meal.userNotes}”
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this meal?</AlertDialogTitle>
            <AlertDialogDescription>
              {foodNames(meal)} — {kcal.toLocaleString("en-US")} kcal. This removes the meal and its
              nutrients from your history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                remove();
              }}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              Delete meal
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

function DayTimeline({ meals, empty }: { meals: MealDetail[]; empty: React.ReactNode }) {
  const sorted = [...meals].sort(
    (a, b) => new Date(a.eatenAt).getTime() - new Date(b.eatenAt).getTime(),
  );
  if (sorted.length === 0) return <>{empty}</>;
  return (
    <ol className="relative ml-1 space-y-0">
      {/* vertical connector */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-2 left-[1.05rem] w-px bg-gradient-to-b border-l border-dashed border-border sm:left-[1.3rem]"
      />
      {sorted.map((m) => (
        <MealRow key={m.id} meal={m} />
      ))}
    </ol>
  );
}

/* ---------------- week accordion ---------------- */

function WeekAccordion({ calendar, viewDate, onSelectDay }: { calendar: ActivityCalendarResponse | null; viewDate: string; onSelectDay: (d: string) => void }) {
  const [openDay, setOpenDay] = useState<string | null>(viewDate);
  const days = useMemo(() => {
    const anchor = parseISO(viewDate);
    const start = startOfWeek(anchor, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => format(addDays(start, i), "yyyy-MM-dd"));
  }, [viewDate]);
  const byDate = useMemo(() => {
    const map = new Map<string, ActivityDay>();
    for (const d of calendar?.days ?? []) map.set(d.date, d);
    return map;
  }, [calendar]);
  const today = format(new Date(), "yyyy-MM-dd");

  return (
    <div className="space-y-2">
      {days.map((date) => {
        const day = byDate.get(date);
        const kcal = day?.calories ?? 0;
        const count = day?.meals ?? 0;
        const isOpen = openDay === date;
        const isToday = date === today;
        const future = isAfter(parseISO(date), new Date()) && !isToday;
        return (
          <div
            key={date}
            className={cn(
              "overflow-hidden rounded-xl border transition-colors",
              isOpen ? "border-primary/30 bg-primary/[0.04]" : "border-border/60 bg-card",
              isToday && !isOpen && "border-primary/25",
            )}
          >
            <button
              type="button"
              onClick={() => setOpenDay(isOpen ? null : date)}
              aria-expanded={isOpen}
              className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  {format(parseISO(date), "EEEE")}
                  {isToday && (
                    <Badge className="border-primary/30 bg-primary/10 text-primary hover:bg-primary/10">Today</Badge>
                  )}
                </p>
                <p className="text-[11px] text-muted-foreground">{format(parseISO(date), "d MMM yyyy")}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-bold tabular-nums">{kcal.toLocaleString("en-US")} kcal</p>
                <p className="text-[11px] text-muted-foreground">
                  {count} {count === 1 ? "meal" : "meals"}
                </p>
              </div>
              <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200", isOpen && "rotate-180")} />
            </button>
            {isOpen && (
              <div className="border-t border-border/60 px-3.5 py-3">
                {day && day.items.length > 0 ? (
                  <ul className="space-y-2">
                    {day.items.map((item) => {
                      const { icon: SlotIcon, chip } = slotStyle(item.mealType);
                      return (
                        <li key={item.id} className="flex items-center gap-2.5">
                          <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full", chip)} aria-hidden>
                            <SlotIcon className="h-3.5 w-3.5" />
                          </span>
                          <span className="min-w-0 flex-1 truncate text-xs font-medium">{item.foods}</span>
                          <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                            {Math.round(item.kcal)} kcal
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ) : future ? (
                  <p className="text-xs text-muted-foreground">This day hasn&apos;t happened yet.</p>
                ) : (
                  <p className="text-xs text-muted-foreground">No meals logged this day.</p>
                )}
                {!future && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 h-8 w-full border-primary/30 text-primary hover:bg-primary/10 hover:text-primary sm:w-auto"
                    onClick={() => onSelectDay(date)}
                  >
                    <CalendarDays className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Open day timeline
                  </Button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- month grid ---------------- */

function MonthGrid({
  calendar,
  viewDate,
  onSelectDay,
  selected,
}: {
  calendar: ActivityCalendarResponse | null;
  viewDate: string;
  onSelectDay: (d: string) => void;
  selected: string;
}) {
  const byDate = useMemo(() => {
    const map = new Map<string, ActivityDay>();
    for (const d of calendar?.days ?? []) map.set(d.date, d);
    return map;
  }, [calendar]);
  const target = calendar?.calorieTarget ?? 0;
  const anchor = parseISO(viewDate);
  const mStart = startOfMonth(anchor);
  const mEnd = endOfMonth(anchor);
  const gridStart = startOfWeek(mStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(mEnd, { weekStartsOn: 1 });
  const cells: string[] = [];
  for (let d = gridStart; !isAfter(d, gridEnd); d = addDays(d, 1)) cells.push(format(d, "yyyy-MM-dd"));
  const today = format(new Date(), "yyyy-MM-dd");

  function intensity(day?: ActivityDay): string {
    if (!day || day.meals === 0 || target <= 0) return "bg-muted/60 text-muted-foreground";
    const pct = day.calories / target;
    if (pct < 0.5) return "bg-emerald-200/70 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-100";
    if (pct < 0.85) return "bg-emerald-300/80 text-emerald-950 dark:bg-emerald-500/35 dark:text-emerald-50";
    if (pct <= 1.15) return "bg-emerald-500/80 text-white dark:bg-emerald-500/55 dark:text-white";
    return "bg-amber-400/80 text-amber-950 dark:bg-amber-500/40 dark:text-amber-50";
  }

  return (
    <div>
      <div className="mb-1.5 grid grid-cols-7 gap-1.5 text-center">
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((w) => (
          <p key={w} className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
            {w}
          </p>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5" role="grid" aria-label="Month of meals">
        {cells.map((date) => {
          const d = parseISO(date);
          const inMonth = isSameMonth(d, mStart);
          const day = byDate.get(date);
          const isToday = date === today;
          const isSelected = date === selected;
          const future = isAfter(d, new Date()) && !isToday;
          return (
            <button
              key={date}
              type="button"
              role="gridcell"
              aria-label={`${format(d, "d MMMM yyyy")}${day ? `, ${Math.round(day.calories)} kcal from ${day.meals} meals` : ", no meals"}`}
              aria-selected={isSelected}
              disabled={future}
              onClick={() => onSelectDay(date)}
              className={cn(
                "relative flex h-11 flex-col items-center justify-center rounded-xl text-[11.5px] font-semibold transition-all duration-150 focus-visible:outline-2 focus-visible:outline-ring",
                intensity(day),
                inMonth ? "opacity-100" : "opacity-35",
                !future && "hover:scale-[1.06] hover:shadow-sm",
                future && "cursor-not-allowed opacity-25",
                isToday && "ring-2 ring-primary/60",
                isSelected && "ring-2 ring-primary shadow-sm",
              )}
            >
              {format(d, "d")}
              {day && day.meals > 0 && (
                <span aria-hidden className="absolute bottom-1 h-0.5 w-3.5 rounded-full bg-current opacity-60" />
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        Tap a day to open its timeline · green = on target · amber = over
      </p>
    </div>
  );
}

/* ---------------- main component ---------------- */

export function MealsTimeline({
  range,
  onRangeChange,
  viewDate,
  onViewDateChange,
  summary,
  calendar,
  loading,
}: {
  range: MealsRange;
  onRangeChange: (r: MealsRange) => void;
  viewDate: string;
  onViewDateChange: (d: string) => void;
  summary: DailySummaryResponse | null;
  calendar: ActivityCalendarResponse | null;
  loading: boolean;
}) {
  const setView = useNutriStore((s) => s.setView);
  const requestLogger = useNutriStore((s) => s.requestLogger);
  const requestBackfill = useNutriStore((s) => s.requestBackfill);
  const today = format(new Date(), "yyyy-MM-dd");

  function shift(days: number) {
    onViewDateChange(format(addDays(parseISO(viewDate), days), "yyyy-MM-dd"));
  }

  const navDisabled = range === "month";
  const nextDisabled =
    range === "today" || range === "custom"
      ? isAfter(parseISO(viewDate), parseISO(today)) || isSameDay(parseISO(viewDate), parseISO(today))
      : range === "week"
        ? isAfter(endOfWeek(parseISO(viewDate), { weekStartsOn: 1 }), parseISO(today))
        : false;

  const label =
    range === "week"
      ? `${format(startOfWeek(parseISO(viewDate), { weekStartsOn: 1 }), "d MMM")} – ${format(endOfWeek(parseISO(viewDate), { weekStartsOn: 1 }), "d MMM yyyy")}`
      : range === "month"
        ? format(parseISO(viewDate), "MMMM yyyy")
        : format(parseISO(viewDate), "EEE, d MMM yyyy");

  const emptyState = (
    <div className="ml-14 rounded-2xl border border-dashed border-primary/30 bg-primary/[0.03] px-5 py-8 text-center sm:ml-16">
      <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden>
        <UtensilsCrossed className="h-5 w-5" />
      </span>
      <p className="mt-3 text-sm font-semibold">No meals logged for this day</p>
      <p className="mt-1 text-xs text-muted-foreground">Every meal counts — add one to keep your streak alive.</p>
      <Button
        size="sm"
        className="mt-4 h-9 rounded-xl"
        onClick={() => {
          requestBackfill(viewDate);
          setView("log");
        }}
      >
        <Plus className="mr-1.5 h-4 w-4" aria-hidden /> Log a meal for this day
      </Button>
    </div>
  );

  return (
    <section aria-label="Meal timeline" className="rounded-3xl border border-border/60 bg-card p-4 shadow-sm shadow-black/[0.03] sm:p-5">
      {/* toolbar: range tabs + date nav */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="tablist" aria-label="Meal range" className="flex w-full gap-1 overflow-x-auto rounded-xl bg-muted p-1 sm:w-auto">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              role="tab"
              aria-selected={range === r.id}
              onClick={() => {
                onRangeChange(r.id);
                if (r.id === "today") onViewDateChange(today);
              }}
              className={cn(
                "flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150 focus-visible:outline-2 focus-visible:outline-ring sm:flex-none sm:px-3.5 sm:text-[13px]",
                range === r.id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-background hover:text-foreground",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* date navigation */}
        {range === "custom" ? (
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <Input
              type="date"
              value={viewDate}
              max={today}
              min={format(addDays(new Date(), -30), "yyyy-MM-dd")}
              onChange={(e) => e.target.value && onViewDateChange(e.target.value)}
              aria-label="Pick a date"
              className="h-9 w-auto rounded-xl bg-background text-[13px] font-semibold"
            />
          </div>
        ) : (
          <div className="flex items-center justify-between gap-1.5 lg:justify-end">
            <CalendarDays className="hidden h-4 w-4 text-primary sm:block" aria-hidden />
            <span className="min-w-[9.5rem] text-center text-[13px] font-bold tracking-tight lg:text-left" aria-live="polite">
              {label}
            </span>
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="Previous day"
                disabled={navDisabled}
                onClick={() => shift(range === "week" ? -7 : range === "month" ? -1 : -1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="Next day"
                disabled={nextDisabled}
                onClick={() => shift(1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* body */}
      <div className="mt-4">
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <Skeleton className="h-20 flex-1 rounded-2xl" />
              </div>
            ))}
          </div>
        ) : range === "week" ? (
          <WeekAccordion
            calendar={calendar}
            viewDate={viewDate}
            onSelectDay={(d) => {
              onViewDateChange(d);
              onRangeChange("today");
            }}
          />
        ) : range === "month" ? (
          <MonthGrid
            calendar={calendar}
            viewDate={viewDate}
            selected={viewDate}
            onSelectDay={(d) => onViewDateChange(d)}
          />
        ) : (
          <DayTimeline meals={summary?.meals ?? []} empty={emptyState} />
        )}

        {/* month mode: timeline under the grid for the selected day */}
        {range === "month" && !loading && (
          <div className="mt-5 border-t border-border/60 pt-4">
            <p className="mb-3 text-sm font-bold">{format(parseISO(viewDate), "EEEE, d MMMM")}</p>
            <DayTimeline meals={summary?.meals ?? []} empty={emptyState} />
          </div>
        )}
      </div>

      {/* action row */}
      <div className="mt-5 grid grid-cols-3 gap-2.5 border-t border-border/60 pt-4 sm:gap-3">
        <Button
          variant="outline"
          className="h-11 rounded-xl border-primary/35 text-primary transition-all hover:bg-primary/10 hover:text-primary active:scale-[0.98]"
          onClick={() => setView("log")}
        >
          <Plus className="mr-1.5 h-4 w-4" aria-hidden /> Add Meal
        </Button>
        <Button
          variant="outline"
          className="h-11 rounded-xl active:scale-[0.98]"
          onClick={() => {
            requestLogger({ tab: "photo", openFile: true });
            setView("log");
          }}
        >
          <ScanLine className="mr-1.5 h-4 w-4" aria-hidden /> Scan Food
        </Button>
        <Button
          variant="outline"
          className="h-11 rounded-xl active:scale-[0.98]"
          onClick={() => setView("log")}
        >
          <UtensilsCrossed className="mr-1.5 h-4 w-4" aria-hidden /> Quick Add
        </Button>
      </div>
    </section>
  );
}
