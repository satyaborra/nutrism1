"use client";

/**
 * Shared page header for the sidebar views — keeps every view visually
 * consistent (icon chip + title + subtitle).
 */
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function PageHeader({
  icon,
  title,
  subtitle,
  accent = "text-primary",
  chip = "bg-primary/10 text-primary",
  actions,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  accent?: string;
  chip?: string;
  actions?: React.ReactNode;
}) {
  return (
    <Card className={cn("flex flex-row flex-wrap items-center justify-between gap-3 border-primary/15 p-4 shadow-sm")}>
      <div className="flex min-w-0 items-center gap-3">
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl", chip)} aria-hidden>
          {icon}
        </span>
        <div className="min-w-0">
          <h1 className={cn("truncate text-lg font-extrabold tracking-tight", accent)}>{title}</h1>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </Card>
  );
}
