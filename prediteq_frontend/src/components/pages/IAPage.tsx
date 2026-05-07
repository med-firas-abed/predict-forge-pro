import { Brain, FileText } from "lucide-react";
import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { PlannerPage } from "@/components/pages/PlannerPage";
import { RapportIAPage } from "@/components/pages/RapportIAPage";
import { repairText } from "@/lib/repairText";

type IATab = "planner" | "report";

function getRequestedTab(pathname: string, search: string, isAdmin: boolean): IATab {
  if (pathname === "/rapport-ia") return "report";
  if (pathname === "/planner") return isAdmin ? "planner" : "report";

  const params = new URLSearchParams(search);
  const tab = params.get("tab");

  if (tab === "report") return "report";
  if (tab === "planner" && isAdmin) return "planner";

  return isAdmin ? "planner" : "report";
}

export function IAPage() {
  const { lang } = useApp();
  const { currentUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isAdmin = currentUser?.role === "admin";
  const l = (fr: string, en: string, ar: string) =>
    repairText(lang === "fr" ? fr : lang === "en" ? en : ar);

  const activeTab = useMemo(
    () => getRequestedTab(location.pathname, location.search, isAdmin),
    [isAdmin, location.pathname, location.search],
  );
  const pageLead =
    activeTab === "planner"
      ? l(
          "Partir du pronostic machine, choisir les priorites flotte, puis transformer la prediction en taches validees.",
          "Prioritize the fleet, prepare the actions, then validate the send to the maintenance calendar.",
          "Prioritize the fleet, prepare the actions, then validate the send to the maintenance calendar.",
        )
      : l(
          "Transformer le pronostic HI, stress et RUL en synthese claire, historique et PDF final.",
          "Generate the formal report, review the history, and export the final PDF.",
          "Generate the formal report, review the history, and export the final PDF.",
        );

  const tabs = [
    ...(isAdmin
      ? [
          {
            id: "planner" as const,
            label: l("Planification IA", "AI Planning", "Planification IA"),
            icon: Brain,
            description: l(
              "Pronostic flotte, plan d'action et validation calendrier.",
              "Fleet priorities, proposed actions, and tasks ready for validation.",
              "Fleet priorities, proposed actions, and tasks ready for validation.",
            ),
          },
        ]
      : []),
    {
      id: "report" as const,
      label: l("Rapport IA", "AI Report", "AI Report"),
      icon: FileText,
      description: l(
        "Rapport formel, historique et export PDF.",
        "Formal report, history, and PDF export.",
        "Formal report, history, and PDF export.",
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
              {l("Prediction, decision & rapport IA", "AI prediction, decision & reporting", "AI prediction, decision & reporting")}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {pageLead}
            </p>
          </div>
          <div className="rounded-full border border-border bg-surface-3 px-3 py-1 text-[0.68rem] font-semibold text-muted-foreground">
            {l("Predire -> expliquer -> decider -> executer", "Predict -> explain -> decide -> execute", "Predict -> explain -> decide -> execute")}
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

      {activeTab === "planner" && isAdmin ? <PlannerPage embedded /> : <RapportIAPage embedded />}
    </div>
  );
}
