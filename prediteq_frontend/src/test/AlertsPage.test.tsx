import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AlertsPage } from "@/components/pages/AlertsPage";

const useAuthMock = vi.hoisted(() => vi.fn());
const useMachinesMock = vi.hoisted(() => vi.fn());
const useAlertesMock = vi.hoisted(() => vi.fn());
const useAlertEmailHistoryMock = vi.hoisted(() => vi.fn());
const useFleetPredictiveInsightsMock = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/hooks/useMachines", () => ({
  useMachines: (...args: unknown[]) => useMachinesMock(...args),
}));

vi.mock("@/hooks/useAlertes", () => ({
  useAlertes: (...args: unknown[]) => useAlertesMock(...args),
}));

vi.mock("@/hooks/useAlertEmailHistory", () => ({
  useAlertEmailHistory: (...args: unknown[]) => useAlertEmailHistoryMock(...args),
}));

vi.mock("@/hooks/useFleetPredictiveInsights", () => ({
  useFleetPredictiveInsights: (...args: unknown[]) => useFleetPredictiveInsightsMock(...args),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <AlertsPage />
    </MemoryRouter>,
  );
}

describe("AlertsPage", () => {
  beforeEach(() => {
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
          hi: 0.96,
        },
        {
          id: "ASC-B2",
          name: "Machine 2",
          city: "Sfax",
          loc: "Batiment B",
          hi: 0.62,
        },
      ],
    });

    useAlertesMock.mockReturnValue({
      alertes: [],
      acquitterAlertes: { mutate: vi.fn(), isPending: false },
    });

    useAlertEmailHistoryMock.mockReturnValue({
      emailHistory: [
        {
          id: "mail-a1",
          machineId: "uuid-a1",
          machineCode: "ASC-A1",
          machineName: "Machine 1",
          recipientEmail: "a1@prediteq.test",
          success: true,
          type: "hi",
          source: "scheduler",
          severity: "urgence",
          subject: "A1",
          note: "",
          createdAt: "2026-05-12T10:00:00.000Z",
        },
        {
          id: "mail-b2",
          machineId: "uuid-b2",
          machineCode: "ASC-B2",
          machineName: "Machine 2",
          recipientEmail: "b2@prediteq.test",
          success: true,
          type: "hi",
          source: "scheduler",
          severity: "surveillance",
          subject: "B2",
          note: "",
          createdAt: "2026-05-12T11:00:00.000Z",
        },
      ],
    });

    useFleetPredictiveInsightsMock.mockReturnValue({
      insights: [
        { urgencyScore: 20, machine: { id: "ASC-A1", hi: 0.96 } },
        { urgencyScore: 50, machine: { id: "ASC-B2", hi: 0.62 } },
      ],
      byMachineId: {},
    });
  });

  it("filters the email history with the selected machine code", () => {
    renderPage();

    expect(screen.getByText("a1@prediteq.test")).toBeInTheDocument();
    expect(screen.getByText("b2@prediteq.test")).toBeInTheDocument();

    const comboboxes = screen.getAllByRole("combobox");
    fireEvent.change(comboboxes[1], { target: { value: "ASC-B2" } });

    expect(screen.queryByText("a1@prediteq.test")).not.toBeInTheDocument();
    expect(screen.getByText("b2@prediteq.test")).toBeInTheDocument();
  });
});
