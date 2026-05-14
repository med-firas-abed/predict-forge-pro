import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RapportIAPage } from "@/components/pages/RapportIAPage";

const useAppMock = vi.hoisted(() => vi.fn());
const useAuthMock = vi.hoisted(() => vi.fn());
const useMachinesMock = vi.hoisted(() => vi.fn());
const apiStreamMock = vi.hoisted(() => vi.fn());
const apiFetchMock = vi.hoisted(() => vi.fn());
const apiBlobMock = vi.hoisted(() => vi.fn());
const apiBinaryMock = vi.hoisted(() => vi.fn());
const toastSuccessMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/AppContext", () => ({
  useApp: () => useAppMock(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/hooks/useMachines", () => ({
  useMachines: (...args: unknown[]) => useMachinesMock(...args),
}));

vi.mock("@/lib/api", () => ({
  apiStream: (...args: unknown[]) => apiStreamMock(...args),
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  apiBlob: (...args: unknown[]) => apiBlobMock(...args),
  apiBinary: (...args: unknown[]) => apiBinaryMock(...args),
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
      <RapportIAPage />
    </MemoryRouter>,
  );
}

describe("RapportIAPage", () => {
  beforeEach(() => {
    useAppMock.mockReturnValue({
      lang: "fr",
    });

    useAuthMock.mockReturnValue({
      currentUser: {
        role: "user",
        machineCode: "ASC-A1",
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
        },
      ],
    });

    apiFetchMock.mockReset();
    apiStreamMock.mockReset();
    apiBlobMock.mockReset();
    apiBinaryMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();

    apiFetchMock.mockResolvedValue([]);
  });

  it("shows an error instead of a false success when report generation returns no content", async () => {
    apiStreamMock.mockResolvedValue({
      getReader: () => ({
        read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
      }),
    });

    renderPage();

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith("/report/history");
    });

    fireEvent.click(screen.getByRole("button", { name: /générer le rapport/i }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "Le rapport n'a renvoye aucun contenu. Veuillez reessayer.",
      );
    });

    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/Contenu du rapport/i)).not.toBeInTheDocument();
  });
});
