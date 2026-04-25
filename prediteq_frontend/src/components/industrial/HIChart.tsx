import { useMemo } from "react";
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart } from "recharts";
import { useApp } from "@/contexts/AppContext";
import { useHistoriqueHI } from "@/hooks/useHistoriqueHI";

interface HIChartProps {
  machineId?: string;
  machineName?: string;
}

export function HIChart({ machineId, machineName }: HIChartProps) {
  const { t, thresholds } = useApp();
  const { historiqueHI } = useHistoriqueHI(machineId ?? "", 90);

  // Aggregate raw 10-second points into hourly buckets (avg HI per hour)
  const { data, spanLabel } = useMemo(() => {
    if (historiqueHI.length === 0) return { data: [] as { date: string; hi: number }[], spanLabel: "" };

    const first = new Date(historiqueHI[0].createdAt);
    const last = new Date(historiqueHI[historiqueHI.length - 1].createdAt);
    const spanMs = last.getTime() - first.getTime();
    const spanHours = spanMs / 3_600_000;
    const spanDays = spanMs / 86_400_000;

    // Adaptive subtitle
    let label: string;
    if (spanDays >= 2) label = `${Math.round(spanDays)} derniers jours`;
    else if (spanHours >= 1) label = `${Math.round(spanHours)}h de données`;
    else label = "dernières minutes";

    // Bucket key + date label based on span
    const bucketFn = (d: Date) => {
      if (spanDays >= 7) {
        // bucket by day
        return d.toLocaleDateString('fr-FR', { month: '2-digit', day: '2-digit' });
      }
      // bucket by hour
      return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' +
        String(d.getHours()).padStart(2, '0') + 'h';
    };

    const buckets = new Map<string, { sum: number; count: number }>();
    for (const p of historiqueHI) {
      const key = bucketFn(new Date(p.createdAt));
      const b = buckets.get(key);
      if (b) { b.sum += p.hi; b.count++; }
      else buckets.set(key, { sum: p.hi, count: 1 });
    }

    const aggregated = Array.from(buckets.entries()).map(([date, b]) => ({
      date,
      hi: +(b.sum / b.count).toFixed(4),
    }));

    return { data: aggregated, spanLabel: label };
  }, [historiqueHI]);

  // Determine trend label
  const trend = useMemo(() => {
    if (data.length < 2) return null;
    const first = data[0].hi;
    const last = data[data.length - 1].hi;
    if (last < first - 0.05) return { label: t("dash.decreasingTrend"), cls: "bg-destructive/10 text-destructive border-destructive/20" };
    if (last > first + 0.05) return { label: t("dash.increasingTrend") ?? "Tendance haussière", cls: "bg-success/10 text-success border-success/20" };
    return { label: t("dash.stableTrend") ?? "Stable", cls: "bg-primary/10 text-primary border-primary/20" };
  }, [data, t]);

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{t("dash.hiEvolution")}</h3>
          <p className="text-xs text-muted-foreground mt-1.5">{machineName ? `${machineName} — ` : ""}{spanLabel || t("dash.last90")}</p>
        </div>
        <span className={`text-[0.65rem] font-semibold px-3 py-1.5 rounded-full border ${trend?.cls ?? "bg-muted text-muted-foreground border-border"}`}>
          {trend?.label ?? t("dash.noData") ?? "Pas de données"}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="hiGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(191, 50%, 42%)" stopOpacity={0.15} />
              <stop offset="95%" stopColor="hsl(191, 50%, 42%)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: 'hsl(215,12%,55%)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            interval={Math.max(0, Math.floor(data.length / 10) - 1)}
          />
          <YAxis
            domain={[0, 1.05]}
            tick={{ fill: 'hsl(215,12%,55%)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
          />
          <Tooltip
            contentStyle={{
              background: 'hsl(220,18%,10%)',
              border: '1px solid hsl(220,14%,20%)',
              borderRadius: '8px',
              fontSize: '11px',
              color: 'hsl(215,12%,55%)',
            }}
            labelStyle={{ color: 'hsl(191, 50%, 42%)', fontWeight: 600 }}
            formatter={(value: number) => [`HI : ${(value * 100).toFixed(1)}%`, '']}
          />
          <ReferenceLine y={thresholds.hiCrit} stroke="#e04060" strokeDasharray="4 4" strokeOpacity={0.7} label={{ value: `${thresholds.hiCrit.toFixed(2)} — ${t("chart.urgency")}`, position: 'right', fill: '#e04060', fontSize: 9 }} />
          <ReferenceLine y={thresholds.hiSurv} stroke="#d4915a" strokeDasharray="4 4" strokeOpacity={0.7} label={{ value: `${thresholds.hiSurv.toFixed(2)} — ${t("chart.surveillance")}`, position: 'right', fill: '#d4915a', fontSize: 9 }} />
          <Area
            type="monotone"
            dataKey="hi"
            stroke="hsl(191, 50%, 42%)"
            strokeWidth={2.5}
            fill="url(#hiGradient)"
            dot={false}
            activeDot={{ r: 5, fill: 'hsl(191, 50%, 42%)', stroke: '#fff', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
