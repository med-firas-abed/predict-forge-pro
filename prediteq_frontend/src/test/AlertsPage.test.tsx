import { fireEvent, render, screen, within } from "@testing-library/react";
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

  it("keeps normal users in read-only mode for alert actions", () => {
    useAuthMock.mockReturnValue({
      currentUser: {
        role: "user",
        machineId: "uuid-a1",
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
      ],
    });

    useAlertesMock.mockReturnValue({
      alertes: [
        {
          id: "alert-a1",
          machineId: "uuid-a1",
          machineCode: "ASC-A1",
          titre: "Temperature elevee",
          description: "Capteur moteur au-dessus du seuil.",
          severite: "urgence",
          acquitte: false,
          createdAt: "2026-05-12T12:00:00.000Z",
        },
      ],
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
      ],
    });

    useFleetPredictiveInsightsMock.mockReturnValue({
      insights: [
        {
          urgencyScore: 20,
          urgencyBand: "critical",
          maintenanceWindow: "Sous 24 h",
          plainReason: "Verifier la temperature moteur",
          recommendedAction: "Inspection immediate",
          impact: "Eviter une degradation rapide",
          stressValue: 0.82,
          machine: { id: "ASC-A1", hi: 0.96 },
        },
      ],
      byMachineId: {
        "ASC-A1": {
          urgencyScore: 20,
          urgencyBand: "critical",
          urgencyLabel: "Critique",
          maintenanceWindow: "Sous 24 h",
          plainReason: "Verifier la temperature moteur",
          recommendedAction: "Inspection immediate",
          impact: "Eviter une degradation rapide",
          stressValue: 0.82,
          machine: { id: "ASC-A1", hi: 0.96 },
        },
      },
    });

    renderPage();

    expect(
      screen.getByText(/lecture seule : alertes et traces de votre machine uniquement/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /voir les signaux actifs/i }));

    expect(screen.queryByRole("button", { name: /acquitter les signaux/i })).not.toBeInTheDocument();
  });

  it("moves old recovered signals into the review bucket instead of the prioritized cases", () => {
    useMachinesMock.mockReturnValue({
      machines: [
        {
          id: "ASC-A1",
          name: "Machine 1",
          city: "Bizerte",
          loc: "Site Nord",
          hi: 0.95,
        },
        {
          id: "ASC-B2",
          name: "Machine 2",
          city: "Sfax",
          loc: "Batiment B",
          hi: 0.18,
        },
      ],
    });

    useAlertesMock.mockReturnValue({
      alertes: [
        {
          id: "alert-old-a1",
          machineId: "uuid-a1",
          machineCode: "ASC-A1",
          titre: "Signal ancien encore ouvert",
          description: "Ancienne alerte de surveillance.",
          severite: "surveillance",
          acquitte: false,
          createdAt: "2026-05-20T08:00:00.000Z",
        },
        {
          id: "alert-fresh-b2",
          machineId: "uuid-b2",
          machineCode: "ASC-B2",
          titre: "Machine critique",
          description: "Derive critique en cours.",
          severite: "urgence",
          acquitte: false,
          createdAt: "2026-05-28T08:00:00.000Z",
        },
      ],
      acquitterAlertes: { mutate: vi.fn(), isPending: false },
    });

    useFleetPredictiveInsightsMock.mockReturnValue({
      insights: [
        {
          urgencyScore: 20,
          urgencyBand: "stable",
          urgencyLabel: "Stable",
          maintenanceWindow: "Routine",
          plainReason: "Lecture stable",
          recommendedAction: "Surveillance de routine",
          impact: "Aucun cas prioritaire",
          stressValue: 0.04,
          machine: { id: "ASC-A1", hi: 0.95 },
        },
        {
          urgencyScore: 90,
          urgencyBand: "critical",
          urgencyLabel: "Urgent",
          maintenanceWindow: "Sous 24 h",
          plainReason: "Derive critique",
          recommendedAction: "Inspection immediate",
          impact: "Risque de panne",
          stressValue: 0.82,
          machine: { id: "ASC-B2", hi: 0.18 },
        },
      ],
      byMachineId: {
        "ASC-A1": {
          urgencyScore: 20,
          urgencyBand: "stable",
          urgencyLabel: "Stable",
          maintenanceWindow: "Routine",
          plainReason: "Lecture stable",
          recommendedAction: "Surveillance de routine",
          impact: "Aucun cas prioritaire",
          stressValue: 0.04,
          machine: { id: "ASC-A1", hi: 0.95 },
        },
        "ASC-B2": {
          urgencyScore: 90,
          urgencyBand: "critical",
          urgencyLabel: "Urgent",
          maintenanceWindow: "Sous 24 h",
          plainReason: "Derive critique",
          recommendedAction: "Inspection immediate",
          impact: "Risque de panne",
          stressValue: 0.82,
          machine: { id: "ASC-B2", hi: 0.18 },
        },
      },
    });

    renderPage();

    const reviewSection = screen.getByTestId("review-alert-section");
    expect(within(reviewSection).getByText("Machine 1")).toBeInTheDocument();
    expect(within(reviewSection).getByText(/ancien signal ouvert/i)).toBeInTheDocument();

    const prioritizedSection = screen.getByTestId("prioritized-alert-section");
    expect(within(prioritizedSection).getByText("Machine 2")).toBeInTheDocument();
    expect(within(prioritizedSection).queryByText("Machine 1")).not.toBeInTheDocument();
  });
});
