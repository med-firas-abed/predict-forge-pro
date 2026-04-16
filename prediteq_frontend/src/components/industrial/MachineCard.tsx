import { STATUS_CONFIG } from "@/data/machines";
import { SVGGauge } from "@/components/industrial/SVGGauge";
import { MapPin, Clock } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { useMachines } from "@/hooks/useMachines";

interface MachineCardProps {
  machineId: string;
  onClick: (id: string) => void;
}

export function MachineCard({ machineId, onClick }: MachineCardProps) {
  const { t } = useApp();
  const { machines } = useMachines();
  const m = machines.find(x => x.id === machineId);
  if (!m) return null;
  const cfg = STATUS_CONFIG[m.status];
  const rulText = m.rul ? `${m.rul}j` : '—';
  const rulSub = m.rul && m.rulci ? `[${m.rul - m.rulci}–${m.rul + m.rulci}j]` : '';

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
          <div className="font-mono text-3xl font-bold mt-1" style={{ color: cfg.hex }}>
            {rulText}
          </div>
          {rulSub && <div className="font-mono text-xs text-muted-foreground">{rulSub}</div>}
        </div>
      </div>

      <div className="flex items-center gap-1 text-muted-foreground text-[0.7rem] mt-3">
        <Clock className="w-3 h-3" /> {m.last}
      </div>
    </div>
  );
}
