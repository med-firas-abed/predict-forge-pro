import { Activity, Clock3, Gauge, ShieldAlert, Sparkles } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { repairText } from "@/lib/repairText";
import { cn } from "@/lib/utils";

type PredictiveReadingGuideProps = {
  className?: string;
  variant?: "default" | "embedded";
};

export function PredictiveReadingGuide({
  className,
  variant = "default",
}: PredictiveReadingGuideProps) {
  const { lang } = useApp();
  const l = (fr: string, en: string, ar: string) =>
    repairText(lang === "fr" ? fr : lang === "en" ? en : ar);
  const isEmbedded = variant === "embedded";

  const items = [
    {
      step: "01",
      icon: Activity,
      label: "HI",
      description: l(
        "Etat de sante cumule sur l'historique recent.",
        "Cumulative health state over recent history.",
        "Cumulative health state over recent history.",
      ),
      compactDescription: l(
        "Etat cumule observe sur l'historique recent.",
        "Observed cumulative state across recent history.",
        "Observed cumulative state across recent history.",
      ),
      tone: "text-primary",
    },
    {
      step: "02",
      icon: Clock3,
      label: "RUL",
      description: l(
        "Marge restante estimee quand le signal est assez etabli.",
        "Estimated remaining margin once the signal is stable enough.",
        "Estimated remaining margin once the signal is stable enough.",
      ),
      compactDescription: l(
        "Marge restante affichee quand le signal est suffisamment etabli.",
        "Remaining margin shown once the signal is stable enough.",
        "Remaining margin shown once the signal is stable enough.",
      ),
      tone: "text-success",
    },
    {
      step: "03",
      icon: Gauge,
      label: l("Stress", "Stress", "Stress"),
      description: l(
        "Pression instantanee du regime d'exploitation.",
        "Instant pressure of the current operating regime.",
        "Instant pressure of the current operating regime.",
      ),
      compactDescription: l(
        "Pression instantanee du regime d'exploitation.",
        "Instant pressure of the current operating regime.",
        "Instant pressure of the current operating regime.",
      ),
      tone: "text-warning",
    },
    {
      step: "04",
      icon: ShieldAlert,
      label: l("Zone a verifier", "Inspection target", "Inspection target"),
      description: l(
        "Premier organe a controler selon les signaux dominants.",
        "First component to inspect based on dominant signals.",
        "First component to inspect based on dominant signals.",
      ),
      compactDescription: l(
        "Premiere cible de controle issue des signaux dominants.",
        "First inspection target inferred from dominant signals.",
        "First inspection target inferred from dominant signals.",
      ),
      tone: "text-destructive",
    },
  ];

  return (
    <div
      className={cn(
        isEmbedded
          ? "rounded-[22px] border border-primary/10 bg-gradient-to-r from-primary/[0.04] via-card to-card p-4 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.24)]"
          : "rounded-2xl border border-border/80 bg-gradient-to-br from-card via-card to-primary/[0.03] p-4 shadow-[0_14px_34px_-28px_rgba(15,23,42,0.18)]",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-start gap-3",
          isEmbedded && "flex-col gap-3 lg:flex-row lg:items-start lg:justify-between",
        )}
      >
        <div
          className={cn(
            "flex shrink-0 items-center justify-center border border-primary/10 bg-primary/[0.06] text-primary",
            isEmbedded ? "h-10 w-10 rounded-xl" : "h-11 w-11 rounded-2xl",
          )}
        >
          <Sparkles className={cn(isEmbedded ? "h-[18px] w-[18px]" : "h-5 w-5")} />
        </div>
        <div className="min-w-0 flex-1">
          <div className={cn(isEmbedded ? "section-title text-[0.88rem]" : "section-title")}>
            {l(
              isEmbedded ? "Lecture rapide de cette machine" : "Comment lire cette decision",
              isEmbedded ? "Quick reading for this machine" : "How to read this decision",
              isEmbedded ? "Quick reading for this machine" : "How to read this decision",
            )}
          </div>
          <p className={cn("mt-1 text-sm text-muted-foreground", isEmbedded && "max-w-3xl")}>
            {l(
              isEmbedded
                ? "Quatre reperes a lire du plus global au plus actionnable."
                : "Quatre reperes, du plus global au plus actionnable.",
              isEmbedded
                ? "Four cues to read from overall state to first action."
                : "Four cues, from overall state to first action.",
              isEmbedded
                ? "Four cues to read from overall state to first action."
                : "Four cues, from overall state to first action.",
            )}
          </p>
        </div>
        {isEmbedded ? (
          <div className="rounded-full border border-primary/10 bg-card/80 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-primary">
            {l("4 reperes", "4 cues", "4 cues")}
          </div>
        ) : null}
      </div>

      <div
        className={cn(
          "mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4",
          isEmbedded && "mt-3",
        )}
      >
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <div
              key={item.label}
              className={cn(
                "border border-border/80 backdrop-blur-sm",
                isEmbedded
                  ? "rounded-[20px] bg-card/90 px-4 py-3.5 shadow-[0_10px_24px_-24px_rgba(15,23,42,0.28)]"
                  : "rounded-xl bg-surface-3/70 px-4 py-3",
              )}
            >
              <div className="flex items-center gap-2">
                {isEmbedded ? (
                  <div className="rounded-full border border-primary/10 bg-primary/[0.06] px-2 py-0.5 text-[0.62rem] font-semibold tracking-[0.18em] text-primary">
                    {item.step}
                  </div>
                ) : null}
                <div
                  className={cn(
                    "flex items-center justify-center text-foreground shadow-sm",
                    isEmbedded ? "h-8 w-8 rounded-xl bg-surface-3" : "h-7 w-7 rounded-full bg-card",
                  )}
                >
                  <Icon className={cn("h-3.5 w-3.5", item.tone)} />
                </div>
                <div className={cn("font-semibold text-foreground", isEmbedded ? "text-[0.95rem]" : "text-sm")}>
                  {item.label}
                </div>
              </div>
              <div
                className={cn(
                  "mt-2 leading-6 text-secondary-foreground",
                  isEmbedded ? "text-[0.82rem] leading-5" : "text-xs",
                )}
              >
                {isEmbedded ? item.compactDescription : item.description}
              </div>
            </div>
          );
        })}
      </div>

      <div
        className={cn(
          "rounded-xl border border-primary/10 bg-primary/[0.05] px-4 py-3 leading-6 text-secondary-foreground",
          isEmbedded ? "mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.74rem]" : "mt-4 text-[0.78rem]",
        )}
      >
        <span className="font-semibold text-foreground">
          {l(
            "Aide a la decision",
            "Decision-support tool",
            "Decision-support tool",
          )}
        </span>
        :{" "}
        {l(
          "lecture a confirmer sur le terrain avant toute intervention lourde ou arret machine.",
          "reading to be confirmed in the field before any major intervention or machine stop.",
          "reading to be confirmed in the field before any major intervention or machine stop.",
        )}
      </div>
    </div>
  );
}
