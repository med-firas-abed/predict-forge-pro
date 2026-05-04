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

  const tabs = [
    ...(isAdmin
      ? [
          {
            id: "planner" as const,
            label: l("Agent IA", "AI Agent", "Agent IA"),
            icon: Brain,
            description: l(
              "Analyse des risques, plan d'action et tâches proposées.",
              "Risk analysis, action plan, and proposed tasks.",
              "Risk analysis, action plan, and proposed tasks.",
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
              {l("Analyse & Rapport IA", "AI Analysis & Reporting", "AI Analysis & Reporting")}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {l(
                "Un seul espace pour analyser les risques, proposer des actions et produire le rapport final.",
                "A single space to analyze risks, propose actions, and produce the final report.",
                "A single space to analyze risks, propose actions, and produce the final report.",
              )}
            </p>
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

      {activeTab === "planner" && isAdmin ? <PlannerPage /> : <RapportIAPage embedded />}
    </div>
  );
}
