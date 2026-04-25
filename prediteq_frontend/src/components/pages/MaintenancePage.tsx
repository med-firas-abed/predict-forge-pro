import { useState } from "react";
import { Download, Plus, X, Save } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { useGmaoTaches, GmaoTache, TacheStatut, TacheType } from "@/hooks/useGmaoTaches";
import { useMachines } from "@/hooks/useMachines";
import { Lang } from "@/contexts/AppContext";
import { toast } from "sonner";

interface TaskCard {
  id: string;
  title: string;
  machine: string;
  severity: 'crit' | 'warn' | 'ok';
  severityLabel: string;
  cost: string;
  date: string;
  progress?: number;
  done?: boolean;
  statut: TacheStatut;
}

const SEV_BADGE = {
  crit: 'bg-destructive/10 text-destructive',
  warn: 'bg-warning/10 text-warning',
  ok: 'bg-success/10 text-success',
};

function tacheToCard(t: GmaoTache, tr: (key: string) => string): TaskCard {
  let severity: TaskCard['severity'] = 'ok';
  let severityLabel = '';
  if (t.statut === 'terminee') {
    severity = 'ok';
    severityLabel = tr('maint.done');
  } else if (t.type === 'corrective') {
    severity = 'crit';
    severityLabel = t.statut === 'en_cours' ? tr('maint.urgent') : tr('maint.critical');
  } else {
    severity = 'warn';
    severityLabel = t.statut === 'en_cours' ? tr('maint.ongoing') : tr('maint.normal');
  }

  return {
    id: t.id,
    title: t.titre,
    machine: t.machineCode,
    severity,
    severityLabel,
    cost: t.coutEstime != null ? `${t.coutEstime.toLocaleString()} TND` : '—',
    date: t.statut === 'en_cours' && t.technicien ? `Tech. ${t.technicien}` : (t.datePlanifiee ? new Date(t.datePlanifiee).toLocaleDateString('fr-FR') : '—'),
    progress: t.statut === 'en_cours' ? (t.progression ?? undefined) : undefined,
    done: t.statut === 'terminee',
    statut: t.statut,
  };
}

export function MaintenancePage() {
  const { t } = useApp();
  const { currentUser } = useAuth();
  const { taches, isLoading: loading, addTache } = useGmaoTaches(currentUser?.machineId);
  const { machines } = useMachines(currentUser?.machineId);
  const tasks = taches.map(tache => tacheToCard(tache, t));
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newMachineId, setNewMachineId] = useState("");
  const [newType, setNewType] = useState<TacheType>("preventive");
  const [newDate, setNewDate] = useState("");
  const [newTechnician, setNewTechnician] = useState("");
  const [newCost, setNewCost] = useState("");

  const exportCSV = () => {
    const header = "ID,Titre,Machine,Statut,Type,Technicien,Date,Coût estimé\n";
    const rows = taches.map(t => `${t.id},${t.titre},${t.machineCode},${t.statut},${t.type},${t.technicien || "—"},${t.datePlanifiee || "—"},${t.coutEstime ?? "—"}`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `maintenance_tasks_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t("mach.export") + " CSV");
  };

  const handleAddTask = () => {
    if (!newTitle.trim() || !newMachineId) return;
    addTache.mutate({
      machine_id: newMachineId,
      titre: newTitle,
      type: newType,
      date_planifiee: newDate || undefined,
      technicien: newTechnician || undefined,
      cout_estime: newCost ? +newCost : undefined,
    });
    setShowNewTask(false);
    setNewTitle(""); setNewType("preventive"); setNewDate(""); setNewTechnician(""); setNewCost("");
    toast.success(t("maint.newTask"));
  };

  const COLUMNS: { titleKey: string; dotColor: string; pulse?: boolean; tasks: TaskCard[] }[] = [
    {
      titleKey: "maint.planned",
      dotColor: "bg-primary",
      tasks: tasks.filter(t => t.statut === 'planifiee'),
    },
    {
      titleKey: "maint.inProgress",
      dotColor: "bg-warning",
      pulse: true,
      tasks: tasks.filter(t => t.statut === 'en_cours'),
    },
    {
      titleKey: "maint.completed",
      dotColor: "bg-success",
      tasks: tasks.filter(t => t.statut === 'terminee'),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="section-title">{t("maint.tasks")}</div>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-surface-3 border border-border text-foreground hover:bg-border-subtle transition-all">
            <Download className="w-3.5 h-3.5" /> {t("mach.export")}
          </button>
          <button onClick={() => { setNewMachineId(machines[0]?.uuid || machines[0]?.id || ""); setShowNewTask(true); }} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground">
            <Plus className="w-3.5 h-3.5" /> {t("maint.newTask")}
          </button>
        </div>
      </div>

      {/* New Task Modal */}
      {showNewTask && (
        <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center" onClick={() => setShowNewTask(false)}>
          <div className="bg-card border border-border rounded-2xl p-6 w-[480px] max-w-[95vw] shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div className="section-title">{t("maint.newTask")}</div>
              <button onClick={() => setShowNewTask(false)} className="w-8 h-8 rounded-lg bg-surface-3 border border-border flex items-center justify-center text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder={t("maint.newTask")} className="w-full bg-surface-3 border border-border rounded-lg px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
              <select value={newMachineId} onChange={e => setNewMachineId(e.target.value)} className="w-full bg-surface-3 border border-border rounded-lg px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30">
                {machines.map(m => <option key={m.id} value={m.uuid || m.id}>{m.id} — {m.name}</option>)}
              </select>
              <select value={newType} onChange={e => setNewType(e.target.value as TacheType)} className="w-full bg-surface-3 border border-border rounded-lg px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="preventive">{t("cal.preventive")}</option>
                <option value="corrective">{t("cal.corrective")}</option>
                <option value="inspection">{t("cal.inspection")}</option>
              </select>
              <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className="w-full bg-surface-3 border border-border rounded-lg px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
              <input value={newTechnician} onChange={e => setNewTechnician(e.target.value)} placeholder="Technicien" className="w-full bg-surface-3 border border-border rounded-lg px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
              <input type="number" value={newCost} onChange={e => setNewCost(e.target.value)} placeholder="Coût estimé (TND)" className="w-full bg-surface-3 border border-border rounded-lg px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
              <button onClick={handleAddTask} disabled={!newTitle.trim()} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-primary text-primary-foreground disabled:opacity-50">
                <Save className="w-4 h-4" /> {t("mach.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {COLUMNS.map(col => (
          <div key={col.titleKey} className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${col.dotColor} ${col.pulse ? 'animate-pulse' : ''}`} />
                <span className="text-sm font-semibold text-foreground">{t(col.titleKey)}</span>
              </div>
              <div className="w-6 h-6 rounded-full bg-surface-3 flex items-center justify-center text-[0.65rem] font-semibold text-secondary-foreground">
                {col.tasks.length}
              </div>
            </div>
            <div className="space-y-2.5">
              {col.tasks.map((task, i) => (
                <div
                  key={i}
                  className={`bg-surface-3 border border-border rounded-lg p-4 cursor-pointer transition-all hover:translate-x-0.5 hover:shadow-md border-l-2 ${
                    task.severity === 'crit' ? 'border-l-destructive' : task.severity === 'warn' ? 'border-l-warning' : 'border-l-success'
                  } ${task.done ? 'opacity-60' : ''}`}
                >
                  <div className="text-sm font-semibold text-foreground">{task.title}</div>
                  <div className="text-xs text-muted-foreground mt-1.5">{task.machine}</div>
                  <div className="mt-2.5">
                    <span className={`text-[0.65rem] font-semibold px-2.5 py-1 rounded-md ${SEV_BADGE[task.severity]}`}>
                      {task.severityLabel}
                    </span>
                  </div>
                  {task.progress !== undefined && (
                    <div className="mt-3">
                      <div className="flex justify-between text-[0.65rem] text-muted-foreground mb-1.5">
                        <span>{t("maint.progression")}</span>
                        <span>{task.progress}%</span>
                      </div>
                      <div className="progress-track">
                        <div className="progress-fill bg-warning" style={{ width: `${task.progress}%` }} />
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-xs text-warning font-semibold">{task.cost}</span>
                    <span className="text-[0.65rem] text-muted-foreground">{task.date}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
