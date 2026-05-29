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

describe("ChatWidget", () => {
  beforeEach(() => {
    useAppMock.mockReturnValue({
      lang: "fr",
      t: (key: string) =>
        ({
          "chat.title": "Assistant PrediTeq",
          "chat.subtitle": "Posez une question sur la flotte",
          "chat.welcome": "Bonjour, je peux vous aider.",
          "chat.thinking": "Reflexion...",
          "chat.placeholder": "Votre question",
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

    fireEvent.click(screen.getByRole("button", { name: /assistant prediteq/i }));

    expect(screen.queryByText(/Machine 2/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/Explique Machine (3|ARO-01) simplement puis techniquement/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Pourquoi Machine (3|ARO-01) est prioritaire \?/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Technicien" }));

    expect(
      screen.getByText(/Donne HI, RUL et facteur principal pour Machine (3|ARO-01)/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/intervention.*Machine (3|ARO-01)/i),
    ).toBeInTheDocument();
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

      fireEvent.click(screen.getByRole("button", { name: /assistant prediteq/i }));

      const input = screen.getByPlaceholderText("Votre question");
      fireEvent.change(input, { target: { value: "Quelle machine est prioritaire ?" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

      await waitFor(() => {
        expect(
          screen.getByText("Erreur de connexion. Veuillez reessayer."),
        ).toBeInTheDocument();
      });

      expect(screen.queryByText("Reflexion...")).not.toBeInTheDocument();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
