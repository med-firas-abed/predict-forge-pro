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
import { useMachines } from "@/hooks/useMachines";
import {
  getTaskCostReference,
} from "@/lib/costModel";
import {
  getMachinePublicLabel,
  replaceMachineCodesForDisplay,
} from "@/lib/machinePresentation";
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

function getBaseExplanation(source: string) {
  switch (source) {
    case "local_scale":
      return "Base de calcul : barème simple de maintenance locale";
    default:
      return "Base de calcul : forfait simple selon le type d'action";
  }
}

function compactText(value: string | null | undefined, maxLength = 120) {
  const normalized = replaceMachineCodesForDisplay((value ?? "").replace(/\s+/g, " ").trim());
  if (!normalized) return null;
  if (normalized.length <= maxLength) return normalized;

  const sentenceCutoff = normalized.lastIndexOf(". ", maxLength);
  if (sentenceCutoff >= Math.floor(maxLength * 0.55)) {
    return normalized.slice(0, sentenceCutoff + 1);
  }

  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

export function CostsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === "admin";
  const { couts: rows } = useCouts(currentUser?.machineId);
  const { machines } = useMachines(currentUser?.machineId);
  const { insights, isFetching } = useFleetPredictiveInsights(machines);
  const inspectionReference = getTaskCostReference("inspection");
  const preventiveReference = getTaskCostReference("preventive");
  const correctiveReference = getTaskCostReference("corrective");

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

  const displayedMonthlyData = useMemo(() => monthlyData.slice(-6), [monthlyData]);

  const historyWindowLabel = useMemo(() => {
    if (displayedMonthlyData.length === 0) {
      return "Aucun cout reel n'est encore enregistre dans la base.";
    }

    const first = displayedMonthlyData[0];
    const last = displayedMonthlyData[displayedMonthlyData.length - 1];
    if (first.periodKey === last.periodKey) {
      return `Historique charge : ${first.label}`;
    }

    return `Historique charge : ${first.label} -> ${last.label}`;
  }, [displayedMonthlyData]);

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

  const machineHistoryRows = useMemo(
    () =>
      Array.from(historyByMachine.entries())
        .map(([machineCode, history]) => ({
          machineCode,
          ...history,
          averageMonthly: history.count > 0 ? history.total / history.count : 0,
        }))
        .sort((left, right) => {
          const averageDelta = right.averageMonthly - left.averageMonthly;
          if (averageDelta !== 0) return averageDelta;
          return right.total - left.total;
        }),
    [historyByMachine],
  );

  const fleetHistoricalAverage = useMemo(() => {
    if (rows.length === 0) {
      return 0;
    }

    return rows.reduce((sum, row) => sum + row.total, 0) / rows.length;
  }, [rows]);

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

  const actionableCostEntries = useMemo(
    () =>
      liveCostEntries
        .filter((entry) => entry.insight.urgencyBand !== "stable")
        .sort((left, right) => {
          const urgencyDelta = right.insight.urgencyScore - left.insight.urgencyScore;
          if (urgencyDelta !== 0) return urgencyDelta;
          return right.projectedCost - left.projectedCost;
        }),
    [liveCostEntries],
  );

  const routineCostEntries = useMemo(
    () => liveCostEntries.filter((entry) => entry.insight.urgencyBand === "stable"),
    [liveCostEntries],
  );

  const budgetFocusEntries = actionableCostEntries.length > 0 ? actionableCostEntries : liveCostEntries;

  const projectionComparisonData = useMemo(
    () =>
      budgetFocusEntries.map((entry) => ({
        machine: getMachinePublicLabel(entry.insight.machine),
        projection: entry.projectedCost,
        penalty: entry.delayPenalty,
      })),
    [budgetFocusEntries],
  );

  const totalHistoricalCost = rows.reduce((sum, row) => sum + row.total, 0);
  const totalLabor = rows.reduce((sum, row) => sum + row.mainOeuvre, 0);
  const totalParts = rows.reduce((sum, row) => sum + row.pieces, 0);
  const loadedPeriods = monthlyData.length;
  const latestRecordedPeriod = monthlyData[monthlyData.length - 1] ?? null;
  const averageMonthlyTotal = loadedPeriods > 0 ? totalHistoricalCost / loadedPeriods : 0;
  const averageMonthlyLabor = loadedPeriods > 0 ? totalLabor / loadedPeriods : 0;
  const averageMonthlyParts = loadedPeriods > 0 ? totalParts / loadedPeriods : 0;
  const projectedBudget = budgetFocusEntries.reduce((sum, entry) => sum + entry.projectedCost, 0);
  const delayedExposure = budgetFocusEntries.reduce((sum, entry) => sum + entry.delayPenalty, 0);
  const routineProjectionBudget = routineCostEntries.reduce((sum, entry) => sum + entry.projectedCost, 0);
  const hasActionableBudgetCases = actionableCostEntries.length > 0;
  const actionsToReview = actionableCostEntries.length;
  const topProjectedMachine = budgetFocusEntries[0] ?? null;
  const shownMachineCount = hasActionableBudgetCases ? actionsToReview : budgetFocusEntries.length;

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
      "Machine,Mois,Annee,Main-d'oeuvre,Pieces,Total,Total historique machine,Base de calcul,Projection prochaine action,Surcout si report\n";
    const rowMap = new Map(
      liveCostEntries.map((entry) => [
        entry.insight.machine.id,
        {
          historicalTotal: Math.round(entry.historicalTotal),
          baseLabel: getBaseExplanation(entry.baseSource),
          projection: entry.projectedCost,
          delayPenalty: entry.delayPenalty,
        },
      ]),
    );

    const csv = rows
      .map((row) => {
        const live = rowMap.get(row.machineCode);
        return [
          getMachinePublicLabel(row.machineCode),
          row.mois,
          row.annee,
          row.mainOeuvre,
          row.pieces,
          row.total,
          live?.historicalTotal ?? "",
          live?.baseLabel ?? "",
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
    toast.success("Export CSV pret");
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="section-title">Lecture simple des couts maintenance</div>
          <p className="mt-1 text-sm text-muted-foreground">
            La page separe les couts reels deja saisis et le budget simple de la prochaine intervention.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Le haut de page se lit par mois. Le bas de page estime une intervention de maintenance,
            pas un achat ni un remplacement complet du moteur.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Graphe historique : 6 derniers mois saisis. {historyWindowLabel}
          </p>
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
        <div className="mb-4">
          <div className="section-title">Historique enregistre</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Montants reels deja saisis dans la base, lus mois par mois.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            icon={<DollarSign className="h-5 w-5" />}
            label="Dernier mois saisi"
            value={
              <>
                {formatCurrency(latestRecordedPeriod?.total ?? 0)}
              </>
            }
            sub={latestRecordedPeriod ? latestRecordedPeriod.label : "Aucun mois saisi"}
            variant="blue"
          />
          <KpiCard
            icon={<Wrench className="h-5 w-5" />}
            label="Moyenne mensuelle"
            value={
              <>
                {formatCurrency(averageMonthlyTotal)}
              </>
            }
            sub={loadedPeriods > 0 ? `${loadedPeriods} mois charges` : "Aucune periode chargee"}
            variant="green"
          />
          <KpiCard
            icon={<Package className="h-5 w-5" />}
            label="Main-d'oeuvre moyenne"
            value={
              <>
                {formatCurrency(averageMonthlyLabor)}
              </>
            }
            sub={`Pieces moyennes : ${formatCurrency(averageMonthlyParts)}`}
            variant="warn"
          />
          <KpiCard
            icon={<CalendarClock className="h-5 w-5" />}
            label="Machines avec historique"
            value={String(machineHistoryRows.length)}
            sub={`Cumul charge : ${formatCurrency(totalHistoricalCost)}`}
            variant="blue"
          />
        </div>

        <div className="mt-4 rounded-xl border border-border bg-surface-3 px-4 py-3 text-sm text-muted-foreground">
          Une ligne de cout correspond a un cumul mensuel par machine. Le cumul charge additionne plusieurs
          mois et plusieurs machines : ce n'est pas le prix d'un moteur.
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="rounded-2xl border border-border bg-surface-3 p-5">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-foreground">6 derniers mois saisis</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Main-d'oeuvre et pieces deja saisies dans l'historique reel.
              </p>
            </div>

            {displayedMonthlyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={displayedMonthlyData}>
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
                  <Bar dataKey="labor" name="Main-d'oeuvre" fill="#4b8b9b" radius={4} stackId="history" />
                  <Bar dataKey="parts" name="Pieces" fill="#d4915a" radius={4} stackId="history" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="rounded-xl border border-border bg-card/70 px-4 py-6 text-sm text-muted-foreground">
                Aucun cout reel n'est encore disponible pour alimenter ce graphique.
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-surface-3 p-5">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-foreground">Lecture par machine</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Moyenne mensuelle observee pour chaque machine ayant un historique.
              </p>
            </div>

            {machineHistoryRows.length > 0 ? (
              <div className="space-y-3">
                {machineHistoryRows.slice(0, 4).map((entry) => (
                  <div
                    key={entry.machineCode}
                    className="rounded-xl border border-border bg-card/70 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-sm font-semibold text-foreground">
                        {getMachinePublicLabel(entry.machineCode)}
                      </div>
                      <span className="rounded-full bg-surface-3 px-2.5 py-1 text-[0.65rem] font-semibold text-muted-foreground">
                        {entry.count} mois
                      </span>
                    </div>
                    <div className="mt-2 text-lg font-bold text-foreground">
                      {formatCurrency(entry.averageMonthly)}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Moyenne mensuelle
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Cumul charge : {formatCurrency(entry.total)} / Main-d'oeuvre : {formatCurrency(entry.labor)} /
                      Pieces : {formatCurrency(entry.parts)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card/70 px-4 py-6 text-sm text-muted-foreground">
                Aucune machine ne dispose encore d'un historique charge.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-premium">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="section-title">Budget simple de la prochaine intervention</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Chaque montant ci-dessous correspond a une action de maintenance simple a prevoir sur la machine.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Bareme simple PrediTeq pour un stockeur vertical en Tunisie : inspection {formatCurrency(inspectionReference.totalCost)},
              preventif {formatCurrency(preventiveReference.totalCost)}, correctif {formatCurrency(correctiveReference.totalCost)}.
            </p>
          </div>
          <span className="rounded-full bg-surface-3 px-3 py-1 text-[0.65rem] font-semibold text-muted-foreground">
            {isFetching ? "Mise a jour..." : "Actualisation 5 s"}
          </span>
        </div>

        {routineCostEntries.length > 0 && hasActionableBudgetCases ? (
          <div className="mb-4 rounded-xl border border-border bg-surface-3 px-4 py-3 text-sm text-muted-foreground">
            {routineCostEntries.length} machine{routineCostEntries.length > 1 ? "s" : ""} stable
            {routineCostEntries.length > 1 ? "s restent" : " reste"} en entretien courant (
            {formatCurrency(routineProjectionBudget)}). Elles restent visibles plus bas, sans passer devant les urgences.
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="rounded-2xl border border-border bg-surface-3 p-5">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-foreground">Prochaine intervention par machine</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Vert = estimation maintenant. Orange = supplement si l'on repousse encore.
              </p>
            </div>

            {projectionComparisonData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={projectionComparisonData}>
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
                    tickFormatter={(value: number) => `${Math.round(value)}`}
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
                  <Bar dataKey="projection" name="Prochaine action" fill="hsl(var(--primary))" radius={4} />
                  <Bar dataKey="penalty" name="Surcout si report" fill="#f59e0b" radius={4} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="rounded-xl border border-border bg-card/70 px-4 py-6 text-sm text-muted-foreground">
                Aucune projection n'est encore disponible pour la flotte.
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="rounded-2xl border border-border bg-surface-3 p-5">
              <div className="industrial-label">
                {hasActionableBudgetCases ? "Budget a prevoir maintenant" : "Budget d'entretien courant"}
              </div>
              <div className="mt-3 text-3xl font-bold text-foreground">{formatCurrency(projectedBudget)}</div>
              <p className="mt-2 text-sm leading-relaxed text-secondary-foreground">
                {hasActionableBudgetCases
                  ? "Somme des prochaines interventions des machines a traiter en premier."
                  : "Somme des prochaines interventions des machines stables affichees."}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-border bg-surface-3 p-4">
                <div className="industrial-label">Supplement si on attend</div>
                <div className="mt-2 text-xl font-bold text-destructive">+{formatCurrency(delayedExposure)}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Cout supplementaire estime si la prochaine fenetre de maintenance est encore repoussee
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-surface-3 p-4">
                <div className="industrial-label">
                  {hasActionableBudgetCases ? "Machines concernees" : "Machines lues"}
                </div>
                <div className="mt-2 text-xl font-bold text-warning">{shownMachineCount}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {hasActionableBudgetCases ? "Machines non stables retenues dans ce budget" : "Machines affichees dans cette lecture"}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-surface-3 p-4">
                <div className="industrial-label">Machine la plus couteuse</div>
                <div className="mt-2 text-base font-bold text-foreground">
                  {topProjectedMachine ? getMachinePublicLabel(topProjectedMachine.insight.machine) : "-"}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {topProjectedMachine ? formatCurrency(topProjectedMachine.projectedCost) : "Aucune donnee exploitable"}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-surface-3 p-4">
                <div className="industrial-label">Bareme simple</div>
                <div className="mt-2 text-base font-bold text-foreground">
                  {formatCurrency(inspectionReference.totalCost)} a {formatCurrency(correctiveReference.totalCost)}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Inspection {formatCurrency(inspectionReference.totalCost)} / Preventif {formatCurrency(preventiveReference.totalCost)} /
                  Correctif {formatCurrency(correctiveReference.totalCost)}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-surface-3 p-4">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" />
                <div className="text-sm font-semibold text-foreground">Etape suivante</div>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Confirmer l'action utile, puis l'envoyer vers le calendrier de maintenance.
              </p>
              <button
                type="button"
                onClick={() => openPlanner()}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground"
              >
                <Brain className="h-3.5 w-3.5" />
                {isAdmin ? "Ouvrir le plan d'action" : "Voir le calendrier"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div
        data-testid="budget-action-section"
        className="rounded-2xl border border-border bg-card p-5 shadow-premium"
      >
          <div className="mb-4">
            <div className="section-title">
              {hasActionableBudgetCases ? "Machines a traiter maintenant" : "Machines lues"}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {hasActionableBudgetCases
                ? "Les machines non stables apparaissent ici en premier, avec une estimation simple de maintenance."
                : "Toutes les machines lues sont stables pour l'instant."}
            </p>
          </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          {budgetFocusEntries.slice(0, 3).map((entry) => {
            const tone = getUrgencyTone(entry.insight.urgencyBand);
            const costReference = getTaskCostReference(entry.insight.taskTemplate.type);
            return (
              <div
                key={entry.insight.machine.id}
                className={`rounded-2xl border p-4 shadow-sm ${tone.panel}`}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-foreground">
                      {getMachinePublicLabel(entry.insight.machine)}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {entry.insight.machine.city || entry.insight.machine.loc}
                    </div>
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
                    <div className="text-[0.6rem] uppercase tracking-[0.18em] text-muted-foreground">Fenetre</div>
                    <div className="mt-1 text-sm font-bold text-foreground">
                      {entry.insight.maintenanceWindow ?? "A confirmer"}
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
                    Prochaine intervention
                  </div>
                  <div className="mt-1 text-lg font-bold text-foreground">
                    {formatCurrency(entry.projectedCost)}
                  </div>
                  <div className="mt-1 text-[0.68rem] text-muted-foreground">
                    {getBaseExplanation(entry.baseSource)}
                  </div>
                  <div className="mt-1 text-[0.68rem] text-muted-foreground">
                    Bareme local : {costReference.laborHours} h x {costReference.laborRate} DT +{" "}
                    {Math.round(costReference.partsCost).toLocaleString("fr-FR")} DT pieces
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    +{formatCurrency(entry.delayPenalty)} si l'on attend encore
                  </div>
                </div>

                <p className="mt-3 text-xs leading-relaxed text-secondary-foreground">
                  {compactText(entry.insight.plainReason, 120)}
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
                    {isAdmin ? "Ouvrir le plan d'action" : "Voir le calendrier"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {routineCostEntries.length > 0 && hasActionableBudgetCases ? (
        <div
          data-testid="budget-routine-section"
          className="rounded-2xl border border-border bg-card p-5 shadow-premium"
        >
          <div className="mb-4">
            <div className="section-title">Machines stables</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Les machines stables restent visibles avec un cout d'entretien simple, sans passer devant les cas urgents.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
            {routineCostEntries.slice(0, 3).map((entry) => {
              const tone = getUrgencyTone(entry.insight.urgencyBand);
              const costReference = getTaskCostReference(entry.insight.taskTemplate.type);

              return (
                <div
                  key={entry.insight.machine.id}
                  className={`rounded-2xl border p-4 shadow-sm ${tone.panel}`}
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-foreground">
                        {getMachinePublicLabel(entry.insight.machine)}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {entry.insight.machine.city || entry.insight.machine.loc}
                      </div>
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
                  </div>

                  <div className="mt-4">
                    <div className="text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
                      Entretien courant estime
                    </div>
                    <div className="mt-1 text-lg font-bold text-foreground">
                      {formatCurrency(entry.projectedCost)}
                    </div>
                    <div className="mt-1 text-[0.68rem] text-muted-foreground">
                      {getBaseExplanation(entry.baseSource)}
                    </div>
                    <div className="mt-1 text-[0.68rem] text-muted-foreground">
                      Bareme local : {costReference.laborHours} h x {costReference.laborRate} DT +{" "}
                      {Math.round(costReference.partsCost).toLocaleString("fr-FR")} DT pieces
                    </div>
                  </div>

                  <p className="mt-3 text-xs leading-relaxed text-secondary-foreground">
                    {compactText(entry.insight.recommendedAction, 110)}
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
                      {isAdmin ? "Ouvrir le plan d'action" : "Voir le calendrier"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
