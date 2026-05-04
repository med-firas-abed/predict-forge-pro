import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Index from "@/pages/Index";

const mockUseAuth = vi.fn();
const mockUseApp = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/contexts/AppContext", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("@/components/layout/AppSidebar", () => ({
  AppSidebar: () => <div data-testid="sidebar" />,
}));

vi.mock("@/components/layout/AppTopbar", () => ({
  AppTopbar: ({ title }: { title: string }) => <div data-testid="topbar">{title}</div>,
}));

vi.mock("@/components/layout/AppFooter", () => ({
  AppFooter: () => <div data-testid="footer" />,
}));

vi.mock("@/components/industrial/ChatWidget", () => ({
  ChatWidget: () => <div data-testid="chat-widget" />,
}));

vi.mock("@/components/layout/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/pages/DashboardPage", () => ({
  DashboardPage: () => <div>Dashboard page</div>,
}));

vi.mock("@/components/pages/IAPage", () => ({
  IAPage: () => <div>IA page</div>,
}));

vi.mock("@/components/pages/MachinesPage", () => ({
  MachinesPage: () => <div>Machines page</div>,
}));

vi.mock("@/components/pages/MaintenancePage", () => ({
  MaintenancePage: () => <div>Maintenance page</div>,
}));

vi.mock("@/components/pages/CalendarPage", () => ({
  CalendarPage: () => <div>Calendar page</div>,
}));

vi.mock("@/components/pages/CostsPage", () => ({
  CostsPage: () => <div>Costs page</div>,
}));

vi.mock("@/components/pages/AlertsPage", () => ({
  AlertsPage: () => <div>Alerts page</div>,
}));

vi.mock("@/components/pages/GeoPage", () => ({
  GeoPage: () => <div>Geo page</div>,
}));

vi.mock("@/components/pages/AdminPage", () => ({
  AdminPage: () => <div>Admin page</div>,
}));

vi.mock("@/components/pages/SeuilsPage", () => ({
  SeuilsPage: () => <div>Thresholds page</div>,
}));

vi.mock("@/components/pages/SimulatorPage", () => ({
  SimulatorPage: () => <div>Simulator page</div>,
}));

vi.mock("@/components/pages/ExperimentPage", () => ({
  ExperimentPage: () => <div>Experiment page</div>,
}));

vi.mock("@/components/pages/AdminUsersPage", () => ({
  AdminUsersPage: () => <div>Admin users page</div>,
}));

vi.mock("@/components/pages/LoginPage", () => ({
  LoginPage: () => <div>Login page</div>,
}));

vi.mock("@/components/pages/SignupPage", () => ({
  SignupPage: () => <div>Signup page</div>,
}));

vi.mock("@/components/pages/PendingPage", () => ({
  PendingPage: () => <div>Pending page</div>,
}));

vi.mock("@/components/pages/ForgotPasswordPage", () => ({
  ForgotPasswordPage: () => <div>Forgot password page</div>,
}));

vi.mock("@/components/pages/ResetPasswordPage", () => ({
  ResetPasswordPage: () => <div>Reset password page</div>,
}));

vi.mock("@/components/pages/DiagnosticsPage", () => ({
  DiagnosticsPage: () => <div>Diagnostics page</div>,
}));

function renderIndex(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="*" element={<Index />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Index routing", () => {
  beforeEach(() => {
    mockUseApp.mockReturnValue({
      lang: "fr",
      t: (key: string) =>
        ({
          "meta.ia.title": "Analyse & Rapport IA",
          "meta.ia.sub": "Analyse assistee, decision et rapports intelligents",
          "meta.dashboard.title": "Tableau de bord",
          "meta.dashboard.sub": "Vue globale",
          "auth.loading": "Chargement...",
          "notfound.title": "Oops ! Page introuvable",
          "notfound.home": "Retour a l'accueil",
        })[key] ?? key,
    });
  });

  it("renders the unified IA route for approved admins", async () => {
    mockUseAuth.mockReturnValue({
      loading: false,
      isAuthenticated: true,
      currentUser: {
        role: "admin",
        status: "approved",
        fullName: "Admin User",
        email: "admin@example.com",
      },
    });

    renderIndex("/planner");

    expect(await screen.findByText("IA page")).toBeInTheDocument();
    expect(screen.getByTestId("topbar")).toHaveTextContent("Analyse & Rapport IA");
  });

  it("opens the unified IA page for non-admin users too", async () => {
    mockUseAuth.mockReturnValue({
      loading: false,
      isAuthenticated: true,
      currentUser: {
        role: "user",
        status: "approved",
        fullName: "Regular User",
        email: "user@example.com",
      },
    });

    renderIndex("/planner");

    expect(await screen.findByText("IA page")).toBeInTheDocument();
    expect(screen.queryByText("Dashboard page")).not.toBeInTheDocument();
  });

  it("shows the not found page for unknown in-app routes", async () => {
    mockUseAuth.mockReturnValue({
      loading: false,
      isAuthenticated: true,
      currentUser: {
        role: "admin",
        status: "approved",
        fullName: "Admin User",
        email: "admin@example.com",
      },
    });

    renderIndex("/unknown-page");

    expect(await screen.findByText("Oops ! Page introuvable")).toBeInTheDocument();
    expect(screen.queryByText("Dashboard page")).not.toBeInTheDocument();
  });

  it("redirects approved users away from /login to the dashboard", async () => {
    mockUseAuth.mockReturnValue({
      loading: false,
      isAuthenticated: true,
      currentUser: {
        role: "admin",
        status: "approved",
        fullName: "Admin User",
        email: "admin@example.com",
      },
    });

    renderIndex("/login");

    expect(await screen.findByText("Dashboard page")).toBeInTheDocument();
    expect(screen.queryByText("Oops ! Page introuvable")).not.toBeInTheDocument();
  });
});
