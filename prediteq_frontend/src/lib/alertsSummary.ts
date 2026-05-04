import type { Alerte } from "@/lib/runtimeDataRepository";

export type AlertSeverity = Alerte["severite"];

export interface GroupedAlert {
  key: string;
  machineId: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  latestTimestamp: string;
  count: number;
  openCount: number;
  openIds: string[];
}

function normalizeAlertKey(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function groupAlertes(alertes: Alerte[]): GroupedAlert[] {
  const map = new Map<string, GroupedAlert>();

  alertes.forEach((alert) => {
    const machineId = alert.machineCode || alert.machineId;
    const key = `${machineId}::${alert.severite}::${normalizeAlertKey(alert.titre || "alerte")}`;
    const current = map.get(key) ?? {
      key,
      machineId,
      title: alert.titre || "Alerte",
      message: alert.description || alert.titre || "Alerte",
      severity: alert.severite,
      latestTimestamp: alert.createdAt,
      count: 0,
      openCount: 0,
      openIds: [],
    };

    current.count += 1;
    if (!alert.acquitte) {
      current.openCount += 1;
      current.openIds.push(alert.id);
    }

    if (alert.createdAt >= current.latestTimestamp) {
      current.latestTimestamp = alert.createdAt;
      current.title = alert.titre || "Alerte";
      current.message = alert.description || alert.titre || "Alerte";
    }

    map.set(key, current);
  });

  return [...map.values()].sort((left, right) => right.latestTimestamp.localeCompare(left.latestTimestamp));
}

export function getActiveGroupedAlertSignals(alertes: Alerte[]) {
  return groupAlertes(alertes).filter((alert) => alert.openCount > 0);
}

export function getActiveAlertCaseCount(alertes: Alerte[]) {
  return new Set(getActiveGroupedAlertSignals(alertes).map((alert) => alert.machineId)).size;
}
