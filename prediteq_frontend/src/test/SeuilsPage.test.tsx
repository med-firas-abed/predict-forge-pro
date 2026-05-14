import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SeuilsPage } from "@/components/pages/SeuilsPage";

const useAppMock = vi.hoisted(() => vi.fn());
const apiFetchMock = vi.hoisted(() => vi.fn());
const toastSuccessMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/AppContext", () => ({
  useApp: () => useAppMock(),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}));

describe("SeuilsPage", () => {
  beforeEach(() => {
    useAppMock.mockReturnValue({
      alertEmails: {
        manager: "",
        technician: "",
      },
      setAlertEmails: vi.fn(),
      t: (key: string) =>
        ({
          "seuils.save": "Enregistrer",
          "seuils.saved": "Seuils enregistres",
          "seuils.managerEmail": "Email manager",
          "seuils.techEmail": "Email technicien",
        })[key] ?? key,
    });

    apiFetchMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
  });

  it("keeps saving disabled until the live thresholds load successfully", async () => {
    apiFetchMock
      .mockRejectedValueOnce(new Error("API offline"))
      .mockResolvedValueOnce({
        hi_critical: 0.21,
        hi_surveillance: 0.58,
        rul_critical_days: 6,
        rul_surveillance_days: 22,
        manager_email: "manager@prediteq.test",
        technician_email: "tech@prediteq.test",
      });

    render(<SeuilsPage />);

    const saveButton = screen.getByRole("button", { name: /enregistrer/i });

    await screen.findByText(/Impossible de charger les seuils live/i);
    expect(saveButton).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /recharger les seuils/i }));

    await waitFor(() => {
      expect(saveButton).not.toBeDisabled();
    });

    expect(apiFetchMock).toHaveBeenNthCalledWith(1, "/seuils");
    expect(apiFetchMock).toHaveBeenNthCalledWith(2, "/seuils");
  });

  it("trims recipient emails before saving them", async () => {
    const setAlertEmails = vi.fn();
    useAppMock.mockReturnValue({
      alertEmails: {
        manager: "",
        technician: "",
      },
      setAlertEmails,
      t: (key: string) =>
        ({
          "seuils.save": "Enregistrer",
          "seuils.saved": "Seuils enregistres",
          "seuils.managerEmail": "Email manager",
          "seuils.techEmail": "Email technicien",
        })[key] ?? key,
    });

    apiFetchMock
      .mockResolvedValueOnce({
        hi_critical: 0.2,
        hi_surveillance: 0.6,
        rul_critical_days: 7,
        rul_surveillance_days: 30,
        manager_email: "manager@prediteq.test",
        technician_email: "tech@prediteq.test",
      })
      .mockResolvedValueOnce({ status: "ok" });

    render(<SeuilsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /enregistrer/i })).not.toBeDisabled();
    });

    const emailInputs = screen.getAllByRole("textbox");
    fireEvent.change(emailInputs[0], { target: { value: " manager+ops@prediteq.test " } });
    fireEvent.change(emailInputs[1], { target: { value: " tech+ops@prediteq.test " } });
    fireEvent.click(screen.getByRole("button", { name: /enregistrer/i }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenNthCalledWith(
        2,
        "/seuils",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({
            hi_critical: 0.2,
            hi_surveillance: 0.6,
            rul_critical_days: 7,
            rul_surveillance_days: 30,
            manager_email: "manager+ops@prediteq.test",
            technician_email: "tech+ops@prediteq.test",
          }),
        }),
      );
    });

    expect(setAlertEmails).toHaveBeenLastCalledWith({
      manager: "manager+ops@prediteq.test",
      technician: "tech+ops@prediteq.test",
    });
  });
});
