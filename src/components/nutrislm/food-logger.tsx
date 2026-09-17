"use client";

/**
 * Food logging wizard — the core product flow:
 *   1. INPUT   — describe food in any language, or attach a photo.
 *   2. REVIEW  — AI perception results; user fixes matches/quantities, then the
 *                server computes nutrition (confirm-food) for preview.
 *   3. LOGGED  — meal persisted transactionally & idempotently (log-meal).
 * The client never computes nutrition — all numbers come from the API.
 */
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  Camera,
  CheckCircle2,
  ChevronLeft,
  Languages,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Type,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatGrams, formatKcal, formatMg, NUTRIENT_UNIT } from "@/lib/client/format";
import type {
  AnalyzeFoodResponse,
  Compliance,
  ConfirmFoodLine,
  ConfirmFoodResponse,
  FoodSearchItem,
  MatchStatus,
  NutritionValues,
  QuantitySource,
} from "@/lib/client/types";
import { api, ApiError, fileToDataUrl } from "@/lib/client/api";
import { MEAL_TYPES, languageLabel, mealLabel, useNutriStore } from "./store";
import { FavoritesBar } from "./favorites-bar";
import { ComplianceAlerts } from "./summary";

const EXAMPLES = [
  "2 idli and one cup sambar",
  "rendu dosa, oru cup chaya",
  "2 roti aur sabzi with dal",
  "grilled chicken salad with olive oil",
];

const COMMON_UNITS = ["piece", "pieces", "cup", "bowl", "glass", "katori", "tbsp", "tsp", "g", "ml", "serving"];

/** Default clock time per meal slot for backfilled days (local time). */
const SLOT_DEFAULT_TIME: Record<string, string> = {
  breakfast: "08:30",
  lunch: "12:30",
  snack: "16:30",
  dinner: "19:30",
};

function dayKeyOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayKey(): string {
  return dayKeyOf(new Date());
}

function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dayKeyOf(d);
}

function minBackfillKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return dayKeyOf(d);
}

function prettyDate(key: string): string {
  return new Date(`${key}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

interface EditableLine {
  lineId: string;
  originalName: string;
  displayName: string;
  foodId: string | null;
  matchStatus: MatchStatus;
  candidates?: { foodId: string; name: string }[];
  quantity: number;
  unit: string;
  preparation?: string | null;
  confidence: number;
  quantitySource: QuantitySource;
}

interface AnalysisMeta {
  draftId: string;
  inputType: "text" | "image" | "image_text";
  detectedLanguage: AnalyzeFoodResponse["detectedLanguage"] | null;
  aiOk: boolean;
  aiNote: string | null;
  aiLatencyMs: number | null;
}

interface LoggedSummary {
  mealType: string;
  duplicate: boolean;
  totals: NutritionValues;
  compliance: Compliance;
  backfillDate: string | null;
}

type Step = "input" | "review" | "logged";

export function FoodLogger({ onLogged }: { onLogged: () => void }) {
  const { toast } = useToast();
  const backfillRequest = useNutriStore((s) => s.backfillRequest);
  const clearBackfill = useNutriStore((s) => s.clearBackfill);

  const [step, setStep] = useState<Step>("input");
  const [tab, setTab] = useState("text");
  const [text, setText] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageHint, setImageHint] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [logDate, setLogDate] = useState<string>(todayKey());

  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [meta, setMeta] = useState<AnalysisMeta | null>(null);

  const [lines, setLines] = useState<EditableLine[]>([]);
  const [mealType, setMealType] = useState<string>("snack");
  const [confirmResult, setConfirmResult] = useState<ConfirmFoodResponse | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);
  const [loggedResult, setLoggedResult] = useState<LoggedSummary | null>(null);

  function resetAll() {
    setStep("input");
    setText("");
    setImageDataUrl(null);
    setImageHint("");
    setMeta(null);
    setLines([]);
    setConfirmResult(null);
    setConfirmError(null);
    setAnalyzeError(null);
    setLogDate(todayKey());
    clearBackfill();
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  /** The activity calendar can ask the logger to log for a past day. */
  useEffect(() => {
    if (!backfillRequest) return;
    setStep("input");
    setLogDate(backfillRequest.date);
    clearBackfill();
    toast({ title: `Logging for ${prettyDate(backfillRequest.date)}`, description: "The meal you log now lands in that day's history." });
  }, [backfillRequest, clearBackfill, toast]);

  async function handleAnalyze() {
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const payload: { text?: string; imageDataUrl?: string; hint?: string } = {};
      if (tab === "text" && text.trim()) payload.text = text.trim();
      if (tab === "photo" && imageDataUrl) {
        payload.imageDataUrl = imageDataUrl;
        if (imageHint.trim()) payload.hint = imageHint.trim();
      }
      const res = await api.analyzeFood(payload);
      setMeta({
        draftId: res.draftId,
        inputType: tab === "photo" ? "image" : "text",
        detectedLanguage: res.detectedLanguage,
        aiOk: res.aiOk,
        aiNote: res.aiNote,
        aiLatencyMs: res.aiLatencyMs,
      });
      setLines(
        res.foods.map((f) => ({
          lineId: f.lineId,
          originalName: f.originalName,
          displayName: f.displayName,
          foodId: f.foodId,
          matchStatus: f.matchStatus,
          candidates: f.candidates,
          quantity: f.quantity,
          unit: f.unit,
          preparation: f.preparation ?? null,
          confidence: f.confidence,
          quantitySource: f.quantitySource,
        }))
      );
      setMealType(res.mealTypeGuess || "snack");
      setConfirmResult(null);
      setStep("review");
      if (!res.aiOk) {
        toast({
          title: "Parsed offline",
          description: "The AI service was unavailable, so a fallback parser was used. Please double-check the items below.",
          variant: "destructive",
        });
      }
    } catch (e) {
      setAnalyzeError(e instanceof ApiError ? e.message : "Analysis failed. Please try again.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleFileChange(file: File | undefined | null) {
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      setImageDataUrl(dataUrl);
      setAnalyzeError(null);
    } catch {
      setAnalyzeError("Could not read that image. Try a JPEG, PNG or WebP under 6 MB.");
    }
  }

  function patchLine(lineId: string, patch: Partial<EditableLine>) {
    setLines((prev) => prev.map((l) => (l.lineId === lineId ? { ...l, ...patch } : l)));
    setConfirmResult(null);
    setConfirmError(null);
  }

  function removeLine(lineId: string) {
    setLines((prev) => prev.filter((l) => l.lineId !== lineId));
    setConfirmResult(null);
  }

  function addFoodFromSearch(item: FoodSearchItem) {
    setLines((prev) => [
      ...prev,
      {
        lineId: `line_manual_${crypto.randomUUID().slice(0, 8)}`,
        originalName: item.name,
        displayName: item.name,
        foodId: item.id,
        matchStatus: "matched",
        quantity: 1,
        unit: item.servingUnit,
        preparation: null,
        confidence: 1,
        quantitySource: "user",
      },
    ]);
    setConfirmResult(null);
  }

  function foodsPayload() {
    return lines.map((l) => ({
      lineId: l.lineId,
      foodId: l.foodId,
      name: l.displayName || l.originalName,
      quantity: Number(l.quantity) || 0,
      unit: l.unit,
      preparation: l.preparation,
    }));
  }

  async function handleConfirm() {
    setConfirming(true);
    setConfirmError(null);
    try {
      const res = await api.confirmFood({ draftId: meta?.draftId ?? "", mealType, foods: foodsPayload() });
      setConfirmResult(res);
    } catch (e) {
      setConfirmError(e instanceof ApiError ? e.message : "Could not calculate nutrition. Please try again.");
    } finally {
      setConfirming(false);
    }
  }

  async function handleLog() {
    setLogging(true);
    try {
      // Backfilled meals get a synthetic slot time on the chosen day; today
      // logs live at "now" exactly as before.
      const isBackfill = logDate !== todayKey();
      const res = await api.logMeal({
        requestId: crypto.randomUUID(),
        draftId: meta?.draftId,
        mealType,
        foods: foodsPayload(),
        // Image-based drafts are labeled "image" so the history shows how it was logged
        source: meta?.inputType === "image" ? "image" : meta?.inputType === "image_text" ? "image" : "text",
        ...(isBackfill ? { eatenAt: `${logDate}T${SLOT_DEFAULT_TIME[mealType] ?? "12:30"}:00` } : {}),
      });
      toast({
        title: res.duplicate ? "Meal already logged" : isBackfill ? `Logged for ${prettyDate(logDate)}` : "Meal logged",
        description: `${mealLabel(mealType)} · ${formatKcal(res.totals.calories)}${isBackfill ? " · added to that day's history" : ""}${res.compliance.state !== "COMPLIANT" ? " · check the alerts below" : ""}`,
      });
      onLogged();
      setLoggedResult({
        mealType,
        duplicate: res.duplicate,
        totals: res.totals,
        compliance: res.compliance,
        backfillDate: isBackfill ? logDate : null,
      });
      setStep("logged");
    } catch (e) {
      toast({
        title: "Could not log meal",
        description: e instanceof ApiError ? e.message : "Unexpected error. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLogging(false);
    }
  }

  // ---------------- render ----------------

  return (
    <Card id="log-food" className="scroll-mt-20 transition-shadow duration-300 hover:shadow-md hover:shadow-primary/5">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" aria-hidden />
              Log what you ate
            </CardTitle>
            <CardDescription>
              Type in any language — English, தமிழ், తెలుగు, हिन्दी, ಕನ್ನಡ, or romanized — or upload a food photo.
            </CardDescription>
          </div>
          {step !== "input" && (
            <Button variant="ghost" size="icon" aria-label="Start over" onClick={resetAll}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>

      {step === "input" && (
        <>
          <CardContent className="space-y-4">
            <FavoritesBar onLogged={onLogged} />

            {/* logging date — today by default, backfill for the last 30 days */}
            <div className="rounded-lg border bg-muted/30 p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <CalendarClock className="size-3.5" aria-hidden />
                  Logging for
                </span>
                <div role="group" aria-label="Logging date" className="flex overflow-hidden rounded-md border">
                  <button
                    type="button"
                    onClick={() => setLogDate(todayKey())}
                    aria-pressed={logDate === todayKey()}
                    className={cn(
                      "px-2.5 py-1 text-xs font-medium transition-colors active:scale-95",
                      logDate === todayKey() ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted",
                    )}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => setLogDate(yesterdayKey())}
                    aria-pressed={logDate === yesterdayKey()}
                    className={cn(
                      "px-2.5 py-1 text-xs font-medium transition-colors active:scale-95",
                      logDate === yesterdayKey() ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted",
                    )}
                  >
                    Yesterday
                  </button>
                </div>
                <Input
                  type="date"
                  value={logDate}
                  min={minBackfillKey()}
                  max={todayKey()}
                  onChange={(e) => e.target.value && setLogDate(e.target.value)}
                  aria-label="Pick a past date to log for (up to 30 days back)"
                  className="h-8 w-[9.5rem] bg-background text-xs"
                />
              </div>
              {logDate !== todayKey() && (
                <p className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] leading-snug text-amber-700 dark:text-amber-400">
                  <CalendarClock className="mt-0.5 size-3 shrink-0" aria-hidden />
                  <span>
                    Backfill mode — this meal lands on <strong>{prettyDate(logDate)}</strong>&apos;s history, not today&apos;s summary. Slot time defaults to{" "}
                    {SLOT_DEFAULT_TIME[mealType] ?? "12:30"}.
                  </span>
                </p>
              )}
            </div>

            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="text" className="gap-1.5">
                  <Type className="h-4 w-4" aria-hidden /> Describe
                </TabsTrigger>
                <TabsTrigger value="photo" className="gap-1.5">
                  <Camera className="h-4 w-4" aria-hidden /> Photo
                </TabsTrigger>
              </TabsList>

              <TabsContent value="text" className="mt-3 space-y-3">
                <Textarea
                  aria-label="Food description"
                  placeholder={'e.g. "2 idli and one cup sambar" · "rendu dosa, oru chaya" · "2 roti aur dal"'}
                  className="min-h-24 resize-y"
                  value={text}
                  maxLength={2000}
                  onChange={(e) => setText(e.target.value)}
                />
                <div className="flex flex-wrap gap-1.5">
                  {EXAMPLES.map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => setText(ex)}
                      className="rounded-full border bg-muted/50 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-foreground"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="photo" className="mt-3 space-y-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors hover:border-primary/50 hover:bg-primary/5",
                    imageDataUrl && "border-primary/50 bg-primary/5"
                  )}
                  aria-label="Choose a food photo"
                >
                  {imageDataUrl ? (

                    <img src={imageDataUrl} alt="Selected food preview" className="max-h-44 rounded-lg object-contain" />
                  ) : (
                    <>
                      <Camera className="h-8 w-8 text-muted-foreground" aria-hidden />
                      <span className="text-sm font-medium">Tap to add a photo of your meal</span>
                      <span className="text-xs text-muted-foreground">JPEG, PNG or WebP · up to 6 MB</span>
                    </>
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="sr-only"
                  aria-label="Food photo file input"
                  onChange={(e) => handleFileChange(e.target.files?.[0])}
                />
                {imageDataUrl && (
                  <div className="space-y-1.5">
                    <Label htmlFor="image-hint">Anything the photo can&apos;t show? (optional)</Label>
                    <Input
                      id="image-hint"
                      placeholder="e.g. it's a small bowl, oil was added…"
                      value={imageHint}
                      maxLength={300}
                      onChange={(e) => setImageHint(e.target.value)}
                    />
                  </div>
                )}
              </TabsContent>
            </Tabs>

            {analyzeError && (
              <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                {analyzeError}
              </p>
            )}
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-2">
            <Button
              onClick={handleAnalyze}
              disabled={analyzing || (tab === "text" ? !text.trim() : !imageDataUrl)}
              size="lg"
              className="shadow-sm shadow-primary/20 transition-all active:scale-[0.98]"
            >
              {analyzing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  {tab === "photo" ? "Looking at your photo…" : "Reading your food…"}
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" aria-hidden />
                  Analyze with AI
                </>
              )}
            </Button>
            <p className="text-center text-[11px] text-muted-foreground">
              The AI only identifies food and quantities — nutrition numbers always come from our verified database.
            </p>
          </CardFooter>
        </>
      )}

      {step === "review" && (
        <>
          <CardContent className="space-y-4">
            {/* meta badges */}
            <div className="flex flex-wrap items-center gap-2">
              {meta?.detectedLanguage && (
                <Badge variant="secondary" className="gap-1.5">
                  <Languages className="h-3.5 w-3.5" aria-hidden />
                  {languageLabel(meta.detectedLanguage.language)}
                </Badge>
              )}
              {meta?.aiOk && meta.aiLatencyMs != null && (
                <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground">
                  AI {(meta.aiLatencyMs / 1000).toFixed(1)}s
                </Badge>
              )}
              {meta && !meta.aiOk && (
                <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Offline parser used
                </Badge>
              )}
            </div>

            {/* meal type */}
            <div className="flex items-center gap-3">
              <Label htmlFor="meal-type" className="w-20 shrink-0 text-sm">
                Meal
              </Label>
              <Select value={mealType} onValueChange={setMealType}>
                <SelectTrigger id="meal-type" className="w-44" aria-label="Meal type">
                  <SelectValue placeholder="Select meal" />
                </SelectTrigger>
                <SelectContent>
                  {MEAL_TYPES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {mealLabel(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {logDate !== todayKey() && (
              <p className="flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-400">
                <CalendarClock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>
                  This meal will be logged for <strong>{prettyDate(logDate)}</strong> at {SLOT_DEFAULT_TIME[mealType] ?? "12:30"} (slot default).
                </span>
              </p>
            )}

            {/* lines */}
            <ul className="max-h-96 space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin]">
              {lines.map((l) => (
                <LineEditor key={l.lineId} line={l} onPatch={patchLine} onRemove={removeLine} />
              ))}
              {lines.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No food lines — add one below.</p>}
            </ul>

            <AddFoodRow onPick={addFoodFromSearch} />
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-3">
            <div className="flex gap-2">
              <Button variant="outline" onClick={resetAll} disabled={confirming || logging}>
                <ChevronLeft className="mr-1 h-4 w-4" aria-hidden /> Back
              </Button>
              <Button onClick={handleConfirm} disabled={confirming || logging || lines.length === 0} className="flex-1">
                {confirming ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Calculating nutrition…
                  </>
                ) : confirmResult && !isDirtyAgainst(lines, confirmResult) ? (
                  "Recalculate nutrition"
                ) : (
                  "Calculate nutrition"
                )}
              </Button>
            </div>

            {confirmError && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                {confirmError}
              </p>
            )}

            {confirmResult && (
              <ConfirmPreview
                result={confirmResult}
                stale={isDirtyAgainst(lines, confirmResult)}
                onLog={handleLog}
                logging={logging}
              />
            )}
          </CardFooter>
        </>
      )}

      {step === "logged" && loggedResult && (
        <CardContent className="space-y-4">
          <div className="flex flex-col items-center gap-3 rounded-xl border border-emerald-600/30 bg-emerald-600/10 p-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-600" aria-hidden />
            <div>
              <p className="font-semibold">
                {mealLabel(loggedResult.mealType)} logged{loggedResult.duplicate ? " (already existed)" : ""}
              </p>
              {loggedResult.backfillDate && (
                <p className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                  <CalendarClock className="size-3" aria-hidden />
                  for {prettyDate(loggedResult.backfillDate)}
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                {formatKcal(loggedResult.totals.calories)} · protein {formatGrams(loggedResult.totals.protein)} · carbs{" "}
                {formatGrams(loggedResult.totals.carbohydrates)} · fat {formatGrams(loggedResult.totals.fat)}
              </p>
            </div>
          </div>
          <ComplianceAlerts compliance={loggedResult.compliance} conditions={[]} />
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={resetAll}>
              <Plus className="mr-1 h-4 w-4" aria-hidden /> Log another meal
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

/** True when lines were edited after the confirm response was produced. */
function isDirtyAgainst(lines: EditableLine[], res: ConfirmFoodResponse): boolean {
  if (res.foods.length !== lines.length) return true;
  return lines.some((l, i) => {
    const r = res.foods[i];
    return (
      r.lineId !== l.lineId ||
      r.quantity !== Number(l.quantity) ||
      r.unit !== l.unit ||
      (r.foodId ?? null) !== l.foodId
    );
  });
}

const MATCH_UI: Record<MatchStatus, { label: string; cls: string }> = {
  matched: { label: "Matched", cls: "border-emerald-600/40 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400" },
  ambiguous: { label: "Ambiguous", cls: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  unmatched: { label: "Not matched", cls: "border-destructive/40 bg-destructive/10 text-destructive" },
};

const QTY_SOURCE_LABEL: Record<QuantitySource, string> = {
  user: "You said",
  estimated: "AI estimated",
  unknown: "Quantity unclear",
};

function LineEditor({
  line,
  onPatch,
  onRemove,
}: {
  line: EditableLine;
  onPatch: (lineId: string, patch: Partial<EditableLine>) => void;
  onRemove: (lineId: string) => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const match = MATCH_UI[line.matchStatus];
  const needsFix = line.matchStatus !== "matched" && !line.foodId;

  return (
    <li className={cn("rounded-xl border p-3", needsFix && "border-amber-500/40")}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{line.displayName || line.originalName}</p>
          {line.originalName !== line.displayName && (
            <p className="truncate text-xs text-muted-foreground">“{line.originalName}”</p>
          )}
        </div>
        <Badge variant="outline" className={cn("text-[10px]", match.cls)}>
          {match.label}
        </Badge>
        {line.confidence < 1 && (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            {Math.round(line.confidence * 100)}%
          </Badge>
        )}
        <Badge variant="secondary" className="text-[10px]">
          {QTY_SOURCE_LABEL[line.quantitySource]}
        </Badge>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" aria-label={`Remove ${line.displayName}`} onClick={() => onRemove(line.lineId)}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {line.matchStatus === "ambiguous" && line.candidates && line.candidates.length > 0 && !line.foodId && (
        <div className="mt-2 space-y-1.5">
          <p className="text-xs text-muted-foreground">Which one did you mean?</p>
          <div className="flex flex-wrap gap-1.5">
            {line.candidates.map((c) => (
              <button
                key={c.foodId}
                type="button"
                onClick={() => onPatch(line.lineId, { foodId: c.foodId, displayName: c.name, matchStatus: "matched" })}
                className="rounded-full border border-amber-500/50 bg-background px-3 py-1 text-xs font-medium transition-colors hover:bg-amber-500/15"
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {needsFix && (
        <div className="mt-2">
          {searchOpen ? (
            <FoodSearchInline
              onPick={(item) => {
                onPatch(line.lineId, { foodId: item.id, displayName: item.name, unit: item.servingUnit, matchStatus: "matched" });
                setSearchOpen(false);
              }}
              onCancel={() => setSearchOpen(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-amber-500/60 px-3 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-500/10 dark:text-amber-400"
            >
              <Search className="h-3 w-3" aria-hidden /> Find in food database
            </button>
          )}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Input
            type="number"
            inputMode="decimal"
            min={0.1}
            max={100}
            step={0.5}
            aria-label={`Quantity of ${line.displayName}`}
            className="h-8 w-20"
            value={line.quantity}
            onChange={(e) => {
              const v = Number(e.target.value);
              onPatch(line.lineId, { quantity: Number.isFinite(v) ? v : 0 });
            }}
          />
          <Input
            list="common-units"
            aria-label={`Unit for ${line.displayName}`}
            className="h-8 w-24"
            value={line.unit}
            onChange={(e) => onPatch(line.lineId, { unit: e.target.value })}
          />
        </div>
        {line.preparation && (
          <Badge variant="secondary" className="text-[10px] capitalize">
            {line.preparation}
          </Badge>
        )}
      </div>
    </li>
  );
}

function FoodSearchInline({ onPick, onCancel }: { onPick: (f: FoodSearchItem) => void; onCancel: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FoodSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);

  // Debounced search against /api/foods/search
  async function run(query: string) {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/foods/search?q=${encodeURIComponent(query.trim())}`, { cache: "no-store" });
      if (res.ok) {
        const body = (await res.json()) as { foods: FoodSearchItem[] };
        setResults(body.foods.slice(0, 8));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border bg-background p-2">
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <Input
          autoFocus
          aria-label="Search food database"
          placeholder="Search foods… (English or native names)"
          className="h-8 border-none shadow-none focus-visible:ring-0"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setTouched(true);
            void run(e.target.value);
          }}
          onKeyDown={(e) => e.key === "Escape" && onCancel()}
        />
        {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />}
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label="Close search" onClick={onCancel}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      {q.trim().length >= 2 && results.length > 0 && (
        <ul className="mt-1 max-h-44 space-y-0.5 overflow-y-auto">
          {results.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => onPick(f)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{f.name}</span>
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">{f.category}</span>
                {f.isVeg && (
                  <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border border-emerald-600" title="Vegetarian">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {touched && q.trim().length >= 2 && !loading && results.length === 0 && (
        <p className="px-2 py-1.5 text-xs text-muted-foreground">No matches — you can keep it unmatched (it will log with 0 nutrition).</p>
      )}
    </div>
  );
}

function AddFoodRow({ onPick }: { onPick: (f: FoodSearchItem) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      {open ? (
        <FoodSearchInline
          onPick={(f) => {
            onPick(f);
            setOpen(false);
          }}
          onCancel={() => setOpen(false)}
        />
      ) : (
        <Button variant="outline" size="sm" className="w-full border-dashed" onClick={() => setOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden /> Add a food manually
        </Button>
      )}
      <datalist id="common-units">
        {COMMON_UNITS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
    </div>
  );
}

function ConfirmPreview({
  result,
  stale,
  onLog,
  logging,
}: {
  result: ConfirmFoodResponse;
  stale: boolean;
  onLog: () => void;
  logging: boolean;
}) {
  const t = result.totals;
  const chips: { key: keyof NutritionValues; label: string }[] = [
    { key: "calories", label: "Energy" },
    { key: "protein", label: "Protein" },
    { key: "carbohydrates", label: "Carbs" },
    { key: "fat", label: "Fat" },
    { key: "fiber", label: "Fiber" },
    { key: "sodium", label: "Sodium" },
  ];
  return (
    <div className={cn("space-y-3 rounded-xl border p-3", stale && "opacity-60")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          Nutrition {stale && <span className="font-normal text-muted-foreground">(edited — recalculate)</span>}
        </p>
        <Badge variant={result.incomplete ? "outline" : "secondary"} className="text-[10px]">
          {result.incomplete ? "Some items unmatched (0 nutrition)" : "All items verified"}
        </Badge>
      </div>
      <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {chips.map(({ key, label }) => (
          <li key={key} className="rounded-lg bg-muted/60 px-2.5 py-1.5">
            <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
            <span className="text-sm font-semibold tabular-nums">
              {NUTRIENT_UNIT[key] === "kcal"
                ? formatKcal(t[key])
                : NUTRIENT_UNIT[key] === "mg"
                  ? formatMg(t[key])
                  : formatGrams(t[key])}
            </span>
          </li>
        ))}
      </ul>
      {result.foods.some((f) => f.source) && (
        <p className="text-[11px] text-muted-foreground">
          Source: {result.foods.find((f) => f.source)?.source ?? "food database"} · per {result.foods.find((f) => f.perReference)?.perReference ?? "reference"}
        </p>
      )}
      {result.note && <p className="text-xs text-muted-foreground">{result.note}</p>}
      <ComplianceAlerts compliance={result.compliance} conditions={[]} />
      <Button onClick={onLog} disabled={logging || stale} className="w-full shadow-sm shadow-primary/20 transition-all active:scale-[0.98]" size="lg">
        {logging ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Saving…
          </>
        ) : (
          <>
            <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden /> Log this meal
          </>
        )}
      </Button>
    </div>
  );
}
