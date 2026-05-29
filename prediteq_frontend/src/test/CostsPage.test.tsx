import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CostsPage } from "@/components/pages/CostsPage";

const useAuthMock = vi.hoisted(() => vi.fn());
const useCoutsMock = vi.hoisted(() => vi.fn());
const useGmaoTachesMock = vi.hoisted(() => vi.fn());
const useMachinesMock = vi.hoisted(() => vi.fn());
const useFleetPredictiveInsightsMock = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/hooks/useCouts", () => ({
  useCouts: (...args: unknown[]) => useCoutsMock(...args),
}));

vi.mock("@/hooks/useGmaoTaches", () => ({
  useGmaoTaches: (...args: unknown[]) => useGmaoTachesMock(...args),
}));

vi.mock("@/hooks/useMachines", () => ({
  useMachines: (...args: unknown[]) => useMachinesMock(...args),
}));

vi.mock("@/hooks/useFleetPredictiveInsights", () => ({
  useFleetPredictiveInsights: (...args: unknown[]) => useFleetPredictiveInsightsMock(...args),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <CostsPage />
    </MemoryRouter>,
  );
}

describe("CostsPage", () => {
  beforeEach(() => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverMock);

    useAuthMock.mockReturnValue({
      currentUser: {
        role: "admin",
        machineId: undefined,
      },
    });

    useMachinesMock.mockReturnValue({
      machines: [
        {
          id: "ASC-A1",
          name: "Machine 1",
          city: "Bizerte",
          loc: "Site Nord",
        },
        {
          id: "ASC-B2",
          name: "Machine 2",
          city: "Sfax",
          loc: "Batiment B",
        },
      ],
    });

    useCoutsMock.mockReturnValue({
      couts: [
        {
          id: "cost-a1",
          machineCode: "ASC-A1",
          mois: 5,
          annee: 2026,
          mainOeuvre: 6000,
          pieces: 4000,
          total: 10000,
        },
        {
          id: "cost-b2",
          machineCode: "ASC-B2",
          mois: 5,
          annee: 2026,
          mainOeuvre: 1200,
          pieces: 800,
          total: 2000,
        },
      ],
    });

    useGmaoTachesMock.mockReturnValue({
      taches: [],
    });

    useFleetPredictiveInsightsMock.mockReturnValue({
      insights: [
        {
          urgencyScore: 20,
          urgencyBand: "stable",
          urgencyLabel: "Stable",
          stressValue: 0.05,
          machine: {
            id: "ASC-A1",
            name: "Machine 1",
            city: "Bizerte",
            loc: "Site Nord",
            hi: 0.95,
          },
          taskTemplate: {
            type: "preventive",
            leadDays: 21,
            title: "Preventif routine",
            summary: "Surveillance de routine",
          },
          budgetMultiplier: 1.2,
          delayMultiplier: 1.05,
          plainReason: "Lecture stable",
          recommendedAction: "Surveillance de routine",
        },
        {
          urgencyScore: 92,
          urgencyBand: "critical",
          urgencyLabel: "Urgent",
          stressValue: 0.81,
          machine: {
            id: "ASC-B2",
            name: "Machine 2",
            city: "Sfax",
            loc: "Batiment B",
            hi: 0.18,
          },
          taskTemplate: {
            type: "inspection",
            leadDays: 1,
            title: "Inspection critique",
            summary: "Inspection immediate",
          },
          budgetMultiplier: 1.4,
          delayMultiplier: 1.3,
          plainReason: "Derive critique",
          recommendedAction: "Inspection immediate",
        },
      ],
      isFetching: false,
    });
  });

  it("keeps stable machines in the routine section even when their projected cost is high", () => {
    renderPage();

    const actionSection = screen.getByTestId("budget-action-section");
    expect(within(actionSection).getByText("Machine 2")).toBeInTheDocument();
    expect(within(actionSection).queryByText("Machine 1")).not.toBeInTheDocument();

    const routineSection = screen.getByTestId("budget-routine-section");
    expect(within(routineSection).getByText("Machine 1")).toBeInTheDocument();
    expect(within(routineSection).getByText(/projection de routine/i)).toBeInTheDocument();
  });
});
