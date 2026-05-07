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
// Calibrated RUL payload — restored calendar scale + observed usage + ISO 281 reference
// Mirrors prediteq_api/routers/diagnostics_rul.py:/calibrated-rul payload
// ═══════════════════════════════════════════════════════════════════════════

export type CalibratedRulMode = "reference_only" | "initializing" | "prediction";
export type LegacyCalibratedRulMode = "no_prediction" | "warming_up" | "prediction";
export type AnyCalibratedRulMode = CalibratedRulMode | LegacyCalibratedRulMode;
export type FactorSource = "observed" | "calibration_default" | "synthetic_scale";
export type BearingReferenceSource = "measured" | "fallback";
export type RulReferenceKind = "demo_reference" | "last_valid";

export interface BearingReference {
  years_adjusted: number;
  p_observed_kw: number | null;
  p_nominal_kw: number;
  source: BearingReferenceSource;
  reference: string;
  bearing_model: string;
  nominal_years?: number;
  l10_nominal_years?: number;
}

export type HiZone = "Excellent" | "Good" | "Degraded" | "Critical" | "Unknown";

export interface CalibratedRulPrediction {
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

export interface CalibratedRulReferencePrediction {
  kind: RulReferenceKind;
  rul_days: number;
}

export interface CalibratedRulDisclosures {
  availability_note?: string;
  calendar_basis?: string;
  bearing_reference_basis?: string;
  warmup_note?: string;
  model_scope_note?: string;
  /** Legacy compatibility aliases that may still arrive from persisted payloads. */
  fpt_gate?: string;
  rate_basis?: string;
  l10_basis?: string;
  warm_up?: string;
  model_scope?: string;
}

export interface CalibratedRulResponse {
  machine_code: string;
  mode: AnyCalibratedRulMode;
  legacy_mode?: LegacyCalibratedRulMode;
  hi_current: number | null;
  zone: string | null;
  bearing_reference?: BearingReference | null;
  l10?: BearingReference | null;
  disclosures?: CalibratedRulDisclosures | null;
  disclaimers?: CalibratedRulDisclosures | null;
  prediction: CalibratedRulPrediction | null;
  reference_prediction?: CalibratedRulReferencePrediction | null;
  /** Recommandation calendrier GMAO — toujours présente quel que soit le mode */
  maintenance_window: string | null;
  /** Compatibility metadata from the backend; no product-side masking relies on it. */
  warmup_hi_threshold?: number;
  fpt_threshold?: number;
  warmup_detail?: string;
  warming_up_detail?: string;
}

export interface DiagnosticsAll {
  machine_code: string;
  rul_interval: RulInterval | null;
  diagnose: DiagnoseResponse | null;
  rul_explain: RulExplain | null;
  stress_index: StressIndex | null;
  calibrated_rul: CalibratedRulResponse | null;
  rul_v2: CalibratedRulResponse | null;
  disclaimers: DisclaimersBundle;
  errors: Record<string, { status_code: number; detail: string }>;
}

export function normalizeCalibratedRulMode(
  mode: AnyCalibratedRulMode | null | undefined,
): CalibratedRulMode | null {
  if (!mode) return null;
  if (mode === "no_prediction") return "reference_only";
  if (mode === "warming_up") return "initializing";
  return mode;
}

export function getCalibratedRul(data: DiagnosticsAll | null | undefined) {
  return data?.calibrated_rul ?? data?.rul_v2 ?? null;
}

export function getBearingReference(
  rul: CalibratedRulResponse | null | undefined,
): BearingReference | null {
  return rul?.bearing_reference ?? rul?.l10 ?? null;
}

export function getCalibratedRulDisclosures(
  rul: CalibratedRulResponse | null | undefined,
) {
  const raw = rul?.disclosures ?? rul?.disclaimers ?? null;
  return {
    availability_note: raw?.availability_note ?? raw?.fpt_gate ?? "",
    calendar_basis: raw?.calendar_basis ?? raw?.rate_basis ?? "",
    bearing_reference_basis:
      raw?.bearing_reference_basis ?? raw?.l10_basis ?? "",
    warmup_note: raw?.warmup_note ?? raw?.warm_up ?? "",
    model_scope_note: raw?.model_scope_note ?? raw?.model_scope ?? "",
  };
}

export function getCalibratedRulWarmupDetail(
  rul: CalibratedRulResponse | null | undefined,
) {
  return rul?.warmup_detail ?? rul?.warming_up_detail ?? null;
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
// Primary calibrated-RUL endpoint for detailed and dashboard views.
// Aligné sur le polling machine à 5 s pour garder la vue détail cohérente
// pendant les démos du simulateur.
// ═══════════════════════════════════════════════════════════════════════════

export function useCalibratedRul(machineCode: string | null | undefined) {
  return useQuery({
    queryKey: ["diagnostics", "calibrated-rul", machineCode ?? "none"],
    enabled: !!machineCode,
    queryFn: () =>
      apiFetch<CalibratedRulResponse>(
        `/diagnostics/${encodeURIComponent(machineCode!)}/calibrated-rul`
      ),
    refetchInterval: DIAGNOSTICS_REFETCH_MS,
    staleTime: 5_000,
    retry: 1,
  });
}
