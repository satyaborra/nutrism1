"use client";

/**
 * Data & privacy — real utilities, no decoration:
 *  • Export: downloads the server-computed meals CSV (7 or 30 days) through
 *    the existing /api/nutrition/export endpoint via blob download.
 *  • On this device: shows which profile fields persist only in localStorage
 *    (medical notes, cuisine, custom condition) and clears them with confirm.
 */
import { useCallback, useEffect, useState } from "react";
import { Check, Download, FileDown, HardDrive, Loader2, NotebookPen, Trash2, UtensilsCrossed, Stethoscope } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { api } from "@/lib/client/api";

const NOTES_KEY = "nutrislm.medicalNotes";
const CUISINE_KEY = "nutrislm.cuisine";
const OTHER_KEY = "nutrislm.otherCondition";

const DEVICE_ITEMS: { key: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: NOTES_KEY, label: "Medical notes", icon: NotebookPen },
  { key: CUISINE_KEY, label: "Cuisine preference", icon: UtensilsCrossed },
  { key: OTHER_KEY, label: "Custom condition", icon: Stethoscope },
];

export function DataPrivacyCard() {
  const { toast } = useToast();
  const [presence, setPresence] = useState<Record<string, boolean>>({});
  const [exporting, setExporting] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);

  // Read device keys after mount (never during render; async callback keeps
  // the effect free of synchronous setState).
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const next: Record<string, boolean> = {};
      for (const item of DEVICE_ITEMS) {
        try {
          next[item.key] = Boolean(window.localStorage.getItem(item.key));
        } catch {
          next[item.key] = false;
        }
      }
      setPresence(next);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const exportCsv = useCallback(
    async (days: number) => {
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
        toast({ title: "📊 Export ready", description: filename });
      } catch (err) {
        toast({
          title: "Export failed",
          description: err instanceof Error ? err.message : "Please try again.",
          variant: "destructive",
        });
      } finally {
        setExporting(null);
      }
    },
    [toast],
  );

  function clearDeviceData() {
    setClearing(true);
    try {
      for (const item of DEVICE_ITEMS) {
        try {
          window.localStorage.removeItem(item.key);
        } catch {
          /* storage unavailable */
        }
      }
      setPresence({});
      toast({ title: "Device data cleared", description: "Only this browser's stored notes were removed." });
    } finally {
      setClearing(false);
    }
  }

  const anyDeviceData = DEVICE_ITEMS.some((item) => presence[item.key]);

  return (
    <section
      aria-label="Data and privacy"
      className="rounded-3xl border border-border/60 bg-card p-5 shadow-sm shadow-black/[0.03] sm:p-6"
    >
      <header>
        <h2 className="flex items-center gap-2 text-base font-bold tracking-tight">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-100 text-teal-600 dark:bg-teal-500/15 dark:text-teal-400"
            aria-hidden
          >
            <HardDrive className="h-4 w-4" />
          </span>
          Data &amp; privacy
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          Your numbers live on the server; these notes live only in this browser.
        </p>
      </header>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Export */}
        <div className="rounded-2xl border border-border/50 bg-background/60 p-4">
          <h3 className="flex items-center gap-2 text-[13px] font-bold">
            <FileDown className="h-4 w-4 text-primary" aria-hidden />
            Export your meal log
          </h3>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Server-computed CSV — every gram re-derived from the verified food database, never the frontend.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {[7, 30].map((days) => (
              <Button
                key={days}
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 rounded-xl text-xs font-semibold"
                disabled={exporting !== null}
                onClick={() => exportCsv(days)}
              >
                {exporting === days ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Download className="h-3.5 w-3.5" aria-hidden />
                )}
                Last {days} days
                <span className="sr-only">as CSV</span>
              </Button>
            ))}
          </div>
        </div>

        {/* On this device */}
        <div className="rounded-2xl border border-border/50 bg-background/60 p-4">
          <h3 className="flex items-center gap-2 text-[13px] font-bold">
            <HardDrive className="h-4 w-4 text-teal-600 dark:text-teal-400" aria-hidden />
            On this device
          </h3>
          <ul className="mt-2 space-y-1.5" aria-label="Device-stored fields">
            {DEVICE_ITEMS.map(({ key, label, icon: Icon }) => {
              const present = presence[key];
              return (
                <li key={key} className="flex items-center gap-2 text-[11.5px]">
                  <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="font-medium">{label}</span>
                  {present ? (
                    <span className="ml-auto flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9.5px] font-bold text-primary">
                      <Check className="h-2.5 w-2.5" aria-hidden /> stored here
                    </span>
                  ) : (
                    <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[9.5px] font-medium text-muted-foreground">
                      empty
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="mt-3">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!anyDeviceData || clearing}
                  className={cn(
                    "h-9 gap-1.5 rounded-xl text-xs font-semibold",
                    "border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive",
                  )}
                >
                  {clearing ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Trash2 className="h-3.5 w-3.5" aria-hidden />}
                  Clear device data
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear device-stored data?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Removes the medical notes, cuisine preference and custom condition saved in this browser only.
                    Your account, meals and goals are untouched.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep it</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-white hover:bg-destructive/90"
                    onClick={clearDeviceData}
                  >
                    Clear
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>
    </section>
  );
}
