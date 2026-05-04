import type { QueryClient } from "@tanstack/react-query";
import type { DemoScenario } from "@/data/machines";
import { apiFetch } from "@/lib/api";

export interface SimulatorMachineStatus {
  total?: number;
  current?: number;
  profile?: string | null;
  load_kg?: number | null;
  start_tick?: number;
  target_runtime_hi?: number;
  scenario?: DemoScenario;
  simulated_hi?: number;
  current_load_kg?: number;
  hi_smooth?: number | null;
  zone?: string | null;
  uptime_s?: number | null;
}

export interface SimulatorStatus {
  running: boolean;
  tick: number;
  speed: number;
  machines: Record<string, SimulatorMachineStatus>;
}

export const SIMULATOR_ROUTE = "/simulateur";
export const SIMULATOR_AUTOSTART_PARAM = "autostart";
export const SIMULATOR_STATUS_TIMEOUT_MS = 10_000;
export const SIMULATOR_START_TIMEOUT_MS = 120_000;

const SIMULATOR_REFRESH_BURST_DELAYS_MS = [0, 300, 800, 1_500, 2_500, 4_000, 6_000];

export async function fetchSimulatorStatus(): Promise<SimulatorStatus> {
  return apiFetch<SimulatorStatus>("/simulator/status", {
    timeoutMs: SIMULATOR_STATUS_TIMEOUT_MS,
  });
}

export async function startSimulator({
  speed,
  reset,
}: {
  speed: number;
  reset: boolean;
}) {
  return apiFetch<Record<string, unknown>>(
    `/simulator/start?speed=${speed}${reset ? "&reset=true" : ""}`,
    {
      method: "POST",
      timeoutMs: SIMULATOR_START_TIMEOUT_MS,
    },
  );
}

export async function stopSimulator() {
  return apiFetch("/simulator/stop", { method: "POST" });
}

export function scheduleSimulatorRefreshBurst({
  queryClient,
  fetchStatus,
  machineCode,
}: {
  queryClient: QueryClient;
  fetchStatus?: () => Promise<unknown>;
  machineCode?: string;
}) {
  const timeoutIds = SIMULATOR_REFRESH_BURST_DELAYS_MS.map((delay) =>
    window.setTimeout(() => {
      if (fetchStatus) {
        void fetchStatus();
      }

      void queryClient.invalidateQueries({ queryKey: ["machines"] });
      void queryClient.invalidateQueries({ queryKey: ["diagnostics"] });

      if (machineCode) {
        void queryClient.invalidateQueries({
          queryKey: ["machine-sensors", machineCode],
        });
        return;
      }

      void queryClient.invalidateQueries({ queryKey: ["machine-sensors"] });
    }, delay),
  );

  return () => {
    for (const timeoutId of timeoutIds) {
      window.clearTimeout(timeoutId);
    }
  };
}
