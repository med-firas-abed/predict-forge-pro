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
      return "Flux en direct";
    case "simulator_demo":
      return "Replay démo";
    case "persisted_reference":
      return "Référence persistée";
    default:
      return "Flux incomplet";
  }
}

export function PlannerPage() {
  const { t, lang } = useApp();
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

  const loadRisk = async () => {
    setLoadingRisk(true);
    try {
      const data = await apiFetch<RiskEntry[]>("/planner/status");
      setRiskData(data);
    } catch {
      setRiskData([]);
    } finally {
      setLoadingRisk(false);
    }
  };

  useEffect(() => {
    void loadRisk();
    const intervalId = window.setInterval(() => {
      void loadRisk();
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
          `${data.tasks.length} tâche(s) proposée(s) par le planificateur.`,
          `${data.tasks.length} task(s) proposed by the planner.`,
          `تم اقتراح ${data.tasks.length} مهمة بواسطة المخطط.`,
        ),
      );
    } catch {
      toast.error(l("Erreur lors de la génération du plan", "Failed to generate the plan", "فشل انشاء الخطة"));
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
          `Tâche "${task.titre}" créée dans la GMAO`,
          `Task "${task.titre}" created in the GMAO`,
          `تم انشاء المهمة "${task.titre}" في نظام GMAO`,
        ),
      );
      setProposedTasks((previous) => previous.filter((_, index) => index !== idx));
      void loadRisk();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : l("Erreur d'approbation", "Approval failed", "فشلت الموافقة"),
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
  const criticalCount = rankedRisk.filter((entry) => entry.risk_level === "critical").length;
  const priorityCount = rankedRisk.filter((entry) => entry.risk_level === "priority").length;
  const staleCount = rankedRisk.filter((entry) => entry.is_stale).length;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-1 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Brain className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-foreground">{t("planner.title")}</h2>
            <p className="text-xs text-muted-foreground">{t("planner.subtitle")}</p>
          </div>
          <span className="rounded-full border border-border bg-surface-3 px-3 py-1 text-[0.65rem] font-semibold text-muted-foreground">
            {loadingRisk ? l("Actualisation...", "Refreshing...", "تحديث...") : "Actualisation 5 s"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-premium">
          <div className="industrial-label">{l("À traiter vite", "Treat quickly", "للمعالجة السريعة")}</div>
          <div className="mt-2 text-3xl font-bold text-destructive">{criticalCount}</div>
          <div className="mt-1 text-xs text-muted-foreground">{l("Risque critique", "Critical risk", "خطر حرج")}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-premium">
          <div className="industrial-label">{l("À planifier", "To schedule", "للتخطيط")}</div>
          <div className="mt-2 text-3xl font-bold text-warning">{priorityCount}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {l("Fenêtre de maintenance proche", "Maintenance window approaching", "نافذة الصيانة قريبة")}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-premium">
          <div className="industrial-label">{l("À confirmer", "To confirm", "للتأكيد")}</div>
          <div className="mt-2 text-3xl font-bold text-primary">{staleCount}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {l("Flux à revérifier", "Stream to recheck", "يجب التحقق من التدفق")}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <button type="button" onClick={() => setShowRisk(!showRisk)} className="flex w-full items-center gap-2 text-left">
          <span className="section-title flex-1">{t("planner.fleetRisk")}</span>
          {showRisk ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {showRisk && (
          <div className="mt-4 space-y-2">
            {loadingRisk ? (
              <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("planner.loadingRisk")}
              </div>
            ) : rankedRisk.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">{t("planner.noData")}</p>
            ) : (
              rankedRisk.map((entry) => {
                const config = RISK_CONFIG[entry.risk_level] || RISK_CONFIG.stable;
                const Icon = config.icon;

                return (
                  <button
                    key={entry.machine_code}
                    type="button"
                    onClick={() => setFocusMachine(entry.machine_code === focusMachine ? null : entry.machine_code)}
                    className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                      focusMachine === entry.machine_code
                        ? "border-primary bg-primary/5"
                        : `border-border hover:border-muted-foreground/20 ${config.panel}`
                    }`}
                  >
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${config.bg}`}>
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
                      </div>
                      <div className="mt-1 text-[0.7rem] text-muted-foreground">
                        {entry.region} - {entry.open_tasks} {t("planner.openTasks")} - {formatUpdatedAt(entry.updated_at)}
                      </div>
                      <div className="mt-2 text-xs text-secondary-foreground">{entry.summary}</div>
                      <div className="mt-1 text-[0.7rem] text-muted-foreground">
                        {entry.recommended_action}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-bold ${config.color}`}>{entry.risk_score}</div>
                      <div className="text-[0.65rem] text-muted-foreground">{formatHi(entry.hi)}</div>
                      <div className="text-[0.65rem] text-muted-foreground">{formatRul(entry.rul_days)}</div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-3">
          <span className="section-title flex-1">
            {focusMachine
              ? l(`Plan pour ${focusMachine}`, `Plan for ${focusMachine}`, `الخطة الخاصة بـ ${focusMachine}`)
              : t("planner.fullPlan")}
          </span>
          <button
            type="button"
            onClick={generatePlan}
            disabled={generating}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {generating ? t("planner.generating") : t("planner.generate")}
          </button>
        </div>

        {displayText ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {planGeneratedAt && (
                <span className="rounded-full border border-border bg-surface-3 px-3 py-1">
                  {l("Généré le", "Generated on", "تم الانشاء")} {formatUpdatedAt(planGeneratedAt)}
                </span>
              )}
              {focusMachine && (
                <span className="rounded-full border border-border bg-surface-3 px-3 py-1">
                  Focus {focusMachine}
                </span>
              )}
            </div>

            <div className="prose prose-sm max-w-none whitespace-pre-wrap rounded-xl bg-muted/30 p-4 text-sm leading-relaxed dark:prose-invert">
              {displayText}
            </div>

            {generatedFleet.length > 0 && (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {generatedFleet.slice(0, 4).map((row) => {
                  const config = RISK_CONFIG[row.risk_level] || RISK_CONFIG.stable;
                  return (
                    <div key={row.machine_code} className={`rounded-xl border p-4 ${config.panel}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-foreground">{row.machine_code}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{row.summary}</div>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-[0.65rem] font-semibold ${config.bg} ${config.color}`}>
                          {row.risk_label}
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-[0.7rem]">
                        <span className="rounded-full bg-card px-2.5 py-1 text-foreground">{formatHi(row.hi)}</span>
                        <span className="rounded-full bg-card px-2.5 py-1 text-foreground">{formatRul(row.rul_days)}</span>
                        <span className="rounded-full bg-card px-2.5 py-1 text-foreground">
                          {getSourceLabel(row.data_source)}
                        </span>
                        <span className="rounded-full bg-card px-2.5 py-1 text-foreground">
                          {row.projected_cost.toLocaleString("fr-FR")} TND
                        </span>
                      </div>
                      <div className="mt-3 text-xs text-secondary-foreground">{row.recommended_action}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : !generating ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("planner.clickGenerate")}</p>
        ) : null}
      </div>

      {proposedTasks.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="section-title mb-1">{t("planner.proposedTasks")}</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            {l(
              "Ces tâches restent en attente tant qu'elles ne sont pas validées. Après validation, elles sont envoyées au calendrier de maintenance.",
              "These tasks stay pending until approved. Once approved, they are sent to the maintenance calendar.",
              "تبقى هذه المهام معلقة حتى تتم الموافقة عليها. بعد الموافقة، يتم إرسالها إلى تقويم الصيانة.",
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
                          {l("Titre", "Title", "العنوان")}
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
                          {l("Machine", "Machine", "الآلة")}
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
                          {l("Type", "Type", "النوع")}
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
                          <option value="preventive">{l("Préventive", "Preventive", "وقائية")}</option>
                          <option value="corrective">{l("Corrective", "Corrective", "تصحيحية")}</option>
                          <option value="inspection">{l("Inspection", "Inspection", "فحص")}</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-[0.65rem] font-medium text-muted-foreground">
                          {l("Priorite", "Priority", "الاولوية")}
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
                          <option value="haute">{l("Haute", "High", "عالية")}</option>
                          <option value="moyenne">{l("Moyenne", "Medium", "متوسطة")}</option>
                          <option value="basse">{l("Basse", "Low", "منخفضة")}</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-[0.65rem] font-medium text-muted-foreground">
                          {l("Date planifiee", "Scheduled date", "التاريخ المخطط")}
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
                          {l("Coût estimé (TND)", "Estimated cost (TND)", "الكلفة التقديرية (TND)")}
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
                          {l("Assigne a (optionnel)", "Assigned to (optional)", "مسندة الى (اختياري)")}
                        </label>
                        <input
                          className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                          placeholder={l("Nom du technicien", "Technician name", "اسم الفني")}
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
                        {l("Description", "Description", "الوصف")}
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
                        {l("Fermer", "Close", "اغلاق")}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingIdx(null);
                          toast.success(l("Modifications enregistrees", "Changes saved", "تم حفظ التعديلات"));
                        }}
                        className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-all hover:bg-primary/90"
                      >
                        <Check className="h-3 w-3" />
                        {l("Enregistrer", "Save", "حفظ")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
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
                        {task.date_planifiee && <span>{l("Date", "Date", "التاريخ")}: {task.date_planifiee}</span>}
                        {task.cout_estime != null && <span>{l("Coût", "Cost", "الكلفة")}: {task.cout_estime} TND</span>}
                        {task.technicien && (
                          <span>{l("Technicien", "Technician", "الفني")}: {task.technicien}</span>
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
                        {l("Editer", "Edit", "تعديل")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void approveTask(idx)}
                        disabled={approvingIdx === idx || !isAdmin}
                        className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
                      >
                        {approvingIdx === idx ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                        {l("Valider et envoyer au calendrier", "Approve and send to calendar", "اعتماد وإرسال إلى التقويم")}
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
