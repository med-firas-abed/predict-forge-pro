import { Activity, Brain, Clock3, Gauge, ShieldAlert, Sparkles } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { repairText } from "@/lib/repairText";
import { cn } from "@/lib/utils";

type HybridMethodCardProps = {
  className?: string;
};

export function HybridMethodCard({ className }: HybridMethodCardProps) {
  const { lang } = useApp();
  const l = (fr: string, en: string, ar: string) =>
    repairText(lang === "fr" ? fr : lang === "en" ? en : ar);

  const steps = [
    {
      icon: Activity,
      title: l("Capteurs / simulation", "Sensors / simulation", "Sensors / simulation"),
      description: l(
        "Vibration, courant, température, charge et contexte d'usage alimentent la démo et les vues live.",
        "Vibration, current, temperature, load, and usage context feed the demo and live views.",
        "Vibration, current, temperature, load, and usage context feed the demo and live views.",
      ),
    },
    {
      icon: Gauge,
      title: l("Moteur runtime", "Runtime engine", "Runtime engine"),
      description: l(
        "Le runtime calcule les features, l'HI, le stress et la fraîcheur de lecture.",
        "The runtime computes features, HI, stress, and reading freshness.",
        "The runtime computes features, HI, stress, and reading freshness.",
      ),
    },
    {
      icon: Brain,
      title: l("Pronostic ML", "ML prognosis", "ML prognosis"),
      description: l(
        "Le modèle produit le RUL, son intervalle et les facteurs qui pèsent sur le pronostic.",
        "The model produces the RUL, its interval, and the factors affecting the prognosis.",
        "The model produces the RUL, its interval, and the factors affecting the prognosis.",
      ),
    },
    {
      icon: ShieldAlert,
      title: l("Règles expertes & guidance", "Expert rules & guidance", "Expert rules & guidance"),
      description: l(
        "Les alertes techniques, la zone à vérifier et l'action terrain traduisent le pronostic en décision opérable.",
        "Technical alerts, inspection target, and field action translate the prognosis into an operable decision.",
        "Technical alerts, inspection target, and field action translate the prognosis into an operable decision.",
      ),
    },
  ];

  const audiences = [
    {
      label: l("Technique", "Technical", "Technical"),
      description: l(
        "Seuils, alertes, références et lecture auditables.",
        "Thresholds, alerts, references, and auditable reading.",
        "Thresholds, alerts, references, and auditable reading.",
      ),
    },
    {
      label: l("Non technique", "Non-technical", "Non-technical"),
      description: l(
        "Priorité claire, message simple et action à lancer.",
        "Clear priority, simple message, and action to launch.",
        "Clear priority, simple message, and action to launch.",
      ),
    },
    {
      label: l("Produit", "Product", "Product"),
      description: l(
        "Une aide à la décision industrialisable, pas un écran de recherche isolé.",
        "An industrializable decision-support product, not an isolated research screen.",
        "An industrializable decision-support product, not an isolated research screen.",
      ),
    },
  ];

  return (
    <div className={cn("rounded-2xl border border-border bg-card p-5 shadow-premium", className)}>
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <div className="section-title">
            {l("Méthode hybride PrediTeq", "PrediTeq hybrid method", "PrediTeq hybrid method")}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {l(
              "La démonstration reste défendable en soutenance parce qu'elle distingue clairement simulation, calcul runtime, pronostic ML et règles expertes.",
              "The demo stays defensible because it clearly separates simulation, runtime computation, ML prognosis, and expert rules.",
              "The demo stays defensible because it clearly separates simulation, runtime computation, ML prognosis, and expert rules.",
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-4">
        {steps.map((step, index) => {
          const Icon = step.icon;

          return (
            <div key={step.title} className="rounded-xl border border-border bg-surface-3 px-4 py-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="rounded-full bg-card px-2.5 py-1 text-[0.65rem] font-semibold text-muted-foreground">
                  0{index + 1}
                </span>
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <div className="text-sm font-semibold text-foreground">{step.title}</div>
              <div className="mt-2 text-xs leading-relaxed text-secondary-foreground">
                {step.description}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        {audiences.map((audience) => (
          <div key={audience.label} className="rounded-xl border border-border bg-surface-3 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {audience.label}
            </div>
            <div className="mt-2 text-sm leading-relaxed text-secondary-foreground">
              {audience.description}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-primary/10 bg-primary/5 px-4 py-3 text-xs leading-relaxed text-secondary-foreground">
        <span className="font-semibold text-foreground">
          {l(
            "Positionnement produit",
            "Product positioning",
            "Product positioning",
          )}
        </span>
        :{" "}
        {l(
          "PrediTeq ne remplace pas l'expertise terrain. Il réduit le temps de lecture, priorise les contrôles et rend la décision plus cohérente.",
          "PrediTeq does not replace field expertise. It shortens reading time, prioritizes checks, and makes decisions more consistent.",
          "PrediTeq does not replace field expertise. It shortens reading time, prioritizes checks, and makes decisions more consistent.",
        )}
      </div>
    </div>
  );
}
