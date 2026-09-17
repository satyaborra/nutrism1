"use client";

/**
 * Health Profile view — a friendly summary of the plan-driving profile (with
 * the computed targets) and the full editor (ProfileDialog, controlled) one
 * click away.
 */
import { useCallback, useEffect, useState } from "react";
import { Flame, Pencil, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/client/api";
import { formatGrams, formatKcal } from "@/lib/client/format";
import type { ProfileResponse } from "@/lib/client/types";
import { useNutriStore, languageLabel, MEAL_TYPE_ICON } from "../store";
import { ProfileDialog } from "../profile-dialog";
import { FadeIn } from "../fade-in";
import { PageHeader } from "./page-header";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-dashed py-2 last:border-none">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold capitalize">{value}</span>
    </div>
  );
}

export function ProfileView() {
  const profileBrief = useNutriStore((s) => s.profileBrief);
  const bumpData = useNutriStore((s) => s.bumpData);
  const [editorOpen, setEditorOpen] = useState(false);
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    let alive = true;
    api
      .getProfile()
      .then((res) => {
        if (alive) {
          setData(res);
          setError(null);
        }
      })
      .catch(() => {
        if (alive) setError("Could not load your profile.");
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (editorOpen) return; // the editor refreshes via onSaved
    return load();
  }, [editorOpen, load, bumpData]);

  const p = data?.profile;
  const t = data?.computedTargets;

  return (
    <div className="space-y-5">
      <FadeIn>
        <PageHeader
          icon={<UserRound className="h-5 w-5" />}
          title="Health Profile"
          subtitle="The inputs behind every target and constraint — AI never invents them."
          actions={
            <Button size="sm" className="gap-1.5 active:scale-[0.98]" onClick={() => setEditorOpen(true)}>
              <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit profile
            </Button>
          }
        />
      </FadeIn>

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {!data && !error && (
        <div className="grid gap-5 md:grid-cols-2" aria-hidden>
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      )}

      {data && (
        <div className="grid gap-5 md:grid-cols-2">
          <FadeIn delay={0.05}>
            <Card className="border-primary/15 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">About you</CardTitle>
                <CardDescription>Drives BMR → TDEE → macro targets.</CardDescription>
              </CardHeader>
              <CardContent>
                <Row label="Age" value={p?.age ?? "—"} />
                <Row label="Sex" value={p?.sex ?? "—"} />
                <Row label="Height" value={p?.heightCm ? `${p.heightCm} cm` : "—"} />
                <Row label="Weight" value={p?.weightKg ? `${p.weightKg} kg` : "—"} />
                <Row label="Activity" value={p?.activityLevel?.replace(/_/g, " ") ?? "—"} />
                <Row label="Goal" value={p?.goal?.replace(/_/g, " ") ?? "—"} />
              </CardContent>
            </Card>
          </FadeIn>

          <FadeIn delay={0.08}>
            <Card className="border-primary/15 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-1.5 text-base">
                  <Flame className="h-4 w-4 text-orange-500" aria-hidden /> Computed daily targets
                </CardTitle>
                <CardDescription>Deterministic — recomputed on every profile save.</CardDescription>
              </CardHeader>
              <CardContent>
                <Row label="Calories" value={t ? formatKcal(t.calories) : "—"} />
                <Row label="Protein" value={t ? formatGrams(t.protein) : "—"} />
                <Row label="Carbohydrates" value={t ? formatGrams(t.carbohydrates) : "—"} />
                <Row label="Fat" value={t ? formatGrams(t.fat) : "—"} />
                <Row label="Fiber" value={t ? formatGrams(t.fiber) : "—"} />
                <Row label="Sodium limit" value={t ? formatGrams(t.sodium) : "—"} />
              </CardContent>
            </Card>
          </FadeIn>

          <FadeIn delay={0.11}>
            <Card className="border-primary/15 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Diet &amp; safety</CardTitle>
                <CardDescription>Applied before ranking — hard filters, not suggestions.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Row label="Dietary preference" value={p?.dietaryPreference ?? "—"} />
                <Row label="Language" value={languageLabel(p?.language ?? profileBrief?.language)} />
                <div>
                  <p className="mb-1.5 text-xs text-muted-foreground">Health conditions</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(p?.healthConditions.length ?? 0) > 0 ? (
                      p!.healthConditions.map((c) => (
                        <Badge key={c} variant="outline" className="border-primary/30 bg-primary/5 font-mono text-[10px]">
                          {c}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">None configured</span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-xs text-muted-foreground">{MEAL_TYPE_ICON.snack} Hard-excluded allergens</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(p?.allergies.length ?? 0) > 0 ? (
                      p!.allergies.map((a) => (
                        <Badge key={a} variant="outline" className="border-amber-500/40 bg-amber-500/10 text-[11px]">
                          {a}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">None configured</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </FadeIn>

          <FadeIn delay={0.14}>
            <Card className="border-dashed shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">How your plan is computed</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs leading-relaxed text-muted-foreground">
                {data.targetNotes.map((n, i) => (
                  <p key={i} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                    {n}
                  </p>
                ))}
              </CardContent>
            </Card>
          </FadeIn>
        </div>
      )}

      <ProfileDialog onSaved={bumpData} open={editorOpen} onOpenChange={setEditorOpen} />
    </div>
  );
}
