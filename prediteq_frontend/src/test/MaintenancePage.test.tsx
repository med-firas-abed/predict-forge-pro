import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MaintenancePage } from "@/components/pages/MaintenancePage";

const useAuthMock = vi.hoisted(() => vi.fn());
const useGmaoTachesMock = vi.hoisted(() => vi.fn());
const useMachinesMock = vi.hoisted(() => vi.fn());
const useFleetPredictiveInsightsMock = vi.hoisted(() => vi.fn());
const apiFetchMock = vi.hoisted(() => vi.fn());
const toastSuccessMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());
const toastWarningMock = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
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

vi.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
    warning: toastWarningMock,
  },
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <MaintenancePage />
    </MemoryRouter>,
  );
}

const machine = {
  id: "ASC-A1",
  uuid: "uuid-a1",
  name: "Machine 1",
  city: "Bizerte",
  loc: "Site Nord",
};

describe("MaintenancePage", () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      currentUser: {
        role: "admin",
        machineId: undefined,
      },
    });

    useMachinesMock.mockReturnValue({
      machines: [machine],
    });

    useFleetPredictiveInsightsMock.mockReturnValue({
      insights: [],
      byMachineId: {},
      isFetching: false,
    });

    apiFetchMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    toastWarningMock.mockReset();
  });

  it("keeps the manual task modal open when creation fails", async () => {
    const addMutation = {
      mutateAsync: vi.fn().mockRejectedValue(new Error("API 500")),
      isPending: false,
    };

    useGmaoTachesMock.mockReturnValue({
      taches: [],
      addTache: addMutation,
      updateTache: { mutateAsync: vi.fn(), isPending: false },
      deleteTache: { mutateAsync: vi.fn(), isPending: false },
      isLoading: false,
    });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /ajouter une tâche manuelle/i }));
    fireEvent.change(screen.getByPlaceholderText("Titre de la tâche"), {
      target: { value: "Inspection cabine" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^enregistrer$/i }));

    await waitFor(() => {
      expect(addMutation.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          machine_id: "uuid-a1",
          titre: "Inspection cabine",
        }),
      );
    });

    expect(screen.getByText("Nouvelle tâche")).toBeInTheDocument();
  });

  it("deletes a task from the detail modal after confirmation", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const deleteMutation = {
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
    };

    useGmaoTachesMock.mockReturnValue({
      taches: [
        {
          id: "task-1",
          machineId: "uuid-a1",
          machineCode: "ASC-A1",
          titre: "Controle cabine",
          description: "Verifier les capteurs",
          statut: "planifiee",
          technicien: "Firas",
          datePlanifiee: new Date().toISOString().slice(0, 10),
          coutEstime: 120,
          type: "inspection",
          createdAt: "2026-05-14T08:00:00.000Z",
        },
      ],
      addTache: { mutateAsync: vi.fn(), isPending: false },
      updateTache: { mutateAsync: vi.fn(), isPending: false },
      deleteTache: deleteMutation,
      isLoading: false,
    });

    renderPage();

    const taskTitles = await screen.findAllByText(/controle cabine/i);
    fireEvent.click(taskTitles[0]);
    fireEvent.click(await screen.findByLabelText("Supprimer la tâche"));

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledWith('Supprimer la tâche "Controle cabine" ?');
      expect(deleteMutation.mutateAsync).toHaveBeenCalledWith("task-1");
    });

    await waitFor(() => {
      expect(screen.queryByLabelText("Supprimer la tâche")).not.toBeInTheDocument();
    });

    confirmSpy.mockRestore();
  });

  it("keeps the task update successful even if the automatic machine reset fails", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const updateMutation = {
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
    };

    apiFetchMock.mockRejectedValue(new Error("API 502: reset failed"));
    useGmaoTachesMock.mockReturnValue({
      taches: [
        {
          id: "task-1",
          machineId: "uuid-a1",
          machineCode: "ASC-A1",
          titre: "Controle cabine",
          description: "Verifier les capteurs",
          statut: "planifiee",
          technicien: "Firas",
          datePlanifiee: today,
          coutEstime: 120,
          type: "inspection",
          createdAt: `${today}T08:00:00.000Z`,
        },
      ],
      addTache: { mutateAsync: vi.fn(), isPending: false },
      updateTache: updateMutation,
      deleteTache: { mutateAsync: vi.fn(), isPending: false },
      isLoading: false,
    });

    renderPage();

    const taskTitles = await screen.findAllByText(/controle cabine/i);
    fireEvent.click(taskTitles[0]);
    fireEvent.click(await screen.findByLabelText("Modifier la tâche"));

    const selects = document.body.querySelectorAll("select");
    fireEvent.change(selects[0], { target: { value: "terminee" } });
    fireEvent.click(screen.getByRole("button", { name: /^enregistrer$/i }));

    await waitFor(() => {
      expect(updateMutation.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "task-1",
          statut: "terminee",
        }),
      );
    });

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith("/machines/reset/ASC-A1", {
        method: "POST",
      });
    });

    expect(toastWarningMock).toHaveBeenCalledWith(
      expect.stringContaining("Tâche clôturée"),
    );
    expect(screen.queryByLabelText("Modifier la tâche")).not.toBeInTheDocument();
  });

  it("keeps normal users in read-only mode for their machine", async () => {
    useAuthMock.mockReturnValue({
      currentUser: {
        role: "user",
        machineId: "uuid-a1",
      },
    });

    useGmaoTachesMock.mockReturnValue({
      taches: [
        {
          id: "task-1",
          machineId: "uuid-a1",
          machineCode: "ASC-A1",
          titre: "Controle cabine",
          description: "Verifier les capteurs",
          statut: "planifiee",
          technicien: "Firas",
          datePlanifiee: new Date().toISOString().slice(0, 10),
          coutEstime: 120,
          type: "inspection",
          createdAt: "2026-05-14T08:00:00.000Z",
        },
      ],
      addTache: { mutateAsync: vi.fn(), isPending: false },
      updateTache: { mutateAsync: vi.fn(), isPending: false },
      deleteTache: { mutateAsync: vi.fn(), isPending: false },
      isLoading: false,
    });

    renderPage();

    expect(
      screen.getByText(/lecture seule\s*: vous voyez uniquement les informations de votre machine/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ajouter une tâche manuelle/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ajouter sur ce jour/i })).not.toBeInTheDocument();

    const taskTitles = await screen.findAllByText(/controle cabine/i);
    fireEvent.click(taskTitles[0]);

    expect(
      screen.getByText(/lecture seule\s*: cette fiche reste informative pour votre machine/i),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Modifier la tâche")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Supprimer la tâche")).not.toBeInTheDocument();
  });
});
