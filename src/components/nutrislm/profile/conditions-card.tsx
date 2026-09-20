"use client";

/**
 * Health Conditions checklist — the three engine-supported conditions
 * (T2DM / CKD / CVD) are savable; the reference design's extra rows are shown
 * disabled with an honest "not yet supported" hint, plus the custom-condition
 * input which persists on this device together with the medical notes.
 */
import { Dna, Droplet, Ellipsis, Filter, Heart, HeartPulse, Stethoscope, Waves } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { HealthCondition3D } from "../three-d";

export interface ConditionRow {
  id: string;
  title: string;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  supported: boolean;
}

export const CONDITION_ROWS: ConditionRow[] = [
  { id: "T2DM", title: "Type 2 Diabetes Mellitus (T2DM)", sub: "Blood sugar management and glycemic control", icon: Droplet, iconClass: "bg-red-100 text-red-500 dark:bg-red-500/15 dark:text-red-400", supported: true },
  { id: "CKD", title: "Chronic Kidney Disease (CKD)", sub: "Kidney-friendly diet and sodium/protein control", icon: Filter, iconClass: "bg-rose-100 text-rose-500 dark:bg-rose-500/15 dark:text-rose-400", supported: true },
  { id: "CVD", title: "Cardiovascular Disease", sub: "Heart-healthy diet (low sodium, low saturated fat)", icon: Heart, iconClass: "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400", supported: true },
  { id: "HYPERTENSION", title: "Hypertension", sub: "Blood pressure management", icon: Stethoscope, iconClass: "bg-sky-100 text-sky-500 dark:bg-sky-500/15 dark:text-sky-400", supported: false },
  { id: "THYROID", title: "Thyroid Disorders", sub: "Supportive nutrition guidance", icon: Waves, iconClass: "bg-fuchsia-100 text-fuchsia-500 dark:bg-fuchsia-500/15 dark:text-fuchsia-400", supported: false },
  { id: "PCOS", title: "PCOS / Hormonal Issues", sub: "Hormonal balance and weight management", icon: Dna, iconClass: "bg-violet-100 text-violet-500 dark:bg-violet-500/15 dark:text-violet-400", supported: false },
  { id: "OTHER", title: "Other", sub: "Specify custom condition", icon: Ellipsis, iconClass: "bg-muted text-muted-foreground", supported: false },
];

export function ConditionsCard({
  selected,
  onToggle,
  otherText,
  onOtherText,
}: {
  selected: string[];
  onToggle: (id: string) => void;
  otherText: string;
  onOtherText: (v: string) => void;
}) {
  const otherChecked = selected.includes("OTHER");
  return (
    <section
      aria-label="Health conditions"
      className="rounded-3xl border border-border/60 bg-card p-5 shadow-sm shadow-black/[0.03]"
    >
      <header>
        <h2 className="flex items-center gap-2 text-base font-bold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-100 text-red-500 dark:bg-red-500/15 dark:text-red-400" aria-hidden>
            <Heart className="h-4 w-4 fill-current" />
          </span>
          Health Conditions
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          Select all that apply. This helps us provide safe and personalized nutrition
          recommendations.
        </p>
      </header>

      <ul className="mt-4 space-y-2" role="group" aria-label="Health conditions checklist">
        {CONDITION_ROWS.map(({ id, title, sub, icon: Icon, iconClass, supported }) => {
          const checked = selected.includes(id);
          return (
            <li key={id}>
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-2xl border px-3.5 py-3 transition-all duration-150",
                  checked
                    ? "border-primary/30 bg-primary/[0.05] shadow-sm"
                    : "border-border/60 bg-background hover:border-primary/20 hover:bg-muted/40",
                  !supported && "opacity-60",
                )}
              >
                <Checkbox
                  checked={checked}
                  disabled={!supported}
                  onCheckedChange={() => onToggle(id)}
                  aria-label={`${title}${supported ? "" : " (not yet supported by the constraint engine)"}`}
                  className="mt-0.5 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                />
                <HealthCondition3D icon={Icon} tileClassName={iconClass} label={title} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2">
                    <span className="text-[13px] font-bold leading-tight tracking-tight">{title}</span>
                    {!supported && (
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                        coming soon
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{sub}</span>
                </span>
              </label>
              {id === "OTHER" && otherChecked && (
                <div className="mt-2 animate-in fade-in slide-in-from-top-1 pl-12 pr-1">
                  <Input
                    value={otherText}
                    onChange={(e) => onOtherText(e.target.value)}
                    placeholder="Enter condition…"
                    aria-label="Custom condition"
                    className="h-9 rounded-xl bg-background text-[13px]"
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Saved on this device — mention it to your care team.
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
