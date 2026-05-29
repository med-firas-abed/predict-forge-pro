import { describe, expect, it } from "vitest";

import {
  getMachinePublicLabel,
  replaceMachineCodesForDisplay,
} from "@/lib/machinePresentation";

describe("getMachinePublicLabel", () => {
  it("keeps demo fleet labels ordinal for ASC demo codes", () => {
    expect(getMachinePublicLabel({ id: "ASC-A1" })).toBe("Machine 1");
    expect(getMachinePublicLabel({ id: "ASC-B2" })).toBe("Machine 2");
    expect(getMachinePublicLabel({ id: "ASC-C3" })).toBe("Machine 3");
  });

  it("respects explicit public machine names when they are already generic", () => {
    expect(getMachinePublicLabel({ id: "ARO-01", name: "Machine AroTeq" })).toBe("Machine AroTeq");
    expect(getMachinePublicLabel("Machine 5")).toBe("Machine 5");
  });

  it("preserves non-demo live machine codes instead of collapsing them to duplicate ordinals", () => {
    expect(getMachinePublicLabel({ id: "ARO-01", name: "ARO Real Machine" })).toBe("Machine ARO-01");
    expect(getMachinePublicLabel("ARO-01")).toBe("Machine ARO-01");
  });

  it("replaces demo machine codes inside visible text", () => {
    expect(replaceMachineCodesForDisplay("Intervention corrective ASC-C3 - vibration")).toBe(
      "Intervention corrective Machine 3 - vibration",
    );
    expect(replaceMachineCodesForDisplay("Machine ASC-B2 deja planifiee")).toBe(
      "Machine 2 d\u00e9j\u00e0 planifiee",
    );
  });
});
