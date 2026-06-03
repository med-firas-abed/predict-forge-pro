import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/apiBase", () => ({
  API_BASE: "/api",
}));

describe("installBackendWarmup", () => {
  let visibilityState: DocumentVisibilityState = "visible";

  beforeEach(() => {
    vi.useFakeTimers();
    visibilityState = "visible";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: "ok" }),
    }) as typeof fetch;

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibilityState,
    });

    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      get: () => true,
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("warms immediately and refreshes only while the page is visible", async () => {
    const { installBackendWarmup } = await import("@/lib/backendWarmup");

    const stop = installBackendWarmup();
    await Promise.resolve();

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/health",
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
      }),
    );

    await vi.advanceTimersByTimeAsync(4 * 60_000);
    expect(global.fetch).toHaveBeenCalledTimes(2);

    visibilityState = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(4 * 60_000);
    expect(global.fetch).toHaveBeenCalledTimes(2);

    visibilityState = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    await Promise.resolve();
    expect(global.fetch).toHaveBeenCalledTimes(3);

    stop();
  });
});
