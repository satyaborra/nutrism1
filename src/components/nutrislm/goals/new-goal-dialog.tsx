"use client";

/**
 * "Set a new goal" dialog — creates a real custom check-in goal through
 * POST /api/goals: emoji, title, subtitle, category, cadence and the number of
 * checked days needed to unlock. Everything is validated server-side.
 */
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/client/api";

const EMOJIS = ["🎯", "💧", "🥗", "👟", "🌙", "🍎", "📘", "🌿", "🧘", "🚶", "☀️", "🥕", "💪", "🧠", "✨", "🔥", "⚖️", "❤️"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function NewGoalDialog({ open, onOpenChange, onCreated }: Props) {
  const [emoji, setEmoji] = useState("🎯");
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [category, setCategory] = useState("lifestyle");
  const [period, setPeriod] = useState("weekly");
  const [target, setTarget] = useState("5");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the form each time the dialog opens (open-triggered, not effect-sync setState).
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      setEmoji("🎯");
      setTitle("");
      setSubtitle("");
      setCategory("lifestyle");
      setPeriod("weekly");
      setTarget("5");
      setError(null);
    }, 0);
    return () => clearTimeout(t);
  }, [open]);

  const create = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Give your goal a name first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { api } = await import("@/lib/client/api");
      await api.createGoal({
        title: trimmed,
        subtitle: subtitle.trim() || undefined,
        emoji,
        category,
        period,
        target: Math.min(30, Math.max(1, Math.round(Number(target) || 5))),
      });
      onCreated();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create the goal. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle>Set a new goal</DialogTitle>
          <DialogDescription>
            A personal habit you check in daily. Hit the target number of days to unlock it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* emoji picker */}
          <div>
            <Label className="text-xs font-semibold">Pick an icon</Label>
            <div className="mt-2 grid grid-cols-9 gap-1.5" role="radiogroup" aria-label="Goal icon">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  role="radio"
                  aria-checked={emoji === e}
                  onClick={() => setEmoji(e)}
                  className={cn(
                    "flex h-9 items-center justify-center rounded-lg text-lg transition",
                    emoji === e
                      ? "bg-primary/15 ring-2 ring-primary/60"
                      : "bg-muted/60 hover:bg-muted",
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="goal-title" className="text-xs font-semibold">
              Goal name <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="goal-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Morning walk"
              maxLength={60}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="goal-subtitle" className="text-xs font-semibold">
              Short description
            </Label>
            <Input
              id="goal-subtitle"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="e.g. 20 minutes before breakfast"
              maxLength={90}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger aria-label="Goal category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nutrition">Nutrition</SelectItem>
                  <SelectItem value="health">Health & Medical</SelectItem>
                  <SelectItem value="lifestyle">Lifestyle</SelectItem>
                  <SelectItem value="learning">Learning</SelectItem>
                  <SelectItem value="streaks">Streaks</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Cadence</Label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger aria-label="Goal cadence">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly (7-day window)</SelectItem>
                  <SelectItem value="monthly">Monthly (30-day window)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="goal-target" className="text-xs font-semibold">
              Days needed to unlock: <span className="text-primary">{Math.min(30, Math.max(1, Math.round(Number(target) || 5)))}</span>
            </Label>
            <input
              id="goal-target"
              type="range"
              min={1}
              max={30}
              value={Number(target) || 5}
              onChange={(e) => setTarget(e.target.value)}
              className="w-full accent-emerald-600"
              aria-label="Days needed to unlock"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={create} disabled={busy} className="gap-1.5">
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Create goal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
