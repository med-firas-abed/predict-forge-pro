import { repairText } from "@/lib/repairText";

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
  return repairText(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function formatFeatureLabel(feature: string | null | undefined, localize: Localize) {
  const token = normalizeToken(feature);

  switch (token) {
    case "vib":
    case "vib_mms":
    case "vibration":
    case "rms_mms":
      return localize("Vibration moteur", "Motor vibration", "Motor vibration");
    case "curr":
    case "current":
    case "current_a":
    case "i_rms_a":
      return localize("Courant moteur", "Motor current", "Motor current");
    case "temp":
    case "temp_c":
    case "temperature":
    case "temp_mot_c":
      return localize("Température moteur", "Motor temperature", "Motor temperature");
    case "power_kw":
    case "p_mean_kw":
      return localize("Puissance absorbée", "Absorbed power", "Absorbed power");
    case "humidity_rh":
      return localize("Humidité", "Humidity", "Humidity");
    case "phase":
      return localize("Déséquilibre de phase", "Phase imbalance", "Phase imbalance");
    case "corr_t_p":
      return localize(
        "Lien température / charge",
        "Temperature / load link",
        "Temperature / load link",
      );
    case "hi_minimum_60_min":
    case "hi_minimum_60min":
    case "hi_minimum":
      return localize("HI minimum (60 min)", "HI minimum (60 min)", "HI minimum (60 min)");
    default:
      return repairText(feature ?? "") || localize("Facteur non précisé", "Unspecified driver", "Unspecified driver");
  }
}

function formatAxisLabel(axis: string | null | undefined, localize: Localize) {
  switch (normalizeToken(axis)) {
    case "thermal":
    case "thermique":
      return localize("Thermique", "Thermal", "Thermal");
    case "vibration":
    case "vibratoire":
      return localize("Vibratoire", "Vibration", "Vibration");
    case "load":
    case "charge":
      return localize("Charge", "Load", "Load");
    case "variability":
    case "variabilite":
      return localize("Variabilité", "Variability", "Variability");
    default:
      return repairText(axis ?? "") || localize("Indéterminé", "Undetermined", "Undetermined");
  }
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
      familyLabel: localize(
        "Moteur / alimentation",
        "Motor / power supply",
        "Motor / power supply",
      ),
      primarySignal: primaryDiagnosis.cause,
      summary: localize(
        "Les signaux électriques orientent d'abord le contrôle vers le moteur, son alimentation ou ses enroulements.",
        "Electrical signals point first to the motor, its supply, or its windings.",
        "Electrical signals point first to the motor, its supply, or its windings.",
      ),
      evidence,
      confidenceLabel: localize("Piste principale", "Primary lead", "Primary lead"),
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
        "désalign",
        "palier",
        "roulement",
        "accouplement",
        "alignement",
      ]))
  ) {
    return {
      familyLabel: localize(
        "Roulements / transmission",
        "Bearings / transmission",
        "Bearings / transmission",
      ),
      primarySignal: primaryDiagnosis.cause,
      summary: localize(
        "La dérive observée ressemble d'abord à un problème mécanique de palier, roulement ou alignement.",
        "The observed drift first looks like a mechanical issue around bearings, coupling, or alignment.",
        "The observed drift first looks like a mechanical issue around bearings, coupling, or alignment.",
      ),
      evidence,
      confidenceLabel: localize("Piste principale", "Primary lead", "Primary lead"),
      confidenceTone: "high",
    };
  }

  if (primaryDiagnosis?.code === "THR-COUP") {
    return {
      familyLabel: localize(
        "Refroidissement / frottement",
        "Cooling / friction",
        "Cooling / friction",
      ),
      primarySignal: primaryDiagnosis.cause,
      summary: localize(
        "Le lien anormal entre charge et température suggère une dissipation thermique perturbée ou un frottement parasite.",
        "The unusual load/temperature link suggests disturbed cooling or parasitic friction.",
        "The unusual load/temperature link suggests disturbed cooling or parasitic friction.",
      ),
      evidence,
      confidenceLabel: localize("Piste probable", "Probable lead", "Probable lead"),
      confidenceTone: "medium",
    };
  }

  if (
    primaryDiagnosis &&
    (primaryDiagnosis.code.startsWith("THR-") ||
      hasToken(primaryText, ["therm", "temperature", "surchauffe", "echauff", "échauff", "ventilation"]))
  ) {
    return {
      familyLabel: localize(
        "Échauffement moteur",
        "Motor overheating",
        "Motor overheating",
      ),
      primarySignal: primaryDiagnosis.cause,
      summary: localize(
        "Les indices thermiques pointent d'abord vers le moteur, son refroidissement ou une surcharge durable.",
        "Thermal indicators point first to the motor, its cooling, or a lasting overload.",
        "Thermal indicators point first to the motor, its cooling, or a lasting overload.",
      ),
      evidence,
      confidenceLabel: localize("Piste principale", "Primary lead", "Primary lead"),
      confidenceTone: "high",
    };
  }

  if (primaryDiagnosis?.code.startsWith("HI-SLOPE-")) {
    return {
      familyLabel:
        normalizeToken(dominantAxis) === "vibration"
          ? localize("Roulements / transmission", "Bearings / transmission", "Bearings / transmission")
          : normalizeToken(dominantAxis) === "thermal"
            ? localize("Échauffement moteur", "Motor overheating", "Motor overheating")
            : normalizeToken(dominantAxis) === "load"
              ? localize("Chaîne de charge", "Load chain", "Load chain")
              : localize(
                  "Commande / usage",
                  "Control / operating pattern",
                  "Control / operating pattern",
                ),
      primarySignal: primaryDiagnosis.cause,
      summary: localize(
        "La baisse rapide du HI confirme une dérive, mais la localisation matérielle reste à confirmer sur le terrain.",
        "The rapid HI drop confirms a drift, but the physical location still needs field confirmation.",
        "The rapid HI drop confirms a drift, but the physical location still needs field confirmation.",
      ),
      evidence,
      confidenceLabel: localize("Piste probable", "Probable lead", "Probable lead"),
      confidenceTone: "medium",
    };
  }

  const axisToken = normalizeToken(dominantAxis);
  if (axisToken === "vibration") {
    return {
      familyLabel: localize(
        "Roulements / transmission",
        "Bearings / transmission",
        "Bearings / transmission",
      ),
      primarySignal: topDriver ? driverLabel : axisLabel,
      summary: localize(
        "La vibration domine la lecture. Il faut regarder d'abord les paliers, roulements et organes de transmission.",
        "Vibration dominates the reading. Bearings and transmission parts should be checked first.",
        "Vibration dominates the reading. Bearings and transmission parts should be checked first.",
      ),
      evidence: evidence.length > 0 ? evidence : [localize("Pas d'alerte experte active", "No active expert alert", "No active expert alert")],
      confidenceLabel: localize("Piste probable", "Probable lead", "Probable lead"),
      confidenceTone: "medium",
    };
  }

  if (axisToken === "thermal") {
    return {
      familyLabel: localize(
        "Échauffement / refroidissement",
        "Heating / cooling",
        "Heating / cooling",
      ),
      primarySignal: topDriver ? driverLabel : axisLabel,
      summary: localize(
        "La composante thermique domine. Le contrôle doit viser d'abord l'échauffement moteur et la ventilation.",
        "The thermal component dominates. The first checks should target motor heating and ventilation.",
        "The thermal component dominates. The first checks should target motor heating and ventilation.",
      ),
      evidence: evidence.length > 0 ? evidence : [localize("Pas d'alerte experte active", "No active expert alert", "No active expert alert")],
      confidenceLabel: localize("Piste probable", "Probable lead", "Probable lead"),
      confidenceTone: "medium",
    };
  }

  if (axisToken === "load") {
    return {
      familyLabel: localize("Charge / entraînement", "Load / drive train", "Load / drive train"),
      primarySignal: topDriver ? driverLabel : axisLabel,
      summary: localize(
        "La charge domine la lecture. Il faut vérifier d'abord le régime d'utilisation et la chaîne d'entraînement.",
        "Load dominates the reading. The first checks should target operating regime and the drive train.",
        "Load dominates the reading. The first checks should target operating regime and the drive train.",
      ),
      evidence: evidence.length > 0 ? evidence : [localize("Pas d'alerte experte active", "No active expert alert", "No active expert alert")],
      confidenceLabel: localize("À confirmer", "To confirm", "To confirm"),
      confidenceTone: "low",
    };
  }

  if (axisToken === "variability") {
    return {
      familyLabel: localize(
        "Commande / variabilité d'usage",
        "Control / usage variability",
        "Control / usage variability",
      ),
      primarySignal: topDriver ? driverLabel : axisLabel,
      summary: localize(
        "La variabilité domine sans défaut matériel net. Il faut d'abord vérifier la commande, l'alimentation et le profil d'usage.",
        "Variability dominates without a clear hardware fault. Control, power regularity, and usage profile should be checked first.",
        "Variability dominates without a clear hardware fault. Control, power regularity, and usage profile should be checked first.",
      ),
      evidence: evidence.length > 0 ? evidence : [localize("Pas d'alerte experte critique active", "No active expert alert", "No active expert alert")],
      confidenceLabel: localize("À confirmer", "To confirm", "To confirm"),
      confidenceTone: "low",
    };
  }

  return {
    familyLabel: localize(
      "Aucun composant critique identifié",
      "No critical component identified",
      "No critical component identified",
    ),
    primarySignal: topDriver ? driverLabel : localize("Lecture stable", "Stable reading", "Stable reading"),
    summary: localize(
      "Aucun composant ne se détache nettement pour le moment. La machine reste suivie par le HI, le RUL et le stress.",
      "No component stands out clearly for now. The machine remains tracked through HI, RUL, and stress.",
      "No component stands out clearly for now. The machine remains tracked through HI, RUL, and stress.",
    ),
    evidence: evidence.length > 0 ? evidence : [localize("Pas d'alerte experte active", "No active expert alert", "No active expert alert")],
    confidenceLabel: localize("Pas de piste dominante", "No dominant lead", "No dominant lead"),
    confidenceTone: "low",
  };
}
