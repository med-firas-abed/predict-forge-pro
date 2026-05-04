import { useEffect, useMemo } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Gauge,
  Info,
  ShieldAlert,
  Sparkles,
  Thermometer,
  Wrench,
  Zap,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { useApp } from "@/contexts/AppContext";
import { STATUS_CONFIG } from "@/data/machines";
import { useDiagnostics } from "@/hooks/useDiagnostics";
import { useFleetPredictiveInsights } from "@/hooks/useFleetPredictiveInsights";
import { useMachineSensors } from "@/hooks/useMachineSensors";
import { useMachines } from "@/hooks/useMachines";
import { inferComponentFocus } from "@/lib/componentInference";
import { getSurfaceableMachineDemoScenario } from "@/lib/demoScenario";
import { formatMachineFloorLabel } from "@/lib/machinePresentation";
import { repairText } from "@/lib/repairText";
import { buildRulDisplay } from "@/lib/rulDisplay";

const STRESS_BAND_LABELS = {
  low: { fr: "Faible", en: "Low", ar: "Low", tone: "text-success" },
  moderate: { fr: "Modéré", en: "Moderate", ar: "Moderate", tone: "text-warning" },
  high: { fr: "Élevé", en: "High", ar: "High", tone: "text-warning" },
  critical: { fr: "Critique", en: "Critical", ar: "Critical", tone: "text-destructive" },
} as const;

const AXIS_LABELS = {
  thermal: { fr: "Thermique", en: "Thermal", ar: "Thermal" },
  vibration: { fr: "Vibration", en: "Vibration", ar: "Vibration" },
  load: { fr: "Charge", en: "Load", ar: "Load" },
  variability: { fr: "Variabilité", en: "Variability", ar: "Variability" },
} as const;

const CONFIDENCE_LABELS = {
  high: { fr: "Confiance élevée", en: "High confidence", ar: "High confidence" },
  medium: { fr: "Confiance moyenne", en: "Medium confidence", ar: "Medium confidence" },
  low: { fr: "Confiance faible", en: "Low confidence", ar: "Low confidence" },
} as const;

const STATUS_LABELS = {
  ok: { fr: "Opérationnel", en: "Operational", ar: "Operational" },
  degraded: { fr: "Surveillance", en: "Monitoring", ar: "Monitoring" },
  critical: { fr: "Critique", en: "Critical", ar: "Critical" },
  maintenance: { fr: "Maintenance", en: "Maintenance", ar: "Maintenance" },
} as const;

function normalizeToken(value: string | null | undefined) {
  return repairText(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function normalizeStatusKey(value: string | null | undefined): keyof typeof STATUS_LABELS | null {
  const token = normalizeToken(value);

  if (token === "ok" || token === "operational" || token === "operationnel") return "ok";
  if (token === "degraded" || token === "surveillance" || token === "monitoring") return "degraded";
  if (token === "critical" || token === "critique") return "critical";
  if (token === "maintenance") return "maintenance";

  return null;
}

function normalizeConfidenceKey(
  value: string | null | undefined,
): keyof typeof CONFIDENCE_LABELS | null {
  const token = normalizeToken(value);

  if (token === "high" || token === "elevee" || token === "elevée") return "high";
  if (token === "medium" || token === "moyenne" || token === "moderate" || token === "modere") {
    return "medium";
  }
  if (token === "low" || token === "faible") return "low";

  return null;
}

function normalizeAxisKey(value: string | null | undefined): keyof typeof AXIS_LABELS | null {
  const token = normalizeToken(value);

  if (token === "thermal" || token === "thermique") return "thermal";
  if (token === "vibration" || token === "vibratoire") return "vibration";
  if (token === "load" || token === "charge") return "load";
  if (token === "variability" || token === "variabilite") return "variability";

  return null;
}

function normalizeStressBandKey(
  value: string | null | undefined,
): keyof typeof STRESS_BAND_LABELS | null {
  const token = normalizeToken(value);

  if (token === "low" || token === "faible") return "low";
  if (token === "moderate" || token === "modere") return "moderate";
  if (token === "high" || token === "eleve") return "high";
  if (token === "critical" || token === "critique") return "critical";

  return null;
}

function formatNumber(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }

  return value.toLocaleString("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function MiniMetric({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-3 px-4 py-3">
      <div className="text-[0.68rem] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-foreground">{value}</div>
      {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

function DiagnosisItem({
  title,
  detail,
  action,
  severity,
  refs,
}: {
  title: string;
  detail: string;
  action: string;
  severity: "critical" | "warning" | "info";
  refs: string[];
}) {
  const tone =
    severity === "critical"
      ? "border-l-destructive bg-destructive/5"
      : severity === "warning"
        ? "border-l-warning bg-warning/5"
        : "border-l-primary bg-primary/5";

  return (
    <div className={`rounded-xl border border-border border-l-4 px-4 py-4 ${tone}`}>
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <div className="mt-2 text-sm leading-relaxed text-secondary-foreground">{detail}</div>
      <div className="mt-3 text-sm leading-relaxed text-secondary-foreground">
        <span className="font-semibold text-foreground">Action terrain :</span> {action}
      </div>
      {refs.length > 0 ? (
        <div className="mt-3 text-xs text-muted-foreground">{refs.join(" | ")}</div>
      ) : null}
    </div>
  );
}

function FactorBar({
  feature,
  impactDays,
  maxImpact,
}: {
  feature: string;
  impactDays: number;
  maxImpact: number;
}) {
  const width = Math.max(10, Math.round((Math.abs(impactDays) / Math.max(maxImpact, 1)) * 100));
  const positive = impactDays >= 0;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-4 text-xs">
        <span className="font-semibold text-foreground">{feature}</span>
        <span className={positive ? "text-success" : "text-destructive"}>
          {positive ? "+" : ""}
          {impactDays.toFixed(1)} j
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-3">
        <div
          className={`h-full rounded-full ${positive ? "bg-success" : "bg-destructive"}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

export function DiagnosticsPage() {
  const { lang } = useApp();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { machines, isLoading: isLoadingMachines } = useMachines();
  const { byMachineId } = useFleetPredictiveInsights(machines);
  const requestedMachineId = searchParams.get("machine");
  const selected =
    machines.find((machine) => machine.id === requestedMachineId) ?? machines[0] ?? null;

  useEffect(() => {
    if (!selected?.id || requestedMachineId === selected.id) {
      return;
    }

    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set("machine", selected.id);
    setSearchParams(nextSearchParams, { replace: true });
  }, [requestedMachineId, searchParams, selected?.id, setSearchParams]);

  const updateSelectedMachine = (machineId: string) => {
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set("machine", machineId);
    setSearchParams(nextSearchParams, { replace: true });
  };

  const goToDashboard = () => {
    if (selected?.id) {
      navigate(`/dashboard?machine=${encodeURIComponent(selected.id)}`);
      return;
    }

    navigate("/dashboard");
  };

  const { data: diagnostics, isLoading: isLoadingDiagnostics } = useDiagnostics(selected?.id);
  const { latest: latestSensorPoint } = useMachineSensors(selected?.id ?? undefined);

  const l = (fr: string, en: string, ar: string) =>
    repairText(lang === "fr" ? fr : lang === "en" ? en : ar);
  const numberLocale = lang === "fr" ? "fr-FR" : lang === "en" ? "en-GB" : "ar-TN";

  const selectedInsight = selected ? byMachineId[selected.id] : null;
  const selectedScenario = getSurfaceableMachineDemoScenario(selected);
  const cfg = selected ? STATUS_CONFIG[selected.status] : STATUS_CONFIG.ok;
  const predictionMode =
    diagnostics?.rul_v2?.mode ?? selectedInsight?.predictionMode ?? selected?.rulMode ?? null;
  const prediction = diagnostics?.rul_v2?.prediction ?? null;
  const maintenanceWindow =
    repairText(
      diagnostics?.rul_v2?.maintenance_window ??
        selectedInsight?.maintenanceWindow ??
        selected?.decision?.maintenanceWindow ??
        null,
    ) || null;
  const topDriver =
    repairText(
      diagnostics?.rul_explain?.contributions?.[0]?.feature ??
        selectedInsight?.topDriver ??
        selected?.decision?.topDriver ??
        null,
    ) || null;
  const dominantAxis =
    diagnostics?.stress_index?.dominant ??
    selectedInsight?.dominantAxis ??
    selected?.decision?.dominantAxis ??
    null;
  const confidenceLevel =
    prediction?.confidence ?? selectedInsight?.confidence ?? selected?.decision?.confidence ?? null;
  const stress =
    diagnostics?.stress_index ??
    (selectedInsight?.stressBand
      ? {
          value: selectedInsight.stressValue ?? 0,
          band: selectedInsight.stressBand,
          components: {
            thermal: 0,
            vibration: 0,
            load: 0,
            variability: 0,
          },
          dominant: (selectedInsight.dominantAxis as "thermal" | "vibration" | "load" | "variability") ?? "variability",
        }
      : null);
  const stressBandKey =
    normalizeStressBandKey(stress?.band) ??
    normalizeStressBandKey(selectedInsight?.stressBand) ??
    normalizeStressBandKey(selected?.decision?.stressBand);
  const statusKey = normalizeStatusKey(selected.status);
  const confidenceKey = normalizeConfidenceKey(confidenceLevel);
  const axisKey = normalizeAxisKey(dominantAxis);
  const stressMeta = stressBandKey ? STRESS_BAND_LABELS[stressBandKey] : null;
  const statusLabel = statusKey
    ? l(STATUS_LABELS[statusKey].fr, STATUS_LABELS[statusKey].en, STATUS_LABELS[statusKey].ar)
    : repairText(selected.status);
  const confidenceLabel = confidenceKey
    ? l(
        CONFIDENCE_LABELS[confidenceKey].fr,
        CONFIDENCE_LABELS[confidenceKey].en,
        CONFIDENCE_LABELS[confidenceKey].ar,
      )
    : confidenceLevel
      ? repairText(String(confidenceLevel))
      : null;
  const dominantAxisLabel = axisKey
    ? l(AXIS_LABELS[axisKey].fr, AXIS_LABELS[axisKey].en, AXIS_LABELS[axisKey].ar)
    : dominantAxis
      ? repairText(String(dominantAxis))
      : null;
  const dataSourceLabel =
    selectedInsight?.dataSource === "live_runtime"
      ? l("Flux en direct", "Live stream", "Live stream")
      : selectedInsight?.dataSource === "simulator_demo"
        ? l("Replay démo", "Demo replay", "Demo replay")
        : selectedInsight?.dataSource === "persisted_reference"
          ? l("Référence persistée", "Reference snapshot", "Reference snapshot")
          : l("Flux en attente", "Waiting for stream", "Waiting for stream");
  const freshnessLabel =
    selectedInsight?.updatedAt != null
      ? new Date(selectedInsight.updatedAt).toLocaleString(numberLocale, {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : l("Lecture en attente", "Waiting for reading", "Waiting for reading");

  const rulDisplay = buildRulDisplay({
    machine: selected,
    predictionMode,
    prediction,
    l10Years: diagnostics?.rul_v2?.l10?.years_adjusted ?? null,
    localize: l,
  });

  const summaryText = repairText(
    selectedInsight?.summary ||
      l(
        "Synthèse indisponible pour le moment.",
        "Summary is unavailable for now.",
        "Summary is unavailable for now.",
      ),
  );
  const reasonText = repairText(
    selectedInsight?.plainReason ||
      l(
        "Aucune rupture nette détectée pour le moment.",
        "No clear break is detected for now.",
        "No clear break is detected for now.",
      ),
  );
  const actionText = repairText(
    selectedInsight?.recommendedAction ||
      maintenanceWindow ||
      l(
        "Confirmer sur site avant une intervention lourde.",
        "Confirm on site before any major intervention.",
        "Confirm on site before any major intervention.",
      ),
  );

  const diagnoses = useMemo(
    () =>
      (diagnostics?.diagnose?.diagnoses ?? []).map((diagnosis) => ({
        ...diagnosis,
        cause: repairText(diagnosis.cause),
        detail: repairText(diagnosis.detail),
        action: repairText(diagnosis.action),
        refs: diagnosis.refs.map((ref) => repairText(ref)),
      })),
    [diagnostics?.diagnose?.diagnoses],
  );
  const criticalDiagnosis = diagnoses.find((diagnosis) => diagnosis.severity === "critical") ?? null;
  const warningDiagnosis = diagnoses.find((diagnosis) => diagnosis.severity === "warning") ?? null;
  const expertDiagnosis = criticalDiagnosis ?? warningDiagnosis ?? diagnoses[0] ?? null;
  const hasLivePrediction = predictionMode === "prediction" && Boolean(prediction);
  const isReferenceMode = predictionMode === "no_prediction" || rulDisplay.source === "l10_reference";
  const prognosisBadgeLabel = hasLivePrediction
    ? confidenceLabel ?? l("Pronostic live", "Live prognosis", "Live prognosis")
    : isReferenceMode
      ? l("Référence stable", "Stable reference", "Stable reference")
      : l("Calibration en cours", "Calibration in progress", "Calibration in progress");
  const needsExpertEscalation =
    Boolean(criticalDiagnosis) &&
    !["priority", "critical"].includes(selectedInsight?.urgencyBand ?? "");
  const decisionActionText = needsExpertEscalation
    ? repairText(criticalDiagnosis?.action ?? actionText)
    : actionText;
  const decisionSummaryText = needsExpertEscalation
    ? l(
        "Une alerte experte critique est active. La machine sort du simple suivi de routine jusqu'à vérification terrain.",
        "A critical expert alert is active. The machine should leave routine follow-up until the field check is done.",
        "A critical expert alert is active. The machine should leave routine follow-up until the field check is done.",
      )
    : summaryText;
  const decisionReasonText =
    needsExpertEscalation && expertDiagnosis
      ? `${l("Signal expert dominant", "Dominant expert signal", "Dominant expert signal")}: ${repairText(
          expertDiagnosis.cause,
        )}. ${repairText(expertDiagnosis.detail)}`
      : reasonText;
  const decisionWindowValue = needsExpertEscalation
    ? l("Contrôle prioritaire", "Priority check", "Priority check")
    : maintenanceWindow ?? "-";
  const decisionInterventionValue = needsExpertEscalation
    ? l("Contrôle terrain", "Field check", "Field check")
    : repairText(selectedInsight?.taskTemplate.title ?? l("Inspection", "Inspection", "Inspection"));
  const decisionStatusLabel = hasLivePrediction
    ? l("Confiance", "Confidence", "Confidence")
    : l("Statut", "Status", "Status");
  const decisionStatusValue = needsExpertEscalation
    ? l("Alerte experte critique", "Critical expert alert", "Critical expert alert")
    : hasLivePrediction
      ? confidenceLabel ?? l("Lecture cohérente", "Stable reading", "Stable reading")
      : isReferenceMode
        ? l("Référence stable", "Stable reference", "Stable reference")
        : l("Calibration en cours", "Calibration in progress", "Calibration in progress");
  const rulSectionTitle = hasLivePrediction
    ? l("RUL (durée restante)", "RUL prognosis", "RUL prognosis")
    : isReferenceMode
      ? l("Référence de durée de vie", "Lifetime reference", "Lifetime reference")
      : l("Pronostic en préparation", "Prognosis in preparation", "Prognosis in preparation");

  const explainContributions = useMemo(
    () =>
      [...(diagnostics?.rul_explain?.contributions ?? [])]
        .sort((left, right) => Math.abs(right.impact_days) - Math.abs(left.impact_days))
        .slice(0, 4)
        .map((contribution) => ({
          ...contribution,
          feature: repairText(contribution.feature),
        })),
    [diagnostics?.rul_explain?.contributions],
  );

  const maxExplainImpact = Math.max(
    1,
    ...explainContributions.map((contribution) => Math.abs(contribution.impact_days)),
  );

  const cleanedEvidence = (selectedInsight?.evidence ?? []).map((item) => repairText(item));
  const cleanedFieldChecks = (selectedInsight?.fieldChecks ?? []).map((item) => repairText(item));
  const componentFocus = inferComponentFocus(
    {
      diagnoses,
      dominantAxis,
      topDriver,
    },
    l,
  );
  const componentConfidenceClass =
    componentFocus.confidenceTone === "high"
      ? "bg-primary/10 text-primary"
      : componentFocus.confidenceTone === "medium"
        ? "bg-warning/10 text-warning"
        : "bg-surface-3 text-muted-foreground";
  const componentEvidence = Array.from(
    new Set([...componentFocus.evidence, ...cleanedEvidence.slice(0, 3)]),
  ).slice(0, 5);

  if (isLoadingMachines && !selected) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          {l("Chargement du diagnostic...", "Loading diagnostics...", "Loading diagnostics...")}
        </div>
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          {l(
            "Aucune machine n'est disponible pour le moment.",
            "No machine is available right now.",
            "No machine is available right now.",
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-premium">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 mb-3 h-auto rounded-full px-2 text-muted-foreground hover:text-foreground"
              onClick={goToDashboard}
            >
              <ArrowLeft className="h-4 w-4" />
              {l("Retour au tableau de bord", "Back to dashboard", "Back to dashboard")}
            </Button>
            <div className="section-title">{l("Diagnostic avancé", "Advanced diagnostics", "Advanced diagnostics")}</div>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-secondary-foreground">
              {l(
                "Vue détaillée : HI, RUL, stress, alertes et action conseillée.",
                "Detailed view: HI, RUL, stress, alerts, and suggested action.",
                "Detailed view: HI, RUL, stress, alerts, and suggested action.",
              )}
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {l("Machine", "Machine", "Machine")}
            </div>
            <select
              value={selected.id}
              onChange={(event) => updateSelectedMachine(event.target.value)}
              className="rounded-xl border border-border bg-surface-3 px-4 py-2.5 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {machines.map((machine) => (
                <option key={machine.id} value={machine.id}>
                  {machine.id} - {repairText(machine.name)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div
          className="mt-5 rounded-2xl border-l-4 p-5"
          style={{ borderLeftColor: cfg.hex, background: `${cfg.hex}10` }}
        >
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-xl font-bold text-foreground">{selected.id}</div>
                <span className={`status-pill ${cfg.pillClass}`}>{statusLabel}</span>
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {repairText(selected.name)} - {repairText(selected.city)}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-border bg-surface-3 px-3 py-1 text-xs font-semibold text-muted-foreground">
                {dataSourceLabel}
              </span>
              {prognosisBadgeLabel ? (
                <span className="rounded-full border border-border bg-surface-3 px-3 py-1 text-xs font-semibold text-muted-foreground">
                  {prognosisBadgeLabel}
                </span>
              ) : null}
              <span className="rounded-full border border-border bg-surface-3 px-3 py-1 text-xs font-semibold text-muted-foreground">
                {l("Dernière lecture", "Latest reading", "Latest reading")}: {freshnessLabel}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-premium">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <div className="section-title">{l("Décision de maintenance", "Maintenance decision", "Maintenance decision")}</div>
          </div>

            <div className="rounded-xl border border-border bg-surface-3 px-4 py-4">
              <div className="text-[0.68rem] uppercase tracking-[0.18em] text-muted-foreground">
                {l("Action", "Action", "Action")}
              </div>
              <div className="mt-2 text-lg font-semibold leading-relaxed text-foreground">
                {decisionActionText}
              </div>
              <div className="mt-3 text-sm leading-relaxed text-secondary-foreground">
                {decisionSummaryText}
              </div>
              <div className="mt-2 text-sm leading-relaxed text-secondary-foreground">
                {decisionReasonText}
              </div>
            </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <MiniMetric
              label={l("Fenêtre", "Suggested window", "Suggested window")}
              value={decisionWindowValue}
            />
            <MiniMetric
              label={l("Intervention", "Intervention type", "Intervention type")}
              value={decisionInterventionValue}
            />
            <MiniMetric
              label={decisionStatusLabel}
              value={decisionStatusValue}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-premium">
          <div className="mb-4 flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-primary" />
            <div className="section-title">{rulSectionTitle}</div>
          </div>

          <div className="rounded-xl border border-border bg-surface-3 px-4 py-5">
            <div className="text-4xl font-bold leading-none text-foreground">{rulDisplay.value}</div>
            <div className="mt-3 text-sm leading-relaxed text-secondary-foreground">{repairText(rulDisplay.sub)}</div>
            {predictionMode === "prediction" && prediction ? (
              <div className="mt-3 text-xs text-muted-foreground">
                {(prediction.display_interval_label ?? "IC 80 %")}:
                {" "}
                {prediction.rul_days_display_low ?? prediction.rul_days_p10 ?? "-"}
                {" - "}
                {prediction.rul_days_display_high ?? prediction.rul_days_p90 ?? "-"} j
              </div>
            ) : null}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <MiniMetric
              label={l("Health Index", "Health Index", "Health Index")}
              value={
                selected.hi != null
                  ? `${Math.round(selected.hi * 100)}%`
                  : l("Indispo.", "N/A", "N/A")
              }
            />
            <MiniMetric
              label={l("Stress", "Stress", "Stress")}
              value={
                stress && stressMeta
                  ? `${Math.round(stress.value * 100)}%`
                  : l("Indispo.", "N/A", "N/A")
              }
              sub={stressMeta ? l(stressMeta.fr, stressMeta.en, stressMeta.ar) : undefined}
            />
            <MiniMetric
              label={l("Anomalies 24 h", "Anomalies 24h", "Anomalies 24h")}
              value={selected.anom.toLocaleString(numberLocale)}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-premium">
          <div className="mb-4 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-primary" />
            <div className="section-title">{l("Zone à vérifier", "Inspection target", "Inspection target")}</div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <MiniMetric
              label={l("Zone à vérifier", "Inspection target", "Inspection target")}
              value={componentFocus.familyLabel}
            />
            <MiniMetric
              label={l("Indice clé", "Key signal", "Key signal")}
              value={componentFocus.primarySignal}
            />
            <MiniMetric
              label={l("Orientation", "Direction", "Direction")}
              value={componentFocus.confidenceLabel}
            />
          </div>

          <div className="mt-4 rounded-xl border border-border bg-surface-3 px-4 py-4">
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${componentConfidenceClass}`}>
                {componentFocus.confidenceLabel}
              </span>
              {dominantAxisLabel ? (
                <span className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
                  {l("Axe dominant", "Dominant axis", "Dominant axis")}: {dominantAxisLabel}
                </span>
              ) : null}
            </div>
            <div className="mt-3 text-sm leading-relaxed text-secondary-foreground">
              {componentFocus.summary}
            </div>
          </div>

          {componentEvidence.length > 0 ? (
            <div className="mt-4">
              <div className="text-[0.68rem] uppercase tracking-[0.18em] text-muted-foreground">
                {l("Repères", "Cues", "Cues")}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {componentEvidence.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-border bg-surface-3 px-3 py-1 text-xs text-muted-foreground"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {explainContributions.length > 0 ? (
            <div className="mt-4 space-y-3">
              {explainContributions.map((contribution) => (
                <FactorBar
                  key={contribution.feature}
                  feature={contribution.feature}
                  impactDays={contribution.impact_days}
                  maxImpact={maxExplainImpact}
                />
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-border bg-surface-3 px-4 py-4 text-sm text-muted-foreground">
              {l(
                "Détail factoriel non disponible pour cette lecture.",
                "Factor details are unavailable for this reading.",
                "Factor details are unavailable for this reading.",
              )}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-premium">
          <div className="mb-4 flex items-center gap-2">
            <Wrench className="h-4 w-4 text-primary" />
            <div className="section-title">{l("Alertes techniques", "Expert diagnostics", "Expert diagnostics")}</div>
          </div>

          {isLoadingDiagnostics && !diagnostics ? (
            <div className="rounded-xl border border-border bg-surface-3 px-4 py-5 text-sm text-muted-foreground">
              {l("Chargement du diagnostic...", "Loading diagnostics...", "Loading diagnostics...")}
            </div>
          ) : diagnoses.length === 0 ? (
            <div className="rounded-xl border border-success/20 bg-success/5 px-4 py-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <CheckCircle2 className="h-4 w-4 text-success" />
                {l("Aucune alerte technique active", "No active expert alert", "No active expert alert")}
              </div>
              <div className="mt-2 text-sm leading-relaxed text-secondary-foreground">
                {l(
                  "Aucune dérive critique n'est signalée sur cette machine.",
                  "No critical drift is flagged on this machine.",
                  "No critical drift is flagged on this machine.",
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {diagnoses.map((diagnosis) => (
                <DiagnosisItem
                  key={`${diagnosis.code}-${diagnosis.cause}`}
                  title={diagnosis.cause}
                  detail={diagnosis.detail}
                  action={diagnosis.action}
                  severity={diagnosis.severity}
                  refs={diagnosis.refs}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-premium">
          <div className="mb-4 flex items-center gap-2">
            <Gauge className="h-4 w-4 text-primary" />
            <div className="section-title">{l("Mesures récentes", "Recent measurements", "Recent measurements")}</div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <MiniMetric
              label={l("Vibration", "Vibration", "Vibration")}
              value={`${formatNumber(latestSensorPoint?.vib ?? selected.vib, 1)} mm/s`}
            />
            <MiniMetric
              label={
                selected.currSource === "estimated_from_power"
                  ? l("Courant estimé", "Estimated current", "Estimated current")
                  : l("Courant", "Current", "Current")
              }
              value={`${formatNumber(latestSensorPoint?.curr ?? selected.curr, 1)} A`}
            />
            <MiniMetric
              label={l("Température", "Temperature", "Temperature")}
              value={`${formatNumber(latestSensorPoint?.temp ?? selected.temp, 1)} C`}
            />
            <MiniMetric
              label={l("Cycles du jour", "Cycles today", "Cycles today")}
              value={selected.cycles != null ? selected.cycles.toLocaleString(numberLocale) : "-"}
              sub={formatMachineFloorLabel(selected.floors, {
                singular: l("étage", "floor", "floor"),
                plural: l("étages", "floors", "floors"),
                fallback: l("Étages non renseignés", "Floor count unavailable", "Floor count unavailable"),
              })}
            />
          </div>

          {stress && stressMeta ? (
            <div className="mt-4 rounded-xl border border-border bg-surface-3 px-4 py-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[0.68rem] uppercase tracking-[0.18em] text-muted-foreground">
                    {l("Stress machine", "Operational stress", "Operational stress")}
                  </div>
                  <div className={`mt-1 text-2xl font-bold ${stressMeta.tone}`}>
                    {Math.round(stress.value * 100)}%
                  </div>
                </div>
                <div className="text-right text-sm text-muted-foreground">
                  {l("Axe dominant", "Dominant axis", "Dominant axis")}
                  <div className="mt-1 font-semibold text-foreground">
                    {dominantAxisLabel ?? "-"}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-premium">
          <div className="mb-4 flex items-center gap-2">
            <Info className="h-4 w-4 text-primary" />
            <div className="section-title">
              {l("Contrôles terrain", "Field checks", "Field checks")}
            </div>
          </div>

          {cleanedFieldChecks.length > 0 ? (
            <div className="space-y-2">
              {cleanedFieldChecks.slice(0, 3).map((item) => (
                <div
                  key={item}
                  className="rounded-xl border border-border bg-surface-3 px-4 py-3 text-sm leading-relaxed text-secondary-foreground"
                >
                  {item}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-surface-3 px-4 py-4 text-sm leading-relaxed text-secondary-foreground">
              {repairText(
                selectedInsight?.trustNote ||
                  l(
                    "Aucun contrôle supplémentaire publié pour cette machine.",
                    "No extra field check is published for this machine.",
                    "No extra field check is published for this machine.",
                  ),
              )}
            </div>
          )}

          <div className="mt-4">
            <div className="text-[0.68rem] uppercase tracking-[0.18em] text-muted-foreground">
              {l("Contexte", "Context", "Context")}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="rounded-full border border-border bg-surface-3 px-3 py-1 text-xs text-muted-foreground">
              {l("Source", "Source", "Source")}: {dataSourceLabel}
            </span>
            {selectedScenario?.site ? (
              <span className="rounded-full border border-border bg-surface-3 px-3 py-1 text-xs text-muted-foreground">
                {l("Site", "Site", "Site")}: {repairText(selectedScenario.site)}
              </span>
            ) : null}
            {selectedScenario?.cycles_per_day != null ? (
              <span className="rounded-full border border-border bg-surface-3 px-3 py-1 text-xs text-muted-foreground">
                {l("Cycles/jour", "Cycles/day", "Cycles/day")}:{" "}
                {Math.round(selectedScenario.cycles_per_day).toLocaleString(numberLocale)}
              </span>
            ) : null}
            {selectedScenario?.power_avg_30j_kw != null ? (
              <span className="rounded-full border border-border bg-surface-3 px-3 py-1 text-xs text-muted-foreground">
                {l("Puissance moyenne 30 j", "30d avg power", "30d avg power")}:{" "}
                {selectedScenario.power_avg_30j_kw.toLocaleString(numberLocale, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                kW
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
