import { Brain, FileText } from "lucide-react";
import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import { PlannerPage } from "@/components/pages/PlannerPage";
import { RapportIAPage } from "@/components/pages/RapportIAPage";
import { repairText } from "@/lib/repairText";

type IATab = "planner" | "report";

function getRequestedTab(pathname: string, search: string): IATab {
  if (pathname === "/rapport-ia") return "report";
  if (pathname === "/planner") return "planner";

  const params = new URLSearchParams(search);
  const tab = params.get("tab");

  if (tab === "report") return "report";
  if (tab === "planner") return "planner";

  return "planner";
}

export function IAPage() {
  const { lang } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const l = (fr: string, en: string, ar: string) =>
    repairText(lang === "fr" ? fr : lang === "en" ? en : ar);

  const activeTab = useMemo(
    () => getRequestedTab(location.pathname, location.search),
    [location.pathname, location.search],
  );
  const pageLead =
    activeTab === "planner"
      ? l(
          "Partir de l'etat machine, choisir les priorites flotte, puis valider les actions utiles.",
          "Start from machine status, choose fleet priorities, then validate the useful actions.",
          "Start from machine status, choose fleet priorities, then validate the useful actions.",
        )
      : l(
          "Rassembler l'etat machine, l'historique et les actions dans une synthese claire et exportable.",
          "Gather machine status, history, and actions into a clear report ready to export.",
          "Gather machine status, history, and actions into a clear report ready to export.",
        );

  const tabs = [
    {
      id: "planner" as const,
      label: l("Plan d'action", "Action plan", "Plan d'action"),
      icon: Brain,
      description: l(
        "Priorites machine, actions utiles et preparation du calendrier.",
        "Machine priorities, useful actions, and calendar preparation.",
        "Machine priorities, useful actions, and calendar preparation.",
      ),
    },
    {
      id: "report" as const,
      label: l("Rapports", "Reports", "Reports"),
      icon: FileText,
      description: l(
        "Synthese, historique et export PDF.",
        "Summary, history, and PDF export.",
        "Summary, history, and PDF export.",
      ),
    },
  ];

  const switchTab = (tab: IATab) => {
    navigate(tab === "report" ? "/ia?tab=report" : "/ia?tab=planner");
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-premium">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="section-title">
              {l("Analyse, actions & rapports", "Analysis, actions & reports", "Analysis, actions & reports")}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {pageLead}
            </p>
          </div>
          <div className="rounded-full border border-border bg-surface-3 px-3 py-1 text-[0.68rem] font-semibold text-muted-foreground">
            {l("Lire -> prioriser -> valider -> suivre", "Review -> prioritize -> validate -> track", "Review -> prioritize -> validate -> track")}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => switchTab(tab.id)}
                className={`rounded-2xl border p-4 text-left transition-all ${
                  active
                    ? "border-primary/40 bg-primary/8 shadow-premium"
                    : "border-border bg-surface-3 hover:border-primary/20"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                      active ? "bg-primary/12 text-primary" : "bg-card text-muted-foreground"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">{tab.label}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{tab.description}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === "planner" ? <PlannerPage embedded /> : <RapportIAPage embedded />}
    </div>
  );
}
