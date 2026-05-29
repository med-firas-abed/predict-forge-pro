import { describe, expect, it } from "vitest";

import { resolveFallbackResilienceStatus } from "@/contexts/ResilienceContext";

describe("resolveFallbackResilienceStatus", () => {
  it("keeps the app in starting mode before the first live success", () => {
    expect(resolveFallbackResilienceStatus(false, null, 40_000, 50_000)).toBe("starting");
  });

  it("switches to offline if startup never recovers after the grace window", () => {
    expect(resolveFallbackResilienceStatus(false, null, 10_000, 31_000)).toBe("offline");
  });

  it("keeps a short grace window after a recent live success", () => {
    expect(resolveFallbackResilienceStatus(true, 10_000, 0, 25_000)).toBe("starting");
  });

  it("falls back to offline after the grace window expires", () => {
    expect(resolveFallbackResilienceStatus(true, 10_000, 0, 31_000)).toBe("offline");
  });
});
