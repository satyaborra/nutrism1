"use client";

/**
 * Settings view — theme, language, condition constraints summary, allergen
 * hard-exclusions, data sources and account actions.
 */
import { useEffect, useState } from "react";
import { LogOut, Moon, Settings, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/client/api";
import { useNutriStore, languageLabel } from "../store";
import { FadeIn } from "../fade-in";
import { PageHeader } from "./page-header";

export function SettingsView() {
  const { resolvedTheme, setTheme } = useTheme();
  const user = useNutriStore((s) => s.user);
  const profileBrief = useNutriStore((s) => s.profileBrief);
  const clearSession = useNutriStore((s) => s.clearSession);
  const setView = useNutriStore((s) => s.setView);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  async function handleLogout() {
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
        <PageHeader
          icon={<Settings className="h-5 w-5" />}
          title="Settings"
          subtitle="Appearance, language and how NutriSLM protects your plan."
        />
      </FadeIn>

      <div className="grid gap-5 md:grid-cols-2">
        <FadeIn delay={0.05}>
          <Card className="border-primary/15 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Appearance</CardTitle>
              <CardDescription>Comfortable in both day and night kitchens.</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Button
                variant={mounted && resolvedTheme !== "dark" ? "default" : "outline"}
                size="sm"
                onClick={() => setTheme("light")}
                aria-pressed={mounted && resolvedTheme !== "dark"}
                className="gap-1.5"
              >
                <Sun className="h-4 w-4" aria-hidden /> Light
              </Button>
              <Button
                variant={mounted && resolvedTheme === "dark" ? "default" : "outline"}
                size="sm"
                onClick={() => setTheme("dark")}
                aria-pressed={mounted && resolvedTheme === "dark"}
                className="gap-1.5"
              >
                <Moon className="h-4 w-4" aria-hidden /> Dark
              </Button>
            </CardContent>
          </Card>
        </FadeIn>

        <FadeIn delay={0.08}>
          <Card className="border-primary/15 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Language &amp; preferences</CardTitle>
              <CardDescription>Used for AI perception and localized responses.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline" className="border-primary/30 bg-primary/5">
                {languageLabel(profileBrief?.language)}
              </Badge>
              <span className="text-xs text-muted-foreground">Change it in your Health Profile.</span>
            </CardContent>
          </Card>
        </FadeIn>

        <FadeIn delay={0.11}>
          <Card className="border-primary/15 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Condition constraints</CardTitle>
              <CardDescription>Hard nutrient limits enforced before anything is ranked.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {(profileBrief?.healthConditions.length ?? 0) > 0 ? (
                profileBrief!.healthConditions.map((c) => (
                  <Badge key={c} variant="outline" className="border-primary/30 bg-primary/5 font-mono text-[10px]">
                    {c}
                  </Badge>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No conditions configured.</p>
              )}
            </CardContent>
          </Card>
        </FadeIn>

        <FadeIn delay={0.14}>
          <Card className="border-primary/15 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Allergen hard-exclusions</CardTitle>
              <CardDescription>Filtered out before ranking — never surfaced, even as alternatives.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {(profileBrief?.allergies.length ?? 0) > 0 ? (
                profileBrief!.allergies.map((a) => (
                  <Badge key={a} variant="outline" className="border-amber-500/40 bg-amber-500/10 text-[11px]">
                    🥜 {a}
                  </Badge>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No allergens configured.</p>
              )}
            </CardContent>
          </Card>
        </FadeIn>
      </div>

      <FadeIn delay={0.17}>
        <Card className="border-destructive/20 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Account</CardTitle>
            <CardDescription>Signed in as {user?.email ?? "…"}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" size="sm" className="gap-1.5" onClick={handleLogout}>
              <LogOut className="h-4 w-4" aria-hidden /> Log out
            </Button>
          </CardContent>
        </Card>
      </FadeIn>
    </div>
  );
}
