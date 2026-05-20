import type { Machine } from "@/data/machines";

const PREFERRED_DASHBOARD_MACHINE_ID = "ASC-A1";

export function getDefaultDashboardMachineId(
  machines: Machine[],
  rankedMachineIds: string[],
): string {
  const preferredDemoMachine = machines.find(
    (machine) => machine.id === PREFERRED_DASHBOARD_MACHINE_ID,
  );
  if (preferredDemoMachine) {
    return preferredDemoMachine.id;
  }

  const healthiestOperationalMachine = [...machines]
    .filter((machine) => machine.status === "ok")
    .sort((left, right) => (right.hi ?? -1) - (left.hi ?? -1))[0];
  if (healthiestOperationalMachine) {
    return healthiestOperationalMachine.id;
  }

  return rankedMachineIds[0] || machines[0]?.id || "";
}
