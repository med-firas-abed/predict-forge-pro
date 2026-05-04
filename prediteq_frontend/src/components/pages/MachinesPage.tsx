import { useMemo, useState } from "react";
import { Download, Plus, Pencil, Trash2, Search, X, Save, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { Machine, STATUS_CONFIG } from "@/data/machines";
import { MachineModal } from "@/components/industrial/MachineModal";
import { useMachines } from "@/hooks/useMachines";
import {
  formatMachineFloorLabel,
  formatMachineModelValue,
} from "@/lib/machinePresentation";

const EMPTY_MACHINE: Machine = {
  id: "",
  name: "",
  loc: "",
  city: "",
  lat: 36.8,
  lon: 10.18,
  hi: 0,
  rul: null,
  rulci: null,
  status: "ok",
  vib: 0,
  curr: 0,
  temp: 0,
  anom: 0,
  cycles: 0,
  model: "",
  floors: 0,
  last: new Date().toISOString().slice(0, 10),
};

interface MachineFormProps {
  machine: Machine;
  isNew: boolean;
  existingIds: string[];
  onSave: (machine: Machine) => void;
  onCancel: () => void;
}

function MachineForm({ machine, isNew, existingIds, onSave, onCancel }: MachineFormProps) {
  const { t } = useApp();
  const [form, setForm] = useState<Machine>({ ...machine });
  const [error, setError] = useState("");

  const setField = <K extends keyof Machine>(key: K, value: Machine[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const inputClassName =
    "w-full rounded-lg border border-border bg-surface-3 px-3.5 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30";
  const labelClassName = "mb-1.5 block text-xs font-semibold text-muted-foreground";

  const handleSave = () => {
    if (!form.id.trim()) {
      setError(t("mach.idRequired"));
      return;
    }
    if (isNew && existingIds.includes(form.id)) {
      setError(t("mach.idExists"));
      return;
    }
    onSave(form);
  };

  return (
    <div className="rounded-lg border border-border bg-card p-6 animate-fade-in">
      <div className="mb-5 flex items-center justify-between">
        <div className="section-title">{isNew ? "Ajouter une machine" : `Modifier ${machine.id}`}</div>
        <button
          onClick={onCancel}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface-3 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-2.5 text-sm font-semibold text-destructive">
          {error}
        </div>
      )}

      <div className="mb-3 section-title text-xs">Informations machine</div>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <div>
          <label className={labelClassName}>ID machine</label>
          <input
            className={inputClassName}
            value={form.id}
            onChange={(event) => setField("id", event.target.value)}
            disabled={!isNew}
          />
        </div>
        <div>
          <label className={labelClassName}>Nom / client</label>
          <input className={inputClassName} value={form.name} onChange={(event) => setField("name", event.target.value)} />
        </div>
        <div>
          <label className={labelClassName}>Ville</label>
          <input className={inputClassName} value={form.city} onChange={(event) => setField("city", event.target.value)} />
        </div>
        <div>
          <label className={labelClassName}>Modele</label>
          <input className={inputClassName} value={form.model} onChange={(event) => setField("model", event.target.value)} />
        </div>
        <div>
          <label className={labelClassName}>Etages</label>
          <input
            className={inputClassName}
            type="number"
            value={form.floors}
            onChange={(event) => setField("floors", Number(event.target.value))}
          />
        </div>
        <div>
          <label className={labelClassName}>Statut</label>
          <select
            className={inputClassName}
            value={form.status}
            onChange={(event) => setField("status", event.target.value as Machine["status"])}
          >
            {(["ok", "degraded", "critical", "maintenance"] as const).map((status) => (
              <option key={status} value={status}>
                {STATUS_CONFIG[status].label}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2 lg:col-span-3">
          <label className={labelClassName}>Emplacement</label>
          <input className={inputClassName} value={form.loc} onChange={(event) => setField("loc", event.target.value)} />
        </div>
      </div>

      <div className="mb-3 section-title text-xs">Localisation GPS</div>
      <div className="mb-6 grid grid-cols-2 gap-4">
        <div>
          <label className={labelClassName}>Latitude</label>
          <input
            className={inputClassName}
            type="number"
            step="0.001"
            value={form.lat}
            onChange={(event) => setField("lat", Number(event.target.value))}
          />
        </div>
        <div>
          <label className={labelClassName}>Longitude</label>
          <input
            className={inputClassName}
            type="number"
            step="0.001"
            value={form.lon}
            onChange={(event) => setField("lon", Number(event.target.value))}
          />
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button
          onClick={onCancel}
          className="rounded-xl border border-border px-5 py-2.5 text-sm font-semibold text-secondary-foreground hover:bg-surface-3"
        >
          Annuler
        </button>
        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-primary to-teal px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20"
        >
          <Save className="h-4 w-4" />
          Enregistrer
        </button>
      </div>
    </div>
  );
}

export function MachinesPage() {
  const { currentUser } = useAuth();
  const { machines, addMachine: addMachineMut, updateMachine: updateMachineMut, deleteMachine: deleteMachineMut } =
    useMachines(currentUser?.machineId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<Machine["status"] | "all">("all");

  const selectedMachine = machines.find((machine) => machine.id === selectedId) || null;

  const filteredMachines = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return machines.filter((machine) => {
      if (statusFilter !== "all" && machine.status !== statusFilter) return false;
      if (!normalizedQuery) return true;
      return (
        machine.id.toLowerCase().includes(normalizedQuery) ||
        machine.name.toLowerCase().includes(normalizedQuery) ||
        machine.city.toLowerCase().includes(normalizedQuery) ||
        machine.loc.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [machines, query, statusFilter]);

  const exportCsv = () => {
    const escapeCsv = (value: unknown) => {
      const rendered = String(value ?? "");
      return rendered.includes(",") || rendered.includes('"') || rendered.includes("\n")
        ? `"${rendered.replace(/"/g, '""')}"`
        : rendered;
    };

    const header = "Code,Nom,Ville,Statut,HI,Modèle,Emplacement,Dernière MAJ\n";
    const csv = filteredMachines
      .map((machine) =>
        [
          machine.id,
          machine.name,
          machine.city,
          machine.status,
          machine.hi,
          machine.model,
          machine.loc,
          machine.last,
        ]
          .map(escapeCsv)
          .join(","),
      )
      .join("\n");

    const blob = new Blob(["\uFEFF" + header + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `machines_${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Export CSV pret");
  };

  if (showAdd) {
    return (
      <MachineForm
        machine={EMPTY_MACHINE}
        isNew
        existingIds={machines.map((machine) => machine.id)}
        onSave={(machine) => {
          addMachineMut.mutate({
            ...machine,
            last: new Date().toISOString().slice(0, 10),
            anom: 0,
            cycles: 0,
          });
          setShowAdd(false);
        }}
        onCancel={() => setShowAdd(false)}
      />
    );
  }

  if (editingId) {
    const machine = machines.find((entry) => entry.id === editingId);
    if (!machine) {
      setEditingId(null);
      return null;
    }

    return (
      <MachineForm
        machine={machine}
        isNew={false}
        existingIds={machines.map((entry) => entry.id)}
        onSave={(updatedMachine) => {
          updateMachineMut.mutate({ id: editingId, updates: updatedMachine });
          setEditingId(null);
        }}
        onCancel={() => setEditingId(null)}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="section-title">Gestion des machines</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Métadonnées, statut et accès aux analyses détaillées.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportCsv}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-3 px-4 py-2 text-xs font-semibold text-foreground transition-all hover:bg-border-subtle"
          >
            <Download className="h-3.5 w-3.5" />
            Exporter
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Ajouter machine
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border bg-card p-5 shadow-premium md:grid-cols-[1.5fr_220px]">
        <label className="flex items-center gap-2 rounded-xl border border-border bg-surface-3 px-3.5 py-2.5">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher par code, nom, ville ou emplacement"
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as Machine["status"] | "all")}
          className="rounded-xl border border-border bg-surface-3 px-3.5 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="all">Tous les statuts</option>
          <option value="ok">Opérationnel</option>
          <option value="degraded">Surveillance</option>
          <option value="critical">Critique</option>
          <option value="maintenance">Maintenance</option>
        </select>
      </div>

      <div className="space-y-4">
        {filteredMachines.map((machine) => {
          const statusConfig = STATUS_CONFIG[machine.status];
          const hiPct = typeof machine.hi === "number" ? Math.round(machine.hi * 100) : null;
          return (
            <div key={machine.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-premium">
              <div className="flex items-stretch">
                <div className="w-1.5 flex-shrink-0" style={{ background: statusConfig.hex }} />
                <div className="flex flex-1 flex-wrap items-center gap-5 p-5">
                  <div className="min-w-[220px] flex-1">
                    <div className="mb-1 flex items-center gap-3">
                      <span className="font-mono text-sm font-bold text-foreground">{machine.id}</span>
                      <span className={`status-pill ${statusConfig.pillClass} text-[0.6rem]`}>{statusConfig.label}</span>
                    </div>
                    <div className="text-sm text-secondary-foreground">{machine.name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {machine.city} · {machine.loc}
                    </div>
                  </div>

                  <div className="min-w-[120px] text-center">
                    <div className="industrial-label">Health Index</div>
                    <div className="mt-1 font-mono text-2xl font-bold" style={{ color: statusConfig.hex }}>
                      {hiPct != null ? `${hiPct}%` : "—"}
                    </div>
                    <div className="mt-1.5 h-1 rounded-full bg-muted">
                      <div className="hi-fill h-full" style={{ width: `${hiPct ?? 0}%` }} />
                    </div>
                  </div>

                  <div className="min-w-[180px]">
                    <div className="industrial-label">Métadonnées</div>
                    <div className="mt-1 text-sm font-semibold text-foreground">
                      {formatMachineModelValue(machine.model, "-")}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {formatMachineFloorLabel(machine.floors, {
                        singular: "étage",
                        plural: "étages",
                        fallback: "Étages non renseignés",
                      })} · Mise à jour {machine.last}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col justify-center gap-2 px-4 py-5">
                  <button
                    onClick={() => setSelectedId(machine.id)}
                    className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-all hover:bg-primary/20"
                  >
                    <BarChart3 className="h-3.5 w-3.5" />
                    Voir analyse
                  </button>
                  <button
                    onClick={() => setEditingId(machine.id)}
                    className="flex items-center gap-1.5 rounded-lg bg-surface-3 px-3 py-2 text-xs font-semibold text-foreground transition-all hover:bg-border-subtle"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Modifier
                  </button>
                  {confirmDeleteId === machine.id ? (
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => {
                          deleteMachineMut.mutate(machine.id);
                          setConfirmDeleteId(null);
                        }}
                        className="rounded-xl bg-destructive px-3 py-2 text-xs font-semibold text-destructive-foreground"
                      >
                        Oui
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-secondary-foreground"
                      >
                        Non
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(machine.id)}
                      className="flex items-center gap-1.5 rounded-lg bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive transition-all hover:bg-destructive/20"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Supprimer
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {filteredMachines.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-8 text-center text-sm text-muted-foreground">
            Aucune machine ne correspond aux filtres.
          </div>
        )}
      </div>

      {selectedMachine && <MachineModal machine={selectedMachine} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
