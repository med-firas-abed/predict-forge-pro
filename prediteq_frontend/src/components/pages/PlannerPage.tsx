import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  AlertTriangle,
  Brain,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Pencil,
  Play,
  Shield,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { repairText } from "@/lib/repairText";

interface RiskEntry {
  machine_code: string;
  nom: string;
  region: string;
  hi: number | null;
  rul_days: number | null;
  zone: string | null;
  risk_score: number;
  risk_level: "critical" | "priority" | "watch" | "stable";
  risk_label: string;
  summary: string;
  recommended_action: string;
  maintenance_window: string | null;
  open_tasks: number;
  data_source: string;
  updated_at: string | null;
  is_stale: boolean;
}

interface ProposedTask {
  machine_code: string;
  titre: string;
  type: "preventive" | "corrective" | "inspection";
  priorite: "haute" | "moyenne" | "basse";
  date_planifiee: string;
  cout_estime: number | null;
  description: string;
  technicien: string;
}

interface PlannerFleetRow extends RiskEntry {
  plain_reason: string;
  impact: string;
  evidence: string[];
  field_checks: string[];
  projected_cost: number;
  delayed_cost: number;
  delay_penalty: number;
}

interface GeneratePlanResponse {
  generated_at: string;
  focus_machine: string | null;
  markdown: string;
  tasks: ProposedTask[];
  fleet: PlannerFleetRow[];
}

interface PlannerPageProps {
  embedded?: boolean;
}

const RISK_CONFIG = {
  critical: {
    color: "text-destructive",
    bg: "bg-destructive/10",
    panel: "border-destructive/20 bg-destructive/5",
    icon: AlertTriangle,
  },
  priority: {
    color: "text-warning",
    bg: "bg-warning/10",
    panel: "border-warning/20 bg-warning/5",
    icon: AlertTriangle,
  },
  watch: {
    color: "text-primary",
    bg: "bg-primary/10",
    panel: "border-primary/20 bg-primary/5",
    icon: Shield,
  },
  stable: {
    color: "text-success",
    bg: "bg-success/10",
    panel: "border-success/20 bg-success/5",
    icon: CheckCircle,
  },
} as const;

function formatHi(hi: number | null) {
  if (typeof hi !== "number") return "Indisponible";
  return `HI ${Math.round(hi * 100)}%`;
}

function formatRul(rulDays: number | null) {
  if (typeof rulDays !== "number") return "RUL indisponible";
  return `RUL ${Math.round(rulDays)} j`;
}

function formatUpdatedAt(value: string | null) {
  if (!value) return "Lecture en attente";
  return new Date(value).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getSourceLabel(source: string) {
  switch (source) {
    case "live_runtime":
      return "Flux live";
    case "simulator_demo":
      return "Replay calibre";
    case "persisted_reference":
      return "Reference stable";
    default:
      return "Lecture partielle";
  }
}

function formatCurrency(value: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "Cout indisponible";
  return `${Math.round(value).toLocaleString("fr-FR")} TND`;
}

export function PlannerPage({ embedded = false }: PlannerPageProps) {
  const { lang } = useApp();
  const { currentUser } = useAuth();
  const location = useLocation();
  const isAdmin = currentUser?.role === "admin";
  const [riskData, setRiskData] = useState<RiskEntry[]>([]);
  const [loadingRisk, setLoadingRisk] = useState(false);
  const [planText, setPlanText] = useState("");
  const [planGeneratedAt, setPlanGeneratedAt] = useState<string | null>(null);
  const [generatedFleet, setGeneratedFleet] = useState<PlannerFleetRow[]>([]);
  const [generating, setGenerating] = useState(false);
  const [proposedTasks, setProposedTasks] = useState<ProposedTask[]>([]);
  const [approvingIdx, setApprovingIdx] = useState<number | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [focusMachine, setFocusMachine] = useState<string | null>(null);
  const [showRisk, setShowRisk] = useState(true);
  const l = (fr: string, en: string, ar: string) =>
    repairText(lang === "fr" ? fr : lang === "en" ? en : ar);
  const requestedFocusMachine = useMemo(
    () => new URLSearchParams(location.search).get("machine"),
    [location.search],
  );

  const plannerTitle = l(
    "Choisir quoi traiter en premier",
    "Fleet priority control",
    "Fleet priority control",
  );
  const plannerSubtitle = l(
    "La page classe les machines, prepare un plan d'action, puis envoie les taches validees au calendrier maintenance.",
    "Ranks the fleet, suggests useful actions, and prepares the send to the maintenance calendar.",
    "Ranks the fleet, suggests useful actions, and prepares the send to the maintenance calendar.",
  );
  const workflowTitle = l("3 etapes simples", "3 simple steps", "3 simple steps");
  const workflowSubtitle = l(
    "1. Cliquez une machine dans la liste si vous voulez la cibler. 2. Lancez le plan d'action. 3. Validez les taches a envoyer au calendrier.",
    "1. Focus a machine if needed. 2. Generate the proposed actions. 3. Validate each action to send it to the calendar.",
    "1. Focus a machine if needed. 2. Generate the proposed actions. 3. Validate each action to send it to the calendar.",
  );
  const fleetRiskTitle = l(
    "Machines a traiter d'abord",
    "Machine priority order",
    "Machine priority order",
  );
  const fullPlanTitle = l("Plan d'action propose", "Proposed action plan", "Proposed action plan");
  const generateLabel = l(
    "Lancer le plan d'action",
    "Generate proposed actions",
    "Generate proposed actions",
  );
  const generatingLabel = l("Generation...", "Generating...", "Generating...");
  const proposedTasksTitle = l(
    "Taches a envoyer au calendrier",
    "Actions to validate for the calendar",
    "Actions to validate for the calendar",
  );
  const loadingRiskLabel = l("Chargement...", "Loading...", "Loading...");
  const noDataLabel = l(
    "Aucune lecture disponible - demarrez le simulateur",
    "No data - start the simulator",
    "No data - start the simulator",
  );
  const openTasksLabel = l("tache(s) ouverte(s)", "open task(s)", "open task(s)");
  const autoRefreshLabel = l("Mise a jour auto 5 s", "Auto refresh 5 s", "Auto refresh 5 s");

  const loadRisk = async (silent = false) => {
    if (!silent) setLoadingRisk(true);
    try {
      const data = await apiFetch<RiskEntry[]>("/planner/status");
      setRiskData(data);
    } catch {
      if (!silent) setRiskData([]);
    } finally {
      if (!silent) setLoadingRisk(false);
    }
  };

  useEffect(() => {
    void loadRisk();
    const intervalId = window.setInterval(() => {
      void loadRisk(true);
    }, 5_000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    setFocusMachine(requestedFocusMachine);
  }, [requestedFocusMachine]);

  const generatePlan = async () => {
    setGenerating(true);
    setPlanText("");
    setGeneratedFleet([]);
    setProposedTasks([]);

    try {
      const data = await apiFetch<GeneratePlanResponse>("/planner/generate", {
        method: "POST",
        body: JSON.stringify({ focus_machine: focusMachine }),
      });
      setPlanText(data.markdown);
      setPlanGeneratedAt(data.generated_at);
      setGeneratedFleet(data.fleet);
      setProposedTasks(data.tasks);

      toast.success(
        l(
          `${data.tasks.length} tache(s) proposee(s) par le planificateur.`,
          `${data.tasks.length} task(s) proposed by the planner.`,
          `${data.tasks.length} task(s) proposed by the planner.`,
        ),
      );
    } catch {
      toast.error(
        l(
          "Erreur lors de la generation de la synthese",
          "Failed to generate the summary",
          "Failed to generate the summary",
        ),
      );
    } finally {
      setGenerating(false);
    }
  };

  const approveTask = async (idx: number) => {
    const task = proposedTasks[idx];
    setApprovingIdx(idx);

    try {
      await apiFetch("/planner/approve", {
        method: "POST",
        body: JSON.stringify(task),
      });
      toast.success(
        l(
          `Tache "${task.titre}" creee dans la GMAO`,
          `Task "${task.titre}" created in the GMAO`,
          `Task "${task.titre}" created in the GMAO`,
        ),
      );
      setProposedTasks((previous) => previous.filter((_, index) => index !== idx));
      void loadRisk();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : l("Erreur d'approbation", "Approval failed", "Approval failed"),
      );
    } finally {
      setApprovingIdx(null);
    }
  };

  const displayText = planText.trim();
  const rankedRisk = useMemo(
    () => [...riskData].sort((left, right) => right.risk_score - left.risk_score),
    [riskData],
  );
  const selectedRisk = useMemo(
    () => rankedRisk.find((entry) => entry.machine_code === focusMachine) ?? null,
    [focusMachine, rankedRisk],
  );
  const criticalCount = rankedRisk.filter((entry) => entry.risk_level === "critical").length;
  const priorityCount = rankedRisk.filter((entry) => entry.risk_level === "priority").length;
  const staleCount = rankedRisk.filter((entry) => entry.is_stale).length;

  const riskCounters = [
    {
      label: l("Urgent", "Critical", "Critical"),
      value: criticalCount,
      valueClass: "text-destructive",
      caption: l("agir vite", "Fast action", "Fast action"),
    },
    {
      label: l("A programmer", "To schedule", "To schedule"),
      value: priorityCount,
      valueClass: "text-warning",
      caption: l("a planifier", "Useful window", "Useful window"),
    },
    {
      label: l("A verifier", "To confirm", "To confirm"),
      value: staleCount,
      valueClass: "text-primary",
      caption: l("lecture a revoir", "Stream to recheck", "Stream to recheck"),
    },
  ];

  const planTitle = focusMachine
    ? l(`Plan d'action pour ${focusMachine}`, `Summary for ${focusMachine}`, `Summary for ${focusMachine}`)
    : fullPlanTitle;
  const planSubtitle = selectedRisk
    ? l(
        `Lisez le resume pour ${selectedRisk.machine_code}, puis validez seulement les actions utiles ci-dessous.`,
        `Review the summary for ${selectedRisk.machine_code} before validating the actions below.`,
        `Review the summary for ${selectedRisk.machine_code} before validating the actions below.`,
      )
    : l(
        "Lisez le resume, puis validez les actions que vous voulez envoyer au calendrier.",
        "The summary helps review the priorities before validating the actions.",
        "The summary helps review the priorities before validating the actions.",
      );

  const workflowSteps = [
    {
      id: "focus",
      step: "1",
      title: l("Cliquer une machine", "Click a machine", "Click a machine"),
      detail: focusMachine
        ? l(
            `Machine choisie : ${focusMachine}. Recliquez sur sa carte ou utilisez "Voir toute la flotte" pour revenir a la vue globale.`,
            `Focused machine: ${focusMachine}`,
            `Focused machine: ${focusMachine}`,
          )
        : l(
            "Cliquez une carte dans la liste ci-dessous pour cibler une machine. Sans selection, le plan reste global pour toute la flotte.",
            "Optional: keep the fleet view or choose a machine in the list below.",
            "Optional: keep the fleet view or choose a machine in the list below.",
          ),
      active: Boolean(focusMachine),
    },
    {
      id: "generate",
      step: "2",
      title: l("Lancer le plan", "Run the plan", "Run the plan"),
      detail: displayText
        ? l(
            "Le plan est pret. Verifiez-le avant de valider les taches.",
            "Summary ready for review before validation.",
            "Summary ready for review before validation.",
          )
        : l(
            "Cliquez sur le bouton vert pour generer le plan d'action.",
            "Run the summary to prepare maintenance decisions.",
            "Run the summary to prepare maintenance decisions.",
          ),
      active: generating || Boolean(displayText),
    },
    {
      id: "validate",
      step: "3",
      title: l("Envoyer au calendrier", "Send to calendar", "Send to calendar"),
      detail:
        proposedTasks.length > 0
          ? l(
              `${proposedTasks.length} tache(s) sont pretes a etre envoyees au calendrier.`,
              `${proposedTasks.length} action(s) waiting for calendar validation.`,
              `${proposedTasks.length} action(s) waiting for calendar validation.`,
            )
          : l(
              "Apres generation, chaque validation ajoute la tache au calendrier maintenance.",
              "Each validation creates the task directly in the maintenance calendar.",
              "Each validation creates the task directly in the maintenance calendar.",
            ),
      active: proposedTasks.length > 0,
    },
  ];

  return (
    <div className={embedded ? "space-y-5" : "space-y-6"}>
      {!embedded && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-start gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Brain className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-foreground">{plannerTitle}</h2>
                <p className="text-xs text-muted-foreground">{plannerSubtitle}</p>
              </div>
            </div>
            <span className="rounded-full border border-border bg-card px-3 py-1 text-[0.65rem] font-semibold text-muted-foreground">
              {autoRefreshLabel}
            </span>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="section-title">{workflowTitle}</div>
            <p className="mt-1 text-xs text-muted-foreground">{workflowSubtitle}</p>
          </div>
          <button
            type="button"
            onClick={generatePlan}
            disabled={generating}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {generating ? generatingLabel : generateLabel}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {workflowSteps.map((item) => (
            <div
              key={item.id}
              className={`rounded-2xl border px-4 py-3 ${
                item.active ? "border-primary/30 bg-primary/5" : "border-border bg-muted/10"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[0.68rem] font-semibold ${
                    item.active ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"
                  }`}
                >
                  {item.step}
                </span>
                <span className="text-sm font-semibold text-foreground">{item.title}</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{item.detail}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <button type="button" onClick={() => setShowRisk(!showRisk)} className="flex min-w-0 items-center gap-2 text-left">
              <span className="section-title flex-1">{fleetRiskTitle}</span>
              {showRisk ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
            <p className="mt-1 text-xs text-muted-foreground">
              {l(
                "Cliquez une carte pour cibler cette machine. Recliquez dessus, ou utilisez \"Voir toute la flotte\", pour revenir a la vue globale.",
                "Choose a machine to focus the summary, or keep the fleet view for a global readout.",
                "Choose a machine to focus the summary, or keep the fleet view for a global readout.",
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {riskCounters.map((card) => (
              <div key={card.label} className="min-w-[104px] rounded-xl border border-border bg-muted/15 px-3 py-2 text-right">
                <div className="industrial-label">{card.label}</div>
                <div className={`mt-1 text-lg font-semibold ${card.valueClass}`}>{card.value}</div>
                <div className="text-[0.68rem] text-muted-foreground">{card.caption}</div>
              </div>
            ))}
            {focusMachine && (
              <button
                type="button"
                onClick={() => setFocusMachine(null)}
                className="rounded-full border border-border px-3 py-1 text-[0.7rem] font-medium text-muted-foreground transition-all hover:bg-muted"
              >
                {l("Voir toute la flotte", "Show full fleet", "Show full fleet")}
              </button>
            )}
          </div>
        </div>

        {showRisk && (
          <div className="mt-4 space-y-3">
            {loadingRisk ? (
              <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {loadingRiskLabel}
              </div>
            ) : rankedRisk.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">{noDataLabel}</p>
            ) : (
              rankedRisk.map((entry) => {
                const config = RISK_CONFIG[entry.risk_level] || RISK_CONFIG.stable;
                const Icon = config.icon;
                const active = focusMachine === entry.machine_code;

                return (
                  <button
                    key={entry.machine_code}
                    type="button"
                    onClick={() => setFocusMachine(active ? null : entry.machine_code)}
                    className={`w-full rounded-2xl border p-4 text-left transition-all ${
                      active ? "border-primary bg-primary/5 shadow-premium" : `border-border hover:border-primary/20 ${config.panel}`
                    }`}
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${config.bg}`}>
                          <Icon className={`h-4 w-4 ${config.color}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-sm font-semibold text-foreground">
                              {entry.machine_code} - {entry.nom}
                            </div>
                            <span className={`rounded-full px-2 py-0.5 text-[0.6rem] font-semibold ${config.bg} ${config.color}`}>
                              {entry.risk_label}
                            </span>
                            <span className="rounded-full bg-card px-2 py-0.5 text-[0.6rem] text-muted-foreground">
                              {getSourceLabel(entry.data_source)}
                            </span>
                            {active && (
                              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[0.6rem] font-semibold text-primary">
                                {l("Machine ciblee", "Focused machine", "Focused machine")}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-[0.72rem] text-muted-foreground">
                            {entry.region} - {entry.open_tasks} {openTasksLabel} - {formatUpdatedAt(entry.updated_at)}
                          </div>
                          <div className="mt-2 text-sm text-secondary-foreground">{entry.summary}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{entry.recommended_action}</div>
                        </div>
                      </div>
                      <div className="shrink-0 text-right lg:min-w-[92px]">
                        <div className="industrial-label">{l("Score", "Score", "Score")}</div>
                        <div className={`mt-1 text-xl font-semibold ${config.color}`}>{entry.risk_score}</div>
                        <div className="mt-2 space-y-1 text-[0.68rem] text-muted-foreground">
                          <div>{formatHi(entry.hi)}</div>
                          <div>{formatRul(entry.rul_days)}</div>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {(displayText || generating) && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="section-title">{planTitle}</div>
              <p className="mt-1 text-xs text-muted-foreground">{planSubtitle}</p>
            </div>
            {focusMachine && (
              <span className="rounded-full border border-border bg-surface-3 px-3 py-1 text-[0.7rem] font-medium text-muted-foreground">
                {l("Machine ciblee", "Focused machine", "Focused machine")}: {focusMachine}
              </span>
            )}
          </div>

          {displayText ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {planGeneratedAt && (
                  <span className="rounded-full border border-border bg-surface-3 px-3 py-1">
                    {l("Generee le", "Generated on", "Generated on")} {formatUpdatedAt(planGeneratedAt)}
                  </span>
                )}
                {focusMachine && (
                  <span className="rounded-full border border-border bg-surface-3 px-3 py-1">
                    {l("Cible", "Focus", "Focus")} {focusMachine}
                  </span>
                )}
                {generatedFleet.length > 0 && (
                  <span className="rounded-full border border-border bg-surface-3 px-3 py-1">
                    {generatedFleet.length} {l("priorite(s) retenue(s)", "selected priorities", "selected priorities")}
                  </span>
                )}
              </div>

              {generatedFleet.length > 0 && (
                <div className="space-y-3">
                  <div className="industrial-label">{l("Machines retenues", "Selected priorities", "Selected priorities")}</div>
                  <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                    {generatedFleet.slice(0, 4).map((row) => {
                      const config = RISK_CONFIG[row.risk_level] || RISK_CONFIG.stable;
                      const checks = row.field_checks.slice(0, 2).join(" | ");
                      return (
                        <div key={row.machine_code} className={`rounded-2xl border p-4 ${config.panel}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-foreground">{row.machine_code}</div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {row.plain_reason || row.summary}
                              </div>
                            </div>
                            <span className={`rounded-full px-2.5 py-1 text-[0.65rem] font-semibold ${config.bg} ${config.color}`}>
                              {row.risk_label}
                            </span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2 text-[0.7rem]">
                            <span className="rounded-full bg-card px-2.5 py-1 text-foreground">{formatHi(row.hi)}</span>
                            <span className="rounded-full bg-card px-2.5 py-1 text-foreground">{formatRul(row.rul_days)}</span>
                            <span className="rounded-full bg-card px-2.5 py-1 text-foreground">
                              {getSourceLabel(row.data_source)}
                            </span>
                            <span className="rounded-full bg-card px-2.5 py-1 text-foreground">
                              {formatCurrency(row.projected_cost)}
                            </span>
                          </div>
                          <div className="mt-3 text-sm text-secondary-foreground">{row.recommended_action}</div>
                          {row.impact && <div className="mt-2 text-xs text-muted-foreground">{row.impact}</div>}
                          {checks && (
                            <div className="mt-2 text-[0.72rem] text-muted-foreground">
                              {l("Controle terrain", "Field checks", "Field checks")}: {checks}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="rounded-2xl border border-border bg-muted/20 p-4">
                <div className="industrial-label mb-2">{l("Resume", "Planner note", "Planner note")}</div>
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-secondary-foreground">{displayText}</div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-muted/10 p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {generatingLabel}
            </div>
          )}
        </div>
      )}

      {proposedTasks.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="section-title mb-1">{proposedTasksTitle}</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            {l(
              "Chaque validation cree immediatement une tache dans le calendrier de maintenance.",
              "Each approval immediately creates a task in the maintenance calendar.",
              "Each approval immediately creates a task in the maintenance calendar.",
            )}
          </p>
          <div className="space-y-3">
            {proposedTasks.map((task, idx) => (
              <div key={`${task.machine_code}-${idx}`} className="rounded-xl border border-border bg-muted/20 p-4">
                {editingIdx === idx ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-[0.65rem] font-medium text-muted-foreground">
                          {l("Titre", "Title", "Title")}
                        </label>
                        <input
                          className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                          value={task.titre}
                          onChange={(event) => {
                            const value = event.target.value;
                            setProposedTasks((previous) =>
                              previous.map((entry, index) => (index === idx ? { ...entry, titre: value } : entry)),
                            );
                          }}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[0.65rem] font-medium text-muted-foreground">
                          {l("Machine", "Machine", "Machine")}
                        </label>
                        <input
                          className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                          value={task.machine_code}
                          onChange={(event) => {
                            const value = event.target.value;
                            setProposedTasks((previous) =>
                              previous.map((entry, index) => (index === idx ? { ...entry, machine_code: value } : entry)),
                            );
                          }}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[0.65rem] font-medium text-muted-foreground">
                          {l("Type", "Type", "Type")}
                        </label>
                        <select
                          className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                          value={task.type}
                          onChange={(event) => {
                            const value = event.target.value as ProposedTask["type"];
                            setProposedTasks((previous) =>
                              previous.map((entry, index) => (index === idx ? { ...entry, type: value } : entry)),
                            );
                          }}
                        >
                          <option value="preventive">{l("Preventive", "Preventive", "Preventive")}</option>
                          <option value="corrective">{l("Corrective", "Corrective", "Corrective")}</option>
                          <option value="inspection">{l("Inspection", "Inspection", "Inspection")}</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-[0.65rem] font-medium text-muted-foreground">
                          {l("Priorite", "Priority", "Priority")}
                        </label>
                        <select
                          className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                          value={task.priorite}
                          onChange={(event) => {
                            const value = event.target.value as ProposedTask["priorite"];
                            setProposedTasks((previous) =>
                              previous.map((entry, index) => (index === idx ? { ...entry, priorite: value } : entry)),
                            );
                          }}
                        >
                          <option value="haute">{l("Haute", "High", "High")}</option>
                          <option value="moyenne">{l("Moyenne", "Medium", "Medium")}</option>
                          <option value="basse">{l("Basse", "Low", "Low")}</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-[0.65rem] font-medium text-muted-foreground">
                          {l("Date planifiee", "Scheduled date", "Scheduled date")}
                        </label>
                        <input
                          type="date"
                          className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                          value={task.date_planifiee}
                          onChange={(event) => {
                            const value = event.target.value;
                            setProposedTasks((previous) =>
                              previous.map((entry, index) => (index === idx ? { ...entry, date_planifiee: value } : entry)),
                            );
                          }}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[0.65rem] font-medium text-muted-foreground">
                          {l("Cout estime (TND)", "Estimated cost (TND)", "Estimated cost (TND)")}
                        </label>
                        <input
                          type="number"
                          className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                          value={task.cout_estime ?? ""}
                          onChange={(event) => {
                            const value = event.target.value ? parseFloat(event.target.value) : null;
                            setProposedTasks((previous) =>
                              previous.map((entry, index) => (index === idx ? { ...entry, cout_estime: value } : entry)),
                            );
                          }}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-[0.65rem] font-medium text-muted-foreground">
                          {l("Assigne a (optionnel)", "Assigned to (optional)", "Assigned to (optional)")}
                        </label>
                        <input
                          className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                          placeholder={l("Nom du technicien", "Technician name", "Technician name")}
                          value={task.technicien}
                          onChange={(event) => {
                            const value = event.target.value;
                            setProposedTasks((previous) =>
                              previous.map((entry, index) => (index === idx ? { ...entry, technicien: value } : entry)),
                            );
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-[0.65rem] font-medium text-muted-foreground">
                        {l("Description", "Description", "Description")}
                      </label>
                      <textarea
                        className="w-full resize-none rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                        rows={2}
                        value={task.description}
                        onChange={(event) => {
                          const value = event.target.value;
                          setProposedTasks((previous) =>
                            previous.map((entry, index) => (index === idx ? { ...entry, description: value } : entry)),
                          );
                        }}
                      />
                    </div>

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingIdx(null)}
                        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-all hover:bg-muted"
                      >
                        <X className="h-3 w-3" />
                        {l("Fermer", "Close", "Close")}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingIdx(null);
                          toast.success(l("Modifications enregistrees", "Changes saved", "Changes saved"));
                        }}
                        className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-all hover:bg-primary/90"
                      >
                        <Check className="h-3 w-3" />
                        {l("Enregistrer", "Save", "Save")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">{task.titre}</span>
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[0.6rem] font-medium text-primary">
                          {task.machine_code}
                        </span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[0.6rem] text-muted-foreground">
                          {task.type}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{task.description}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[0.65rem] text-muted-foreground">
                        {task.date_planifiee && (
                          <span>
                            {l("Date", "Date", "Date")}: {task.date_planifiee}
                          </span>
                        )}
                        {task.cout_estime != null && (
                          <span>
                            {l("Cout", "Cost", "Cost")}: {task.cout_estime} TND
                          </span>
                        )}
                        {task.technicien && (
                          <span>
                            {l("Technicien", "Technician", "Technician")}: {task.technicien}
                          </span>
                        )}
                        <span
                          className={`font-medium ${
                            task.priorite === "haute"
                              ? "text-destructive"
                              : task.priorite === "moyenne"
                                ? "text-warning"
                                : "text-success"
                          }`}
                        >
                          {task.priorite}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingIdx(idx)}
                        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-all hover:bg-muted"
                      >
                        <Pencil className="h-3 w-3" />
                        {l("Editer", "Edit", "Edit")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void approveTask(idx)}
                        disabled={approvingIdx === idx || !isAdmin}
                        className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
                      >
                        {approvingIdx === idx ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                        {l(
                          "Valider et creer dans le calendrier",
                          "Approve and create in calendar",
                          "Approve and create in calendar",
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
