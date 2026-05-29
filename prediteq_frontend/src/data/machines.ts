export interface DemoScenario {
  site?: string;
  health_state?: string;
  health_label?: string;
  usage_case?: string;
  explanation?: string;
  profile?: string;
  base_load_kg?: number;
  load_pattern?: string;
  load_band_kg?: [number, number];
  target_hi?: number;
  public_ticks?: number;
  cycles_per_day?: number;
  power_avg_30j_kw?: number;
  temp_bias_c?: number;
  humidity_bias_rh?: number;
  usage_intensity?: number;
  wear_level?: number;
  thermal_stress?: number;
  humidity_stress?: number;
  load_variability?: number;
  vibration_bias_mms?: number;
  overload_bias?: number;
  reference_rul_days?: number | null;
}

export type PredictiveUrgencyBand = "stable" | "watch" | "priority" | "critical";
export type MachinePredictionMode =
  | "reference_only"
  | "initializing"
  | "prediction";
export type MachineStressBand = "low" | "moderate" | "high" | "critical";
export type MachineReferenceKind = "demo_reference" | "last_valid";
export type MachineCurrentSource =
  | "measured"
  | "derived_ascent_power"
  | "estimated_from_power"
  | "missing";
export type MachineDataSource =
  | "live_runtime"
  | "simulator_demo"
  | "persisted_reference"
  | "no_data";

export interface MachineDecisionTaskTemplate {
  type: "preventive" | "corrective" | "inspection";
  leadDays: number;
  cooldownDays?: number;
  title: string;
  summary: string;
}

export interface MachineDecisionBudgetModel {
  multiplier: number;
  delayMultiplier: number;
}

export interface MachineDecisionPolicyScenario {
  pressure?: number | null;
  label?: string | null;
  source?: string | null;
  summary?: string | null;
}

export interface MachineDecisionPolicyTelemetry {
  trustScore?: number | null;
  trustLevel?: string | null;
  autoScheduleGuard?: boolean;
  heavyActionGuard?: boolean;
}

export interface MachineDecisionPolicyMachine {
  criticality?: number | null;
  category?: string | null;
  label?: string | null;
}

export interface MachineDecisionPolicyContext {
  scenario?: MachineDecisionPolicyScenario | null;
  telemetry?: MachineDecisionPolicyTelemetry | null;
  machine?: MachineDecisionPolicyMachine | null;
}

export interface MachineDecision {
  status: "ok" | "degraded" | "critical" | "maintenance";
  zone: string | null;
  hi: number | null;
  rulDays: number | null;
  predictionMode: MachinePredictionMode | null;
  confidence: "high" | "medium" | "low" | null;
  maintenanceWindow: string | null;
  stopRecommended: boolean;
  alerts24h: number;
  openTasks: number;
  stressValue: number | null;
  stressBand: MachineStressBand | null;
  stressLabel: string;
  dominantAxis: string | null;
  topDriver: string | null;
  urgencyScore: number;
  urgencyBand: PredictiveUrgencyBand;
  urgencyLabel: string;
  urgencyHex: string;
  summary: string;
  plainReason: string;
  impact: string;
  recommendedAction: string;
  trustNote: string;
  technicalStory: string;
  evidence: string[];
  fieldChecks: string[];
  taskTemplate: MachineDecisionTaskTemplate;
  budgetModel: MachineDecisionBudgetModel;
  policyContext?: MachineDecisionPolicyContext | null;
  diagnosisCount: number;
  diagnoses: Array<Record<string, unknown>>;
  dataSource: MachineDataSource;
  updatedAt: string | null;
  ageSeconds: number | null;
  isStale: boolean;
  freshnessState: string;
}

export interface Machine {
  id: string;
  uuid?: string;
  name: string;
  loc: string;
  city: string;
  lat: number;
  lon: number;
  hi: number | null;
  rul: number | null;
  rulci: number | null;
  rulMode?: MachinePredictionMode;
  rulIntervalLow?: number | null;
  rulIntervalHigh?: number | null;
  rulIntervalLabel?: string | null;
  referenceLifetimeYears?: number | null;
  rulReferenceDays?: number | null;
  rulReferenceKind?: MachineReferenceKind | null;
  stopRecommended?: boolean;
  status: "ok" | "degraded" | "critical" | "maintenance";
  vib: number | null;
  curr: number | null;
  currSource?: MachineCurrentSource;
  temp: number | null;
  anom: number;
  cycles: number | null;
  model: string;
  floors: number;
  last: string;
  dataSource?: MachineDataSource;
  freshnessState?: string | null;
  telemetrySource?: string | null;
  decision?: MachineDecision | null;
  demoScenario?: DemoScenario | null;
}

export const MACHINES: Machine[] = [
  {
    id: "ASC-A1",
    name: "Machine 1",
    loc: "Site Nord - Bizerte",
    city: "Bizerte",
    lat: 37.2744,
    lon: 9.8739,
    hi: 0.96,
    rul: null,
    rulci: null,
    status: "ok",
    vib: 1.3,
    curr: 4.21,
    temp: 23.4,
    anom: 1,
    cycles: 82,
    model: "SITI FC100L1-4",
    floors: 19,
    last: "2026-03-15",
  },
  {
    id: "ASC-B2",
    name: "Machine 2",
    loc: "Batiment B - Zone Est",
    city: "Sfax",
    lat: 34.739,
    lon: 10.76,
    hi: 0.62,
    rul: 118,
    rulci: 16,
    status: "degraded",
    vib: 3.1,
    curr: 4.68,
    temp: 27.1,
    anom: 7,
    cycles: 74,
    model: "SITI FC100L1-4",
    floors: 19,
    last: "2026-03-10",
  },
  {
    id: "ASC-C3",
    name: "Machine 3",
    loc: "Batiment C - Zone Sud",
    city: "Sousse",
    lat: 35.828,
    lon: 10.636,
    hi: 0.1,
    rul: 77,
    rulci: 7,
    status: "critical",
    vib: 6.8,
    curr: 4.97,
    temp: 31.2,
    anom: 23,
    cycles: 61,
    model: "SITI FC100L1-4",
    floors: 19,
    last: "2026-03-20",
  },
];

export const STATUS_CONFIG = {
  ok: { label: "Operationnel", pillClass: "status-pill--ok", hex: "#10b981" },
  degraded: { label: "Surveillance", pillClass: "status-pill--degraded", hex: "#f59e0b" },
  critical: { label: "Critique", pillClass: "status-pill--critical", hex: "#f43f5e" },
  maintenance: { label: "Maintenance", pillClass: "status-pill--maintenance", hex: "#4b8b9b" },
} as const;

export function genHI(base: number, n = 90): number[] {
  let hi = Math.min(base + 0.18, 1);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    hi = Math.max(0, Math.min(1, hi - 0.003 + Math.random() * 0.008 - 0.004));
    out.push(+hi.toFixed(3));
  }
  out[out.length - 1] = base;
  return out;
}
