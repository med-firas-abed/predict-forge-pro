import { describe, it, expect } from "vitest";
import { MACHINES, STATUS_CONFIG, genHI } from "@/data/machines";

describe("MACHINES data", () => {
  it("contains exactly 3 machines", () => {
    expect(MACHINES).toHaveLength(3);
  });

  it("each machine has required fields", () => {
    for (const m of MACHINES) {
      expect(m.id).toBeTruthy();
      expect(m.name).toBeTruthy();
      expect(m.lat).toBeGreaterThan(0);
      expect(m.lon).toBeGreaterThan(0);
      expect(["ok", "degraded", "critical", "maintenance"]).toContain(m.status);
      expect(m.hi).toBeGreaterThanOrEqual(0);
      expect(m.hi).toBeLessThanOrEqual(1);
    }
  });

  it("machines have unique IDs", () => {
    const ids = MACHINES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ASC-A1 is ok, ASC-B2 is degraded, ASC-C3 is critical", () => {
    const statusMap = Object.fromEntries(MACHINES.map((m) => [m.id, m.status]));
    expect(statusMap["ASC-A1"]).toBe("ok");
    expect(statusMap["ASC-B2"]).toBe("degraded");
    expect(statusMap["ASC-C3"]).toBe("critical");
  });
});

describe("STATUS_CONFIG", () => {
  it("defines all 4 statuses", () => {
    expect(Object.keys(STATUS_CONFIG)).toEqual(
      expect.arrayContaining(["ok", "degraded", "critical", "maintenance"])
    );
  });

  it("each status has label, pillClass, and hex", () => {
    for (const cfg of Object.values(STATUS_CONFIG)) {
      expect(cfg.label).toBeTruthy();
      expect(cfg.pillClass).toMatch(/^status-pill--/);
      expect(cfg.hex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe("genHI", () => {
  it("generates array of requested length", () => {
    const result = genHI(0.8, 50);
    expect(result).toHaveLength(50);
  });

  it("defaults to 90 data points", () => {
    const result = genHI(0.6);
    expect(result).toHaveLength(90);
  });

  it("ends with the base value", () => {
    const base = 0.75;
    const result = genHI(base);
    expect(result[result.length - 1]).toBe(base);
  });

  it("all values are between 0 and 1", () => {
    const result = genHI(0.5, 200);
    for (const v of result) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
