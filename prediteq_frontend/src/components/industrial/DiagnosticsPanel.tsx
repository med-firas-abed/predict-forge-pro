import { useMemo } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  Gauge,
  HardHat,
  Info,
  Loader2,
  Settings2,
  Stethoscope,
  Sparkles,
  Thermometer,
  Activity,
  Zap,
  Waves,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { KpiCard } from "@/components/industrial/KpiCard";
import { useApp } from "@/contexts/AppContext";
import { repairText } from "@/lib/repairText";
import {
  useDiagnostics,
  type ConfidenceLevel,
  type Diagnosis,
  type RulInterval,
  type RulExplain,
  type DisclaimersBundle,
  type StressIndex,
  type StressBand,
  type RulV2Response,
  type RulV2L10,
} from "@/hooks/useDiagnostics";

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Palette â€” reprend exactement les classes du reste de l'app
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

const CONFIDENCE_VARIANT: Record<ConfidenceLevel, "green" | "warn" | "danger"> = {
  high: "green",
  medium: "warn",
  low: "danger",
};

const SEVERITY_STYLES: Record<
  Diagnosis["severity"],
  { bg: string; border: string; iconBg: string; icon: React.ElementType; label: string }
> = {
  critical: {
    bg: "bg-destructive/5",
    border: "border-l-destructive",
    iconBg: "bg-destructive/15 text-destructive",
    icon: AlertCircle,
    label: "Critique",
  },
  warning: {
    bg: "bg-warning/5",
    border: "border-l-warning",
    iconBg: "bg-warning/10 text-warning",
    icon: AlertTriangle,
    label: "Avertissement",
  },
  info: {
    bg: "bg-primary/5",
    border: "border-l-primary",
    iconBg: "bg-primary/10 text-primary",
    icon: Info,
    label: "Information",
  },
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Sub-component : Carte RUL avec intervalle
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function RulIntervalCard({
  rul,
  badgeLabels,
}: {
  rul: RulInterval;
  badgeLabels: DisclaimersBundle["badge_labels"];
}) {
  const { lang } = useApp();
  const badge = badgeLabels[rul.confidence];
  const variant = CONFIDENCE_VARIANT[rul.confidence];
  const l = (fr: string, en: string, ar: string) =>
    repairText(lang === "fr" ? fr : lang === "en" ? en : ar);

  const hasInterval =
    rul.rul_days_p10 !== null && rul.rul_days_p90 !== null && rul.rul_days > 0;

  // Bar geometry â€” p10/p90 positioned within [0, p95 or 2*rul_days]
  const maxScale = Math.max(
    rul.rul_days_p95 ?? rul.rul_days_p90 ?? rul.rul_days * 1.5,
    rul.rul_days * 1.2,
    1,
  );
  const pctMean = Math.min(100, (rul.rul_days / maxScale) * 100);
  const pctLo = hasInterval ? Math.min(100, (rul.rul_days_p10! / maxScale) * 100) : pctMean;
  const pctHi = hasInterval ? Math.min(100, (rul.rul_days_p90! / maxScale) * 100) : pctMean;
  const bandWidth = Math.max(2, pctHi - pctLo);

  return (
    <KpiCard
      icon={<Clock className="w-5 h-5" />}
      label={l("RUL avec intervalle (IC 80 %)", "RUL with interval (80% CI)", "العمر المتبقي مع المجال (80% CI)")}
      value={
        <>
          {Math.round(rul.rul_days)}
          <span className="text-base opacity-40"> j</span>
        </>
      }
      sub={
        hasInterval
          ? l(
              `Plage probable : ${Math.round(rul.rul_days_p10!)}-${Math.round(rul.rul_days_p90!)} j · ${rul.n_trees ?? 300} arbres`,
              `Likely range: ${Math.round(rul.rul_days_p10!)}-${Math.round(rul.rul_days_p90!)} d · ${rul.n_trees ?? 300} trees`,
              `النطاق المرجح: ${Math.round(rul.rul_days_p10!)}-${Math.round(rul.rul_days_p90!)} ي · ${rul.n_trees ?? 300} شجرة`,
            )
          : l("Intervalle indisponible (mode simulateur ou warming-up)", "Interval unavailable (simulator or warming-up mode)", "المجال غير متاح (وضع المحاكي او التهيئة)")
      }
      variant={variant}
    >
      {/* Confidence chip */}
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <span
          className="text-[0.65rem] font-semibold px-2.5 py-1 rounded-full inline-flex items-center gap-1"
          style={{
            backgroundColor: `${badge.color_hex}1a`,
            color: badge.color_hex,
          }}
          title={badge.tooltip}
        >
          <span>{badge.icon}</span>
          {badge.label}
        </span>
        {rul.cvi !== null && (
          <span className="text-[0.65rem] text-muted-foreground font-mono">
            CVI = {rul.cvi.toFixed(3)}
          </span>
        )}
      </div>

      {/* Interval bar */}
      {hasInterval && (
        <div className="mt-4">
          <div className="relative h-2.5 bg-surface-3 rounded-full overflow-hidden">
            <div
              className="absolute h-full rounded-full"
              style={{
                left: `${pctLo}%`,
                width: `${bandWidth}%`,
                backgroundColor: `${badge.color_hex}4d`,
              }}
            />
            <div
              className="absolute top-0 h-full w-[2px]"
              style={{
                left: `calc(${pctMean}% - 1px)`,
                backgroundColor: badge.color_hex,
              }}
            />
          </div>
          <div className="flex justify-between mt-1.5 text-[0.6rem] text-muted-foreground font-mono">
            <span>p10 {Math.round(rul.rul_days_p10!)} j</span>
            <span>moy. {Math.round(rul.rul_days)} j</span>
            <span>p90 {Math.round(rul.rul_days_p90!)} j</span>
          </div>
        </div>
      )}
    </KpiCard>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Sub-component : Liste des diagnostics (rÃ¨gles ISO/IEC/IEEE)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function DiagnosisList({ diagnoses }: { diagnoses: Diagnosis[] }) {
  const { lang } = useApp();
  const l = (fr: string, en: string, ar: string) =>
    repairText(lang === "fr" ? fr : lang === "en" ? en : ar);
  if (diagnoses.length === 0) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-xl border-l-[3px] border-l-success bg-success/5">
        <div className="w-8 h-8 rounded-xl bg-success/10 text-success flex items-center justify-center flex-shrink-0">
          <CheckCircle2 className="w-4 h-4" />
        </div>
        <div>
          <div className="text-sm font-semibold text-foreground">
            {l("Fonctionnement nominal", "Nominal operation", "تشغيل اسمي")}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {l(
              "Tous les indicateurs mesures sont dans leurs plages admissibles normatives.",
              "All measured indicators are within their normative admissible ranges.",
              "جميع المؤشرات المقاسة ضمن حدودها المعيارية المقبولة.",
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {diagnoses.map((d, idx) => {
        const s = SEVERITY_STYLES[d.severity];
        const Icon = s.icon;
        return (
          <div
            key={`${d.code}-${idx}`}
            className={`flex items-start gap-3 p-4 rounded-xl border-l-[3px] ${s.border} ${s.bg}`}
          >
            <div
              className={`w-8 h-8 rounded-xl ${s.iconBg} flex items-center justify-center flex-shrink-0 mt-0.5`}
            >
              <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-foreground">
                  {d.cause}
                </span>
                <span className="font-mono text-[0.6rem] px-2 py-0.5 rounded-full bg-surface-3 text-muted-foreground">
                  {d.code}
                </span>
              </div>
              <div className="text-xs text-secondary-foreground mt-1.5 leading-relaxed">
                {d.detail}
              </div>
              <div className="text-xs text-muted-foreground mt-2 leading-relaxed">
                <span className="font-semibold">{l("Action", "Action", "الاجراء")} : </span>
                {d.action}
              </div>
              {d.refs.length > 0 && (
                <div className="text-[0.65rem] text-muted-foreground mt-2 font-mono">
                  {l("Refs", "Refs", "المراجع")} : {d.refs.join(" · ")}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Sub-component : Contributions SHAP (waterfall simplifiÃ©)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function ShapContributions({ explain }: { explain: RulExplain }) {
  const bars = useMemo(
    () =>
      explain.contributions
        .map((c) => ({
          name: c.feature,
          impact: +c.impact_days.toFixed(2),
          direction: c.direction,
        }))
        .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact)),
    [explain],
  );

  const maxAbs = Math.max(1, ...bars.map((b) => Math.abs(b.impact)));

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-surface-3/40 border border-border rounded-xl p-3">
          <div className="industrial-label text-[0.6rem]">Baseline E[f(X)]</div>
          <div className="text-lg font-bold text-foreground mt-0.5">
            {explain.baseline_days.toFixed(1)}
            <span className="text-xs opacity-50"> j</span>
          </div>
        </div>
        <div className="bg-surface-3/40 border border-border rounded-xl p-3">
          <div className="industrial-label text-[0.6rem]">Prédiction</div>
          <div className="text-lg font-bold text-primary mt-0.5">
            {explain.prediction_days.toFixed(1)}
            <span className="text-xs opacity-50"> j</span>
          </div>
        </div>
        <div className="bg-surface-3/40 border border-border rounded-xl p-3">
          <div className="industrial-label text-[0.6rem]">
            + {explain.other_impact_count} autres
          </div>
          <div className="text-lg font-bold text-foreground mt-0.5">
            {explain.other_impact_days >= 0 ? "+" : ""}
            {explain.other_impact_days.toFixed(1)}
            <span className="text-xs opacity-50"> j</span>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={Math.max(180, bars.length * 32)}>
        <BarChart
          data={bars}
          layout="vertical"
          margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="hsl(var(--chart-grid))"
            horizontal={false}
          />
          <XAxis
            type="number"
            domain={[-maxAbs * 1.1, maxAbs * 1.1]}
            tick={{ fill: "hsl(215,12%,55%)", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v > 0 ? "+" : ""}${v.toFixed(0)}j`}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: "hsl(215,12%,55%)", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={170}
          />
          <RTooltip
            cursor={{ fill: "hsl(var(--muted) / 0.3)" }}
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 10,
              fontSize: 11,
            }}
            formatter={(v: number) => [
              `${v > 0 ? "+" : ""}${v.toFixed(2)} j`,
              "Impact",
            ]}
          />
          <Bar dataKey="impact" radius={[0, 4, 4, 0]}>
            {bars.map((b, i) => (
              <Cell
                key={i}
                fill={b.impact >= 0 ? "hsl(var(--success))" : "hsl(var(--destructive))"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="text-[0.65rem] text-muted-foreground mt-3 leading-relaxed">
        Décomposition additive TreeSHAP (Lundberg &amp; Lee, NeurIPS 2017).
        Chaque barre indique de combien de jours une variable allonge (vert) ou
        raccourcit (rouge) la prédiction, par rapport à la référence moyenne.
      </div>
    </div>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// StressIndexCard â€” Indice de stress instantanÃ© (HI = passÃ©, RUL = futur,
// SI = prÃ©sent). DÃ©composition T/V/L/R sourcÃ©e ISO 10816-3 + IEC 60034-1.
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

const STRESS_BAND_STYLE: Record<
  StressBand,
  { label: string; ring: string; text: string; bg: string; chip: string }
> = {
  low: {
    label: "Faible",
    ring: "stroke-success",
    text: "text-success",
    bg: "bg-success/10",
    chip: "bg-success/15 text-success",
  },
  moderate: {
    label: "Modéré",
    ring: "stroke-warning",
    text: "text-warning",
    bg: "bg-warning/10",
    chip: "bg-warning/15 text-warning",
  },
  high: {
    label: "Élevé",
    ring: "stroke-warning",
    text: "text-warning",
    bg: "bg-warning/10",
    chip: "bg-warning/20 text-warning",
  },
  critical: {
    label: "Critique",
    ring: "stroke-destructive",
    text: "text-destructive",
    bg: "bg-destructive/10",
    chip: "bg-destructive/15 text-destructive",
  },
};

const STRESS_AXIS_META: Record<
  keyof StressIndex["components"],
  { label: string; icon: typeof Thermometer; ref: string }
> = {
  thermal: {
    label: "Thermique",
    icon: Thermometer,
    ref: "IEC 60034-1 classe F (50-110 °C)",
  },
  vibration: {
    label: "Vibration",
    icon: Activity,
    ref: "ISO 10816-3 zones A-D (1.8-11.2 mm/s)",
  },
  load: {
    label: "Charge",
    icon: Zap,
    ref: "Plaque SITI : I_rated = 4.85 A (50-115 %)",
  },
  variability: {
    label: "Variabilité",
    icon: Waves,
    ref: "Thomson & Fenger 2001 (sigma/mu <= 0.30)",
  },
};

interface StressIndexCardProps {
  stress: StressIndex;
}

function StressIndexCard({ stress }: StressIndexCardProps) {
  const pct = Math.round(stress.value * 100);
  const style = STRESS_BAND_STYLE[stress.band];
  const dom = STRESS_AXIS_META[stress.dominant];
  const partial = stress.inputs_seen.length < 4;

  // Donut SVG â€” 1 cercle de fond + 1 arc de progression
  const R = 40;
  const C = 2 * Math.PI * R;
  const dash = (stress.value * C).toFixed(2);

  return (
    <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-5 items-center">
      {/* Donut central */}
      <div className="flex justify-center">
        <div className="relative w-[160px] h-[160px]">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            <circle
              cx={50}
              cy={50}
              r={R}
              className="fill-none stroke-surface-3"
              strokeWidth={9}
            />
            <circle
              cx={50}
              cy={50}
              r={R}
              className={`fill-none ${style.ring} transition-all`}
              strokeWidth={9}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${C}`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className={`text-3xl font-bold ${style.text}`}>{pct}%</div>
            <div className="text-[0.65rem] uppercase tracking-wider text-muted-foreground mt-0.5">
              Stress
            </div>
          </div>
        </div>
      </div>

      {/* DÃ©composition T/V/L/R */}
      <div className="space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <span
            className={`text-[0.65rem] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${style.chip}`}
          >
            {style.label}
          </span>
          <div className="text-xs text-muted-foreground">
            Axe dominant&nbsp;:{" "}
            <span className="font-semibold text-foreground">{dom.label}</span>
          </div>
        </div>

        {(Object.keys(STRESS_AXIS_META) as Array<keyof StressIndex["components"]>).map(
          (k) => {
            const meta = STRESS_AXIS_META[k];
            const v = stress.components[k];
            const present = stress.inputs_seen.includes(k);
            const Icon = meta.icon;
            const isDom = k === stress.dominant;
            return (
              <div key={k} className="flex items-center gap-3">
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    isDom ? style.bg : "bg-surface-3"
                  }`}
                >
                  <Icon
                    className={`w-3.5 h-3.5 ${
                      isDom ? style.text : "text-muted-foreground"
                    }`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span
                      className={
                        isDom
                          ? "font-semibold text-foreground"
                          : "text-foreground"
                      }
                    >
                      {meta.label}
                    </span>
                    <span
                      className={`tabular-nums text-[0.7rem] ${
                        present ? "text-muted-foreground" : "text-muted-foreground/50"
                      }`}
                    >
                      {present ? `${Math.round(v * 100)}%` : "-"}
                    </span>
                  </div>
                  <div className="h-1.5 mt-1 rounded-full bg-surface-3 overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        v >= 0.85
                          ? "bg-destructive"
                          : v >= 0.6
                          ? "bg-warning"
                          : v >= 0.3
                          ? "bg-warning/60"
                          : "bg-success"
                      }`}
                      style={{ width: `${Math.round(v * 100)}%` }}
                    />
                  </div>
                  <div className="text-[0.6rem] text-muted-foreground mt-0.5 leading-tight">
                    {meta.ref}
                  </div>
                </div>
              </div>
            );
          }
        )}

        {partial && (
          <div className="text-[0.65rem] text-muted-foreground pt-1 italic">
            Calcul partiel : {stress.inputs_seen.length}/4 capteurs disponibles.
          </div>
        )}
      </div>
    </div>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// RUL v2 â€” FPT-conditional + observed-rate + L10 adjusted (ISO 281)
// 3 modes : no_prediction (FPT gate), warming_up, prediction
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function MaintenanceWindowCallout({
  text,
  zone,
}: {
  text: string;
  zone?: string;
}) {
  // Couleur du bandeau alignÃ©e sur la zone HI
  const isCritical = zone === "Critical";
  const isWarning = zone === "Degraded" || zone === "Good";
  const tone = isCritical
    ? {
        bg: "bg-destructive/10",
        border: "border-l-destructive",
        text: "text-destructive",
      }
    : isWarning
    ? {
        bg: "bg-warning/10",
        border: "border-l-warning",
        text: "text-warning-foreground",
      }
    : {
        bg: "bg-success/10",
        border: "border-l-success",
        text: "text-success-foreground",
      };

  return (
    <div className={`flex items-start gap-2.5 p-3 rounded-xl border-l-[3px] ${tone.bg} ${tone.border}`}>
      <HardHat className={`w-4 h-4 mt-0.5 flex-shrink-0 ${tone.text}`} />
      <div className="flex-1 min-w-0">
        <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">
          Recommandation maintenance - heuristique RCM (zone HI)
        </div>
        <div className="text-sm text-foreground font-medium leading-snug">
          {text}
        </div>
      </div>
    </div>
  );
}

function L10ReferenceLine({ l10 }: { l10: RulV2L10 }) {
  if (l10.source === "fallback") {
    return (
      <div className="text-[0.7rem] text-muted-foreground leading-relaxed">
        Référence constructeur du roulement{" "}
        <span className="font-semibold">{l10.bearing_model}</span> :{" "}
        <span className="font-semibold tabular-nums">
          {l10.l10_nominal_years} ans
        </span>{" "}
        à charge nominale.{" "}
        <span className="italic">
          Calibration de charge en cours (moins de 30 j de données).
        </span>
      </div>
    );
  }
  return (
    <div className="text-[0.7rem] text-muted-foreground leading-relaxed">
      Référence{" "}
      <span className="font-semibold">{l10.bearing_model}</span> ajustée à votre
      charge moyenne mesurée (
      <span className="tabular-nums">
        {(l10.p_observed_kw ?? 0).toFixed(2)} kW
      </span>
      ) :{" "}
      <span className="font-semibold text-foreground tabular-nums">
        {l10.years_adjusted} ans
      </span>{" "}
      - {l10.reference}
    </div>
  );
}

function NoPredictionPanel({ rul }: { rul: RulV2Response }) {
  return (
    <div className="space-y-4">
      {/* Bandeau Ã©tat "machine saine" */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-success/5 border-l-[3px] border-l-success">
        <CheckCircle2 className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-foreground">
            Aucun précurseur de défaillance détecté
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Health Index ={" "}
            <span className="tabular-nums font-semibold">
              {rul.hi_current?.toFixed(3) ?? "-"}
            </span>
            {" - "}
            seuil pronostic : HI &lt; {rul.fpt_threshold.toFixed(2)} (ISO
            10816-3 zone A "neuf / remis à neuf").
          </div>
        </div>
      </div>

      {/* L10 rÃ©fÃ©rence â€” c'est la donnÃ©e principale ici */}
      <div className="p-4 rounded-xl bg-surface-3/40 space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <Settings2 className="w-3.5 h-3.5" />
          Durée de vie statistique du composant
        </div>
        {rul.l10.source === "measured" ? (
          <div className="flex items-end gap-3">
            <div className="text-3xl font-bold tabular-nums text-foreground">
              {rul.l10.years_adjusted}
            </div>
            <div className="text-sm text-muted-foreground pb-1">
              ans (ajustée à votre usage)
            </div>
          </div>
        ) : (
          <div className="flex items-end gap-3">
            <div className="text-3xl font-bold tabular-nums text-muted-foreground">
              {rul.l10.l10_nominal_years}
            </div>
            <div className="text-sm text-muted-foreground pb-1">
              ans (nominal - calibration en cours)
            </div>
          </div>
        )}
        <L10ReferenceLine l10={rul.l10} />
      </div>

      {/* Recommandation maintenance â€” toujours prÃ©sente */}
      {rul.maintenance_window && (
        <MaintenanceWindowCallout
          text={rul.maintenance_window}
          zone="Excellent"
        />
      )}

      {/* Disclaimer FPT */}
      <div className="text-[0.7rem] text-muted-foreground italic leading-relaxed">
        {rul.disclaimers.fpt_gate}
      </div>
    </div>
  );
}

function WarmingUpPanel({ rul }: { rul: RulV2Response }) {
  const reference = rul.reference_prediction;
  const hasReference = typeof reference?.rul_days === "number";

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 p-4 rounded-xl bg-warning/5 border-l-[3px] border-l-warning">
        <Loader2 className="w-5 h-5 text-warning mt-0.5 flex-shrink-0 animate-spin" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-foreground">
            {hasReference ? "Référence démo active" : "Initialisation RUL"}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {hasReference
              ? "Une référence de démonstration est affichée immédiatement, puis le RUL en direct prendra le relais dès que le buffer HI sera prêt."
              : rul.warming_up_detail ??
                "Buffer HI insuffisant pour produire un pronostic - 60 min d'historique requis."}
          </div>
        </div>
      </div>
      {hasReference && (
        <div className="p-4 rounded-xl bg-surface-3/40 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <Clock className="w-3.5 h-3.5" />
            Référence de démonstration
          </div>
          <div className="flex items-end gap-3">
            <div className="text-3xl font-bold tabular-nums text-foreground">
              {reference.rul_days}
            </div>
            <div className="text-sm text-muted-foreground pb-1">
              jours, en attendant le RUL en direct
            </div>
          </div>
        </div>
      )}
      <div className="p-4 rounded-xl bg-surface-3/40">
        <L10ReferenceLine l10={rul.l10} />
      </div>
      {rul.maintenance_window && (
        <MaintenanceWindowCallout text={rul.maintenance_window} />
      )}
    </div>
  );
}

function PredictionPanel({
  rul,
  badgeLabels,
}: {
  rul: RulV2Response;
  badgeLabels: DisclaimersBundle["badge_labels"];
}) {
  const pred = rul.prediction!;
  const badge = badgeLabels[pred.confidence];
  const variant = CONFIDENCE_VARIANT[pred.confidence];
  const displayLow = pred.rul_days_display_low ?? pred.rul_days_p10;
  const displayHigh = pred.rul_days_display_high ?? pred.rul_days_p90;
  const intervalLabel = pred.display_interval_label ?? "IC 80 %";

  // Couleur du bandeau de statut selon la zone HI
  const isCritical = (rul.hi_current ?? 1) < 0.3;
  const statusStyle = isCritical
    ? {
        icon: AlertCircle,
        bg: "bg-destructive/5",
        border: "border-l-destructive",
        iconColor: "text-destructive",
        title: "Arrêt recommandé",
        sub: "Zone D ISO 10816-3 - risque imminent.",
      }
    : (rul.hi_current ?? 1) < 0.6
    ? {
        icon: AlertTriangle,
        bg: "bg-warning/5",
        border: "border-l-warning",
        iconColor: "text-warning",
        title: "Maintenance recommandée",
        sub: "Zone C ISO 10816-3 - planifier l'intervention.",
      }
      : {
        icon: Activity,
        bg: "bg-primary/5",
        border: "border-l-primary",
        iconColor: "text-primary",
        title: "Surveillance active",
        sub: "Zone B ISO 10816-3 - dérive détectée, intervalle élargi par prudence.",
      };
  const StatusIcon = statusStyle.icon;

  return (
    <div className="space-y-4">
      {/* Affichage primaire â€” JOURS calendaires (technicien GMAO) */}
      <div className="p-4 rounded-xl bg-surface-3/40 space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <CalendarClock className="w-3.5 h-3.5" />
          Vie utile restante (calendrier)
        </div>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="text-4xl font-bold tabular-nums text-foreground leading-none">
            {pred.rul_days}
          </div>
          <div className="text-base text-muted-foreground pb-1">jours</div>
          {displayLow !== null && displayHigh !== null && (
            <div className="text-xs text-muted-foreground pb-1.5 ml-auto">
              {intervalLabel} :{" "}
              <span className="font-semibold tabular-nums">
                {displayLow}-{displayHigh} j
              </span>
            </div>
          )}
        </div>

        {/* Backing physique — cycles + rythme observé */}
        <div className="text-[0.75rem] text-muted-foreground leading-relaxed pt-1 border-t border-border/40">
          ≈{" "}
          <span className="font-semibold tabular-nums text-foreground">
            {pred.cycles_remaining.toLocaleString("fr-FR")} cycles
          </span>{" "}
          au rythme observé de{" "}
          <span className="font-semibold tabular-nums">
            {pred.cycles_per_day_observed?.toLocaleString("fr-FR") ?? "—"}
          </span>{" "}
          cycles/jour
          {pred.factor_source === "calibration_default" ? (
            <span className="italic ml-1">
              (calibration par défaut — pas encore 7 j de données observées)
            </span>
          ) : (
            <span className="text-muted-foreground/70 ml-1">
              (moyenne 7 j glissants)
            </span>
          )}
        </div>
      </div>

      {/* Bandeau de statut + recommandation */}
      <div
        className={`flex items-start gap-3 p-3 rounded-xl border-l-[3px] ${statusStyle.bg} ${statusStyle.border}`}
      >
        <StatusIcon
          className={`w-5 h-5 ${statusStyle.iconColor} mt-0.5 flex-shrink-0`}
        />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-foreground text-sm">
            {statusStyle.title}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {statusStyle.sub}
          </div>
        </div>
        <span
          className={`text-[0.6rem] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider whitespace-nowrap ${
            variant === "green"
              ? "bg-success/15 text-success"
              : variant === "warn"
              ? "bg-warning/15 text-warning"
              : "bg-destructive/15 text-destructive"
          }`}
          title={badge?.tooltip}
        >
          {badge?.label ?? pred.confidence}
        </span>
      </div>

      {/* Recommandation maintenance â€” heuristique RCM par zone HI */}
      {rul.maintenance_window && (
        <MaintenanceWindowCallout
          text={rul.maintenance_window}
          zone={pred.hi_zone}
        />
      )}

      {/* L10 référence (toujours affichée pour calibrer les attentes) */}
      <div className="p-3 rounded-xl bg-surface-3/40">
        <L10ReferenceLine l10={rul.l10} />
      </div>

      {/* Disclaimers : rythme observé + portée du modèle */}
      <div className="text-[0.7rem] text-muted-foreground italic leading-relaxed space-y-1">
        <div>{rul.disclaimers.rate_basis}</div>
        <div>{rul.disclaimers.model_scope}</div>
      </div>

      {/* Détails techniques pliables (RF brut, conversion, CVI) */}
      <details className="text-[0.7rem] text-muted-foreground">
        <summary className="cursor-pointer hover:text-foreground transition-colors">
          Détails techniques (Random Forest, transparence audit)
        </summary>
        <div className="mt-2 p-3 rounded-lg bg-surface-3/40 space-y-1.5 leading-relaxed">
          <div>
            <span className="font-semibold text-foreground">
              Sortie brute du modèle :
            </span>{" "}
            <span className="font-mono tabular-nums">
              {pred.rul_min_simulator} min-sim
            </span>{" "}
            [{pred.rul_min_p10}–{pred.rul_min_p90}]
          </div>
          <div>
            <span className="font-semibold text-foreground">
              Conversion par rythme observé :
            </span>{" "}
            facteur{" "}
            <span className="font-mono tabular-nums">
              ÷{pred.factor_used}
            </span>{" "}
            (
            {pred.factor_source === "observed"
              ? "rythme machine 7 j"
              : "calibration par défaut ÷9"}
            ) →{" "}
            <span className="font-mono tabular-nums font-semibold">
              {pred.rul_days} j affichés
            </span>
            ,{" "}
            <span className="font-mono tabular-nums">
              {pred.cycles_remaining.toLocaleString("fr-FR")} cycles
            </span>
          </div>
          <div>
            <span className="font-semibold text-foreground">
              Zone HI courante :
            </span>{" "}
            <span className="font-mono">{pred.hi_zone}</span>{" "}
            (ISO 10816-3 mapping via simulateur step1)
          </div>
          <div>
            <span className="font-semibold text-foreground">CVI :</span>{" "}
            <span className="tabular-nums">
              {pred.cvi !== null ? pred.cvi.toFixed(4) : "-"}
            </span>{" "}
            sur {pred.n_trees} arbres - Meinshausen 2006 (Quantile Forests)
          </div>
          {displayLow !== null && displayHigh !== null && (
            <div>
              <span className="font-semibold text-foreground">
                Intervalle affiché :
              </span>{" "}
              {intervalLabel} -{" "}
              <span className="font-mono tabular-nums">
                {displayLow}-{displayHigh} j
              </span>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}

function RulV2Card({
  rul,
  badgeLabels,
}: {
  rul: RulV2Response;
  badgeLabels: DisclaimersBundle["badge_labels"];
}) {
  if (rul.mode === "no_prediction") return <NoPredictionPanel rul={rul} />;
  if (rul.mode === "warming_up") return <WarmingUpPanel rul={rul} />;
  return <PredictionPanel rul={rul} badgeLabels={badgeLabels} />;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Composant principal
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export interface DiagnosticsPanelProps {
  machineCode: string | null;
}

export function DiagnosticsPanel({ machineCode }: DiagnosticsPanelProps) {
  const { lang } = useApp();
  const { data, isLoading, error } = useDiagnostics(machineCode);
  const l = (fr: string, en: string, ar: string) =>
    repairText(lang === "fr" ? fr : lang === "en" ? en : ar);

  if (!machineCode) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 text-center text-sm text-muted-foreground">
        {l("Sélectionnez une machine pour afficher le diagnostic.", "Select a machine to display diagnostics.", "اختر آلة لعرض التشخيص.")}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        {l("Chargement des diagnostics...", "Loading diagnostics...", "جار تحميل التشخيص...")}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 flex items-start gap-3 border-l-[3px] border-l-warning">
        <AlertTriangle className="w-5 h-5 text-warning mt-0.5 flex-shrink-0" />
        <div className="text-sm">
          <div className="font-semibold text-foreground">
            {l("Diagnostics indisponibles", "Diagnostics unavailable", "التشخيص غير متاح")}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {(error as Error | undefined)?.message ??
              l("Démarrez le simulateur ou attendez un message MQTT.", "Start the simulator or wait for an MQTT message.", "شغل المحاكي او انتظر رسالة MQTT.")}
          </div>
        </div>
      </div>
    );
  }

  const { rul_interval, rul_v2, diagnose, rul_explain, stress_index, disclaimers, errors } = data;

  return (
    <div className="space-y-5">
      {/* â”€â”€ RUL v2 â€” FPT + rythme observÃ© + L10 ajustÃ© (carte principale) â”€â”€ */}
      <div className="bg-card border border-border rounded-2xl p-5 shadow-premium">
        <div className="flex items-center gap-2 mb-4">
          <CalendarClock className="w-4 h-4 text-primary" />
          <div className="section-title flex-1">
            Vie utile restante - pronostic conditionnel PHM
          </div>
          {rul_v2?.mode === "prediction" && (
            <span className="text-[0.6rem] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary uppercase tracking-wider">
              IEEE 1856 actif
            </span>
          )}
          {rul_v2?.mode === "no_prediction" && (
            <span className="text-[0.6rem] font-semibold px-2 py-0.5 rounded-full bg-success/15 text-success uppercase tracking-wider">
              FPT
            </span>
          )}
        </div>
        {rul_v2 ? (
          <RulV2Card rul={rul_v2} badgeLabels={disclaimers.badge_labels} />
        ) : (
          <div className="text-xs text-muted-foreground p-4 bg-surface-3/40 rounded-xl">
            {errors?.rul_v2?.detail ??
              "Pronostic v2 indisponible - démarrer le simulateur ou attendre un message MQTT."}
          </div>
        )}
        <div className="text-[0.6rem] text-muted-foreground mt-4 leading-relaxed border-t border-border/40 pt-3">
          Conformité PHM : <span className="font-semibold">IEEE 1856-2017 §6.2</span>{" "}
          (FPT-conditional prognosis), <span className="font-semibold">ISO 281:2007</span>{" "}
          (L10 cube law sur charge dynamique équivalente),{" "}
          <span className="font-semibold">Saxena & Goebel 2008</span> (NASA CMAPSS,
          conversion par cycles d'opération).
        </div>
      </div>

      {/* â”€â”€ Stress Index â€” instantanÃ© (prÃ©sent) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="bg-card border border-border rounded-2xl p-5 shadow-premium">
        <div className="flex items-center gap-2 mb-4">
          <Gauge className="w-4 h-4 text-primary" />
          <div className="section-title flex-1">
            Indice de stress - sévérité opérationnelle instantanée
          </div>
        </div>
        {stress_index ? (
          <StressIndexCard stress={stress_index} />
        ) : (
          <div className="text-xs text-muted-foreground p-4 bg-surface-3/40 rounded-xl">
            {errors?.stress_index?.detail ??
              "Stress Index indisponible - démarrer le simulateur ou attendre un message MQTT."}
          </div>
        )}
        <div className="text-[0.65rem] text-muted-foreground mt-4 leading-relaxed">
          Métrique additive bornée [0, 1] : moyenne de 4 axes physiques
          (thermique, vibratoire, charge, variabilité) normalisés contre des
          seuils <span className="font-semibold">ISO 10816-3:2009</span> et{" "}
          <span className="font-semibold">IEC 60034-1:2017</span>. Complète HI
          (passé) et RUL (futur) - pas de modèle ML, 100 % auditable.
        </div>
      </div>

      {/* â”€â”€ Carte RUL legacy (RF brut + IC) â€” gardÃ©e comme vue audit â”€â”€ */}
      <div className="bg-card border border-border rounded-2xl p-5 shadow-premium">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-4 h-4 text-primary" />
          <div className="section-title flex-1">
            Sortie brute du Random Forest (audit)
          </div>
          {data.rul_interval?.source === "simulator_override" && (
            <span className="text-[0.6rem] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary uppercase tracking-wider">
              Mode simulateur
            </span>
          )}
        </div>
        {rul_interval ? (
          <RulIntervalCard
            rul={rul_interval}
            badgeLabels={disclaimers.badge_labels}
          />
        ) : (
          <div className="text-xs text-muted-foreground p-4 bg-surface-3/40 rounded-xl">
            {errors?.rul_interval?.detail ??
              "Pronostic RUL indisponible (warming-up du buffer HI, 60 min requis)."}
          </div>
        )}
        <div className="text-[0.65rem] text-muted-foreground mt-4 leading-relaxed">
          {disclaimers.rul_nature}
        </div>
      </div>

      {/* â”€â”€ RÃ¨gles expertes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="bg-card border border-border rounded-2xl p-5 shadow-premium">
        <div className="flex items-center gap-2 mb-4">
          <Stethoscope className="w-4 h-4 text-primary" />
          <div className="section-title flex-1">
            Diagnostic expert - normes ISO / IEC / IEEE
          </div>
          {diagnose && diagnose.count > 0 && (
            <span className="text-[0.6rem] font-semibold px-2 py-0.5 rounded-full bg-surface-3 text-muted-foreground">
              {diagnose.count} {diagnose.count > 1 ? "alertes" : "alerte"}
            </span>
          )}
        </div>
        {diagnose ? (
          <DiagnosisList diagnoses={diagnose.diagnoses} />
        ) : (
          <div className="text-xs text-muted-foreground p-4 bg-surface-3/40 rounded-xl">
             {errors?.diagnose?.detail ??
               "Données capteurs insuffisantes pour évaluer les règles expertes."}
          </div>
        )}
      </div>

      {/* â”€â”€ Attribution SHAP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="bg-card border border-border rounded-2xl p-5 shadow-premium">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-4 h-4 text-primary" />
          <div className="section-title flex-1">
            Pourquoi cette prédiction ? - SHAP top 5
          </div>
        </div>
        {rul_explain ? (
          <ShapContributions explain={rul_explain} />
        ) : (
          <div className="text-xs text-muted-foreground p-4 bg-surface-3/40 rounded-xl">
            {errors?.rul_explain?.detail ??
              "Explication SHAP indisponible. Le buffer HI doit être prêt (60 min) et `shap` installé côté serveur."}
          </div>
        )}
      </div>

      {/* â”€â”€ Bandeau calibration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="bg-card border border-l-[3px] border-l-primary border-border rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <Info className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
          <div className="text-xs text-muted-foreground leading-relaxed">
            {disclaimers.calibration_notice}
          </div>
        </div>
      </div>
    </div>
  );
}


