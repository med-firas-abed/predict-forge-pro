import { AlertTriangle, RefreshCw, WifiOff } from "lucide-react";

import { useResilience } from "@/contexts/ResilienceContext";

function toneClasses(status: "ok" | "degraded" | "offline" | "starting") {
  if (status === "offline") {
    return {
      card: "border-rose-200/80 bg-rose-50/85 text-rose-900",
      icon: "bg-rose-100 text-rose-600",
      title: "text-rose-700",
      detail: "text-rose-900/70",
      button: "border-rose-200 bg-white/70 text-rose-700 hover:bg-white",
      primaryButton: "bg-rose-600 text-white hover:bg-rose-700",
    };
  }

  if (status === "degraded" || status === "starting") {
    return {
      card: "border-amber-200/80 bg-amber-50/80 text-amber-950",
      icon: "bg-amber-100 text-amber-600",
      title: "text-amber-700",
      detail: "text-amber-950/70",
      button: "border-amber-200 bg-white/70 text-amber-700 hover:bg-white",
      primaryButton: "bg-amber-600 text-white hover:bg-amber-700",
    };
  }

  return {
    card: "border-emerald-200/80 bg-emerald-50/85 text-emerald-950",
    icon: "bg-emerald-100 text-emerald-600",
    title: "text-emerald-700",
    detail: "text-emerald-950/70",
    button: "border-emerald-200 bg-white/70 text-emerald-700 hover:bg-white",
    primaryButton: "bg-emerald-600 text-white hover:bg-emerald-700",
  };
}

export function ResilienceBanner() {
  const {
    status,
    taskQueueCount,
    capabilities,
    isRefreshing,
    isFlushing,
    refresh,
    flushQueue,
  } = useResilience();

  if (status === "ok" && taskQueueCount === 0) {
    return null;
  }

  const tone = toneClasses(status);
  const waitingOnSync = taskQueueCount > 0;
  const message =
    status === "offline"
      ? "Connexion temporairement indisponible"
      : status === "starting"
        ? "Reconnexion en cours"
        : capabilities.maintenance_writes === "queued_only"
          ? "Certaines fonctions tournent en mode secours"
          : "Mode secours actif";

  const detailItems = [
    capabilities.machine_reads === "cached_only" ? "Lecture depuis le cache" : null,
    capabilities.ai_reports === "local_fallback" ? "Rapport local" : null,
    capabilities.planner === "local_fallback" ? "Planification locale" : null,
    capabilities.live_telemetry === "stale_only" ? "Télémétrie figée" : null,
  ].filter((item): item is string => Boolean(item));

  return (
    <div className="mx-auto max-w-[1400px] px-6 pt-4 lg:px-8">
      <div
        className={`rounded-2xl border px-4 py-3 shadow-[0_14px_30px_-24px_rgba(15,23,42,0.35)] ${tone.card}`}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tone.icon}`}
            >
              {status === "offline" ? (
                <WifiOff className="h-4 w-4" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )}
            </div>
            <div className="space-y-1">
              <div className={`text-sm font-semibold ${tone.title}`}>{message}</div>
              <div className={`text-xs leading-relaxed ${tone.detail}`}>
                {status === "offline"
                  ? "Les dernières données restent visibles pendant la reprise du service."
                  : status === "starting"
                    ? "Les vues locales restent accessibles pendant l'initialisation."
                    : "L'application garde une lecture stable pendant le retour du service."}{" "}
                {waitingOnSync
                  ? `${taskQueueCount} action(s) en attente de synchronisation.`
                  : "La bascule se fait automatiquement si nécessaire."}
              </div>
              {detailItems.length > 0 ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  {detailItems.map((item) => (
                    <span
                      key={item}
                      className="rounded-full border border-black/5 bg-white/55 px-2.5 py-1 text-[0.68rem] font-medium text-foreground/70"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2 self-end lg:self-auto">
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={isRefreshing}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-60 ${tone.button}`}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              Rafraîchir
            </button>
            {waitingOnSync ? (
              <button
                type="button"
                onClick={() => void flushQueue()}
                disabled={isFlushing}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-60 ${tone.primaryButton}`}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isFlushing ? "animate-spin" : ""}`} />
                Resynchroniser
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
