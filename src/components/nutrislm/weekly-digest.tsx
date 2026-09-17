"use client";

/**
 * Weekly digest — a deterministic "report card" for the last 7 days.
 * All numbers come from /api/nutrition/weekly-digest (pure DB aggregation,
 * no AI). One TF-IDF-retrieved evidence citation is included, attributed to
 * its source document. Presented as a dialog opened from the trends card.
 */
import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  ArrowDownRight, ArrowUpRight, BadgeCheck, BookOpen, CalendarDays, Copy, Download, Droplets,
  Flame, Printer, Scale, Trophy, UtensilsCrossed,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/client/format";
import type { DigestGrade, DigestMetric, WeeklyDigestResponse } from "@/lib/client/types";
import { api } from "@/lib/client/api";

const GRADE_UI: Record<DigestGrade, { label: string; className: string; dot: string }> = {
  great: { label: "Great", className: "bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 border-emerald-600/30", dot: "bg-emerald-600" },
  good: { label: "Good", className: "bg-teal-600/15 text-teal-700 dark:text-teal-400 border-teal-600/30", dot: "bg-teal-600" },
  watch: { label: "Watch", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30", dot: "bg-amber-500" },
  off: { label: "Off track", className: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30", dot: "bg-rose-500" },
};

function MetricRow({ m }: { m: DigestMetric }) {
  const ui = GRADE_UI[m.grade];
  return (
    <div className="rounded-xl border bg-background/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          <span className={cn("h-2 w-2 rounded-full", ui.dot)} aria-hidden />
          {m.label}
        </p>
        <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", ui.className)}>
          {ui.label}
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-lg font-bold tabular-nums">{m.avg !== null ? formatNumber(m.avg) : "—"}</span>
        <span className="text-xs text-muted-foreground">
          {m.unit} avg{m.target !== null ? <> · target {formatNumber(m.target)} {m.unit}</> : null}
        </span>
      </div>
      {m.score !== null && (
        <Progress value={m.score} className="mt-2 h-1.5" aria-label={`${m.label} score ${m.score} of 100`} />
      )}
    </div>
  );
}

/** Deterministic plain-text rendering of the digest (same numbers as the UI). */
function buildDigestText(d: WeeklyDigestResponse, overall: number): string {
  const lines: string[] = [];
  lines.push("NutriSLM — Weekly Digest");
  lines.push(`Week of ${format(parseISO(`${d.weekOf}T12:00:00`), "d MMM yyyy")}`);
  lines.push("=".repeat(32));
  lines.push("");
  lines.push(`Overall score: ${overall}/100`);
  lines.push(`Days logged: ${d.daysLogged} of 7 · adherence ${d.adherence}% (±10% calorie band)`);
  lines.push("");
  lines.push("Averages vs targets:");
  for (const m of d.metrics) {
    const avg = m.avg !== null ? `${formatNumber(m.avg)} ${m.unit}` : "no data";
    const tgt = m.target !== null ? ` (target ${formatNumber(m.target)} ${m.unit})` : "";
    lines.push(`  · ${m.label}: ${avg}${tgt} — ${GRADE_UI[m.grade].label}`);
  }
  lines.push("");
  if (d.bestDay) lines.push(`Closest to target: ${d.bestDay.date} · ${formatNumber(d.bestDay.calories)} kcal (${d.bestDay.deltaPct}% off)`);
  if (d.worstSodiumDay && d.worstSodiumDay.sodium > 0) lines.push(`Saltiest day: ${d.worstSodiumDay.date} · ${formatNumber(d.worstSodiumDay.sodium)} mg sodium`);
  lines.push(`Hydration: ${d.hydration.avgGlasses !== null ? `${d.hydration.avgGlasses} glasses/day avg` : "no water logged"} (goal ${d.hydration.goal})`);
  lines.push(`Most logged: ${d.topFoods.length > 0 ? d.topFoods.slice(0, 3).map((f) => `${f.name} ×${f.count}`).join(", ") : "nothing yet"}`);
  if (d.comparison.available) {
    const cal = d.comparison.caloriesDelta !== null ? `${d.comparison.caloriesDelta >= 0 ? "+" : ""}${formatNumber(d.comparison.caloriesDelta)} kcal/day` : "";
    const pro = d.comparison.proteinDelta !== null ? `${d.comparison.proteinDelta >= 0 ? "+" : ""}${d.comparison.proteinDelta} g/day protein` : "";
    lines.push(`vs previous week: ${[cal, pro, `${d.comparison.mealsDelta >= 0 ? "+" : ""}${d.comparison.mealsDelta} meals`].filter(Boolean).join(", ")}`);
  }
  if (d.evidence) {
    lines.push("");
    lines.push(`Evidence: "${d.evidence.text}"`);
    lines.push(`Source: ${d.evidence.source} · ${d.evidence.document}${d.evidence.section ? ` · ${d.evidence.section}` : ""}`);
  }
  lines.push("");
  lines.push("Deterministic report — every number reproducible from your logged meals. Not medical advice.");
  return lines.join("\n");
}

/** Open a clean printable view in a new window (kept self-contained, no app chrome). */
function printDigest(d: WeeklyDigestResponse, overall: number) {
  const text = buildDigestText(d, overall);
  const w = window.open("", "_blank", "width=720,height=860");
  if (!w) return false;
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>NutriSLM Weekly Digest</title>` +
    `<style>body{font-family:ui-sans-serif,system-ui,sans-serif;max-width:640px;margin:40px auto;color:#1a2b22;line-height:1.55;padding:0 24px}` +
    `pre{white-space:pre-wrap;font-family:inherit;font-size:14px}h1{font-size:20px;color:#059669}` +
    `footer{margin-top:28px;border-top:1px solid #d1d5db;padding-top:10px;font-size:11px;color:#6b7280}</style></head><body>` +
    `<h1>🥗 NutriSLM — Weekly Digest</h1><pre>${text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] ?? c)}</pre>` +
    `<footer>Generated ${new Date().toLocaleString()} · deterministic report from your logged meals · not medical advice</footer>` +
    `<script>window.onload=function(){window.print()}</script></body></html>`,
  );
  w.document.close();
  return true;
}

export function WeeklyDigestDialog() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<WeeklyDigestResponse | null>(null);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open || data) return;
    let alive = true;
    api
      .weeklyDigest()
      .then((res) => alive && setData(res))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [open, data]);

  function handleOpenChange(o: boolean) {
    setOpen(o);
    if (o) {
      setData(null);
      setError(false);
      setCopied(false);
    }
  }

  async function handleCopy() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(buildDigestText(data, overall));
      setCopied(true);
      toast({ title: "Digest copied", description: "A plain-text report is on your clipboard — paste it anywhere." });
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast({ title: "Could not copy", description: "Your browser blocked clipboard access.", variant: "destructive" });
    }
  }

  function handlePrint() {
    if (!data) return;
    const ok = printDigest(data, overall);
    if (!ok) toast({ title: "Pop-up blocked", description: "Allow pop-ups for this site to print the digest.", variant: "destructive" });
  }

  function handleDownload() {
    if (!data) return;
    try {
      const blob = new Blob([buildDigestText(data, overall)], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nutrislm-weekly-digest-${data.weekOf}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Digest downloaded", description: "Saved as a .txt file you can keep or share." });
    } catch {
      toast({ title: "Could not download", description: "Your browser blocked the file download.", variant: "destructive" });
    }
  }

  const overall = data
    ? Math.round(data.metrics.reduce((a, m) => a + (m.score ?? 0), 0) / Math.max(1, data.metrics.length))
    : 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground transition-colors hover:text-primary"
          aria-label="Open the weekly digest report"
          title="Weekly digest report"
        >
          <CalendarDays className="h-4 w-4" aria-hidden />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Scale className="h-4 w-4 text-primary" aria-hidden />
            Weekly digest
            {data && (
              <Badge variant="outline" className="ml-auto font-mono text-[10px] text-muted-foreground">
                week of {format(parseISO(`${data.weekOf}T12:00:00`), "d MMM")}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            A deterministic report card built from your logged data — no AI, every number reproducible.
          </DialogDescription>
        </DialogHeader>

        {!data && !error && (
          <div className="space-y-3 py-2" aria-busy="true">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-24 w-full" />
            <span className="sr-only">Loading weekly digest…</span>
          </div>
        )}
        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            Could not load the digest. Please try again.
          </p>
        )}

        {data && (
          <ScrollArea className="max-h-[60vh] pr-2">
            <div className="space-y-4">
              {/* Overall */}
              <div className="flex items-center gap-4 rounded-xl border border-primary/25 bg-gradient-to-r from-primary/10 to-transparent p-3">
                <div
                  className="relative flex h-14 w-14 items-center justify-center rounded-full bg-primary/10"
                  role="img"
                  aria-label={`Overall weekly score ${overall} out of 100`}
                >
                  <span className="text-lg font-bold tabular-nums text-primary">{overall}</span>
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-semibold">Overall weekly score</p>
                  <p className="text-xs text-muted-foreground">
                    {data.daysLogged === 0
                      ? "No meals logged this week yet."
                      : `${data.daysLogged} of 7 days logged · ${data.adherence}% of logged days inside the ±10% calorie band`}
                  </p>
                </div>
              </div>

              {/* Metrics */}
              <div className="grid gap-2 sm:grid-cols-2">
                {data.metrics.map((m) => (
                  <MetricRow key={m.key} m={m} />
                ))}
              </div>

              <Separator />

              {/* Highlights */}
              <div className="grid gap-2 text-xs sm:grid-cols-2">
                {data.bestDay && (
                  <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-2.5">
                    <Trophy className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
                    <p>
                      <span className="font-semibold">Closest to target:</span>{" "}
                      {format(parseISO(`${data.bestDay.date}T12:00:00`), "EEE d MMM")} · {formatNumber(data.bestDay.calories)} kcal
                      <span className="text-muted-foreground"> ({data.bestDay.deltaPct}% off)</span>
                    </p>
                  </div>
                )}
                {data.worstSodiumDay && data.worstSodiumDay.sodium > 0 && (
                  <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-2.5">
                    <Flame className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" aria-hidden />
                    <p>
                      <span className="font-semibold">Saltiest day:</span>{" "}
                      {format(parseISO(`${data.worstSodiumDay.date}T12:00:00`), "EEE d MMM")} · {formatNumber(data.worstSodiumDay.sodium)} mg sodium
                    </p>
                  </div>
                )}
                <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-2.5">
                  <Droplets className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-600" aria-hidden />
                  <p>
                    <span className="font-semibold">Hydration:</span>{" "}
                    {data.hydration.avgGlasses !== null ? `${data.hydration.avgGlasses} glasses/day avg` : "no water logged"}
                    <span className="text-muted-foreground"> (goal {data.hydration.goal})</span>
                  </p>
                </div>
                <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-2.5">
                  <UtensilsCrossed className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                  <p>
                    <span className="font-semibold">Most logged:</span>{" "}
                    {data.topFoods.length > 0
                      ? data.topFoods.slice(0, 3).map((f) => `${f.name} ×${f.count}`).join(", ")
                      : "nothing yet"}
                  </p>
                </div>
              </div>

              {/* Comparison with previous week */}
              <div className="rounded-lg border p-2.5 text-xs">
                <p className="mb-1.5 font-semibold">vs previous 7 days</p>
                {data.comparison.available ? (
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    <span className="inline-flex items-center gap-1">
                      Calories
                      {data.comparison.caloriesDelta !== null && (
                        <>
                          {data.comparison.caloriesDelta >= 0 ? (
                            <ArrowUpRight className="h-3.5 w-3.5 text-amber-600" aria-label="increase" />
                          ) : (
                            <ArrowDownRight className="h-3.5 w-3.5 text-emerald-600" aria-label="decrease" />
                          )}
                          <span className="font-semibold tabular-nums">
                            {data.comparison.caloriesDelta >= 0 ? "+" : ""}
                            {formatNumber(data.comparison.caloriesDelta)} kcal/day
                          </span>
                        </>
                      )}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      Protein
                      {data.comparison.proteinDelta !== null && (
                        <>
                          {data.comparison.proteinDelta >= 0 ? (
                            <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600" aria-label="increase" />
                          ) : (
                            <ArrowDownRight className="h-3.5 w-3.5 text-amber-600" aria-label="decrease" />
                          )}
                          <span className="font-semibold tabular-nums">
                            {data.comparison.proteinDelta >= 0 ? "+" : ""}
                            {data.comparison.proteinDelta} g/day
                          </span>
                        </>
                      )}
                    </span>
                    <span>
                      Meals <span className="font-semibold tabular-nums">{data.comparison.mealsDelta >= 0 ? "+" : ""}{data.comparison.mealsDelta}</span>
                    </span>
                  </div>
                ) : (
                  <p className="text-muted-foreground">No meals in the previous window — deltas appear once you have two weeks of data.</p>
                )}
              </div>

              {/* Evidence */}
              {data.evidence && (
                <div className="rounded-lg border border-primary/25 bg-primary/5 p-3">
                  <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                    <BookOpen className="h-3 w-3" aria-hidden />
                    Evidence behind this week&apos;s focus
                  </p>
                  <p className="text-xs leading-snug text-muted-foreground">{data.evidence.text}</p>
                  <p className="mt-1.5 text-[10px] text-muted-foreground">
                    {data.evidence.source} · {data.evidence.document}
                    {data.evidence.section ? ` · ${data.evidence.section}` : ""}
                  </p>
                </div>
              )}

              <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <BadgeCheck className="h-3 w-3 text-primary" aria-hidden />
                Digest regenerates from the database every time you open it.
              </p>
            </div>
          </ScrollArea>
        )}

        {data && (
          <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
            <p className="text-[10px] text-muted-foreground">Share or archive this report — numbers are reproducible.</p>
            <div className="flex shrink-0 items-center justify-end gap-1.5">
              <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => void handleCopy()}>
                <Copy className={cn("h-3.5 w-3.5", copied && "text-primary")} aria-hidden />
                {copied ? "Copied" : "Copy as text"}
              </Button>
              <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={handleDownload}>
                <Download className="h-3.5 w-3.5" aria-hidden />
                .txt
              </Button>
              <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={handlePrint}>
                <Printer className="h-3.5 w-3.5" aria-hidden />
                Print
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
