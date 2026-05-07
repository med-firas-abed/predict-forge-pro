import { repairText } from "@/lib/repairText";
import {
  formatAudienceAxisLabel,
  formatAudienceFeatureLabel,
  normalizeAudienceToken,
} from "@/lib/juryNarrative";

type Localize = (fr: string, en: string, ar: string) => string;

export interface ComponentDiagnosisLike {
  code?: string | null;
  cause?: string | null;
  detail?: string | null;
  action?: string | null;
  severity?: string | null;
}

export interface ComponentInference {
  familyLabel: string;
  primarySignal: string;
  summary: string;
  evidence: string[];
  confidenceLabel: string;
  confidenceTone: "high" | "medium" | "low";
}

function normalizeToken(value: string | null | undefined) {
  return normalizeAudienceToken(value);
}

function formatFeatureLabel(feature: string | null | undefined, localize: Localize) {
  return formatAudienceFeatureLabel(feature, localize);
}

function formatAxisLabel(axis: string | null | undefined, localize: Localize) {
  return formatAudienceAxisLabel(axis, localize);
}

function normalizeDiagnosis(input: ComponentDiagnosisLike) {
  return {
    code: repairText(input.code ?? ""),
    cause: repairText(input.cause ?? ""),
    detail: repairText(input.detail ?? ""),
    action: repairText(input.action ?? ""),
    severity: normalizeToken(input.severity),
  };
}

function severityRank(severity: string) {
  if (severity === "critical") return 0;
  if (severity === "warning") return 1;
  return 2;
}

function hasToken(text: string, patterns: string[]) {
  return patterns.some((pattern) => text.includes(pattern));
}

export function inferComponentFocus(
  {
    diagnoses,
    dominantAxis,
    topDriver,
  }: {
    diagnoses: ComponentDiagnosisLike[];
    dominantAxis?: string | null;
    topDriver?: string | null;
  },
  localize: Localize,
): ComponentInference {
  const normalizedDiagnoses = diagnoses
    .map(normalizeDiagnosis)
    .sort((left, right) => severityRank(left.severity) - severityRank(right.severity));
  const primaryDiagnosis = normalizedDiagnoses[0] ?? null;
  const primaryText = normalizeToken(
    [primaryDiagnosis?.code, primaryDiagnosis?.cause, primaryDiagnosis?.detail, primaryDiagnosis?.action]
      .filter(Boolean)
      .join(" "),
  );
  const driverLabel = formatFeatureLabel(topDriver, localize);
  const axisLabel = formatAxisLabel(dominantAxis, localize);
  const evidence = [
    primaryDiagnosis?.cause || null,
    dominantAxis
      ? `${localize("Axe dominant", "Dominant axis", "Dominant axis")}: ${axisLabel}`
      : null,
    topDriver
      ? `${localize("Signal principal", "Main signal", "Main signal")}: ${driverLabel}`
      : null,
  ]
    .map((item) => (item ? repairText(item) : null))
    .filter((item): item is string => Boolean(item))
    .slice(0, 3);

  if (
    primaryDiagnosis &&
    (primaryDiagnosis.code.startsWith("ELE-") ||
      hasToken(primaryText, [
        "courant",
        "phase",
        "rotor",
        "bobinage",
        "spires",
        "isolation",
        "alimentation",
        "mcsa",
      ]))
  ) {
    return {
      familyLabel: localize("Moteur / alimentation", "Motor / power supply", "Motor / power supply"),
      primarySignal: primaryDiagnosis.cause,
      summary: localize(
        "Les signaux electriques orientent d'abord le controle vers le moteur, son alimentation ou ses enroulements.",
        "Electrical signals point first to the motor, its supply, or its windings.",
        "Electrical signals point first to the motor, its supply, or its windings.",
      ),
      evidence,
      confidenceLabel: localize("Cible prioritaire", "Priority target", "Priority target"),
      confidenceTone: "high",
    };
  }

  if (
    primaryDiagnosis &&
    (primaryDiagnosis.code.startsWith("VIB-") ||
      hasToken(primaryText, [
        "vibration",
        "balourd",
        "desalign",
        "palier",
        "roulement",
        "accouplement",
        "alignement",
      ]))
  ) {
    return {
      familyLabel: localize("Roulements / transmission", "Bearings / transmission", "Bearings / transmission"),
      primarySignal: primaryDiagnosis.cause,
      summary: localize(
        "La derive ressemble d'abord a un probleme mecanique de roulement, couplage ou alignement.",
        "The drift first looks like a mechanical issue around bearings, coupling, or alignment.",
        "The drift first looks like a mechanical issue around bearings, coupling, or alignment.",
      ),
      evidence,
      confidenceLabel: localize("Cible prioritaire", "Priority target", "Priority target"),
      confidenceTone: "high",
    };
  }

  if (primaryDiagnosis?.code === "THR-COUP") {
    return {
      familyLabel: localize("Refroidissement / frottement", "Cooling / friction", "Cooling / friction"),
      primarySignal: primaryDiagnosis.cause,
      summary: localize(
        "Le lien charge / temperature suggere surtout un refroidissement perturbe ou un frottement parasite.",
        "The load/temperature link mostly suggests disturbed cooling or parasitic friction.",
        "The load/temperature link mostly suggests disturbed cooling or parasitic friction.",
      ),
      evidence,
      confidenceLabel: localize("Cible probable", "Probable target", "Probable target"),
      confidenceTone: "medium",
    };
  }

  if (
    primaryDiagnosis &&
    (primaryDiagnosis.code.startsWith("THR-") ||
      hasToken(primaryText, ["therm", "temperature", "surchauffe", "echauff", "ventilation"]))
  ) {
    return {
      familyLabel: localize("Echauffement moteur", "Motor overheating", "Motor overheating"),
      primarySignal: primaryDiagnosis.cause,
      summary: localize(
        "Les indices thermiques pointent d'abord vers le moteur, son refroidissement ou une surcharge durable.",
        "Thermal indicators point first to the motor, its cooling, or a lasting overload.",
        "Thermal indicators point first to the motor, its cooling, or a lasting overload.",
      ),
      evidence,
      confidenceLabel: localize("Cible prioritaire", "Priority target", "Priority target"),
      confidenceTone: "high",
    };
  }

  if (primaryDiagnosis?.code.startsWith("HI-SLOPE-")) {
    return {
      familyLabel:
        normalizeToken(dominantAxis) === "vibration"
          ? localize("Roulements / transmission", "Bearings / transmission", "Bearings / transmission")
          : normalizeToken(dominantAxis) === "thermal"
            ? localize("Echauffement moteur", "Motor overheating", "Motor overheating")
            : normalizeToken(dominantAxis) === "load"
              ? localize("Chaine de charge", "Load chain", "Load chain")
              : localize("Commande / usage", "Control / operating pattern", "Control / operating pattern"),
      primarySignal: primaryDiagnosis.cause,
      summary: localize(
        "La baisse rapide du HI confirme une derive, mais la localisation materielle doit encore etre verifiee sur le terrain.",
        "The rapid HI drop confirms a drift, but the physical location still needs field confirmation.",
        "The rapid HI drop confirms a drift, but the physical location still needs field confirmation.",
      ),
      evidence,
      confidenceLabel: localize("Cible probable", "Probable target", "Probable target"),
      confidenceTone: "medium",
    };
  }

  const axisToken = normalizeToken(dominantAxis);
  if (axisToken === "vibration") {
    return {
      familyLabel: localize("Roulements / transmission", "Bearings / transmission", "Bearings / transmission"),
      primarySignal: topDriver ? driverLabel : axisLabel,
      summary: localize(
        "La vibration domine la lecture. Il faut regarder d'abord les roulements et les organes de transmission.",
        "Vibration dominates the reading. Bearings and transmission parts should be checked first.",
        "Vibration dominates the reading. Bearings and transmission parts should be checked first.",
      ),
      evidence: evidence.length > 0 ? evidence : [localize("Pas d'alerte experte active", "No active expert alert", "No active expert alert")],
      confidenceLabel: localize("Cible probable", "Probable target", "Probable target"),
      confidenceTone: "medium",
    };
  }

  if (axisToken === "thermal") {
    return {
      familyLabel: localize("Echauffement / refroidissement", "Heating / cooling", "Heating / cooling"),
      primarySignal: topDriver ? driverLabel : axisLabel,
      summary: localize(
        "La temperature domine la lecture. Le controle doit viser d'abord l'echauffement moteur et la ventilation.",
        "Temperature dominates the reading. The first checks should target motor heating and ventilation.",
        "Temperature dominates the reading. The first checks should target motor heating and ventilation.",
      ),
      evidence: evidence.length > 0 ? evidence : [localize("Pas d'alerte experte active", "No active expert alert", "No active expert alert")],
      confidenceLabel: localize("Cible probable", "Probable target", "Probable target"),
      confidenceTone: "medium",
    };
  }

  if (axisToken === "load") {
    return {
      familyLabel: localize("Charge / entrainement", "Load / drive train", "Load / drive train"),
      primarySignal: topDriver ? driverLabel : axisLabel,
      summary: localize(
        "La charge demandee a la machine domine la lecture. Il faut d'abord verifier l'effort et l'entrainement.",
        "Load dominates the reading. The demanded effort and drive train should be checked first.",
        "Load dominates the reading. The demanded effort and drive train should be checked first.",
      ),
      evidence: evidence.length > 0 ? evidence : [localize("Pas d'alerte experte active", "No active expert alert", "No active expert alert")],
      confidenceLabel: localize("A confirmer", "To confirm", "To confirm"),
      confidenceTone: "low",
    };
  }

  if (axisToken === "variability") {
    return {
      familyLabel: localize("Commande / rythme d'usage", "Control / operating pattern", "Control / operating pattern"),
      primarySignal: topDriver ? driverLabel : axisLabel,
      summary: localize(
        "Le rythme d'usage parait instable. Il faut comparer les cycles stables et perturbes avant de conclure.",
        "The operating pattern looks unstable. Stable and unstable cycles should be compared before concluding.",
        "The operating pattern looks unstable. Stable and unstable cycles should be compared before concluding.",
      ),
      evidence: evidence.length > 0 ? evidence : [localize("Pas d'alerte experte active", "No active expert alert", "No active expert alert")],
      confidenceLabel: localize("A confirmer", "To confirm", "To confirm"),
      confidenceTone: "low",
    };
  }

  return {
    familyLabel: localize("Aucun composant critique identifie", "No critical component identified", "No critical component identified"),
    primarySignal: topDriver ? driverLabel : localize("Lecture stable", "Stable reading", "Stable reading"),
    summary: localize(
      "Aucun composant ne se detache nettement pour le moment. La machine reste suivie par le HI, le RUL et le stress.",
      "No component stands out clearly for now. The machine remains tracked through HI, RUL, and stress.",
      "No component stands out clearly for now. The machine remains tracked through HI, RUL, and stress.",
    ),
    evidence: evidence.length > 0 ? evidence : [localize("Pas d'alerte experte active", "No active expert alert", "No active expert alert")],
    confidenceLabel: localize("Pas de piste dominante", "No dominant lead", "No dominant lead"),
    confidenceTone: "low",
  };
}
