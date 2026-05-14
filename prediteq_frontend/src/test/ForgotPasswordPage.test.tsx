import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForgotPasswordPage } from "@/components/pages/ForgotPasswordPage";

const useAppMock = vi.hoisted(() => vi.fn());
const sendPasswordResetEmailMock = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/AppContext", () => ({
  useApp: () => useAppMock(),
}));

vi.mock("@/lib/authClient", () => ({
  sendPasswordResetEmail: (...args: unknown[]) => sendPasswordResetEmailMock(...args),
}));

describe("ForgotPasswordPage", () => {
  beforeEach(() => {
    useAppMock.mockReturnValue({
      lang: "fr",
      theme: "dark",
    });
    sendPasswordResetEmailMock.mockReset();
  });

  it("sends the reset email and shows the success state", async () => {
    const onNavigate = vi.fn();
    sendPasswordResetEmailMock.mockResolvedValue({ error: null });

    render(<ForgotPasswordPage onNavigate={onNavigate} />);

    fireEvent.change(screen.getByPlaceholderText("votre@email.com"), {
      target: { value: "reset@prediteq.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: /envoyer le lien/i }));

    await waitFor(() => {
      expect(sendPasswordResetEmailMock).toHaveBeenCalledWith(
        "reset@prediteq.test",
        `${window.location.origin}/reset-password`,
      );
    });

    expect(
      await screen.findByText(/Un email de r[ée]initialisation a [ée]t[ée] envoy[ée]/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /retour.*connexion/i }));
    expect(onNavigate).toHaveBeenCalledWith("/login");
  });

  it("renders the provider error when the reset email request fails", async () => {
    sendPasswordResetEmailMock.mockResolvedValue({
      error: { message: "Reset provider unavailable" },
    });

    render(<ForgotPasswordPage onNavigate={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("votre@email.com"), {
      target: { value: "reset@prediteq.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: /envoyer le lien/i }));

    expect(
      await screen.findByText("Reset provider unavailable"),
    ).toBeInTheDocument();
  });
});
