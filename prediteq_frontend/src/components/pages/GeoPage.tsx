import { IndustrialMap } from "@/components/industrial/IndustrialMap";
import { useApp } from "@/contexts/AppContext";
import { KpiCard } from "@/components/industrial/KpiCard";
import { STATUS_CONFIG } from "@/data/machines";
import { useMachines } from "@/hooks/useMachines";
import { Cpu, ShieldCheck, Activity, AlertTriangle } from "lucide-react";

export function GeoPage() {
  const { t } = useApp();
  const { machines } = useMachines();

  const totalMachines = machines.length;
  const opCount = machines.filter(m => m.status === "ok").length;
  const survCount = machines.filter(m => m.status === "degraded").length;
  const critCount = machines.filter(m => m.status === "critical" || m.status === "maintenance").length;
  const opPct = totalMachines ? Math.round((opCount / totalMachines) * 100) : 0;
  const survPct = totalMachines ? Math.round((survCount / totalMachines) * 100) : 0;
  const critPct = totalMachines ? Math.round((critCount / totalMachines) * 100) : 0;

  const avgHI = totalMachines ? +(machines.reduce((s, m) => s + m.hi, 0) / totalMachines).toFixed(2) : 0;
  const activeRuls = machines.filter(m => m.rul !== null).map(m => m.rul!);
  const avgRUL = activeRuls.length ? Math.round(activeRuls.reduce((s, r) => s + r, 0) / activeRuls.length) : 0;
  const fleetStatus = avgHI >= 0.6 ? "ok" : avgHI >= 0.3 ? "degraded" : "critical";
  const fleetStatusLabel = fleetStatus === "ok" ? t("status.operational") : fleetStatus === "degraded" ? t("dash.surveillance") : t("status.critical");

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="section-title">{t("geo.title")}</div>
        <span className="text-xs font-semibold text-primary bg-primary/10 border border-primary/20 rounded-full px-3.5 py-1">
          {machines.length} {t("geo.sites")}
        </span>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard icon={<Cpu className="w-5 h-5" />} label={t("dash.totalMachines")} value={totalMachines} sub={t("dash.fullFleet")} variant="blue" />
        <KpiCard icon={<ShieldCheck className="w-5 h-5" />} label={`% ${t("dash.operational")}`} value={<>{opPct}<span className="text-base opacity-40">%</span></>} sub={`${opCount} ${t("nav.machines").toLowerCase()}`} variant="green">
          <div className="progress-track mt-3"><div className="progress-fill bg-success" style={{ width: `${opPct}%` }} /></div>
        </KpiCard>
        <KpiCard icon={<Activity className="w-5 h-5" />} label={`% ${t("dash.surveillance")}`} value={<>{survPct}<span className="text-base opacity-40">%</span></>} sub={`${survCount} ${t("nav.machines").toLowerCase()}`} variant="warn">
          <div className="progress-track mt-3"><div className="progress-fill bg-warning" style={{ width: `${survPct}%` }} /></div>
        </KpiCard>
        <KpiCard icon={<AlertTriangle className="w-5 h-5" />} label={`% ${t("dash.criticalPct")}`} value={<>{critPct}<span className="text-base opacity-40">%</span></>} sub={`${critCount} ${t("nav.machines").toLowerCase()}`} variant="danger">
          <div className="progress-track mt-3"><div className="progress-fill bg-destructive" style={{ width: `${critPct}%` }} /></div>
        </KpiCard>
      </div>

      {/* Fleet Health Strip */}
      <div className="bg-card border border-border rounded-2xl p-5 flex flex-col sm:flex-row items-center gap-5">
        <div className="flex-1 w-full">
          <div className="section-title mb-3">{t("dash.fleetHealth")}</div>
          <div className="h-3 rounded-full overflow-hidden bg-muted">
            <div className="hi-fill h-full" style={{ width: `${Math.round(avgHI * 100)}%` }} />
          </div>
        </div>
        <div className="flex items-center gap-8 flex-shrink-0">
          <div className="text-center">
            <div className="industrial-label">{t("dash.fleetAvgHI")}</div>
            <div className="text-2xl font-bold text-primary mt-1">{(avgHI * 100).toFixed(0)}%</div>
          </div>
          <div className="w-px h-10 bg-border" />
          <div className="text-center">
            <div className="industrial-label">{t("dash.avgRUL")}</div>
            <div className="text-2xl font-bold text-foreground mt-1">{avgRUL} <span className="text-sm text-muted-foreground">{t("dash.days")}</span></div>
          </div>
          <div className="w-px h-10 bg-border" />
          <div className="text-center">
            <div className="industrial-label">{t("table.status")}</div>
            <span className={`status-pill ${STATUS_CONFIG[fleetStatus].pillClass} mt-1`}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "currentColor" }} />
              {fleetStatusLabel}
            </span>
          </div>
        </div>
      </div>

      <IndustrialMap />
    </div>
  );
}
