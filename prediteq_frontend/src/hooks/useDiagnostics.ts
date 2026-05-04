import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { repairTextDeep } from "@/lib/repairText";

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

// ═══════════════════════════════════════════════════════════════════════════
// RUL v2 — FPT-conditional + observed-rate + ISO 281 adjusted L10
// Mirrors prediteq_api/routers/diagnostics_rul.py:rul_v2 endpoint
// ═══════════════════════════════════════════════════════════════════════════

export type RulV2Mode = "no_prediction" | "warming_up" | "prediction";
export type FactorSource = "observed" | "calibration_default";
export type L10Source = "measured" | "fallback";
export type RulReferenceKind = "demo_reference" | "last_valid";

export interface RulV2L10 {
  years_adjusted: number;
  p_observed_kw: number | null;
  p_nominal_kw: number;
  source: L10Source;
  reference: string;
  bearing_model: string;
  l10_nominal_years: number;
}

export type HiZone = "Excellent" | "Good" | "Degraded" | "Critical" | "Unknown";

export interface RulV2Prediction {
  // Affichage primaire — calendrier GMAO (sortie RF traduite par rythme observé)
  rul_days: number;
  rul_days_p10: number | null;
  rul_days_p90: number | null;
  rul_days_display_low: number | null;
  rul_days_display_high: number | null;
  display_interval_label: string | null;
  // Backing physique — cycles d'opération PHM
  cycles_remaining: number;
  cycles_per_day_observed: number | null;
  factor_used: number;
  factor_source: FactorSource;
  cycles_per_sim_min: number;
  // Zone HI courante (ISO 10816-3 mapping)
  hi_zone: HiZone;
  // Recommandation maintenance (heuristique métier RCM, indépendante du modèle ML)
  maintenance_window: string;
  // Transparence RF — sim-min bruts (audit / explainability)
  rul_min_simulator: number;
  rul_min_p10: number | null;
  rul_min_p90: number | null;
  n_trees: number | null;
  // Confiance Meinshausen 2006
  cvi: number | null;
  confidence: ConfidenceLevel;
  stop_recommended: boolean;
}

export interface RulV2ReferencePrediction {
  kind: RulReferenceKind;
  rul_days: number;
}

export interface RulV2Disclaimers {
  fpt_gate: string;
  rate_basis: string;
  l10_basis: string;
  warm_up: string;
  model_scope: string;
}

export interface RulV2Response {
  machine_code: string;
  mode: RulV2Mode;
  hi_current: number | null;
  zone: string | null;
  l10: RulV2L10;
  disclaimers: RulV2Disclaimers;
  prediction: RulV2Prediction | null;
  reference_prediction?: RulV2ReferencePrediction | null;
  /** Recommandation calendrier GMAO — toujours présente quel que soit le mode */
  maintenance_window: string | null;
  fpt_threshold: number;
  warming_up_detail?: string;
}

export interface DiagnosticsAll {
  machine_code: string;
  rul_interval: RulInterval | null;
  diagnose: DiagnoseResponse | null;
  rul_explain: RulExplain | null;
  stress_index: StressIndex | null;
  rul_v2: RulV2Response | null;
  disclaimers: DisclaimersBundle;
  errors: Record<string, { status_code: number; detail: string }>;
}

const DIAGNOSTICS_REFETCH_MS = 5_000;

export async function fetchDiagnosticsAll(machineCode: string): Promise<DiagnosticsAll> {
  const payload = await apiFetch<DiagnosticsAll>(
    `/diagnostics/${encodeURIComponent(machineCode)}/all`
  );
  return repairTextDeep(payload);
}

// ═══════════════════════════════════════════════════════════════════════════
// Hook principal — un seul endpoint /diagnostics/{code}/all, rafraîchi 5 s
// ═══════════════════════════════════════════════════════════════════════════

export function useDiagnostics(machineCode: string | null | undefined) {
  return useQuery({
    queryKey: ["diagnostics", "all", machineCode ?? "none"],
    enabled: !!machineCode,
    queryFn: async () => {
      if (!machineCode) throw new Error("machineCode required");
      return fetchDiagnosticsAll(machineCode);
    },
    refetchInterval: DIAGNOSTICS_REFETCH_MS,
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
    refetchInterval: DIAGNOSTICS_REFETCH_MS,
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
    refetchInterval: DIAGNOSTICS_REFETCH_MS,
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
    refetchInterval: DIAGNOSTICS_REFETCH_MS,
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
    refetchInterval: DIAGNOSTICS_REFETCH_MS,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// RUL v2 — FPT-conditional, observed-rate, L10 adjusted (ISO 281)
// Endpoint primaire pour les nouveaux composants RulV2Card / DashboardCard.
// Aligné sur le polling machine à 5 s pour garder la vue détail cohérente
// pendant les démos du simulateur.
// ═══════════════════════════════════════════════════════════════════════════

export function useRulV2(machineCode: string | null | undefined) {
  return useQuery({
    queryKey: ["diagnostics", "rul-v2", machineCode ?? "none"],
    enabled: !!machineCode,
    queryFn: () =>
      apiFetch<RulV2Response>(
        `/diagnostics/${encodeURIComponent(machineCode!)}/rul-v2`
      ),
    refetchInterval: DIAGNOSTICS_REFETCH_MS,
    staleTime: 5_000,
    retry: 1,
  });
}
