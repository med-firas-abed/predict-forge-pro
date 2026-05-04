import {
  Activity,
  Bell,
  Brain,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Cpu,
  DollarSign,
  LayoutDashboard,
  LogOut,
  MapPin,
  ShieldCheck,
  SlidersHorizontal,
  Wrench,
} from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { UserRole, useAuth } from "@/contexts/AuthContext";
import { useAlertes } from "@/hooks/useAlertes";
import { getActiveAlertCaseCount } from "@/lib/alertsSummary";

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

interface AppSidebarProps {
  currentPage: string;
  onNavigate: (page: PageId) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  userRole: UserRole;
}

interface NavItem {
  id: PageId;
  icon: React.ElementType;
  labelKey?: string;
  label?: string;
  badge?: number;
}

export function AppSidebar({
  currentPage,
  onNavigate,
  collapsed,
  onToggleCollapse,
  userRole,
}: AppSidebarProps) {
  const { t, theme, lang } = useApp();
  const { logout, currentUser } = useAuth();
  const { alertes } = useAlertes();
  const activeCaseCount = getActiveAlertCaseCount(alertes);
  const isAdmin = userRole === "admin";
  const l = (fr: string, en: string, ar: string) =>
    lang === "fr" ? fr : lang === "en" ? en : ar;

  const navSections: { section: string; items: NavItem[] }[] = [
    {
      section: l("Pilotage", "Operations", "التسيير"),
      // Ordre revu : "Centre d'alertes" est placé en DERNIÈRE position pour
      // refléter le flux opérationnel naturel (vue d'ensemble → diagnostic →
      // géolocalisation → IA → maintenance → coûts → alertes/escalades).
      // Les alertes ne sont pas un point d'entrée mais un point de sortie :
      // on les consulte une fois qu'on a déjà observé la flotte ailleurs.
      items: [
        { id: "dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
        { id: "diagnostics", labelKey: "nav.diagnostics", icon: Activity },
        { id: "geo", labelKey: "nav.geo", icon: MapPin },
        { id: "ia", labelKey: "nav.ia", icon: Brain },
        { id: "maintenance", labelKey: "nav.maintenance", icon: Wrench },
        ...(isAdmin
          ? [{ id: "couts" as const, labelKey: "nav.costs", icon: DollarSign }]
          : []),
        {
          id: "alertes",
          labelKey: "nav.alerts",
          icon: Bell,
          badge: activeCaseCount || undefined,
        },
      ],
    },
    ...(isAdmin
      ? [
          {
            section: l("Administration", "Administration", "الإدارة"),
            items: [
              { id: "machines", labelKey: "nav.machines", icon: Cpu },
              { id: "administration", labelKey: "nav.admin", icon: ShieldCheck },
              { id: "seuils", labelKey: "nav.seuils", icon: SlidersHorizontal },
            ],
          },
          {
            section: l(
              "Demo & experimentation",
              "Demo & experimentation",
              "العرض والتجريب",
            ),
            items: [
              { id: "simulateur", labelKey: "nav.simulator", icon: Activity },
              { id: "experiment", labelKey: "nav.experiment", icon: CircleDot },
            ],
          },
        ]
      : []),
  ];

  const getItemLabel = (item: NavItem) =>
    item.label ?? (item.labelKey ? t(item.labelKey) : item.id);

  const preloadPage = (pageId: PageId) => {
    if (pageId === "simulateur") {
      void import("@/components/pages/SimulatorPage");
    }
    if (pageId === "diagnostics") {
      void import("@/components/pages/DiagnosticsPage");
    }
  };

  return (
    <nav
      className={`relative z-50 flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300 ${
        collapsed ? "w-[68px] min-w-[68px]" : "w-[260px] min-w-[260px]"
      }`}
    >
      <div
        className={`flex items-center justify-center px-3 pt-6 pb-4 ${
          collapsed ? "" : "px-5"
        }`}
      >
        <img
          src={theme === "dark" ? "/logo-dark-removebg-preview.png" : "/logo-light.svg"}
          alt="PrediTeq"
          className={`object-contain transition-all duration-300 ${
            collapsed ? "h-8 w-10" : "h-12 w-full max-w-[200px]"
          }`}
        />
      </div>

      <div className="section-divider mx-4 my-1" />

      <div className="flex-1 overflow-y-auto py-2">
        {navSections.map((section) => (
          <div key={section.section} className="mb-2">
            {!collapsed && (
              <div className="industrial-label px-5 py-2.5">{section.section}</div>
            )}
            {section.items.map((item) => {
              const active = currentPage === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  onMouseEnter={() => preloadPage(item.id)}
                  onFocus={() => preloadPage(item.id)}
                  className={`mx-3 mb-0.5 flex items-center gap-3 overflow-hidden rounded-xl text-[13px] font-medium whitespace-nowrap transition-all ${
                    active
                      ? "bg-primary/10 font-semibold text-primary"
                      : "text-sidebar-foreground hover:bg-muted hover:text-foreground"
                  }`}
                  style={{
                    width: collapsed ? "44px" : "calc(100% - 24px)",
                    padding: collapsed ? "10px" : "9px 14px",
                    justifyContent: collapsed ? "center" : "flex-start",
                  }}
                >
                  <item.icon className="h-[18px] w-[18px] min-w-[18px]" aria-hidden="true" />
                  {!collapsed && <span>{getItemLabel(item)}</span>}
                  {collapsed && <span className="sr-only">{getItemLabel(item)}</span>}
                  {!collapsed && item.badge && (
                    <span className="ml-auto min-w-[18px] rounded-full bg-destructive px-1.5 py-0.5 text-center text-[0.6rem] font-bold text-destructive-foreground">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="mx-3 border-t border-sidebar-border px-1 pb-12 pt-3">
        <div className="section-divider mx-1 mb-3" />
        {!collapsed && currentUser && (
          <div className="mb-2 flex items-center gap-2.5 overflow-hidden px-2">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary shadow-md">
              {currentUser.fullName
                ?.split(" ")
                .map((part) => part[0])
                .join("")
                .toUpperCase()
                .slice(0, 2)}
            </div>
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-foreground">
                {currentUser.fullName}
              </div>
              <div className="truncate text-[0.6rem] text-muted-foreground">
                {currentUser.email}
              </div>
            </div>
          </div>
        )}

        <button
          onClick={logout}
          className={`flex w-full items-center gap-3 rounded-xl text-[13px] font-medium text-sidebar-foreground transition-all hover:bg-destructive/10 hover:text-destructive ${
            collapsed ? "justify-center p-2.5" : "px-3 py-2.5"
          }`}
        >
          <LogOut className="h-[18px] w-[18px] min-w-[18px]" />
          {!collapsed && (
            <span>{t("nav.logout") !== "nav.logout" ? t("nav.logout") : "Deconnexion"}</span>
          )}
        </button>
      </div>

      <button
        onClick={onToggleCollapse}
        className="absolute bottom-5 left-1/2 flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full border border-border-subtle bg-surface-3 text-muted-foreground transition-all hover:border-primary/30 hover:bg-primary/15 hover:text-primary"
      >
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5" />
        ) : (
          <ChevronLeft className="h-3.5 w-3.5" />
        )}
      </button>
    </nav>
  );
}
