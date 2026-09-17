"use client";

/**
 * Favorites quick-log bar — pinned meals ("favorites") as one-tap chips inside
 * the food logger's input step. Each chip shows the saved name + a server-estimated
 * kcal hint (deterministic: matched foods recomputed from the DB, unmatched snapshot).
 * Clicking a chip asks for confirmation; the actual log POST recomputes everything
 * server-side (same trust model as re-log) and stamps source="favorite".
 * Chips can be unpinned with the small × (optimistic, rolled back on failure).
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, Star, X } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatKcal } from "@/lib/client/format";
import type { FavoriteItem } from "@/lib/client/types";
import { api } from "@/lib/client/api";
import { MEAL_TYPE_ICON, mealLabel, useNutriStore } from "./store";

/** Human label for a meal slot — capitalised ("breakfast" → "Breakfast"). */
function slotLabel(slot: string): string {
  return mealLabel(slot);
}

export function FavoritesBar({ onLogged }: { onLogged: () => void }) {
  const dataVersion = useNutriStore((s) => s.dataVersion);
  const { toast } = useToast();
  const [favorites, setFavorites] = useState<FavoriteItem[] | null>(null);
  const [pending, setPending] = useState<FavoriteItem | null>(null);
  const [loggingId, setLoggingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .favorites()
      .then((res) => setFavorites(res.favorites))
      .catch(() => setFavorites([]));
  }, []);

  useEffect(() => {
    load();
  }, [load, dataVersion]);

  async function handleLog() {
    if (!pending) return;
    setLoggingId(pending.id);
    try {
      const res = await api.logFavorite(pending.id);
      toast({
        title: `Logged ${res.name}`,
        description: `${formatKcal(res.totals.calories)} added to ${slotLabel(res.mealType)} — recalculated from the food database.`,
      });
      setPending(null);
      onLogged();
    } catch (e) {
      toast({
        title: "Could not log this favorite",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoggingId(null);
    }
  }

  async function handleRemove(fav: FavoriteItem) {
    // Optimistic remove; restore on failure.
    setRemovingId(fav.id);
    const prev = favorites;
    setFavorites((cur) => (cur ? cur.filter((f) => f.id !== fav.id) : cur));
    try {
      await api.deleteFavorite(fav.id);
      toast({ title: "Favorite removed", description: `"${fav.name}" is no longer pinned.` });
    } catch (e) {
      setFavorites(prev ?? []);
      toast({
        title: "Could not remove favorite",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setRemovingId(null);
    }
  }

  if (favorites !== null && favorites.length === 0) return null;

  return (
    <div className="space-y-1.5" aria-label="Quick log favorites">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <Star className="h-3 w-3 fill-amber-500 text-amber-500" aria-hidden />
        Quick log from favorites
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
        {favorites === null &&
          Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-10 w-44 shrink-0 animate-pulse rounded-full bg-muted/70" aria-hidden />
          ))}
        {favorites?.map((fav) => (
          <div
            key={fav.id}
            className={cn(
              "group/chip relative flex shrink-0 items-center rounded-full border border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-primary/5 transition-all hover:border-amber-500/60 hover:shadow-sm",
              removingId === fav.id && "opacity-50",
            )}
          >
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-full py-2 pl-3 pr-7 text-left"
              onClick={() => setPending(fav)}
              aria-label={`Quick log ${fav.name} (about ${fav.estimateKcal} kilocalories)`}
            >
              <span className="text-sm" aria-hidden>{MEAL_TYPE_ICON[fav.mealType] ?? "🍽️"}</span>
              <span className="max-w-44 truncate text-xs font-medium">{fav.name}</span>
              <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                ≈{fav.estimateKcal}
              </span>
            </button>
            <button
              type="button"
              aria-label={`Remove ${fav.name} from favorites`}
              title="Remove from favorites"
              className="absolute right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-muted/80 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
              onClick={() => void handleRemove(fav)}
              disabled={removingId === fav.id}
            >
              {removingId === fav.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" aria-hidden /> : <X className="h-2.5 w-2.5" aria-hidden />}
            </button>
          </div>
        ))}
      </div>

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Star className="h-4 w-4 fill-amber-500 text-amber-500" aria-hidden />
              Quick log “{pending?.name}”?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  {pending && (
                    <>
                      {pending.itemNames.join(", ")} — about {pending.estimateKcal} kcal. The slot follows the current
                      time; every value is recalculated from the food database when you confirm.
                    </>
                  )}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loggingId !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleLog();
              }}
              disabled={loggingId !== null}
            >
              {loggingId !== null ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Logging…
                </>
              ) : (
                "Log it now"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
