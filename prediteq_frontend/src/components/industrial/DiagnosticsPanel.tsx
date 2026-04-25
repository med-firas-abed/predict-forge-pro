import { useMemo } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Gauge,
  Info,
  Loader2,
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
import {
  useDiagnostics,
  type ConfidenceLevel,
  type Diagnosis,
  type RulInterval,
  type RulExplain,
  type DisclaimersBundle,
  type StressIndex,
  type StressBand,
} from "@/hooks/useDiagnostics";

// ═══════════════════════════════════════════════════════════════════════════
// Palette — reprend exactement les classes du reste de l'app
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// Sub-component : Carte RUL avec intervalle
// ═══════════════════════════════════════════════════════════════════════════

function RulIntervalCard({
  rul,
  badgeLabels,
}: {
  rul: RulInterval;
  badgeLabels: DisclaimersBundle["badge_labels"];
}) {
  const badge = badgeLabels[rul.confidence];
  const variant = CONFIDENCE_VARIANT[rul.confidence];

  const hasInterval =
    rul.rul_days_p10 !== null && rul.rul_days_p90 !== null && rul.rul_days > 0;

  // Bar geometry — p10/p90 positioned within [0, p95 or 2*rul_days]
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
      label="RUL avec intervalle (IC 80 %)"
      value={
        <>
          {Math.round(rul.rul_days)}
          <span className="text-base opacity-40"> j</span>
        </>
      }
      sub={
        hasInterval
          ? `Plage probable : ${Math.round(rul.rul_days_p10!)}–${Math.round(
              rul.rul_days_p90!,
            )} j · ${rul.n_trees ?? 300} arbres`
          : "Intervalle indisponible (mode simulateur ou warming-up)"
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

// ═══════════════════════════════════════════════════════════════════════════
// Sub-component : Liste des diagnostics (règles ISO/IEC/IEEE)
// ═══════════════════════════════════════════════════════════════════════════

function DiagnosisList({ diagnoses }: { diagnoses: Diagnosis[] }) {
  if (diagnoses.length === 0) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-xl border-l-[3px] border-l-success bg-success/5">
        <div className="w-8 h-8 rounded-xl bg-success/10 text-success flex items-center justify-center flex-shrink-0">
          <CheckCircle2 className="w-4 h-4" />
        </div>
        <div>
          <div className="text-sm font-semibold text-foreground">
            Fonctionnement nominal
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Tous les indicateurs mesurés sont dans leurs plages admissibles
            normatives.
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
                <span className="font-semibold">Action : </span>
                {d.action}
              </div>
              {d.refs.length > 0 && (
                <div className="text-[0.65rem] text-muted-foreground mt-2 font-mono">
                  Réfs : {d.refs.join(" · ")}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Sub-component : Contributions SHAP (waterfall simplifié)
// ═══════════════════════════════════════════════════════════════════════════

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
        Chaque barre indique de combien de jours la feature rallonge (vert) ou
        raccourcit (rouge) la prédiction, relativement à la baseline moyenne.
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// StressIndexCard — Indice de stress instantané (HI = passé, RUL = futur,
// SI = présent). Décomposition T/V/L/R sourcée ISO 10816-3 + IEC 60034-1.
// ═══════════════════════════════════════════════════════════════════════════

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
    ref: "IEC 60034-1 classe F (50–110 °C)",
  },
  vibration: {
    label: "Vibration",
    icon: Activity,
    ref: "ISO 10816-3 zones A→D (1.8–11.2 mm/s)",
  },
  load: {
    label: "Charge",
    icon: Zap,
    ref: "Plaque SITI : I_rated = 4.85 A (50–115 %)",
  },
  variability: {
    label: "Variabilité",
    icon: Waves,
    ref: "Thomson & Fenger 2001 (σ/μ ≤ 0.30)",
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

  // Donut SVG — 1 cercle de fond + 1 arc de progression
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

      {/* Décomposition T/V/L/R */}
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
                      {present ? `${Math.round(v * 100)}%` : "—"}
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

// ═══════════════════════════════════════════════════════════════════════════
// Composant principal
// ═══════════════════════════════════════════════════════════════════════════

export interface DiagnosticsPanelProps {
  machineCode: string | null;
}

export function DiagnosticsPanel({ machineCode }: DiagnosticsPanelProps) {
  const { data, isLoading, error } = useDiagnostics(machineCode);

  if (!machineCode) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 text-center text-sm text-muted-foreground">
        Sélectionner une machine pour afficher le diagnostic.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        Chargement des diagnostics…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 flex items-start gap-3 border-l-[3px] border-l-warning">
        <AlertTriangle className="w-5 h-5 text-warning mt-0.5 flex-shrink-0" />
        <div className="text-sm">
          <div className="font-semibold text-foreground">
            Diagnostics indisponibles
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {(error as Error | undefined)?.message ??
              "Démarrer le simulateur ou attendre un message MQTT."}
          </div>
        </div>
      </div>
    );
  }

  const { rul_interval, diagnose, rul_explain, stress_index, disclaimers, errors } = data;

  return (
    <div className="space-y-5">
      {/* ── Stress Index — instantané (présent) ────────────────── */}
      <div className="bg-card border border-border rounded-2xl p-5 shadow-premium">
        <div className="flex items-center gap-2 mb-4">
          <Gauge className="w-4 h-4 text-primary" />
          <div className="section-title flex-1">
            Indice de Stress — sévérité opérationnelle instantanée
          </div>
        </div>
        {stress_index ? (
          <StressIndexCard stress={stress_index} />
        ) : (
          <div className="text-xs text-muted-foreground p-4 bg-surface-3/40 rounded-xl">
            {errors?.stress_index?.detail ??
              "Stress Index indisponible — démarrer le simulateur ou attendre un message MQTT."}
          </div>
        )}
        <div className="text-[0.65rem] text-muted-foreground mt-4 leading-relaxed">
          Métrique additive bornée [0, 1] : moyenne de 4 axes physiques
          (thermique, vibratoire, charge, variabilité) normalisés contre des
          seuils <span className="font-semibold">ISO 10816-3:2009</span> et{" "}
          <span className="font-semibold">IEC 60034-1:2017</span>. Complète HI
          (passé) et RUL (futur) — pas de modèle ML, 100 % auditable.
        </div>
      </div>

      {/* ── Carte RUL avec intervalle ────────────────────────────── */}
      <div className="bg-card border border-border rounded-2xl p-5 shadow-premium">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-4 h-4 text-primary" />
          <div className="section-title flex-1">
            Pronostic RUL — intervalle de confiance
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

      {/* ── Règles expertes ─────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-2xl p-5 shadow-premium">
        <div className="flex items-center gap-2 mb-4">
          <Stethoscope className="w-4 h-4 text-primary" />
          <div className="section-title flex-1">
            Diagnostic expert — normes ISO / IEC / IEEE
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

      {/* ── Attribution SHAP ─────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-2xl p-5 shadow-premium">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-4 h-4 text-primary" />
          <div className="section-title flex-1">
            Pourquoi cette prédiction ? — SHAP top 5
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

      {/* ── Bandeau calibration ────────────────────────────────── */}
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
