import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiFetchMock = vi.hoisted(() => vi.fn());
const createMachineRecordMock = vi.hoisted(() => vi.fn());
const deleteMachineRecordMock = vi.hoisted(() => vi.fn());
const updateMachineRecordMock = vi.hoisted(() => vi.fn());
const subscribeToMachineChangesMock = vi.hoisted(() => vi.fn(() => () => {}));

vi.mock("@/lib/api", () => ({
  apiFetch: apiFetchMock,
}));

vi.mock("@/lib/runtimeDataRepository", () => ({
  createMachineRecord: createMachineRecordMock,
  deleteMachineRecord: deleteMachineRecordMock,
  subscribeToMachineChanges: subscribeToMachineChangesMock,
  updateMachineRecord: updateMachineRecordMock,
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
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
      <div data-testid="machine-coords">
        {machines[0] ? `${machines[0].lat.toFixed(4)},${machines[0].lon.toFixed(4)}` : "none"}
      </div>
      <div data-testid="error">{error ? "error" : "ok"}</div>
    </div>
  );
}

function MutationHarness() {
  const { deleteMachine } = useMachines();

  return (
    <button type="button" onClick={() => deleteMachine.mutate("ASC-A1")}>
      delete
    </button>
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

function renderMutationHarness() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  const renderResult = render(
    <QueryClientProvider client={queryClient}>
      <MutationHarness />
    </QueryClientProvider>,
  );

  return { queryClient, ...renderResult };
}

describe("useMachines", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    createMachineRecordMock.mockReset();
    deleteMachineRecordMock.mockReset();
    subscribeToMachineChangesMock.mockClear();
    updateMachineRecordMock.mockReset();
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

  it("repairs missing live coordinates with the machine region inside Tunisia", async () => {
    apiFetchMock.mockResolvedValue([
      {
        id: "56408f81-3f91-453a-b392-0e8f1fba73d4",
        code: "ARO-01",
        nom: "Machine AroTeq",
        region: "Ben Arous",
        emplacement: "Usine Aroteq - Ben Arous",
        latitude: 0,
        longitude: 0,
        statut: "degraded",
      },
    ]);

    renderWithQueryClient();

    await waitFor(() => {
      expect(screen.getByTestId("count")).toHaveTextContent("1");
    });
    expect(screen.getByTestId("machine-id")).toHaveTextContent("ARO-01");
    expect(screen.getByTestId("machine-coords")).toHaveTextContent("36.7537,10.2189");
    expect(screen.getByTestId("error")).toHaveTextContent("ok");
  });

  it("pins the real machine to the exact AroTeq site in Ben Arous even when live coordinates differ", async () => {
    apiFetchMock.mockResolvedValue([
      {
        id: "56408f81-3f91-453a-b392-0e8f1fba73d4",
        code: "ARO-01",
        nom: "Machine AroTeq",
        region: "Tunis",
        emplacement: "Coordonnees source incorrectes",
        latitude: 36.801,
        longitude: 10.174,
        statut: "degraded",
      },
    ]);

    renderWithQueryClient();

    await waitFor(() => {
      expect(screen.getByTestId("count")).toHaveTextContent("1");
    });
    expect(screen.getByTestId("machine-id")).toHaveTextContent("ARO-01");
    expect(screen.getByTestId("machine-coords")).toHaveTextContent("36.7537,10.2189");
    expect(screen.getByTestId("error")).toHaveTextContent("ok");
  });

  it("keeps the good showcase machine anchored in Bizerte across cached fallback data", async () => {
    window.localStorage.setItem(
      MACHINE_CACHE_KEY,
      JSON.stringify([
        {
          id: "ASC-A1",
          uuid: "machine-1",
          name: "Machine 1",
          loc: "Atelier test",
          city: "Sfax",
          lat: 34.7398,
          lon: 10.76,
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
    apiFetchMock.mockRejectedValue(new Error("network down"));

    renderWithQueryClient();

    await waitFor(() => {
      expect(screen.getByTestId("count")).toHaveTextContent("1");
    });
    expect(screen.getByTestId("machine-id")).toHaveTextContent("ASC-A1");
    expect(screen.getByTestId("machine-coords")).toHaveTextContent("37.2744,9.8739");
    expect(screen.getByTestId("error")).toHaveTextContent("ok");
  });

  it("invalidates machine-dependent queries after deleting a machine", async () => {
    apiFetchMock.mockResolvedValue([]);
    deleteMachineRecordMock.mockResolvedValue(undefined);

    const { queryClient } = renderMutationHarness();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    fireEvent.click(screen.getByRole("button", { name: "delete" }));

    await waitFor(() => {
      expect(deleteMachineRecordMock).toHaveBeenCalledWith("ASC-A1");
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["machines"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["couts"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["gmao_taches"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["alertes"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["alert-email-history"] });
  });
});
