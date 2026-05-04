import { lazy, Suspense, useState, type ComponentType, type LazyExoticComponent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ChatWidget } from "@/components/industrial/ChatWidget";
import { AppFooter } from "@/components/layout/AppFooter";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import AccessDeniedPage from "./AccessDenied";
import NotFound from "./NotFound";

type PageId =
  | "dashboard"
  | "geo"
  | "machines"
  | "maintenance"
  | "calendrier"
  | "couts"
  | "alertes"
  | "ia"
  | "diagnostics"
  | "seuils"
  | "simulateur"
  | "experiment"
  | "administration"
  | "admin-users";

const DashboardPage = lazy(() =>
  import("@/components/pages/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const MachinesPage = lazy(() =>
  import("@/components/pages/MachinesPage").then((m) => ({ default: m.MachinesPage })),
);
const MaintenancePage = lazy(() =>
  import("@/components/pages/MaintenancePage").then((m) => ({ default: m.MaintenancePage })),
);
const CalendarPage = lazy(() =>
  import("@/components/pages/CalendarPage").then((m) => ({ default: m.CalendarPage })),
);
const CostsPage = lazy(() =>
  import("@/components/pages/CostsPage").then((m) => ({ default: m.CostsPage })),
);
const AlertsPage = lazy(() =>
  import("@/components/pages/AlertsPage").then((m) => ({ default: m.AlertsPage })),
);
const GeoPage = lazy(() =>
  import("@/components/pages/GeoPage").then((m) => ({ default: m.GeoPage })),
);
const AdminPage = lazy(() =>
  import("@/components/pages/AdminPage").then((m) => ({ default: m.AdminPage })),
);
const IAPage = lazy(() =>
  import("@/components/pages/IAPage").then((m) => ({ default: m.IAPage })),
);
const SeuilsPage = lazy(() =>
  import("@/components/pages/SeuilsPage").then((m) => ({ default: m.SeuilsPage })),
);
const SimulatorPage = lazy(() =>
  import("@/components/pages/SimulatorPage").then((m) => ({ default: m.SimulatorPage })),
);
const ExperimentPage = lazy(() =>
  import("@/components/pages/ExperimentPage").then((m) => ({ default: m.ExperimentPage })),
);
const AdminUsersPage = lazy(() =>
  import("@/components/pages/AdminUsersPage").then((m) => ({ default: m.AdminUsersPage })),
);
const LoginPage = lazy(() =>
  import("@/components/pages/LoginPage").then((m) => ({ default: m.LoginPage })),
);
const SignupPage = lazy(() =>
  import("@/components/pages/SignupPage").then((m) => ({ default: m.SignupPage })),
);
const PendingPage = lazy(() =>
  import("@/components/pages/PendingPage").then((m) => ({ default: m.PendingPage })),
);
const ForgotPasswordPage = lazy(() =>
  import("@/components/pages/ForgotPasswordPage").then((m) => ({ default: m.ForgotPasswordPage })),
);
const ResetPasswordPage = lazy(() =>
  import("@/components/pages/ResetPasswordPage").then((m) => ({ default: m.ResetPasswordPage })),
);
const DiagnosticsPage = lazy(() =>
  import("@/components/pages/DiagnosticsPage").then((m) => ({ default: m.DiagnosticsPage })),
);

const PAGES: Record<PageId, LazyExoticComponent<ComponentType>> = {
  dashboard: DashboardPage,
  geo: GeoPage,
  machines: MachinesPage,
  maintenance: MaintenancePage,
  calendrier: CalendarPage,
  couts: CostsPage,
  alertes: AlertsPage,
  ia: IAPage,
  diagnostics: DiagnosticsPage,
  seuils: SeuilsPage,
  simulateur: SimulatorPage,
  experiment: ExperimentPage,
  administration: AdminPage,
  "admin-users": AdminUsersPage,
};

const PAGE_META_KEYS: Record<PageId, { title: string; sub: string }> = {
  dashboard: { title: "meta.dashboard.title", sub: "meta.dashboard.sub" },
  geo: { title: "meta.geo.title", sub: "meta.geo.sub" },
  machines: { title: "meta.machines.title", sub: "meta.machines.sub" },
  maintenance: { title: "meta.maintenance.title", sub: "meta.maintenance.sub" },
  calendrier: { title: "meta.calendar.title", sub: "meta.calendar.sub" },
  couts: { title: "meta.costs.title", sub: "meta.costs.sub" },
  alertes: { title: "meta.alerts.title", sub: "meta.alerts.sub" },
  ia: { title: "meta.ia.title", sub: "meta.ia.sub" },
  diagnostics: { title: "meta.diagnostics.title", sub: "meta.diagnostics.sub" },
  seuils: { title: "meta.seuils.title", sub: "meta.seuils.sub" },
  simulateur: { title: "meta.simulator.title", sub: "meta.simulator.sub" },
  experiment: { title: "meta.experiment.title", sub: "meta.experiment.sub" },
  administration: { title: "meta.admin.title", sub: "meta.admin.sub" },
  "admin-users": { title: "meta.adminusers.title", sub: "meta.adminusers.sub" },
};

const ADMIN_ONLY_PAGES: PageId[] = [
  "machines",
  "couts",
  "seuils",
  "simulateur",
  "experiment",
  "administration",
  "admin-users",
];

const routeToPage: Record<string, PageId> = {
  "/dashboard": "dashboard",
  "/geo": "geo",
  "/machines": "machines",
  "/maintenance": "maintenance",
  "/calendrier": "calendrier",
  "/couts": "couts",
  "/alertes": "alertes",
  "/ia": "ia",
  "/rapport-ia": "ia",
  "/planner": "ia",
  "/diagnostics": "diagnostics",
  "/seuils": "seuils",
  "/simulateur": "simulateur",
  "/experiment": "experiment",
  "/administration": "administration",
  "/admin/users": "admin-users",
};

const pageToRoute: Record<PageId, string> = {
  dashboard: "/dashboard",
  geo: "/geo",
  machines: "/machines",
  maintenance: "/maintenance",
  calendrier: "/calendrier",
  couts: "/couts",
  alertes: "/alertes",
  ia: "/ia",
  diagnostics: "/diagnostics",
  seuils: "/seuils",
  simulateur: "/simulateur",
  experiment: "/experiment",
  administration: "/administration",
  "admin-users": "/admin/users",
};

function PageLoader({ label }: { label: string }) {
  return (
    <div className="flex min-h-[240px] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}

const Index = () => {
  const { currentUser, isAuthenticated, loading } = useAuth();
  const { t } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const route = location.pathname;
  const currentPage = routeToPage[route];

  const navigateTo = (path: string) => {
    navigate(path);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <span className="text-xs text-muted-foreground">{t("auth.loading")}</span>
        </div>
      </div>
    );
  }

  const showLogin = !currentUser && route === "/login";
  const showSignup = !currentUser && route === "/signup";
  const showForgot = !currentUser && route === "/forgot-password";
  const showReset = route === "/reset-password";
  const showPending =
    (currentUser && currentUser.status === "pending") || (!currentUser && route === "/pending");
  const showApp = isAuthenticated && currentUser?.status === "approved";
  const isAuthRoute =
    route === "/login" ||
    route === "/signup" ||
    route === "/forgot-password" ||
    route === "/reset-password";

  if (showLogin) {
    return (
      <Suspense fallback={<PageLoader label={t("auth.loading")} />}>
        <LoginPage onNavigate={navigateTo} />
      </Suspense>
    );
  }

  if (showForgot) {
    return (
      <Suspense fallback={<PageLoader label={t("auth.loading")} />}>
        <ForgotPasswordPage onNavigate={navigateTo} />
      </Suspense>
    );
  }

  if (showReset) {
    return (
      <Suspense fallback={<PageLoader label={t("auth.loading")} />}>
        <ResetPasswordPage onNavigate={navigateTo} />
      </Suspense>
    );
  }

  if (showPending) {
    return (
      <Suspense fallback={<PageLoader label={t("auth.loading")} />}>
        <PendingPage onNavigate={navigateTo} />
      </Suspense>
    );
  }

  if (showSignup) {
    return (
      <Suspense fallback={<PageLoader label={t("auth.loading")} />}>
        <SignupPage onNavigate={navigateTo} />
      </Suspense>
    );
  }

  if (currentUser && isAuthRoute) {
    if (currentUser.status === "approved") {
      return <Navigate to="/dashboard" replace />;
    }

    if (currentUser.status === "pending") {
      return <Navigate to="/pending" replace />;
    }
  }

  if (!showApp) {
    return <Navigate to="/landing" replace />;
  }

  if (!currentPage) {
    return <NotFound />;
  }

  const isAdmin = currentUser.role === "admin";

  if (!isAdmin && ADMIN_ONLY_PAGES.includes(currentPage)) {
    return <AccessDeniedPage />;
  }

  const handleSidebarNavigate = (pageId: PageId) => {
    navigateTo(pageToRoute[pageId] || "/dashboard");
  };

  const metaKeys = PAGE_META_KEYS[currentPage];
  const PageComponent = PAGES[currentPage];

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar
        currentPage={currentPage}
        onNavigate={handleSidebarNavigate}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        userRole={currentUser.role}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AppTopbar title={t(metaKeys.title)} subtitle={t(metaKeys.sub)} />
        <main className="flex-1 overflow-x-hidden overflow-y-auto p-6 lg:p-8">
          <div className="mx-auto max-w-[1400px] animate-fade-in" key={currentPage}>
            <ErrorBoundary>
              <Suspense fallback={<PageLoader label={t("auth.loading")} />}>
                <PageComponent />
              </Suspense>
            </ErrorBoundary>
            <AppFooter />
            {(currentPage === "dashboard" || currentPage === "maintenance") && <ChatWidget />}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Index;
