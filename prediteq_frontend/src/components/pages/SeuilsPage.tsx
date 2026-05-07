import { useEffect, useState } from "react";
import { Save, Mail, Loader2, AlertTriangle, Eye, Shield } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";

const SLIDER =
  "w-full h-1.5 rounded-full appearance-none cursor-pointer bg-muted [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-card [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-card [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:cursor-pointer";
const SLIDER_CRIT = `${SLIDER} [&::-webkit-slider-thumb]:bg-destructive [&::-moz-range-thumb]:bg-destructive`;
const SLIDER_WARN = `${SLIDER} [&::-webkit-slider-thumb]:bg-warning [&::-moz-range-thumb]:bg-warning`;
const PANEL = "rounded-2xl border border-border bg-card p-5 shadow-premium";

function extractApiErrorMessage(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  if (error.message.includes("hi_critical must be less than hi_surveillance")) {
    return "Le seuil HI critique doit rester plus bas que le seuil HI surveillance.";
  }
  if (error.message.includes("rul_critical_days must be less than rul_surveillance_days")) {
    return "Le seuil RUL urgence doit rester plus court que le seuil RUL surveillance.";
  }
  return null;
}

export function SeuilsPage() {
  const { alertEmails, setAlertEmails, t } = useApp();
  const [managerEmail, setManagerEmail] = useState(alertEmails.manager);
  const [techEmail, setTechEmail] = useState(alertEmails.technician);

  const [hiCrit, setHiCrit] = useState(0.3);
  const [hiSurv, setHiSurv] = useState(0.6);
  const [rulCrit, setRulCrit] = useState(7);
  const [rulSurv, setRulSurv] = useState(30);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<{
      hi_critical: number;
      hi_surveillance: number;
      rul_critical_days: number;
      rul_surveillance_days: number;
      manager_email?: string | null;
      technician_email?: string | null;
    }>("/seuils")
      .then((data) => {
        setHiCrit(data.hi_critical);
        setHiSurv(data.hi_surveillance);
        setRulCrit(data.rul_critical_days);
        setRulSurv(data.rul_surveillance_days);

        const recipients = {
          manager: data.manager_email ?? "",
          technician: data.technician_email ?? "",
        };
        setManagerEmail(recipients.manager);
        setTechEmail(recipients.technician);
        setAlertEmails(recipients);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [setAlertEmails]);

  const hiOrderInvalid = hiCrit >= hiSurv;
  const rulOrderInvalid = rulCrit >= rulSurv;
  const hasValidationIssue = hiOrderInvalid || rulOrderInvalid;
  const saveDisabled = saving || loading || hasValidationIssue;

  const handleSave = async () => {
    if (hasValidationIssue) {
      toast.error(
        hiOrderInvalid
          ? "Le seuil HI critique doit rester plus bas que le seuil HI surveillance."
          : "Le seuil RUL urgence doit rester plus court que le seuil RUL surveillance.",
      );
      return;
    }

    setSaving(true);
    try {
      await apiFetch("/seuils", {
        method: "PUT",
        body: JSON.stringify({
          hi_critical: hiCrit,
          hi_surveillance: hiSurv,
          rul_critical_days: rulCrit,
          rul_surveillance_days: rulSurv,
          manager_email: managerEmail.trim() || null,
          technician_email: techEmail.trim() || null,
        }),
      });
      setAlertEmails({ manager: managerEmail, technician: techEmail });
      toast.success(t("seuils.saved"));
    } catch (error) {
      toast.error(extractApiErrorMessage(error) ?? "Erreur lors de la sauvegarde des seuils");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className={PANEL}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="section-title">Regles d'alerte</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Definissez ici quand une machine passe en surveillance ou en urgence.
            </p>
          </div>

          <button
            onClick={handleSave}
            disabled={saveDisabled}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {t("seuils.save")}
          </button>
        </div>
      </div>

      {hasValidationIssue ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive shadow-sm">
          {hiOrderInvalid
            ? "Le seuil HI critique doit rester plus bas que le seuil HI surveillance."
            : "Le seuil RUL urgence doit rester plus court que le seuil RUL surveillance."}
        </div>
      ) : null}

      <div className={PANEL}>
        <div className="text-sm font-semibold text-foreground">Regle de lecture</div>
        <div className="mt-4 space-y-3 text-sm text-muted-foreground">
          <div className="flex items-start gap-3">
            <Eye className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning" />
            <p>
              <span className="font-semibold text-foreground">Surveillance</span> si HI &lt;= {hiSurv.toFixed(2)} ou
              RUL &lt;= {rulSurv} jours.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive" />
            <p>
              <span className="font-semibold text-foreground">Urgence</span> si HI &lt;= {hiCrit.toFixed(2)} ou RUL
              &lt;= {rulCrit} jours.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <Shield className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" />
            <p>
              <span className="font-semibold text-foreground">Sinon</span>, la machine reste en lecture normale sans
              escalade automatique.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.25fr_1fr]">
        <div className={PANEL}>
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-foreground">Regler les seuils</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Le seuil urgence doit rester plus severe que le seuil surveillance.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-border bg-surface-2/70 p-4">
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-foreground">Indice de sante (HI)</h4>
              </div>

              <div className="mb-5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-warning">Surveillance</span>
                  <span className="tabular-nums text-sm font-bold text-warning">{hiSurv.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0.3}
                  max={0.8}
                  step={0.01}
                  value={hiSurv}
                  onChange={(event) => setHiSurv(+event.target.value)}
                  className={SLIDER_WARN}
                />
                <div className="mt-1 flex justify-between text-[0.6rem] text-muted-foreground">
                  <span>0.30</span>
                  <span>0.80</span>
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-destructive">Critique</span>
                  <span className="tabular-nums text-sm font-bold text-destructive">{hiCrit.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0.05}
                  max={0.5}
                  step={0.01}
                  value={hiCrit}
                  onChange={(event) => setHiCrit(+event.target.value)}
                  className={SLIDER_CRIT}
                />
                <div className="mt-1 flex justify-between text-[0.6rem] text-muted-foreground">
                  <span>0.05</span>
                  <span>0.50</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-surface-2/70 p-4">
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-foreground">Marge restante (RUL)</h4>
              </div>

              <div className="mb-5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-warning">Surveillance</span>
                  <span className="tabular-nums text-sm font-bold text-warning">{rulSurv} j</span>
                </div>
                <input
                  type="range"
                  min={7}
                  max={90}
                  step={1}
                  value={rulSurv}
                  onChange={(event) => setRulSurv(+event.target.value)}
                  className={SLIDER_WARN}
                />
                <div className="mt-1 flex justify-between text-[0.6rem] text-muted-foreground">
                  <span>7 j</span>
                  <span>90 j</span>
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-destructive">Urgence</span>
                  <span className="tabular-nums text-sm font-bold text-destructive">{rulCrit} j</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={30}
                  step={1}
                  value={rulCrit}
                  onChange={(event) => setRulCrit(+event.target.value)}
                  className={SLIDER_CRIT}
                />
                <div className="mt-1 flex justify-between text-[0.6rem] text-muted-foreground">
                  <span>1 j</span>
                  <span>30 j</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={PANEL}>
          <div className="mb-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Mail className="h-4 w-4 text-muted-foreground" />
              Destinataires des alertes
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Les comptes admin approuves restent toujours inclus. Ces champs ajoutent les contacts operationnels.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                {t("seuils.managerEmail")}
              </label>
              <input
                type="email"
                value={managerEmail}
                onChange={(event) => setManagerEmail(event.target.value)}
                className="w-full rounded-lg border border-border bg-surface-3 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                {t("seuils.techEmail")}
              </label>
              <input
                type="email"
                value={techEmail}
                onChange={(event) => setTechEmail(event.target.value)}
                className="w-full rounded-lg border border-border bg-surface-3 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div className="rounded-xl border border-border bg-surface-3 px-3.5 py-3 text-xs text-muted-foreground">
              Si aucun admin approuve n'est trouve, le backend retombe sur l'email administrateur configure cote serveur.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
