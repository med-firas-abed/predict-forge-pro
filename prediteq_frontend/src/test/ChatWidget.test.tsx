import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatWidget } from "@/components/industrial/ChatWidget";

const useAppMock = vi.hoisted(() => vi.fn());
const useAuthMock = vi.hoisted(() => vi.fn());
const useMachinesMock = vi.hoisted(() => vi.fn());
const apiStreamMock = vi.hoisted(() => vi.fn());

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
}));

function normalizeText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

describe("ChatWidget", () => {
  beforeEach(() => {
    useAppMock.mockReturnValue({
      lang: "fr",
      t: (key: string) =>
        ({
          "chat.title": "Lecture rapide",
          "chat.subtitle": "Machines, alertes et actions",
          "chat.welcome": "Etat des machines, alertes et actions disponibles.",
          "chat.thinking": "Chargement...",
          "chat.placeholder": "Question sur une machine ou une alerte...",
        })[key] ?? key,
    });

    useAuthMock.mockReturnValue({
      currentUser: {
        machineId: null,
      },
    });

    useMachinesMock.mockReturnValue({
      machines: [],
    });

    apiStreamMock.mockReset();
  });

  it("builds suggestion chips from the machines that currently exist", () => {
    useMachinesMock.mockReturnValue({
      machines: [
        {
          id: "ARO-01",
          name: "Machine ARO-01",
          status: "ok",
          hi: 0.92,
          rul: 145,
          decision: { urgencyScore: 10 },
        },
        {
          id: "ASC-C3",
          name: "Machine 3",
          status: "critical",
          hi: 0.16,
          rul: 22,
          decision: { urgencyScore: 92 },
        },
      ],
    });

    render(<ChatWidget />);

    fireEvent.click(screen.getByRole("button", { name: /lecture rapide/i }));

    expect(screen.getByText(/Machine prioritaire aujourd'hui/i)).toBeInTheDocument();
    expect(
      screen.getByText((content) => /^etat de machine (3|aro-01)$/i.test(normalizeText(content))),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Cause principale pour Machine (3|ARO-01)/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText((content) => /^etat general de la flotte$/i.test(normalizeText(content))),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Technicien" }),
    ).not.toBeInTheDocument();
  });

  it("replaces the pending assistant placeholder when the streamed reply fails", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      apiStreamMock.mockResolvedValue({
        getReader: () => ({
          read: vi.fn().mockRejectedValue(new Error("stream failed")),
        }),
      });

      render(<ChatWidget />);

      fireEvent.click(screen.getByRole("button", { name: /lecture rapide/i }));

      const input = screen.getByPlaceholderText("Question sur une machine ou une alerte...");
      fireEvent.change(input, { target: { value: "Quelle machine est prioritaire ?" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

      await waitFor(() => {
        expect(
          screen.getByText("Erreur de connexion. Veuillez reessayer."),
        ).toBeInTheDocument();
      });

      expect(screen.queryByText("Chargement...")).not.toBeInTheDocument();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
