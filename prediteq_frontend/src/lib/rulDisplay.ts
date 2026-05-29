import type { Machine } from "@/data/machines";

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
    | "reference_projection"
    | "reference_lifetime"
    | "cached_prediction"
    | "initializing";
  isReference: boolean;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatDays(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function buildRulDisplay({
  machine,
  predictionMode,
  prediction,
  referenceLifetimeYears,
  referenceDays,
  localize,
}: {
  machine?: Machine | null;
  predictionMode?: Machine["rulMode"] | null;
  prediction?: RulPredictionLike | null;
  referenceLifetimeYears?: number | null;
  referenceDays?: number | null;
  localize: Localize;
}): RulDisplayState {
  const dayUnit = localize("j", "d", "ي");
  const pipelineReferenceDays =
    isFiniteNumber(referenceDays)
      ? referenceDays
      : isFiniteNumber(machine?.rulReferenceDays)
        ? machine.rulReferenceDays
        : null;
  const hasLastValidReference = machine?.rulReferenceKind === "last_valid";

  if (predictionMode === "prediction" && isFiniteNumber(prediction?.rul_days)) {
    const intervalLow = prediction?.rul_days_display_low ?? prediction?.rul_days_p10;
    const intervalHigh = prediction?.rul_days_display_high ?? prediction?.rul_days_p90;
    const intervalLabel = prediction?.display_interval_label ?? "Plage probable (80 %)";

    return {
      value: `${formatDays(prediction.rul_days)} ${dayUnit}`,
      sub:
        isFiniteNumber(intervalLow) && isFiniteNumber(intervalHigh)
          ? `${intervalLabel}: ${formatDays(intervalLow)}-${formatDays(intervalHigh)} ${dayUnit}${
              prediction?.stop_recommended
                ? ` - ${localize("Arrêt recommandé", "Recommended stop", "يُوصى بالتوقف")}`
                : ""
            }`
          : localize(
              "Lecture calculée à partir des signaux machine.",
              "Reading calculated from machine signals.",
              "تنبؤ حي صادر عن نموذج التعلم الآلي.",
            ),
      source: "prediction",
      isReference: false,
    };
  }

  if (predictionMode === "reference_only" && isFiniteNumber(pipelineReferenceDays)) {
    return {
      value: `~${formatDays(pipelineReferenceDays)} ${dayUnit}`,
      sub: hasLastValidReference
        ? localize(
            "Dernière estimation valide en attente du flux en direct.",
            "Last valid estimate while the live stream resumes.",
            "آخر تنبؤ صالح بانتظار عودة التدفق الحي.",
          )
        : localize(
            "Référence de durée conservée en attendant une lecture fiable de marge restante.",
            "Lifetime reference kept while waiting for a reliable remaining-margin reading.",
            "تم الاحتفاظ بمرجع النموذج إلى حين توفر RUL حي موثوق.",
          ),
      source: "reference_projection",
      isReference: true,
    };
  }

  if (predictionMode === "reference_only") {
    const referenceYears = referenceLifetimeYears ?? machine?.referenceLifetimeYears;
    return {
      value: isFiniteNumber(referenceYears)
        ? `${formatDays(referenceYears)} ${localize("a", "y", "س")}`
        : localize("Réf. stable", "Stable ref.", "مرجع ثابت"),
      sub: isFiniteNumber(referenceYears)
        ? localize(
            `Référence stable de durée de vie : ${formatDays(referenceYears)} ans.`,
            `Stable lifetime reference: ${formatDays(referenceYears)} years.`,
            `مرجع ثابت لعمر الخدمة: ${formatDays(referenceYears)} سنة.`,
          )
        : localize(
            "Référence stable de durée de vie.",
            "Stable lifetime reference.",
            "مرجع ثابت لعمر الخدمة.",
          ),
      source: "reference_lifetime",
      isReference: true,
    };
  }

  if (isFiniteNumber(machine?.rul)) {
    return {
      value: `${formatDays(machine.rul)} ${dayUnit}`,
      sub: isFiniteNumber(machine?.rulci)
        ? localize(
            `Dernière estimation valide +/- ${formatDays(machine.rulci)} ${dayUnit}.`,
            `Last valid estimate +/- ${formatDays(machine.rulci)} ${dayUnit}.`,
            `آخر تنبؤ صالح +/- ${formatDays(machine.rulci)} ${dayUnit}.`,
          )
        : localize(
            "Dernière estimation valide - actualisation en cours.",
            "Last valid estimate - refresh in progress.",
            "آخر تنبؤ صالح - التحديث جار.",
          ),
      source: "cached_prediction",
      isReference: true,
    };
  }

  if (isFiniteNumber(pipelineReferenceDays)) {
    return {
      value: `~${formatDays(pipelineReferenceDays)} ${dayUnit}`,
      sub: localize(
        "Référence de durée provisoire en attendant une lecture en direct exploitable.",
        "Temporary lifetime reference while waiting for a usable live reading.",
        "مرجع مؤقت من النموذج بانتظار قراءة حية قابلة للاستخدام.",
      ),
      source: "reference_projection",
      isReference: true,
    };
  }

  return {
    value: localize("Marge restante en préparation", "Remaining margin warming up", "تهيئة الهامش المتبقي"),
    sub: localize(
      "Le système collecte encore assez d'historique pour publier une marge restante fiable.",
      "The system is still collecting enough history before publishing a reliable remaining margin.",
      "لا يزال المسار يجمع ما يكفي من السجل قبل نشر عمر متبقٍ حي موثوق.",
    ),
    source: "initializing",
    isReference: true,
  };
}
