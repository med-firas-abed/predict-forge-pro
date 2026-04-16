import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabase module
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: () =>
        Promise.resolve({
          data: { session: { access_token: "test-token-123" } },
        }),
    },
  },
}));

import { apiFetch } from "@/lib/api";

describe("apiFetch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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
      })
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
      })
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
      })
    );
  });
});
