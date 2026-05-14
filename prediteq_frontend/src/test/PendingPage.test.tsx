import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PendingPage } from "@/components/pages/PendingPage";

const useAuthMock = vi.hoisted(() => vi.fn());
const useAppMock = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/contexts/AppContext", () => ({
  useApp: () => useAppMock(),
}));

function renderPage(onNavigate = vi.fn()) {
  return render(
    <MemoryRouter>
      <PendingPage onNavigate={onNavigate} />
    </MemoryRouter>,
  );
}

describe("PendingPage", () => {
  beforeEach(() => {
    useAppMock.mockReturnValue({
      lang: "fr",
      theme: "dark",
      setLang: vi.fn(),
      setTheme: vi.fn(),
      t: (key: string) =>
        ({
          "pending.title": "Compte en cours de validation",
          "pending.message": "Votre demande d'acces a ete soumise avec succes.",
          "pending.name": "Nom",
          "pending.requestedRole": "Role demande",
          "pending.urgentContact": "Pour toute urgence, contactez",
          "pending.signOut": "Se deconnecter",
          "auth.user": "Utilisateur",
          "auth.administrator": "Administrateur",
        })[key] ?? key,
    });
  });

  it("renders the assigned machine label even when only machineCode and machineName are available", () => {
    useAuthMock.mockReturnValue({
      currentUser: {
        id: "pending-1",
        fullName: "Pending PrediTeq",
        email: "pending@prediteq.test",
        role: "user",
        status: "pending",
        machineCode: "ASC-B2",
        machineName: "Machine 2",
        createdAt: "2026-05-14T08:00:00.000Z",
      },
      allUsers: [],
      logout: vi.fn().mockResolvedValue(undefined),
    });

    renderPage();

    expect(screen.getByText("Pending PrediTeq")).toBeInTheDocument();
    expect(screen.getByText("Machine 2")).toBeInTheDocument();
  });

  it("logs out and navigates back to signup", async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    const onNavigate = vi.fn();

    useAuthMock.mockReturnValue({
      currentUser: {
        id: "pending-1",
        fullName: "Pending PrediTeq",
        email: "pending@prediteq.test",
        role: "user",
        status: "pending",
        machineCode: "ASC-B2",
        machineName: "Machine 2",
        createdAt: "2026-05-14T08:00:00.000Z",
      },
      allUsers: [],
      logout,
    });

    renderPage(onNavigate);

    fireEvent.click(screen.getByRole("button", { name: /se d[ée]connecter/i }));

    await waitFor(() => {
      expect(logout).toHaveBeenCalled();
      expect(onNavigate).toHaveBeenCalledWith("/signup");
    });
  });
});
