import { Activity, ArrowUpRight, ShieldAlert } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import type { DemoStoryState } from "@/lib/demoScenario";
import { repairText } from "@/lib/repairText";
import { cn } from "@/lib/utils";

type DemoStoryNarrativeProps = {
  state: DemoStoryState | null;
  machineId?: string | null;
  className?: string;
};

type NarrativeContent = {
  badge: string;
  title: string;
  summary: string;
  readFirst: string;
  systemBehavior: string;
  nextStep: string;
  tone: string;
  badgeTone: string;
};

export function DemoStoryNarrative({
  state,
  machineId,
  className,
}: DemoStoryNarrativeProps) {
  const { lang } = useApp();
  const l = (fr: string, en: string, ar: string) =>
    repairText(lang === "fr" ? fr : lang === "en" ? en : ar);

  if (!state) {
    return null;
  }

  const machineLabel = machineId ?? l("cette machine", "this machine", "this machine");

  const content: Record<DemoStoryState, NarrativeContent> = {
    stable: {
      badge: l("Stable", "Stable", "Stable"),
      title: l(
        "Lecture stable",
        "Stable reading",
        "Stable reading",
      ),
      summary: l(
        `${machineLabel} represente un profil stable du parc. L'interface garde une lecture simple et peu alarmiste tant qu'aucune derive robuste n'est detectee.`,
        `${machineLabel} represents a stable fleet profile. The interface keeps the reading simple and non-alarmist while no robust drift is detected.`,
        `${machineLabel} represents a stable fleet profile. The interface keeps the reading simple and non-alarmist while no robust drift is detected.`,
      ),
      readFirst: l(
        "HI eleve, stress faible, et reference de duree de vie plutot qu'un RUL live.",
        "High HI, low stress, and a lifetime reference instead of a live RUL.",
        "High HI, low stress, and a lifetime reference instead of a live RUL.",
      ),
      systemBehavior: l(
        "Le systeme evite de publier un pronostic numerique trop tot et privilegie une lecture prudente.",
        "The system avoids publishing a numeric prognosis too early and keeps the reading cautious.",
        "The system avoids publishing a numeric prognosis too early and keeps the reading cautious.",
      ),
      nextStep: l(
        "Ouvrir le diagnostic seulement pour consulter les facteurs suivis ou expliquer la lecture.",
        "Open diagnostics only to review monitored factors or explain the reading.",
        "Open diagnostics only to review monitored factors or explain the reading.",
      ),
      tone: "border-success/20 bg-success/5",
      badgeTone: "border-success/20 bg-success/10 text-success",
    },
    watch: {
      badge: l("Surveillance", "Watch", "Watch"),
      title: l(
        "Lecture sous surveillance",
        "Watched reading",
        "Watched reading",
      ),
      summary: l(
        `${machineLabel} represente un profil sous surveillance. L'interface fait remonter une cible de controle sans basculer trop vite vers une alerte critique.`,
        `${machineLabel} represents a watch profile. The interface surfaces an inspection target without escalating too quickly into a critical alert.`,
        `${machineLabel} represents a watch profile. The interface surfaces an inspection target without escalating too quickly into a critical alert.`,
      ),
      readFirst: l(
        "A verifier d'abord, declencheur principal et niveau de stress.",
        "Check first, main trigger, and stress level.",
        "Check first, main trigger, and stress level.",
      ),
      systemBehavior: l(
        "Le systeme combine signaux, stress et regles expertes pour orienter le premier controle terrain.",
        "The system combines signals, stress, and expert rules to guide the first field check.",
        "The system combines signals, stress, and expert rules to guide the first field check.",
      ),
      nextStep: l(
        "Ouvrir le diagnostic pour confirmer la cause dominante et les controles recommandes.",
        "Open diagnostics to confirm the dominant cause and recommended checks.",
        "Open diagnostics to confirm the dominant cause and recommended checks.",
      ),
      tone: "border-warning/20 bg-warning/5",
      badgeTone: "border-warning/20 bg-warning/10 text-warning",
    },
    critical: {
      badge: l("Critique", "Critical", "Critical"),
      title: l(
        "Lecture critique",
        "Critical reading",
        "Critical reading",
      ),
      summary: l(
        `${machineLabel} represente un profil critique. L'accent passe de la lecture globale a la priorisation terrain et a la justification technique.`,
        `${machineLabel} represents a critical profile. The focus shifts from the global reading to field priority and technical justification.`,
        `${machineLabel} represents a critical profile. The focus shifts from the global reading to field priority and technical justification.`,
      ),
      readFirst: l(
        "Decision de maintenance, alertes techniques et zone a verifier.",
        "Maintenance decision, expert alerts, and inspection target.",
        "Maintenance decision, expert alerts, and inspection target.",
      ),
      systemBehavior: l(
        "Les alertes expertes renforcent la priorite et evitent une presentation trop rassurante.",
        "Expert alerts strengthen the priority and avoid an overly reassuring presentation.",
        "Expert alerts strengthen the priority and avoid an overly reassuring presentation.",
      ),
      nextStep: l(
        "Ouvrir le diagnostic pour justifier l'escalade et cadrer l'intervention.",
        "Open diagnostics to justify the escalation and frame the intervention.",
        "Open diagnostics to justify the escalation and frame the intervention.",
      ),
      tone: "border-destructive/20 bg-destructive/5",
      badgeTone: "border-destructive/20 bg-destructive/10 text-destructive",
    },
  };

  const selectedContent = content[state];
  const blocks = [
    {
      icon: Activity,
      label: l("A lire d'abord", "Read first", "Read first"),
      text: selectedContent.readFirst,
    },
    {
      icon: ShieldAlert,
      label: l("Comportement du systeme", "System behavior", "System behavior"),
      text: selectedContent.systemBehavior,
    },
    {
      icon: ArrowUpRight,
      label: l("Etape suivante", "Next step", "Next step"),
      text: selectedContent.nextStep,
    },
  ];

  return (
    <div className={cn("rounded-xl border border-border bg-surface-3 p-4", className)}>
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-xl border",
            selectedContent.tone,
          )}
        >
          <ShieldAlert className="h-5 w-5" />
        </div>
        <div>
          <div className="text-[0.68rem] uppercase tracking-[0.18em] text-muted-foreground">
            {l("Scenario actif", "Active scenario", "Active scenario")}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <div className="text-base font-semibold text-foreground">{selectedContent.title}</div>
            <span
              className={cn(
                "rounded-full border px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em]",
                selectedContent.badgeTone,
              )}
            >
              {selectedContent.badge}
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {selectedContent.summary}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
        {blocks.map((block) => {
          const Icon = block.icon;

          return (
            <div
              key={block.label}
              className="rounded-xl border border-border bg-card px-4 py-4"
            >
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-primary" />
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {block.label}
                </div>
              </div>
              <div className="mt-3 text-sm leading-relaxed text-secondary-foreground">
                {block.text}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
