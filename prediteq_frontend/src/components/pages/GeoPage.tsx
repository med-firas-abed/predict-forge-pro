import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Cpu,
  ShieldCheck,
} from "lucide-react";
import { IndustrialMap } from "@/components/industrial/IndustrialMap";
import { KpiCard } from "@/components/industrial/KpiCard";
import { useApp } from "@/contexts/AppContext";
import { useMachines } from "@/hooks/useMachines";
import { useFleetPredictiveInsights } from "@/hooks/useFleetPredictiveInsights";
import { formatPredictiveRul } from "@/lib/predictiveLive";
import { repairText } from "@/lib/repairText";

export function GeoPage() {
  const { t, lang } = useApp();
  const { machines } = useMachines();
  const { insights, byMachineId } = useFleetPredictiveInsights(machines);
  const [focusedMachineId, setFocusedMachineId] = useState("");
  const l = (fr: string, en: string, ar: string) =>
    repairText(lang === "fr" ? fr : lang === "en" ? en : ar);

  const totalMachines = machines.length;
  const opCount = machines.filter((machine) => machine.status === "ok").length;
  const survCount = machines.filter((machine) => machine.status === "degraded").length;
  const critCount = machines.filter(
    (machine) => machine.status === "critical" || machine.status === "maintenance",
  ).length;
  const opPct = totalMachines ? Math.round((opCount / totalMachines) * 100) : 0;
  const survPct = totalMachines ? Math.round((survCount / totalMachines) * 100) : 0;
  const critPct = totalMachines ? Math.round((critCount / totalMachines) * 100) : 0;

  const predictiveStats = useMemo(() => {
    const ranking = [...insights].sort((left, right) => right.urgencyScore - left.urgencyScore);

    return {
      ranking: ranking.slice(0, 3),
    };
  }, [insights]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="section-title">{t("geo.title")}</div>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiCard
          icon={<Cpu className="w-5 h-5" />}
          label={t("dash.totalMachines")}
          value={totalMachines}
          sub={t("dash.fullFleet")}
          variant="blue"
        />
        <KpiCard
          icon={<ShieldCheck className="w-5 h-5" />}
          label={`% ${t("dash.operational")}`}
          value={
            <>
              {opPct}
              <span className="text-base opacity-40">%</span>
            </>
          }
          sub={`${opCount} ${t("nav.machines").toLowerCase()}`}
          variant="green"
        >
          <div className="progress-track mt-3">
            <div className="progress-fill bg-success" style={{ width: `${opPct}%` }} />
          </div>
        </KpiCard>
        <KpiCard
          icon={<Activity className="w-5 h-5" />}
          label={`% ${t("dash.surveillance")}`}
          value={
            <>
              {survPct}
              <span className="text-base opacity-40">%</span>
            </>
          }
          sub={`${survCount} ${t("nav.machines").toLowerCase()}`}
          variant="warn"
        >
          <div className="progress-track mt-3">
            <div className="progress-fill bg-warning" style={{ width: `${survPct}%` }} />
          </div>
        </KpiCard>
        <KpiCard
          icon={<AlertTriangle className="w-5 h-5" />}
          label={`% ${t("dash.criticalPct")}`}
          value={
            <>
              {critPct}
              <span className="text-base opacity-40">%</span>
            </>
          }
          sub={`${critCount} ${t("nav.machines").toLowerCase()}`}
          variant="danger"
        >
          <div className="progress-track mt-3">
            <div className="progress-fill bg-destructive" style={{ width: `${critPct}%` }} />
          </div>
        </KpiCard>
      </div>

      <IndustrialMap
        mode="predictive"
        predictiveInsights={byMachineId}
        heightClass="h-[560px] md:h-[620px] xl:h-[700px]"
        focusedMachineId={focusedMachineId}
        onMachineSelect={setFocusedMachineId}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {predictiveStats.ranking.map((insight, index) => (
          <button
            key={insight.machine.id}
            type="button"
            onClick={() => setFocusedMachineId(insight.machine.id)}
            className={`rounded-2xl border bg-card p-5 text-left shadow-premium transition-all hover:-translate-y-0.5 hover:border-primary/30 ${
              focusedMachineId === insight.machine.id ? "border-primary/40" : "border-border"
            }`}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-surface-3 text-xs font-bold text-primary">
                    {index + 1}
                  </span>
                  <span className="text-sm font-bold text-foreground">{insight.machine.id}</span>
                </div>
                <div className="mt-1 text-sm text-muted-foreground">{insight.machine.name}</div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold" style={{ color: insight.urgencyHex }}>
                  {insight.urgencyScore}
                </div>
                <div className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                  {l("priorite", "priority", "الأولوية")}
                </div>
              </div>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-surface-3 px-2.5 py-1 font-semibold text-foreground">
                {formatPredictiveRul(
                  insight,
                  lang === "fr" ? "fr-FR" : lang === "en" ? "en-US" : "ar",
                )}
              </span>
              <span className="rounded-full bg-surface-3 px-2.5 py-1 font-semibold text-foreground">
                {l("Stress", "Stress", "الضغط")} {insight.stressValue != null ? `${Math.round(insight.stressValue * 100)}%` : "-"}
              </span>
              <span
                className="rounded-full px-2.5 py-1 font-semibold"
                style={{ backgroundColor: `${insight.urgencyHex}18`, color: insight.urgencyHex }}
              >
                {insight.urgencyLabel}
              </span>
            </div>

            <div className="text-xs leading-relaxed text-muted-foreground">{insight.summary}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
