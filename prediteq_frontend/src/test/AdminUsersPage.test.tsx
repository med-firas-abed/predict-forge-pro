import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminUsersPage } from "@/components/pages/AdminUsersPage";

const useAuthMock = vi.hoisted(() => vi.fn());
const toastSuccessMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
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
      <AdminUsersPage />
    </MemoryRouter>,
  );
}

const baseUsers = [
  {
    id: "admin-1",
    fullName: "Admin PrediTeq",
    email: "admin@prediteq.test",
    role: "admin",
    status: "approved",
    createdAt: "2026-05-12T08:00:00.000Z",
    approvedAt: "2026-05-12T08:05:00.000Z",
  },
  {
    id: "pending-1",
    fullName: "Pending User",
    email: "pending@prediteq.test",
    role: "user",
    status: "pending",
    machineCode: "ASC-B2",
    machineName: "Machine 2",
    createdAt: "2026-05-12T09:00:00.000Z",
  },
  {
    id: "user-1",
    fullName: "Approved User",
    email: "user@prediteq.test",
    role: "user",
    status: "approved",
    machineCode: "ASC-C3",
    machineName: "Machine 3",
    createdAt: "2026-05-12T10:00:00.000Z",
    approvedAt: "2026-05-12T10:05:00.000Z",
  },
] as const;

describe("AdminUsersPage", () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      allUsers: [...baseUsers],
      currentUser: {
        id: "admin-1",
        role: "admin",
        status: "approved",
      },
      approveUser: vi.fn().mockResolvedValue(undefined),
      rejectUser: vi.fn().mockResolvedValue(undefined),
      deleteUser: vi.fn().mockResolvedValue(undefined),
    });

    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("renders the assigned machine label even when only the machine code is available", () => {
    renderPage();

    expect(screen.getAllByText("Machine 2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Machine 3").length).toBeGreaterThan(0);
    expect(screen.getByText("Toutes les machines")).toBeInTheDocument();
  });

  it("approves a pending account", async () => {
    const approveUser = vi.fn().mockResolvedValue(undefined);
    useAuthMock.mockReturnValue({
      allUsers: [...baseUsers],
      currentUser: {
        id: "admin-1",
        role: "admin",
        status: "approved",
      },
      approveUser,
      rejectUser: vi.fn().mockResolvedValue(undefined),
      deleteUser: vi.fn().mockResolvedValue(undefined),
    });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /approuver/i }));

    await waitFor(() => {
      expect(approveUser).toHaveBeenCalledWith("pending-1");
    });
    expect(toastSuccessMock).toHaveBeenCalledWith("Compte approuvé");
  });

  it("rejects a pending account", async () => {
    const rejectUser = vi.fn().mockResolvedValue(undefined);
    useAuthMock.mockReturnValue({
      allUsers: [...baseUsers],
      currentUser: {
        id: "admin-1",
        role: "admin",
        status: "approved",
      },
      approveUser: vi.fn().mockResolvedValue(undefined),
      rejectUser,
      deleteUser: vi.fn().mockResolvedValue(undefined),
    });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /rejeter/i }));

    await waitFor(() => {
      expect(rejectUser).toHaveBeenCalledWith("pending-1");
    });
    expect(toastErrorMock).toHaveBeenCalledWith("Compte refusé");
  });

  it("deletes an account after confirmation", async () => {
    const deleteUser = vi.fn().mockResolvedValue(undefined);
    useAuthMock.mockReturnValue({
      allUsers: [...baseUsers],
      currentUser: {
        id: "admin-1",
        role: "admin",
        status: "approved",
      },
      approveUser: vi.fn().mockResolvedValue(undefined),
      rejectUser: vi.fn().mockResolvedValue(undefined),
      deleteUser,
    });

    renderPage();

    const pendingCard = screen
      .getByText("Pending User")
      .closest("div")
      ?.parentElement
      ?.parentElement;
    if (!pendingCard) {
      throw new Error("Pending card not found");
    }

    fireEvent.click(within(pendingCard).getByRole("button", { name: /supprimer/i }));

    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalled();
      expect(deleteUser).toHaveBeenCalledWith("pending-1");
    });
    expect(toastSuccessMock).toHaveBeenCalledWith("Compte supprimé");
  });
});
