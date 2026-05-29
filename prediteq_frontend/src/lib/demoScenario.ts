import type { DemoScenario, Machine } from "@/data/machines";
import { resolveDemoFlag } from "@/lib/appMode";
import { repairText } from "@/lib/repairText";

export type DemoStoryState = "stable" | "watch" | "critical";

export type DemoScenarioFactorKey =
  | "usage_intensity"
  | "wear_level"
  | "thermal_stress"
  | "humidity_stress"
  | "load_variability"
  | "overload_bias";

export interface DemoScenarioFactor {
  key: DemoScenarioFactorKey;
  value: number;
}

type Localize = (fr: string, en: string, ar: string) => string;

const SURFACE_DEMO_METADATA = resolveDemoFlag(
  import.meta.env.VITE_SURFACE_PFE_DEMO_METADATA,
  true,
);
const SURFACE_DEMO_REFERENCE = resolveDemoFlag(
  import.meta.env.VITE_SURFACE_PFE_DEMO_REFERENCE,
  true,
);

function clampUnitValue(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function shouldSurfaceDemoMetadata() {
  return SURFACE_DEMO_METADATA;
}

export function shouldSurfaceDemoReference() {
  return SURFACE_DEMO_REFERENCE;
}

export function getMachineDemoScenario(
  machine?: Pick<Machine, "demoScenario"> | null,
): DemoScenario | null {
  return machine?.demoScenario ?? null;
}

export function getMachineDemoStoryState(
  machine?: Pick<Machine, "status" | "demoScenario"> | null,
): DemoStoryState | null {
  const token = (machine?.demoScenario?.health_state ?? machine?.status ?? "")
    .trim()
    .toLowerCase();

  if (["good", "healthy", "ok", "stable", "operational"].includes(token)) {
    return "stable";
  }

  if (["surveillance", "degraded", "watch", "warning", "monitoring"].includes(token)) {
    return "watch";
  }

  if (["critical", "critique"].includes(token)) {
    return "critical";
  }

  return null;
}

export function getDemoStoryMachines<
  T extends Pick<Machine, "id" | "name" | "status" | "demoScenario">,
>(machines: T[]) {
  const storyOrder: DemoStoryState[] = ["stable", "watch", "critical"];
  const byState: Partial<Record<DemoStoryState, T>> = {};

  for (const machine of machines) {
    if (!machine.demoScenario) {
      continue;
    }
    const state = getMachineDemoStoryState(machine);
    if (!state || byState[state]) continue;
    byState[state] = machine;
  }

  return storyOrder
    .map((state) => {
      const machine = byState[state];
      return machine ? { state, machine } : null;
    })
    .filter((item): item is { state: DemoStoryState; machine: T } => Boolean(item));
}

export function getSurfaceableMachineDemoScenario(
  machine?: Pick<Machine, "demoScenario"> | null,
): DemoScenario | null {
  if (!SURFACE_DEMO_METADATA) return null;
  return getMachineDemoScenario(machine);
}

export function getMachineDemoReferenceDays(
  machine?: Pick<Machine, "demoScenario" | "rulReferenceDays"> | null,
): number | null {
  if (typeof machine?.rulReferenceDays === "number" && Number.isFinite(machine.rulReferenceDays)) {
    return machine.rulReferenceDays;
  }
  const scenarioReference = machine?.demoScenario?.reference_rul_days;
  return typeof scenarioReference === "number" && Number.isFinite(scenarioReference)
    ? scenarioReference
    : null;
}

export function getSurfaceableMachineDemoReferenceDays(
  machine?: Pick<Machine, "demoScenario" | "rulReferenceDays"> | null,
): number | null {
  if (!SURFACE_DEMO_REFERENCE) return null;
  return getMachineDemoReferenceDays(machine);
}

export function getDemoScenarioFactors(
  scenario?: DemoScenario | null,
): DemoScenarioFactor[] {
  if (!scenario) return [];

  return [
    { key: "usage_intensity", value: clampUnitValue(scenario.usage_intensity) },
    { key: "wear_level", value: clampUnitValue(scenario.wear_level) },
    { key: "thermal_stress", value: clampUnitValue(scenario.thermal_stress) },
    { key: "humidity_stress", value: clampUnitValue(scenario.humidity_stress) },
    { key: "load_variability", value: clampUnitValue(scenario.load_variability) },
    { key: "overload_bias", value: clampUnitValue(scenario.overload_bias) },
  ];
}

function getAverageLoadKg(scenario?: DemoScenario | null) {
  if (!scenario) return null;
  if (Array.isArray(scenario.load_band_kg) && scenario.load_band_kg.length === 2) {
    const [minLoad, maxLoad] = scenario.load_band_kg;
    if (Number.isFinite(minLoad) && Number.isFinite(maxLoad)) {
      return (Number(minLoad) + Number(maxLoad)) / 2;
    }
  }
  return typeof scenario.base_load_kg === "number" && Number.isFinite(scenario.base_load_kg)
    ? scenario.base_load_kg
    : null;
}

function getScenarioEnvironmentScore(scenario?: DemoScenario | null) {
  return Math.max(
    clampUnitValue(scenario?.thermal_stress),
    clampUnitValue(scenario?.humidity_stress),
  );
}

function ensureTrailingPeriod(text: string) {
  const trimmed = repairText(text).trim();
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

export function describeAudienceScenarioUsageCase(
  scenario: DemoScenario | null | undefined,
  localize: Localize,
) {
  const explicit = repairText(scenario?.usage_case ?? "");
  if (explicit) {
    return ensureTrailingPeriod(explicit);
  }

  if (!scenario) {
    return localize(
      "Contexte d'exploitation non détaillé pour cette machine.",
      "Operating context is not detailed for this machine.",
      "Operating context is not detailed for this machine.",
    );
  }

  const cycles = typeof scenario.cycles_per_day === "number" ? scenario.cycles_per_day : null;
  const averageLoad = getAverageLoadKg(scenario);
  const environmentScore = getScenarioEnvironmentScore(scenario);

  const cadenceLabel =
    cycles != null && cycles >= 700
      ? localize("Cadence soutenue", "Sustained cadence", "Sustained cadence")
      : cycles != null && cycles >= 420
        ? localize("Cadence reguliere", "Regular cadence", "Regular cadence")
        : localize("Cadence moderee", "Moderate cadence", "Moderate cadence");
  const loadLabel =
    averageLoad != null && averageLoad >= 200
      ? localize("charges lourdes", "heavy loads", "heavy loads")
      : averageLoad != null && averageLoad >= 100
        ? localize("charges mixtes", "mixed loads", "mixed loads")
        : localize("charges legeres", "light loads", "light loads");
  const environmentLabel =
    environmentScore >= 0.65
      ? localize("ambiance exigeante", "demanding environment", "demanding environment")
      : environmentScore >= 0.35
        ? localize("ambiance moderee", "moderate environment", "moderate environment")
        : localize("ambiance maitrisee", "controlled environment", "controlled environment");

  return `${cadenceLabel}, ${loadLabel} et ${environmentLabel}.`;
}

export function describeAudienceScenarioExplanation(
  scenario: DemoScenario | null | undefined,
  localize: Localize,
) {
  if (!scenario) {
    return localize(
      "Cette vue relie le contexte d'usage de la machine a l'evolution du HI et de la marge RUL.",
      "This view links the machine operating context to HI drift and remaining-life margin.",
      "This view links the machine operating context to HI drift and remaining-life margin.",
    );
  }

  const explicit = repairText(scenario.explanation ?? "");
  const wear = clampUnitValue(scenario.wear_level);
  const overload = clampUnitValue(scenario.overload_bias);
  const intensity = clampUnitValue(scenario.usage_intensity);
  const environmentScore = getScenarioEnvironmentScore(scenario);

  const derivedLead =
    wear >= 0.75
      ? localize(
          "La machine part d'une usure deja avancee",
          "The machine starts from already advanced wear",
          "The machine starts from already advanced wear",
        )
      : wear >= 0.4
        ? localize(
            "La machine part d'une usure intermediaire",
            "The machine starts from intermediate wear",
            "The machine starts from intermediate wear",
          )
        : localize(
            "La machine part d'une usure encore contenue",
            "The machine starts from still-contained wear",
            "The machine starts from still-contained wear",
          );
  const overloadLead =
    overload >= 0.45
      ? localize(
          "avec des pointes de charge repetees",
          "with repeated load spikes",
          "with repeated load spikes",
        )
      : overload >= 0.2
        ? localize(
            "avec quelques pointes de charge",
            "with occasional load spikes",
            "with occasional load spikes",
          )
        : localize(
            "sans surcharge marquee",
            "without marked overload",
            "without marked overload",
          );
  const environmentLead =
    environmentScore >= 0.65
      ? localize(
          "dans un environnement plus agressif",
          "in a harsher environment",
          "in a harsher environment",
        )
      : environmentScore >= 0.35
        ? localize(
            "dans un environnement modere",
            "in a moderate environment",
            "in a moderate environment",
          )
        : localize(
            "dans un environnement plutot stable",
            "in a mostly stable environment",
            "in a mostly stable environment",
          );
  const intensityTail =
    intensity >= 0.75
      ? localize(
          "Cette combinaison accelere la derive HI et raccourcit plus vite la marge RUL affichee.",
          "This combination accelerates HI drift and shortens the displayed RUL margin faster.",
          "This combination accelerates HI drift and shortens the displayed RUL margin faster.",
        )
      : intensity >= 0.45
        ? localize(
            "Cette combinaison maintient une surveillance active du HI et de la marge RUL.",
            "This combination keeps HI and RUL margin under active watch.",
            "This combination keeps HI and RUL margin under active watch.",
          )
        : localize(
            "Cette combinaison laisse une evolution plus progressive du HI et de la marge RUL.",
            "This combination keeps HI and RUL margin on a more gradual path.",
            "This combination keeps HI and RUL margin on a more gradual path.",
          );

  const baseText =
    explicit ||
    `${derivedLead}, ${overloadLead} et ${environmentLead}.`;

  return `${ensureTrailingPeriod(baseText)} ${intensityTail}`;
}
