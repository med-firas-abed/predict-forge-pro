import { describe, expect, it } from "vitest";

import type { Machine } from "@/data/machines";
import { getDefaultDashboardMachineId } from "@/lib/dashboardSelection";

function makeMachine(
  id: string,
  status: Machine["status"],
  hi: number | null,
): Machine {
  return {
    id,
    name: id,
    loc: "",
    city: "",
    lat: 0,
    lon: 0,
    hi,
    rul: null,
    rulci: null,
    status,
    vib: null,
    curr: null,
    temp: null,
    anom: 0,
    cycles: null,
    model: "",
    floors: 0,
    last: "",
  };
}

describe("getDefaultDashboardMachineId", () => {
  it("prefers ASC-A1 when it is present", () => {
    const machines = [
      makeMachine("ARO-01", "degraded", 0.7),
      makeMachine("ASC-A1", "ok", 0.96),
      makeMachine("ASC-C3", "critical", 0.1),
    ];

    expect(getDefaultDashboardMachineId(machines, ["ASC-C3", "ARO-01"])).toBe("ASC-A1");
  });

  it("falls back to the healthiest operational machine when ASC-A1 is absent", () => {
    const machines = [
      makeMachine("ARO-01", "ok", 0.72),
      makeMachine("MCH-02", "ok", 0.91),
      makeMachine("ASC-C3", "critical", 0.1),
    ];

    expect(getDefaultDashboardMachineId(machines, ["ASC-C3", "ARO-01"])).toBe("MCH-02");
  });

  it("falls back to the ranked list, then the first machine", () => {
    expect(getDefaultDashboardMachineId([], ["ARO-01"])).toBe("ARO-01");
    expect(getDefaultDashboardMachineId([makeMachine("ARO-01", "degraded", 0.6)], [])).toBe("ARO-01");
  });
});
