import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Play, Square, Activity, RefreshCw, RotateCcw } from "lucide-react";
import { useApp, type Lang } from "@/contexts/AppContext";
import type { DemoScenario, Machine } from "@/data/machines";
import { useMachines } from "@/hooks/useMachines";
import { useSimulatorController } from "@/hooks/useSimulatorController";
import { getMachinePublicLabel } from "@/lib/machinePresentation";
import { replaceMachineCodesForDisplay } from "@/lib/machinePresentation";
import {
  describeAudienceScenarioExplanation,
  describeAudienceScenarioUsageCase,
  getDemoScenarioFactors,
  getDemoStoryMachines,
  getMachineDemoScenario,
  type DemoStoryState,
  type DemoScenarioFactorKey,
} from "@/lib/demoScenario";
import { repairText } from "@/lib/repairText";
import { buildRulDisplay, type RulPredictionLike } from "@/lib/rulDisplay";
import {
  SIMULATOR_AUTOSTART_PARAM,
  type SimulatorMachineStatus,
} from "@/lib/simulator";
import { cn } from "@/lib/utils";

type LocalizedText = Record<Lang, string>;

const PROFILE_LABELS: Record<string, LocalizedText> = {
  A_linear: {
    fr: "Linéaire progressive",
    en: "Progressive linear",
    ar: "Progressive linear",
  },
  B_quadratic: {
    fr: "Quadratique",
    en: "Quadratic",
    ar: "Quadratic",
  },
  C_stepwise: {
    fr: "Par paliers",
    en: "Stepwise",
    ar: "Stepwise",
  },
  D_noisy_linear: {
    fr: "Linéaire bruitée",
    en: "Noisy linear",
    ar: "Noisy linear",
  },
};

function buildMachinePrediction(machine?: Machine | null): RulPredictionLike | null {
  if (!machine) {
    return null;
  }

  return {
    rul_days: machine.rul,
    rul_days_p10: machine.rulIntervalLow,
    rul_days_p90: machine.rulIntervalHigh,
    rul_days_display_low: machine.rulIntervalLow,
    rul_days_display_high: machine.rulIntervalHigh,
    display_interval_label: machine.rulIntervalLabel,
    stop_recommended: machine.stopRecommended,
  };
}

function getHiTone(hi?: number | null) {
  if (typeof hi !== "number") {
    return "bg-surface-3 text-muted-foreground";
  }

  if (hi >= 0.8) {
    return "bg-success/10 text-success";
  }

  if (hi >= 0.3) {
    return "bg-warning/10 text-warning";
  }

  return "bg-destructive/10 text-destructive";
}

function getZoneTone(zone?: string | null, hi?: number | null) {
  if (zone === "Critical" || (typeof hi === "number" && hi < 0.3)) {
    return "bg-destructive/10 text-destructive";
  }

  if (
    zone === "Good" ||
    zone === "Degraded" ||
    (typeof hi === "number" && hi < 0.8)
  ) {
    return "bg-warning/10 text-warning";
  }

  return "bg-success/10 text-success";
}

function compactText(value?: string | null, maxLength = 120) {
  const normalized = replaceMachineCodesForDisplay(
    repairText((value ?? "").replace(/\s+/g, " ").trim()),
  );
  if (!normalized) return null;
  if (normalized.length <= maxLength) return normalized;

  const sentenceCutoff = normalized.lastIndexOf(". ", maxLength);
  if (sentenceCutoff >= Math.floor(maxLength * 0.55)) {
    return normalized.slice(0, sentenceCutoff + 1);
  }

  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

export function SimulatorPage() {
  const { lang } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const { machines, refetch: refetchMachines } = useMachines();
  const [simSpeed, setSimSpeed] = useState(60);
  const [focusedMachineId, setFocusedMachineId] = useState<string | null>(null);
  const autostartHandledRef = useRef(false);
  const simulator = useSimulatorController({ lang, refetchMachines });
  const simStatus = simulator.simStatus;
  const resetRequested = simulator.resetRequested;
  const isBootstrapping = simulator.isBootstrapping;
  const l = useCallback(
    (fr: string, en: string, ar: string) =>
      repairText(lang === "fr" ? fr : lang === "en" ? en : ar),
    [lang],
  );
  const fromLocale = useCallback((text: LocalizedText) => repairText(text[lang]), [lang]);
  const machinesByCode = useMemo(
    () => new Map(machines.map((machine) => [machine.id, machine])),
    [machines],
  );
  const demoStoryMachines = useMemo(() => getDemoStoryMachines(machines), [machines]);

  const getScenarioLabel = useCallback(
    (scenario?: DemoScenario | null) => {
      switch (scenario?.health_state) {
        case "good":
          return l("Bon état", "Healthy", "Healthy");
        case "surveillance":
          return l("Sous surveillance", "Under surveillance", "Under surveillance");
        case "critical":
          return l("Critique", "Critical", "Critical");
        default:
          return scenario?.health_label ?? l("Profil", "Profile", "Profile");
      }
    },
    [l],
  );

  const getStoryLabel = useCallback(
    (state: DemoStoryState) => {
      switch (state) {
        case "stable":
          return l("Stable", "Stable", "Stable");
        case "watch":
          return l("Surveillance", "Watch", "Watch");
        case "critical":
          return l("Critique", "Critical", "Critical");
        default:
          return l("Profil", "Profile", "Profile");
      }
    },
    [l],
  );

  const getProfileLabel = useCallback(
    (profile?: string) => {
      if (!profile) return null;
      return PROFILE_LABELS[profile]?.[lang] ?? profile;
    },
    [lang],
  );

  const getFactorMeta = useCallback(
    (key: DemoScenarioFactorKey) => {
      switch (key) {
        case "usage_intensity":
          return {
            label: l("Intensité d'usage", "Usage intensity", "Usage intensity"),
            tone: "bg-primary/70",
          };
        case "wear_level":
          return {
            label: l("Usure cumulée", "Wear level", "Wear level"),
            tone: "bg-warning",
          };
        case "thermal_stress":
          return {
            label: l("Stress thermique", "Thermal stress", "Thermal stress"),
            tone: "bg-destructive",
          };
        case "humidity_stress":
          return {
            label: l("Stress humidité", "Humidity stress", "Humidity stress"),
            tone: "bg-sky-500",
          };
        case "load_variability":
          return {
            label: l("Variation de charge", "Load variation", "Load variation"),
            tone: "bg-amber-500",
          };
        case "overload_bias":
          return {
            label: l("Exposition surcharge", "Overload exposure", "Overload exposure"),
            tone: "bg-rose-500",
          };
      }
    },
    [l],
  );

  const clearAutostartFlag = useCallback(() => {
    if (searchParams.get(SIMULATOR_AUTOSTART_PARAM) !== "1") {
      return;
    }

    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete(SIMULATOR_AUTOSTART_PARAM);
    setSearchParams(nextSearchParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleStartClick = useCallback(async () => {
    await simulator.startSimulation({ speed: simSpeed });
    clearAutostartFlag();
  }, [clearAutostartFlag, simSpeed, simulator]);

  const startSim = useCallback(async () => {
    await handleStartClick();
  }, [handleStartClick]);

  const queueReset = useCallback(() => {
    simulator.toggleResetRequest();
  }, [simulator]);

  const stopSim = useCallback(async () => {
    await simulator.pauseSimulation();
  }, [simulator]);

  useEffect(() => {
    if (searchParams.get(SIMULATOR_AUTOSTART_PARAM) !== "1" || autostartHandledRef.current) {
      return;
    }

    if (simulator.isActive) {
      autostartHandledRef.current = true;
      clearAutostartFlag();
      return;
    }

    autostartHandledRef.current = true;
    void handleStartClick();
  }, [clearAutostartFlag, handleStartClick, searchParams, simulator.isActive]);

  useEffect(() => {
    if (demoStoryMachines.length === 0) {
      return;
    }

    setFocusedMachineId((previous) => {
      if (previous && demoStoryMachines.some((story) => story.machine.id === previous)) {
        return previous;
      }

      return demoStoryMachines[0]?.machine.id ?? null;
    });
  }, [demoStoryMachines]);

  const machineEntries = useMemo<Array<[string, SimulatorMachineStatus]>>(() => {
    const liveEntries = Object.entries(simStatus?.machines ?? {});

    if (liveEntries.length > 0) {
      return liveEntries as Array<[string, SimulatorMachineStatus]>;
    }

    return machines.map((machine) => [
      machine.id,
      {
        scenario: getMachineDemoScenario(machine) ?? undefined,
        hi_smooth: machine.hi,
        zone: machine.decision?.zone ?? undefined,
      },
    ]);
  }, [machines, simStatus?.machines]);
  const orderedMachineEntries = useMemo(() => {
    if (!focusedMachineId) {
      return machineEntries;
    }

    return [...machineEntries].sort(([leftCode], [rightCode]) => {
      if (leftCode === focusedMachineId) return -1;
      if (rightCode === focusedMachineId) return 1;
      return 0;
    });
  }, [focusedMachineId, machineEntries]);
  const focusStoryMachine = useCallback((machineId: string) => {
    setFocusedMachineId(machineId);
    window.setTimeout(() => {
      document.getElementById(`demo-story-${machineId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 0);
  }, []);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-premium">
        <div className="mb-5 flex items-center gap-3">
          <Activity className="h-5 w-5 text-primary" />
          <h2 className="section-title">
            {l("Pilotage du simulateur", "Simulator control", "Simulator control")}
          </h2>
        </div>

        <p className="mb-5 text-sm text-muted-foreground">
          {l(
            "Demarrez la simulation puis suivez HI, RUL et l'action recommandee pour chaque machine.",
            "Start the simulation, then follow HI, RUL, and the recommended action for each machine.",
            "Start the simulation, then follow HI, RUL, and the recommended action for each machine.",
          )}
        </p>

        <div className="mb-5 rounded-xl border border-primary/10 bg-primary/[0.04] px-4 py-3 text-xs leading-relaxed text-secondary-foreground">
          <span className="font-semibold text-foreground">
            {l("Source des valeurs", "Displayed source", "Displayed source")}
          </span>
          :{" "}
          {l(
            "Les indicateurs affiches proviennent de la simulation en cours pour chaque machine.",
            "The displayed indicators come from the current simulation for each machine.",
            "The displayed indicators come from the current simulation for each machine.",
          )}
        </div>

        {demoStoryMachines.length > 0 && (
          <div className="mb-5 rounded-xl border border-border bg-surface-3 p-4">
            <div className="text-[0.68rem] uppercase tracking-[0.18em] text-muted-foreground">
              {l("Profils machines", "Machine profiles", "Machine profiles")}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {demoStoryMachines.map((story) => {
                const active = story.machine.id === focusedMachineId;

                return (
                  <button
                    key={story.machine.id}
                    type="button"
                    onClick={() => focusStoryMachine(story.machine.id)}
                    className={`rounded-full border px-3 py-2 text-left text-xs font-semibold transition-all ${
                      active
                        ? "border-primary/35 bg-primary/12 text-primary shadow-sm"
                        : "border-border bg-card text-secondary-foreground hover:border-primary/20 hover:bg-primary/5"
                    }`}
                  >
                    {getStoryLabel(story.state)} - {getMachinePublicLabel(story.machine)}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 text-xs leading-relaxed text-muted-foreground">
              {l(
                "Choisissez un profil machine a afficher en priorite.",
                "Choose the machine profile to focus on first.",
                "Choose the machine profile to focus on first.",
              )}
            </div>
          </div>
        )}

        <div className="mb-5 flex flex-wrap items-center gap-3">
          <button
            onClick={() => void startSim()}
            disabled={simulator.isStartLocked}
            aria-pressed={simulator.isActive}
            className={`flex items-center gap-2 rounded-lg border px-5 py-2.5 text-sm font-semibold transition-colors disabled:opacity-100 ${
              simulator.isStartLocked
                ? "cursor-not-allowed border-primary/20 bg-primary/10 text-primary"
                : "border-success/20 bg-success/10 text-success hover:bg-success/20"
            }`}
          >
            <Play className="h-4 w-4" />
            {simulator.isStarting
              ? l("Démarrage...", "Starting...", "Starting...")
              : simulator.isActive
                ? l("Simulation lancée", "Simulation running", "Simulation running")
                : (simStatus?.tick ?? 0) > 0 && !resetRequested
                  ? l("Relancer", "Relaunch", "Relaunch")
                  : l("Démarrer", "Start", "Start")}
          </button>

          <button
            onClick={() => void stopSim()}
            disabled={!simulator.canPause}
            className={`flex items-center gap-2 rounded-lg border px-5 py-2.5 text-sm font-semibold transition-colors ${
              simulator.canPause
                ? "border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive/20"
                : "cursor-not-allowed border-border bg-surface-3 text-muted-foreground"
            }`}
          >
            <Square className="h-4 w-4" />
            {simulator.isStopping
              ? l("Pause...", "Pausing...", "Pausing...")
              : l("Pause", "Pause", "Pause")}
          </button>

          <button
            onClick={queueReset}
            disabled={!simulator.canReset}
            className={`flex items-center gap-2 rounded-lg border px-5 py-2.5 text-sm font-semibold transition-colors disabled:opacity-100 ${
              !simulator.canReset
                ? "cursor-not-allowed border-border bg-surface-3 text-muted-foreground"
                : resetRequested
                  ? "border-amber-500/30 bg-amber-500/20 text-amber-700"
                  : "border-amber-500/20 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20"
            }`}
          >
            <RotateCcw className="h-4 w-4" />
            {resetRequested
              ? l("Annuler la réinitialisation", "Cancel reset", "Cancel reset")
              : l("Réinitialiser", "Reset", "Reset")}
          </button>

          <button
            onClick={() => void simulator.loadSimulatorStatus()}
            disabled={simulator.isStopping}
            className="flex items-center gap-2 rounded-lg border border-border bg-surface-3 px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-border-subtle disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${simulator.isActive ? "animate-spin" : ""}`} />
            {l("Rafraîchir", "Refresh", "Refresh")}
          </button>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {l("Vitesse", "Speed", "Speed")}:
            </span>
            <select
              value={simSpeed}
              onChange={(event) => setSimSpeed(Number(event.target.value))}
              disabled={simulator.isActive}
              className="rounded-lg border border-border bg-surface-3 px-3 py-2 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
            >
              <option value={60}>x60 - {l("Temps réel", "Real-time", "Real-time")}</option>
              <option value={500}>x500 - {l("Rapide", "Fast", "Fast")}</option>
            </select>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface-3 p-4">
          <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-3">
            <div>
              <span className="text-muted-foreground">
                {l("État", "State", "State")}:
              </span>{" "}
              <span
                className={`font-semibold ${
                  simulator.isActive ? "text-success" : "text-muted-foreground"
                }`}
              >
                {simulator.isActive
                  ? l("En cours", "Running", "Running")
                  : l("À l'arrêt", "Stopped", "Stopped")}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">
                {l("Pas", "Tick", "Tick")}:
              </span>{" "}
              <span className="font-semibold text-foreground">{simStatus?.tick ?? 0}</span>
            </div>
            <div>
              <span className="text-muted-foreground">
                {l("Vitesse", "Speed", "Speed")}:
              </span>{" "}
              <span className="font-semibold text-foreground">x{simStatus?.speed ?? simSpeed}</span>
            </div>
          </div>

          {isBootstrapping && (
            <div className="mt-3 text-xs font-semibold text-primary">
              {l(
                "Initialisation en cours. Les indicateurs vont s'afficher.",
                "Initialization in progress. Indicators will appear shortly.",
                "Initialization in progress. Indicators will appear shortly.",
              )}
            </div>
          )}

          {simulator.isActive && !isBootstrapping && (
            <div className="mt-3 text-xs font-semibold text-success">
              {l(
                "Simulation en cours. Utilisez Pause pour l'arreter.",
                "Simulation is running. Use Pause to stop it.",
                "Simulation is running. Use Pause to stop it.",
              )}
            </div>
          )}

          {resetRequested && !simulator.isActive && (
            <div className="mt-3 text-xs font-semibold text-amber-600">
              {l(
                "Reset armé : le prochain démarrage repart de l'état initial.",
                "Reset armed: the next start restarts from the initial state.",
                "Reset armed: the next start restarts from the initial state.",
              )}
            </div>
          )}

          {!simulator.isActive && !resetRequested && !isBootstrapping && (simStatus?.tick ?? 0) > 0 && (
            <div className="mt-3 text-xs font-medium text-muted-foreground">
              {l(
                `Session arrêtée au pas ${simStatus?.tick ?? 0}. Relancez ou réinitialisez.`,
                `Session stopped at tick ${simStatus?.tick ?? 0}. Relaunch or reset.`,
                `Session stopped at tick ${simStatus?.tick ?? 0}. Relaunch or reset.`,
              )}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-premium">
        <div className="mb-4 flex items-center gap-3">
          <Activity className="h-5 w-5 text-primary" />
          <h2 className="section-title">
            {l(
              "Suivi machine par machine",
              "Live machine view",
              "Live machine view",
            )}
          </h2>
        </div>

        <p className="mb-5 text-sm text-muted-foreground">
          {l(
            "Résumé rapide par machine : HI, RUL, zone et action.",
            "Quick per-machine summary: HI, RUL, zone, and action.",
            "Quick per-machine summary: HI, RUL, zone, and action.",
          )}
        </p>

        {machineEntries.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface-3 px-4 py-6 text-sm text-muted-foreground">
            {l(
              "Aucune machine en direct disponible pour le moment.",
              "No live machine is available at the moment.",
              "No live machine is available at the moment.",
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {orderedMachineEntries.map(([code, data]) => {
              const runtimeMachine = machinesByCode.get(code);
              const scenario = data.scenario ?? getMachineDemoScenario(runtimeMachine);
              const scenarioFactors = getDemoScenarioFactors(scenario);
              const profileLabel = getProfileLabel(scenario?.profile);
              const usageCase = describeAudienceScenarioUsageCase(scenario, l);
              const explanation = describeAudienceScenarioExplanation(scenario, l);
              const machineLabel = getMachinePublicLabel(runtimeMachine ?? { id: code });
              const hi = typeof data.hi_smooth === "number" ? data.hi_smooth : runtimeMachine?.hi;
              const simHI =
                typeof data.simulated_hi === "number" ? data.simulated_hi : undefined;
              const tick = typeof data.current === "number" ? data.current : undefined;
              const total = typeof data.total === "number" ? data.total : undefined;
              const currentLoad =
                typeof data.current_load_kg === "number"
                  ? data.current_load_kg
                  : undefined;
              const zone = data.zone ?? runtimeMachine?.decision?.zone ?? null;
              const pct = total && tick != null ? Math.round((tick / total) * 100) : 0;
              const maintenanceWindow = runtimeMachine?.decision?.maintenanceWindow ?? null;
              const decisionSummary = runtimeMachine?.decision?.summary ?? null;
              const usageCaseShort = compactText(usageCase, 92);
              const explanationShort = compactText(explanation, 126);
              const decisionSummaryShort = compactText(decisionSummary, 150);
              const rulDisplay = buildRulDisplay({
                machine: runtimeMachine,
                predictionMode:
                  runtimeMachine?.rulMode ?? runtimeMachine?.decision?.predictionMode ?? null,
                prediction: buildMachinePrediction(runtimeMachine),
                referenceLifetimeYears: runtimeMachine?.referenceLifetimeYears ?? null,
                referenceDays: runtimeMachine?.rulReferenceDays ?? null,
                localize: l,
              });

              return (
                <div
                  key={code}
                  id={`demo-story-${code}`}
                    className={cn(
                      "rounded-xl border border-border bg-card p-4",
                      code === focusedMachineId && "border-primary/30 ring-2 ring-primary/20",
                  )}
                >
                  <div className="flex flex-col gap-4 xl:flex-row">
                    <div className="xl:w-32">
                      <div className="text-sm font-bold text-foreground">{machineLabel}</div>
                      <div className="text-xs text-muted-foreground">
                        {scenario?.site ?? runtimeMachine?.city ?? "-"}
                      </div>
                    </div>

                    <div className="flex-1">
                      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-full bg-surface-3 px-2 py-0.5 text-foreground">
                          {getScenarioLabel(scenario)}
                        </span>
                        {profileLabel && (
                          <span className="rounded-full bg-surface-3 px-2 py-0.5 text-muted-foreground">
                            {profileLabel}
                          </span>
                        )}
                        {scenario?.load_band_kg && (
                          <span className="rounded-full bg-surface-3 px-2 py-0.5 text-muted-foreground">
                            {l("Plage de charge", "Load band", "Load band")}:{" "}
                            {scenario.load_band_kg[0]}-{scenario.load_band_kg[1]} kg
                          </span>
                        )}
                        {scenario?.cycles_per_day && (
                          <span className="rounded-full bg-surface-3 px-2 py-0.5 text-muted-foreground">
                            {l("Cycles/jour", "Cycles/day", "Cycles/day")}:{" "}
                            {Math.round(scenario.cycles_per_day)}
                          </span>
                        )}
                      </div>

                      {usageCaseShort && (
                        <div className="mb-2 text-xs text-secondary-foreground">{usageCaseShort}</div>
                      )}
                      {explanationShort && (
                        <div className="mb-3 text-xs text-muted-foreground">{explanationShort}</div>
                      )}

                      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-xl border border-border bg-surface-3 px-3 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {l("Marge restante (RUL)", "Remaining margin (RUL)", "Remaining margin (RUL)")}
                          </div>
                          <div className="mt-1 text-base font-bold text-foreground">
                            {rulDisplay.value}
                          </div>
                          <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                            {rulDisplay.sub}
                          </div>
                        </div>

                        <div className="rounded-xl border border-border bg-surface-3 px-3 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {l("État de santé en direct", "Live machine health (HI)", "Live machine health (HI)")}
                          </div>
                          <div className="mt-1 text-base font-bold text-foreground">
                            {typeof hi === "number" ? `${(hi * 100).toFixed(1)}%` : "--"}
                          </div>
                          <div className="mt-1">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${getHiTone(hi)}`}
                            >
                              {typeof hi === "number"
                                ? l("Lecture temps réel", "Runtime reading", "Runtime reading")
                                : l("En attente", "Pending", "Pending")}
                            </span>
                          </div>
                        </div>

                        <div className="rounded-xl border border-border bg-surface-3 px-3 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {l("Niveau de santé", "Health zone", "Health zone")}
                          </div>
                          <div className="mt-1 text-base font-bold text-foreground">
                            {zone ?? l("Initialisation", "Warm-up", "Warm-up")}
                          </div>
                          <div className="mt-1">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${getZoneTone(zone, hi)}`}
                            >
                              {zone ?? l("Analyse en cours", "Analysis warming up", "Analysis warming up")}
                            </span>
                          </div>
                        </div>

                        <div className="rounded-xl border border-border bg-surface-3 px-3 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {l("Action suggérée", "Suggested action", "Suggested action")}
                          </div>
                          <div className="mt-1 text-base font-bold text-foreground">
                            {maintenanceWindow ??
                              l("Suivi en direct", "Live follow-up", "Live follow-up")}
                          </div>
                          <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                            {currentLoad != null
                              ? `${l("Charge instantanée", "Live load", "Live load")}: ${currentLoad.toFixed(0)} kg`
                              : l(
                                  "L'action sera mise a jour des que la mesure sera disponible.",
                                  "The action will update as soon as the measurement is available.",
                                  "The action will update as soon as the measurement is available.",
                                )}
                          </div>
                        </div>
                      </div>

                      {decisionSummaryShort && (
                        <div className="mb-3 rounded-xl border border-border bg-surface-3 px-4 py-3 text-xs leading-relaxed text-secondary-foreground">
                          {decisionSummaryShort}
                        </div>
                      )}

                      {scenarioFactors.length > 0 && (
                        <div className="mb-3 rounded-xl border border-border bg-surface-3 p-3">
                          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {l(
                              "Facteurs suivis",
                              "Tracked factors",
                              "Tracked factors",
                            )}
                          </div>
                          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                            {scenarioFactors.map((factor) => {
                              const meta = getFactorMeta(factor.key);
                              return (
                                <div
                                  key={factor.key}
                                  className="rounded-lg border border-border bg-card px-3 py-2"
                                >
                                  <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
                                    <span className="font-semibold text-foreground">
                                      {meta.label}
                                    </span>
                                    <span className="font-mono text-muted-foreground">
                                      {Math.round(factor.value * 100)}%
                                    </span>
                                  </div>
                                  <div className="h-2 overflow-hidden rounded-full bg-surface-3">
                                    <div
                                      className={`h-full rounded-full ${meta.tone}`}
                                      style={{
                                        width: `${Math.max(4, Math.round(factor.value * 100))}%`,
                                      }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-muted-foreground">
                          {l("Progression", "Progress", "Progress")}:
                        </span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-10 text-right font-medium text-foreground">{pct}%</span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2 xl:w-40">
                      {typeof hi === "number" && (
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-semibold ${getHiTone(hi)}`}
                        >
                          HI: {(hi * 100).toFixed(1)}%
                        </span>
                      )}

                      {typeof simHI === "number" && typeof hi !== "number" && (
                        <span className="text-xs text-muted-foreground">
                          {l(
                            "Référence simulée",
                            "Simulated reference",
                            "Simulated reference",
                          )}
                          : {(simHI * 100).toFixed(1)}%
                        </span>
                      )}

                      {currentLoad != null && (
                        <span className="text-xs text-muted-foreground">
                          {l("Charge instantanée", "Live load", "Live load")}:{" "}
                          {currentLoad.toFixed(0)} kg
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
