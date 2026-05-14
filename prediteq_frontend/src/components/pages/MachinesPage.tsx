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
  getMachinePublicLabel,
} from "@/lib/machinePresentation";

const MACHINE_CODE_RE = /^[A-Z]{2,5}-[A-Z0-9]{1,5}$/;

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

function getMachineSourceMeta(machine: Machine) {
  switch (machine.dataSource ?? machine.decision?.dataSource ?? "no_data") {
    case "live_runtime":
      return {
        label: "Flux live",
        className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700",
      };
    case "simulator_demo":
      return {
        label: "Replay demo",
        className: "border-sky-500/20 bg-sky-500/10 text-sky-700",
      };
    case "persisted_reference":
      return {
        label: "Reference",
        className: "border-amber-500/20 bg-amber-500/10 text-amber-700",
      };
    default:
      return {
        label: "En attente",
        className: "border-border bg-surface-3 text-muted-foreground",
      };
  }
}

function getTelemetrySourceLabel(source?: string | null) {
  const normalized = (source ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("labview")) return "Bridge LabVIEW / boss PC";
  if (normalized.includes("boss_pc")) return "Bridge boss PC";
  if (normalized.includes("simulator")) return "Replay demo";
  if (normalized.includes("runtime")) return "Pipeline live";
  return source?.replace(/_/g, " ") ?? null;
}

function getFreshnessLabel(machine: Machine) {
  switch (machine.freshnessState ?? machine.decision?.freshnessState ?? null) {
    case "live":
      return "Lecture fraiche";
    case "retard_leger":
      return "Flux a confirmer";
    case "retard":
      return "Flux en retard";
    case "reference_recente":
      return "Reference recente";
    case "reference_figee":
      return "Reference figee";
    default:
      return null;
  }
}

interface MachineFormProps {
  machine: Machine;
  isNew: boolean;
  existingIds: string[];
  onSave: (machine: Machine) => Promise<void>;
  onCancel: () => void;
}

function MachineForm({ machine, isNew, existingIds, onSave, onCancel }: MachineFormProps) {
  const { t } = useApp();
  const [form, setForm] = useState<Machine>({ ...machine });
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const publicLabelPreview = getMachinePublicLabel(form);
  const normalizedExistingIds = useMemo(
    () => new Set(existingIds.map((entry) => entry.trim().toUpperCase())),
    [existingIds],
  );

  const setField = <K extends keyof Machine>(key: K, value: Machine[K]) => {
    if (error) {
      setError("");
    }
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const inputClassName =
    "w-full rounded-lg border border-border bg-surface-3 px-3.5 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30";
  const labelClassName = "mb-1.5 block text-xs font-semibold text-muted-foreground";

  const handleSave = async () => {
    const normalizedId = form.id.trim().toUpperCase();

    if (!normalizedId) {
      setError(t("mach.idRequired"));
      return;
    }
    if (!MACHINE_CODE_RE.test(normalizedId)) {
      setError("Le code doit suivre le format ASC-A1.");
      return;
    }
    if (isNew && normalizedExistingIds.has(normalizedId)) {
      setError(t("mach.idExists"));
      return;
    }

    setError("");
    setIsSaving(true);
    try {
      await onSave({
        ...form,
        id: normalizedId,
      });
    } catch {
      // The mutation hook already surfaces the backend error; keep the form open.
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-6 animate-fade-in">
      <div className="mb-5 flex items-center justify-between">
        <div className="section-title">
          {isNew ? "Ajouter une machine" : `Modifier ${getMachinePublicLabel(machine)}`}
        </div>
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
          <label className={labelClassName}>Code interne</label>
          <input
            className={inputClassName}
            value={form.id}
            onChange={(event) => setField("id", event.target.value)}
            disabled={!isNew}
          />
          <div className="mt-1 text-[0.68rem] leading-relaxed text-muted-foreground">
            Ce code doit correspondre au `machine_id` envoye par le bridge LabVIEW/PLC.
          </div>
        </div>
        <div>
          <label className={labelClassName}>Nom public</label>
          <input className={inputClassName} value={form.name} onChange={(event) => setField("name", event.target.value)} />
          <div className="mt-1 text-[0.68rem] leading-relaxed text-muted-foreground">
            Affichage dans l&apos;app : {publicLabelPreview}. Exemple conseille : `Machine 4`.
          </div>
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
          <label className={labelClassName}>Niveaux</label>
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
          disabled={isSaving}
          className="rounded-xl border border-border px-5 py-2.5 text-sm font-semibold text-secondary-foreground hover:bg-surface-3"
        >
          Annuler
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-primary to-teal px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20"
        >
          <Save className="h-4 w-4" />
          {isSaving ? "Enregistrement..." : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}

export function MachinesPage() {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === "admin";
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
      const publicLabel = getMachinePublicLabel(machine).toLowerCase();
      return (
        publicLabel.includes(normalizedQuery) ||
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

    const header = "Machine,Code interne,Nom,Ville,Statut,HI,Modèle,Emplacement,Dernière MAJ\n";
    const csv = filteredMachines
      .map((machine) =>
        [
          getMachinePublicLabel(machine),
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

  if (showAdd && isAdmin) {
    return (
      <MachineForm
        machine={EMPTY_MACHINE}
        isNew
        existingIds={machines.map((machine) => machine.id)}
        onSave={async (machine) => {
          await addMachineMut.mutateAsync({
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
        onSave={async (updatedMachine) => {
          await updateMachineMut.mutateAsync({ id: editingId, updates: updatedMachine });
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
          {isAdmin ? (
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
              Ajouter machine
            </button>
          ) : null}
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
          const sourceMeta = getMachineSourceMeta(machine);
          const telemetrySourceLabel = getTelemetrySourceLabel(machine.telemetrySource);
          const freshnessLabel = getFreshnessLabel(machine);
          return (
            <div key={machine.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-premium">
              <div className="flex items-stretch">
                <div className="w-1.5 flex-shrink-0" style={{ background: statusConfig.hex }} />
                <div className="flex flex-1 flex-wrap items-center gap-5 p-5">
                  <div className="min-w-[220px] flex-1">
                    <div className="mb-1 flex items-center gap-3">
                      <span className="text-sm font-bold text-foreground">{getMachinePublicLabel(machine)}</span>
                      <span className={`status-pill ${statusConfig.pillClass} text-[0.6rem]`}>{statusConfig.label}</span>
                    </div>
                    <div className="text-sm text-secondary-foreground">{machine.city || "Site industriel"}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {machine.loc || "Emplacement non renseigné"}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[0.66rem] font-semibold ${sourceMeta.className}`}
                      >
                        {sourceMeta.label}
                      </span>
                      {freshnessLabel ? (
                        <span className="rounded-full border border-border bg-surface-3 px-2.5 py-1 text-[0.66rem] font-semibold text-muted-foreground">
                          {freshnessLabel}
                        </span>
                      ) : null}
                      {telemetrySourceLabel ? (
                        <span className="rounded-full border border-border bg-surface-3 px-2.5 py-1 text-[0.66rem] font-semibold text-muted-foreground">
                          {telemetrySourceLabel}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="min-w-[120px] text-center">
                    <div className="industrial-label">Indice de santé (HI)</div>
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
                        singular: "niveau",
                        plural: "niveaux",
                        fallback: "Niveaux non renseignés",
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
                  {isAdmin ? (
                    <>
                      <button
                        onClick={() => setEditingId(machine.id)}
                        className="flex items-center gap-1.5 rounded-lg bg-surface-3 px-3 py-2 text-xs font-semibold text-foreground transition-all hover:bg-border-subtle"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Modifier
                      </button>
                      {confirmDeleteId === machine.id ? (
                        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-2">
                          <div className="mb-2 text-[0.68rem] font-semibold text-destructive">
                            Supprimer {getMachinePublicLabel(machine)} ?
                          </div>
                          <div className="flex gap-1.5">
                            <button
                              onClick={async () => {
                                try {
                                  await deleteMachineMut.mutateAsync(machine.id);
                                  if (selectedId === machine.id) {
                                    setSelectedId(null);
                                  }
                                  setConfirmDeleteId(null);
                                } catch {
                                  // The mutation hook already shows the failure toast.
                                }
                              }}
                              disabled={deleteMachineMut.isPending}
                              className="rounded-xl bg-destructive px-3 py-2 text-xs font-semibold text-destructive-foreground disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {deleteMachineMut.isPending ? "Suppression..." : "Oui"}
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              disabled={deleteMachineMut.isPending}
                              className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-secondary-foreground disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Non
                            </button>
                          </div>
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
                    </>
                  ) : (
                    <button
                      disabled
                      className="flex items-center gap-1.5 rounded-lg bg-surface-3 px-3 py-2 text-xs font-semibold text-muted-foreground"
                    >
                      Lecture seule
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
