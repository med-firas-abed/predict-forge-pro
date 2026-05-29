import { AlertTriangle, RefreshCw, WifiOff } from "lucide-react";

import { useResilience } from "@/contexts/ResilienceContext";

function toneClasses(status: "ok" | "degraded" | "offline" | "starting") {
  if (status === "offline") {
    return "border-destructive/20 bg-destructive/10 text-destructive";
  }
  if (status === "degraded" || status === "starting") {
    return "border-warning/20 bg-warning/10 text-warning";
  }
  return "border-primary/20 bg-primary/10 text-primary";
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

  const waitingOnSync = taskQueueCount > 0;
  const message =
    status === "offline"
      ? "Connexion backend indisponible - l'application garde les dernieres donnees en cache et passe en lecture degradee."
      : status === "starting"
        ? "Le backend redemarre - les vues locales restent disponibles pendant l'initialisation."
        : capabilities.maintenance_writes === "queued_only"
          ? "Le service est degrade - les actions de maintenance restent en file locale jusqu'au retour de la synchro."
          : "Une ou plusieurs fonctions tournent en mode secours pour eviter une coupure visible.";

  const detail = [
    capabilities.machine_reads === "cached_only" ? "lecture depuis le cache" : null,
    capabilities.ai_reports === "local_fallback" ? "rapport IA local" : null,
    capabilities.planner === "local_fallback" ? "planificateur local" : null,
    capabilities.live_telemetry === "stale_only" ? "telemetrie figee" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={`border-b ${toneClasses(status)}`}>
      <div className="mx-auto flex max-w-[1400px] flex-col gap-2 px-6 py-2 text-xs lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex items-start gap-2">
          {status === "offline" ? (
            <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          )}
          <div className="space-y-0.5">
            <div className="font-semibold">{message}</div>
            <div className="text-[0.7rem] text-foreground/80">
              {waitingOnSync
                ? `${taskQueueCount} action(s) en attente de synchronisation.`
                : "Le service passe automatiquement sur un plan B avant d'afficher un echec."}
              {detail ? ` ${detail}.` : ""}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1 rounded-lg border border-current/15 px-3 py-1.5 text-[0.7rem] font-semibold text-current transition-all hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`} />
            Actualiser
          </button>
          {waitingOnSync ? (
            <button
              type="button"
              onClick={() => void flushQueue()}
              disabled={isFlushing}
              className="inline-flex items-center gap-1 rounded-lg bg-current px-3 py-1.5 text-[0.7rem] font-semibold text-background transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-3 w-3 ${isFlushing ? "animate-spin" : ""}`} />
              Resynchroniser
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
