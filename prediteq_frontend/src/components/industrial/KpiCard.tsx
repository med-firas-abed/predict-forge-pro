import { ReactNode } from "react";

interface KpiCardProps {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  sub: string;
  variant: 'blue' | 'green' | 'warn' | 'danger';
  trend?: ReactNode;
  children?: ReactNode;
}

const VARIANT_STYLES = {
  blue: {
    accent: 'text-primary',
    iconBg: 'bg-primary/10',
    topBar: 'from-primary to-primary/40',
  },
  green: {
    accent: 'text-success',
    iconBg: 'bg-success/10',
    topBar: 'from-success to-success/40',
  },
  warn: {
    accent: 'text-warning',
    iconBg: 'bg-warning/10',
    topBar: 'from-warning to-warning/40',
  },
  danger: {
    accent: 'text-destructive',
    iconBg: 'bg-destructive/10',
    topBar: 'from-destructive to-destructive/40',
  },
};

export function KpiCard({ icon, label, value, sub, variant, trend, children }: KpiCardProps) {
  const styles = VARIANT_STYLES[variant];

  return (
    <div className="relative bg-card border border-border rounded-2xl p-4 overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-premium group" style={{ transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)' }}>
      {/* Top accent bar — gradient */}
      <div className={`absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r ${styles.topBar}`} />

      {/* Icon + Label row */}
      <div className="flex items-center gap-2.5 mb-2">
        <div className={`w-8 h-8 rounded-lg ${styles.iconBg} ${styles.accent} flex items-center justify-center flex-shrink-0`}>
          <span className="icon-scale [&>svg]:w-4 [&>svg]:h-4">{icon}</span>
        </div>
        <div className="industrial-label">{label}</div>
      </div>

      {/* Value */}
      <div className={`kpi-value ${styles.accent}`}>{value}</div>

      {/* Trend badge */}
      {trend && (
        <div className="absolute top-4 right-4">
          {trend}
        </div>
      )}

      {/* Sub text */}
      {sub && <div className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{sub}</div>}

      {children}
    </div>
  );
}

export function TrendBadge({ children, variant }: { children: ReactNode; variant: 'up' | 'down' }) {
  return (
    <span className={`text-[0.65rem] font-semibold px-2.5 py-1 rounded-full ${
      variant === 'down'
        ? 'bg-destructive/10 text-destructive'
        : 'bg-success/10 text-success'
    }`}>
      {children}
    </span>
  );
}
