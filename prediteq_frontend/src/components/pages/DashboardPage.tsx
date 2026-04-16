import { useState, useMemo } from "react";
import { Heart, Clock, AlertTriangle, Activity, Thermometer, Zap, Cpu } from "lucide-react";
import { KpiCard } from "@/components/industrial/KpiCard";
import { SVGGauge } from "@/components/industrial/SVGGauge";
import { useApp } from "@/contexts/AppContext";
import { STATUS_CONFIG } from "@/data/machines";
import { useMachines } from "@/hooks/useMachines";
import { XAxis, YAxis, CartesianGrid, ReferenceLine, Area, AreaChart, ResponsiveContainer } from "recharts";

function genSensorData(base: number, variance: number, n = 9) {
  const out: { time: string; value: number }[] = [];
  for (let i = 0; i < n; i++) {
    const h = Math.floor(i * 1.5);
    const m2 = (i * 90) % 60;
    out.push({
      time: `${String(h).padStart(2, "0")}:${String(m2).padStart(2, "0")}`,
      value: +(base + (Math.random() - 0.5) * variance).toFixed(2),
    });
  }
  return out;
}

function gen7dHI(currentHI: number) {
  const out: { day: string; hi: number }[] = [];
  let hi = Math.min(currentHI + 0.15, 1);
  const days = ["J-7", "J-6", "J-5", "J-4", "J-3", "J-2", "J-1"];
  for (let i = 0; i < 7; i++) {
    hi = Math.max(0, Math.min(1, hi - 0.015 + (Math.random() * 0.02 - 0.01)));
    out.push({ day: days[i], hi: +hi.toFixed(3) });
  }
  out[out.length - 1].hi = currentHI;
  return out;
}

export function DashboardPage() {
  const { t } = useApp();
  const { machines } = useMachines();
  const [selectedId, setSelectedId] = useState(machines[0]?.id || "");
  const selected = machines.find(m => m.id === selectedId) || machines[0];

  const cfg = selected ? STATUS_CONFIG[selected.status] : STATUS_CONFIG.ok;

  const vibData = useMemo(() => selected ? genSensorData(selected.vib, 1.5) : [], [selected?.id]);
  const currData = useMemo(() => selected ? genSensorData(selected.curr, 0.8) : [], [selected?.id]);
  const tempData = useMemo(() => selected ? genSensorData(selected.temp, 4) : [], [selected?.id]);
  const hi7d = useMemo(() => selected ? gen7dHI(selected.hi) : [], [selected?.id]);

  return (
    <div className="space-y-6">
      {/* Machine Selector */}
      <div className="bg-card border border-border rounded-2xl p-5 shadow-premium">
        <div className="flex items-center gap-4 mb-5">
          <div className="section-title flex-1">{t("dash.selectMachine")}</div>
          <select
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            className="bg-surface-3 border border-border rounded-xl px-4 py-2.5 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {machines.map(m => <option key={m.id} value={m.id}>{m.id} — {m.name}</option>)}
          </select>
        </div>

        {selected && (
          <>
            {/* Status Banner */}
            <div className="rounded-2xl p-5 mb-5 border-l-4" style={{ borderLeftColor: cfg.hex, background: `${cfg.hex}10` }}>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div className="text-lg font-bold text-foreground">{selected.id}</div>
                  <div className="text-sm text-muted-foreground mt-1">{selected.name} · {selected.city}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`status-pill ${STATUS_CONFIG[selected.status].pillClass}`}>
                    {cfg.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{t("dash.lastUpdate")}: {selected.last}</span>
                </div>
              </div>
            </div>

            {/* 4 KPI Cards for selected machine */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
              <KpiCard icon={<Heart className="w-5 h-5" />} label="Health Index" value={<>{Math.round(selected.hi * 100)}<span className="text-base opacity-40">%</span></>} sub={cfg.label} variant={selected.hi >= 0.6 ? "green" : selected.hi >= 0.3 ? "warn" : "danger"}>
                <div className="progress-track mt-3"><div className="hi-fill" style={{ width: `${Math.round(selected.hi * 100)}%` }} /></div>
              </KpiCard>
              <KpiCard icon={<Clock className="w-5 h-5" />} label={t("modal.rulEstimated")} value={<>{selected.rul ?? "—"}<span className="text-base opacity-40"> j</span></>} sub={selected.rulci ? `± ${selected.rulci} ${t("dash.days")}` : ""} variant="blue" />
              <KpiCard icon={<Cpu className="w-5 h-5" />} label={t("dash.cyclesToday")} value={selected.cycles} sub={`${selected.floors} ${t("modal.floors").toLowerCase()}`} variant="blue" />
              <KpiCard icon={<AlertTriangle className="w-5 h-5" />} label={t("dash.anomalies24h")} value={selected.anom} sub={selected.anom > 10 ? t("dash.critical") : selected.anom > 3 ? t("dash.surveillance") : t("status.operational")} variant={selected.anom > 10 ? "danger" : selected.anom > 3 ? "warn" : "green"} />
            </div>

            {/* Sensor Charts */}
            <div className="section-title mb-4">{t("dash.sensorCharts")}</div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
              {[
                { data: vibData, label: t("modal.vibration"), key: "vib", color: "#4b8b9b", value: selected.vib, max: 15, unit: "mm/s", icon: <Activity className="w-4 h-4" /> },
                { data: currData, label: t("modal.current"), key: "curr", color: "#d4915a", value: selected.curr, max: 10, unit: "A", icon: <Zap className="w-4 h-4" /> },
                { data: tempData, label: t("modal.temperature"), key: "temp", color: "#c75c5c", value: selected.temp, max: 100, unit: "°C", icon: <Thermometer className="w-4 h-4" /> },
              ].map(sensor => (
                <div key={sensor.key} className="bg-card border border-border rounded-2xl p-4 card-premium">
                  <div className="flex items-center justify-center gap-2 mb-4">
                    <span style={{ color: sensor.color }}>{sensor.icon}</span>
                    <span className="font-bold text-sm uppercase tracking-wider" style={{ color: sensor.color }}>{sensor.label}</span>
                  </div>
                  <div className="flex justify-center mb-4">
                    <div className="w-[180px]">
                      <SVGGauge value={sensor.value} max={sensor.max} color={sensor.color} label="" unit={sensor.unit} />
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={100}>
                    <AreaChart data={sensor.data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id={`sg-${sensor.key}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={sensor.color} stopOpacity={0.5} />
                          <stop offset="70%" stopColor={sensor.color} stopOpacity={0.15} />
                          <stop offset="100%" stopColor={sensor.color} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="4 4" stroke={sensor.color} strokeOpacity={0.15} />
                      <XAxis dataKey="time" tick={{ fill: sensor.color, fontSize: 9, opacity: 0.8 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: sensor.color, fontSize: 9, opacity: 0.8 }} axisLine={false} tickLine={false} />
                      <Area type="monotone" dataKey="value" stroke={sensor.color} strokeWidth={2.5} fill={`url(#sg-${sensor.key})`} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ))}
            </div>

            {/* 7-Day HI Trend */}
            <div className="bg-card border border-border rounded-2xl p-5 shadow-premium">
              <div className="section-title mb-4">{t("dash.hiTrend7d")}</div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={hi7d} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="hi7dGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(191, 50%, 42%)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="hsl(191, 50%, 42%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: 'hsl(215,12%,55%)', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 1.05]} tick={{ fill: 'hsl(215,12%,55%)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} />
                  <ReferenceLine y={0.3} stroke="#e04060" strokeDasharray="4 4" strokeOpacity={0.7} label={{ value: `0.30 — ${t("chart.urgency")}`, position: 'right', fill: '#e04060', fontSize: 9 }} />
                  <ReferenceLine y={0.6} stroke="#d4915a" strokeDasharray="4 4" strokeOpacity={0.7} label={{ value: `0.60 — ${t("chart.surveillance")}`, position: 'right', fill: '#d4915a', fontSize: 9 }} />
                  <Area type="monotone" dataKey="hi" stroke="hsl(191, 50%, 42%)" strokeWidth={2.5} fill="url(#hi7dGrad)" dot={{ r: 3, fill: 'hsl(191, 50%, 42%)', stroke: '#fff', strokeWidth: 1.5 }} activeDot={{ r: 5, fill: 'hsl(191, 50%, 42%)', stroke: '#fff', strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>


    </div>
  );
}
