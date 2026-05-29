import type { PredictiveInsight, PredictiveUrgencyBand } from "@/hooks/useFleetPredictiveInsights";
import type { TacheType } from "@/hooks/useGmaoTaches";
import { getBudgetReferenceCost } from "@/lib/costModel";
import { getUiLang, getUiLocale } from "@/lib/i18n";

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

function resolveLocale(locale?: string) {
  return locale || getUiLocale();
}

function resolveLanguage(locale?: string) {
  if (locale) {
    return locale.toLowerCase().startsWith("en") ? "en" : "fr";
  }
  return getUiLang();
}

function formatCompactNumber(value: number, locale?: string, maximumFractionDigits = 1) {
  const activeLocale = resolveLocale(locale);
  return new Intl.NumberFormat(activeLocale, {
    maximumFractionDigits,
    minimumFractionDigits: value < 10 && value % 1 !== 0 ? 1 : 0,
  }).format(value);
}

export function getUrgencyTone(band: PredictiveUrgencyBand) {
  return URGENCY_TONE[band];
}

export function formatHiPercent(hi: number | null, locale?: string) {
  const activeLocale = resolveLocale(locale);
  if (typeof hi !== "number") {
    return resolveLanguage(locale) === "en" ? "Unavailable" : "Indisponible";
  }
  return `${new Intl.NumberFormat(activeLocale, { maximumFractionDigits: 0 }).format(Math.round(hi * 100))}%`;
}

export function formatPredictiveRul(insight: PredictiveInsight, locale?: string) {
  const activeLocale = resolveLocale(locale);
  const isEnglish = resolveLanguage(locale) === "en";
  const dayUnit = isEnglish ? "d" : "j";
  const yearUnit = isEnglish ? "y" : "a";

  if (insight.predictionMode === "reference_only") {
    if (typeof insight.machine.rulReferenceDays === "number") {
      return `~${formatCompactNumber(insight.machine.rulReferenceDays, activeLocale, 0)} ${dayUnit}`;
    }
    if (typeof insight.machine.referenceLifetimeYears === "number") {
      return `Ref. ${formatCompactNumber(insight.machine.referenceLifetimeYears, activeLocale, 1)} ${yearUnit}`;
    }
    return isEnglish ? "Stable reference" : "Référence stable";
  }

  if (typeof insight.rulDays === "number") {
    return `${formatCompactNumber(insight.rulDays, activeLocale, 1)} ${dayUnit}`;
  }

  if (typeof insight.machine.rul === "number") {
    return `~${formatCompactNumber(insight.machine.rul, activeLocale, 1)} ${dayUnit}`;
  }

  if (typeof insight.machine.rulReferenceDays === "number") {
    return `~${formatCompactNumber(insight.machine.rulReferenceDays, activeLocale, 0)} ${dayUnit}`;
  }

  if (insight.predictionMode === "initializing") {
    return isEnglish ? "RUL initialization" : "Initialisation RUL";
  }

  return isEnglish ? "Unavailable" : "Indisponible";
}

export function formatStressValue(value: number | null, locale?: string) {
  const activeLocale = resolveLocale(locale);
  if (typeof value !== "number") {
    return resolveLanguage(locale) === "en" ? "Unavailable" : "Indisponible";
  }
  return `${new Intl.NumberFormat(activeLocale, { maximumFractionDigits: 0 }).format(Math.round(value * 100))}%`;
}

export function getLiveCostProjection(
  insight: PredictiveInsight,
  historicalAverage: number,
  fleetHistoricalAverage = 0,
) {
  const hasMachineHistory = historicalAverage > 0;
  const hasFleetHistory = fleetHistoricalAverage > 0;
  const historyReference = hasMachineHistory
    ? historicalAverage
    : hasFleetHistory
      ? fleetHistoricalAverage
      : 0;
  const baseCost = getBudgetReferenceCost(insight.taskTemplate.type, historyReference);
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
