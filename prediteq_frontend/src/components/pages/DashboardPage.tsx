import { useEffect, useMemo, useState } from "react";
import {
  Heart,
  Clock,
  Activity,
  Play,
  Thermometer,
  Zap,
  Gauge,
  Sparkles,
  CalendarClock,
  ShieldAlert,
  TrendingDown,
  Info,
  ArrowUpRight,
} from "lucide-react";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Area,
  AreaChart,
  ResponsiveContainer,
} from "recharts";
import { useCallback } from "react";
import { KpiCard } from "@/components/industrial/KpiCard";
import { SVGGauge } from "@/components/industrial/SVGGauge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { STATUS_CONFIG } from "@/data/machines";
import { useFleetPredictiveInsights } from "@/hooks/useFleetPredictiveInsights";
import {
  fetchDiagnosticsAll,
  getBearingReference,
  getCalibratedRul,
  getCalibratedRulDisclosures,
  getCalibratedRulWarmupDetail,
  normalizeCalibratedRulMode,
  useDiagnostics,
} from "@/hooks/useDiagnostics";
import { fetchMachineSensorHistory, useMachineSensors } from "@/hooks/useMachineSensors";
import { useMachines } from "@/hooks/useMachines";
import { useSimulatorController } from "@/hooks/useSimulatorController";
import { getDemoScenarioFactors } from "@/lib/demoScenario";
import { inferComponentFocus } from "@/lib/componentInference";
import {
  describeAudienceUsageRegime,
  formatAudienceAxisLabel,
  formatAudienceFeatureLabel,
  shortenAudienceAction,
} from "@/lib/juryNarrative";
import { repairText } from "@/lib/repairText";
import { buildRulDisplay } from "@/lib/rulDisplay";
import { SIMULATOR_ROUTE } from "@/lib/simulator";

const MACHINE_STATUS_KPI_VARIANTS = {
  ok: "green",
  degraded: "warn",
  critical: "danger",
  maintenance: "blue",
} as const;

const KPI_PROGRESS_FILL_CLASS = {
  blue: "bg-primary",
  green: "bg-success",
  warn: "bg-warning",
  danger: "bg-destructive",
} as const;

const DEFAULT_DASHBOARD_MACHINE_ID = "ASC-A1";

function buildSensorWindowTitle(
  spanMinutes: number,
  localize: (fr: string, en: string, ar: string) => string,
) {
  const minutes = Math.max(0, Math.round(spanMinutes));

  if (minutes <= 1) {
    return localize(
      "Capteurs - historique récent",
      "Sensors - recent history",
      "Sensors - recent history",
    );
  }

  if (minutes < 60) {
    return localize(
      `Capteurs - ${minutes} dernières minutes`,
      `Sensors - last ${minutes} minutes`,
      `Sensors - last ${minutes} minutes`,
    );
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) {
    return localize(
      `Capteurs - ${hours} dernières heures`,
      `Sensors - last ${hours} hours`,
      `Sensors - last ${hours} hours`,
    );
  }

  return localize(
    `Capteurs - ${hours} h ${remainingMinutes} min`,
    `Sensors - last ${hours} h ${remainingMinutes} min`,
    `Sensors - last ${hours} h ${remainingMinutes} min`,
  );
}

export function DashboardPage() {
  const { t, lang } = useApp();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    machines,
    error: machinesError,
    isLoading: isLoadingMachines,
    refetch: refetchMachines,
  } = useMachines();
  const { insights, byMachineId, isLoading: isLoadingInsights } = useFleetPredictiveInsights(machines);
  const [isExplainOpen, setIsExplainOpen] = useState(false);
  const [isMachineContextOpen, setIsMachineContextOpen] = useState(false);
  const isAdmin = currentUser?.role === "admin";
  const simulator = useSimulatorController({ lang, refetchMachines });
  const simStatus = simulator.simStatus;
  const l = (fr: string, en: string, ar: string) =>
    repairText(lang === "fr" ? fr : lang === "en" ? en : ar);
  const numberLocale = lang === "fr" ? "fr-FR" : lang === "en" ? "en-GB" : "ar-TN";
  const localizedStressLabels = {
    low: { label: l("Faible", "Low", "Ù…Ù†Ø®ÙØ¶"), tone: "text-success", bar: "bg-success" },
    moderate: { label: l("Modéré", "Moderate", "Ù…ØªÙˆØ³Ø·"), tone: "text-warning", bar: "bg-warning" },
    high: { label: l("Élevé", "High", "Ù…Ø±ØªÙØ¹"), tone: "text-warning", bar: "bg-warning" },
    critical: { label: l("Critique", "Critical", "Ø­Ø±Ø¬"), tone: "text-destructive", bar: "bg-destructive" },
  } as const;
  const localizedStressAxes: Record<string, string> = {
    thermal: l("Temperature", "Temperature", "Ø­Ø±Ø§Ø±Ø©"),
    vibration: l("Vibration", "Vibration", "Ø§Ù‡ØªØ²Ø§Ø²"),
    load: l("Charge", "Load", "Ø­Ù…ÙˆÙ„Ø©"),
    variability: l("Regime instable", "Unstable pattern", "Ù†Ù…Ø· ØºÙŠØ± Ù…Ø³ØªÙ‚Ø±"),
  };
  const localizedConfidenceBadges = {
    high: l("Lecture solide", "Solid reading", "Ù‚Ø±Ø§Ø¡Ø© Ù…ØªÙŠÙ†Ø©"),
    medium: l("Lecture utilisable", "Usable reading", "Ù‚Ø±Ø§Ø¡Ø© Ù‚Ø§Ø¨Ù„Ø© Ù„Ù„Ø§Ø³ØªØ®Ø¯Ø§Ù…"),
    low: l("A confirmer sur site", "Confirm on site", "ÙŠØ¬Ø¨ ØªØ£ÙƒÙŠØ¯Ù‡ Ø¹Ù„Ù‰ Ø§Ù„Ù…ÙˆÙ‚Ø¹"),
  } as const;
  const getReadableFeatureLabel = (feature: string | null | undefined) => {
    if (!feature) {
      return l("Aucun facteur dominant", "No dominant driver", "No dominant driver");
    }
    return formatAudienceFeatureLabel(feature, l);
  };

  const rankedInsights = useMemo(
    () => [...insights].sort((left, right) => right.urgencyScore - left.urgencyScore),
    [insights],
  );
  const machineCodes = useMemo(() => machines.map((machine) => machine.id), [machines]);
  const machineCodesKey = useMemo(() => machineCodes.join("|"), [machineCodes]);
  const requestedMachineId = searchParams.get("machine");
  const preferredMachineId =
    machines.find((machine) => machine.id === DEFAULT_DASHBOARD_MACHINE_ID)?.id ??
    machines.find((machine) => machine.city === "Ben Arous")?.id ??
    "";
  const defaultSelectedId =
    preferredMachineId || rankedInsights[0]?.machine.id || machines[0]?.id || "";
  const selectedId =
    requestedMachineId && machines.some((machine) => machine.id === requestedMachineId)
      ? requestedMachineId
      : defaultSelectedId;
  const selectedRankIndex = rankedInsights.findIndex((insight) => insight.machine.id === selectedId);
  const totalRankedMachines = rankedInsights.length;
  const selectedRank = selectedRankIndex >= 0 ? selectedRankIndex + 1 : null;

  useEffect(() => {
    if (!machineCodesKey) {
      return;
    }

    for (const machineCode of machineCodesKey.split("|").filter(Boolean)) {
      void queryClient.prefetchQuery({
        queryKey: ["diagnostics", "all", machineCode],
        queryFn: () => fetchDiagnosticsAll(machineCode),
        staleTime: 5_000,
      });
      void queryClient.prefetchQuery({
        queryKey: ["machine-sensors", machineCode],
        queryFn: () => fetchMachineSensorHistory(machineCode),
        staleTime: 5_000,
      });
    }
  }, [machineCodesKey, queryClient]);

  useEffect(() => {
    void import("@/components/pages/SimulatorPage");
  }, []);

  useEffect(() => {
    if (!selectedId) {
      return;
    }

    if (requestedMachineId === selectedId) {
      return;
    }

    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set("machine", selectedId);
    setSearchParams(nextSearchParams, { replace: true });
  }, [requestedMachineId, searchParams, selectedId, setSearchParams]);

  const updateSelectedMachine = (machineId: string) => {
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set("machine", machineId);
    setSearchParams(nextSearchParams, { replace: true });
  };

  const openSimulatorControls = useCallback(() => {
    navigate(SIMULATOR_ROUTE);
  }, [navigate]);

  const selected =
    machines.find((machine) => machine.id === selectedId) ??
    machines.find((machine) => machine.id === defaultSelectedId) ??
    machines[0];

  const cfg = selected ? STATUS_CONFIG[selected.status] : STATUS_CONFIG.ok;
  const selectedInsight = selected ? byMachineId[selected.id] : null;
  const selectedPriorityBadge =
    selectedRank != null
      ? l(
          `#${selectedRank}/${Math.max(totalRankedMachines, 1)} flotte`,
          `#${selectedRank}/${Math.max(totalRankedMachines, 1)} fleet`,
          `#${selectedRank}/${Math.max(totalRankedMachines, 1)} fleet`,
        )
      : null;
  const { data: diagnostics, isLoading: isLoadingDiagnostics } = useDiagnostics(selected?.id);

  const {
    history: sensorHistory,
    latest: latestSensorPoint,
    spanMinutes: sensorSpanMinutes,
    isLoading: isLoadingSensors,
  } = useMachineSensors(selected?.id);

  const selectedDecision = selected?.decision ?? null;
  const calibratedRul = getCalibratedRul(diagnostics);
  const bearingReference = getBearingReference(calibratedRul);
  const calibratedDisclosures = getCalibratedRulDisclosures(calibratedRul);
  const calibratedWarmupDetail = getCalibratedRulWarmupDetail(calibratedRul);
  const predictionMode = normalizeCalibratedRulMode(
    calibratedRul?.mode ?? selectedInsight?.predictionMode ?? selected?.rulMode ?? null,
  );
  const prediction = calibratedRul?.prediction ?? null;
  const stress = diagnostics?.stress_index ?? null;
  const maintenanceWindow =
    selectedInsight?.maintenanceWindow ??
    selectedDecision?.maintenanceWindow ??
    calibratedRul?.maintenance_window ??
    prediction?.maintenance_window ??
    null;
  const topDriverName =
    diagnostics?.rul_explain?.contributions?.[0]?.feature ??
    selectedInsight?.topDriver ??
    selectedDecision?.topDriver ??
    null;
  const topDriverLabel = topDriverName ? formatAudienceFeatureLabel(topDriverName, l) : null;
  const dominantAxis =
    stress?.dominant ?? selectedInsight?.dominantAxis ?? selectedDecision?.dominantAxis ?? null;
  const stressBand = stress?.band ?? selectedInsight?.stressBand ?? selectedDecision?.stressBand ?? null;
  const stressValue =
    stress?.value ?? selectedInsight?.stressValue ?? selectedDecision?.stressValue ?? null;
  const stressStyle = stressBand ? localizedStressLabels[stressBand] : null;
  const confidenceLevel =
    prediction?.confidence ?? selectedInsight?.confidence ?? selectedDecision?.confidence ?? null;
  const confidenceLabel = confidenceLevel ? localizedConfidenceBadges[confidenceLevel] : null;
  const explainContributions = [...(diagnostics?.rul_explain?.contributions ?? [])]
    .sort((left, right) => Math.abs(right.impact_days) - Math.abs(left.impact_days))
    .slice(0, 5)
    .map((contribution) => ({
      ...contribution,
      feature: formatAudienceFeatureLabel(contribution.feature, l),
    }));
  const maxExplainImpact = Math.max(
    1,
    ...explainContributions.map((contribution) => Math.abs(contribution.impact_days)),
  );

  const liveSensors = selected
    ? {
        vib: latestSensorPoint?.vib ?? selected.vib,
        curr: latestSensorPoint?.curr ?? selected.curr,
        temp: latestSensorPoint?.temp ?? selected.temp,
      }
    : null;
  const sensorWindowTitle = buildSensorWindowTitle(sensorSpanMinutes, l);

  const rulDisplay = buildRulDisplay({
    machine: selected,
    predictionMode,
    prediction,
    referenceLifetimeYears: bearingReference?.years_adjusted ?? null,
    localize: l,
  });
  const selectedRulValue = rulDisplay.value;
  const rulSub = rulDisplay.sub;
  const hasLivePrediction = predictionMode === "prediction" && Boolean(prediction);
  const isReferenceMode =
    predictionMode === "reference_only" || rulDisplay.source === "reference_lifetime";
  const explainDialogTitle = hasLivePrediction
    ? l("Détail du pronostic", "Prognosis details", "Prognosis details")
    : isReferenceMode
      ? l("Détail de la référence", "Reference details", "Reference details")
      : l("Préparation du pronostic", "Prognosis warm-up", "Prognosis warm-up");
  const explainDialogDescription = hasLivePrediction
    ? l(
        "Facteurs qui influencent le pronostic et la priorité d'intervention.",
        "Factors influencing the prognosis and intervention priority.",
        "Factors influencing the prognosis and intervention priority.",
      )
    : isReferenceMode
      ? l(
          "Repères conservés lorsque le pronostic live n'est pas encore disponible.",
          "Signals retained when the live prognosis is not available yet.",
          "Signals retained when the live prognosis is not available yet.",
        )
      : l(
          "Repères utilisés pour préparer la première lecture RUL fiable.",
          "Signals used to prepare the first reliable RUL reading.",
          "Signals used to prepare the first reliable RUL reading.",
        );
  const explainPrimaryLabel = hasLivePrediction
    ? l("Pronostic live", "Live prognosis", "Live prognosis")
    : isReferenceMode
      ? l("Référence courante", "Current reference", "Current reference")
      : l("Référence provisoire", "Provisional reference", "Provisional reference");
  const explainPrimarySub = hasLivePrediction
    ? maintenanceWindow ??
      l(
        "Fenêtre de maintenance non disponible",
        "Maintenance window unavailable",
        "Maintenance window unavailable",
      )
    : rulSub;
  const explainStatusLabel = hasLivePrediction
    ? l("Confiance", "Confidence", "Confidence")
    : l("Statut du pronostic", "Prognosis status", "Prognosis status");
  const explainStatusValue = hasLivePrediction
    ? confidenceLabel ?? l("En évaluation", "Under evaluation", "Under evaluation")
    : isReferenceMode
      ? l("Référence stable", "Stable reference", "Stable reference")
      : l("Calibration en cours", "Calibration in progress", "Calibration in progress");
  const explainStatusSub = repairText(
    hasLivePrediction
      ? `${prediction?.display_interval_label ?? "IC 80 %"} ${
          prediction?.rul_days_display_low ?? prediction?.rul_days_p10 ?? "-"
        }-${prediction?.rul_days_display_high ?? prediction?.rul_days_p90 ?? "-"} j`
      : isReferenceMode
        ? calibratedDisclosures.availability_note ??
          selectedInsight?.trustNote ??
          l(
            "Le tableau conserve une référence stable tant que le pronostic live n'est pas exploitable.",
            "The dashboard keeps a stable reference while the live prognosis is not usable yet.",
            "The dashboard keeps a stable reference while the live prognosis is not usable yet.",
          )
        : calibratedWarmupDetail ??
          calibratedDisclosures.warmup_note ??
          selectedInsight?.trustNote ??
          l(
            "Le pipeline collecte encore assez d'historique pour fiabiliser le premier RUL live.",
            "The pipeline is still collecting enough history to stabilize the first live RUL.",
            "The pipeline is still collecting enough history to stabilize the first live RUL.",
          ),
  );
  const explainFactorsTitle = hasLivePrediction
    ? l(
        "Éléments qui influencent le pronostic",
        "Elements driving the prognosis",
        "Elements driving the prognosis",
      )
    : l(
        "Variables actuellement suivies",
        "Variables currently monitored",
        "Variables currently monitored",
      );
  const explainFactorsDescription = hasLivePrediction
    ? l(
        "Chaque facteur ajoute ou retire des jours par rapport à la tendance moyenne du modèle.",
        "Each factor adds or removes days relative to the model's average trend.",
        "Each factor adds or removes days relative to the model's average trend.",
      )
    : isReferenceMode
      ? l(
          "Ces facteurs continuent d'orienter la projection interne du modèle, même si l'interface garde encore une référence stable.",
          "These factors still drive the model's internal projection even while the interface keeps a stable reference.",
          "These factors still drive the model's internal projection even while the interface keeps a stable reference.",
        )
      : l(
          "Ces facteurs serviront à stabiliser la première lecture live dès que l'historique sera suffisant.",
          "These factors will stabilize the first live reading once enough history is available.",
          "These factors will stabilize the first live reading once enough history is available.",
        );
  const explainEmptyText = hasLivePrediction
    ? l(
        "Le détail des facteurs du modèle n'est pas disponible pour cette lecture.",
        "Model factor details are unavailable for this reading.",
        "Model factor details are unavailable for this reading.",
      )
    : l(
        "Le détail des variables suivies n'est pas disponible pour cette lecture.",
        "Tracked-variable details are unavailable for this reading.",
        "Tracked-variable details are unavailable for this reading.",
      );
  const explainFooterText = repairText(
    hasLivePrediction
      ? selectedInsight?.summary ??
          l(
            "La priorite combine duree restante, santé observée, pression actuelle et contexte d'usage pour aider la decision terrain.",
            "Priority combines remaining life, observed health, current pressure, and usage context to support field decisions.",
            "Priority combines remaining life, observed health, current pressure, and usage context to support field decisions.",
          )
      : isReferenceMode
        ? calibratedDisclosures.availability_note ??
          selectedInsight?.trustNote ??
          l(
            "Le dashboard conserve ici une référence stable tant que le pronostic live n'est pas encore disponible.",
            "The dashboard keeps a stable reference here while the live prognosis is not available yet.",
            "The dashboard keeps a stable reference here while the live prognosis is not available yet.",
          )
        : calibratedWarmupDetail ??
          calibratedDisclosures.warmup_note ??
          selectedInsight?.trustNote ??
          l(
            "La lecture reste en préparation pendant que le pipeline consolide suffisamment d'historique.",
            "The reading stays in warm-up while the pipeline consolidates enough history.",
            "The reading stays in warm-up while the pipeline consolidates enough history.",
          ),
  );

  if (machinesError) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="text-sm font-semibold text-foreground">
            {l(
              "Le tableau de bord n'a pas pu charger les machines.",
              "The dashboard could not load the machines.",
              "تعذر على لوحة القيادة تحميل الآلات.",
            )}
          </div>
          <div className="mt-2 text-sm text-muted-foreground">
            {(machinesError as Error).message ||
              l(
                "Vérifiez le flux backend puis rechargez la vue.",
                "Check the backend feed and reload the view.",
                "تحقق من تدفق الخلفية ثم أعد تحميل الصفحة.",
              )}
          </div>
          <Button
            type="button"
            variant="outline"
            className="mt-4 rounded-xl"
            onClick={() => void refetchMachines()}
          >
            {l("Recharger", "Reload", "إعادة التحميل")}
          </Button>
        </div>
      </div>
    );
  }

  if (!selected && isLoadingMachines) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          {l(
            "Chargement du tableau de bord...",
            "Loading dashboard...",
            "جاري تحميل لوحة القيادة...",
          )}
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
            "No machine is available at the moment.",
            "لا توجد آلة متاحة حاليا.",
          )}
        </div>
      </div>
    );
  }

  const dominantAxisLabel = dominantAxis ? formatAudienceAxisLabel(dominantAxis, l) : null;
  const dataSourceLabel =
    selectedInsight?.dataSource === "live_runtime"
      ? l("Flux en direct", "Live stream", "Flux en direct")
      : selectedInsight?.dataSource === "simulator_demo"
        ? l("Replay démo calibré", "Calibrated demo replay", "Replay démo calibré")
        : selectedInsight?.dataSource === "persisted_reference"
          ? l("Référence persistée", "Reference snapshot", "Référence persistée")
          : l("Flux en attente", "Waiting for stream", "Flux en attente");
  const isDemoReplay = selectedInsight?.dataSource === "simulator_demo";
  const demoPipelineNote = l(
    "Lecture issue d'un replay demo calibre. En exploitation reelle, la meme chaine utilisera les vraies mesures vibration, puissance, temperature et humidite.",
    "This reading comes from a calibrated demo replay. In real operation, the same pipeline will use live vibration, power, temperature, and humidity signals.",
    "This reading comes from a calibrated demo replay. In real operation, the same pipeline will use live vibration, power, temperature, and humidity signals.",
  );
  const freshnessLabel =
    selectedInsight?.updatedAt != null
      ? new Date(selectedInsight.updatedAt).toLocaleString(numberLocale, {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : l("Lecture non reçue", "No reading yet", "Lecture non reçue");
  const componentDiagnoses = (
    diagnostics?.diagnose?.diagnoses ??
    (Array.isArray(selectedDecision?.diagnoses) ? selectedDecision.diagnoses : [])
  ).map((diagnosis) => {
    const payload = diagnosis as Record<string, unknown>;
    return {
      code: typeof payload.code === "string" ? payload.code : null,
      cause: typeof payload.cause === "string" ? payload.cause : null,
      detail: typeof payload.detail === "string" ? payload.detail : null,
      action: typeof payload.action === "string" ? payload.action : null,
      severity: typeof payload.severity === "string" ? payload.severity : null,
    };
  });
  const componentFocus = inferComponentFocus(
    {
      diagnoses: componentDiagnoses,
      dominantAxis,
      topDriver: topDriverName,
    },
    l,
  );
  const quickActionLabel = repairText(
    selectedInsight?.recommendedAction ??
      maintenanceWindow ??
      l(
        "Confirmer la lecture terrain avant d'engager une action lourde.",
        "Confirm the field reading before launching heavy work.",
        "Confirm the field reading before launching heavy work.",
      ),
  );
  const priorityTriggerLabel = repairText(
    componentFocus.primarySignal || getReadableFeatureLabel(topDriverName),
  );
  const selectedHiPercent =
    typeof selected.hi === "number"
      ? Math.max(0, Math.min(100, Math.round(selected.hi * 100)))
      : null;
  const machineKpiVariant = MACHINE_STATUS_KPI_VARIANTS[selected.status];
  const machineKpiProgressFillClass = KPI_PROGRESS_FILL_CLASS[machineKpiVariant];
  const stressKpiSub = stressStyle
    ? dominantAxisLabel
      ? `${stressStyle.label} - ${dominantAxisLabel}`
      : stressStyle.label
    : l("Stress indisponible", "Stress unavailable", "Stress unavailable");
  const hiCardDescription = l(
    "Etat de sante cumule observe sur l'historique recent.",
    "Observed cumulative health state across recent history.",
    "Observed cumulative health state across recent history.",
  );
  const hiCardSub = `${l("Lecture actuelle", "Current reading", "Current reading")}: ${cfg.label}`;
  const rulCardDescription = hasLivePrediction
    ? l(
        "Marge restante estimee par le modele a partir de la derive observee.",
        "Remaining margin estimated by the model from the observed drift.",
        "Remaining margin estimated by the model from the observed drift.",
      )
    : isReferenceMode
      ? l(
          "Reference de duree de vie affichee seulement quand le pronostic live n'est pas encore disponible.",
          "Lifetime reference shown only when the live prognosis is not available yet.",
          "Lifetime reference shown only when the live prognosis is not available yet.",
        )
      : l(
          "Lecture de duree de vie en preparation pendant la phase de calibration.",
          "Lifetime reading still warming up during calibration.",
          "Lifetime reading still warming up during calibration.",
        );
  const stressCardDescription = l(
    "Pression instantanee du regime d'exploitation.",
    "Instant pressure of the current operating regime.",
    "Instant pressure of the current operating regime.",
  );
  const zoneCardDescription = l(
    "Premiere cible de controle issue des signaux dominants et des regles expertes.",
    "First inspection target derived from dominant signals and expert rules.",
    "First inspection target derived from dominant signals and expert rules.",
  );
  const dashboardTrustNote = l(
    "Lecture a confirmer sur le terrain avant toute intervention lourde ou arret machine.",
    "Reading to confirm in the field before any major intervention or machine stop.",
    "Reading to confirm in the field before any major intervention or machine stop.",
  );
  const selectedScenario = selected.demoScenario ?? null;
  const localizedScenarioUsageCase =
    {
      "ASC-A1": l(
        "Cycle modere, charges legeres et installation protegee.",
        "Moderate duty cycle, light payloads, protected installation.",
        "Moderate duty cycle, light payloads, protected installation.",
      ),
      "ASC-B2": l(
        "Trafic mixte regulier avec demi-charges et pics aux heures de pointe.",
        "Regular mixed traffic with half-load cycles and rush-hour peaks.",
        "Regular mixed traffic with half-load cycles and rush-hour peaks.",
      ),
      "ASC-C3": l(
        "Ligne intensive avec charges lourdes et ambiance plus severe.",
        "Intensive duty line with heavy payloads and harsh ambient conditions.",
        "Intensive duty line with heavy payloads and harsh ambient conditions.",
      ),
    }[selected.id] ??
    repairText(
      selectedScenario?.usage_case ??
        l(
          "Contexte d'exploitation non detaille pour cette machine.",
          "Operating context is not detailed for this machine.",
          "Operating context is not detailed for this machine.",
        ),
    );
  const localizedScenarioExplanation =
    {
      "ASC-A1": l(
        "Meme generation de flotte, mais usage plus calme : service plus court, charges plus legeres, ambiance plus seche et presque aucune surcharge.",
        "Same fleet generation, but calmer use: shorter duty, lighter baskets, drier surroundings, and almost no overload history.",
        "Same fleet generation, but calmer use: shorter duty, lighter baskets, drier surroundings, and almost no overload history.",
      ),
      "ASC-B2": l(
        "Meme age que les autres, avec un rythme normal, des charges mixtes et un stress ambiant modere.",
        "Same age as the others, with a normal service rhythm, mixed payloads, and moderate environmental stress.",
        "Same age as the others, with a normal service rhythm, mixed payloads, and moderate environmental stress.",
      ),
      "ASC-C3": l(
        "Meme age de flotte, mais usage plus dur : longues amplitudes, charges proches du maximum, ambiance plus chaude et humide, vibration plus marquee.",
        "Same fleet age, but a harsher life: longer operating spans, near-max payloads, hotter and more humid surroundings, and stronger vibration drift.",
        "Same fleet age, but a harsher life: longer operating spans, near-max payloads, hotter and more humid surroundings, and stronger vibration drift.",
      ),
    }[selected.id] ??
    repairText(
      selectedScenario?.explanation ??
        selectedDecision?.technicalStory ??
        l(
          "Cette vue decrit le regime d'usage et les contraintes qui alimentent la lecture du dashboard.",
          "This panel describes the operating regime and constraints feeding the dashboard reading.",
          "This panel describes the operating regime and constraints feeding the dashboard reading.",
        ),
    );
  const scenarioProfileLabel =
    {
      A_linear: l("Lineaire progressive", "Progressive linear", "Progressive linear"),
      B_quadratic: l("Quadratique", "Quadratic", "Quadratic"),
      C_stepwise: l("Par paliers", "Stepwise", "Stepwise"),
      D_noisy_linear: l("Lineaire bruitee", "Noisy linear", "Noisy linear"),
    }[selectedScenario?.profile ?? ""] ?? repairText(selectedScenario?.profile ?? l("Indisponible", "Unavailable", "Unavailable"));
  const scenarioLoadPatternLabel =
    {
      light_to_medium: l(
        "Charges legeres a moyennes",
        "Light-to-medium loads",
        "Light-to-medium loads",
      ),
      mixed_half_load: l(
        "Demi-charge recurrente",
        "Recurring half-load cycles",
        "Recurring half-load cycles",
      ),
      heavy_near_max: l(
        "Charges lourdes proches du maximum",
        "Heavy near-max loads",
        "Heavy near-max loads",
      ),
    }[selectedScenario?.load_pattern ?? ""] ??
    (selectedScenario?.load_band_kg
      ? `${selectedScenario.load_band_kg[0]}-${selectedScenario.load_band_kg[1]} kg`
      : l("Charge non detaillee", "Load not detailed", "Load not detailed"));
  const typicalLoadKg =
    typeof selectedScenario?.base_load_kg === "number"
      ? selectedScenario.base_load_kg
      : selectedScenario?.load_band_kg
        ? Math.round((selectedScenario.load_band_kg[0] + selectedScenario.load_band_kg[1]) / 2)
        : null;
  const describeScenarioLevel = (value?: number | null) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return l("Indisponible", "Unavailable", "Unavailable");
    }
    if (value < 0.2) return l("Tres faible", "Very low", "Very low");
    if (value < 0.4) return l("Faible", "Low", "Low");
    if (value < 0.65) return l("Moderee", "Moderate", "Moderate");
    if (value < 0.8) return l("Elevee", "High", "High");
    return l("Tres elevee", "Very high", "Very high");
  };
  const describeCadence = (cycles?: number | null) => {
    if (typeof cycles !== "number" || !Number.isFinite(cycles)) {
      return l("Cadence non detaillee", "Cadence not detailed", "Cadence not detailed");
    }
    if (cycles >= 550) return l("Trafic soutenu sur la journee", "Sustained traffic during the day", "Sustained traffic during the day");
    if (cycles >= 420) return l("Cadence reguliere avec charge moderee", "Regular cadence with moderate load", "Regular cadence with moderate load");
    return l("Cadence plus faible mais cycles plus exigeants", "Lower cadence but more demanding cycles", "Lower cadence but more demanding cycles");
  };
  const ambientSummary = (() => {
    const thermal = selectedScenario?.thermal_stress;
    const humidity = selectedScenario?.humidity_stress;
    if (typeof thermal !== "number" && typeof humidity !== "number") {
      return l("Ambiance non detaillee", "Environment not detailed", "Environment not detailed");
    }
    const thermalPart =
      typeof thermal === "number"
        ? thermal < 0.3
          ? l("plutot fraiche", "rather cool", "rather cool")
          : thermal < 0.6
            ? l("moderee", "moderate", "moderate")
            : l("plus chaude", "warmer", "warmer")
        : l("neutre", "neutral", "neutral");
    const humidityPart =
      typeof humidity === "number"
        ? humidity < 0.3
          ? l("peu humide", "low humidity", "low humidity")
          : humidity < 0.6
            ? l("humidité moderee", "moderate humidity", "moderate humidity")
            : l("humidité elevee", "high humidity", "high humidity")
        : l("humidite neutre", "neutral humidity", "neutral humidity");
    return `${thermalPart}, ${humidityPart}`;
  })();
  const contextOverviewCards = [
    {
      label: l("Cadence d'usage", "Usage cadence", "Usage cadence"),
      value:
        selectedScenario?.cycles_per_day != null
          ? `${Math.round(selectedScenario.cycles_per_day).toLocaleString(numberLocale)} ${l("cycles/jour", "cycles/day", "cycles/day")}`
          : l("Indisponible", "Unavailable", "Unavailable"),
      detail: describeCadence(selectedScenario?.cycles_per_day),
    },
    {
      label: l("Charges habituelles", "Typical loads", "Typical loads"),
      value: scenarioLoadPatternLabel,
      detail: selectedScenario?.load_band_kg
        ? `${selectedScenario.load_band_kg[0]}-${selectedScenario.load_band_kg[1]} kg`
        : l("Plage non detaillee", "Range not detailed", "Range not detailed"),
    },
    {
      label: l("Charge typique", "Typical payload", "Typical payload"),
      value:
        typeof typicalLoadKg === "number"
          ? `${Math.round(typicalLoadKg)} kg`
          : l("Indisponible", "Unavailable", "Unavailable"),
      detail: l(
        "Point d'appui moyen du scenario",
        "Average anchor point of the scenario",
        "Average anchor point of the scenario",
      ),
    },
    {
      label: l("Profil d'usure", "Wear profile", "Wear profile"),
      value: scenarioProfileLabel,
      detail: l(
        "Forme de degradation retenue par le simulateur",
        "Degradation shape used by the simulator",
        "Degradation shape used by the simulator",
      ),
    },
    {
      label: l("Ambiance", "Environment", "Environment"),
      value: ambientSummary,
      detail: l(
        "Contrainte thermique et humidite du scenario",
        "Thermal and humidity constraints of the scenario",
        "Thermal and humidity constraints of the scenario",
      ),
    },
    {
      label: l("Puissance moyenne 30 j", "30-day average power", "30-day average power"),
      value:
        typeof selectedScenario?.power_avg_30j_kw === "number"
          ? `${selectedScenario.power_avg_30j_kw.toFixed(2)} kW`
          : l("Indisponible", "Unavailable", "Unavailable"),
      detail: l(
        "Repere energetique du profil simule",
        "Energy cue of the simulated profile",
        "Energy cue of the simulated profile",
      ),
    },
  ];
  const contextFactorRows = getDemoScenarioFactors(selectedScenario).map((factor) => {
    const meta = {
      usage_intensity: {
        label: l("Intensite d'usage", "Usage intensity", "Usage intensity"),
        hint: l("Frequence et repetitivite des trajets", "Trip frequency and repetition", "Trip frequency and repetition"),
        bar: "bg-primary",
      },
      wear_level: {
        label: l("Usure cumulee", "Wear level", "Wear level"),
        hint: l("Vieillissement structurel de la machine", "Structural aging of the machine", "Structural aging of the machine"),
        bar: "bg-warning",
      },
      thermal_stress: {
        label: l("Stress thermique", "Thermal stress", "Thermal stress"),
        hint: l("Effort thermique moteur et ambiance", "Motor and ambient thermal strain", "Motor and ambient thermal strain"),
        bar: "bg-destructive",
      },
      humidity_stress: {
        label: l("Stress humidite", "Humidity stress", "Humidity stress"),
        hint: l("Sensibilite a l'ambiance humide", "Exposure to humid environment", "Exposure to humid environment"),
        bar: "bg-sky-500",
      },
      load_variability: {
        label: l("Variabilite de charge", "Load variability", "Load variability"),
        hint: l("Ecart entre cycles legers et cycles charges", "Spread between light and loaded cycles", "Spread between light and loaded cycles"),
        bar: "bg-amber-500",
      },
      overload_bias: {
        label: l("Exposition surcharge", "Overload exposure", "Overload exposure"),
        hint: l("Frequence des charges proches de la limite", "Frequency of near-limit payloads", "Frequency of near-limit payloads"),
        bar: "bg-rose-500",
      },
    }[factor.key];
    return {
      ...meta,
      value: factor.value,
      percent: Math.round(factor.value * 100),
      level: describeScenarioLevel(factor.value),
    };
  });
  const hiContextExplanation =
    typeof selectedScenario?.wear_level === "number"
      ? selectedScenario.wear_level < 0.25
        ? l(
            "Usure faible, peu de surcharge et profil progressif : le HI reste naturellement plus confortable.",
            "Low wear, limited overload, and a progressive profile keep the HI naturally comfortable.",
            "Low wear, limited overload, and a progressive profile keep the HI naturally comfortable.",
          )
        : selectedScenario.wear_level < 0.6
          ? l(
              "Usure deja installee et charges plus soutenues : le HI descend plus vite et demande davantage de suivi.",
              "Installed wear and heavier loads make the HI decline faster and require closer follow-up.",
              "Installed wear and heavier loads make the HI decline faster and require closer follow-up.",
            )
          : l(
              "Usure elevee et contraintes cumulees : l'historique de sante est tire vers le bas.",
              "High wear and accumulated constraints drag the health history down.",
              "High wear and accumulated constraints drag the health history down.",
            )
      : l(
          "Le HI reflète surtout l'usure cumulee et l'historique d'exploitation.",
          "The HI mostly reflects accumulated wear and operating history.",
          "The HI mostly reflects accumulated wear and operating history.",
        );
  const stressContextExplanation =
    typeof selectedScenario?.load_variability === "number" ||
    typeof selectedScenario?.thermal_stress === "number" ||
    typeof selectedScenario?.usage_intensity === "number"
      ? selectedScenario && selectedScenario.load_variability != null && selectedScenario.load_variability >= 0.6
        ? l(
            "La variabilite de charge du scenario tire davantage la lecture de stress que la cadence seule.",
            "Load variability drives the stress reading more than cadence alone.",
            "Load variability drives the stress reading more than cadence alone.",
          )
        : selectedScenario && selectedScenario.thermal_stress != null && selectedScenario.thermal_stress >= 0.6
          ? l(
              "Les contraintes thermiques du scenario poussent la lecture de stress a la hausse.",
              "Thermal constraints in the scenario push the stress reading upward.",
              "Thermal constraints in the scenario push the stress reading upward.",
            )
          : l(
              "La cadence et les charges du scenario restent maitrisees, ce qui contient la lecture de stress.",
              "Cadence and loads stay controlled in the scenario, which contains the stress reading.",
              "Cadence and loads stay controlled in the scenario, which contains the stress reading.",
            )
      : l(
          "Le stress depend d'abord du regime instantane, de la variabilite et de l'ambiance.",
          "Stress mainly depends on the instantaneous regime, variability, and environment.",
          "Stress mainly depends on the instantaneous regime, variability, and environment.",
        );
  const rulContextExplanation = hasLivePrediction
    ? l(
        "L'historique fournit assez de derive observable pour que le systeme publie une marge restante exploitable.",
        "History provides enough observable drift for the system to publish a usable remaining-life estimate.",
        "History provides enough observable drift for the system to publish a usable remaining-life estimate.",
      )
    : isReferenceMode
      ? selectedScenario?.reference_rul_days
        ? l(
            `Le scenario garde une reference de ${Math.round(selectedScenario.reference_rul_days)} jours tant que la derive n'autorise pas encore un RUL live.`,
            `The scenario keeps a ${Math.round(selectedScenario.reference_rul_days)}-day reference while drift is still insufficient for a live RUL.`,
            `The scenario keeps a ${Math.round(selectedScenario.reference_rul_days)}-day reference while drift is still insufficient for a live RUL.`,
          )
        : l(
            "Le systeme conserve une reference simple tant qu'aucune derive robuste n'impose un RUL live.",
            "The system keeps a simple reference while no robust drift justifies a live RUL.",
            "The system keeps a simple reference while no robust drift justifies a live RUL.",
          )
      : l(
          "Le pipeline consolide encore assez d'historique avant de publier une premiere lecture RUL fiable.",
          "The pipeline is still consolidating enough history before publishing a first reliable RUL reading.",
          "The pipeline is still consolidating enough history before publishing a first reliable RUL reading.",
        );
  const zoneContextExplanation = l(
    "La zone a verifier du dashboard ne vient pas du contexte seul : elle combine ce contexte d'usage avec les signaux techniques recents et les regles expertes.",
    "The inspection target on the dashboard does not come from context alone: it combines operating context with recent technical signals and expert rules.",
    "The inspection target on the dashboard does not come from context alone: it combines operating context with recent technical signals and expert rules.",
  );
  const dashboardLinkCards = [
    {
      label: "HI",
      text: hiContextExplanation,
    },
    {
      label: "Stress",
      text: stressContextExplanation,
    },
    {
      label: "RUL",
      text: rulContextExplanation,
    },
    {
      label: l("Zone a verifier", "Inspection target", "Inspection target"),
      text: zoneContextExplanation,
    },
  ];
  const usageRegimeLabel = describeAudienceUsageRegime(selectedScenario, l);
  const sameFleetPrefix = l(
    "Meme age de flotte, mais",
    "Same fleet age, but",
    "Same fleet age, but",
  );
  const dashboardActionLead = shortenAudienceAction(
    quickActionLabel,
    componentFocus.familyLabel,
    l,
  );
  const dashboardSignalLabel = topDriverLabel ?? priorityTriggerLabel;
  const dashboardReadingLabel = prediction?.hi_zone ?? selectedDecision?.zone ?? cfg.label;
  const dashboardContextLabel =
    selectedScenario?.cycles_per_day != null
      ? `${Math.round(selectedScenario.cycles_per_day).toLocaleString(numberLocale)} ${l("cycles/jour", "cycles/day", "cycles/day")} - ${usageRegimeLabel}`
      : usageRegimeLabel;
  const dashboardActionReason =
    selected.status === "critical"
      ? `${sameFleetPrefix} ${usageRegimeLabel.toLowerCase()}: ${dashboardSignalLabel.toLowerCase()} oriente d'abord le controle vers ${componentFocus.familyLabel.toLowerCase()} et la marge restante est courte.`
      : selected.status === "degraded"
        ? `${sameFleetPrefix} ${usageRegimeLabel.toLowerCase()}: ${dashboardSignalLabel.toLowerCase()} reduit progressivement la marge et demande un controle cible.`
        : `${sameFleetPrefix} ${usageRegimeLabel.toLowerCase()}: les signaux restent compatibles avec une exploitation normale.`;
  const machineContextIntro = l(
    "Cette vue expose le regime d'usage, les contraintes du scenario et la part de contexte qui alimente les resultats du dashboard.",
    "This panel exposes the operating regime, scenario constraints, and the context contribution behind dashboard results.",
    "This panel exposes the operating regime, scenario constraints, and the context contribution behind dashboard results.",
  );
  const diagnosticButtonClass =
    "group rounded-full border border-primary/20 bg-primary text-primary-foreground shadow-[0_18px_42px_-24px_rgba(15,118,110,0.78)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-primary/92 hover:shadow-[0_24px_52px_-24px_rgba(15,118,110,0.88)]";
  const detailsButtonWideClass =
    "group w-full rounded-xl border border-primary/20 bg-primary/10 text-primary shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/35 hover:bg-primary/14 hover:text-primary";

  const sensorCards = [
    {
      dataKey: "vib" as const,
      label: t("modal.vibration"),
      color: "#4b8b9b",
      value: liveSensors?.vib ?? null,
      max: 15,
      unit: "mm/s",
      icon: <Activity className="w-4 h-4" />,
    },
    {
      dataKey: "curr" as const,
      label:
        selected.currSource === "derived_ascent_power"
          ? l("Courant de montée", "Ascent current", "Ascent current")
          : selected.currSource === "estimated_from_power"
            ? l("Courant estimé", "Estimated current", "Estimated current")
          : t("modal.current"),
      color: "#d4915a",
      value: liveSensors?.curr ?? null,
      max: 10,
      unit: "A",
      icon: <Zap className="w-4 h-4" />,
    },
    {
      dataKey: "temp" as const,
      label: t("modal.temperature"),
      color: "#c75c5c",
      value: liveSensors?.temp ?? null,
      max: 100,
      unit: "C",
      icon: <Thermometer className="w-4 h-4" />,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-premium">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <div className="section-title">{l("Mode démo", "Demo mode", "ÙˆØ¶Ø¹ Ø§Ù„Ø¹Ø±Ø¶")}</div>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {l(
                "Lancez ici le replay demo calibre. Le simulateur alimente ensuite le tableau de bord, les diagnostics et les alertes avec la meme logique que celle prevue sur mesures reelles.",
                "Launch the calibrated demo replay here. The simulator then feeds the dashboard, diagnostics, and alerts with the same logic planned for real measurements.",
                "Launch the calibrated demo replay here. The simulator then feeds the dashboard, diagnostics, and alerts with the same logic planned for real measurements.",
              )}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span
                className={`rounded-full px-2.5 py-1 font-semibold ${
                  simulator.isActive
                    ? "bg-success/10 text-success"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {simulator.isActive
                  ? l("Démo en cours", "Demo running", "Ø§Ù„Ø¹Ø±Ø¶ Ù‚ÙŠØ¯ Ø§Ù„ØªØ´ØºÙŠÙ„")
                  : l("Démo arrêtée", "Demo stopped", "Ø§Ù„Ø¹Ø±Ø¶ Ù…ØªÙˆÙ‚Ù")}
              </span>
              <span className="rounded-full bg-surface-3 px-2.5 py-1 text-muted-foreground">
                {l("Pas", "Tick", "Ø§Ù„Ø®Ø·ÙˆØ©")}: {simStatus?.tick ?? 0}
              </span>
              <span className="rounded-full bg-surface-3 px-2.5 py-1 text-muted-foreground">
                {l("Vitesse", "Speed", "Ø§Ù„Ø³Ø±Ø¹Ø©")}: x{simStatus?.speed ?? 60}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && (
              <>
                <Button
                  type="button"
                  onClick={() => void simulator.startSimulation({ speed: 60 })}
                  disabled={simulator.isStartLocked}
                  aria-pressed={simulator.isActive}
                  variant={simulator.isStartLocked ? "outline" : "default"}
                  className={`rounded-full ${
                    simulator.isStartLocked
                      ? "border-primary/20 bg-primary/10 text-primary shadow-none disabled:opacity-100"
                      : ""
                  }`}
                >
                  <Play className="h-4 w-4" />
                  {simulator.isStarting
                    ? l("Démarrage...", "Starting...", "جاري التشغيل...")
                    : simulator.isActive
                      ? l("Simulation lancée", "Simulation running", "المحاكاة قيد التشغيل")
                      : l(
                          "Lancer le simulateur",
                          "Launch simulator",
                          "شغّل المحاكي",
                        )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={openSimulatorControls}
                >
                  {l(
                    "Contrôles avancés",
                    "Advanced controls",
                    "Ø¹Ù†Ø§ØµØ± Ø§Ù„ØªØ­ÙƒÙ… Ø§Ù„Ù…ØªÙ‚Ø¯Ù…Ø©",
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
        {isAdmin && (
          <div
            className={`mt-3 text-xs font-medium ${
              simulator.isStarting || simulator.isActive
                ? "text-primary"
                : simulator.resetRequested
                  ? "text-amber-700"
                  : "text-muted-foreground"
            }`}
          >
            {simulator.isStarting
              ? l(
                  "Initialisation en cours : le flux démo se verrouille pendant le démarrage.",
                  "Initialization in progress: the demo flow stays locked while the simulator starts.",
                  "Initialization in progress: the demo flow stays locked while the simulator starts.",
                )
              : simulator.isActive
                ? l(
                    "Simulation en cours : le lancement reste verrouillé jusqu'à la pause ou la fin.",
                    "Simulation running: start stays locked until pause or completion.",
                    "Simulation running: start stays locked until pause or completion.",
                  )
                : simulator.resetRequested
                  ? l(
                      "Réinitialisation prête : le prochain lancement repartira de l'état initial.",
                      "Reset armed: the next launch will restart from the initial state.",
                      "Reset armed: the next launch will restart from the initial state.",
                    )
                  : (simStatus?.tick ?? 0) > 0
                    ? l(
                        `Dernière session terminée au pas ${simStatus?.tick ?? 0}. Vous pouvez relancer la démo ou ouvrir les contrôles détaillés.`,
                        `Last session ended at tick ${simStatus?.tick ?? 0}. You can relaunch the demo or open the detailed controls.`,
                        `Last session ended at tick ${simStatus?.tick ?? 0}. You can relaunch the demo or open the detailed controls.`,
                      )
                    : l(
                        "Vous pouvez lancer la démo ici, puis ouvrir les contrôles avancés si besoin.",
                        "You can launch the demo here, then open advanced controls if needed.",
                        "You can launch the demo here, then open advanced controls if needed.",
                      )}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-premium">
        <div className="mb-5 flex items-center gap-4">
          <div className="section-title flex-1">{t("dash.selectMachine")}</div>
          <select
            value={selectedId}
            onChange={(event) => updateSelectedMachine(event.target.value)}
            className="rounded-xl border border-border bg-surface-3 px-4 py-2.5 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {machines.map((machine) => (
              <option key={machine.id} value={machine.id}>
                {machine.id} - {machine.name}
              </option>
            ))}
          </select>
        </div>

        <div
          className="mb-5 rounded-2xl border-l-4 p-5"
          style={{ borderLeftColor: cfg.hex, background: `${cfg.hex}10` }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-lg font-bold text-foreground">{selected.id}</div>
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {selected.name} - {selected.city}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                className="rounded-full border-primary/20 bg-card/80 text-primary hover:bg-primary/5"
                onClick={() => setIsMachineContextOpen(true)}
              >
                <Info className="w-4 h-4" />
                {l(
                  "Contexte d'exploitation",
                  "Operating context",
                  "Operating context",
                )}
              </Button>
              <span className={`status-pill ${STATUS_CONFIG[selected.status].pillClass}`}>
                {cfg.label}
              </span>
              {selectedPriorityBadge && (
                <span className="rounded-full border border-border bg-surface-3 px-2.5 py-1 text-[0.65rem] font-semibold text-muted-foreground">
                  {selectedPriorityBadge}
                </span>
              )}
              <span className="rounded-full border border-border bg-surface-3 px-2.5 py-1 text-[0.65rem] font-semibold text-muted-foreground">
                {dataSourceLabel}
              </span>
              <span className="text-xs text-muted-foreground">
                {t("dash.lastUpdate")}: {freshnessLabel}
              </span>
            </div>
          </div>
        </div>

        {isDemoReplay ? (
          <div className="mb-5 rounded-2xl border border-primary/10 bg-primary/[0.04] px-4 py-3 text-xs leading-relaxed text-secondary-foreground">
            <span className="font-semibold text-foreground">
              {l("Lecture demo", "Demo reading", "Demo reading")}
            </span>
            : {demoPipelineNote}
          </div>
        ) : null}

        <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard
            icon={<Heart className="w-5 h-5" />}
            label="HI"
            description={hiCardDescription}
            value={
              <>
                {selectedHiPercent != null ? (
                  <>
                    {selectedHiPercent}
                    <span className="text-base opacity-40">%</span>
                  </>
                ) : (
                  l("Indispo.", "N/A", "Indispo.")
                )}
              </>
            }
            sub={hiCardSub}
            variant={machineKpiVariant}
          >
            <div className="progress-track mt-3">
              <div className="hi-fill" style={{ width: `${selectedHiPercent ?? 0}%` }} />
            </div>
          </KpiCard>
          {predictionMode === "reference_only" ? (
            <KpiCard
              icon={<Clock className="w-5 h-5" />}
              label="RUL"
              description={rulCardDescription}
              value={
                <>
                  {selected.referenceLifetimeYears ?? l("Ref.", "Ref.", "Ref.")}
                  <span className="text-base opacity-40">
                    {selected.referenceLifetimeYears != null ? " a" : ""}
                  </span>
                </>
              }
              sub={rulSub}
              variant={machineKpiVariant}
            />
          ) : (
            <KpiCard
              icon={<Clock className="w-5 h-5" />}
              label="RUL"
              description={rulCardDescription}
              value={
                <>
                  {selectedRulValue.replace(" j", "")}
                  <span className="text-base opacity-40">
                    {selectedRulValue.includes(" j") ? " j" : ""}
                  </span>
                </>
              }
              sub={rulSub}
              variant={machineKpiVariant}
            />
          )}
          <KpiCard
            icon={<Gauge className="w-5 h-5" />}
            label={l("Stress", "Stress", "Stress")}
            description={stressCardDescription}
            value={
              <>
                {stressValue != null ? (
                  <>
                    {Math.round(stressValue * 100)}
                    <span className="text-base opacity-40">%</span>
                  </>
                ) : (
                  l("Indispo.", "N/A", "Indispo.")
                )}
              </>
            }
            sub={stressKpiSub}
            variant={machineKpiVariant}
          >
            {stressValue != null ? (
              <div className="progress-track mt-3">
                <div
                  className={`h-full rounded-full ${machineKpiProgressFillClass}`}
                  style={{ width: `${Math.max(4, Math.round(stressValue * 100))}%` }}
                />
              </div>
            ) : null}
          </KpiCard>
          <KpiCard
            icon={<ShieldAlert className="w-5 h-5" />}
            label={l("Zone a verifier", "Inspection target", "Inspection target")}
            description={zoneCardDescription}
            value={
              <span className="text-[1.35rem] leading-tight tracking-tight">
                {componentFocus.familyLabel}
              </span>
            }
            sub={componentFocus.confidenceLabel}
            variant={machineKpiVariant}
          >
            <div className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {l("Déclencheur", "Trigger", "Trigger")}: {priorityTriggerLabel}
            </div>
          </KpiCard>
        </div>

        <div className="mb-5 rounded-2xl border border-primary/10 bg-primary/[0.04] px-4 py-3 text-xs leading-relaxed text-secondary-foreground">
          <span className="font-semibold text-foreground">
            {l("Aide a la decision", "Decision support", "Decision support")}
          </span>
          : {dashboardTrustNote}
        </div>

        <div className="section-title mb-4">{sensorWindowTitle}</div>
        {isLoadingSensors && sensorHistory.length === 0 ? (
          <div className="mb-5 rounded-2xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
            {t("dash.loadingSensors")}
          </div>
        ) : sensorHistory.length === 0 ? (
          <div className="mb-5 rounded-2xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
            {t("dash.awaitingSensors")}
          </div>
        ) : (
          <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {sensorCards.map((sensor) => (
              <div
                key={sensor.dataKey}
                className="card-premium rounded-2xl border border-border bg-card p-4"
              >
                <div className="mb-4 flex items-center justify-center gap-2">
                  <span style={{ color: sensor.color }}>{sensor.icon}</span>
                  <span
                    className="text-sm font-bold uppercase tracking-wider"
                    style={{ color: sensor.color }}
                  >
                    {sensor.label}
                  </span>
                </div>
                <div className="mb-4 flex justify-center">
                  <div className="w-[180px]">
                    <SVGGauge
                      value={sensor.value}
                      max={sensor.max}
                      color={sensor.color}
                      label=""
                      unit={sensor.unit}
                    />
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={100}>
                  <AreaChart
                    data={sensorHistory}
                    margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id={`sg-${sensor.dataKey}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={sensor.color} stopOpacity={0.5} />
                        <stop offset="70%" stopColor={sensor.color} stopOpacity={0.15} />
                        <stop offset="100%" stopColor={sensor.color} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="4 4"
                      stroke={sensor.color}
                      strokeOpacity={0.15}
                    />
                    <XAxis
                      dataKey="time"
                      tick={{ fill: sensor.color, fontSize: 9, opacity: 0.8 }}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={20}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fill: sensor.color, fontSize: 9, opacity: 0.8 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Area
                      type="monotone"
                      dataKey={sensor.dataKey}
                      stroke={sensor.color}
                      strokeWidth={2.5}
                      fill={`url(#sg-${sensor.dataKey})`}
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ))}
          </div>
        )}

        <div className="mb-5">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-premium">
            <div className="mb-4 flex items-center gap-2">
              <Gauge className="w-4 h-4 text-primary" />
              <div className="section-title flex-1">
                {l("Stress machine", "Machine stress", "Ø¶ØºØ· Ø§Ù„Ø§Ù„Ø©")}
              </div>
            </div>

            {isLoadingDiagnostics && !diagnostics ? (
              <div className="rounded-xl border border-border bg-surface-3 px-4 py-6 text-sm text-muted-foreground">
                {l("Chargement du stress index...", "Loading stress index...", "Ø¬Ø§Ø± ØªØ­Ù…ÙŠÙ„ Ù…Ø¤Ø´Ø± Ø§Ù„Ø¶ØºØ·...")}
              </div>
            ) : stress && stressStyle ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-surface-3 p-4">
                  <div>
                    <div className="industrial-label">
                      {l("Ce qui domine", "What dominates", "What dominates")}
                    </div>
                    <div className="mt-1 text-lg font-bold text-foreground">
                      {localizedStressAxes[stress.dominant] ?? stress.dominant}
                    </div>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    stressBand === "critical"
                      ? "bg-destructive/10 text-destructive"
                      : stressBand === "high" || stressBand === "moderate"
                        ? "bg-warning/10 text-warning"
                        : "bg-success/10 text-success"
                  }`}>
                    {stressStyle.label}
                  </span>
                </div>

                <div className="space-y-3">
                  {Object.entries(stress.components).map(([key, value]) => (
                    <div key={key}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-semibold text-foreground">
                          {localizedStressAxes[key] ?? key}
                        </span>
                        <span className="font-mono text-muted-foreground">
                          {Math.round(value * 100)}%
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-surface-3">
                        <div
                          className={`h-full rounded-full ${
                            key === stress.dominant ? stressStyle.bar : "bg-primary/60"
                          }`}
                          style={{ width: `${Math.max(4, Math.round(value * 100))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl border border-border bg-surface-3 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                  {l(
                    "Stress = pression actuelle. HI = santé cumulée. RUL = marge restante.",
                    "Stress = current pressure. HI = cumulative health. RUL = remaining margin.",
                    "Stress = current pressure. HI = cumulative health. RUL = remaining margin.",
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-surface-3 px-4 py-6 text-sm text-muted-foreground">
                {l(
                  "Stress index indisponible pour cette machine.",
                  "Stress index unavailable for this machine.",
                  "Ù…Ø¤Ø´Ø± Ø§Ù„Ø¶ØºØ· ØºÙŠØ± Ù…ØªØ§Ø­ Ù„Ù‡Ø°Ù‡ Ø§Ù„Ø§Ù„Ø©.",
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-[1.5fr_1fr]">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-premium">
            <div className="mb-4 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <div className="section-title flex-1">
                {l("RUL et action recommandée", "RUL and suggested action", "RUL and suggested action")}
              </div>
              <Button
                type="button"
                variant="default"
                size="sm"
                className={diagnosticButtonClass}
                onClick={() => navigate(`/diagnostics?machine=${encodeURIComponent(selected.id)}`)}
              >
                {l("Ouvrir le diagnostic", "Open diagnostics", "فتح التشخيص")}
                <ArrowUpRight className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </Button>
            </div>

            {isLoadingDiagnostics && !diagnostics ? (
              <div className="rounded-xl border border-border bg-surface-3 px-4 py-6 text-sm text-muted-foreground">
                {l("Chargement du pronostic...", "Loading prognosis...", "Ø¬Ø§Ø± ØªØ­Ù…ÙŠÙ„ Ø§Ù„ØªÙ†Ø¨Ø¤...")}
              </div>
            ) : predictionMode === "prediction" && prediction ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.2fr_1fr]">
                  <div className="rounded-xl bg-surface-3 p-4">
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <CalendarClock className="h-3.5 w-3.5" />
                      {l("Délai estimé", "Estimated lead time", "Ø§Ù„Ù…Ù‡Ù„Ø© Ø§Ù„Ù…Ù‚Ø¯Ø±Ø©")}
                    </div>
                    <div className="flex items-end gap-3">
                      <div className="text-5xl font-bold leading-none text-foreground">
                        {prediction.rul_days}
                      </div>
                      <div className="pb-1 text-sm text-muted-foreground">{l("jours", "days", "Ø§ÙŠØ§Ù…")}</div>
                    </div>
                    <div className="mt-2 text-sm text-secondary-foreground">
                      {prediction.display_interval_label ?? "IC 80 %"}:{" "}
                      {prediction.rul_days_display_low ?? prediction.rul_days_p10 ?? "-"}-
                      {prediction.rul_days_display_high ?? prediction.rul_days_p90 ?? "-"} j
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {confidenceLabel && (
                        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[0.65rem] font-semibold text-primary">
                          {confidenceLabel}
                        </span>
                      )}
                      <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[0.65rem] font-semibold text-muted-foreground">
                        {prediction.cycles_remaining.toLocaleString(numberLocale)}{" "}
                        {l("cycles restants", "cycles remaining", "دورات متبقية")}
                      </span>
                      {prediction.stop_recommended && (
                        <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-[0.65rem] font-semibold text-destructive">
                          {l("Arrêt recommandé", "Recommended stop", "ÙŠÙˆØµÙ‰ Ø¨Ø§Ù„ØªÙˆÙ‚Ù")}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl bg-surface-3 p-4">
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <ShieldAlert className="h-3.5 w-3.5" />
                      {l("Priorite terrain", "Field priority", "Field priority")}
                    </div>
                    <div className="text-sm font-semibold text-foreground">
                      {dashboardActionLead}
                    </div>
                    <div className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      {dashboardActionReason}
                    </div>
                    <div className="mt-3 text-xs leading-relaxed text-muted-foreground">
                      {l("Contexte", "Context", "Context")}:{" "}
                      <span className="font-semibold text-foreground">
                        {dashboardContextLabel}
                      </span>
                    </div>
                    <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {l("Signal dominant", "Main signal", "Main signal")}:{" "}
                      <span className="font-semibold text-foreground">{dashboardSignalLabel}</span>
                    </div>
                    <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {l("Etat machine", "Machine state", "Machine state")}:{" "}
                      <span className="font-semibold text-foreground">{dashboardReadingLabel}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-border bg-surface-3 px-4 py-3">
                    <div className="industrial-label">{l("Profil d'usage", "Usage profile", "Usage profile")}</div>
                    <div className="mt-1 text-lg font-bold text-foreground">
                      {usageRegimeLabel}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border bg-surface-3 px-4 py-3">
                    <div className="industrial-label">{l("Fiabilite lecture", "Reading reliability", "Reading reliability")}</div>
                    <div className="mt-1 text-lg font-bold text-foreground">
                      {confidenceLabel ?? l("Lecture en cours", "Reading in progress", "Reading in progress")}
                    </div>
                  </div>
                </div>
              </div>
            ) : predictionMode === "reference_only" ? (
              <div className="space-y-4">
                <div className="rounded-xl bg-surface-3 p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    {l("Référence stable active", "Stable reference active", "Stable reference active")}
                  </div>
                  <div className="text-sm font-semibold text-foreground">
                    {l(
                      "Le pronostic live n'est pas disponible pour cette lecture, donc le tableau conserve une référence simple et stable.",
                      "The live prognosis is not available for this reading, so the dashboard keeps a simple and stable reference.",
                      "The live prognosis is not available for this reading, so the dashboard keeps a simple and stable reference.",
                    )}
                  </div>
                  <div className="mt-3 text-xs leading-relaxed text-muted-foreground">
                    {l(
                      "Le KPI RUL du haut affiche une référence de durée de vie pour garder un repère lisible sans surcharger la lecture.",
                      "The top RUL KPI shows a lifetime reference to keep a readable cue without overloading the view.",
                      "The top RUL KPI shows a lifetime reference to keep a readable cue without overloading the view.",
                    )}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-surface-3 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                  {l(
                    "Dès qu'un pronostic live exploitable sera disponible, ce panneau affichera un RUL chiffré avec son intervalle de confiance.",
                    "As soon as a usable live prognosis is available, this panel will show a numeric RUL with its confidence interval.",
                    "As soon as a usable live prognosis is available, this panel will show a numeric RUL with its confidence interval.",
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.1fr_1fr]">
                <div className="rounded-xl bg-surface-3 p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    {l("RUL en préparation", "RUL in preparation", "RUL in preparation")}
                  </div>
                  <div className="text-lg font-bold text-foreground">
                    {rulDisplay.source === "demo_reference"
                      ? l("Référence démo active", "Demo reference active", "مرجع العرض نشط")
                      : l("Initialisation RUL", "RUL warm-up", "تهيئة العمر المتبقي")}
                  </div>
                  <div className="mt-2 text-sm text-secondary-foreground">
                    {rulDisplay.source === "demo_reference"
                      ? l(
                          "Référence démo affichée en attendant le RUL live.",
                          "Demo reference shown while waiting for the live RUL.",
                          "Demo reference shown while waiting for the live RUL.",
                        )
                      : l(
                          "Le pipeline attend encore assez d'historique HI.",
                          "The pipeline is still waiting for enough HI history.",
                          "The pipeline is still waiting for enough HI history.",
                        )}
                  </div>
                </div>
                <div className="rounded-xl bg-surface-3 p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <TrendingDown className="h-3.5 w-3.5" />
                    {l("État actuel", "Current state", "Current state")}
                  </div>
                  <div className="text-sm font-semibold text-foreground">
                    {rulDisplay.source === "demo_reference"
                      ? selectedRulValue
                      : l(
                          "Stabilisation des données",
                          "Data stabilization",
                          "Data stabilization",
                        )}
                  </div>
                  <div className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    {rulDisplay.source === "demo_reference"
                      ? rulSub
                      : l(
                          "Le HI, l'usage et la confiance sont encore observés.",
                          "HI, usage and confidence are still being observed.",
                          "HI, usage and confidence are still being observed.",
                        )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-premium">
            <div className="mb-4 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <div className="section-title flex-1">
                {l("Facteurs clés", "Key factors", "Key factors")}
              </div>
            </div>

            {!diagnostics ? (
              <div className="rounded-xl border border-border bg-surface-3 px-4 py-6 text-sm text-muted-foreground">
                {l(
                  "Chargement des facteurs de prédiction...",
                  "Loading prediction factors...",
                  "Ø¬Ø§Ø± ØªØ­Ù…ÙŠÙ„ Ø¹ÙˆØ§Ù…Ù„ Ø§Ù„ØªÙ†Ø¨Ø¤...",
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl bg-surface-3 p-4">
                  <div className="industrial-label">{l("Ce qui pese le plus", "Main pressure point", "Main pressure point")}</div>
                  <div className="mt-1 text-lg font-bold text-foreground">
                    {topDriverLabel ?? l("Non disponible", "Unavailable", "ØºÙŠØ± Ù…ØªØ§Ø­")}
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    {hasLivePrediction
                      ? l(
                          "Les signaux qui raccourcissent ou rallongent le plus la marge restante.",
                          "The signals that shorten or extend the remaining margin the most.",
                          "The signals that shorten or extend the remaining margin the most.",
                        )
                      : isReferenceMode
                        ? l(
                            "Les signaux que le modele surveille pendant que le dashboard garde une reference stable.",
                            "The signals the model keeps watching while the dashboard stays on a stable reference.",
                            "The signals the model keeps watching while the dashboard stays on a stable reference.",
                          )
                        : l(
                            "Les signaux qui servent a preparer la premiere lecture RUL fiable.",
                            "The signals helping prepare the first reliable RUL reading.",
                            "The signals helping prepare the first reliable RUL reading.",
                          )}
                  </div>
                </div>

                {explainContributions.length === 0 ? (
                  <div className="rounded-xl border border-border bg-surface-3 px-4 py-5 text-sm text-muted-foreground">
                    {l(
                      "Détail non disponible pour cette machine.",
                      "Details are not available for this machine.",
                      "Details are not available for this machine.",
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {explainContributions.slice(0, 3).map((contribution) => {
                      const width = Math.max(
                        12,
                        Math.round((Math.abs(contribution.impact_days) / maxExplainImpact) * 100),
                      );
                      const positive = contribution.impact_days >= 0;

                      return (
                        <div key={contribution.feature}>
                          <div className="mb-1 flex items-center justify-between text-xs">
                            <span className="font-semibold text-foreground">
                              {contribution.feature}
                            </span>
                            <span
                              className={positive ? "text-success" : "text-destructive"}
                            >
                              {positive ? "+" : ""}
                              {contribution.impact_days.toFixed(1)} j
                            </span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-surface-3">
                            <div
                              className={`h-full rounded-full ${
                                positive ? "bg-success" : "bg-destructive"
                              }`}
                              style={{ width: `${width}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <Button
                  type="button"
                  variant="outline"
                  className={detailsButtonWideClass}
                  onClick={() => setIsExplainOpen(true)}
                >
                  <Info className="w-4 h-4" />
                  {l("Voir pourquoi", "See why", "See why")}
                </Button>
              </div>
            )}
          </div>
        </div>

      </div>

      <Sheet open={isMachineContextOpen} onOpenChange={setIsMachineContextOpen}>
        <SheetContent
          side="right"
          className="w-full border-border bg-card p-0 sm:max-w-2xl lg:max-w-3xl"
        >
          <SheetHeader className="border-b border-border px-6 py-5">
            <SheetTitle>
              {l(
                "Contexte d'exploitation",
                "Operating context",
                "Operating context",
              )}
            </SheetTitle>
            <SheetDescription>
              {selected.id} - {repairText(selected.name)} - {repairText(selected.city)}
            </SheetDescription>
          </SheetHeader>

          <ScrollArea className="h-[calc(100vh-96px)]">
            <div className="space-y-5 px-6 py-5 pb-24">
              <div className="rounded-2xl border border-primary/10 bg-gradient-to-br from-primary/[0.06] via-card to-card p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`status-pill ${STATUS_CONFIG[selected.status].pillClass}`}>
                    {cfg.label}
                  </span>
                  {selectedPriorityBadge ? (
                    <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground">
                      {selectedPriorityBadge}
                    </span>
                  ) : null}
                  <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground">
                    {dataSourceLabel}
                  </span>
                </div>
                <div className="mt-4 text-sm font-semibold leading-relaxed text-foreground">
                  {localizedScenarioUsageCase}
                </div>
                <div className="mt-2 text-sm leading-relaxed text-secondary-foreground">
                  {localizedScenarioExplanation}
                </div>
                <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
                  <span>
                    {l("Site", "Site", "Site")}: {repairText(selectedScenario?.site ?? selected.city)}
                  </span>
                  <span>
                    {l("Derniere lecture", "Latest reading", "Latest reading")}: {freshnessLabel}
                  </span>
                </div>
                <div className="mt-4 rounded-xl border border-primary/10 bg-primary/[0.05] px-4 py-3 text-xs leading-relaxed text-secondary-foreground">
                  {machineContextIntro}
                </div>
              </div>

              <div>
                <div className="section-title">
                  {l(
                    "Cadre d'exploitation",
                    "Operating setup",
                    "Operating setup",
                  )}
                </div>
                <div className="mt-2 text-sm leading-relaxed text-secondary-foreground">
                  {l(
                    "Charges, cadence, profil de degradation et ambiance: voici le contexte qui alimente la lecture de cette machine.",
                    "Loads, cadence, degradation profile, and environment: this is the context feeding the machine reading.",
                    "Loads, cadence, degradation profile, and environment: this is the context feeding the machine reading.",
                  )}
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {contextOverviewCards.map((item) => (
                    <div
                      key={`${item.label}-${item.value}`}
                      className="rounded-xl border border-border bg-surface-3 px-4 py-3"
                    >
                      <div className="text-[0.68rem] uppercase tracking-[0.18em] text-muted-foreground">
                        {item.label}
                      </div>
                      <div className="mt-1 text-sm font-semibold text-foreground">
                        {item.value}
                      </div>
                      <div className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        {item.detail}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="section-title">
                  {l(
                    "Usure et contraintes",
                    "Wear and constraints",
                    "Wear and constraints",
                  )}
                </div>
                <div className="mt-2 text-sm leading-relaxed text-secondary-foreground">
                  {l(
                    "Ces niveaux viennent directement du scenario simule. Ils expliquent pourquoi la machine evolue comme elle le fait avant meme de regarder le detail des signaux.",
                    "These levels come directly from the simulated scenario. They explain why the machine evolves this way even before looking at detailed signals.",
                    "These levels come directly from the simulated scenario. They explain why the machine evolves this way even before looking at detailed signals.",
                  )}
                </div>
                {contextFactorRows.length > 0 ? (
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {contextFactorRows.map((factor) => (
                      <div
                        key={factor.label}
                        className="rounded-xl border border-border bg-surface-3 px-4 py-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-[0.68rem] uppercase tracking-[0.18em] text-muted-foreground">
                            {factor.label}
                          </div>
                          <div className="text-xs font-semibold text-foreground">
                            {factor.level}
                          </div>
                        </div>
                        <div className="mt-3 flex items-end justify-between gap-3">
                          <div className="text-2xl font-semibold text-foreground">
                            {factor.percent}%
                          </div>
                          <div className="text-right text-xs leading-relaxed text-muted-foreground">
                            {factor.hint}
                          </div>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-card">
                          <div
                            className={`h-full rounded-full ${factor.bar}`}
                            style={{ width: `${Math.max(6, factor.percent)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-border bg-surface-3 px-4 py-5 text-sm text-muted-foreground">
                    {l(
                      "Le scenario detaille de cette machine n'est pas disponible pour le moment.",
                      "Detailed scenario data is not available for this machine yet.",
                      "Detailed scenario data is not available for this machine yet.",
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-border bg-surface-3 p-4">
                <div className="section-title">
                  {l(
                    "Comment ce contexte alimente le dashboard",
                    "How this context feeds the dashboard",
                    "How this context feeds the dashboard",
                  )}
                </div>
                <div className="mt-2 text-sm leading-relaxed text-secondary-foreground">
                  {l(
                    "Le contexte explique une partie des lectures. Les signaux temps reel et les regles expertes completent ensuite la decision.",
                    "Context explains part of the readings. Real-time signals and expert rules then complete the decision.",
                    "Context explains part of the readings. Real-time signals and expert rules then complete the decision.",
                  )}
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {dashboardLinkCards.map((card) => (
                    <div
                      key={card.label}
                      className="rounded-xl border border-border bg-surface-3 px-4 py-4"
                    >
                      <div className="text-[0.68rem] uppercase tracking-[0.18em] text-muted-foreground">
                        {card.label}
                      </div>
                      <div className="mt-2 text-sm leading-relaxed text-secondary-foreground">
                        {card.text}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 rounded-xl border border-primary/10 bg-primary/5 px-4 py-3 text-xs leading-relaxed text-secondary-foreground">
                  <span className="font-semibold text-foreground">
                    {l(
                      "Portee de cette vue",
                      "Scope of this view",
                      "Scope of this view",
                    )}
                  </span>
                  :{" "}
                  {l(
                    "ce panneau explique le contexte d'exploitation. Le detail des signaux, des alertes et des controles terrain reste dans Diagnostic avance.",
                    "this panel explains the operating context. Signal details, alerts, and field checks remain in Advanced diagnostics.",
                    "this panel explains the operating context. Signal details, alerts, and field checks remain in Advanced diagnostics.",
                  )}
                </div>
              </div>
            </div>
          </ScrollArea>

          <div className="border-t border-border bg-card/95 px-6 py-4 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-muted-foreground">
                {l(
                  "Pour le detail technique complet, ouvrir le diagnostic avance.",
                  "Open advanced diagnostics for the full technical detail.",
                  "Open advanced diagnostics for the full technical detail.",
                )}
              </div>
              <Button
                type="button"
                className="rounded-full"
                onClick={() => {
                  setIsMachineContextOpen(false);
                  navigate(`/diagnostics?machine=${encodeURIComponent(selected.id)}`);
                }}
              >
                {l(
                  "Ouvrir le diagnostic avance",
                  "Open advanced diagnostics",
                  "Open advanced diagnostics",
                )}
                <ArrowUpRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={isExplainOpen} onOpenChange={setIsExplainOpen}>
        <DialogContent className="max-w-4xl border-border bg-card p-0 sm:rounded-2xl">
          <DialogHeader className="border-b border-border px-6 py-5">
            <DialogTitle className="text-xl text-foreground">
              {explainDialogTitle}: {selected.id}
            </DialogTitle>
            <DialogDescription>
              {explainDialogDescription}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[75vh] space-y-5 overflow-y-auto px-6 py-5">
            {!diagnostics ? (
              <div className="rounded-2xl border border-border bg-surface-3 px-4 py-6 text-sm text-muted-foreground">
                {l(
                  "Les explications du modèle sont en cours de chargement.",
                  "Model explanations are loading.",
                  "ØªÙØ³ÙŠØ±Ø§Øª Ø§Ù„Ù†Ù…ÙˆØ°Ø¬ Ù‚ÙŠØ¯ Ø§Ù„ØªØ­Ù…ÙŠÙ„.",
                )}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-border bg-surface-3 p-4">
                    <div className="industrial-label">{explainPrimaryLabel}</div>
                    <div className="mt-1 text-2xl font-bold text-foreground">
                      {selectedRulValue}
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {explainPrimarySub}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border bg-surface-3 p-4">
                    <div className="industrial-label">{explainStatusLabel}</div>
                    <div className="mt-1 text-2xl font-bold text-foreground">
                      {explainStatusValue}
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {explainStatusSub}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border bg-surface-3 p-4">
                    <div className="industrial-label">{l("Stress instantané", "Instant stress", "Ø§Ù„Ø¶ØºØ· Ø§Ù„Ù„Ø­Ø¸ÙŠ")}</div>
                    <div className="mt-1 text-2xl font-bold text-foreground">
                      {stress != null ? `${Math.round(stress.value * 100)}%` : "-"}
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {stressStyle?.label ?? l("Non disponible", "Unavailable", "ØºÙŠØ± Ù…ØªØ§Ø­")}
                      {stress?.dominant
                        ? ` - ${l("axe", "axis", "Ø§Ù„Ù…Ø­ÙˆØ±")} ${localizedStressAxes[stress.dominant] ?? stress.dominant}`
                        : ""}
                    </div>
                  </div>
                </div>

                {explainContributions.length === 0 ? (
                  <div className="rounded-2xl border border-border bg-surface-3 px-4 py-6 text-sm text-muted-foreground">
                    {explainEmptyText}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-border bg-card p-5 shadow-premium">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <div className="section-title">
                          {explainFactorsTitle}
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          {explainFactorsDescription}
                        </div>
                      </div>
                      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wider text-primary">
                        {l("5 facteurs modèle", "5 model drivers", "5 model drivers")}
                      </span>
                    </div>

                    <div className="space-y-4">
                      {explainContributions.map((contribution) => {
                        const width = Math.max(
                          10,
                          Math.round((Math.abs(contribution.impact_days) / maxExplainImpact) * 100),
                        );
                        const positive = contribution.impact_days >= 0;

                        return (
                          <div
                            key={contribution.feature}
                            className="rounded-xl border border-border bg-surface-3 p-4"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <div className="text-sm font-semibold text-foreground">
                                  {contribution.feature}
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {l("Valeur observée", "Observed value", "Ø§Ù„Ù‚ÙŠÙ…Ø© Ø§Ù„Ù…Ø±ØµÙˆØ¯Ø©")}: {contribution.value.toFixed(3)} - {l("effet", "effect", "Ø§Ù„Ø§Ø«Ø±")}{" "}
                                  {contribution.direction}
                                </div>
                              </div>
                              <div
                                className={`text-sm font-bold ${
                                  positive ? "text-success" : "text-destructive"
                                }`}
                              >
                                {positive ? "+" : ""}
                                {contribution.impact_days.toFixed(2)} j
                              </div>
                            </div>
                            <div className="mt-3 h-2 overflow-hidden rounded-full bg-card">
                              <div
                                className={`h-full rounded-full ${
                                  positive ? "bg-success" : "bg-destructive"
                                }`}
                                style={{ width: `${width}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="rounded-2xl border border-border bg-surface-3 p-4 text-sm leading-relaxed text-muted-foreground">
                  {explainFooterText}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


