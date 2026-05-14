import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatWidget } from "@/components/industrial/ChatWidget";

const useAppMock = vi.hoisted(() => vi.fn());
const apiStreamMock = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/AppContext", () => ({
  useApp: () => useAppMock(),
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

    apiStreamMock.mockReset();
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
