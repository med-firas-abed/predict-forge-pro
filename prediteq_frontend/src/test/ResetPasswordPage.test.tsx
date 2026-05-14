import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResetPasswordPage } from "@/components/pages/ResetPasswordPage";

const useAppMock = vi.hoisted(() => vi.fn());
const getAuthSessionMock = vi.hoisted(() => vi.fn());
const onAuthStateChangedMock = vi.hoisted(() => vi.fn());
const signOutAuthMock = vi.hoisted(() => vi.fn());
const updateAuthPasswordMock = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/AppContext", () => ({
  useApp: () => useAppMock(),
}));

vi.mock("@/lib/authClient", () => ({
  getAuthSession: (...args: unknown[]) => getAuthSessionMock(...args),
  onAuthStateChanged: (...args: unknown[]) => onAuthStateChangedMock(...args),
  signOutAuth: (...args: unknown[]) => signOutAuthMock(...args),
  updateAuthPassword: (...args: unknown[]) => updateAuthPasswordMock(...args),
}));

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    useAppMock.mockReturnValue({
      lang: "fr",
      theme: "dark",
    });
    getAuthSessionMock.mockReset();
    onAuthStateChangedMock.mockReset();
    signOutAuthMock.mockReset();
    updateAuthPasswordMock.mockReset();

    onAuthStateChangedMock.mockReturnValue({
      data: {
        subscription: {
          unsubscribe: vi.fn(),
        },
      },
    });
  });

  it("shows the expired-link state when there is no recovery session", async () => {
    const onNavigate = vi.fn();
    getAuthSessionMock.mockResolvedValue({ data: { session: null } });

    render(<ResetPasswordPage onNavigate={onNavigate} />);

    expect(
      await screen.findByText(/Lien expir[ée] ou invalide/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /refaire la demande/i }));
    expect(onNavigate).toHaveBeenCalledWith("/forgot-password");
  });

  it("updates the password, signs the user out, and exposes the sign-in action", async () => {
    const onNavigate = vi.fn();
    getAuthSessionMock.mockResolvedValue({ data: { session: { user: { id: "recovery-user" } } } });
    updateAuthPasswordMock.mockResolvedValue({ error: null });
    signOutAuthMock.mockResolvedValue({ error: null });

    render(<ResetPasswordPage onNavigate={onNavigate} />);

    const saveButton = await screen.findByRole("button", { name: /enregistrer/i });
    const [passwordInput, confirmInput] = screen.getAllByPlaceholderText("********");

    fireEvent.change(passwordInput, { target: { value: "Password1" } });
    fireEvent.change(confirmInput, { target: { value: "Password1" } });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(updateAuthPasswordMock).toHaveBeenCalledWith("Password1");
      expect(signOutAuthMock).toHaveBeenCalled();
    });

    expect(
      await screen.findByText(/Mot de passe mis .* jour/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /se connecter/i }));
    expect(onNavigate).toHaveBeenCalledWith("/login");
  });
});
