"use client";

/**
 * Settings page orchestrator — hero, the reference 2×2 preference grid,
 * account, data & privacy and the how-it-works card. All cards render real
 * session/profile state; no placeholder values.
 */
import { FadeIn } from "../fade-in";
import { SettingsHero } from "./settings-hero";
import { AppearanceCard } from "./appearance-card";
import { LanguageCard } from "./language-card";
import { ConstraintsCard } from "./constraints-card";
import { AllergensCard } from "./allergens-card";
import { AccountCard } from "./account-card";
import { DataPrivacyCard } from "./data-privacy-card";
import { InstallAppCard } from "./install-app-card";
import { AboutCard } from "./about-card";

export function SettingsPage() {
  return (
    <div className="space-y-4 sm:space-y-5">
      <FadeIn>
        <SettingsHero />
      </FadeIn>

      <div className="grid gap-4 sm:gap-5 md:grid-cols-2">
        <FadeIn delay={0.05}>
          <AppearanceCard />
        </FadeIn>
        <FadeIn delay={0.08}>
          <LanguageCard />
        </FadeIn>
        <FadeIn delay={0.11}>
          <ConstraintsCard />
        </FadeIn>
        <FadeIn delay={0.14}>
          <AllergensCard />
        </FadeIn>
      </div>

      <FadeIn delay={0.17}>
        <AccountCard />
      </FadeIn>

      <FadeIn delay={0.2}>
        <InstallAppCard />
      </FadeIn>

      <FadeIn delay={0.23}>
        <DataPrivacyCard />
      </FadeIn>

      <FadeIn delay={0.26}>
        <AboutCard />
      </FadeIn>
    </div>
  );
}
