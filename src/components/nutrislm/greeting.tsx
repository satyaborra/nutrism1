"use client";

/**
 * Time-aware greeting + quick action row.
 */
import { useEffect, useState } from "react";
import { ArrowDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNutriStore, MEAL_TYPE_ICON } from "./store";
import { localeFor } from "@/lib/client/format";

function currentSlot(d = new Date()): "breakfast" | "lunch" | "snack" | "dinner" {
  const h = d.getHours();
  if (h < 11) return "breakfast";
  if (h < 16) return "lunch";
  if (h < 19) return "snack";
  return "dinner";
}

export function Greeting() {
  const user = useNutriStore((s) => s.user);
  const profileBrief = useNutriStore((s) => s.profileBrief);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // First paint after hydration + periodic refresh (setState in callback, not effect body)
    const raf = requestAnimationFrame(() => setNow(new Date()));
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(interval);
    };
  }, []);

  const slot = currentSlot(now ?? new Date());
  const slotLine: Record<string, string> = {
    breakfast: "Time for breakfast — log it and we'll balance the rest of your day.",
    lunch: "Lunch time — describe it in any language, or snap a photo.",
    snack: "Snack window — small bites count too.",
    dinner: "Dinner time — let's keep the day on track.",
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-background p-5 sm:p-6">
      {/* decorative accents */}
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/10 blur-2xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-16 -left-6 h-44 w-44 rounded-full bg-teal-500/10 blur-2xl" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {now
              ? new Intl.DateTimeFormat(localeFor(profileBrief?.language ?? "en"), {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                }).format(now)
              : "…"}
          </p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight sm:text-3xl">
            {slot === "breakfast" ? "Good morning" : slot === "lunch" ? "Good afternoon" : slot === "dinner" ? "Good evening" : "Hi there"}{" "}
            {user?.name?.split(" ")[0]} <span aria-hidden>{MEAL_TYPE_ICON[slot]}</span>
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">{slotLine[slot]}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {profileBrief?.healthConditions.map((c) => (
            <Badge key={c} variant="outline" className="border-primary/40 bg-primary/5 font-mono text-[10px]">
              {c}
            </Badge>
          ))}
          <Button
            size="sm"
            onClick={() => document.getElementById("log-food")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            Log a meal <ArrowDown className="ml-1 h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}
