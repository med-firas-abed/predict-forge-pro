import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api";
import { safeStorageGetJson, safeStorageSet } from "@/lib/browserStorage";
import {
  flushPendingTaskQueue,
  getPendingTaskQueueCount,
  TASK_QUEUE_EVENT_NAME,
} from "@/lib/runtimeDataRepository";

type ResilienceStatus = "ok" | "degraded" | "offline" | "starting";
type CapabilityState =
  | "ok"
  | "queued_only"
  | "local_fallback"
  | "unavailable"
  | "stale_only"
  | "cached_only"
  | "starting"
  | "unknown";

interface BackendResilienceSnapshot {
  status?: string;
  checked_at_utc?: string;
  active_engines?: number;
  active_machines?: number;
  capabilities?: Partial<Record<string, CapabilityState>>;
  dependencies?: Partial<Record<string, string>>;
}

interface StoredResilienceSnapshot {
  status: ResilienceStatus;
  source: "live" | "cached";
  checkedAtUtc: string | null;
  activeEngines: number;
  activeMachines: number;
  capabilities: Record<string, CapabilityState>;
  dependencies: Record<string, string>;
}

export interface ResilienceState extends StoredResilienceSnapshot {
  taskQueueCount: number;
  isRefreshing: boolean;
  isFlushing: boolean;
  lastError: string | null;
  refresh: () => Promise<void>;
  flushQueue: () => Promise<void>;
}

const RESILIENCE_CACHE_KEY = "prediteq-resilience-v1";
const RESILIENCE_POLL_MS = 15_000;
const RESILIENCE_TRANSIENT_GRACE_MS = 20_000;
const RESILIENCE_FAST_RETRY_MS = 2_000;
const DEFAULT_CAPABILITIES: Record<string, CapabilityState> = {
  maintenance_writes: "queued_only",
  planner: "local_fallback",
  ai_reports: "local_fallback",
  email_alerts: "unavailable",
  live_telemetry: "stale_only",
  machine_reads: "cached_only",
};
const DEFAULT_DEPENDENCIES: Record<string, string> = {
  supabase: "unknown",
  groq: "unknown",
  smtp: "unknown",
  mqtt: "unknown",
  live_ingest: "unknown",
};

const DEFAULT_STORED_SNAPSHOT: StoredResilienceSnapshot = {
  status: "starting",
  source: "cached",
  checkedAtUtc: null,
  activeEngines: 0,
  activeMachines: 0,
  capabilities: DEFAULT_CAPABILITIES,
  dependencies: DEFAULT_DEPENDENCIES,
};

const ResilienceContext = createContext<ResilienceState | null>(null);

function toStoredSnapshot(
  payload: BackendResilienceSnapshot,
  source: "live" | "cached",
): StoredResilienceSnapshot {
  const status =
    payload.status === "ok" ||
    payload.status === "degraded" ||
    payload.status === "starting"
      ? payload.status
      : "degraded";

  return {
    status,
    source,
    checkedAtUtc: payload.checked_at_utc ?? null,
    activeEngines:
      typeof payload.active_engines === "number" ? payload.active_engines : 0,
    activeMachines:
      typeof payload.active_machines === "number" ? payload.active_machines : 0,
    capabilities: {
      ...DEFAULT_CAPABILITIES,
      ...(payload.capabilities ?? {}),
    },
    dependencies: {
      ...DEFAULT_DEPENDENCIES,
      ...(payload.dependencies ?? {}),
    },
  };
}

function readStoredSnapshot(): StoredResilienceSnapshot {
  return safeStorageGetJson<StoredResilienceSnapshot>(
    RESILIENCE_CACHE_KEY,
    DEFAULT_STORED_SNAPSHOT,
  );
}

function writeStoredSnapshot(snapshot: StoredResilienceSnapshot) {
  safeStorageSet(RESILIENCE_CACHE_KEY, JSON.stringify(snapshot));
}

export function resolveFallbackResilienceStatus(
  hadLiveSuccessInSession: boolean,
  lastLiveSuccessAtMs: number | null,
  sessionStartedAtMs: number,
  nowMs: number,
): ResilienceStatus {
  if (!hadLiveSuccessInSession) {
    return nowMs - sessionStartedAtMs < RESILIENCE_TRANSIENT_GRACE_MS
      ? "starting"
      : "offline";
  }
  if (
    typeof lastLiveSuccessAtMs === "number" &&
    nowMs - lastLiveSuccessAtMs < RESILIENCE_TRANSIENT_GRACE_MS
  ) {
    return "starting";
  }
  return "offline";
}

export function ResilienceProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [snapshot, setSnapshot] = useState<StoredResilienceSnapshot>(() =>
    readStoredSnapshot(),
  );
  const [taskQueueCount, setTaskQueueCount] = useState(() =>
    getPendingTaskQueueCount(),
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isFlushing, setIsFlushing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const sessionStartedAtRef = useRef(Date.now());
  const hadLiveSuccessRef = useRef(false);
  const lastLiveSuccessAtRef = useRef<number | null>(null);
  const retryTimerRef = useRef<number | null>(null);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const invalidateTaskViews = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["gmao_taches"] });
    void queryClient.invalidateQueries({ queryKey: ["machines"] });
  }, [queryClient]);

  const flushQueue = useCallback(async () => {
    if (isFlushing) return;

    setIsFlushing(true);
    try {
      const result = await flushPendingTaskQueue();
      setTaskQueueCount(result.remainingCount);
      if (result.syncedCount > 0) {
        invalidateTaskViews();
      }
      setLastError(result.lastError);
    } finally {
      setIsFlushing(false);
    }
  }, [invalidateTaskViews, isFlushing]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const payload = await apiFetch<BackendResilienceSnapshot>("/health/resilience", {
        timeoutMs: 5_000,
      });
      hadLiveSuccessRef.current = true;
      lastLiveSuccessAtRef.current = Date.now();
      clearRetryTimer();
      const nextSnapshot = toStoredSnapshot(payload, "live");
      writeStoredSnapshot(nextSnapshot);
      setSnapshot(nextSnapshot);
      const nextQueueCount = getPendingTaskQueueCount();
      setTaskQueueCount(nextQueueCount);
      setLastError(null);

      if (
        nextQueueCount > 0 &&
        nextSnapshot.capabilities.maintenance_writes !== "queued_only"
      ) {
        await flushQueue();
      }
    } catch (error) {
      const cachedSnapshot = readStoredSnapshot();
      const fallbackStatus = resolveFallbackResilienceStatus(
        hadLiveSuccessRef.current,
        lastLiveSuccessAtRef.current,
        sessionStartedAtRef.current,
        Date.now(),
      );
      setSnapshot({
        ...cachedSnapshot,
        status: fallbackStatus,
        source: "cached",
      });
      setTaskQueueCount(getPendingTaskQueueCount());
      setLastError(error instanceof Error ? error.message : String(error));

      if (fallbackStatus === "starting" && retryTimerRef.current === null) {
        retryTimerRef.current = window.setTimeout(() => {
          retryTimerRef.current = null;
          void refresh();
        }, RESILIENCE_FAST_RETRY_MS);
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [clearRetryTimer, flushQueue]);

  useEffect(() => {
    void refresh();

    const intervalId = window.setInterval(() => {
      void refresh();
    }, RESILIENCE_POLL_MS);

    const handleQueueChange = () => {
      setTaskQueueCount(getPendingTaskQueueCount());
    };

    window.addEventListener(TASK_QUEUE_EVENT_NAME, handleQueueChange);

    return () => {
      clearInterval(intervalId);
      clearRetryTimer();
      window.removeEventListener(TASK_QUEUE_EVENT_NAME, handleQueueChange);
    };
  }, [clearRetryTimer, refresh]);

  const value = useMemo<ResilienceState>(
    () => ({
      ...snapshot,
      taskQueueCount,
      isRefreshing,
      isFlushing,
      lastError,
      refresh,
      flushQueue,
    }),
    [flushQueue, isFlushing, isRefreshing, lastError, refresh, snapshot, taskQueueCount],
  );

  return (
    <ResilienceContext.Provider value={value}>
      {children}
    </ResilienceContext.Provider>
  );
}

export function useResilience() {
  const context = useContext(ResilienceContext);
  if (!context) {
    throw new Error("useResilience must be used within ResilienceProvider");
  }
  return context;
}
