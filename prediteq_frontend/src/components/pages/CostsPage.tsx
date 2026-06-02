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
  Wrench,
} from "lucide-react";

import { KpiCard } from "@/components/industrial/KpiCard";
import { useAuth } from "@/contexts/AuthContext";
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

function getBaseExplanation(source: string) {
  switch (source) {
    case "local_scale":
      return "Barème simple de maintenance locale";
    default:
      return "Forfait simple selon le type d'action";
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
  const { machines } = useMachines(currentUser?.machineId);
  const { insights, isFetching } = useFleetPredictiveInsights(machines);
  const inspectionReference = getTaskCostReference("inspection");
  const preventiveReference = getTaskCostReference("preventive");
  const correctiveReference = getTaskCostReference("corrective");

  const liveCostEntries = useMemo(() => {
    return insights
      .map((insight) => ({
        insight,
        ...getLiveCostProjection(insight, 0, 0),
      }))
      .sort((left, right) => {
        const urgencyDelta = right.insight.urgencyScore - left.insight.urgencyScore;
        if (urgencyDelta !== 0) return urgencyDelta;
        return right.projectedCost - left.projectedCost;
      });
  }, [insights]);

  const actionableCostEntries = useMemo(
    () => liveCostEntries.filter((entry) => entry.insight.urgencyBand !== "stable"),
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

  const projectedBudget = budgetFocusEntries.reduce((sum, entry) => sum + entry.projectedCost, 0);
  const delayedExposure = budgetFocusEntries.reduce((sum, entry) => sum + entry.delayPenalty, 0);
  const routineProjectionBudget = routineCostEntries.reduce((sum, entry) => sum + entry.projectedCost, 0);
  const hasActionableBudgetCases = actionableCostEntries.length > 0;
  const shownMachineCount = budgetFocusEntries.length;
  const topProjectedMachine = budgetFocusEntries[0] ?? null;

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

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-premium">
        <div className="section-title">Prochaine intervention de maintenance</div>
        <p className="mt-1 text-sm text-muted-foreground">
          Cette page estime seulement le cout de la prochaine action utile par machine.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Elle ne montre ni le prix du moteur ni un cumul comptable sur plusieurs mois.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Bareme simple PrediTeq pour un stockeur vertical en Tunisie : inspection {formatCurrency(inspectionReference.totalCost)},
          preventif {formatCurrency(preventiveReference.totalCost)}, correctif cible {formatCurrency(correctiveReference.totalCost)}.
        </p>
      </div>

      {routineCostEntries.length > 0 && hasActionableBudgetCases ? (
        <div className="rounded-xl border border-border bg-surface-3 px-4 py-3 text-sm text-muted-foreground">
          {routineCostEntries.length} machine{routineCostEntries.length > 1 ? "s" : ""} stable
          {routineCostEntries.length > 1 ? "s restent" : " reste"} visible
          {routineCostEntries.length > 1 ? "s" : ""} en entretien courant (
          {formatCurrency(routineProjectionBudget)}), sans passer devant les cas prioritaires.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={<DollarSign className="h-5 w-5" />}
          label={hasActionableBudgetCases ? "Budget a prevoir maintenant" : "Budget d'entretien courant"}
          value={<>{formatCurrency(projectedBudget)}</>}
          sub={
            hasActionableBudgetCases
              ? "Somme des prochaines interventions des machines a traiter"
              : "Somme des prochaines interventions actuellement lues"
          }
          variant="blue"
        />
        <KpiCard
          icon={<CalendarClock className="h-5 w-5" />}
          label="Supplement si on attend"
          value={<>{`+${formatCurrency(delayedExposure)}`}</>}
          sub="Surcout estime si la prochaine fenetre est encore repoussee"
          variant="warn"
        />
        <KpiCard
          icon={<Wrench className="h-5 w-5" />}
          label={hasActionableBudgetCases ? "Machines concernees" : "Machines lues"}
          value={String(shownMachineCount)}
          sub={
            hasActionableBudgetCases
              ? "Machines non stables retenues dans cette lecture"
              : "Machines visibles dans cette lecture"
          }
          variant="green"
        />
        <KpiCard
          icon={<Brain className="h-5 w-5" />}
          label="Bareme simple"
          value={<>{`${formatCurrency(inspectionReference.totalCost)} a ${formatCurrency(correctiveReference.totalCost)}`}</>}
          sub="Inspection, preventif ou correctif cible"
          variant="blue"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-premium">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-foreground">Prochaine intervention par machine</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Vert = estimation si l'on intervient maintenant. Orange = supplement si l'on attend encore.
            </p>
          </div>

          {projectionComparisonData.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
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
                <Bar dataKey="projection" name="Intervenir maintenant" fill="hsl(var(--primary))" radius={4} />
                <Bar dataKey="penalty" name="Supplement si report" fill="#f59e0b" radius={4} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="rounded-xl border border-border bg-surface-3 px-4 py-6 text-sm text-muted-foreground">
              Aucune estimation exploitable n'est encore disponible pour les machines lues.
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-premium">
            <div className="industrial-label">Machine la plus couteuse maintenant</div>
            <div className="mt-3 text-2xl font-bold text-foreground">
              {topProjectedMachine ? getMachinePublicLabel(topProjectedMachine.insight.machine) : "-"}
            </div>
            <p className="mt-2 text-sm leading-relaxed text-secondary-foreground">
              {topProjectedMachine
                ? `${formatCurrency(topProjectedMachine.projectedCost)} a prevoir maintenant, puis +${formatCurrency(topProjectedMachine.delayPenalty)} si l'on repousse encore.`
                : "Aucune machine n'est encore exploitable pour cette lecture."}
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-premium">
            <div className="industrial-label">Comment lire cette page</div>
            <div className="mt-3 space-y-2 text-sm text-muted-foreground">
              <p>1. On lit une machine.</p>
              <p>2. On regarde la prochaine intervention utile, pas un achat moteur.</p>
              <p>3. On compare le cout si l'on agit maintenant avec le supplement si l'on attend.</p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-premium">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              <div className="text-sm font-semibold text-foreground">Etape suivante</div>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Confirmer l'action utile sur la machine concernée, puis l'envoyer vers le calendrier.
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
              ? "Les machines non stables apparaissent ici en premier, avec une estimation simple de la prochaine intervention."
              : "Les machines visibles sont stables pour l'instant, avec leur entretien courant estime."}
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
                    {costReference.label} - {getBaseExplanation(entry.baseSource)}
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
                  {compactText(entry.insight.plainReason || entry.insight.recommendedAction, 120)}
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
              Ces machines restent visibles avec un entretien courant estime, sans passer devant les urgences.
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
                      {costReference.label} - {getBaseExplanation(entry.baseSource)}
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
