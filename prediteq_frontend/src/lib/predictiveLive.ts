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
  void historicalAverage;
  void fleetHistoricalAverage;

  const baseCost = getBudgetReferenceCost(insight.taskTemplate.type);
  const urgencyMultiplier =
    {
      stable: 1,
      watch: 1.1,
      priority: 1.25,
      critical: 1.45,
    }[insight.urgencyBand] ?? 1;
  const modelAdjustment = clamp(insight.budgetMultiplier || 1, 0.95, 1.2);
  const projectedCost = Math.round(baseCost * urgencyMultiplier * modelAdjustment);
  const extraRiskRate = clamp(
    {
      stable: 0.08,
      watch: 0.12,
      priority: 0.18,
      critical: 0.3,
    }[insight.urgencyBand] ?? 0.12,
    0.08,
    0.3,
  );
  const delaySignalRate = clamp((insight.delayMultiplier || 1.05) - 1, 0.05, 0.25);
  const delayPenalty = Math.round(projectedCost * Math.max(extraRiskRate, delaySignalRate));
  const delayedCost = projectedCost + delayPenalty;

  return {
    baseCost,
    baseSource: "local_scale",
    multiplier: urgencyMultiplier * modelAdjustment,
    projectedCost,
    delayedCost,
    delayPenalty,
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
