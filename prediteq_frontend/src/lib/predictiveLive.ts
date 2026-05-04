import type { PredictiveInsight, PredictiveUrgencyBand } from "@/hooks/useFleetPredictiveInsights";
import type { TacheType } from "@/hooks/useGmaoTaches";

const URGENCY_TONE = {
  stable: {
    badge: "bg-success/10 text-success",
    panel: "border-success/25 bg-success/5",
    bar: "bg-success",
    ring: "#10b981",
  },
  watch: {
    badge: "bg-primary/10 text-primary",
    panel: "border-primary/25 bg-primary/5",
    bar: "bg-primary",
    ring: "#0f766e",
  },
  priority: {
    badge: "bg-warning/10 text-warning",
    panel: "border-warning/25 bg-warning/5",
    bar: "bg-warning",
    ring: "#f59e0b",
  },
  critical: {
    badge: "bg-destructive/10 text-destructive",
    panel: "border-destructive/25 bg-destructive/5",
    bar: "bg-destructive",
    ring: "#f43f5e",
  },
} as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

const TASK_BASE_COST: Record<TacheType, number> = {
  preventive: 260,
  inspection: 320,
  corrective: 480,
};

function formatCompactNumber(value: number, locale = "fr-FR", maximumFractionDigits = 1) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits,
    minimumFractionDigits: value < 10 && value % 1 !== 0 ? 1 : 0,
  }).format(value);
}

export function getUrgencyTone(band: PredictiveUrgencyBand) {
  return URGENCY_TONE[band];
}

export function formatHiPercent(hi: number | null, locale = "fr-FR") {
  if (typeof hi !== "number") return "Indisponible";
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(hi * 100))}%`;
}

export function formatPredictiveRul(insight: PredictiveInsight, locale = "fr-FR") {
  if (insight.predictionMode === "no_prediction") {
    if (typeof insight.machine.l10Years === "number") {
      return `L10 ${formatCompactNumber(insight.machine.l10Years, locale, 1)} a`;
    }
    return "Prédiction en veille";
  }

  if (typeof insight.rulDays === "number") {
    return `${formatCompactNumber(insight.rulDays, locale, 1)} j`;
  }

  if (typeof insight.machine.rul === "number") {
    return `~${formatCompactNumber(insight.machine.rul, locale, 1)} j`;
  }

  if (typeof insight.machine.rulReferenceDays === "number") {
    return `~${formatCompactNumber(insight.machine.rulReferenceDays, locale, 0)} j`;
  }

  if (insight.predictionMode === "warming_up") {
    return "Initialisation RUL";
  }

  return "Indisponible";
}

export function formatStressValue(value: number | null, locale = "fr-FR") {
  if (typeof value !== "number") return "Indisponible";
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(value * 100))}%`;
}

export function getLiveCostProjection(
  insight: PredictiveInsight,
  historicalAverage: number,
  fleetHistoricalAverage = 0,
) {
  const hasMachineHistory = historicalAverage > 0;
  const hasFleetHistory = fleetHistoricalAverage > 0;
  const baseCost = hasMachineHistory
    ? historicalAverage
    : hasFleetHistory
      ? fleetHistoricalAverage
      : TASK_BASE_COST[insight.taskTemplate.type];
  const baseSource = hasMachineHistory
    ? "machine_history"
    : hasFleetHistory
      ? "fleet_history"
      : "task_baseline";
  const multiplier = clamp(insight.budgetMultiplier || 1, 0.85, 3.2);
  const projectedCost = Math.round(baseCost * multiplier);
  const delayMultiplier = clamp(insight.delayMultiplier || 1.05, 1.01, 3.2);
  const delayedCost = Math.round(projectedCost * delayMultiplier);

  return {
    baseCost,
    baseSource,
    multiplier,
    projectedCost,
    delayedCost,
    delayPenalty: delayedCost - projectedCost,
  };
}

export function getRecommendedTask(insight: PredictiveInsight): {
  type: TacheType;
  leadDays: number;
  title: string;
  summary: string;
} {
  return {
    type: insight.taskTemplate.type,
    leadDays: insight.taskTemplate.leadDays,
    title: insight.taskTemplate.title,
    summary: insight.taskTemplate.summary,
  };
}

export function getRecommendedDate(daysFromNow: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}
