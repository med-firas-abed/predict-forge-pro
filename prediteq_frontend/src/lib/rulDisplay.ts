import type { Machine } from "@/data/machines";
import {
  getMachineDemoReferenceDays,
  shouldSurfaceDemoReference,
} from "@/lib/demoScenario";

type Localize = (fr: string, en: string, ar: string) => string;

export interface RulPredictionLike {
  rul_days?: number | null;
  rul_days_p10?: number | null;
  rul_days_p90?: number | null;
  rul_days_display_low?: number | null;
  rul_days_display_high?: number | null;
  display_interval_label?: string | null;
  stop_recommended?: boolean | null;
}

export interface RulDisplayState {
  value: string;
  sub: string;
  source:
    | "prediction"
    | "reference_lifetime"
    | "cached_prediction"
    | "demo_reference"
    | "initializing";
  isReference: boolean;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatDays(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function getDemoReferenceDays(
  machine?: Machine | null,
  allowDemoReference = shouldSurfaceDemoReference(),
) {
  if (!allowDemoReference) return null;
  const referenceDays = getMachineDemoReferenceDays(machine);
  return isFiniteNumber(referenceDays) ? referenceDays : null;
}

export function buildRulDisplay({
  machine,
  predictionMode,
  prediction,
  referenceLifetimeYears,
  referenceDays,
  localize,
  allowDemoReference = shouldSurfaceDemoReference(),
}: {
  machine?: Machine | null;
  predictionMode?: Machine["rulMode"] | null;
  prediction?: RulPredictionLike | null;
  referenceLifetimeYears?: number | null;
  referenceDays?: number | null;
  localize: Localize;
  allowDemoReference?: boolean;
}): RulDisplayState {
  const dayUnit = localize("j", "d", "ي");

  if (predictionMode === "prediction" && isFiniteNumber(prediction?.rul_days)) {
    const intervalLow = prediction?.rul_days_display_low ?? prediction?.rul_days_p10;
    const intervalHigh = prediction?.rul_days_display_high ?? prediction?.rul_days_p90;
    const intervalLabel = prediction?.display_interval_label ?? "IC 80 %";

    return {
      value: `${formatDays(prediction.rul_days)} ${dayUnit}`,
      sub:
        isFiniteNumber(intervalLow) && isFiniteNumber(intervalHigh)
          ? `${intervalLabel}: ${formatDays(intervalLow)}-${formatDays(intervalHigh)} ${dayUnit}${
              prediction?.stop_recommended
                ? ` - ${localize("Arrêt recommandé", "Recommended stop", "يوصى بالتوقف")}`
                : ""
            }`
          : localize(
              "Prédiction live issue du modèle ML",
              "Live ML prediction",
              "تنبؤ حي صادر عن نموذج التعلم الآلي",
            ),
      source: "prediction",
      isReference: false,
    };
  }

  if (predictionMode === "reference_only") {
    const referenceYears =
      referenceLifetimeYears ?? machine?.referenceLifetimeYears;
    return {
      value:
        isFiniteNumber(referenceYears)
          ? `${formatDays(referenceYears)} ${localize("a", "y", "س")}`
          : localize("Ref. stable", "Stable ref.", "Stable ref."),
      sub:
        isFiniteNumber(referenceYears)
          ? localize(
              `Référence stable de durée de vie : ${formatDays(referenceYears)} ans`,
              `Stable lifetime reference: ${formatDays(referenceYears)} years`,
              `Stable lifetime reference: ${formatDays(referenceYears)} years`,
            )
          : localize(
              "Référence stable de durée de vie",
              "Stable lifetime reference",
              "Stable lifetime reference",
            ),
      source: "reference_lifetime",
      isReference: true,
    };
  }

  if (isFiniteNumber(machine?.rul)) {
    return {
      value: `${formatDays(machine.rul)} ${dayUnit}`,
      sub:
        isFiniteNumber(machine?.rulci)
          ? localize(
              `Dernière prédiction valide +/- ${formatDays(machine.rulci)} ${dayUnit}`,
              `Last valid prediction +/- ${formatDays(machine.rulci)} ${dayUnit}`,
              `اخر تنبؤ صالح +/- ${formatDays(machine.rulci)} ${dayUnit}`,
            )
          : localize(
              "Dernière prédiction valide - actualisation en cours",
              "Last valid prediction - refresh in progress",
              "اخر تنبؤ صالح - التحديث جار",
            ),
      source: "cached_prediction",
      isReference: true,
    };
  }

  const demoReferenceDays =
    referenceDays ?? getDemoReferenceDays(machine, allowDemoReference);
  if (isFiniteNumber(demoReferenceDays)) {
    return {
      value: `${formatDays(demoReferenceDays)} ${dayUnit}`,
      sub: localize(
        "Référence démo en attente du RUL live",
        "Demo reference while the live RUL initializes",
        "مرجع العرض في انتظار جاهزية العمر المتبقي الحي",
      ),
      source: "demo_reference",
      isReference: true,
    };
  }

  return {
    value: localize("Initialisation RUL", "RUL warm-up", "تهيئة العمر المتبقي"),
    sub: localize(
      "Le pipeline collecte encore assez d'historique pour publier un RUL live fiable.",
      "The pipeline is still collecting enough history before publishing a reliable live RUL.",
      "لا يزال المسار يجمع ما يكفي من السجل قبل نشر عمر متبق حي موثوق",
    ),
    source: "initializing",
    isReference: true,
  };
}
