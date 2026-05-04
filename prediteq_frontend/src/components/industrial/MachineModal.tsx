import { useState, useEffect, useMemo } from "react";
import { Machine, STATUS_CONFIG } from "@/data/machines";
import { SVGGauge } from "@/components/industrial/SVGGauge";
import { X, Loader2 } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { apiFetch } from "@/lib/api";
import {
  formatMachineFloorCountValue,
  formatMachineModelValue,
} from "@/lib/machinePresentation";
import { useAlertes } from "@/hooks/useAlertes";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, LabelList } from "recharts";

interface ShapData {
  shap_contributions: Record<string, number>;
  top_drivers: string[];
  features: Record<string, number>;
}

interface MachineModalProps {
  machine: Machine | null;
  onClose: () => void;
}

export function MachineModal({ machine, onClose }: MachineModalProps) {
  const { t } = useApp();
  const { alertes } = useAlertes(machine?.uuid);

  const sevMap: Record<string, { label: string; cls: string }> = {
    urgence: { label: 'CRIT', cls: 'bg-destructive/15 text-destructive' },
    surveillance: { label: 'WARN', cls: 'bg-warning/15 text-warning' },
    info: { label: 'INFO', cls: 'bg-teal/10 text-teal' },
  };

  // Fetch live SHAP data from API
  const [shapData, setShapData] = useState<ShapData | null>(null);
  const [shapLoading, setShapLoading] = useState(false);

  useEffect(() => {
    if (!machine?.id) return;
    setShapLoading(true);
    setShapData(null);
    apiFetch<ShapData>(`/explain/${machine.id}`)
      .then(setShapData)
      .catch(() => { setShapData(null); }) // SHAP unavailable — show fallback UI
      .finally(() => setShapLoading(false));
  }, [machine?.id]);

  const shapFeats = Object.keys(shapData?.shap_contributions ?? {});
  const shapVals = Object.values(shapData?.shap_contributions ?? {}).map(v => Math.abs(v));
  const maxShap = Math.max(...shapVals, 0.01);

  // Sort SHAP features by absolute value descending for chart
  const shapChartData = useMemo(() => {
    if (shapFeats.length === 0) return [];
    return shapFeats
      .map((f, i) => ({ name: f, value: shapVals[i] }))
      .sort((a, b) => b.value - a.value);
  }, [shapFeats, shapVals]);

  const machineAlertes = useMemo(
    () => alertes.filter(a => a.machineCode === machine?.id).slice(0, 6),
    [alertes, machine?.id]
  );

  // Color thresholds: top 30% red, 30-60% orange, bottom teal
  const getBarColor = (val: number) => {
    const ratio = maxShap > 0 ? val / maxShap : 0;
    if (ratio > 0.55) return '#e04060';
    if (ratio > 0.25) return '#f59e0b';
    return '#14b8a6';
  };

  if (!machine) return null;
  const m = machine;
  const cfg = STATUS_CONFIG[m.status];
  const hiPct = typeof m.hi === "number" ? Math.round(m.hi * 100) : null;

  return (
    <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl p-7 w-[720px] max-w-[95vw] max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-foreground">{m.name}</h2>
            <span className={`status-pill ${cfg.pillClass} text-[0.65rem]`}>{cfg.label}</span>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl bg-surface-3 border border-border flex items-center justify-center text-secondary-foreground hover:text-foreground transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Machine info + HI */}
        <div className="grid grid-cols-2 gap-5 mb-5">
          <div className="bg-surface-3 border border-border rounded-xl p-5">
            <div className="section-title mb-4">{t("modal.machineInfo")}</div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              {[
                [t("modal.model"), formatMachineModelValue(m.model, "-")],
                [t("modal.floors"), formatMachineFloorCountValue(m.floors, "-")],
                [t("modal.city"), m.city],
                [t("modal.cyclesDay"), m.cycles ?? "-"],
              ].map(([l, v]) => (
                <div key={String(l)}>
                  <div className="industrial-label">{l}</div>
                  <div className="text-foreground font-medium mt-1">{v}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-surface-3 border border-border rounded-xl p-5">
            <div className="section-title mb-4">{t("modal.healthIndex")}</div>
            <div className="font-mono text-3xl font-bold" style={{ color: cfg.hex }}>
              {hiPct != null ? (
                <>
                  {hiPct}<span className="text-base opacity-50">%</span>
                </>
              ) : (
                "—"
              )}
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-2">
              <div className="hi-fill" style={{ width: `${hiPct ?? 0}%` }} />
            </div>
            <div className="text-xs text-foreground mt-2.5">
              RUL: {m.rulMode === 'no_prediction'
                ? `L10 ${m.l10Years ?? '—'} ans — pas de précurseur`
                : m.rul !== null && m.rul !== undefined
                  ? `${m.rul}j${m.rulIntervalLow != null && m.rulIntervalHigh != null ? ` · ${m.rulIntervalLabel ?? 'IC 80 %'} ${m.rulIntervalLow}–${m.rulIntervalHigh}j` : m.rulci ? ` ± ${m.rulci}j` : ''}${m.stopRecommended ? ' · arrêt recommandé' : ''}`
                  : t("modal.inMaintenance")}
            </div>
            <div className="text-xs text-muted-foreground mt-1">{t("modal.anomalies24h")}: {m.anom}</div>
          </div>
        </div>

        {/* Sensor gauges */}
        <div className="grid grid-cols-3 gap-4 mb-5">
          {[
            { value: m.vib, max: 15, color: '#14b8a6', label: t("modal.vibration"), unit: 'mm/s' },
            {
              value: m.curr,
              max: 10,
              color: '#f59e0b',
              label: m.currSource === "estimated_from_power" ? "Courant estimé" : t("modal.current"),
              unit: 'A',
            },
            { value: m.temp, max: 100, color: '#e04060', label: t("modal.temperature"), unit: '°C' },
          ].map(g => (
            <div key={g.label} className="bg-surface-3 border border-border rounded-xl p-4 text-center">
              <div className="industrial-label mb-3">{g.label}</div>
              <SVGGauge {...g} />
            </div>
          ))}
        </div>

        {/* Anomalies + SHAP */}
        <div className="grid grid-cols-2 gap-5">
          <div className="bg-surface-3 border border-border rounded-xl p-5">
            <div className="section-title mb-4">{t("modal.anomalyHistory")}</div>
            {machineAlertes.length === 0 && <div className="text-sm text-muted-foreground py-2">{t("modal.noAnomaly")}</div>}
            <div className="space-y-2">
              {machineAlertes.map((a) => {
                const sev = sevMap[a.severite] ?? sevMap.info;
                return (
                <div key={a.id} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-muted/30 border border-border text-xs">
                  <span className="font-mono text-[0.65rem] text-muted-foreground w-20 flex-shrink-0">
                    {new Date(a.createdAt).toLocaleString('fr-FR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="text-foreground flex-1 truncate">{a.titre}</span>
                  <span className={`font-mono text-[0.6rem] font-bold px-2.5 py-0.5 rounded-lg ${sev.cls}`}>
                    {sev.label}
                  </span>
                </div>
                );
              })}
            </div>
          </div>
          <div className="bg-surface-3 border border-border rounded-xl p-5">
            <div className="section-title mb-4">{t("modal.shapFeatures")}</div>
            {shapLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="w-4 h-4 animate-spin" /> {t("modal.shapLoading")}
              </div>
            )}
            {!shapLoading && shapChartData.length === 0 && (
              <div className="text-sm text-muted-foreground py-2">{t("modal.shapEmpty")}</div>
            )}
            {!shapLoading && shapChartData.length > 0 && (
              <ResponsiveContainer width="100%" height={Math.max(shapChartData.length * 28, 120)}>
                <BarChart data={shapChartData} layout="vertical" margin={{ top: 0, right: 50, left: 0, bottom: 0 }}>
                  <XAxis type="number" tick={{ fill: 'hsl(215,12%,55%)', fontSize: 9 }} axisLine={false} tickLine={false} domain={[0, 'dataMax']} />
                  <YAxis type="category" dataKey="name" tick={{ fill: 'hsl(215,12%,75%)', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }} axisLine={false} tickLine={false} width={90} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={14}>
                    {shapChartData.map((entry, idx) => (
                      <Cell key={idx} fill={getBarColor(entry.value)} />
                    ))}
                    <LabelList dataKey="value" position="right" formatter={(v: number) => v.toFixed(3)} style={{ fill: 'hsl(215,12%,65%)', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
