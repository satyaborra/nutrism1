"use client";

/**
 * Log Meal view — the showcase screen:
 *   • Hero banner ("Log a Meal" + script accent + bowl photo)
 *   • Main column: the logging wizard (mode cards, capture, recent inputs, CTA)
 *   • Right rail: Quick Examples, Language picker, brand quote
 * Language choice is persisted and drives the voice-input locale + describe
 * placeholder. Examples push text into the logger through the shared store.
 */
import { useState } from "react";
import { ChevronRight, Globe, Lightbulb, Leaf } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { FoodLogger } from "../food-logger";
import { FoodLibrary } from "../food-explorer";
import { FadeIn } from "../fade-in";
import { useNutriStore } from "../store";

const RAIL_EXAMPLES = [
  "2 idli and one cup sambar",
  "rendu dosa, oru cup chaya",
  "1 cup rice and dal",
  "grilled chicken salad with olive oil",
  "banana and milk",
];

const LANGUAGES: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "ta", label: "தமிழ்" },
  { code: "te", label: "తెలుగు" },
  { code: "hi", label: "हिन्दी" },
  { code: "kn", label: "ಕನ್ನಡ" },
];

const LANG_STORAGE_KEY = "nutrislm.logLanguage";

/** Quick Examples card — one tap pushes the example into the describe box. */
function QuickExamplesCard() {
  const requestLogger = useNutriStore((s) => s.requestLogger);

  function use(ex: string) {
    requestLogger({ tab: "text", text: ex });
  }

  return (
    <Card className="overflow-hidden rounded-3xl border-border/60 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-amber-400/20 text-amber-600 dark:text-amber-400" aria-hidden>
              <Lightbulb className="h-4 w-4" />
            </span>
            Quick Examples
          </h2>
          <button
            type="button"
            onClick={() => use(RAIL_EXAMPLES[0])}
            className="rounded text-xs font-semibold text-primary underline-offset-2 hover:underline"
          >
            Use Example
          </button>
        </div>
        <ul className="mt-3 space-y-1.5" aria-label="Example meal descriptions">
          {RAIL_EXAMPLES.map((ex) => (
            <li key={ex}>
              <button
                type="button"
                onClick={() => use(ex)}
                title={`Use “${ex}”`}
                aria-label={`Use example: ${ex}`}
                className={cn(
                  "group/ex flex w-full items-center gap-2 rounded-xl border border-transparent bg-muted/40 px-3 py-2 text-left text-sm transition-all hover:border-primary/30 hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-ring active:scale-[0.99]",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{ex}</span>
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover/ex:translate-x-0.5 group-hover/ex:text-primary"
                  aria-hidden
                />
              </button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** Language card — chips + "Auto-detect" select; drives voice + placeholder. */
function LanguageCard({ lang, onChange }: { lang: string | null; onChange: (lang: string | null) => void }) {
  return (
    <Card className="rounded-3xl border-border/60 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden>
              <Globe className="h-4 w-4" />
            </span>
            Language
          </h2>
          <Select
            value={lang ?? "auto"}
            onValueChange={(v) => onChange(v === "auto" ? null : v)}
          >
            <SelectTrigger
              aria-label="Input language"
              className="h-8 w-[7.5rem] rounded-lg text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto-detect</SelectItem>
              {LANGUAGES.map((l) => (
                <SelectItem key={l.code} value={l.code}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div role="group" aria-label="Quick language chips" className="mt-3 grid grid-cols-3 gap-2">
          {LANGUAGES.map((l) => {
            const active = lang === l.code;
            return (
              <button
                key={l.code}
                type="button"
                aria-pressed={active}
                onClick={() => onChange(active ? null : l.code)}
                className={cn(
                  "rounded-xl px-2 py-2 text-xs font-semibold transition-all active:scale-95 focus-visible:outline-2 focus-visible:outline-ring",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25"
                    : "border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
              >
                {l.label}
              </button>
            );
          })}
          {/* keep the grid balanced with an "Auto" chip mirroring the select */}
          <button
            type="button"
            aria-pressed={lang === null}
            onClick={() => onChange(null)}
            className={cn(
              "rounded-xl px-2 py-2 text-xs font-semibold transition-all active:scale-95 focus-visible:outline-2 focus-visible:outline-ring",
              lang === null
                ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25"
                : "border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            Auto
          </button>
        </div>
        <p className="mt-2.5 text-[11px] leading-snug text-muted-foreground">
          {lang === null
            ? "The AI auto-detects the language you type — including romanized Indian languages."
            : "Sets the voice-input language and example hints. Nutrition understanding works in every language."}
        </p>
      </CardContent>
    </Card>
  );
}

/** Brand quote card with watercolor leaves. */
function QuoteCard() {
  return (
    <Card className="relative overflow-hidden rounded-3xl border-primary/15 shadow-sm">
      <img
        src="/images/hero-leaves.png"
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-25 [mask-image:linear-gradient(to_bottom,transparent_0%,black_70%)] dark:opacity-15"
      />
      <CardContent className="relative p-5">
        <Leaf className="mb-2 h-4 w-4 text-primary/60" aria-hidden />
        <p className="font-script text-2xl font-semibold leading-tight text-primary">
          &ldquo;Healthy food fuels a happier you.&rdquo;
        </p>
        <p className="mt-2 text-xs font-medium text-muted-foreground">— NutriSLM</p>
      </CardContent>
    </Card>
  );
}

export function LogView() {
  const bumpData = useNutriStore((s) => s.bumpData);
  // persisted language choice — lazy read so the first paint is already correct
  const [lang, setLang] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const saved = window.localStorage.getItem(LANG_STORAGE_KEY);
      return saved && LANGUAGES.some((l) => l.code === saved) ? saved : null;
    } catch {
      return null;
    }
  });

  function handleLangChange(next: string | null) {
    setLang(next);
    try {
      if (next) window.localStorage.setItem(LANG_STORAGE_KEY, next);
      else window.localStorage.removeItem(LANG_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-5">
      {/* ---- hero ---- */}
      <FadeIn>
        <section className="relative overflow-hidden rounded-3xl border border-primary/15 bg-gradient-to-br from-primary/15 via-primary/5 to-teal-500/5 dark:from-primary/20 dark:via-primary/10">
          <img
            src="/images/hero-bowl.png"
            alt=""
            aria-hidden
            className="pointer-events-none absolute -right-8 -top-12 hidden h-[150%] w-60 rotate-2 rounded-3xl object-cover opacity-90 [mask-image:linear-gradient(to_left,black_50%,transparent_96%)] md:block dark:opacity-30"
          />
          <div className="relative p-6 sm:p-8">
            <h1 className="text-3xl font-extrabold tracking-tight text-emerald-950 dark:text-emerald-50 sm:text-4xl">
              Log a Meal
            </h1>
            <p className="mt-1.5 max-w-md text-sm text-muted-foreground sm:text-base">
              Capture your food, your way — and get instant nutrition insights.
            </p>
            <p className="font-script mt-2 -rotate-2 text-2xl font-semibold text-primary/85 sm:text-[1.7rem]" aria-hidden>
              Fuel Your Better Tomorrow
            </p>
          </div>
        </section>
      </FadeIn>

      {/* ---- main + rail ---- */}
      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0 space-y-5">
          <FadeIn delay={0.05}>
            <FoodLogger onLogged={bumpData} voiceLang={lang ?? undefined} />
          </FadeIn>
          <FadeIn delay={0.1}>
            <FoodLibrary />
          </FadeIn>
        </div>

        <FadeIn delay={0.1} className="min-w-0 space-y-4 xl:sticky xl:top-20">
          <QuickExamplesCard />
          <LanguageCard lang={lang} onChange={handleLangChange} />
          <QuoteCard />
        </FadeIn>
      </div>
    </div>
  );
}
