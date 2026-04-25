import { ReactNode } from "react";

interface AlertItemProps {
  severity: 'crit' | 'warn' | 'info';
  icon: ReactNode;
  title: string;
  machine: string;
  message: string;
  time: string;
}

const SEV_STYLES = {
  crit: {
    bg: 'bg-destructive/5',
    border: 'border-l-destructive',
    iconBg: 'bg-destructive/15 text-destructive',
  },
  warn: {
    bg: 'bg-warning/5',
    border: 'border-l-warning',
    iconBg: 'bg-warning/10 text-warning',
  },
  info: {
    bg: 'bg-primary/5',
    border: 'border-l-primary',
    iconBg: 'bg-primary/10 text-primary',
  },
};

export function AlertItem({ severity, icon, title, machine, message, time }: AlertItemProps) {
  const s = SEV_STYLES[severity];

  return (
    <div className={`flex items-start gap-3 p-4 rounded-xl border-l-[3px] ${s.border} ${s.bg} cursor-pointer transition-transform hover:translate-x-0.5`}>
      <div className={`w-8 h-8 rounded-xl ${s.iconBg} flex items-center justify-center text-sm flex-shrink-0 mt-0.5`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="text-xs text-muted-foreground mt-1">{machine}</div>
        <div className="text-xs text-secondary-foreground mt-1.5 leading-relaxed">{message}</div>
      </div>
      <div className="font-mono text-[0.65rem] text-muted-foreground whitespace-nowrap ml-auto">
        {time}
      </div>
    </div>
  );
}
