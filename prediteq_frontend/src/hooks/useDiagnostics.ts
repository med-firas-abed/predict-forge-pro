import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

// ═══════════════════════════════════════════════════════════════════════════
// Types — miroir exact des payloads retournés par prediteq_api/routers/diagnostics_rul.py
// ═══════════════════════════════════════════════════════════════════════════

export type ConfidenceLevel = "high" | "medium" | "low";
export type SeverityLevel = "critical" | "warning" | "info";

export interface RulInterval {
  machine_code: string;
  source: "random_forest" | "simulator_override";
  rul_days: number;
  rul_days_p10: number | null;
  rul_days_p90: number | null;
  rul_days_p05?: number | null;
  rul_days_p95?: number | null;
  rul_minutes?: number;
  cvi: number | null;
  confidence: ConfidenceLevel;
  n_trees: number | null;
  status: string;
  disclaimer: string;
}

export interface Diagnosis {
  cause: string;
  detail: string;
  severity: SeverityLevel;
  action: string;
  refs: string[];
  code: string;
}

export interface DiagnoseResponse {
  machine_code: string;
  inputs: Record<string, number>;
  diagnoses: Diagnosis[];
  count: number;
}

export interface ShapContribution {
  feature: string;
  value: number;
  shap_value_min: number;
  impact_days: number;
  direction: "rallonge" | "raccourcit" | "neutre";
  rank: number;
}

export interface RulExplain {
  machine_code: string;
  baseline_days: number;
  prediction_days: number;
  prediction_minutes: number;
  contributions: ShapContribution[];
  other_impact_days: number;
  other_impact_count: number;
  top_k: number;
}

export interface BadgeLabel {
  label: string;
  color_hex: string;
  icon: string;
  tooltip: string;
}

export interface DisclaimersBundle {
  rul_nature: string;
  calibration_notice: string;
  badge_labels: Record<ConfidenceLevel, BadgeLabel>;
}

export type StressBand = "low" | "moderate" | "high" | "critical";

export interface StressComponents {
  thermal: number;
  vibration: number;
  load: number;
  variability: number;
}

export interface StressIndex {
  machine_code: string;
  value: number;            // [0, 1]
  band: StressBand;
  components: StressComponents;
  dominant: keyof StressComponents;
  inputs_seen: Array<keyof StressComponents>;
  inputs?: Record<string, number>;
}

export interface DiagnosticsAll {
  machine_code: string;
  rul_interval: RulInterval | null;
  diagnose: DiagnoseResponse | null;
  rul_explain: RulExplain | null;
  stress_index: StressIndex | null;
  disclaimers: DisclaimersBundle;
  errors: Record<string, { status_code: number; detail: string }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Hook principal — un seul endpoint /diagnostics/{code}/all, rafraîchi 30 s
// ═══════════════════════════════════════════════════════════════════════════

export function useDiagnostics(machineCode: string | null | undefined) {
  return useQuery({
    queryKey: ["diagnostics", "all", machineCode ?? "none"],
    enabled: !!machineCode,
    queryFn: async () => {
      if (!machineCode) throw new Error("machineCode required");
      return apiFetch<DiagnosticsAll>(
        `/diagnostics/${encodeURIComponent(machineCode)}/all`
      );
    },
    refetchInterval: 30_000,
    staleTime: 10_000,
    retry: 1,
  });
}

// Endpoints ciblés — utilisables si on veut découpler les écrans plus tard
export function useRulInterval(machineCode: string | null | undefined) {
  return useQuery({
    queryKey: ["diagnostics", "rul-interval", machineCode ?? "none"],
    enabled: !!machineCode,
    queryFn: () =>
      apiFetch<RulInterval>(
        `/diagnostics/${encodeURIComponent(machineCode!)}/rul-interval`
      ),
    refetchInterval: 30_000,
  });
}

export function useDiagnoseRules(machineCode: string | null | undefined) {
  return useQuery({
    queryKey: ["diagnostics", "diagnose", machineCode ?? "none"],
    enabled: !!machineCode,
    queryFn: () =>
      apiFetch<DiagnoseResponse>(
        `/diagnostics/${encodeURIComponent(machineCode!)}/diagnose`
      ),
    refetchInterval: 30_000,
  });
}

export function useRulExplain(machineCode: string | null | undefined) {
  return useQuery({
    queryKey: ["diagnostics", "rul-explain", machineCode ?? "none"],
    enabled: !!machineCode,
    queryFn: () =>
      apiFetch<RulExplain>(
        `/diagnostics/${encodeURIComponent(machineCode!)}/rul-explain`
      ),
    refetchInterval: 60_000,
  });
}

export function useStressIndex(machineCode: string | null | undefined) {
  return useQuery({
    queryKey: ["diagnostics", "stress-index", machineCode ?? "none"],
    enabled: !!machineCode,
    queryFn: () =>
      apiFetch<StressIndex>(
        `/diagnostics/${encodeURIComponent(machineCode!)}/stress-index`
      ),
    refetchInterval: 30_000,
  });
}
