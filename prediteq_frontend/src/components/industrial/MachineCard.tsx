import { STATUS_CONFIG } from "@/data/machines";
import { SVGGauge } from "@/components/industrial/SVGGauge";
import { MapPin, Clock, CheckCircle2 } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { useMachines } from "@/hooks/useMachines";

interface MachineCardProps {
  machineId: string;
  onClick: (id: string) => void;
}

// FPT (First Predicting Time, IEEE Std 1856-2017 §6.2) — au-dessus de ce
// seuil HI on n'affiche pas de pronostic chiffré ; la machine est en zone
// Excellent ISO 10816-3 « neuf / remis à neuf », aucun précurseur détecté.
const FPT_HI_THRESHOLD = 0.80;

export function MachineCard({ machineId, onClick }: MachineCardProps) {
  const { t } = useApp();
  const { machines } = useMachines();
  const m = machines.find(x => x.id === machineId);
  if (!m) return null;
  const cfg = STATUS_CONFIG[m.status];
  const hiKnown = typeof m.hi === "number";

  // RUL v2 — FPT gate : pas d'affichage chiffré quand la machine est saine
  const fptGated = m.rulMode === "no_prediction" || (hiKnown && m.hi >= FPT_HI_THRESHOLD);
  const rulText = fptGated
    ? `L10 ${m.l10Years ?? "—"}a`
    : m.rul
    ? `${m.rul}j`
    : '—';
  const rulSub = fptGated
    ? t("modal.rulNoPrecursor")
    : m.rulIntervalLow != null && m.rulIntervalHigh != null
      ? `${m.rulIntervalLabel ?? 'IC 80 %'} [${m.rulIntervalLow}–${m.rulIntervalHigh}j]${m.stopRecommended ? ' · arrêt recommandé' : ''}`
      : (!fptGated && m.rul && m.rulci
        ? `[${m.rul - m.rulci}–${m.rul + m.rulci}j]`
        : '');

  return (
    <div
      className="bg-card border border-border rounded-2xl p-5 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/15 border-t-2"
      style={{ borderTopColor: cfg.hex }}
      onClick={() => onClick(m.id)}
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-base font-bold text-foreground">{m.name}</div>
          <div className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
            <MapPin className="w-3 h-3" /> {m.loc}
          </div>
        </div>
        <span className={`status-pill ${cfg.pillClass}`}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'currentColor' }} />
          {cfg.label}
        </span>
      </div>

      <div className="flex items-center gap-5">
        <div className="flex-1 flex flex-col items-center">
          <SVGGauge value={m.hi} max={1} color={cfg.hex} label="Health Index" unit="%" />
        </div>
        <div className="w-px self-stretch bg-border" />
        <div className="flex-1 flex flex-col items-end">
          <div className="industrial-label">{t("modal.rulEstimated")}</div>
          {fptGated ? (
            <>
              <div
                className="flex items-center gap-1.5 text-base font-semibold mt-1"
                style={{ color: cfg.hex }}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{rulText}</span>
              </div>
              <div className="text-[0.65rem] text-muted-foreground mt-0.5 text-right leading-tight">
                {t("modal.rulNoPrecursor")}
              </div>
            </>
          ) : (
            <>
              <div className="font-mono text-3xl font-bold mt-1" style={{ color: cfg.hex }}>
                {rulText}
              </div>
              {rulSub && <div className="font-mono text-xs text-muted-foreground">{rulSub}</div>}
            </>
          )}
          {!hiKnown && (
            <div className="mt-1 text-[0.65rem] text-muted-foreground">
              {t("dash.awaitingSensors") ?? "Lecture en attente"}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 text-muted-foreground text-[0.7rem] mt-3">
        <Clock className="w-3 h-3" /> {m.last}
      </div>
    </div>
  );
}
