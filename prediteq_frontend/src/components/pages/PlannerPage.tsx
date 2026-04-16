import { useState, useEffect } from "react";
import { Brain, Shield, AlertTriangle, CheckCircle, Loader2, Play, ThumbsUp, ChevronDown, ChevronUp, Pencil, X, Check, FileText } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { useMachines } from "@/hooks/useMachines";
import { apiFetch, apiStream } from "@/lib/api";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface RiskEntry {
  machine_code: string;
  nom: string;
  region: string;
  hi: number | null;
  rul_days: number | null;
  zone: string | null;
  risk_score: number;
  risk_level: string;
  open_tasks: number;
}

interface ProposedTask {
  machine_code: string;
  titre: string;
  type: string;
  priorite: string;
  date_planifiee: string;
  cout_estime: number | null;
  description: string;
  technicien: string;
}

function parseProposedTasks(markdown: string): ProposedTask[] {
  const tasks: ProposedTask[] = [];
  const regex = /```task\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(markdown)) !== null) {
    const block = match[1];
    const get = (key: string) => {
      const m = block.match(new RegExp(`${key}:\\s*(.+)`));
      return m ? m[1].trim() : "";
    };
    tasks.push({
      machine_code: get("machine"),
      titre: get("titre"),
      type: get("type") || "preventive",
      priorite: get("priorite") || "moyenne",
      date_planifiee: get("date_planifiee"),
      cout_estime: get("cout_estime") ? parseFloat(get("cout_estime")) : null,
      description: get("description"),
      technicien: "",
    });
  }
  return tasks;
}

const RISK_CONFIG: Record<string, { color: string; bg: string; icon: typeof Shield }> = {
  critique: { color: "text-destructive", bg: "bg-destructive/10", icon: AlertTriangle },
  surveillance: { color: "text-warning", bg: "bg-warning/10", icon: Shield },
  ok: { color: "text-success", bg: "bg-success/10", icon: CheckCircle },
};

export function PlannerPage() {
  const { t } = useApp();
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === "admin";
  const { machines } = useMachines(currentUser?.machineId);
  const navigate = useNavigate();
  const [riskData, setRiskData] = useState<RiskEntry[]>([]);
  const [loadingRisk, setLoadingRisk] = useState(false);
  const [planText, setPlanText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [proposedTasks, setProposedTasks] = useState<ProposedTask[]>([]);
  const [approvingIdx, setApprovingIdx] = useState<number | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [focusMachine, setFocusMachine] = useState<string | null>(null);
  const [showRisk, setShowRisk] = useState(true);

  // Load fleet risk on mount
  useEffect(() => {
    loadRisk();
  }, []);

  const loadRisk = async () => {
    setLoadingRisk(true);
    try {
      const data = await apiFetch<RiskEntry[]>("/planner/status");
      setRiskData(data);
    } catch {
      // endpoint may be loading
    } finally {
      setLoadingRisk(false);
    }
  };

  const generatePlan = async () => {
    setGenerating(true);
    setPlanText("");
    setProposedTasks([]);

    try {
      const stream = await apiStream("/planner/generate", {
        focus_machine: focusMachine,
      });
      if (!stream) throw new Error("No stream");

      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let text = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setPlanText(text);
      }

      // Extract proposed tasks from the markdown
      const tasks = parseProposedTasks(text);
      setProposedTasks(tasks);
      if (tasks.length > 0) {
        toast.success(`${tasks.length} tâche(s) proposée(s) par l'agent IA`);
      }
    } catch {
      toast.error("Erreur lors de la génération du plan");
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
      toast.success(`Tâche "${task.titre}" créée dans GMAO`);
      setProposedTasks((prev) => prev.filter((_, i) => i !== idx));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur d'approbation");
    } finally {
      setApprovingIdx(null);
    }
  };

  // Strip ```task blocks AND the "Tâches GMAO" heading from display text (shown as cards instead)
  const displayText = planText
    .replace(/```task\n[\s\S]*?```/g, "")
    .replace(/###\s*Tâches GMAO proposées[^\n]*/g, "")
    .trim();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Brain className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-foreground">{t("planner.title")}</h2>
            <p className="text-xs text-muted-foreground">{t("planner.subtitle")}</p>
          </div>
        </div>
      </div>

      {/* Fleet Risk Ranking */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <button
          onClick={() => setShowRisk(!showRisk)}
          className="flex items-center gap-2 w-full text-left"
        >
          <span className="section-title flex-1">{t("planner.fleetRisk")}</span>
          {showRisk ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>

        {showRisk && (
          <div className="mt-4 space-y-2">
            {loadingRisk ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-4 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("planner.loadingRisk")}
              </div>
            ) : riskData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                {t("planner.noData")}
              </p>
            ) : (
              riskData.map((r) => {
                const cfg = RISK_CONFIG[r.risk_level] || RISK_CONFIG.ok;
                const Icon = cfg.icon;
                return (
                  <div
                    key={r.machine_code}
                    onClick={() => setFocusMachine(r.machine_code === focusMachine ? null : r.machine_code)}
                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      focusMachine === r.machine_code
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-muted-foreground/20"
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg ${cfg.bg} flex items-center justify-center`}>
                      <Icon className={`w-4 h-4 ${cfg.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-foreground">
                        {r.machine_code} — {r.nom}
                      </div>
                      <div className="text-[0.65rem] text-muted-foreground">
                        {r.region} • {r.open_tasks} {t("planner.openTasks")}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-bold ${cfg.color}`}>
                        {r.hi != null ? `HI ${(r.hi * 100).toFixed(0)}%` : "—"}
                      </div>
                      <div className="text-[0.65rem] text-muted-foreground">
                        {r.rul_days != null ? `RUL ${r.rul_days.toFixed(0)}j` : "—"}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Generate Plan */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <span className="section-title flex-1">
            {focusMachine ? `Plan pour ${focusMachine}` : t("planner.fullPlan")}
          </span>
          <button
            onClick={generatePlan}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-all"
          >
            {generating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            {generating ? t("planner.generating") : t("planner.generate")}
          </button>
        </div>

        {displayText && (
          <div className="prose prose-sm dark:prose-invert max-w-none bg-muted/30 rounded-xl p-4 whitespace-pre-wrap text-sm leading-relaxed">
            {displayText}
          </div>
        )}

        {!displayText && !generating && (
          <p className="text-sm text-muted-foreground text-center py-8">
            {t("planner.clickGenerate")}
          </p>
        )}
      </div>

      {/* Proposed GMAO Tasks */}
      {proposedTasks.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <h3 className="section-title mb-4">{t("planner.proposedTasks")}</h3>
          <div className="space-y-3">
            {proposedTasks.map((task, idx) => (
              <div key={idx} className="p-4 rounded-xl border border-border bg-muted/20">
                {editingIdx === idx ? (
                  /* ── Inline Edit Mode ── */
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[0.65rem] font-medium text-muted-foreground mb-1 block">Titre</label>
                        <input
                          className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                          value={task.titre}
                          onChange={(e) => {
                            const v = e.target.value;
                            setProposedTasks((prev) => prev.map((t, i) => i === idx ? { ...t, titre: v } : t));
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-[0.65rem] font-medium text-muted-foreground mb-1 block">Machine</label>
                        <input
                          className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                          value={task.machine_code}
                          onChange={(e) => {
                            const v = e.target.value;
                            setProposedTasks((prev) => prev.map((t, i) => i === idx ? { ...t, machine_code: v } : t));
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-[0.65rem] font-medium text-muted-foreground mb-1 block">Type</label>
                        <select
                          className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                          value={task.type}
                          onChange={(e) => {
                            const v = e.target.value;
                            setProposedTasks((prev) => prev.map((t, i) => i === idx ? { ...t, type: v } : t));
                          }}
                        >
                          <option value="preventive">Préventive</option>
                          <option value="corrective">Corrective</option>
                          <option value="inspection">Inspection</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[0.65rem] font-medium text-muted-foreground mb-1 block">Priorité</label>
                        <select
                          className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                          value={task.priorite}
                          onChange={(e) => {
                            const v = e.target.value;
                            setProposedTasks((prev) => prev.map((t, i) => i === idx ? { ...t, priorite: v } : t));
                          }}
                        >
                          <option value="haute">Haute</option>
                          <option value="moyenne">Moyenne</option>
                          <option value="basse">Basse</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[0.65rem] font-medium text-muted-foreground mb-1 block">Date planifiée</label>
                        <input
                          type="date"
                          className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                          value={task.date_planifiee}
                          onChange={(e) => {
                            const v = e.target.value;
                            setProposedTasks((prev) => prev.map((t, i) => i === idx ? { ...t, date_planifiee: v } : t));
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-[0.65rem] font-medium text-muted-foreground mb-1 block">Coût estimé (TND)</label>
                        <input
                          type="number"
                          className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                          value={task.cout_estime ?? ""}
                          onChange={(e) => {
                            const v = e.target.value ? parseFloat(e.target.value) : null;
                            setProposedTasks((prev) => prev.map((t, i) => i === idx ? { ...t, cout_estime: v } : t));
                          }}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="text-[0.65rem] font-medium text-muted-foreground mb-1 block">Assigné à (optionnel)</label>
                        <input
                          className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                          placeholder="Nom du technicien"
                          value={task.technicien}
                          onChange={(e) => {
                            const v = e.target.value;
                            setProposedTasks((prev) => prev.map((t, i) => i === idx ? { ...t, technicien: v } : t));
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[0.65rem] font-medium text-muted-foreground mb-1 block">Description</label>
                      <textarea
                        className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm resize-none"
                        rows={2}
                        value={task.description}
                        onChange={(e) => {
                          const v = e.target.value;
                          setProposedTasks((prev) => prev.map((t, i) => i === idx ? { ...t, description: v } : t));
                        }}
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setEditingIdx(null)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-all"
                      >
                        <X className="w-3 h-3" /> Fermer
                      </button>
                      <button
                        onClick={() => { setEditingIdx(null); toast.success("Modifications enregistrées"); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-all"
                      >
                        <Check className="w-3 h-3" /> OK
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── Display Mode ── */
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-foreground">{task.titre}</span>
                        <span className="text-[0.6rem] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                          {task.machine_code}
                        </span>
                        <span className="text-[0.6rem] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                          {task.type}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{task.description}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-[0.65rem] text-muted-foreground">
                        {task.date_planifiee && <span>📅 {task.date_planifiee}</span>}
                        {task.cout_estime != null && <span>💰 {task.cout_estime} TND</span>}
                        {task.technicien && <span>👷 {task.technicien}</span>}
                        <span className={`font-medium ${
                          task.priorite === "haute" ? "text-destructive" :
                          task.priorite === "moyenne" ? "text-warning" : "text-success"
                        }`}>
                          {task.priorite}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => setEditingIdx(idx)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-xs font-medium hover:bg-muted transition-all"
                      >
                        <Pencil className="w-3 h-3" /> Modifier
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => approveTask(idx)}
                          disabled={approvingIdx === idx}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-success/10 text-success text-xs font-medium hover:bg-success/20 disabled:opacity-50 transition-all"
                        >
                          {approvingIdx === idx ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <ThumbsUp className="w-3 h-3" />
                          )}
                          {t("planner.approve")}
                        </button>
                      )}
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
