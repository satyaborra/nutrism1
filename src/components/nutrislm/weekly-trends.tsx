"use client";

/**
 * 7-day trends — deterministic aggregation from persisted meals (weekly-summary API).
 * Recharts bar chart with target reference lines; Calories / Protein tabs.
 */
import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Download, Flame, Loader2, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/client/api";
import { useNutriStore } from "./store";
import type { WeeklySummaryResponse } from "@/lib/client/types";

type Metric = "calories" | "protein";

interface ChartDatum {
  label: string;
  calories: number | null;
  protein: number | null;
  date: string;
  meals: number;
}

function toChartData(days: WeeklySummaryResponse["days"]): ChartDatum[] {
  return days.map((d) => ({
    label: format(parseISO(`${d.date}T12:00:00`), "EEE"),
    calories: d.meals > 0 ? d.calories : null,
    protein: d.meals > 0 ? d.protein : null,
    date: d.date,
    meals: d.meals,
  }));
}

function ChartTooltip({ active, payload, metric }: { active?: boolean; payload?: { payload: ChartDatum }[]; metric: Metric }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-semibold">{format(parseISO(`${d.date}T12:00:00`), "EEE d MMM")}</p>
      {d.meals === 0 ? (
        <p className="text-muted-foreground">No meals logged</p>
      ) : (
        <p className="text-muted-foreground">
          {metric === "calories" ? `${d.calories} kcal` : `${d.protein} g protein`} · {d.meals} meal{d.meals > 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}

export function WeeklyTrends() {
  const dataVersion = useNutriStore((s) => s.dataVersion);
  const { toast } = useToast();
  const [data, setData] = useState<WeeklySummaryResponse | null>(null);
  const [error, setError] = useState(false);
  const [metric, setMetric] = useState<Metric>("calories");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .weeklySummary()
      .then((res) => {
        if (alive) {
          setData(res);
          setError(false);
        }
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [dataVersion]);

  async function handleExport() {
    setExporting(true);
    try {
      const { url, filename } = await api.exportCsv(7);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast({ title: "Export ready", description: `${filename} downloaded — one row per meal with the full nutrient panel.` });
    } catch (e) {
      toast({
        title: "Export failed",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  }

  const chartData = useMemo(() => (data ? toChartData(data.days) : []), [data]);
  const target = data ? (metric === "calories" ? data.targets.calories : data.targets.protein) : 0;
  const avg = data ? (metric === "calories" ? data.avgCalories : Math.round((data.weekTotals.protein / 7) * 10) / 10) : 0;
  const maxValue = chartData.reduce((m, d) => Math.max(m, (d[metric] as number | null) ?? 0), 0);
  const yMax = Math.ceil(Math.max(target, maxValue) * 1.2 / (metric === "calories" ? 100 : 10)) * (metric === "calories" ? 100 : 10);

  return (
    <Card className="transition-shadow duration-300 hover:shadow-md hover:shadow-primary/5">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-5 w-5 text-primary" aria-hidden />
              Last 7 days
              {data && data.streak > 0 && (
                <Badge variant="outline" className="border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-400" title="Consecutive days with at least one logged meal">
                  <Flame className="mr-1 h-3 w-3" aria-hidden />
                  {data.streak}-day streak
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              {data
                ? metric === "calories"
                  ? `Avg ${avg.toLocaleString("en-US")} kcal/day · target ${data.targets.calories.toLocaleString("en-US")} kcal`
                  : `Avg ${avg} g protein/day · target ${data.targets.protein} g`
                : "Aggregated from your logged meals"}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Tabs value={metric} onValueChange={(v) => setMetric(v as Metric)}>
              <TabsList className="h-8">
                <TabsTrigger value="calories" className="text-xs">Calories</TabsTrigger>
                <TabsTrigger value="protein" className="text-xs">Protein</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground transition-colors hover:text-primary"
              aria-label="Export the last 7 days of meals as CSV"
              title="Export last 7 days as CSV"
              onClick={() => void handleExport()}
              disabled={exporting}
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-muted-foreground">Trends unavailable right now.</p>}
        {!data && !error && <Skeleton className="h-48 w-full" />}
        {data && (
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -14 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} className="fill-muted-foreground" />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  className="fill-muted-foreground"
                  width={52}
                  tickCount={5}
                  allowDecimals={false}
                  domain={[0, yMax]}
                  tickFormatter={(v: number) =>
                    metric === "calories"
                      ? v >= 1000
                        ? `${(Math.round(v / 100) / 10).toFixed(1)}k`
                        : `${Math.round(v)}`
                      : `${Math.round(v)}g`
                  }
                />
                <Tooltip content={<ChartTooltip metric={metric} />} cursor={{ fill: "rgba(16,185,129,0.08)" }} />
                <ReferenceLine
                  y={target}
                  stroke="currentColor"
                  className="text-orange-500"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={{
                    value: metric === "calories" ? `target ${target.toLocaleString("en-US")}` : `target ${target} g`,
                    position: "insideTopRight",
                    fontSize: 10,
                    fill: "currentColor",
                    className: "text-orange-600 fill-orange-600 dark:text-orange-400 dark:fill-orange-400",
                  }}
                />
                <Bar dataKey={metric} radius={[6, 6, 0, 0]} maxBarSize={38}>
                  {chartData.map((d, i) => (
                    <Cell
                      key={i}
                      fill={d.meals === 0 ? "var(--muted)" : metric === "calories" ? "#059669" : "#0d9488"}
                      opacity={d.meals === 0 ? 0.6 : 1}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
