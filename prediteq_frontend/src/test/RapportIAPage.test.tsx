import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RapportIAPage } from "@/components/pages/RapportIAPage";

const useAppMock = vi.hoisted(() => vi.fn());
const useAuthMock = vi.hoisted(() => vi.fn());
const useMachinesMock = vi.hoisted(() => vi.fn());
const useFleetPredictiveInsightsMock = vi.hoisted(() => vi.fn());
const apiStreamMock = vi.hoisted(() => vi.fn());
const apiFetchMock = vi.hoisted(() => vi.fn());
const apiBlobMock = vi.hoisted(() => vi.fn());
const apiBinaryMock = vi.hoisted(() => vi.fn());
const toastSuccessMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());
const toastWarningMock = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/AppContext", () => ({
  useApp: () => useAppMock(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/hooks/useMachines", () => ({
  useMachines: (...args: unknown[]) => useMachinesMock(...args),
}));

vi.mock("@/hooks/useFleetPredictiveInsights", () => ({
  useFleetPredictiveInsights: (...args: unknown[]) => useFleetPredictiveInsightsMock(...args),
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
    warning: toastWarningMock,
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
          hi: 0.94,
          rul: 38,
          decision: {
            zone: "Good",
            recommendedAction: "Verifier le comportement recent.",
            evidence: ["HI 94 %", "RUL 38 j"],
          },
        },
      ],
    });
    useFleetPredictiveInsightsMock.mockReturnValue({
      insights: [],
      byMachineId: {},
      isLoading: false,
      isFetching: false,
    });

    apiFetchMock.mockReset();
    apiStreamMock.mockReset();
    apiBlobMock.mockReset();
    apiBinaryMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    toastWarningMock.mockReset();

    apiFetchMock.mockResolvedValue([]);
  });

  it("shows a local fallback report when backend generation returns no content", async () => {
    apiStreamMock.mockResolvedValue({
      getReader: () => ({
        read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
      }),
    });

    renderPage();

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith("/report/history");
    });

    fireEvent.click(screen.getByRole("button", { name: /g[ée]n[ée]rer le rapport/i }));

    await waitFor(() => {
      expect(toastWarningMock).toHaveBeenCalledWith(
        "Le rapport IA etait vide - un rapport local de secours a ete affiche.",
      );
    });

    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Contenu du rapport/i)).toBeInTheDocument();
    expect(screen.getByText(/Rapport de continuité PrediTeq/i)).toBeInTheDocument();
  });
});
