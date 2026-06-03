import { API_BASE } from "@/lib/apiBase";

const BACKEND_WARMUP_INTERVAL_MS = 4 * 60_000;
const BACKEND_WARMUP_TIMEOUT_MS = 25_000;

let installedCleanup: (() => void) | null = null;
let inFlightWarmup: Promise<void> | null = null;

function shouldWarmBackend() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined" &&
    API_BASE === "/api"
  );
}

function isPageVisible() {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

function isNetworkAvailable() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function warmBackend() {
  if (!shouldWarmBackend() || !isNetworkAvailable()) {
    return Promise.resolve();
  }

  if (inFlightWarmup) {
    return inFlightWarmup;
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), BACKEND_WARMUP_TIMEOUT_MS);

  inFlightWarmup = fetch(`${API_BASE}/health`, {
    method: "GET",
    cache: "no-store",
    signal: controller.signal,
    headers: {
      Accept: "application/json",
    },
  })
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => {
      clearTimeout(timeoutId);
      inFlightWarmup = null;
    });

  return inFlightWarmup;
}

export function installBackendWarmup() {
  if (installedCleanup) {
    return installedCleanup;
  }

  if (!shouldWarmBackend()) {
    return () => undefined;
  }

  let heartbeatId: number | null = null;

  const refreshHeartbeat = () => {
    if (heartbeatId !== null) {
      clearInterval(heartbeatId);
      heartbeatId = null;
    }

    if (!isPageVisible()) {
      return;
    }

    heartbeatId = window.setInterval(() => {
      void warmBackend();
    }, BACKEND_WARMUP_INTERVAL_MS);
  };

  const handleVisibilityChange = () => {
    if (isPageVisible()) {
      void warmBackend();
    }
    refreshHeartbeat();
  };

  const handleOnline = () => {
    if (isPageVisible()) {
      void warmBackend();
    }
  };

  void warmBackend();
  refreshHeartbeat();

  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("online", handleOnline);

  installedCleanup = () => {
    if (heartbeatId !== null) {
      clearInterval(heartbeatId);
    }
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("online", handleOnline);
    installedCleanup = null;
  };

  return installedCleanup;
}
