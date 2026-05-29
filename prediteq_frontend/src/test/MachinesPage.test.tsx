import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MachinesPage } from "@/components/pages/MachinesPage";

const apiFetchMock = vi.hoisted(() => vi.fn());
const useAuthMock = vi.hoisted(() => vi.fn());
const useAppMock = vi.hoisted(() => vi.fn());
const useMachinesMock = vi.hoisted(() => vi.fn());
const toastSuccessMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/contexts/AppContext", () => ({
  useApp: () => useAppMock(),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: apiFetchMock,
}));

vi.mock("@/hooks/useMachines", () => ({
  useMachines: (...args: unknown[]) => useMachinesMock(...args),
}));

vi.mock("@/components/industrial/MachineModal", () => ({
  MachineModal: () => null,
}));

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <MachinesPage />
    </MemoryRouter>,
  );
}

const baseMachine = {
  id: "ASC-A1",
  uuid: "machine-1",
  name: "Machine 1",
  loc: "Site Nord - Bizerte",
  city: "Bizerte",
  lat: 37.2744,
  lon: 9.8739,
  hi: 0.96,
  rul: 142,
  rulci: 5,
  status: "ok" as const,
  vib: 1.3,
  curr: 4.21,
  temp: 23.4,
  anom: 1,
  cycles: 82,
  model: "SITI FC100L1-4",
  floors: 19,
  last: "02/05/2026 10:10",
};

describe("MachinesPage", () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      currentUser: {
        role: "admin",
        machineId: undefined,
      },
    });
    useAppMock.mockReturnValue({
      t: (key: string) =>
        ({
          "mach.idRequired": "L'ID est requis",
          "mach.idExists": "Cet ID existe déjà",
        })[key] ?? key,
    });
    apiFetchMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
  });

  it("keeps the add form open when machine creation fails and normalizes the code", async () => {
    const createMutation = {
      mutateAsync: vi.fn().mockRejectedValue(new Error("API 400: invalid code")),
      isPending: false,
    };

    useMachinesMock.mockReturnValue({
      machines: [baseMachine],
      addMachine: createMutation,
      updateMachine: { mutateAsync: vi.fn(), isPending: false },
      deleteMachine: { mutateAsync: vi.fn(), isPending: false },
      refetch: vi.fn(),
    });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /ajouter machine/i }));

    const textboxes = screen.getAllByRole("textbox");
    fireEvent.change(textboxes[0], { target: { value: "asc-z9" } });
    fireEvent.change(textboxes[1], { target: { value: "Machine Z" } });
    fireEvent.change(textboxes[2], { target: { value: "Tunis" } });
    fireEvent.change(textboxes[3], { target: { value: "Model X" } });
    fireEvent.change(textboxes[4], { target: { value: "Zone Test" } });

    fireEvent.click(screen.getByRole("button", { name: /^enregistrer$/i }));

    await waitFor(() => {
      expect(createMutation.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "ASC-Z9",
          name: "Machine Z",
        }),
      );
    });

    expect(screen.getByText("Ajouter une machine")).toBeInTheDocument();
  });

  it("closes the add form after a successful machine creation", async () => {
    const createMutation = {
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
    };

    useMachinesMock.mockReturnValue({
      machines: [baseMachine],
      addMachine: createMutation,
      updateMachine: { mutateAsync: vi.fn(), isPending: false },
      deleteMachine: { mutateAsync: vi.fn(), isPending: false },
      refetch: vi.fn(),
    });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /ajouter machine/i }));

    const textboxes = screen.getAllByRole("textbox");
    fireEvent.change(textboxes[0], { target: { value: "ASC-Z9" } });
    fireEvent.change(textboxes[1], { target: { value: "Machine Z" } });
    fireEvent.change(textboxes[2], { target: { value: "Tunis" } });
    fireEvent.change(textboxes[3], { target: { value: "Model X" } });
    fireEvent.change(textboxes[4], { target: { value: "Zone Test" } });

    fireEvent.click(screen.getByRole("button", { name: /^enregistrer$/i }));

    await waitFor(() => {
      expect(createMutation.mutateAsync).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.queryByText("Ajouter une machine")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Gestion des machines")).toBeInTheDocument();
  });

  it("keeps the delete confirmation open when machine deletion fails", async () => {
    const deleteMutation = {
      mutateAsync: vi.fn().mockRejectedValue(new Error("API 500")),
      isPending: false,
    };

    useMachinesMock.mockReturnValue({
      machines: [baseMachine],
      addMachine: { mutateAsync: vi.fn(), isPending: false },
      updateMachine: { mutateAsync: vi.fn(), isPending: false },
      deleteMachine: deleteMutation,
      refetch: vi.fn(),
    });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /^supprimer$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^oui$/i }));

    await waitFor(() => {
      expect(deleteMutation.mutateAsync).toHaveBeenCalledWith("ASC-A1");
    });

    expect(screen.getByRole("button", { name: /^oui$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^non$/i })).toBeInTheDocument();
  });

  it("prepares the future real-machine runtime from the machine card", async () => {
    const refetchMock = vi.fn().mockResolvedValue(undefined);
    apiFetchMock.mockResolvedValue({
      machine_code: "ASC-A1",
      scenario: "healthy",
      profile: "A_linear",
      hi: 0.8046,
      zone: "Excellent",
      rul_days: 112.4,
    });

    useMachinesMock.mockReturnValue({
      machines: [baseMachine],
      addMachine: { mutateAsync: vi.fn(), isPending: false },
      updateMachine: { mutateAsync: vi.fn(), isPending: false },
      deleteMachine: { mutateAsync: vi.fn(), isPending: false },
      refetch: refetchMock,
    });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /préparer flux réel/i }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith("/machines/ASC-A1/prepare-live", {
        method: "POST",
        body: JSON.stringify({
          duration_s: 3600,
          seed: 99,
        }),
      });
    });
    expect(refetchMock).toHaveBeenCalledTimes(1);
    expect(toastSuccessMock).toHaveBeenCalledWith(
      expect.stringContaining("Machine 1 prêt pour le flux réel"),
    );
  });
});
