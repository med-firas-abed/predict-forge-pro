import { Bell, ChevronLeft, ChevronRight, LayoutDashboard, Cpu, Wrench, Calendar, DollarSign, ShieldCheck, MapPin, Sparkles, SlidersHorizontal, Activity, LogOut, Brain, CircleDot, FileText } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { UserRole, useAuth } from "@/contexts/AuthContext";
import { useAlertes } from "@/hooks/useAlertes";

type PageId = 'dashboard' | 'geo' | 'machines' | 'maintenance' | 'calendrier' | 'couts' | 'alertes' | 'rapport-ia' | 'planner' | 'seuils' | 'simulateur' | 'experiment' | 'administration' | 'admin-users';

interface AppSidebarProps {
  currentPage: string;
  onNavigate: (page: PageId) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  userRole: UserRole;
}

export function AppSidebar({ currentPage, onNavigate, collapsed, onToggleCollapse, userRole }: AppSidebarProps) {
  const { t, theme } = useApp();
  const { logout, currentUser } = useAuth();
  const { alertes } = useAlertes();
  const unacknowledgedCount = alertes.filter(a => !a.acquitte).length;

  const isAdmin = userRole === "admin";

  const NAV_ITEMS: { section: string; items: { id: PageId; labelKey: string; icon: React.ElementType; badge?: number }[] }[] = [
    {
      section: t("nav.navigation"),
      items: [
        { id: "geo" as PageId, labelKey: "nav.geo", icon: MapPin },
        { id: "dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
        { id: "alertes", labelKey: "nav.alerts", icon: Bell, badge: unacknowledgedCount || undefined },
        ...(isAdmin ? [{ id: "machines" as PageId, labelKey: "nav.machines", icon: Cpu }] : []),
        { id: "rapport-ia" as PageId, labelKey: "nav.rapportIA", icon: FileText },
        { id: "planner" as PageId, labelKey: "nav.planner", icon: Brain },
        { id: "calendrier", labelKey: "nav.calendar", icon: Calendar },
        { id: "maintenance", labelKey: "nav.maintenance", icon: Wrench },
        ...(isAdmin ? [{ id: "couts" as PageId, labelKey: "nav.costs", icon: DollarSign }] : []),
      ],
    },
    ...(isAdmin ? [{
      section: t("nav.system"),
      items: [
        { id: "administration" as PageId, labelKey: "nav.admin", icon: ShieldCheck },
        { id: "seuils" as PageId, labelKey: "nav.seuils", icon: SlidersHorizontal },
        { id: "simulateur" as PageId, labelKey: "nav.simulator", icon: Activity },
        { id: "experiment" as PageId, labelKey: "nav.experiment", icon: CircleDot },
      ],
    }] : []),
  ];

  return (
    <nav
      className={`relative flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300 z-50 ${collapsed ? 'w-[68px] min-w-[68px]' : 'w-[260px] min-w-[260px]'}`}
    >
      {/* Logo */}
      <div className={`flex items-center justify-center px-3 pt-6 pb-4 ${collapsed ? '' : 'px-5'}`}>
        <img
          src={theme === "dark" ? "/logo-dark.svg" : "/logo-light.svg"}
          alt="PrediTeq"
          className={`object-contain transition-all duration-300 ${collapsed ? 'h-8 w-10' : 'h-12 w-full max-w-[200px]'}`}
        />
      </div>

      <div className="section-divider mx-4 my-1" />

      {/* Nav sections */}
      <div className="flex-1 overflow-y-auto py-2">
        {NAV_ITEMS.map((section) => (
          <div key={section.section} className="mb-2">
            {!collapsed && (
              <div className="industrial-label px-5 py-2.5">
                {section.section}
              </div>
            )}
            {section.items.map((item) => {
              const active = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className={`flex items-center gap-3 mx-3 mb-0.5 rounded-xl text-[13px] font-medium transition-all whitespace-nowrap overflow-hidden
                    ${active
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'text-sidebar-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  style={{
                    width: collapsed ? '44px' : 'calc(100% - 24px)',
                    padding: collapsed ? '10px' : '9px 14px',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                  }}
                >
                  <item.icon className="w-[18px] h-[18px] min-w-[18px]" aria-hidden="true" />
                  {!collapsed && <span>{t(item.labelKey)}</span>}
                  {collapsed && <span className="sr-only">{t(item.labelKey)}</span>}
                  {!collapsed && item.badge && (
                    <span className="ml-auto bg-destructive text-destructive-foreground rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold min-w-[18px] text-center">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* User + Logout */}
      <div className="border-t border-sidebar-border mx-3 pt-3 pb-12 px-1">
        <div className="section-divider mx-1 mb-3" />
        {!collapsed && currentUser && (
          <div className="flex items-center gap-2.5 px-2 mb-2 overflow-hidden">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shadow-md flex-shrink-0">
              {currentUser.fullName?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-foreground truncate">{currentUser.fullName}</div>
              <div className="text-[0.6rem] text-muted-foreground truncate">{currentUser.email}</div>
            </div>
          </div>
        )}
        <button
          onClick={logout}
          className={`flex items-center gap-3 w-full rounded-xl text-[13px] font-medium text-sidebar-foreground hover:bg-destructive/10 hover:text-destructive transition-all ${
            collapsed ? 'justify-center p-2.5' : 'px-3 py-2.5'
          }`}
        >
          <LogOut className="w-[18px] h-[18px] min-w-[18px]" />
          {!collapsed && <span>{t("nav.logout") !== "nav.logout" ? t("nav.logout") : "Déconnexion"}</span>}
        </button>
      </div>

      {/* Collapse button — teal hover */}
      <button
        onClick={onToggleCollapse}
        className="absolute bottom-5 left-1/2 -translate-x-1/2 w-7 h-7 rounded-full bg-surface-3 border border-border-subtle flex items-center justify-center text-muted-foreground hover:bg-primary/15 hover:text-primary hover:border-primary/30 transition-all"
      >
        {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
      </button>
    </nav>
  );
}
