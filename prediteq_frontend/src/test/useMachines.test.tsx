import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiFetchMock = vi.hoisted(() => vi.fn());
const subscribeToMachineChangesMock = vi.hoisted(() => vi.fn(() => () => {}));

vi.mock("@/lib/api", () => ({
  apiFetch: apiFetchMock,
}));

vi.mock("@/lib/runtimeDataRepository", () => ({
  createMachineRecord: vi.fn(),
  deleteMachineRecord: vi.fn(),
  subscribeToMachineChanges: subscribeToMachineChangesMock,
  updateMachineRecord: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

import { useMachines } from "@/hooks/useMachines";

const MACHINE_CACHE_KEY = "prediteq-machine-cache-v5:all";
const MACHINE_SCOPE_CACHE_KEY = "prediteq-machine-cache-v5:machine-2";

function TestHarness({ machineId }: { machineId?: string }) {
  const { machines, error } = useMachines(machineId);

  return (
    <div>
      <div data-testid="count">{machines.length}</div>
      <div data-testid="machine-id">{machines[0]?.id ?? "none"}</div>
      <div data-testid="error">{error ? "error" : "ok"}</div>
    </div>
  );
}

function renderWithQueryClient(machineId?: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <TestHarness machineId={machineId} />
    </QueryClientProvider>,
  );
}

describe("useMachines", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    subscribeToMachineChangesMock.mockClear();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("replaces stale cached machines with a legitimate empty live response", async () => {
    window.localStorage.setItem(
      MACHINE_CACHE_KEY,
      JSON.stringify([
        {
          id: "ASC-A1",
          uuid: "machine-1",
          name: "Machine 1",
          loc: "Site Nord - Bizerte",
          city: "Bizerte",
          lat: 37.2744,
          lon: 9.8739,
          hi: 0.96,
          rul: 42,
          rulci: 5,
          rulMode: "prediction",
          rulIntervalLow: 37,
          rulIntervalHigh: 47,
          rulIntervalLabel: "37-47 jours",
          referenceLifetimeYears: 12,
          rulReferenceDays: 120,
          rulReferenceKind: "nominal",
          stopRecommended: false,
          status: "ok",
          vib: 1.1,
          curr: 8.3,
          currSource: "measured",
          temp: 32,
          anom: 0,
          cycles: 120,
          model: "SITI FC100L1-4",
          floors: 19,
          last: "08/05/2026 10:15",
          decision: null,
          demoScenario: null,
        },
      ]),
    );
    apiFetchMock.mockResolvedValue([]);

    renderWithQueryClient();

    expect(screen.getByTestId("count")).toHaveTextContent("1");

    await waitFor(() => {
      expect(screen.getByTestId("count")).toHaveTextContent("0");
    });
    expect(screen.getByTestId("error")).toHaveTextContent("ok");
    expect(window.localStorage.getItem(MACHINE_CACHE_KEY)).toBe("[]");
  });

  it("still falls back to cached machines when the live fetch fails", async () => {
    window.localStorage.setItem(
      MACHINE_CACHE_KEY,
      JSON.stringify([
        {
          id: "ASC-B2",
          uuid: "machine-2",
          name: "Machine 2",
          loc: "Sfax",
          city: "Sfax",
          lat: 34.7,
          lon: 10.8,
          hi: 0.62,
          rul: 18,
          rulci: 4,
          rulMode: "prediction",
          rulIntervalLow: 14,
          rulIntervalHigh: 22,
          rulIntervalLabel: "14-22 jours",
          referenceLifetimeYears: 10,
          rulReferenceDays: 90,
          rulReferenceKind: "nominal",
          stopRecommended: false,
          status: "degraded",
          vib: 2.6,
          curr: 9.4,
          currSource: "measured",
          temp: 37,
          anom: 2,
          cycles: 142,
          model: "SITI FC100L1-4",
          floors: 19,
          last: "08/05/2026 10:15",
          decision: null,
          demoScenario: null,
        },
      ]),
    );
    apiFetchMock.mockRejectedValue(new Error("network down"));

    renderWithQueryClient();

    await waitFor(() => {
      expect(screen.getByTestId("count")).toHaveTextContent("1");
    });
    expect(screen.getByTestId("error")).toHaveTextContent("ok");
  });

  it("filters cached fleet data down to the assigned machine scope", async () => {
    window.localStorage.setItem(
      MACHINE_CACHE_KEY,
      JSON.stringify([
        {
          id: "ASC-A1",
          uuid: "machine-1",
          name: "Machine 1",
          loc: "Site Nord - Bizerte",
          city: "Bizerte",
          lat: 37.2744,
          lon: 9.8739,
          hi: 0.96,
          rul: 42,
          rulci: 5,
          rulMode: "prediction",
          rulIntervalLow: 37,
          rulIntervalHigh: 47,
          rulIntervalLabel: "37-47 jours",
          referenceLifetimeYears: 12,
          rulReferenceDays: 120,
          rulReferenceKind: "nominal",
          stopRecommended: false,
          status: "ok",
          vib: 1.1,
          curr: 8.3,
          currSource: "measured",
          temp: 32,
          anom: 0,
          cycles: 120,
          model: "SITI FC100L1-4",
          floors: 19,
          last: "08/05/2026 10:15",
          decision: null,
          demoScenario: null,
        },
        {
          id: "ASC-B2",
          uuid: "machine-2",
          name: "Machine 2",
          loc: "Sfax",
          city: "Sfax",
          lat: 34.7,
          lon: 10.8,
          hi: 0.62,
          rul: 18,
          rulci: 4,
          rulMode: "prediction",
          rulIntervalLow: 14,
          rulIntervalHigh: 22,
          rulIntervalLabel: "14-22 jours",
          referenceLifetimeYears: 10,
          rulReferenceDays: 90,
          rulReferenceKind: "nominal",
          stopRecommended: false,
          status: "degraded",
          vib: 2.6,
          curr: 9.4,
          currSource: "measured",
          temp: 37,
          anom: 2,
          cycles: 142,
          model: "SITI FC100L1-4",
          floors: 19,
          last: "08/05/2026 10:15",
          decision: null,
          demoScenario: null,
        },
      ]),
    );
    apiFetchMock.mockRejectedValue(new Error("network down"));

    renderWithQueryClient("machine-2");

    await waitFor(() => {
      expect(screen.getByTestId("count")).toHaveTextContent("1");
    });
    expect(screen.getByTestId("machine-id")).toHaveTextContent("ASC-B2");
    expect(window.localStorage.getItem(MACHINE_SCOPE_CACHE_KEY)).toBeNull();
    expect(screen.getByTestId("error")).toHaveTextContent("ok");
  });
});
