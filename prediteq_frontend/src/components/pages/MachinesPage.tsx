import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { Machine, STATUS_CONFIG } from "@/data/machines";
import { MachineCard } from "@/components/industrial/MachineCard";
import { MachineModal } from "@/components/industrial/MachineModal";
import { useMachines } from "@/hooks/useMachines";
import { Download, Plus, Pencil, Trash2, X, Save } from "lucide-react";
import { toast } from "sonner";

const EMPTY_MACHINE: Machine = {
  id: "", name: "", loc: "", city: "", lat: 36.8, lon: 10.18,
  hi: 0, rul: null, rulci: null, status: "ok",
  vib: 0, curr: 0, temp: 0, anom: 0, cycles: 0,
  model: "", floors: 0, last: new Date().toISOString().slice(0, 10),
};

interface MachineFormProps {
  machine: Machine;
  isNew: boolean;
  existingIds: string[];
  onSave: (m: Machine) => void;
  onCancel: () => void;
}

function MachineForm({ machine, isNew, existingIds, onSave, onCancel }: MachineFormProps) {
  const { t } = useApp();
  const [form, setForm] = useState<Machine>({ ...machine });
  const [error, setError] = useState("");

  const set = (key: keyof Machine, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  const handleSave = () => {
    if (!form.id.trim()) { setError(t("mach.idRequired")); return; }
    if (isNew && existingIds.includes(form.id)) { setError(t("mach.idExists")); return; }
    onSave(form);
  };

  const inputCls = "w-full bg-surface-3 border border-border rounded-lg px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground";
  const labelCls = "text-xs font-semibold text-muted-foreground mb-1.5 block";

  return (
    <div className="bg-card border border-border rounded-lg p-6 animate-fade-in">
      <div className="flex items-center justify-between mb-5">
        <div className="section-title">{isNew ? t("mach.addMachine") : `${t("mach.edit")} — ${machine.id}`}</div>
        <button onClick={onCancel} className="w-8 h-8 rounded-lg bg-surface-3 border border-border flex items-center justify-center text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
      </div>

      {error && <div className="text-destructive text-sm font-semibold mb-4 bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-2.5">{error}</div>}

      {/* Machine Info */}
      <div className="section-title mb-3 text-xs">{t("mach.machineInfo")}</div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <div><label className={labelCls}>{t("mach.id")}</label><input className={inputCls} value={form.id} onChange={e => set("id", e.target.value)} disabled={!isNew} /></div>
        <div><label className={labelCls}>{t("mach.client")}</label><input className={inputCls} value={form.name} onChange={e => set("name", e.target.value)} /></div>
        <div><label className={labelCls}>{t("mach.city")}</label><input className={inputCls} value={form.city} onChange={e => set("city", e.target.value)} /></div>
        <div><label className={labelCls}>{t("mach.model")}</label><input className={inputCls} value={form.model} onChange={e => set("model", e.target.value)} /></div>
        <div><label className={labelCls}>{t("mach.floors")}</label><input className={inputCls} type="number" value={form.floors} onChange={e => set("floors", +e.target.value)} /></div>
        <div><label className={labelCls}>{t("mach.status")}</label>
          <select className={inputCls} value={form.status} onChange={e => set("status", e.target.value)}>
            {(["ok", "degraded", "critical", "maintenance"] as const).map(s => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
          </select>
        </div>
        <div><label className={labelCls}>{t("mach.location")}</label><input className={inputCls} value={form.loc} onChange={e => set("loc", e.target.value)} /></div>
      </div>

      {/* GPS */}
      <div className="section-title mb-3 text-xs">{t("mach.gpsLocation")}</div>
      <div className="grid grid-cols-2 gap-4 mb-2">
        <div><label className={labelCls}>{t("mach.latitude")}</label><input className={inputCls} type="number" step="0.001" value={form.lat} onChange={e => set("lat", +e.target.value)} /></div>
        <div><label className={labelCls}>{t("mach.longitude")}</label><input className={inputCls} type="number" step="0.001" value={form.lon} onChange={e => set("lon", +e.target.value)} /></div>
      </div>
      <p className="text-xs text-muted-foreground mb-6">{t("mach.gpsTipClean")}</p>

      <div className="flex justify-end gap-3">
        <button onClick={onCancel} className="px-5 py-2.5 rounded-xl text-sm font-semibold border border-border text-secondary-foreground hover:bg-surface-3">{t("mach.cancel")}</button>
        <button onClick={handleSave} className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-primary to-teal text-primary-foreground shadow-lg shadow-primary/20">
          <Save className="w-4 h-4" /> {t("mach.save")}
        </button>
      </div>
    </div>
  );
}

export function MachinesPage() {
  const { t } = useApp();
  const { currentUser } = useAuth();
  const { machines, addMachine: addMachineMut, updateMachine: updateMachineMut, deleteMachine: deleteMachineMut } = useMachines(currentUser?.machineId);
  const addMachine = (m: Partial<Machine>) => addMachineMut.mutate(m);
  const updateMachine = (id: string, m: Partial<Machine>) => updateMachineMut.mutate({ id, updates: m });
  const deleteMachine = (id: string) => deleteMachineMut.mutate(id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const selectedMachine = machines.find(m => m.id === selectedId) || null;

  if (showAdd) {
    return (
      <MachineForm
        machine={EMPTY_MACHINE}
        isNew
        existingIds={machines.map(m => m.id)}
        onSave={m => { addMachine({ ...m, last: new Date().toISOString().slice(0, 10), anom: 0, cycles: 0 }); setShowAdd(false); }}
        onCancel={() => setShowAdd(false)}
      />
    );
  }

  if (editingId) {
    const machine = machines.find(m => m.id === editingId);
    if (!machine) { setEditingId(null); return null; }
    return (
      <MachineForm
        machine={machine}
        isNew={false}
        existingIds={machines.map(m => m.id)}
        onSave={m => { updateMachine(editingId, m); setEditingId(null); }}
        onCancel={() => setEditingId(null)}
      />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="section-title">{t("mach.management")}</div>
        <div className="flex gap-2">
          <button onClick={() => {
            const escapeCsv = (v: unknown) => {
              const s = String(v ?? "");
              return s.includes(",") || s.includes('"') || s.includes("\n")
                ? `"${s.replace(/"/g, '""')}"` : s;
            };
            const header = "Code,Nom,Ville,Statut,HI,RUL,Mod\u00e8le,Derni\u00e8re MAJ\n";
            const csv = machines.map(m => [m.id, m.name, m.city, m.status, m.hi, m.rul ?? "\u2014", m.model, m.last].map(escapeCsv).join(",")).join("\n");
            const bom = "\uFEFF";
            const blob = new Blob([bom + header + csv], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `machines_${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success(t("mach.export") + " CSV");
          }} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-surface-3 border border-border text-foreground hover:bg-border-subtle transition-all">
            <Download className="w-3.5 h-3.5" /> {t("mach.export")}
          </button>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground">
            <Plus className="w-3.5 h-3.5" /> {t("mach.addMachine")}
          </button>
        </div>
      </div>

      {/* Machine list with CRUD */}
      <div className="space-y-4">
        {machines.map(m => {
          const mcfg = STATUS_CONFIG[m.status];
          return (
            <div key={m.id} className="bg-card border border-border rounded-lg overflow-hidden transition-all hover:shadow-lg">
              <div className="flex items-stretch">
                {/* Color accent */}
                <div className="w-1.5 flex-shrink-0" style={{ background: mcfg.hex }} />

                {/* Content */}
                <div className="flex-1 p-5 flex items-center gap-5 cursor-pointer" onClick={() => setSelectedId(m.id)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="font-mono text-sm font-bold text-foreground">{m.id}</span>
                      <span className={`status-pill ${mcfg.pillClass} text-[0.6rem]`}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: "currentColor" }} />
                        {mcfg.label}
                      </span>
                    </div>
                    <div className="text-sm text-secondary-foreground">{m.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">{m.city} · {m.loc}</div>
                  </div>

                  {/* HI Card */}
                  <div className="text-center px-4">
                    <div className="industrial-label">HI</div>
                    <div className="font-mono text-2xl font-bold mt-1" style={{ color: mcfg.hex }}>{Math.round(m.hi * 100)}%</div>
                    <div className="h-1 bg-muted rounded-full overflow-hidden mt-1.5 w-16">
                      <div className="hi-fill h-full" style={{ width: `${Math.round(m.hi * 100)}%` }} />
                    </div>
                  </div>

                  {/* RUL */}
                  <div className="text-center px-4">
                    <div className="industrial-label">RUL</div>
                    <div className="font-mono text-2xl font-bold mt-1 text-foreground">{m.rul ?? "—"}<span className="text-sm text-muted-foreground">j</span></div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col justify-center gap-2 pr-4">
                  <button onClick={() => setEditingId(m.id)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-all">
                    <Pencil className="w-3.5 h-3.5" /> {t("mach.edit")}
                  </button>
                  {confirmDeleteId === m.id ? (
                    <div className="flex gap-1.5">
                      <button onClick={() => { deleteMachine(m.id); setConfirmDeleteId(null); }} className="px-3 py-2 rounded-xl text-xs font-semibold bg-destructive text-destructive-foreground">{t("mach.yes")}</button>
                      <button onClick={() => setConfirmDeleteId(null)} className="px-3 py-2 rounded-xl text-xs font-semibold border border-border text-secondary-foreground">{t("mach.no")}</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDeleteId(m.id)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-destructive/10 text-destructive hover:bg-destructive/20 transition-all">
                      <Trash2 className="w-3.5 h-3.5" /> {t("mach.delete")}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {selectedMachine && <MachineModal machine={selectedMachine} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
