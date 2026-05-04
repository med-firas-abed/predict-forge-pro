import type { Machine } from "@/data/machines";
import { apiFetch } from "@/lib/api";
import { shouldAllowSupabaseFallback } from "@/lib/appMode";
import { repairText } from "@/lib/repairText";
import { supabase } from "@/lib/supabase";

export interface Alerte {
  id: string;
  machineId: string;
  machineCode: string;
  titre: string;
  description: string;
  severite: "urgence" | "surveillance" | "info";
  acquitte: boolean;
  createdAt: string;
}

export interface CostRow {
  id: string;
  machineCode: string;
  mois: number;
  annee: number;
  mainOeuvre: number;
  pieces: number;
  total: number;
}

export interface HistoriqueHIPoint {
  id: string;
  machineId: string;
  hi: number;
  createdAt: string;
}

export type TacheStatut = "planifiee" | "en_cours" | "terminee";
export type TacheType = "preventive" | "corrective" | "inspection";

export interface GmaoTache {
  id: string;
  machineId: string;
  machineCode: string;
  titre: string;
  description: string;
  statut: TacheStatut;
  technicien: string;
  datePlanifiee: string | null;
  coutEstime: number | null;
  type: TacheType;
  createdAt: string;
}

export interface GmaoTacheCreateInput {
  machine_id: string;
  titre: string;
  description?: string;
  statut?: TacheStatut;
  technicien?: string;
  date_planifiee?: string;
  cout_estime?: number;
  type?: TacheType;
}

export interface GmaoTacheUpdateInput {
  id: string;
  technicien?: string;
  date_planifiee?: string;
  statut?: TacheStatut;
  type?: TacheType;
  cout_estime?: number | null;
  description?: string;
}

export interface AlerteRealtimeEvent {
  severite: Alerte["severite"];
  titre: string;
  description: string;
}

export interface EmailAlertLog {
  id: string;
  machineId: string;
  machineCode: string;
  machineName: string;
  recipientEmail: string;
  success: boolean;
  type: string;
  source: "scheduler" | "simulator" | string;
  severity: Alerte["severite"] | "info";
  subject: string;
  note: string;
  createdAt: string;
}

const REVERSE_STATUT: Record<string, string> = {
  ok: "operational",
  degraded: "degraded",
  critical: "critical",
  maintenance: "maintenance",
};

function warnApiFallback(scope: string, error: unknown) {
  console.warn(`[runtimeDataRepository] ${scope} API failed, falling back to Supabase`, error);
}

function shouldFallbackToSupabase() {
  return shouldAllowSupabaseFallback();
}

function mapAlerte(row: Record<string, unknown>): Alerte {
  const machine = row.machines as Record<string, unknown> | null;
  return {
    id: String(row.id ?? ""),
    machineId: String(row.machineId ?? row.machine_id ?? ""),
    machineCode: repairText(String(row.machineCode ?? (machine ? String(machine.code ?? "") : ""))),
    titre: repairText(String(row.titre ?? "")),
    description: repairText(String(row.description ?? "")),
    severite: (row.severite ?? "info") as Alerte["severite"],
    acquitte: Boolean(row.acquitte),
    createdAt: String(row.created_at ?? ""),
  };
}

function mapCost(row: Record<string, unknown>): CostRow {
  const machine = row.machines as Record<string, unknown> | null;
  return {
    id: String(row.id ?? ""),
    machineCode: repairText(String(row.machineCode ?? (machine ? String(machine.code ?? "") : ""))),
    mois: Number(row.mois ?? 1),
    annee: Number(row.annee ?? 2026),
    mainOeuvre: Number(row.mainOeuvre ?? row.main_oeuvre ?? 0),
    pieces: Number(row.pieces ?? 0),
    total: Number(row.total ?? 0),
  };
}

function mapHistoriqueHI(row: Record<string, unknown>): HistoriqueHIPoint {
  return {
    id: String(row.id ?? ""),
    machineId: String(row.machineId ?? row.machine_id ?? ""),
    hi: Number(row.hi ?? row.valeur_hi ?? 0),
    createdAt: String(row.createdAt ?? row.created_at ?? ""),
  };
}

function mapEmailAlertLog(row: Record<string, unknown>): EmailAlertLog {
  return {
    id: String(row.id ?? ""),
    machineId: String(row.machineId ?? row.machine_id ?? ""),
    machineCode: repairText(String(row.machineCode ?? row.machine_code ?? "")),
    machineName: repairText(String(row.machineName ?? row.machine_name ?? row.machineCode ?? row.machine_code ?? "")),
    recipientEmail: repairText(String(row.recipientEmail ?? row.recipient_email ?? "")),
    success: Boolean(row.success),
    type: String(row.type ?? "hi"),
    source: String(row.source ?? "scheduler"),
    severity: (row.severity ?? "info") as EmailAlertLog["severity"],
    subject: repairText(String(row.subject ?? "")),
    note: repairText(String(row.note ?? "")),
    createdAt: String(row.createdAt ?? row.created_at ?? ""),
  };
}

function mapTache(row: Record<string, unknown>): GmaoTache {
  const machine = row.machines as Record<string, unknown> | null;
  return {
    id: String(row.id ?? ""),
    machineId: String(row.machineId ?? row.machine_id ?? ""),
    machineCode: repairText(String(row.machineCode ?? (machine ? String(machine.code ?? "") : ""))),
    titre: repairText(String(row.titre ?? "")),
    description: repairText(String(row.description ?? "")),
    statut: (row.statut ?? "planifiee") as TacheStatut,
    technicien: repairText(String(row.technicien ?? "")),
    datePlanifiee:
      typeof row.datePlanifiee === "string"
        ? row.datePlanifiee
        : typeof row.date_planifiee === "string"
          ? row.date_planifiee
          : null,
    coutEstime:
      typeof row.coutEstime === "number"
        ? row.coutEstime
        : typeof row.cout_estime === "number"
          ? row.cout_estime
          : null,
    type: (row.type ?? "preventive") as TacheType,
    createdAt: String(row.createdAt ?? row.created_at ?? ""),
  };
}

export async function listAlertes(machineId?: string): Promise<Alerte[]> {
  const params = new URLSearchParams();
  if (machineId) params.set("machine_id", machineId);
  const path = params.size > 0 ? `/alerts?${params.toString()}` : "/alerts";
  try {
    const data = await apiFetch<Record<string, unknown>[]>(path);
    return (data ?? []).map(mapAlerte);
  } catch (error) {
    if (!shouldFallbackToSupabase()) throw error;
    warnApiFallback("listAlertes", error);

    let query = supabase
      .from("alertes")
      .select("*, machines(code)")
      .order("created_at", { ascending: false });
    if (machineId) {
      query = query.eq("machine_id", machineId);
    }
    const { data, error: fallbackError } = await query;
    if (fallbackError) throw fallbackError;
    return (data ?? []).map((row) => mapAlerte(row as Record<string, unknown>));
  }
}

export async function listAlertEmailHistory(machineId?: string): Promise<EmailAlertLog[]> {
  const params = new URLSearchParams();
  if (machineId) params.set("machine_id", machineId);
  const path = params.size > 0 ? `/alerts/email-history?${params.toString()}` : "/alerts/email-history";
  const data = await apiFetch<Record<string, unknown>[]>(path);
  return (data ?? []).map(mapEmailAlertLog);
}

export async function acknowledgeAlerte(id: string): Promise<void> {
  try {
    await apiFetch(`/alerts/${id}/acknowledge`, { method: "POST" });
  } catch (error) {
    if (!shouldFallbackToSupabase()) throw error;
    warnApiFallback("acknowledgeAlerte", error);
    const { error: fallbackError } = await supabase
      .from("alertes")
      .update({ acquitte: true })
      .eq("id", id);
    if (fallbackError) throw fallbackError;
  }
}

export function subscribeToAlertes(
  machineId: string | undefined,
  handlers: {
    onInsert?: (event: AlerteRealtimeEvent) => void;
    onChange?: () => void;
  },
): () => void {
  let channel: ReturnType<typeof supabase.channel> | null = null;

  try {
    const channelName = `alertes-changes-${machineId ?? "all"}`;
    const insertFilter = machineId
      ? { event: "INSERT" as const, schema: "public", table: "alertes", filter: `machine_id=eq.${machineId}` }
      : { event: "INSERT" as const, schema: "public", table: "alertes" };

    channel = supabase
      .channel(channelName)
      .on("postgres_changes", insertFilter, (payload) => {
        const row = payload.new as Record<string, unknown>;
        handlers.onInsert?.({
          severite: (row.severite ?? "info") as Alerte["severite"],
          titre: repairText(String(row.titre ?? "Nouvelle alerte")),
          description: repairText(String(row.description ?? "")),
        });
        handlers.onChange?.();
      })
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "alertes" },
        () => {
          handlers.onChange?.();
        },
      )
      .subscribe();
  } catch (error) {
    console.warn("[runtimeDataRepository] alertes realtime subscribe failed:", error);
  }

  return () => {
    if (channel) supabase.removeChannel(channel);
  };
}

export async function listCostRows(machineId?: string): Promise<CostRow[]> {
  try {
    const params = new URLSearchParams();
    if (machineId) params.set("machine_id", machineId);
    const path = params.size > 0 ? `/runtime-data/costs?${params.toString()}` : "/runtime-data/costs";
    const data = await apiFetch<Record<string, unknown>[]>(path);
    return (data ?? []).map(mapCost);
  } catch (error) {
    if (!shouldFallbackToSupabase()) throw error;
    warnApiFallback("listCostRows", error);

    let query = supabase
      .from("couts")
      .select("*, machines(code)")
      .order("annee", { ascending: true })
      .order("mois", { ascending: true });

    if (machineId) {
      query = query.eq("machine_id", machineId);
    }

    const { data, error: fallbackError } = await query;
    if (fallbackError) throw fallbackError;
    return (data ?? []).map((row) => mapCost(row as Record<string, unknown>));
  }
}

export async function listHistoriqueHIPoints(
  machineId: string,
  days = 90,
): Promise<HistoriqueHIPoint[]> {
  try {
    const params = new URLSearchParams({
      machine_id: machineId,
      days: String(days),
    });
    const data = await apiFetch<Record<string, unknown>[]>(
      `/runtime-data/hi-history?${params.toString()}`,
    );
    return (data ?? []).map(mapHistoriqueHI);
  } catch (error) {
    if (!shouldFallbackToSupabase()) throw error;
    warnApiFallback("listHistoriqueHIPoints", error);

    const since = new Date(Date.now() - days * 86_400_000);
    const { data, error: fallbackError } = await supabase
      .from("historique_hi")
      .select("*")
      .eq("machine_id", machineId)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: true });

    if (fallbackError) throw fallbackError;
    return (data ?? []).map((row) => mapHistoriqueHI(row as Record<string, unknown>));
  }
}

export async function listGmaoTaches(machineId?: string): Promise<GmaoTache[]> {
  try {
    const params = new URLSearchParams();
    if (machineId) params.set("machine_id", machineId);
    const path = params.size > 0 ? `/runtime-data/tasks?${params.toString()}` : "/runtime-data/tasks";
    const data = await apiFetch<Record<string, unknown>[]>(path);
    return (data ?? []).map(mapTache);
  } catch (error) {
    if (!shouldFallbackToSupabase()) throw error;
    warnApiFallback("listGmaoTaches", error);

    let query = supabase
      .from("gmao_taches")
      .select("*, machines(code)")
      .order("created_at", { ascending: false });

    if (machineId) {
      query = query.eq("machine_id", machineId);
    }

    const { data, error: fallbackError } = await query;
    if (fallbackError) throw fallbackError;
    return (data ?? []).map((row) => mapTache(row as Record<string, unknown>));
  }
}

export async function createGmaoTache(input: GmaoTacheCreateInput): Promise<void> {
  try {
    await apiFetch("/runtime-data/tasks", {
      method: "POST",
      body: JSON.stringify(input),
    });
  } catch (error) {
    if (!shouldFallbackToSupabase()) throw error;
    warnApiFallback("createGmaoTache", error);
    const { error: fallbackError } = await supabase.from("gmao_taches").insert(input);
    if (fallbackError) throw fallbackError;
  }
}

export async function updateGmaoTacheStatut(
  id: string,
  statut: TacheStatut,
): Promise<void> {
  try {
    await apiFetch(`/runtime-data/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ statut }),
    });
  } catch (error) {
    if (!shouldFallbackToSupabase()) throw error;
    warnApiFallback("updateGmaoTacheStatut", error);
    const { error: fallbackError } = await supabase
      .from("gmao_taches")
      .update({ statut })
      .eq("id", id);
    if (fallbackError) throw fallbackError;
  }
}

export async function updateGmaoTache(input: GmaoTacheUpdateInput): Promise<void> {
  const { id, ...fields } = input;
  try {
    await apiFetch(`/runtime-data/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(fields),
    });
  } catch (error) {
    if (!shouldFallbackToSupabase()) throw error;
    warnApiFallback("updateGmaoTache", error);
    const { error: fallbackError } = await supabase.from("gmao_taches").update(fields).eq("id", id);
    if (fallbackError) throw fallbackError;
  }
}

export async function deleteGmaoTache(id: string): Promise<void> {
  try {
    await apiFetch(`/runtime-data/tasks/${id}`, { method: "DELETE" });
  } catch (error) {
    if (!shouldFallbackToSupabase()) throw error;
    warnApiFallback("deleteGmaoTache", error);
    const { error: fallbackError } = await supabase.from("gmao_taches").delete().eq("id", id);
    if (fallbackError) throw fallbackError;
  }
}

export function subscribeToMachineChanges(onChange: () => void): () => void {
  let channel: ReturnType<typeof supabase.channel> | null = null;

  try {
    const channelName = `machines-changes-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "machines" }, () => {
        onChange();
      })
      .subscribe();
  } catch (error) {
    console.warn("[runtimeDataRepository] machines realtime subscribe failed:", error);
  }

  return () => {
    if (channel) supabase.removeChannel(channel);
  };
}

export async function createMachineRecord(machine: Partial<Machine>): Promise<void> {
  const payload = {
    code: machine.id,
    name: machine.name,
    city: machine.city,
    lat: machine.lat,
    lon: machine.lon,
    model: machine.model,
    floors: machine.floors,
    loc: machine.loc,
    status: machine.status,
    hi: machine.hi ?? null,
    rul: machine.rul ?? null,
  };

  try {
    await apiFetch("/machines", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  } catch (error) {
    if (!shouldFallbackToSupabase()) throw error;
    warnApiFallback("createMachineRecord", error);
    const { error: fallbackError } = await supabase.from("machines").insert({
      code: machine.id,
      nom: machine.name,
      region: machine.city,
      latitude: machine.lat,
      longitude: machine.lon,
      modele: machine.model,
      etages: machine.floors,
      emplacement: machine.loc,
      statut: REVERSE_STATUT[machine.status ?? "ok"] ?? "operational",
      hi_courant: machine.hi ?? null,
      rul_courant: machine.rul,
    });

    if (fallbackError) throw fallbackError;
  }
}

export async function updateMachineRecord(
  id: string,
  updates: Partial<Machine>,
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.city !== undefined) payload.city = updates.city;
  if (updates.lat !== undefined) payload.lat = updates.lat;
  if (updates.lon !== undefined) payload.lon = updates.lon;
  if (updates.model !== undefined) payload.model = updates.model;
  if (updates.floors !== undefined) payload.floors = updates.floors;
  if (updates.loc !== undefined) payload.loc = updates.loc;
  if (updates.hi !== undefined) payload.hi = updates.hi;
  if (updates.rul !== undefined) payload.rul = updates.rul;
  if (updates.status !== undefined) payload.status = updates.status;

  try {
    await apiFetch(`/machines/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  } catch (error) {
    if (!shouldFallbackToSupabase()) throw error;
    warnApiFallback("updateMachineRecord", error);
    const fallbackPayload: Record<string, unknown> = {};
    if (updates.name !== undefined) fallbackPayload.nom = updates.name;
    if (updates.city !== undefined) fallbackPayload.region = updates.city;
    if (updates.lat !== undefined) fallbackPayload.latitude = updates.lat;
    if (updates.lon !== undefined) fallbackPayload.longitude = updates.lon;
    if (updates.model !== undefined) fallbackPayload.modele = updates.model;
    if (updates.floors !== undefined) fallbackPayload.etages = updates.floors;
    if (updates.loc !== undefined) fallbackPayload.emplacement = updates.loc;
    if (updates.hi !== undefined) fallbackPayload.hi_courant = updates.hi;
    if (updates.rul !== undefined) fallbackPayload.rul_courant = updates.rul;
    if (updates.status !== undefined) {
      fallbackPayload.statut = REVERSE_STATUT[updates.status] ?? "operational";
    }

    const { error: fallbackError } = await supabase
      .from("machines")
      .update(fallbackPayload)
      .eq("code", id);
    if (fallbackError) throw fallbackError;
  }
}

export async function deleteMachineRecord(id: string): Promise<void> {
  try {
    await apiFetch(`/machines/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch (error) {
    if (!shouldFallbackToSupabase()) throw error;
    warnApiFallback("deleteMachineRecord", error);
    const { error: fallbackError } = await supabase.from("machines").delete().eq("code", id);
    if (fallbackError) throw fallbackError;
  }
}
