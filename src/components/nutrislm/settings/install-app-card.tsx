"use client";

/**
 * Install as an app — the browser's one-time `beforeinstallprompt` is captured
 * at app boot (lib/install-prompt.ts) and rebroadcast here, so the button works
 * even when Settings is opened long after page load.
 *
 * If no native prompt exists (iOS Safari, embedded preview iframes, dismissed
 * too recently), the button opens honest per-platform install steps instead of
 * silently doing nothing.
 */
import { useEffect, useState } from "react";
import {
  ChevronRight,
  Download,
  ExternalLink,
  Info,
  Share,
  Smartphone,
  SmartphoneCharging,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  clearInstallPrompt,
  getInstallPrompt,
  onInstallPromptChange,
  type InstallPromptEvent,
} from "@/lib/install-prompt";

type Platform = "ios" | "android" | "desktop";

function detectPlatform(): Platform {
  const ua = window.navigator.userAgent;
  const ios =
    /iPad|iPhone|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && window.navigator.maxTouchPoints > 1); // iPadOS 13+
  if (ios) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

const STEPS: Record<Platform, string[]> = {
  ios: [
    "Open this page in Safari.",
    "Tap the Share icon in the browser toolbar.",
    "Scroll down and choose “Add to Home Screen”, then tap Add.",
  ],
  android: [
    "Open this page in Chrome.",
    "Tap the ⋮ menu at the top-right corner of the toolbar.",
    "Choose “Install app” or “Add to Home screen”, then confirm.",
  ],
  desktop: [
    "Open the app in Chrome or Edge.",
    "Look for the install icon at the right end of the address bar (or open the ⋮ menu).",
    "Choose “Install NutriSLM…” / “Install page as app…”, then confirm.",
  ],
};

export function InstallAppCard() {
  const { toast } = useToast();
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [embedded, setEmbedded] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        // iOS Safari home-screen launches
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
      setInstalled(standalone);
      setPlatform(detectPlatform());
      setEmbedded(window.self !== window.top);
      setDeferred(getInstallPrompt());
    });
    const off = onInstallPromptChange(setDeferred);
    const onInstalled = () => {
      setInstalled(true);
      toast({ title: "📲 NutriSLM installed", description: "Find it on your home screen." });
    };
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      cancelAnimationFrame(raf);
      off();
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [toast]);

  async function install() {
    if (!deferred) {
      setHelpOpen(true); // no native prompt available — guide the user instead
      return;
    }
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === "accepted") {
        setInstalled(true);
        clearInstallPrompt();
      } else {
        toast({
          title: "Install dismissed",
          description: "You can install anytime from this card.",
        });
      }
    } catch {
      // prompt() can throw if dismissed recently, already installed, or the
      // page runs inside an embedded frame — fall back to guided steps.
      clearInstallPrompt();
      setHelpOpen(true);
    }
  }

  function openOwnTab() {
    window.open(window.location.href, "_blank", "noopener,noreferrer");
  }

  return (
    <section
      aria-label="Install as an app"
      className="flex flex-col gap-4 rounded-3xl border border-border/60 bg-card p-5 shadow-sm shadow-black/[0.03] sm:flex-row sm:items-center sm:justify-between sm:p-6"
    >
      <div className="flex min-w-0 items-start gap-3.5">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-md shadow-emerald-600/25"
          aria-hidden
        >
          <Smartphone className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-bold tracking-tight">Install as an app</h2>
          <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
            Add NutriSLM to your home screen — full-screen, no browser bars, icon launches straight
            into your log.
          </p>
          {installed ? (
            <p className="mt-2 flex items-center gap-1.5 text-[11.5px] font-semibold text-primary">
              <SmartphoneCharging className="h-3.5 w-3.5" aria-hidden />
              Running as an installed app on this device.
            </p>
          ) : embedded ? (
            <p className="mt-2 flex items-start gap-1.5 text-[11.5px] text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              Install needs a full browser tab — tap <span className="font-semibold">How to install</span>{" "}
              to open one and get one-tap steps.
            </p>
          ) : platform === "ios" ? (
            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted-foreground">
              <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
              On iPhone: tap <Share className="inline h-3.5 w-3.5" aria-label="Share" /> then{" "}
              <span className="font-semibold text-foreground/80">Add to Home Screen</span>.
            </p>
          ) : (
            <p className="mt-2 text-[11.5px] text-muted-foreground">
              {platform === "android"
                ? "Chrome offers a one-tap install — How to install has the ⋮ menu steps."
                : "Chrome & Edge install from the address bar — How to install has the steps."}
            </p>
          )}
        </div>
      </div>

      {installed ? null : (
        <Button
          onClick={install}
          className="h-10 shrink-0 gap-1.5 rounded-xl bg-primary px-4 font-semibold shadow-md shadow-primary/25"
        >
          {deferred ? (
            <>
              <Download className="h-4 w-4" aria-hidden />
              Install NutriSLM
            </>
          ) : (
            <>
              How to install
              <ChevronRight className="h-4 w-4" aria-hidden />
            </>
          )}
        </Button>
      )}

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-md gap-4 rounded-3xl p-6">
          <DialogHeader className="gap-2 text-left">
            <DialogTitle className="flex items-center gap-2.5 text-lg font-bold tracking-tight">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-sm shadow-emerald-600/25"
                aria-hidden
              >
                <Smartphone className="h-4.5 w-4.5" />
              </span>
              Install NutriSLM
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-relaxed">
              Add it to your {platform === "desktop" ? "desktop" : "home screen"} — launches
              full-screen like a native app.
            </DialogDescription>
          </DialogHeader>

          {embedded ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 dark:border-amber-500/25 dark:bg-amber-500/10">
              <p className="flex items-start gap-2 text-[12.5px] font-medium leading-relaxed text-amber-900 dark:text-amber-200">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                You&apos;re viewing this inside an embedded preview. Browsers only allow installing
                from a full browser tab — open one first.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={openOwnTab}
                className="mt-2.5 h-9 gap-1.5 rounded-xl border-amber-300 bg-white/70 font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-transparent dark:text-amber-200 dark:hover:bg-amber-500/15"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                Open NutriSLM in a new tab
              </Button>
            </div>
          ) : null}

          <ol className="flex flex-col gap-2.5">
            {STEPS[platform].map((step, i) => (
              <li key={step} className="flex items-start gap-2.5 text-[13px] leading-relaxed">
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary"
                  aria-hidden
                >
                  {i + 1}
                </span>
                <span className="text-foreground/85">{step}</span>
              </li>
            ))}
          </ol>
        </DialogContent>
      </Dialog>
    </section>
  );
}
