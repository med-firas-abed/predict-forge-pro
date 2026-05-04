import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Lang } from "@/contexts/AppContext";
import {
  fetchSimulatorStatus,
  scheduleSimulatorRefreshBurst,
  startSimulator,
  stopSimulator,
  type SimulatorStatus,
} from "@/lib/simulator";
import { repairText } from "@/lib/repairText";
import { toast } from "sonner";

const ACTIVE_POLL_MS = 1_000;
const IDLE_POLL_MS = 5_000;
const START_LOCK_GRACE_MS = 15_000;

type SharedSimulatorState = {
  status: SimulatorStatus | null;
  isStarting: boolean;
  isStopping: boolean;
  isBootstrapping: boolean;
  resetRequested: boolean;
  startRequestedAt: number | null;
};

const DEFAULT_SHARED_SIMULATOR_STATE: SharedSimulatorState = {
  status: null,
  isStarting: false,
  isStopping: false,
  isBootstrapping: false,
  resetRequested: false,
  startRequestedAt: null,
};

let sharedSimulatorState: SharedSimulatorState = DEFAULT_SHARED_SIMULATOR_STATE;

const listeners = new Set<() => void>();

function subscribeToSimulatorState(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSharedSimulatorState() {
  return sharedSimulatorState;
}

function setSharedSimulatorState(
  nextState:
    | SharedSimulatorState
    | Partial<SharedSimulatorState>
    | ((previousState: SharedSimulatorState) => SharedSimulatorState),
) {
  sharedSimulatorState =
    typeof nextState === "function"
      ? nextState(sharedSimulatorState)
      : { ...sharedSimulatorState, ...nextState };

  for (const listener of listeners) {
    listener();
  }
}

function hasLiveMachineState(status: SimulatorStatus | null) {
  if (!status) {
    return false;
  }

  return Object.values(status.machines ?? {}).some(
    (machine) =>
      machine &&
      (machine.hi_smooth != null || typeof machine.current === "number"),
  );
}

function localize(lang: Lang, fr: string, en: string, ar: string) {
  return repairText(lang === "fr" ? fr : lang === "en" ? en : ar);
}

type UseSimulatorControllerOptions = {
  lang: Lang;
  refetchMachines?: (() => Promise<unknown>) | null;
};

export function useSimulatorController({
  lang,
  refetchMachines,
}: UseSimulatorControllerOptions) {
  const queryClient = useQueryClient();
  const state = useSyncExternalStore(
    subscribeToSimulatorState,
    getSharedSimulatorState,
    getSharedSimulatorState,
  );
  const clearRefreshBurstRef = useRef<(() => void) | null>(null);

  const l = useCallback(
    (fr: string, en: string, ar: string) => localize(lang, fr, en, ar),
    [lang],
  );

  const clearRefreshBurst = useCallback(() => {
    clearRefreshBurstRef.current?.();
    clearRefreshBurstRef.current = null;
  }, []);

  const applyFetchedStatus = useCallback((data: SimulatorStatus) => {
    setSharedSimulatorState((previousState) => {
      const withinStartGraceWindow =
        previousState.isStarting &&
        previousState.startRequestedAt != null &&
        Date.now() - previousState.startRequestedAt < START_LOCK_GRACE_MS;
      const keepOptimisticLock = withinStartGraceWindow && !data.running;
      const nextStatus = keepOptimisticLock ? previousState.status ?? data : data;

      return {
        ...previousState,
        status: nextStatus,
        isStarting: keepOptimisticLock ? previousState.isStarting : false,
        isStopping: false,
        isBootstrapping: keepOptimisticLock
          ? true
          : nextStatus?.running === true && !hasLiveMachineState(data),
        startRequestedAt: keepOptimisticLock ? previousState.startRequestedAt : null,
      };
    });

    return data;
  }, []);

  const loadSimulatorStatus = useCallback(async () => {
    try {
      const data = await fetchSimulatorStatus();
      return applyFetchedStatus(data);
    } catch {
      return null;
    }
  }, [applyFetchedStatus]);

  const scheduleRefreshBurst = useCallback(() => {
    clearRefreshBurst();
    clearRefreshBurstRef.current = scheduleSimulatorRefreshBurst({
      queryClient,
      fetchStatus: loadSimulatorStatus,
    });

    if (refetchMachines) {
      void refetchMachines();
    }
  }, [clearRefreshBurst, loadSimulatorStatus, queryClient, refetchMachines]);

  const startSimulation = useCallback(
    async ({ speed }: { speed: number }) => {
      const snapshot = getSharedSimulatorState();

      if (snapshot.isStarting || snapshot.isStopping || snapshot.status?.running) {
        return;
      }

      setSharedSimulatorState((previousState) => ({
        ...previousState,
        status: {
          running: true,
          tick: previousState.status?.tick ?? 0,
          speed,
          machines: previousState.status?.machines ?? {},
        },
        isStarting: true,
        isBootstrapping: true,
        startRequestedAt: Date.now(),
      }));

      scheduleRefreshBurst();

      try {
        await startSimulator({
          speed,
          reset: getSharedSimulatorState().resetRequested,
        });
        setSharedSimulatorState((previousState) => ({
          ...previousState,
          resetRequested: false,
        }));
        toast.success(
          l("Simulateur démarré", "Simulator started", "Simulator started"),
        );
        window.setTimeout(() => {
          void loadSimulatorStatus();
        }, 200);
      } catch (error: unknown) {
        const message = (error as Error).message;

        if (message.includes("409")) {
          toast.info(
            l(
              "Le simulateur est déjà en cours.",
              "The simulator is already running.",
              "The simulator is already running.",
            ),
          );
          await loadSimulatorStatus();
          return;
        }

        if (
          message.toLowerCase().includes("signal aborted") ||
          message.toLowerCase().includes("aborted")
        ) {
          toast.info(
            l(
              "Le simulateur finalise encore son contexte ML. Les données en direct arrivent dans quelques secondes.",
              "The simulator is still preparing its ML context. Live data should appear in a few seconds.",
              "The simulator is still preparing its ML context. Live data should appear in a few seconds.",
            ),
          );
          scheduleRefreshBurst();
          return;
        }

        clearRefreshBurst();
        setSharedSimulatorState((previousState) => ({
          ...previousState,
          status: previousState.status
            ? { ...previousState.status, running: false }
            : null,
          isStarting: false,
          isBootstrapping: false,
          startRequestedAt: null,
        }));
        toast.error(message);
      }
    },
    [clearRefreshBurst, l, loadSimulatorStatus, scheduleRefreshBurst],
  );

  const pauseSimulation = useCallback(async () => {
    const snapshot = getSharedSimulatorState();

    if (snapshot.isStarting || snapshot.isStopping || !snapshot.status?.running) {
      return;
    }

    setSharedSimulatorState((previousState) => ({
      ...previousState,
      isStopping: true,
    }));

    try {
      await stopSimulator();
      toast.success(
        l("Simulation mise en pause", "Simulation paused", "Simulation paused"),
      );
      clearRefreshBurst();

      const data = await loadSimulatorStatus();

      if (!data) {
        setSharedSimulatorState((previousState) => ({
          ...previousState,
          status: previousState.status
            ? { ...previousState.status, running: false }
            : null,
          isStarting: false,
          isStopping: false,
          isBootstrapping: false,
          startRequestedAt: null,
        }));
      }
    } catch (error: unknown) {
      const message = (error as Error).message;

      if (message.includes("409")) {
        setSharedSimulatorState((previousState) => ({
          ...previousState,
          status: previousState.status
            ? { ...previousState.status, running: false }
            : null,
          isStarting: false,
          isStopping: false,
          isBootstrapping: false,
          startRequestedAt: null,
        }));
        await loadSimulatorStatus();
        toast.info(
          l(
            "Le simulateur est déjà à l'arrêt.",
            "The simulator is already stopped.",
            "The simulator is already stopped.",
          ),
        );
        return;
      }

      setSharedSimulatorState((previousState) => ({
        ...previousState,
        isStopping: false,
      }));
      toast.error(message);
    }
  }, [clearRefreshBurst, l, loadSimulatorStatus]);

  const toggleResetRequest = useCallback(() => {
    const snapshot = getSharedSimulatorState();

    if (snapshot.isStarting || snapshot.isStopping || snapshot.status?.running) {
      return;
    }

    const nextResetRequested = !snapshot.resetRequested;

    setSharedSimulatorState((previousState) => ({
      ...previousState,
      resetRequested: nextResetRequested,
    }));

    toast.info(
      nextResetRequested
        ? l(
            "Réinitialisation prête : le prochain démarrage repartira de l'état initial.",
            "Reset armed: the next start will relaunch from the initial state.",
            "Reset armed: the next start will relaunch from the initial state.",
          )
        : l(
            "Réinitialisation annulée.",
            "Reset cleared.",
            "Reset cleared.",
          ),
    );
  }, [l]);

  useEffect(() => {
    void loadSimulatorStatus();

    return () => {
      clearRefreshBurst();
    };
  }, [clearRefreshBurst, loadSimulatorStatus]);

  useEffect(() => {
    const intervalMs =
      state.status?.running || state.isStarting || state.isBootstrapping
        ? ACTIVE_POLL_MS
        : IDLE_POLL_MS;

    const intervalId = window.setInterval(() => {
      void loadSimulatorStatus();
    }, intervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    loadSimulatorStatus,
    state.isBootstrapping,
    state.isStarting,
    state.status?.running,
  ]);

  return {
    simStatus: state.status,
    isRunning: state.status?.running === true,
    isStarting: state.isStarting,
    isStopping: state.isStopping,
    isBootstrapping: state.isBootstrapping,
    isActive: state.status?.running === true || state.isStarting || state.isBootstrapping,
    isStartLocked:
      state.status?.running === true ||
      state.isStarting ||
      state.isBootstrapping ||
      state.isStopping,
    canPause:
      state.status?.running === true && !state.isStarting && !state.isStopping,
    canReset:
      state.status?.running !== true &&
      !state.isStarting &&
      !state.isStopping &&
      !state.isBootstrapping,
    resetRequested: state.resetRequested,
    loadSimulatorStatus,
    startSimulation,
    pauseSimulation,
    toggleResetRequest,
  };
}
