import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminPage } from "@/components/pages/AdminPage";

const useAppMock = vi.hoisted(() => vi.fn());
const useAuthMock = vi.hoisted(() => vi.fn());
const apiFetchMock = vi.hoisted(() => vi.fn());
const toastSuccessMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());
const toastMessageMock = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/AppContext", () => ({
  useApp: () => useAppMock(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
    message: toastMessageMock,
  },
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminPage />
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
  },
  {
    id: "pending-1",
    fullName: "Pending User",
    email: "pending@prediteq.test",
    role: "user",
    status: "pending",
    machineId: "uuid-a1",
    machineCode: "ASC-A1",
    machineName: "Machine 1",
    createdAt: "2026-05-12T09:00:00.000Z",
  },
] as const;

describe("AdminPage", () => {
  beforeEach(() => {
    useAppMock.mockReturnValue({
      t: (key: string) => key,
      lang: "fr",
      setLang: vi.fn(),
      theme: "dark",
      setTheme: vi.fn(),
    });

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
      reassignUserMachine: vi.fn().mockResolvedValue(undefined),
      refreshUsers: vi.fn().mockResolvedValue(undefined),
    });

    apiFetchMock.mockImplementation((path: string) => {
      if (path === "/auth/machines") {
        return Promise.resolve([{ id: "uuid-a1", code: "ASC-A1", nom: "Machine 1" }]);
      }
      if (path === "/seuils/recipients-preview") {
        return Promise.resolve([]);
      }
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    });

    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    toastMessageMock.mockReset();
  });

  it("reloads the admin context after approving a pending account", async () => {
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
      reassignUserMachine: vi.fn().mockResolvedValue(undefined),
      refreshUsers: vi.fn().mockResolvedValue(undefined),
    });

    renderPage();

    await screen.findByText("Pending User");
    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith("/auth/machines");
      expect(apiFetchMock).toHaveBeenCalledWith("/seuils/recipients-preview");
    });
    apiFetchMock.mockClear();

    fireEvent.click(screen.getByRole("button", { name: /approuver/i }));

    await waitFor(() => {
      expect(approveUser).toHaveBeenCalledWith("pending-1");
    });
    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith("/auth/machines");
      expect(apiFetchMock).toHaveBeenCalledWith("/seuils/recipients-preview");
    });
  });
});
