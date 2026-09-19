"use client";

/**
 * Settings view — appearance, language & voice, plan & safety summary,
 * data & privacy and account actions.
 *
 * Premium rebuild: gradient ViewHero, segmented Light/Dark/System theme control
 * (next-themes, hydration-safe), optimistic language switching with server
 * refresh + revert-on-error, read-only clinical plan summary with mono chips,
 * blob CSV exports and the same logout flow as before.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Download,
  HeartPulse,
  Info,
  Languages,
  Loader2,
  LogOut,
  Mic,
  Monitor,
  Moon,
  Palette,
  RefreshCcw,
  ShieldCheck,
  Sun,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ApiError, api } from "@/lib/client/api";
import type { LangCode } from "@/lib/client/types";
import { useNutriStore } from "../store";
import { FadeIn } from "../fade-in";
import { ViewHero } from "./view-hero";

/** App UI languages — native script first, exactly the five profile codes. */
const LANGUAGES: { code: LangCode; native: string; label: string; voiceLocale: string }[] = [
  { code: "en", native: "English", label: "English", voiceLocale: "en-IN" },
  { code: "ta", native: "தமிழ்", label: "Tamil", voiceLocale: "ta-IN" },
  { code: "te", native: "తెలుగు", label: "Telugu", voiceLocale: "te-IN" },
  { code: "hi", native: "हिन्दी", label: "Hindi", voiceLocale: "hi-IN" },
  { code: "kn", native: "ಕನ್ನಡ", label: "Kannada", voiceLocale: "kn-IN" },
];

/** Segmented appearance options (theme choice, not resolved value). */
const THEME_OPTIONS = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
] as const;

function CardIcon({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span aria-hidden className={cn("flex h-7 w-7 items-center justify-center rounded-lg", className)}>
      {children}
    </span>
  );
}

export function SettingsView() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { toast } = useToast();

  const user = useNutriStore((s) => s.user);
  const profileBrief = useNutriStore((s) => s.profileBrief);
  const setSession = useNutriStore((s) => s.setSession);
  const clearSession = useNutriStore((s) => s.clearSession);
  const setView = useNutriStore((s) => s.setView);
  const bumpData = useNutriStore((s) => s.bumpData);

  // Hydration-safe theme control: identical placeholder on server + first paint.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // ---------- Language (optimistic, revert on failure) ----------
  const [savingLang, setSavingLang] = useState(false);
  const currentLang: LangCode = profileBrief?.language ?? "en";

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

  // ---------- Plan summary fallback (only if the store brief never arrives) ----------
  const [briefFailed, setBriefFailed] = useState(false);
  const [briefEmpty, setBriefEmpty] = useState(false);
  const briefTried = useRef(false);

  const fetchBrief = useCallback(async () => {
    try {
      const me = await api.me();
      setSession(me.user, me.profile);
      if (!me.profile) setBriefEmpty(true);
      else setBriefFailed(false);
    } catch {
      setBriefFailed(true);
    }
  }, [setSession]);

  useEffect(() => {
    if (profileBrief || briefTried.current) return;
    briefTried.current = true;
    void fetchBrief();
  }, [profileBrief, fetchBrief]);

  function retryBrief() {
    setBriefFailed(false);
    setBriefEmpty(false);
    void fetchBrief();
  }

  // ---------- CSV export ----------
  const [exporting, setExporting] = useState<number | null>(null);

  async function exportCsv(days: number) {
    setExporting(days);
    try {
      const { url, filename } = await api.exportCsv(days);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Export ready", description: `${filename} has been downloaded.` });
    } catch (err) {
      toast({
        title: "Could not export your meals",
        description: err instanceof ApiError ? err.message : "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setExporting(null);
    }
  }

  // ---------- Account ----------
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await api.logout();
    } finally {
      clearSession();
      setView("home");
    }
  }

  return (
    <div className="space-y-5">
      <FadeIn>
        <ViewHero
          title="Settings"
          subtitle="Tune the app around you — appearance, language and voice, data and privacy."
          script="Tuned To You"
          image="/images/dish-dosa.png"
        />
      </FadeIn>

      <div className="grid gap-5 md:grid-cols-2">
        {/* Appearance */}
        <FadeIn delay={0.05}>
          <Card className="h-full rounded-3xl border-primary/15 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <CardIcon className="bg-primary/15 text-primary">
                  <Palette className="h-4 w-4" />
                </CardIcon>
                Appearance
              </CardTitle>
              <CardDescription>Comfortable in both day and night kitchens.</CardDescription>
            </CardHeader>
            <CardContent>
              {!mounted ? (
                <div className="grid grid-cols-3 gap-2" aria-busy="true" aria-label="Loading theme options">
                  {THEME_OPTIONS.map((o) => (
                    <div
                      key={o.value}
                      className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-muted/50 text-sm text-muted-foreground/60"
                    >
                      <span aria-hidden className="h-4 w-4 rounded-full bg-muted-foreground/20" />
                      {o.label}
                    </div>
                  ))}
                </div>
              ) : (
                <div role="group" aria-label="Colour theme" className="grid grid-cols-3 gap-2">
                  {THEME_OPTIONS.map(({ value, label, Icon }) => {
                    const active = theme === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setTheme(value)}
                        aria-pressed={active}
                        title={value === "system" ? `Follows your device — currently ${resolvedTheme ?? "…"}` : undefined}
                        className={cn(
                          "flex h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          active
                            ? "bg-primary/10 text-primary ring-1 ring-primary/30"
                            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                        )}
                      >
                        <Icon className="h-4 w-4" aria-hidden /> {label}
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                System follows your device setting{mounted && resolvedTheme ? ` — currently ${resolvedTheme}` : ""}.
              </p>
            </CardContent>
          </Card>
        </FadeIn>

        {/* Language & voice */}
        <FadeIn delay={0.1}>
          <Card className="h-full rounded-3xl border-primary/15 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <CardIcon className="bg-teal-500/15 text-teal-600 dark:text-teal-400">
                  <Languages className="h-4 w-4" />
                </CardIcon>
                Language &amp; voice
              </CardTitle>
              <CardDescription>Used for AI perception, replies and voice input.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select
                value={currentLang}
                onValueChange={(v) => void changeLanguage(v as LangCode)}
                disabled={savingLang}
              >
                <SelectTrigger
                  aria-label="App language"
                  className="h-11 w-full rounded-xl sm:w-64"
                >
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

              <div
                role="group"
                aria-label="Language shortcuts"
                className="flex flex-wrap gap-2"
              >
                {LANGUAGES.map((l) => {
                  const active = currentLang === l.code;
                  return (
                    <button
                      key={l.code}
                      type="button"
                      onClick={() => void changeLanguage(l.code)}
                      disabled={savingLang}
                      aria-pressed={active}
                      className={cn(
                        "min-h-11 rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
                        active
                          ? "border-primary/30 bg-primary/10 text-primary ring-1 ring-primary/30"
                          : "border-muted-foreground/25 bg-card/60 text-muted-foreground hover:border-primary/30 hover:text-foreground",
                      )}
                    >
                      {l.native}
                    </button>
                  );
                })}
              </div>

              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Mic className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                Voice logging follows this language (
                {LANGUAGES.find((l) => l.code === currentLang)?.voiceLocale ?? "en-IN"}).
                {savingLang && (
                  <span className="inline-flex items-center gap-1 text-primary">
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Saving…
                  </span>
                )}
              </p>
            </CardContent>
          </Card>
        </FadeIn>
      </div>

      {/* Plan & safety summary */}
      <FadeIn delay={0.15}>
        <Card className="rounded-3xl border-primary/15 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <CardIcon className="bg-amber-500/15 text-amber-600 dark:text-amber-400">
                <HeartPulse className="h-4 w-4" />
              </CardIcon>
              Plan &amp; safety summary
            </CardTitle>
            <CardDescription>
              Hard limits enforced before anything is ranked — change them in your Health Profile.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {profileBrief ? (
              <div className="grid gap-x-6 gap-y-3 sm:grid-cols-[minmax(0,140px)_minmax(0,1fr)]">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground sm:pt-1.5">
                  Dietary preference
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge
                    variant="outline"
                    className="rounded-full border-primary/30 bg-primary/5 px-3 py-1.5 font-mono text-[11px] text-primary"
                  >
                    {profileBrief.dietaryPreference}
                  </Badge>
                </div>

                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground sm:pt-1.5">
                  Conditions
                </p>
                <div className="flex flex-wrap gap-2">
                  {profileBrief.healthConditions.length > 0 ? (
                    profileBrief.healthConditions.map((c) => (
                      <Badge
                        key={c}
                        variant="outline"
                        className="rounded-full border-rose-500/30 bg-rose-500/10 px-3 py-1.5 font-mono text-[11px] text-rose-600 dark:text-rose-400"
                      >
                        {c}
                      </Badge>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No conditions configured.</p>
                  )}
                </div>

                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground sm:pt-1.5">
                  Allergens
                </p>
                <div className="flex flex-wrap gap-2">
                  {profileBrief.allergies.length > 0 ? (
                    profileBrief.allergies.map((a) => (
                      <Badge
                        key={a}
                        variant="outline"
                        className="rounded-full border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-700 dark:text-amber-400"
                      >
                        {a}
                      </Badge>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No allergens configured.</p>
                  )}
                </div>
              </div>
            ) : briefFailed ? (
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">Plan summary could not be loaded</p>
                    <p className="text-xs text-muted-foreground">Check your connection — your saved plan is safe.</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={retryBrief}
                  className="h-11 gap-1.5 rounded-xl border-primary/30 bg-primary/5 px-4 hover:bg-primary/10"
                >
                  <RefreshCcw className="h-4 w-4" aria-hidden /> Retry
                </Button>
              </div>
            ) : briefEmpty ? (
              <p className="text-sm text-muted-foreground">
                No plan configured yet — set your preferences in the Health Profile.
              </p>
            ) : (
              <div className="space-y-3" aria-busy="true" aria-label="Loading plan summary">
                <Skeleton className="h-8 w-52 rounded-full" />
                <Skeleton className="h-8 w-64 rounded-full" />
                <Skeleton className="h-8 w-44 rounded-full" />
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-primary/10 pt-4">
              <p className="min-w-0 text-xs text-muted-foreground">
                Allergens are filtered out before ranking — never surfaced, even as alternatives.
              </p>
              <Button
                variant="outline"
                onClick={() => setView("profile")}
                className="h-11 gap-1.5 rounded-xl border-primary/30 bg-primary/5 px-4 hover:bg-primary/10"
              >
                <UserRound className="h-4 w-4" aria-hidden /> Edit in Health Profile
              </Button>
            </div>
          </CardContent>
        </Card>
      </FadeIn>

      <div className="grid gap-5 md:grid-cols-2">
        {/* Data & privacy */}
        <FadeIn delay={0.2}>
          <Card className="h-full rounded-3xl border-primary/15 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <CardIcon className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck className="h-4 w-4" />
                </CardIcon>
                Data &amp; privacy
              </CardTitle>
              <CardDescription>Your meals, your numbers — take them anywhere.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => void exportCsv(7)}
                  disabled={exporting !== null}
                  className="h-11 gap-1.5 rounded-xl border-primary/30 bg-primary/5 px-4 hover:bg-primary/10"
                >
                  {exporting === 7 ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Download className="h-4 w-4" aria-hidden />
                  )}
                  Export 7-day CSV
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void exportCsv(30)}
                  disabled={exporting !== null}
                  className="h-11 gap-1.5 rounded-xl border-primary/30 bg-primary/5 px-4 hover:bg-primary/10"
                >
                  {exporting === 30 ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Download className="h-4 w-4" aria-hidden />
                  )}
                  Export 30-day CSV
                </Button>
              </div>
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                Nutrition values come from the verified IFCT/USDA-backed food database as computed by the server — never
                client-side estimates. Exports download straight to your device.
              </p>
            </CardContent>
          </Card>
        </FadeIn>

        {/* Account */}
        <FadeIn delay={0.25}>
          <Card className="h-full rounded-3xl border-primary/15 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <CardIcon className="bg-rose-500/15 text-rose-600 dark:text-rose-400">
                  <UserRound className="h-4 w-4" />
                </CardIcon>
                Account
              </CardTitle>
              <CardDescription>
                Signed in as{" "}
                <span className="font-medium text-foreground">
                  {user?.name ? `${user.name} · ${user.email}` : (user?.email ?? "…")}
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                variant="destructive"
                onClick={() => void handleLogout()}
                disabled={loggingOut}
                className="h-11 gap-1.5 rounded-xl px-4"
              >
                {loggingOut ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <LogOut className="h-4 w-4" aria-hidden />
                )}
                Log out
              </Button>
              <p className="text-xs text-muted-foreground">
                Logging out clears your session on this device. Your logged meals stay safe on the server.
              </p>
            </CardContent>
          </Card>
        </FadeIn>
      </div>

      {/* About */}
      <FadeIn delay={0.3}>
        <Card className="rounded-3xl border-muted-foreground/15 bg-muted/30 shadow-sm">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="flex min-w-0 items-center gap-3">
              <span
                aria-hidden
                className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white p-0.5 shadow-sm ring-1 ring-emerald-900/10 dark:ring-white/15"
              >
                <img src="/images/nutrislm-logo-mark.png" alt="" className="h-full w-full object-contain" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground">NutriSLM</p>
                <p className="font-script text-base font-semibold text-primary">
                  Eat Smarter · Live Healthier · Together
                </p>
              </div>
            </div>
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              Nutrition intelligence, not medical advice. For clinical decisions always consult your care team.
            </p>
          </CardContent>
        </Card>
      </FadeIn>
    </div>
  );
}
