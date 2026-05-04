import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Machine, MachineDecision } from "@/data/machines";
import { apiFetch } from "@/lib/api";
import {
  normalizeMachineFloors,
  normalizeMachineModel,
} from "@/lib/machinePresentation";
import { repairText, repairTextDeep } from "@/lib/repairText";
import {
  createMachineRecord,
  deleteMachineRecord,
  subscribeToMachineChanges,
  updateMachineRecord,
} from "@/lib/runtimeDataRepository";

const STATUT_MAP: Record<string, Machine["status"]> = {
  operational: "ok",
  degraded: "degraded",
  critical: "critical",
  maintenance: "maintenance",
};

const KW_TO_AMPS = 1000 / (Math.sqrt(3) * 400 * 0.8);
const MACHINE_CACHE_KEY = "prediteq-machine-cache-v2";

function formatLastUpdate(value?: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function safeStorageGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures so the UI can still render.
  }
}

function statusFromRuntime(
  zone: unknown,
  hi: number | null,
  persistedStatut: string,
): Machine["status"] {
  if (zone === "Excellent") return "ok";
  if (zone === "Good" || zone === "Degraded") return "degraded";
  if (zone === "Critical") return "critical";

  if (typeof hi === "number") {
    if (hi >= 0.8) return "ok";
    if (hi >= 0.3) return "degraded";
    return "critical";
  }

  return STATUT_MAP[persistedStatut] || "ok";
}

function mapDecision(raw: Record<string, unknown> | null | undefined): MachineDecision | null {
  if (!raw) return null;

  const taskTemplateRaw = (raw.task_template as Record<string, unknown> | undefined) ?? {};
  const budgetRaw = (raw.budget_model as Record<string, unknown> | undefined) ?? {};

  return {
    status: (raw.status as Machine["status"]) ?? "ok",
    zone: repairText((raw.zone as string | null) ?? null),
    hi: numberOrNull(raw.hi),
    rulDays: numberOrNull(raw.rul_days),
    predictionMode: (raw.prediction_mode as MachineDecision["predictionMode"]) ?? null,
    confidence: (raw.confidence as MachineDecision["confidence"]) ?? null,
    maintenanceWindow: repairText((raw.maintenance_window as string | null) ?? null),
    stopRecommended: Boolean(raw.stop_recommended),
    alerts24h: Number(raw.alerts_24h ?? 0),
    openTasks: Number(raw.open_tasks ?? 0),
    stressValue: numberOrNull(raw.stress_value),
    stressBand: (raw.stress_band as MachineDecision["stressBand"]) ?? null,
    stressLabel: repairText((raw.stress_label as string) || "Indisponible"),
    dominantAxis: repairText((raw.dominant_axis as string | null) ?? null),
    topDriver: repairText((raw.top_driver as string | null) ?? null),
    urgencyScore: Number(raw.urgency_score ?? 0),
    urgencyBand: (raw.urgency_band as MachineDecision["urgencyBand"]) ?? "stable",
    urgencyLabel: repairText((raw.urgency_label as string) || "Stable"),
    urgencyHex: (raw.urgency_hex as string) || "#10b981",
    summary: repairText((raw.summary as string) || ""),
    plainReason: repairText((raw.plain_reason as string) || ""),
    impact: repairText((raw.impact as string) || ""),
    recommendedAction: repairText((raw.recommended_action as string) || ""),
    trustNote: repairText((raw.trust_note as string) || ""),
    technicalStory: repairText((raw.technical_story as string) || ""),
    evidence: Array.isArray(raw.evidence)
      ? raw.evidence
          .filter((item): item is string => typeof item === "string")
          .map((item) => repairText(item))
      : [],
    fieldChecks: Array.isArray(raw.field_checks)
      ? raw.field_checks
          .filter((item): item is string => typeof item === "string")
          .map((item) => repairText(item))
      : [],
    taskTemplate: {
      type: (taskTemplateRaw.type as MachineDecision["taskTemplate"]["type"]) ?? "inspection",
      leadDays: Number(taskTemplateRaw.lead_days ?? 0),
      title: repairText((taskTemplateRaw.title as string) || ""),
      summary: repairText((taskTemplateRaw.summary as string) || ""),
    },
    budgetModel: {
      multiplier: Number(budgetRaw.multiplier ?? 1),
      delayMultiplier: Number(budgetRaw.delay_multiplier ?? 1.05),
    },
    diagnosisCount: Number(raw.diagnosis_count ?? 0),
    diagnoses: Array.isArray(raw.diagnoses)
      ? raw.diagnoses.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
      : [],
    dataSource: (raw.data_source as MachineDecision["dataSource"]) ?? "no_data",
    updatedAt: (raw.updated_at as string | null) ?? null,
    ageSeconds: numberOrNull(raw.age_seconds),
    isStale: Boolean(raw.is_stale),
    freshnessState: repairText((raw.freshness_state as string) || "indisponible"),
  };
}

function supabaseRowToMachine(row: Record<string, unknown>): Machine {
  const code = (row.code ?? "") as string;
  const statut = (row.statut ?? "operational") as string;
  const sensors = row.last_sensors as Record<string, unknown> | null | undefined;
  const decision = mapDecision(row.decision as Record<string, unknown> | null | undefined);
  const rulV2 = row.rul_v2 as Record<string, unknown> | null | undefined;
  const prediction = rulV2?.prediction as Record<string, unknown> | null | undefined;
  const referencePrediction =
    rulV2?.reference_prediction as Record<string, unknown> | null | undefined;
  const l10 = rulV2?.l10 as Record<string, unknown> | null | undefined;
  const liveZone = decision?.zone ?? row.zone_live ?? rulV2?.zone;

  const hiValue =
    decision?.hi ??
    (typeof rulV2?.hi_current === "number"
      ? rulV2.hi_current
      : typeof row.hi_courant === "number"
        ? (row.hi_courant as number)
        : null);

  const powerKw = numberOrNull(sensors?.power_kw);
  const measuredCurrentAmps = numberOrNull(sensors?.current_a);
  const currentAmps =
    measuredCurrentAmps ??
    (typeof powerKw === "number" ? Math.round(powerKw * KW_TO_AMPS * 100) / 100 : null);
  const currentSource: Machine["currSource"] =
    measuredCurrentAmps != null
      ? "measured"
      : typeof powerKw === "number"
        ? "estimated_from_power"
        : "missing";
  const machineModel = normalizeMachineModel(row.modele);
  const floorCount = normalizeMachineFloors(row.etages);

  const rulMode = decision?.predictionMode ?? ((rulV2?.mode as Machine["rulMode"]) || undefined);
  const rulIntervalLow = typeof prediction?.rul_days_display_low === "number"
    ? prediction.rul_days_display_low
    : null;
  const rulIntervalHigh = typeof prediction?.rul_days_display_high === "number"
    ? prediction.rul_days_display_high
    : null;
  const rulValue =
    decision?.rulDays ??
    (typeof prediction?.rul_days === "number"
      ? prediction.rul_days
      : ((row.rul_courant ?? null) as number | null));
  const rulci =
    typeof rulValue === "number" &&
    typeof rulIntervalLow === "number" &&
    typeof rulIntervalHigh === "number"
      ? Math.round(Math.max(rulValue - rulIntervalLow, rulIntervalHigh - rulValue))
      : null;
  const updatedAt = decision?.updatedAt ?? (row.derniere_maj as string | undefined) ?? null;

  return {
    id: repairText(code),
    uuid: (row.id ?? "") as string,
    name: repairText((row.nom ?? code) as string),
    loc: repairText(
      ((row.emplacement as string | undefined) ?? `Region ${(row.region ?? "") as string}`),
    ),
    city: repairText((row.region ?? "") as string),
    lat: Number(row.latitude ?? 0),
    lon: Number(row.longitude ?? 0),
    hi: hiValue,
    rul: rulValue,
    rulci,
    rulMode,
    rulIntervalLow,
    rulIntervalHigh,
    rulIntervalLabel: repairText((prediction?.display_interval_label as string) || null),
    l10Years:
      typeof l10?.years_adjusted === "number"
        ? l10.years_adjusted
        : typeof l10?.l10_nominal_years === "number"
          ? l10.l10_nominal_years
          : null,
    rulReferenceDays:
      typeof referencePrediction?.rul_days === "number" ? referencePrediction.rul_days : null,
    rulReferenceKind:
      (referencePrediction?.kind as Machine["rulReferenceKind"]) ?? null,
    stopRecommended: Boolean(decision?.stopRecommended ?? prediction?.stop_recommended),
    status: decision?.status ?? statusFromRuntime(liveZone, hiValue, statut),
    vib: numberOrNull(sensors?.rms_mms) ?? numberOrNull(sensors?.vibration_rms),
    curr: currentAmps,
    currSource: currentSource,
    temp: numberOrNull(sensors?.temp_c),
    anom: decision?.alerts24h ?? Number(row.anom_count ?? 0),
    cycles: typeof row.cycles_today === "number" ? row.cycles_today : null,
    model: machineModel,
    floors: floorCount,
    last: formatLastUpdate(updatedAt),
    decision,
    demoScenario: (row.demo_scenario as Machine["demoScenario"]) ?? null,
  };
}

function filterMachines(machines: Machine[], machineId?: string): Machine[] {
  if (!machineId) return machines;
  return machines.filter((machine) => machine.uuid === machineId || machine.id === machineId);
}

function readCachedMachines(machineId?: string): Machine[] {
  const raw = safeStorageGet(MACHINE_CACHE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return filterMachines(repairTextDeep(parsed as Machine[]), machineId);
  } catch {
    return [];
  }
}

function writeCachedMachines(machines: Machine[]) {
  safeStorageSet(MACHINE_CACHE_KEY, JSON.stringify(machines));
}

async function fetchMachines(machineId?: string): Promise<Machine[]> {
  try {
    const data = repairTextDeep(await apiFetch<Record<string, unknown>[]>("/machines"));
    if (!Array.isArray(data)) {
      throw new Error("Unexpected machines payload");
    }

    const machines: Machine[] = [];
    for (const row of data) {
      try {
        machines.push(supabaseRowToMachine(row));
      } catch (error) {
        console.error("[useMachines] could not map machine row", row, error);
      }
    }

    if (machines.length > 0) {
      writeCachedMachines(machines);
      return filterMachines(machines, machineId);
    }

    throw new Error("Machine list is empty");
  } catch (error) {
    console.warn("[useMachines] live fetch failed, falling back", error);
    const cachedMachines = readCachedMachines(machineId);
    if (cachedMachines.length > 0) {
      return cachedMachines;
    }
    throw error;
  }
}

export function useMachines(machineId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["machines", machineId ?? "all"],
    queryFn: () => fetchMachines(machineId),
    initialData: () => {
      const cachedMachines = readCachedMachines(machineId);
      if (cachedMachines.length > 0) {
        return cachedMachines;
      }
      return undefined;
    },
    placeholderData: (previous) => previous,
    refetchInterval: 5_000,
    retry: 1,
  });

  useEffect(() => {
    return subscribeToMachineChanges(() => {
      queryClient.invalidateQueries({ queryKey: ["machines"] });
    });
  }, [machineId, queryClient]);

  const addMachine = useMutation({
    mutationFn: (machine: Partial<Machine>) => createMachineRecord(machine),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["machines"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const updateMachine = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Machine> }) =>
      updateMachineRecord(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["machines"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const deleteMachine = useMutation({
    mutationFn: (id: string) => deleteMachineRecord(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["machines"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  return {
    machines: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    addMachine,
    updateMachine,
    deleteMachine,
  };
}
