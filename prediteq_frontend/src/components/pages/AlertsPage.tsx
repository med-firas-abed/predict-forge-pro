import { useState, useMemo } from "react";
import { BarChart3, ChevronDown, ChevronUp, Loader2, RefreshCw } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, LabelList, CartesianGrid, Tooltip } from "recharts";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { STATUS_CONFIG } from "@/data/machines";
import { useMachines } from "@/hooks/useMachines";
import { useAlertes } from "@/hooks/useAlertes";
import { apiFetch } from "@/lib/api";

interface ShapData {
  shap_contributions: Record<string, number>;
  score_if: number;
  features: Record<string, number>;
  machine_code: string;
  hi_smooth: number;
  zone: string;
  top_drivers: string[];
}

const STATIC_FEATURE_IMPORTANCE = [
  { name: "RMS_mean", importance: 0.342 },
  { name: "current_mean", importance: 0.318 },
  { name: "temp_deriv", importance: 0.295 },
  { name: "power_cycle", importance: 0.245 },
  { name: "ratio_duree", importance: 0.201 },
  { name: "hi_std", importance: 0.185 },
  { name: "corr_T_P", importance: 0.171 },
  { name: "RMS_var", importance: 0.124 },
  { name: "dRMS_dt", importance: 0.118 },
  { name: "energy_cyc", importance: 0.025 },
];

const STATIC_SHAP_B2 = [
  { name: "temp_deriv", importance: 0.298 },
  { name: "RMS_mean", importance: 0.275 },
  { name: "current_mean", importance: 0.241 },
  { name: "corr_T_P", importance: 0.218 },
  { name: "hi_std", importance: 0.195 },
  { name: "power_cycle", importance: 0.162 },
  { name: "ratio_duree", importance: 0.148 },
  { name: "RMS_var", importance: 0.112 },
  { name: "dRMS_dt", importance: 0.085 },
  { name: "energy_cyc", importance: 0.034 },
];

const STATIC_SHAP_C3 = [
  { name: "RMS_mean", importance: 0.412 },
  { name: "temp_deriv", importance: 0.388 },
  { name: "current_mean", importance: 0.351 },
  { name: "power_cycle", importance: 0.305 },
  { name: "corr_T_P", importance: 0.268 },
  { name: "hi_std", importance: 0.231 },
  { name: "ratio_duree", importance: 0.198 },
  { name: "RMS_var", importance: 0.175 },
  { name: "dRMS_dt", importance: 0.152 },
  { name: "energy_cyc", importance: 0.089 },
];

export function AlertsPage() {
  const { t, lang } = useApp();
  const { currentUser } = useAuth();
  const { machines } = useMachines(currentUser?.machineId);
  const { alertes } = useAlertes(currentUser?.machineId);

  // SHAP state
  const [shapData, setShapData] = useState<ShapData | null>(null);
  const [shapLoading, setShapLoading] = useState(false);
  const [shapMachine, setShapMachine] = useState("ASC-A1");
  const [shapOpen, setShapOpen] = useState(false);

  const loadShap = () => {
    if (shapMachine !== "ASC-A1") { setShapData(null); return; }
    setShapLoading(true);
    apiFetch<ShapData>(`/explain/${shapMachine}`)
      .then(setShapData)
      .catch(() => setShapData(null))
      .finally(() => setShapLoading(false));
  };

  const featureData = useMemo(() => {
    if (shapMachine === "ASC-A1" && shapData?.shap_contributions) {
      return Object.entries(shapData.shap_contributions)
        .map(([name, val]) => ({ name, importance: +Math.abs(val).toFixed(3) }))
        .sort((a, b) => b.importance - a.importance)
        .slice(0, 10);
    }
    if (shapMachine === "ASC-B2") return STATIC_SHAP_B2;
    if (shapMachine === "ASC-C3") return STATIC_SHAP_C3;
    return STATIC_FEATURE_IMPORTANCE;
  }, [shapData, shapMachine]);

  const maxImportance = featureData.length > 0 ? Math.max(...featureData.map(d => d.importance)) : 1;

  // Map alertes to the legacy alertLog shape used by the UI
  const alertLog = alertes.map(a => ({
    id: a.id,
    machineId: a.machineCode || a.machineId,
    timestamp: a.createdAt,
    message: a.description || a.titre,
    type: a.severite === "urgence" ? "urgence" as const : a.severite === "surveillance" ? "surveillance" as const : "ok" as const,
    acquitte: a.acquitte,
  }));

  // Categorize alerts
  const urgences = alertLog.filter(l => l.type === "urgence" && !l.acquitte);
  const surveillances = alertLog.filter(l => l.type === "surveillance" && !l.acquitte);
  const resolved = alertLog.filter(l => l.acquitte);

  const sections = [
    { title: t("alerts.emergenciesSection"), items: urgences, borderColor: 'border-l-destructive', badge: t("alerts.critical"), badgeCls: 'bg-destructive/10 text-destructive' },
    { title: t("alerts.underMonitoring"), items: surveillances, borderColor: 'border-l-warning', badge: t("alerts.monitoring"), badgeCls: 'bg-warning/10 text-warning' },
    { title: t("alerts.resolved"), items: resolved, borderColor: 'border-l-success', badge: 'OK', badgeCls: 'bg-success/10 text-success' },
  ];

  return (
    <div className="space-y-6">
      <div className="section-title">{t("alerts.center")}</div>

      {/* Per-Machine Alert Status */}
      <div className="bg-card border border-border rounded-2xl p-5 shadow-premium">
        <div className="section-title mb-4">{t("alerts.perMachineStatus")}</div>
        <div className="space-y-2">
          {machines.map(m => {
            const mcfg = STATUS_CONFIG[m.status];
            const alertDisp = (m.hi < 0.3 || (m.rul !== null && m.rul < 7))
              ? { label: t("alerts.emailSent"), cls: "text-destructive" }
              : (m.hi < 0.6 || (m.rul !== null && m.rul < 30))
                ? { label: t("alerts.weeklyScheduled"), cls: "text-warning" }
                : { label: t("alerts.noEmail"), cls: "text-success" };

            return (
              <div key={m.id} className="flex items-center gap-4 p-3.5 rounded-lg bg-surface-3 border-l-[3px]" style={{ borderLeftColor: mcfg.hex }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-foreground">{m.id}</span>
                    <span className={`status-pill ${mcfg.pillClass} text-[0.55rem]`}>{mcfg.label}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">HI={m.hi.toFixed(2)} · RUL={m.rul ?? "—"}j</div>
                </div>
                <div className={`text-xs font-semibold ${alertDisp.cls}`}>
                  {alertDisp.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Alert Sections */}
      {sections.map(section => (
        section.items.length > 0 && (
          <div key={section.title}>
            <h3 className="text-sm font-semibold text-foreground mb-3">{section.title}</h3>
            <div className="space-y-2">
              {section.items.map(entry => {
                const ts = new Date(entry.timestamp);
                return (
                  <div key={entry.id} className={`bg-card border border-border rounded-lg p-4 border-l-[3px] ${section.borderColor}`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-foreground">{entry.machineId}</span>
                        <span className={`text-[0.6rem] font-semibold px-2 py-0.5 rounded-md ${section.badgeCls}`}>
                          {section.badge}
                        </span>
                      </div>
                      <span className="text-[0.65rem] text-muted-foreground tabular-nums">
                        {ts.toLocaleDateString(lang === 'fr' ? "fr-FR" : lang === 'ar' ? "ar-TN" : "en-US", { day: "numeric", month: "short" })}, {ts.toLocaleTimeString(lang === 'fr' ? "fr-FR" : lang === 'ar' ? "ar-TN" : "en-US", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="text-xs text-secondary-foreground">{entry.message}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )
      ))}

      {/* 30-Day Stats */}
      <div className="bg-card border border-border rounded-2xl p-5 shadow-premium">
        <div className="section-title mb-4">{t("alerts.stats")}</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center p-4 border-t-2 border-t-destructive bg-card border border-border rounded-lg">
            <div className="text-3xl font-bold text-destructive">{urgences.length}</div>
            <div className="industrial-label mt-1.5">{t("alerts.emergencies")}</div>
          </div>
          <div className="text-center p-4 border-t-2 border-t-warning bg-card border border-border rounded-lg">
            <div className="text-3xl font-bold text-warning">{surveillances.length}</div>
            <div className="industrial-label mt-1.5">{t("alerts.monitoring")}</div>
          </div>
        </div>
      </div>

      {/* SHAP Feature Importance — collapsible */}
      <div className="bg-card border border-border rounded-2xl">
        <button
          onClick={() => setShapOpen(!shapOpen)}
          className="flex items-center gap-3 w-full px-5 py-4 text-left"
        >
          <BarChart3 className="w-4 h-4 text-primary" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-foreground">Features influentes — SHAP</h3>
            <p className="text-xs text-muted-foreground">Importance des capteurs dans la détection d'anomalies (Isolation Forest)</p>
          </div>
          {shapOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>

        {shapOpen && (
          <div className="px-5 pb-5 border-t border-border pt-4">
            <div className="flex items-center gap-3 mb-4">
              <select
                value={shapMachine}
                onChange={e => { setShapMachine(e.target.value); setShapData(null); }}
                className="bg-surface-3 border border-border rounded-lg px-3 py-1.5 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="ASC-A1">ASC-A1</option>
                <option value="ASC-B2">ASC-B2</option>
                <option value="ASC-C3">ASC-C3</option>
              </select>
              {shapMachine === "ASC-A1" && (
                <button
                  onClick={loadShap}
                  disabled={shapLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50 transition-colors"
                >
                  {shapLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  {shapLoading ? "Calcul SHAP..." : "Charger live"}
                </button>
              )}
              {shapMachine !== "ASC-A1" && (
                <span className="text-[0.65rem] text-muted-foreground">Données statiques (démarrez le simulateur pour live)</span>
              )}
            </div>

            {featureData.length > 0 && (
              <>
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart data={featureData} layout="vertical" margin={{ top: 0, right: 50, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" horizontal={false} />
                    <XAxis type="number" domain={[0, Math.ceil(maxImportance * 100) / 100]}
                      tick={{ fill: 'hsl(215,12%,55%)', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={100}
                      tick={{ fill: 'hsl(215,12%,55%)', fontSize: 10 }}
                      axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ background: 'hsl(220,18%,10%)', border: '1px solid hsl(220,14%,20%)', borderRadius: '8px', fontSize: '11px', color: 'hsl(215,12%,55%)' }}
                      labelStyle={{ color: 'hsl(224,76%,53%)' }}
                      formatter={(value: number) => [`${value.toFixed(3)}`, 'Impact']}
                    />
                    <Bar dataKey="importance" radius={[0, 4, 4, 0]} barSize={22}>
                      {featureData.map((entry, i) => {
                        const ratio = entry.importance / maxImportance;
                        const fill = ratio > 0.55 ? 'hsl(var(--destructive))' : ratio > 0.25 ? 'hsl(var(--warning))' : 'hsl(var(--primary))';
                        return <Cell key={i} fill={fill} fillOpacity={0.85} />;
                      })}
                      <LabelList dataKey="importance" position="right"
                        style={{ fill: 'hsl(215,12%,55%)', fontSize: 10 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>

                <div className="flex items-center gap-4 mt-3 text-[0.6rem] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-destructive inline-block" /> Élevé</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-warning inline-block" /> Modéré</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-primary inline-block" /> Faible</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
