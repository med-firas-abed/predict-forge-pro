import { describe, expect, it } from "vitest";

import { shortenAudienceWindow } from "@/lib/juryNarrative";

const localize = (fr: string) => fr;

describe("shortenAudienceWindow", () => {
  it("keeps urgent hour-based windows explicit", () => {
    expect(shortenAudienceWindow("Inspection visuelle + vibrométrique sous 72 h", "critical", localize)).toBe(
      "Sous 72 h",
    );
    expect(shortenAudienceWindow("Fenêtre utile sous 48 h", "critical", localize)).toBe("Sous 48 h");
  });

  it("falls back to field priority for critical states", () => {
    expect(shortenAudienceWindow(null, "critical", localize)).toBe("Priorité terrain");
    expect(shortenAudienceWindow("Contrôle terrain prioritaire", "critical", localize)).toBe(
      "Priorité terrain",
    );
  });
});
