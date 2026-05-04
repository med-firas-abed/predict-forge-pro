import { useMemo, useState } from "react";
import { ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";
import { useAlertes } from "@/hooks/useAlertes";
import { useAlertEmailHistory } from "@/hooks/useAlertEmailHistory";
import { useFleetPredictiveInsights } from "@/hooks/useFleetPredictiveInsights";
import { useMachines } from "@/hooks/useMachines";
import {
  formatHiPercent,
  formatPredictiveRul,
  formatStressValue,
} from "@/lib/predictiveLive";
import {
  groupAlertes,
  type AlertSeverity as AlertLevel,
  type GroupedAlert,
} from "@/lib/alertsSummary";

type AlertSeverityFilter = "all" | AlertLevel;

type MachineActionRow = {
  machineId: string;
  machineName: string;
  latestTimestamp: string;
  highestSeverity: AlertLevel;
  activeSignals: GroupedAlert[];
  openIds: string[];
  openSignalCount: number;
  historicalEchoCount: number;
};

const SEVERITY_ORDER: Record<AlertLevel, number> = {
  urgence: 3,
  surveillance: 2,
  info: 1,
};

function formatAlertTimestamp(value: string) {
  const timestamp = new Date(value);
  return `${timestamp.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  })}, ${timestamp.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function compareSeverity(left: AlertLevel, right: AlertLevel) {
  return SEVERITY_ORDER[right] - SEVERITY_ORDER[left];
}

function sortSignals(left: GroupedAlert, right: GroupedAlert) {
  const severityDelta = compareSeverity(left.severity, right.severity);
  if (severityDelta !== 0) return severityDelta;
  return right.latestTimestamp.localeCompare(left.latestTimestamp);
}

function getSeverityMeta(severity: AlertLevel) {
  if (severity === "urgence") {
    return {
      label: "Controle prioritaire",
      shortLabel: "Critique",
      panelClass: "border-destructive/25 bg-destructive/5",
      badgeClass: "bg-destructive/10 text-destructive",
      lineClass: "border-destructive/30 bg-destructive/5",
    };
  }

  if (severity === "surveillance") {
    return {
      label: "Sous surveillance",
      shortLabel: "Surveillance",
      panelClass: "border-warning/25 bg-warning/5",
      badgeClass: "bg-warning/10 text-warning",
      lineClass: "border-warning/30 bg-warning/5",
    };
  }

  return {
    label: "Information terrain",
    shortLabel: "Info",
    panelClass: "border-primary/25 bg-primary/5",
    badgeClass: "bg-primary/10 text-primary",
    lineClass: "border-primary/30 bg-primary/5",
  };
}

export function AlertsPage() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { machines } = useMachines(currentUser?.machineId);
  const { alertes, acquitterAlertes } = useAlertes(currentUser?.machineId);
  const { emailHistory } = useAlertEmailHistory(currentUser?.machineId);
  const { insights, byMachineId } = useFleetPredictiveInsights(machines);
  const [severityFilter, setSeverityFilter] = useState<AlertSeverityFilter>("all");
  const [machineFilter, setMachineFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [expandedMachines, setExpandedMachines] = useState<Record<string, boolean>>({});

  const filteredAlertes = useMemo(() => {
    return alertes.filter((alert) => {
      const machineId = alert.machineCode || alert.machineId;

      if (severityFilter !== "all" && alert.severite !== severityFilter) return false;
      if (machineFilter !== "all" && machineId !== machineFilter) return false;

      const createdAt = new Date(alert.createdAt);
      if (startDate && createdAt < new Date(`${startDate}T00:00:00`)) return false;
      if (endDate && createdAt > new Date(`${endDate}T23:59:59.999`)) return false;
      return true;
    });
  }, [alertes, endDate, machineFilter, severityFilter, startDate]);

  const groupedAlerts = useMemo(() => groupAlertes(filteredAlertes), [filteredAlertes]);

  const activeSignals = useMemo(
    () => groupedAlerts.filter((entry) => entry.openCount > 0).sort(sortSignals),
    [groupedAlerts],
  );

  const historySignals = useMemo(
    () => groupedAlerts.filter((entry) => entry.openCount === 0).sort(sortSignals),
    [groupedAlerts],
  );

  const rankedInsights = useMemo(
    () => [...insights].sort((left, right) => right.urgencyScore - left.urgencyScore),
    [insights],
  );

  const machineRows = useMemo(() => {
    const machineNameById = new Map(machines.map((machine) => [machine.id, machine.name]));
    const rows = new Map<string, MachineActionRow>();

    activeSignals.forEach((signal) => {
      const current = rows.get(signal.machineId) ?? {
        machineId: signal.machineId,
        machineName: machineNameById.get(signal.machineId) ?? signal.machineId,
        latestTimestamp: signal.latestTimestamp,
        highestSeverity: signal.severity,
        activeSignals: [],
        openIds: [],
        openSignalCount: 0,
        historicalEchoCount: 0,
      };

      current.activeSignals.push(signal);
      current.openIds.push(...signal.openIds);
      current.openSignalCount += 1;
      current.historicalEchoCount += Math.max(0, signal.count - signal.openCount);

      if (signal.latestTimestamp > current.latestTimestamp) {
        current.latestTimestamp = signal.latestTimestamp;
      }

      if (SEVERITY_ORDER[signal.severity] > SEVERITY_ORDER[current.highestSeverity]) {
        current.highestSeverity = signal.severity;
      }

      rows.set(signal.machineId, current);
    });

    return [...rows.values()]
      .map((row) => ({
        ...row,
        activeSignals: [...row.activeSignals].sort(sortSignals),
        openIds: Array.from(new Set(row.openIds)),
      }))
      .sort((left, right) => {
        const rightInsight = byMachineId[right.machineId];
        const leftInsight = byMachineId[left.machineId];
        const rightScore = rightInsight?.urgencyScore ?? 0;
        const leftScore = leftInsight?.urgencyScore ?? 0;
        if (rightScore !== leftScore) return rightScore - leftScore;
        return right.latestTimestamp.localeCompare(left.latestTimestamp);
      });
  }, [activeSignals, byMachineId, machines]);

  const historyByMachine = useMemo(() => {
    const machineNameById = new Map(machines.map((machine) => [machine.id, machine.name]));
    const grouped = new Map<
      string,
      {
        machineId: string;
        machineName: string;
        latestTimestamp: string;
        entries: GroupedAlert[];
        count: number;
      }
    >();

    historySignals.forEach((signal) => {
      const current = grouped.get(signal.machineId) ?? {
        machineId: signal.machineId,
        machineName: machineNameById.get(signal.machineId) ?? signal.machineId,
        latestTimestamp: signal.latestTimestamp,
        entries: [],
        count: 0,
      };

      current.entries.push(signal);
      current.count += signal.count;
      if (signal.latestTimestamp > current.latestTimestamp) {
        current.latestTimestamp = signal.latestTimestamp;
      }

      grouped.set(signal.machineId, current);
    });

    return [...grouped.values()].sort((left, right) => right.latestTimestamp.localeCompare(left.latestTimestamp));
  }, [historySignals, machines]);

  const activeMachineCount = machineRows.length;
  const activeSignalCount = activeSignals.length;
  const filteredEmailHistory = useMemo(() => {
    return emailHistory.filter((entry) => {
      if (machineFilter !== "all" && entry.machineId !== machineFilter) return false;
      const createdAt = new Date(entry.createdAt);
      if (startDate && createdAt < new Date(`${startDate}T00:00:00`)) return false;
      if (endDate && createdAt > new Date(`${endDate}T23:59:59.999`)) return false;
      return true;
    });
  }, [emailHistory, endDate, machineFilter, startDate]);
  const visibleEmailHistory = filteredEmailHistory.slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="section-title">Centre d'alertes</div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-premium">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="section-title">Machines a traiter maintenant</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Une ligne = une machine. Les signaux encore ouverts restent disponibles a la demande.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-surface-3 px-3 py-1 text-[0.68rem] font-semibold text-foreground">
              {activeMachineCount} cas actif{activeMachineCount > 1 ? "s" : ""}
            </span>
            <span className="rounded-full bg-surface-3 px-3 py-1 text-[0.68rem] font-semibold text-muted-foreground">
              {activeSignalCount} signal{activeSignalCount > 1 ? "aux" : ""} ouvert{activeSignalCount > 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {machineRows.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface-3 px-4 py-4 text-sm text-muted-foreground">
            Aucun cas actif ne ressort avec les filtres courants.
          </div>
        ) : (
          <div className="space-y-4">
            {machineRows.map((row) => {
              const insight = byMachineId[row.machineId];
              const severity = getSeverityMeta(row.highestSeverity);
              const leadSignal = row.activeSignals[0];
              const isExpanded = Boolean(expandedMachines[row.machineId]);

              return (
                <div
                  key={row.machineId}
                  className={`rounded-2xl border p-5 shadow-sm ${severity.panelClass}`}
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-bold text-foreground">{row.machineId}</span>
                        <span className={`rounded-full px-2.5 py-1 text-[0.65rem] font-semibold ${severity.badgeClass}`}>
                          {severity.label}
                        </span>
                        <span className="rounded-full bg-card/80 px-2.5 py-1 text-[0.65rem] font-semibold text-muted-foreground">
                          {row.openSignalCount} signal{row.openSignalCount > 1 ? "aux" : ""} actif{row.openSignalCount > 1 ? "s" : ""}
                        </span>
                        <span className="text-[0.7rem] text-muted-foreground">
                          {formatAlertTimestamp(row.latestTimestamp)}
                        </span>
                      </div>

                      <div className="mt-1 text-sm text-muted-foreground">{row.machineName}</div>

                      {insight ? (
                        <div className="mt-3 flex flex-wrap gap-2 text-[0.72rem]">
                          <span className="rounded-full bg-card/80 px-2.5 py-1 text-foreground">
                            HI {formatHiPercent(insight.machine.hi)}
                          </span>
                          <span className="rounded-full bg-card/80 px-2.5 py-1 text-foreground">
                            RUL {formatPredictiveRul(insight)}
                          </span>
                          <span className="rounded-full bg-card/80 px-2.5 py-1 text-foreground">
                            Stress {formatStressValue(insight.stressValue)}
                          </span>
                          <span className="rounded-full bg-card/80 px-2.5 py-1 text-foreground">
                            {insight.maintenanceWindow ?? "Fenetre a confirmer"}
                          </span>
                        </div>
                      ) : null}

                      <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-[1.1fr_0.9fr]">
                        <div className="rounded-xl border border-border bg-card/80 p-4">
                          <div className="industrial-label">Pourquoi maintenant</div>
                          <div className="mt-2 text-sm font-semibold text-foreground">
                            {leadSignal?.title ?? "Signal a confirmer"}
                          </div>
                          <p className="mt-2 text-sm leading-relaxed text-secondary-foreground">
                            {insight?.plainReason ?? leadSignal?.message ?? "Le systeme demande une verification terrain."}
                          </p>
                        </div>

                        <div className="rounded-xl border border-border bg-card/80 p-4">
                          <div className="industrial-label">Action recommandee</div>
                          <div className="mt-2 text-sm font-semibold text-foreground">
                            {insight?.recommendedAction ?? "Verifier la machine avant reprise en charge normale."}
                          </div>
                          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                            {insight?.summary ?? "Le detail technique reste accessible dans le diagnostic de la machine."}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex w-full flex-col gap-2 xl:w-[220px] xl:min-w-[220px]">
                      <button
                        onClick={() => navigate(`/diagnostics?machine=${encodeURIComponent(row.machineId)}`)}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-3.5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                      >
                        Voir diagnostic
                        <ArrowRight className="h-4 w-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setExpandedMachines((current) => ({
                            ...current,
                            [row.machineId]: !current[row.machineId],
                          }))
                        }
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card/80 px-3.5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-surface-3"
                      >
                        {isExpanded ? "Masquer les signaux" : `Voir les signaux actifs (${row.openSignalCount})`}
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {isExpanded ? (
                    <div className="mt-4 rounded-xl border border-border bg-card/70 p-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="industrial-label">Signaux actifs</div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Les repetitions similaires restent regroupees pour garder une lecture claire.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => acquitterAlertes.mutate(row.openIds)}
                          disabled={acquitterAlertes.isPending}
                          className="rounded-lg border border-border bg-surface-3 px-3 py-1.5 text-[0.72rem] font-semibold text-foreground transition-colors hover:bg-border-subtle disabled:opacity-50"
                        >
                          Acquitter les signaux
                        </button>
                      </div>

                      <div className="space-y-2">
                        {row.activeSignals.map((signal) => {
                          const signalSeverity = getSeverityMeta(signal.severity);
                          const historicalEchoCount = Math.max(0, signal.count - signal.openCount);

                          return (
                            <div
                              key={signal.key}
                              className={`rounded-xl border p-3 ${signalSeverity.lineClass}`}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={`rounded-md px-2 py-0.5 text-[0.62rem] font-semibold ${signalSeverity.badgeClass}`}>
                                    {signalSeverity.shortLabel}
                                  </span>
                                  <span className="text-sm font-semibold text-foreground">{signal.title}</span>
                                </div>
                                <span className="text-[0.7rem] text-muted-foreground">
                                  {formatAlertTimestamp(signal.latestTimestamp)}
                                </span>
                              </div>

                              {signal.message && signal.message !== signal.title ? (
                                <p className="mt-2 text-xs leading-relaxed text-secondary-foreground">
                                  {signal.message}
                                </p>
                              ) : null}

                              {historicalEchoCount > 0 ? (
                                <div className="mt-2 text-[0.7rem] text-muted-foreground">
                                  {historicalEchoCount} occurrence{historicalEchoCount > 1 ? "s" : ""} similaire{historicalEchoCount > 1 ? "s" : ""}
                                  {" "}deja acquittee{historicalEchoCount > 1 ? "s" : ""} restent repliee{historicalEchoCount > 1 ? "s" : ""} dans l'historique.
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-premium">
        <div className="mb-4 section-title">Filtres</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Severite</label>
            <select
              value={severityFilter}
              onChange={(event) => setSeverityFilter(event.target.value as AlertSeverityFilter)}
              className="w-full rounded-lg border border-border bg-surface-3 px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="all">Toutes</option>
              <option value="urgence">Critique</option>
              <option value="surveillance">Surveillance</option>
              <option value="info">Info</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Machine</label>
            <select
              value={machineFilter}
              onChange={(event) => setMachineFilter(event.target.value)}
              className="w-full rounded-lg border border-border bg-surface-3 px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="all">Toutes</option>
              {rankedInsights.map((insight) => (
                <option key={insight.machine.id} value={insight.machine.id}>
                  {insight.machine.id} - {insight.machine.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Date debut</label>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="w-full rounded-lg border border-border bg-surface-3 px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Date fin</label>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="w-full rounded-lg border border-border bg-surface-3 px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-border bg-surface-3 px-4 py-3 text-sm text-muted-foreground">
          L'historique reste secondaire ici : la vue principale se limite aux cas encore actifs, regroupes par machine.
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-premium">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="section-title">Historique des emails d'alerte</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Trace recente des notifications envoyees ou tentees par le pipeline et la simulation.
            </p>
          </div>
          <div className="rounded-full bg-surface-3 px-3 py-1 text-[0.72rem] font-semibold text-muted-foreground">
            {filteredEmailHistory.length} email{filteredEmailHistory.length > 1 ? "s" : ""}
          </div>
        </div>

        {visibleEmailHistory.length > 0 ? (
          <div className="space-y-3">
            {visibleEmailHistory.map((entry) => {
              const successClass = entry.success
                ? "border-success/25 bg-success/5 text-success"
                : "border-destructive/25 bg-destructive/5 text-destructive";
              const sourceLabel = entry.source === "simulator" ? "Simulation" : "Pipeline";
              return (
                <div key={entry.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-foreground">
                          {entry.machineCode || entry.machineId}
                        </span>
                        <span className={`rounded-full border px-2.5 py-1 text-[0.64rem] font-semibold ${successClass}`}>
                          {entry.success ? "Envoye" : "Echec"}
                        </span>
                        <span className="rounded-full bg-surface-3 px-2.5 py-1 text-[0.64rem] font-semibold text-muted-foreground">
                          {sourceLabel}
                        </span>
                        <span className="text-[0.7rem] text-muted-foreground">
                          {formatAlertTimestamp(entry.createdAt)}
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {entry.machineName || entry.machineCode || entry.machineId}
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[1fr_1fr]">
                        <div className="rounded-lg border border-border bg-surface-3 px-3 py-2.5">
                          <div className="industrial-label">Destinataire</div>
                          <div className="mt-1 text-sm font-medium text-foreground">{entry.recipientEmail}</div>
                        </div>
                        <div className="rounded-lg border border-border bg-surface-3 px-3 py-2.5">
                          <div className="industrial-label">Objet</div>
                          <div className="mt-1 text-sm font-medium text-foreground">
                            {entry.subject || "Notification d'alerte PrediTeq"}
                          </div>
                        </div>
                      </div>
                      {entry.note ? (
                        <p className="mt-3 text-xs text-muted-foreground">{entry.note}</p>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-surface-3 px-4 py-4 text-sm text-muted-foreground">
            Aucun email d'alerte recent ne ressort avec les filtres courants.
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-premium">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="section-title">Historique replie</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Les anciens signaux restent disponibles en bas de page sans reprendre la main sur l'operationnel.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowHistory((value) => !value)}
            className="rounded-full border border-border bg-surface-3 px-3 py-1 text-[0.72rem] font-semibold text-foreground transition-colors hover:bg-border-subtle"
          >
            {showHistory ? "Masquer" : `Afficher (${historySignals.length})`}
          </button>
        </div>

        {showHistory ? (
          historyByMachine.length > 0 ? (
            <div className="space-y-3">
              {historyByMachine.map((machineHistory) => (
                <div key={machineHistory.machineId} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-foreground">{machineHistory.machineId}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{machineHistory.machineName}</div>
                    </div>
                    <div className="text-right">
                      <div className="rounded-full bg-surface-3 px-2.5 py-1 text-[0.65rem] font-semibold text-muted-foreground">
                        {machineHistory.entries.length} signal{machineHistory.entries.length > 1 ? "aux" : ""} cloture{machineHistory.entries.length > 1 ? "s" : ""}
                      </div>
                      <div className="mt-1 text-[0.68rem] text-muted-foreground">
                        {formatAlertTimestamp(machineHistory.latestTimestamp)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {machineHistory.entries.slice(0, 4).map((entry) => {
                      const severity = getSeverityMeta(entry.severity);
                      return (
                        <div key={entry.key} className="rounded-lg border border-border bg-surface-3 px-3 py-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-md px-2 py-0.5 text-[0.6rem] font-semibold ${severity.badgeClass}`}>
                              {severity.shortLabel}
                            </span>
                            <span className="text-sm font-semibold text-foreground">{entry.title}</span>
                            <span className="text-[0.68rem] text-muted-foreground">
                              {entry.count} occurrence{entry.count > 1 ? "s" : ""}
                            </span>
                          </div>
                          {entry.message && entry.message !== entry.title ? (
                            <p className="mt-1 text-xs text-secondary-foreground">{entry.message}</p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-surface-3 px-4 py-4 text-sm text-muted-foreground">
              Aucun historique acquitte ne ressort avec les filtres courants.
            </div>
          )
        ) : (
          <div className="rounded-xl border border-border bg-surface-3 px-4 py-4 text-sm text-muted-foreground">
            L'historique detaille reste replie pour garder cette page centree sur les machines a traiter maintenant.
          </div>
        )}
      </div>
    </div>
  );
}
