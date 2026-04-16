import { useState, useEffect } from "react";
import { Save, Mail, Loader2, Shield, AlertTriangle, Eye, Heart, Clock } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { KpiCard } from "@/components/industrial/KpiCard";

const SLIDER = "w-full h-1.5 rounded-full appearance-none cursor-pointer bg-muted [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-card [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-card [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:cursor-pointer";
const SLIDER_CRIT = `${SLIDER} [&::-webkit-slider-thumb]:bg-destructive [&::-moz-range-thumb]:bg-destructive`;
const SLIDER_WARN = `${SLIDER} [&::-webkit-slider-thumb]:bg-warning [&::-moz-range-thumb]:bg-warning`;

export function SeuilsPage() {
  const { lang, alertEmails, setAlertEmails, t } = useApp();
  const [managerEmail, setManagerEmail] = useState(alertEmails.manager);
  const [techEmail, setTechEmail] = useState(alertEmails.technician);

  const [hiCrit, setHiCrit] = useState(0.30);
  const [hiSurv, setHiSurv] = useState(0.60);
  const [rulCrit, setRulCrit] = useState(7);
  const [rulSurv, setRulSurv] = useState(30);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<{ hi_critical: number; hi_surveillance: number; rul_critical_days: number; rul_surveillance_days: number }>("/seuils")
      .then((data) => {
        setHiCrit(data.hi_critical);
        setHiSurv(data.hi_surveillance);
        setRulCrit(data.rul_critical_days);
        setRulSurv(data.rul_surveillance_days);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch("/seuils", {
        method: "PUT",
        body: JSON.stringify({
          hi_critical: hiCrit,
          hi_surveillance: hiSurv,
          rul_critical_days: rulCrit,
          rul_surveillance_days: rulSurv,
        }),
      });
      setAlertEmails({ manager: managerEmail, technician: techEmail });
      toast.success(t("seuils.saved"));
    } catch (err) {
      toast.error("Erreur lors de la sauvegarde des seuils");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="section-title">{t("seuils.title")}</div>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} {t("seuils.save")}
        </button>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={<Heart className="w-5 h-5" />} label="HI Critique" value={<>{hiCrit.toFixed(2)}</>} sub="Seuil urgence" variant="danger" />
        <KpiCard icon={<Heart className="w-5 h-5" />} label="HI Surveillance" value={<>{hiSurv.toFixed(2)}</>} sub="Seuil alerte" variant="warn" />
        <KpiCard icon={<Clock className="w-5 h-5" />} label="RUL Urgence" value={<>{rulCrit} <span className="text-sm opacity-40">j</span></>} sub="Jours restants" variant="danger" />
        <KpiCard icon={<Clock className="w-5 h-5" />} label="RUL Surveillance" value={<>{rulSurv} <span className="text-sm opacity-40">j</span></>} sub="Jours restants" variant="warn" />
      </div>

      {/* Threshold Sliders — 2 cols */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-foreground">Health Index</h3>
            <p className="text-xs text-muted-foreground mt-1">Seuils de déclenchement HI</p>
          </div>
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-destructive">Seuil critique</span>
              <span className="text-sm font-bold text-destructive tabular-nums">{hiCrit.toFixed(2)}</span>
            </div>
            <input type="range" min={0.05} max={0.50} step={0.01} value={hiCrit}
              onChange={e => setHiCrit(+e.target.value)} className={SLIDER_CRIT} />
            <div className="flex justify-between mt-1">
              <span className="text-[0.6rem] text-muted-foreground">0.05</span>
              <span className="text-[0.6rem] text-muted-foreground">0.50</span>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-warning">Surveillance</span>
              <span className="text-sm font-bold text-warning tabular-nums">{hiSurv.toFixed(2)}</span>
            </div>
            <input type="range" min={0.30} max={0.80} step={0.01} value={hiSurv}
              onChange={e => setHiSurv(+e.target.value)} className={SLIDER_WARN} />
            <div className="flex justify-between mt-1">
              <span className="text-[0.6rem] text-muted-foreground">0.30</span>
              <span className="text-[0.6rem] text-muted-foreground">0.80</span>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-foreground">Remaining Useful Life</h3>
            <p className="text-xs text-muted-foreground mt-1">Seuils de déclenchement RUL</p>
          </div>
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-destructive">Urgence</span>
              <span className="text-sm font-bold text-destructive tabular-nums">{rulCrit} j</span>
            </div>
            <input type="range" min={1} max={30} step={1} value={rulCrit}
              onChange={e => setRulCrit(+e.target.value)} className={SLIDER_CRIT} />
            <div className="flex justify-between mt-1">
              <span className="text-[0.6rem] text-muted-foreground">1 j</span>
              <span className="text-[0.6rem] text-muted-foreground">30 j</span>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-warning">Surveillance</span>
              <span className="text-sm font-bold text-warning tabular-nums">{rulSurv} j</span>
            </div>
            <input type="range" min={7} max={90} step={1} value={rulSurv}
              onChange={e => setRulSurv(+e.target.value)} className={SLIDER_WARN} />
            <div className="flex justify-between mt-1">
              <span className="text-[0.6rem] text-muted-foreground">7 j</span>
              <span className="text-[0.6rem] text-muted-foreground">90 j</span>
            </div>
          </div>
        </div>
      </div>

      {/* Alert Rules + Email — 2 cols */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-foreground">Règles d'alerte</h3>
            <p className="text-xs text-muted-foreground mt-1">Résumé des déclenchements</p>
          </div>
          <div className="space-y-2.5">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-destructive mt-0.5 flex-shrink-0" />
              <p className="text-xs text-secondary-foreground">
                <span className="font-bold text-destructive">Urgence</span> — HI &lt; {hiCrit.toFixed(2)} OU RUL &lt; {rulCrit}j → email automatique
              </p>
            </div>
            <div className="flex items-start gap-2">
              <Eye className="w-3.5 h-3.5 text-warning mt-0.5 flex-shrink-0" />
              <p className="text-xs text-secondary-foreground">
                <span className="font-bold text-warning">Surveillance</span> — HI &lt; {hiSurv.toFixed(2)} OU RUL &lt; {rulSurv}j → email hebdomadaire
              </p>
            </div>
            <div className="flex items-start gap-2">
              <Shield className="w-3.5 h-3.5 text-success mt-0.5 flex-shrink-0" />
              <p className="text-xs text-secondary-foreground">
                <span className="font-bold text-success">OK</span> — aucun email
              </p>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Mail className="w-4 h-4 text-muted-foreground" />
              {t("seuils.emailConfig")}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">Destinataires des notifications</p>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">{t("seuils.managerEmail")}</label>
              <input value={managerEmail} onChange={e => setManagerEmail(e.target.value)}
                className="w-full bg-surface-3 border border-border rounded-lg px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">{t("seuils.techEmail")}</label>
              <input value={techEmail} onChange={e => setTechEmail(e.target.value)}
                className="w-full bg-surface-3 border border-border rounded-lg px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
