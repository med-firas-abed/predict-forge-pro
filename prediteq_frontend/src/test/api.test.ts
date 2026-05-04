import { beforeEach, describe, expect, it, vi } from "vitest";

const authClientMocks = vi.hoisted(() => ({
  getAuthSession: vi.fn(),
  refreshAuthSession: vi.fn(),
  signOutAuth: vi.fn(),
}));

vi.mock("@/lib/authClient", () => authClientMocks);

import { apiFetch } from "@/lib/api";

describe("apiFetch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    authClientMocks.getAuthSession.mockResolvedValue({
      data: { session: { access_token: "test-token-123" } },
    });
    authClientMocks.refreshAuthSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    authClientMocks.signOutAuth.mockResolvedValue(undefined);
  });

  it("calls fetch with correct URL and auth header", async () => {
    const mockData = { machines: [] };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    });

    const result = await apiFetch("/machines");

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/machines"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-token-123",
          "Content-Type": "application/json",
        }),
      }),
    );
    expect(result).toEqual(mockData);
  });

  it("throws on non-OK response with status and body", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve("Not Found"),
    });

    await expect(apiFetch("/missing")).rejects.toThrow("API 404: Not Found");
  });

  it("merges custom headers with auth headers", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await apiFetch("/test", {
      headers: { "X-Custom": "value" },
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Custom": "value",
          Authorization: "Bearer test-token-123",
        }),
      }),
    );
  });

  it("passes method and body through options", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });

    await apiFetch("/machines", {
      method: "POST",
      body: JSON.stringify({ name: "test" }),
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "test" }),
      }),
    );
  });

  it("uses a custom timeout when provided", async () => {
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });

    await apiFetch("/machines", {
      timeoutMs: 90_000,
    });

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 90_000);
  });

  it("does not sign out when a 401 happens but the session is still recoverable", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Unauthorized"),
    });

    authClientMocks.getAuthSession
      .mockResolvedValueOnce({
        data: { session: { access_token: "stale-token" } },
      })
      .mockResolvedValueOnce({
        data: { session: { access_token: "fresh-token" } },
      });

    await expect(apiFetch("/machines")).rejects.toThrow("API 401: Unauthorized");
    expect(authClientMocks.signOutAuth).not.toHaveBeenCalled();
  });

  it("signs out only when a 401 happens and no session can be recovered", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Unauthorized"),
    });

    authClientMocks.getAuthSession
      .mockResolvedValueOnce({
        data: { session: { access_token: "stale-token" } },
      })
      .mockResolvedValueOnce({
        data: { session: null },
      });

    authClientMocks.refreshAuthSession
      .mockResolvedValueOnce({
        data: { session: null },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { session: null },
        error: null,
      });

    await expect(apiFetch("/machines")).rejects.toThrow("Session expirée");
    expect(authClientMocks.signOutAuth).toHaveBeenCalledTimes(1);
  });
});
