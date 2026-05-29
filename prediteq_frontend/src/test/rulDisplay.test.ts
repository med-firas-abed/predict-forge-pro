import { describe, expect, it } from "vitest";

import { formatPredictiveRul } from "@/lib/predictiveLive";
import { buildRulDisplay } from "@/lib/rulDisplay";

const localize = (fr: string) => fr;

describe("buildRulDisplay", () => {
  it("prefers pipeline reference days over lifetime years in reference mode", () => {
    const state = buildRulDisplay({
      machine: {
        rulReferenceDays: 147.2,
        rulReferenceKind: "last_valid",
        referenceLifetimeYears: 5.4,
      } as never,
      predictionMode: "reference_only",
      prediction: null,
      localize,
    });

    expect(state.source).toBe("reference_projection");
    expect(state.value).toBe("~147.2 j");
    expect(state.sub).toMatch(/Dernière estimation valide/i);
  });

  it("stays in warm-up when only a static demo reference exists", () => {
    const state = buildRulDisplay({
      machine: {
        demoScenario: {
          reference_rul_days: 92,
        },
      } as never,
      predictionMode: "initializing",
      prediction: null,
      localize,
    });

    expect(state.source).toBe("initializing");
    expect(state.value).toBe("Marge restante en préparation");
  });
});

describe("formatPredictiveRul", () => {
  it("surfaces dynamic reference days before falling back to lifetime years", () => {
    expect(
      formatPredictiveRul(
        {
          predictionMode: "reference_only",
          machine: {
            rulReferenceDays: 88,
            referenceLifetimeYears: 5.1,
          },
        } as never,
      ),
    ).toBe("~88 j");
  });
});
