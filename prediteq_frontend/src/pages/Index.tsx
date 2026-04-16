import { useState, useEffect } from "react";
import { useLocation, useNavigate, Navigate } from "react-router-dom";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { AppFooter } from "@/components/layout/AppFooter";
import { DashboardPage } from "@/components/pages/DashboardPage";
import { MachinesPage } from "@/components/pages/MachinesPage";
import { MaintenancePage } from "@/components/pages/MaintenancePage";
import { CalendarPage } from "@/components/pages/CalendarPage";
import { CostsPage } from "@/components/pages/CostsPage";
import { AlertsPage } from "@/components/pages/AlertsPage";
import { GeoPage } from "@/components/pages/GeoPage";
import { AdminPage } from "@/components/pages/AdminPage";
import { RapportIAPage } from "@/components/pages/RapportIAPage";
import { SeuilsPage } from "@/components/pages/SeuilsPage";
import { SimulatorPage } from "@/components/pages/SimulatorPage";
import { ExperimentPage } from "@/components/pages/ExperimentPage";
import { AdminUsersPage } from "@/components/pages/AdminUsersPage";
import { LoginPage } from "@/components/pages/LoginPage";
import { SignupPage } from "@/components/pages/SignupPage";
import { PendingPage } from "@/components/pages/PendingPage";
import { ForgotPasswordPage } from "@/components/pages/ForgotPasswordPage";
import { ResetPasswordPage } from "@/components/pages/ResetPasswordPage";
import { PlannerPage } from "@/components/pages/PlannerPage";
import { ChatWidget } from "@/components/industrial/ChatWidget";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";

type PageId = 'dashboard' | 'geo' | 'machines' | 'maintenance' | 'calendrier' | 'couts' | 'alertes' | 'rapport-ia' | 'planner' | 'seuils' | 'simulateur' | 'experiment' | 'administration' | 'admin-users';

const PAGES: Record<PageId, React.ComponentType> = {
  dashboard: DashboardPage,
  geo: GeoPage,
  machines: MachinesPage,
  maintenance: MaintenancePage,
  calendrier: CalendarPage,
  couts: CostsPage,
  alertes: AlertsPage,
  'rapport-ia': RapportIAPage,
  planner: PlannerPage,
  seuils: SeuilsPage,
  simulateur: SimulatorPage,
  experiment: ExperimentPage,
  administration: AdminPage,
  'admin-users': AdminUsersPage,
};

const PAGE_META_KEYS: Record<PageId, { title: string; sub: string }> = {
  dashboard: { title: "meta.dashboard.title", sub: "meta.dashboard.sub" },
  geo: { title: "meta.geo.title", sub: "meta.geo.sub" },
  machines: { title: "meta.machines.title", sub: "meta.machines.sub" },
  maintenance: { title: "meta.maintenance.title", sub: "meta.maintenance.sub" },
  calendrier: { title: "meta.calendar.title", sub: "meta.calendar.sub" },
  couts: { title: "meta.costs.title", sub: "meta.costs.sub" },
  alertes: { title: "meta.alerts.title", sub: "meta.alerts.sub" },
  'rapport-ia': { title: "meta.rapportia.title", sub: "meta.rapportia.sub" },
  planner: { title: "meta.planner.title", sub: "meta.planner.sub" },
  seuils: { title: "meta.seuils.title", sub: "meta.seuils.sub" },
  simulateur: { title: "meta.simulator.title", sub: "meta.simulator.sub" },
  experiment: { title: "meta.experiment.title", sub: "meta.experiment.sub" },
  administration: { title: "meta.admin.title", sub: "meta.admin.sub" },
  'admin-users': { title: "meta.adminusers.title", sub: "meta.adminusers.sub" },
};

const ADMIN_ONLY_PAGES: PageId[] = ['machines', 'couts', 'seuils', 'simulateur', 'experiment', 'administration', 'admin-users'];

const routeToPage: Record<string, PageId> = {
  '/dashboard': 'dashboard',
  '/geo': 'geo',
  '/machines': 'machines',
  '/maintenance': 'maintenance',
  '/calendrier': 'calendrier',
  '/couts': 'couts',
  '/alertes': 'alertes',
  '/rapport-ia': 'rapport-ia',
  '/planner': 'planner',
  '/seuils': 'seuils',
  '/simulateur': 'simulateur',
  '/experiment': 'experiment',
  '/administration': 'administration',
  '/admin/users': 'admin-users',
};

const pageToRoute: Record<PageId, string> = {
  dashboard: '/dashboard',
  geo: '/geo',
  machines: '/machines',
  maintenance: '/maintenance',
  calendrier: '/calendrier',
  couts: '/couts',
  alertes: '/alertes',
  'rapport-ia': '/rapport-ia',
  planner: '/planner',
  seuils: '/seuils',
  simulateur: '/simulateur',
  experiment: '/experiment',
  administration: '/administration',
  'admin-users': '/admin/users',
};

const Index = () => {
  const { currentUser, isAuthenticated, loading } = useAuth();
  const { t } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const route = location.pathname;

  const navigateTo = (path: string) => {
    navigate(path);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-muted-foreground">{t("auth.loading")}</span>
        </div>
      </div>
    );
  }

  // Determine auth state
  const showLogin = !currentUser && route === "/login";
  const showSignup = !currentUser && route === "/signup";
  const showForgot = !currentUser && route === "/forgot-password";
  const showReset = route === "/reset-password";
  const showPending = (currentUser && currentUser.status === "pending") || (!currentUser && route === "/pending");
  const showApp = isAuthenticated && currentUser?.status === "approved";

  if (showLogin) return <LoginPage onNavigate={navigateTo} />;
  if (showForgot) return <ForgotPasswordPage onNavigate={navigateTo} />;
  if (showReset) return <ResetPasswordPage onNavigate={navigateTo} />;
  if (showPending) return <PendingPage onNavigate={navigateTo} />;
  if (showSignup) return <SignupPage onNavigate={navigateTo} />;
  if (!showApp) return <Navigate to="/landing" replace />;

  const isAdmin = currentUser!.role === "admin";
  let currentPage: PageId = routeToPage[route] || 'geo';

  // If route doesn't match any known page, redirect to geo
  if (!routeToPage[route]) {
    return <Navigate to="/geo" replace />;
  }

  if (!isAdmin && ADMIN_ONLY_PAGES.includes(currentPage)) {
    return <Navigate to="/geo" replace />;
  }

  const handleSidebarNavigate = (pageId: PageId) => {
    navigateTo(pageToRoute[pageId] || '/geo');
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
        userRole={currentUser!.role}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <AppTopbar title={t(metaKeys.title)} subtitle={t(metaKeys.sub)} />
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-6 lg:p-8">
          <div className="animate-fade-in max-w-[1400px] mx-auto" key={currentPage}>
            <ErrorBoundary>
              <PageComponent />
            </ErrorBoundary>
            <AppFooter />
            <ChatWidget />
          </div>
        </main>
      </div>
    </div>
  );
};

export default Index;
