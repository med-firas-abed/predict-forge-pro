import { describe, expect, it } from "vitest";

import { getDemoStoryMachines } from "@/lib/demoScenario";

describe("getDemoStoryMachines", () => {
  it("keeps the three simulator story machines when a healthy live machine is also present", () => {
    const machines = [
      {
        id: "ARO-01",
        name: "Machine AroTeq",
        status: "ok",
        demoScenario: null,
      },
      {
        id: "ASC-A1",
        name: "Machine 1",
        status: "ok",
        demoScenario: { health_state: "healthy" },
      },
      {
        id: "ASC-B2",
        name: "Machine 2",
        status: "degraded",
        demoScenario: { health_state: "surveillance" },
      },
      {
        id: "ASC-C3",
        name: "Machine 3",
        status: "critical",
        demoScenario: { health_state: "critical" },
      },
    ] as const;

    const result = getDemoStoryMachines(machines);

    expect(result.map((entry) => entry.machine.id)).toEqual([
      "ASC-A1",
      "ASC-B2",
      "ASC-C3",
    ]);
  });

  it("returns no simulator shortcuts when no demo scenario metadata is available", () => {
    const result = getDemoStoryMachines([
      {
        id: "ARO-01",
        name: "Machine AroTeq",
        status: "ok",
        demoScenario: null,
      },
    ]);

    expect(result).toEqual([]);
  });
});
