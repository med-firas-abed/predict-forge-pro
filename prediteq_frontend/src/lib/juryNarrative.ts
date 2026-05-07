import type { DemoScenario } from "@/data/machines";
import { repairText } from "@/lib/repairText";

export type Localize = (fr: string, en: string, ar: string) => string;

export function normalizeAudienceToken(value: string | null | undefined) {
  return repairText(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function hasAnyToken(text: string, patterns: string[]) {
  return patterns.some((pattern) => text.includes(pattern));
}

export function formatAudienceAxisLabel(axis: string | null | undefined, localize: Localize) {
  const token = normalizeAudienceToken(axis);

  if (token === "thermal" || token === "thermique") {
    return localize("Température", "Temperature", "Temperature");
  }

  if (token === "vibration" || token === "vibratoire") {
    return localize("Vibration", "Vibration", "Vibration");
  }

  if (token === "load" || token === "charge") {
    return localize("Charge", "Load", "Load");
  }

  if (token === "variability" || token === "variabilite") {
    return localize("Régime instable", "Unstable operating pattern", "Unstable operating pattern");
  }

  return repairText(axis ?? "") || localize("Non précisé", "Unspecified", "Unspecified");
}

export function formatAudienceFeatureLabel(
  feature: string | null | undefined,
  localize: Localize,
) {
  const token = normalizeAudienceToken(feature);

  if (hasAnyToken(token, ["corr_t_p", "correlation temp", "lien temperature", "lien charge"])) {
    return localize(
      "Lien charge / température",
      "Load / temperature link",
      "Load / temperature link",
    );
  }

  if (hasAnyToken(token, ["hi moyen", "hi_mean"])) {
    return localize("Usure récente", "Recent wear", "Recent wear");
  }

  if (hasAnyToken(token, ["hi instant", "hi actuel", "hi_current", "hi_now"])) {
    return localize("État actuel", "Current state", "Current state");
  }

  if (hasAnyToken(token, ["hi minimum", "hi_minimum", "hi min"])) {
    return localize("Point bas récent", "Recent low point", "Recent low point");
  }

  if (hasAnyToken(token, ["variabilite vibration", "vibration variability"])) {
    return localize("Vibration irrégulière", "Irregular vibration", "Irregular vibration");
  }

  if (hasAnyToken(token, ["courant", "current", "i_rms", "current_a"])) {
    return localize("Courant moteur", "Motor current", "Motor current");
  }

  if (hasAnyToken(token, ["power", "puissance", "p_mean_kw"])) {
    return localize("Puissance absorbée", "Absorbed power", "Absorbed power");
  }

  if (hasAnyToken(token, ["humid", "humidity"])) {
    return localize("Humidité", "Humidity", "Humidity");
  }

  if (hasAnyToken(token, ["temp", "temperature"])) {
    return localize("Température récente", "Recent temperature", "Recent temperature");
  }

  if (hasAnyToken(token, ["vib", "rms_mms", "vibration"])) {
    return localize("Vibration moteur", "Motor vibration", "Motor vibration");
  }

  if (hasAnyToken(token, ["phase"])) {
    return localize("Écart de phase", "Phase imbalance", "Phase imbalance");
  }

  return repairText(feature ?? "") || localize("Facteur non précisé", "Unspecified factor", "Unspecified factor");
}

export function formatAudienceConfidenceLabel(
  confidence: string | null | undefined,
  localize: Localize,
) {
  const token = normalizeAudienceToken(confidence);

  if (token === "high" || token === "elevee" || token === "elevée") {
    return localize("Lecture solide", "Solid reading", "Solid reading");
  }

  if (token === "medium" || token === "moyenne" || token === "moderate" || token === "modere") {
    return localize("Lecture utilisable", "Usable reading", "Usable reading");
  }

  if (token === "low" || token === "faible") {
    return localize("À confirmer sur site", "Confirm on site", "Confirm on site");
  }

  return repairText(confidence ?? "") || localize("Lecture en cours", "Reading in progress", "Reading in progress");
}

export function describeAudienceUsageRegime(
  scenario: DemoScenario | null | undefined,
  localize: Localize,
) {
  const intensity = typeof scenario?.usage_intensity === "number" ? scenario.usage_intensity : 0;
  const wear = typeof scenario?.wear_level === "number" ? scenario.wear_level : 0;
  const overload = typeof scenario?.overload_bias === "number" ? scenario.overload_bias : 0;
  const score = Math.max(intensity, wear, overload);

  if (score >= 0.8) {
    return localize("Usage sévère", "Heavy-duty use", "Heavy-duty use");
  }

  if (score >= 0.45) {
    return localize("Usage mixte", "Mixed use", "Mixed use");
  }

  return localize("Usage modéré", "Moderate use", "Moderate use");
}

export function shortenAudienceAction(
  actionText: string | null | undefined,
  componentFamily: string | null | undefined,
  localize: Localize,
) {
  const token = normalizeAudienceToken(`${actionText ?? ""} ${componentFamily ?? ""}`);

  if (
    hasAnyToken(token, [
      "mcsa",
      "courant",
      "phase",
      "rotor",
      "spires",
      "isolation",
      "moteur",
      "alimentation",
    ])
  ) {
    return localize(
      "Contrôler d'abord le moteur et l'alimentation.",
      "Check the motor and power supply first.",
      "Check the motor and power supply first.",
    );
  }

  if (
    hasAnyToken(token, [
      "vibration",
      "balourd",
      "desalign",
      "alignement",
      "roulement",
      "palier",
      "transmission",
    ])
  ) {
    return localize(
      "Contrôler d'abord la chaîne mécanique et la vibration.",
      "Check the mechanical chain and vibration first.",
      "Check the mechanical chain and vibration first.",
    );
  }

  if (
    hasAnyToken(token, [
      "therm",
      "temperature",
      "surchauffe",
      "echauff",
      "ventilation",
      "refroid",
    ])
  ) {
    return localize(
      "Contrôler d'abord l'échauffement et le refroidissement.",
      "Check heating and cooling first.",
      "Check heating and cooling first.",
    );
  }

  return localize(
    "Contrôler d'abord la zone la plus sollicitée.",
    "Check the most stressed area first.",
    "Check the most stressed area first.",
  );
}

export function shortenAudienceWindow(
  value: string | null | undefined,
  status: string | null | undefined,
  localize: Localize,
) {
  const token = normalizeAudienceToken(value);

  if (token.includes("1-4 semaines")) {
    return localize("Sous 1-4 semaines", "Within 1-4 weeks", "Within 1-4 weeks");
  }

  if (token.includes("2-6 semaines")) {
    return localize("Sous 2-6 semaines", "Within 2-6 weeks", "Within 2-6 weeks");
  }

  if (token.includes("prioritaire")) {
    return localize("Priorité terrain", "Field priority", "Field priority");
  }

  const statusToken = normalizeAudienceToken(status);
  if (statusToken === "critical" || statusToken === "critique") {
    return localize("Sous 1-4 semaines", "Within 1-4 weeks", "Within 1-4 weeks");
  }
  if (statusToken === "degraded" || statusToken === "surveillance") {
    return localize("À planifier", "To plan", "To plan");
  }
  return localize("Suivi normal", "Routine follow-up", "Routine follow-up");
}
