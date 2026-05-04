import type { DemoScenario, Machine } from "@/data/machines";
import { resolveDemoFlag } from "@/lib/appMode";

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

  if (["good", "ok", "stable", "operational"].includes(token)) {
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
