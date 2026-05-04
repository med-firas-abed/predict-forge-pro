import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  Brain,
  CalendarClock,
  DollarSign,
  Download,
  Package,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

import { KpiCard } from "@/components/industrial/KpiCard";
import { useAuth } from "@/contexts/AuthContext";
import { useCouts } from "@/hooks/useCouts";
import { useFleetPredictiveInsights } from "@/hooks/useFleetPredictiveInsights";
import { useGmaoTaches } from "@/hooks/useGmaoTaches";
import { useMachines } from "@/hooks/useMachines";
import {
  formatHiPercent,
  formatPredictiveRul,
  formatStressValue,
  getLiveCostProjection,
  getUrgencyTone,
} from "@/lib/predictiveLive";

function formatCurrency(value: number) {
  return `${Math.round(value).toLocaleString("fr-FR")} TND`;
}

function formatMonthLabel(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleDateString("fr-FR", {
    month: "short",
    year: "numeric",
  });
}

function getBaselineSourceLabel(source: string) {
  switch (source) {
    case "machine_history":
      return "Référence : historique machine";
    case "fleet_history":
      return "Référence : moyenne flotte";
    default:
      return "Référence : type d'intervention";
  }
}

const TASK_FALLBACK_COST = {
  preventive: 260,
  inspection: 320,
  corrective: 480,
} as const;

export function CostsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === "admin";
  const { couts: rows } = useCouts(currentUser?.machineId);
  const { taches } = useGmaoTaches(currentUser?.machineId);
  const { machines } = useMachines(currentUser?.machineId);
  const { insights, isFetching } = useFleetPredictiveInsights(machines);

  const monthlyData = useMemo(() => {
    const map = new Map<
      string,
      { periodKey: string; label: string; labor: number; parts: number; total: number }
    >();

    rows.forEach((row) => {
      const month = Number(row.mois);
      const year = Number(row.annee);
      const periodKey = `${year}-${String(month).padStart(2, "0")}`;
      const current = map.get(periodKey) ?? {
        periodKey,
        label: formatMonthLabel(year, month),
        labor: 0,
        parts: 0,
        total: 0,
      };

      current.labor += row.mainOeuvre;
      current.parts += row.pieces;
      current.total += row.total;
      map.set(periodKey, current);
    });

    return Array.from(map.values()).sort((left, right) => left.periodKey.localeCompare(right.periodKey));
  }, [rows]);

  const recentMonthlyData = useMemo(() => {
    const currentMonthStart = new Date();
    currentMonthStart.setDate(1);

    const sourceMap = new Map(monthlyData.map((entry) => [entry.periodKey, entry]));

    return [3, 2, 1, 0].map((offset) => {
      const date = new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth() - offset, 1);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const periodKey = `${year}-${String(month).padStart(2, "0")}`;
      const source = sourceMap.get(periodKey);

      return {
        periodKey,
        label: formatMonthLabel(year, month),
        labor: source?.labor ?? 0,
        parts: source?.parts ?? 0,
        total: source?.total ?? 0,
        pipeline: offset === 0 ? 0 : 0,
      };
    });
  }, [monthlyData]);

  const historyWindowLabel = useMemo(() => {
    if (recentMonthlyData.length === 0) {
      return "Aucune fenêtre budgétaire récente n'est disponible.";
    }

    const first = recentMonthlyData[0];
    const last = recentMonthlyData[recentMonthlyData.length - 1];
    const hasRecordedCosts = recentMonthlyData.some((entry) => entry.total > 0);

    if (first.periodKey === last.periodKey) {
      return hasRecordedCosts
        ? `Fenêtre lue : ${first.label}`
        : `Fenêtre lue : ${first.label} · aucune dépense enregistrée`;
    }

    return hasRecordedCosts
      ? `Fenêtre lue : ${first.label} -> ${last.label}`
      : `Fenêtre lue : ${first.label} -> ${last.label} · aucune dépense enregistrée`;
  }, [recentMonthlyData]);

  const historyByMachine = useMemo(() => {
    const map = new Map<string, { total: number; labor: number; parts: number; count: number }>();

    rows.forEach((row) => {
      const current = map.get(row.machineCode) ?? { total: 0, labor: 0, parts: 0, count: 0 };
      current.total += row.total;
      current.labor += row.mainOeuvre;
      current.parts += row.pieces;
      current.count += 1;
      map.set(row.machineCode, current);
    });

    return map;
  }, [rows]);

  const fleetHistoricalAverage = useMemo(() => {
    if (rows.length === 0) {
      return 0;
    }

    return rows.reduce((sum, row) => sum + row.total, 0) / rows.length;
  }, [rows]);

  const plannedTaskLoadByMonth = useMemo(() => {
    const map = new Map<string, number>();

    taches.forEach((task) => {
      if (!task.datePlanifiee) return;

      const periodKey = task.datePlanifiee.slice(0, 7);
      const machineHistory = historyByMachine.get(task.machineCode);
      const machineAverage =
        machineHistory && machineHistory.count > 0 ? machineHistory.total / machineHistory.count : 0;
      const fallback =
        machineAverage > 0
          ? machineAverage
          : fleetHistoricalAverage > 0
            ? fleetHistoricalAverage
            : TASK_FALLBACK_COST[task.type];
      const estimatedCost =
        typeof task.coutEstime === "number" && task.coutEstime > 0 ? task.coutEstime : fallback;

      map.set(periodKey, (map.get(periodKey) ?? 0) + estimatedCost);
    });

    return map;
  }, [fleetHistoricalAverage, historyByMachine, taches]);

  const liveCostEntries = useMemo(() => {
    return insights
      .map((insight) => {
        const history = historyByMachine.get(insight.machine.id);
        const historicalAverage = history && history.count > 0 ? history.total / history.count : 0;
        const projection = getLiveCostProjection(insight, historicalAverage, fleetHistoricalAverage);

        return {
          insight,
          historicalAverage,
          historicalTotal: history?.total ?? 0,
          laborTotal: history?.labor ?? 0,
          partsTotal: history?.parts ?? 0,
          ...projection,
        };
      })
      .sort((left, right) => right.projectedCost - left.projectedCost);
  }, [fleetHistoricalAverage, historyByMachine, insights]);

  const comparisonData = useMemo(
    () =>
      liveCostEntries.map((entry) => ({
        machine: entry.insight.machine.id,
        history: Math.round(entry.historicalAverage),
        projection: entry.projectedCost,
        delayed: entry.delayedCost,
      })),
    [liveCostEntries],
  );

  const totalHistoricalCost = rows.reduce((sum, row) => sum + row.total, 0);
  const totalLabor = rows.reduce((sum, row) => sum + row.mainOeuvre, 0);
  const totalParts = rows.reduce((sum, row) => sum + row.pieces, 0);
  const projectedBudget = liveCostEntries.reduce((sum, entry) => sum + entry.projectedCost, 0);
  const delayedExposure = liveCostEntries.reduce((sum, entry) => sum + entry.delayPenalty, 0);
  const averageHistoricalTicket = rows.length > 0 ? totalHistoricalCost / rows.length : 0;
  const actionsToReview = liveCostEntries.filter(
    (entry) => entry.insight.urgencyBand === "critical" || entry.insight.urgencyBand === "priority",
  ).length;
  const topProjectedMachine = liveCostEntries[0] ?? null;

  const timelineData = useMemo(() => {
    if (recentMonthlyData.length === 0) {
      return [];
    }

    return recentMonthlyData.map((entry, index) => ({
      ...entry,
      planned: Math.round(plannedTaskLoadByMonth.get(entry.periodKey) ?? 0),
      pipeline: index === recentMonthlyData.length - 1 ? projectedBudget : 0,
    }));
  }, [plannedTaskLoadByMonth, projectedBudget, recentMonthlyData]);

  const historicalContextLabel = useMemo(() => {
    const closedMonths = timelineData.slice(0, -1).filter((entry) => entry.total === 0);
    if (closedMonths.length === 0) {
      return null;
    }

    return closedMonths
      .map((entry) =>
        entry.planned > 0
          ? `${entry.label} : aucune dépense clôturée, mais ${formatCurrency(entry.planned)} d'engagements validés au calendrier`
          : `${entry.label} : aucune dépense enregistrée dans la base pour cette période`,
      )
      .join(" · ");
  }, [timelineData]);

  const openPlanner = (machineCode?: string) => {
    if (isAdmin) {
      const query = machineCode
        ? `/ia?tab=planner&machine=${encodeURIComponent(machineCode)}`
        : "/ia?tab=planner";
      navigate(query);
      return;
    }

    navigate("/maintenance");
  };

  const openDiagnostics = (machineCode: string) => {
    navigate(`/diagnostics?machine=${encodeURIComponent(machineCode)}`, {
      state: location.state,
    });
  };

  const exportCsv = () => {
    const header =
      "Machine,Mois,Année,Main-d'œuvre,Pièces,Total,Moyenne historique,Projection probable,Surcoût si report\n";
    const rowMap = new Map(
      liveCostEntries.map((entry) => [
        entry.insight.machine.id,
        {
          average: Math.round(entry.historicalAverage),
          projection: entry.projectedCost,
          delayPenalty: entry.delayPenalty,
        },
      ]),
    );

    const csv = rows
      .map((row) => {
        const live = rowMap.get(row.machineCode);
        return [
          row.machineCode,
          row.mois,
          row.annee,
          row.mainOeuvre,
          row.pieces,
          row.total,
          live?.average ?? "",
          live?.projection ?? "",
          live?.delayPenalty ?? "",
        ].join(",");
      })
      .join("\n");

    const blob = new Blob([header + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `couts_maintenance_${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Export CSV prêt");
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="section-title">Coûts et budget maintenance</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Cette page relie les dépenses déjà enregistrées aux coûts probables des prochaines actions
            suggérées par le pipeline prédictif.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{historyWindowLabel}</p>
        </div>
        <button
          onClick={exportCsv}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-3 px-4 py-2 text-xs font-semibold text-foreground transition-all hover:bg-border-subtle"
        >
          <Download className="h-3.5 w-3.5" />
          Exporter CSV
        </button>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-premium">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="section-title">Vue budget immédiate</div>
            <p className="mt-1 text-sm text-muted-foreground">
              On compare ici le coût moyen déjà observé, le coût probable de la prochaine action et le
              risque budgétaire si l'on reporte encore la décision.
            </p>
          </div>
          <span className="rounded-full bg-surface-3 px-3 py-1 text-[0.65rem] font-semibold text-muted-foreground">
            {isFetching ? "Mise à jour..." : "Actualisation 5 s"}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="rounded-2xl border border-border bg-surface-3 p-5">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-foreground">Coût moyen vs coût probable</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Gris = coût moyen historique, vert = prochaine action probable, orange = coût si l'on
                reporte encore.
              </p>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={comparisonData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" vertical={false} />
                <XAxis
                  dataKey="machine"
                  tick={{ fill: "hsl(215,12%,55%)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "hsl(215,12%,55%)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value: number) => `${Math.round(value / 1000)}k`}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(220,18%,10%)",
                    border: "1px solid hsl(220,14%,20%)",
                    borderRadius: "8px",
                    fontSize: "11px",
                    color: "hsl(215,12%,55%)",
                  }}
                  formatter={(value: number) => [`${value.toLocaleString("fr-FR")} TND`, ""]}
                />
                <Legend wrapperStyle={{ fontSize: "11px", color: "hsl(215,12%,55%)" }} />
                <Bar dataKey="history" name="Moyenne historique" fill="#94a3b8" radius={4} />
                <Bar dataKey="projection" name="Prochaine action" fill="hsl(var(--primary))" radius={4} />
                <Bar dataKey="delayed" name="Si l'on reporte" fill="#f59e0b" radius={4} opacity={0.75} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-3">
            <div className="rounded-2xl border border-border bg-surface-3 p-5">
              <div className="industrial-label">Projection immédiate</div>
              <div className="mt-3 text-3xl font-bold text-foreground">{formatCurrency(projectedBudget)}</div>
              <p className="mt-2 text-sm leading-relaxed text-secondary-foreground">
                Somme des prochaines actions probables sur la flotte, calculée à partir des signaux live
                et de la base historique disponible.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-border bg-surface-3 p-4">
                <div className="industrial-label">Surcoût du report</div>
                <div className="mt-2 text-xl font-bold text-destructive">+{formatCurrency(delayedExposure)}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Montant supplémentaire si l'on décale encore la prochaine fenêtre
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-surface-3 p-4">
                <div className="industrial-label">Actions à examiner</div>
                <div className="mt-2 text-xl font-bold text-warning">{actionsToReview}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Recommandations prioritaires à valider
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-surface-3 p-4">
                <div className="industrial-label">Machine la plus coûteuse</div>
                <div className="mt-2 text-base font-bold text-foreground">
                  {topProjectedMachine?.insight.machine.id ?? "-"}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {topProjectedMachine
                    ? formatCurrency(topProjectedMachine.projectedCost)
                    : "Aucune donnée exploitable"}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-surface-3 p-4">
                <div className="industrial-label">Coût moyen historique</div>
                <div className="mt-2 text-base font-bold text-foreground">
                  {rows.length > 0 ? formatCurrency(averageHistoricalTicket) : "-"}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Moyenne des coûts déjà enregistrés
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-surface-3 p-4">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" />
                <div className="text-sm font-semibold text-foreground">Prochaine étape</div>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Cette page aide à décider quoi traiter en priorité. On examine ensuite la recommandation,
                puis la tâche validée est suivie dans le calendrier.
              </p>
              <button
                type="button"
                onClick={() => openPlanner()}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground"
              >
                <Brain className="h-3.5 w-3.5" />
                {isAdmin ? "Examiner les recommandations" : "Voir le calendrier"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-6">
        <KpiCard
          icon={<DollarSign className="h-5 w-5" />}
          label="Dépenses enregistrées"
          value={
            <>
              {totalHistoricalCost.toLocaleString("fr-FR")} <span className="text-sm opacity-40">TND</span>
            </>
          }
          sub="Total déjà enregistré"
          variant="blue"
        />
        <KpiCard
          icon={<Wrench className="h-5 w-5" />}
          label="Main-d'œuvre"
          value={
            <>
              {totalLabor.toLocaleString("fr-FR")} <span className="text-sm opacity-40">TND</span>
            </>
          }
          sub="Montant réel enregistré"
          variant="green"
        />
        <KpiCard
          icon={<Package className="h-5 w-5" />}
          label="Pièces"
          value={
            <>
              {totalParts.toLocaleString("fr-FR")} <span className="text-sm opacity-40">TND</span>
            </>
          }
          sub="Montant réel enregistré"
          variant="warn"
        />
        <KpiCard
          icon={<DollarSign className="h-5 w-5" />}
          label="Projection immédiate"
          value={
            <>
              {projectedBudget.toLocaleString("fr-FR")} <span className="text-sm opacity-40">TND</span>
            </>
          }
          sub="Somme des prochaines actions probables"
          variant="blue"
        />
        <KpiCard
          icon={<AlertTriangle className="h-5 w-5" />}
          label="Surcoût du report"
          value={
            <>
              {delayedExposure.toLocaleString("fr-FR")} <span className="text-sm opacity-40">TND</span>
            </>
          }
          sub="Si l'on repousse encore l'action"
          variant="danger"
        />
        <KpiCard
          icon={<CalendarClock className="h-5 w-5" />}
          label="Actions à examiner"
          value={String(actionsToReview)}
          sub="Recommandations prioritaires"
          variant="warn"
        />
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-premium">
        <div className="mb-4">
          <div className="section-title">Machines les plus coûteuses à court terme</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Ces cartes montrent les machines dont la prochaine action probable représente aujourd'hui
            l'engagement budgétaire le plus important.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          {liveCostEntries.slice(0, 3).map((entry) => {
            const tone = getUrgencyTone(entry.insight.urgencyBand);
            return (
              <div
                key={entry.insight.machine.id}
                className={`rounded-2xl border p-4 shadow-sm ${tone.panel}`}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-foreground">{entry.insight.machine.id}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{entry.insight.machine.name}</div>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[0.65rem] font-semibold ${tone.badge}`}>
                    {entry.insight.urgencyLabel}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-card/70 p-2">
                    <div className="text-[0.6rem] uppercase tracking-[0.18em] text-muted-foreground">HI</div>
                    <div className="mt-1 text-sm font-bold text-foreground">
                      {formatHiPercent(entry.insight.machine.hi)}
                    </div>
                  </div>
                  <div className="rounded-xl bg-card/70 p-2">
                    <div className="text-[0.6rem] uppercase tracking-[0.18em] text-muted-foreground">RUL</div>
                    <div className="mt-1 text-sm font-bold text-foreground">
                      {formatPredictiveRul(entry.insight)}
                    </div>
                  </div>
                  <div className="rounded-xl bg-card/70 p-2">
                    <div className="text-[0.6rem] uppercase tracking-[0.18em] text-muted-foreground">Stress</div>
                    <div className="mt-1 text-sm font-bold text-foreground">
                      {formatStressValue(entry.insight.stressValue)}
                    </div>
                  </div>
                  <div className="rounded-xl bg-card/70 p-2">
                    <div className="text-[0.6rem] uppercase tracking-[0.18em] text-muted-foreground">
                      Ajustement risque
                    </div>
                    <div className="mt-1 text-sm font-bold text-foreground">x{entry.multiplier.toFixed(2)}</div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">Coût probable</div>
                  <div className="mt-1 text-lg font-bold text-foreground">
                    {formatCurrency(entry.projectedCost)}
                  </div>
                  <div className="mt-1 text-[0.68rem] text-muted-foreground">
                    {getBaselineSourceLabel(entry.baseSource)}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    +{formatCurrency(entry.delayPenalty)} si l'on reporte encore l'action
                  </div>
                </div>

                <p className="mt-3 text-xs leading-relaxed text-secondary-foreground">
                  {entry.insight.summary}
                </p>

                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => openDiagnostics(entry.insight.machine.id)}
                    className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground transition-all hover:bg-surface-3"
                  >
                    Voir diagnostic
                  </button>
                  <button
                    onClick={() => openPlanner(entry.insight.machine.id)}
                    className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
                  >
                    {isAdmin ? "Examiner la recommandation" : "Voir le calendrier"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-foreground">Du réel au prévisionnel</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Bleu et ocre = dépenses réellement enregistrées. Turquoise = tâches déjà validées dans le
            calendrier. Vert = projection pipeline du mois en cours.
          </p>
          {historicalContextLabel ? (
            <p className="mt-2 text-xs text-muted-foreground">{historicalContextLabel}</p>
          ) : null}
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={timelineData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "hsl(215,12%,55%)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "hsl(215,12%,55%)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: "hsl(220,18%,10%)",
                border: "1px solid hsl(220,14%,20%)",
                borderRadius: "8px",
                fontSize: "11px",
                color: "hsl(215,12%,55%)",
              }}
              formatter={(value: number) => [`${value.toLocaleString("fr-FR")} TND`, ""]}
            />
            <Legend wrapperStyle={{ fontSize: "11px", color: "hsl(215,12%,55%)" }} />
            <Bar dataKey="labor" name="Main-d'œuvre" fill="#4b8b9b" radius={4} />
            <Bar dataKey="parts" name="Pièces" fill="#d4915a" radius={4} />
            <Bar dataKey="planned" name="Tâches validées" fill="#14b8a6" radius={4} />
            <Bar dataKey="pipeline" name="Projection pipeline" fill="hsl(var(--primary))" radius={4} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
