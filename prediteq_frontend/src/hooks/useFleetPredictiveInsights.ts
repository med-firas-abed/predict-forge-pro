import { useMemo } from "react";

import type {
  Machine,
  MachineDecisionTaskTemplate,
  MachineStressBand,
  PredictiveUrgencyBand,
} from "@/data/machines";

export type { PredictiveUrgencyBand } from "@/data/machines";

export interface PredictiveInsight {
  machine: Machine;
  stressValue: number | null;
  stressBand: MachineStressBand | null;
  stressLabel: string;
  dominantAxis: string | null;
  predictionMode: Machine["rulMode"] | null;
  rulDays: number | null;
  confidence: "high" | "medium" | "low" | null;
  maintenanceWindow: string | null;
  topDriver: string | null;
  urgencyScore: number;
  urgencyBand: PredictiveUrgencyBand;
  urgencyLabel: string;
  urgencyHex: string;
  stopRecommended: boolean;
  summary: string;
  plainReason: string;
  impact: string;
  recommendedAction: string;
  trustNote: string;
  evidence: string[];
  fieldChecks: string[];
  taskTemplate: MachineDecisionTaskTemplate;
  budgetMultiplier: number;
  delayMultiplier: number;
  dataSource: string;
  updatedAt: string | null;
  ageSeconds: number | null;
  isStale: boolean;
}

const DEFAULT_TASK_TEMPLATE: MachineDecisionTaskTemplate = {
  type: "inspection",
  leadDays: 7,
  title: "Inspection",
  summary: "Vérifier la machine et confirmer les signaux observés.",
};

function fallbackInsight(machine: Machine): PredictiveInsight {
  const hi = machine.hi;
  const urgencyBand: PredictiveUrgencyBand =
    hi == null ? "watch" : hi < 0.3 ? "critical" : hi < 0.8 ? "watch" : "stable";
  const urgencyMeta = {
    stable: { score: 20, label: "Stable", hex: "#10b981" },
    watch: { score: 40, label: "A surveiller", hex: "#0f766e" },
    priority: { score: 60, label: "À planifier", hex: "#f59e0b" },
    critical: { score: 88, label: "Urgent", hex: "#f43f5e" },
  }[urgencyBand];

  return {
    machine,
    stressValue: null,
    stressBand: null,
    stressLabel: "Indisponible",
    dominantAxis: null,
    predictionMode: machine.rulMode ?? null,
    rulDays: machine.rul ?? null,
    confidence: null,
    maintenanceWindow: null,
    topDriver: null,
    urgencyScore: urgencyMeta.score,
    urgencyBand,
    urgencyLabel: urgencyMeta.label,
    urgencyHex: urgencyMeta.hex,
    stopRecommended: Boolean(machine.stopRecommended),
    summary: "Lecture partielle : attente d'un instantané de décision complet.",
    plainReason: "La machine ne dispose pas encore d'une lecture explicative complète.",
    impact: "La priorisation reste provisoire tant que le moteur n'a pas publié sa synthèse.",
    recommendedAction: "Vérifier la fraîcheur du flux avant de planifier une action lourde.",
    trustNote: "Aucune synthèse de décision n'est disponible pour le moment.",
    evidence: [],
    fieldChecks: [],
    taskTemplate: DEFAULT_TASK_TEMPLATE,
    budgetMultiplier: 1,
    delayMultiplier: 1.05,
    dataSource: "no_data",
    updatedAt: null,
    ageSeconds: null,
    isStale: true,
  };
}

function buildInsight(machine: Machine): PredictiveInsight {
  const decision = machine.decision;
  if (!decision) {
    return fallbackInsight(machine);
  }

  return {
    machine,
    stressValue: decision.stressValue,
    stressBand: decision.stressBand,
    stressLabel: decision.stressLabel,
    dominantAxis: decision.dominantAxis,
    predictionMode: decision.predictionMode,
    rulDays: decision.rulDays,
    confidence: decision.confidence,
    maintenanceWindow: decision.maintenanceWindow,
    topDriver: decision.topDriver,
    urgencyScore: decision.urgencyScore,
    urgencyBand: decision.urgencyBand,
    urgencyLabel: decision.urgencyLabel,
    urgencyHex: decision.urgencyHex,
    stopRecommended: decision.stopRecommended,
    summary: decision.summary,
    plainReason: decision.plainReason,
    impact: decision.impact,
    recommendedAction: decision.recommendedAction,
    trustNote: decision.trustNote,
    evidence: decision.evidence,
    fieldChecks: decision.fieldChecks,
    taskTemplate: decision.taskTemplate,
    budgetMultiplier: decision.budgetModel.multiplier,
    delayMultiplier: decision.budgetModel.delayMultiplier,
    dataSource: decision.dataSource,
    updatedAt: decision.updatedAt,
    ageSeconds: decision.ageSeconds,
    isStale: decision.isStale,
  };
}

export function useFleetPredictiveInsights(machines: Machine[]) {
  const insights = useMemo(() => machines.map(buildInsight), [machines]);

  const byMachineId = useMemo(
    () =>
      Object.fromEntries(insights.map((insight) => [insight.machine.id, insight])) as Record<
        string,
        PredictiveInsight
      >,
    [insights],
  );

  return {
    insights,
    byMachineId,
    isLoading: false,
    isFetching: false,
  };
}
