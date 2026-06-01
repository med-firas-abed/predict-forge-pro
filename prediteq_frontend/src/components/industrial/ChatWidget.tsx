import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Bot, Loader2, Send, User, X } from "lucide-react";
import { apiStream } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import type { Machine } from "@/data/machines";
import { useMachines } from "@/hooks/useMachines";
import { getMachinePublicLabel } from "@/lib/machinePresentation";
import { repairText } from "@/lib/repairText";

interface Message {
  role: "user" | "assistant";
  content: string;
}

function getChatMachinePriorityScore(machine: Machine) {
  const urgencyScore = machine.decision?.urgencyScore;
  if (typeof urgencyScore === "number" && Number.isFinite(urgencyScore)) {
    return urgencyScore;
  }

  const statusScore =
    machine.status === "critical"
      ? 90
      : machine.status === "degraded"
        ? 55
        : machine.status === "maintenance"
          ? 35
          : 10;
  const hiPenalty =
    typeof machine.hi === "number" && Number.isFinite(machine.hi)
      ? Math.round((1 - machine.hi) * 100)
      : 0;
  const rulPenalty =
    typeof machine.rul === "number" && Number.isFinite(machine.rul)
      ? Math.max(0, 120 - machine.rul) / 2
      : 0;

  return statusScore + hiPenalty + rulPenalty;
}

function getSuggestionMachineLabels(machines: Machine[]) {
  const rankedLabels = [...machines]
    .sort((left, right) => getChatMachinePriorityScore(right) - getChatMachinePriorityScore(left))
    .map((machine) => repairText(getMachinePublicLabel(machine)))
    .filter(Boolean);

  const primary = rankedLabels[0] ?? null;
  const secondary = rankedLabels.find((label) => label !== primary) ?? primary;

  return { primary, secondary };
}

export function ChatWidget() {
  const { t, lang } = useApp();
  const { currentUser } = useAuth();
  const { machines } = useMachines(currentUser?.machineId);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const l = (fr: string, en: string, ar: string) =>
    repairText(lang === "fr" ? fr : lang === "en" ? en : ar);
  const isStandardUser = currentUser?.role === "user";
  const { primary: primaryMachineLabel, secondary: secondaryMachineLabel } =
    getSuggestionMachineLabels(machines);
  const assignedMachineLabel =
    currentUser?.machineCode || currentUser?.machineName || machines[0]
      ? repairText(
          getMachinePublicLabel({
            id: currentUser?.machineCode ?? machines[0]?.id ?? undefined,
            name: currentUser?.machineName ?? machines[0]?.name ?? undefined,
          }),
        )
      : "";
  const assignedMachineReference = assignedMachineLabel || l("votre machine", "your machine", "your machine");
  const chatSubtitle = isStandardUser
    ? l(
        `${assignedMachineReference}, alertes et lecture`,
        `${assignedMachineReference}, alerts and reading`,
        `${assignedMachineReference}, alerts and reading`,
      )
    : t("chat.subtitle");
  const welcomeText = isStandardUser
    ? l(
        `Questions sur ${assignedMachineReference}, ses alertes et sa lecture actuelle.`,
        `Questions about ${assignedMachineReference}, its alerts, and its current reading.`,
        `Questions about ${assignedMachineReference}, its alerts, and its current reading.`,
      )
    : t("chat.welcome");
  const inputPlaceholder = isStandardUser
    ? l(
        `Question sur ${assignedMachineReference}...`,
        `Question about ${assignedMachineReference}...`,
        `Question about ${assignedMachineReference}...`,
      )
    : t("chat.placeholder");

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [open]);

  const appendMessages = (...nextMessages: Message[]) => {
    setMessages((previous) => [...previous, ...nextMessages].slice(-80));
  };

  const upsertAssistantMessage = (content: string) => {
    setMessages((previous) => {
      const copy = [...previous];
      const lastMessage = copy[copy.length - 1];

      if (lastMessage?.role === "assistant" && !lastMessage.content.trim()) {
        copy[copy.length - 1] = { role: "assistant", content };
        return copy;
      }

      return [...copy, { role: "assistant", content }].slice(-80);
    });
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    appendMessages({ role: "user", content: text });
    setInput("");
    setLoading(true);

    try {
      const history = messages.slice(-16).map((message) => ({
        role: message.role,
        content: message.content,
      }));

      const stream = await apiStream("/chat", { message: text, history });
      if (!stream) throw new Error("No stream");

      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";

      appendMessages({ role: "assistant", content: "" });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        assistantText += decoder.decode(value, { stream: true });
        setMessages((previous) => {
          const copy = [...previous];
          copy[copy.length - 1] = { role: "assistant", content: assistantText };
          return copy;
        });
      }

      if (!assistantText.trim()) {
        upsertAssistantMessage(
          l(
            "Aucun resultat disponible. Veuillez reessayer.",
            "No result available. Please try again.",
            "No result available. Please try again.",
          ),
        );
      }
    } catch (error) {
      console.error("[ChatWidget] Stream error:", error);
      upsertAssistantMessage(
        l(
          "Erreur de connexion. Veuillez reessayer.",
          "Connection error. Please try again.",
          "Connection error. Please try again.",
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  const helperText = isStandardUser
    ? l(
        `Discussion centrée sur ${assignedMachineReference}: état, alertes, cause dominante et point de contrôle.`,
        `Discussion focused on ${assignedMachineReference}: status, alerts, main cause, and checkpoint.`,
        `Discussion focused on ${assignedMachineReference}: status, alerts, main cause, and checkpoint.`,
      )
    : l(
        "Flotte, alertes, causes probables et actions recommandées.",
        "Fleet status, alerts, likely causes, and recommended actions.",
        "Fleet status, alerts, likely causes, and recommended actions.",
      );

  const suggestions = isStandardUser
    ? [
        l(
          `État de ${assignedMachineReference}`,
          `Status of ${assignedMachineReference}`,
          `Status of ${assignedMachineReference}`,
        ),
        l(
          `Alertes ouvertes sur ${assignedMachineReference}`,
          `Open alerts on ${assignedMachineReference}`,
          `Open alerts on ${assignedMachineReference}`,
        ),
        l(
          `Cause principale sur ${assignedMachineReference}`,
          `Main cause on ${assignedMachineReference}`,
          `Main cause on ${assignedMachineReference}`,
        ),
        l(
          `Point à vérifier sur ${assignedMachineReference}`,
          `Checkpoint on ${assignedMachineReference}`,
          `Checkpoint on ${assignedMachineReference}`,
        ),
      ]
    : [
        l(
          "Machine prioritaire aujourd'hui",
          "Priority machine today",
          "Priority machine today",
        ),
        primaryMachineLabel
          ? l(
              `Etat de ${primaryMachineLabel}`,
              `Status of ${primaryMachineLabel}`,
              `Status of ${primaryMachineLabel}`,
            )
          : l(
              "Etat de la machine la plus sensible",
              "Status of the most sensitive machine",
              "Status of the most sensitive machine",
            ),
        l(
          "Etat general de la flotte",
          "Overall fleet status",
          "Overall fleet status",
        ),
        primaryMachineLabel
          ? l(
              `Cause principale pour ${primaryMachineLabel}`,
              `Main cause for ${primaryMachineLabel}`,
              `Main cause for ${primaryMachineLabel}`,
            )
          : l(
              "Cause principale de la priorite",
              "Main cause of the priority",
              "Main cause of the priority",
            ),
      ];
  const fallbackPriorityLabel = l(
    "la machine prioritaire",
    "the priority machine",
    "the priority machine",
  );
  const visibleSuggestions = isStandardUser
    ? suggestions.map((suggestion) => repairText(suggestion))
    : suggestions.map((suggestion) =>
        repairText(
          suggestion
            .replace(/\bMachine 2\b/g, primaryMachineLabel ?? fallbackPriorityLabel)
            .replace(
              /\bMachine 3\b/g,
              secondaryMachineLabel ?? primaryMachineLabel ?? fallbackPriorityLabel,
            ),
        ),
      );

  return (
    <>
      {!open && (
        <div className="fixed right-6 bottom-6 z-50">
          <div className="pointer-events-none absolute inset-0 rounded-[1.8rem] bg-[radial-gradient(circle_at_top_right,rgba(15,118,110,0.22),transparent_52%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.14),transparent_48%)] blur-2xl" />
          <button
            onClick={() => setOpen(true)}
            className="group relative flex min-w-[255px] max-w-[calc(100vw-2rem)] items-center gap-3 overflow-hidden rounded-[1.55rem] border border-primary/15 bg-card/95 px-4 py-3.5 text-left text-foreground shadow-[0_22px_60px_-28px_rgba(15,118,110,0.5)] backdrop-blur-md transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_28px_70px_-30px_rgba(15,118,110,0.58)]"
            aria-label={t("chat.title")}
          >
            <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-primary/55 to-transparent" />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.07),transparent_42%,rgba(15,118,110,0.06)_100%)]" />
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-[1.15rem] border border-primary/12 bg-gradient-to-br from-primary/18 via-primary/10 to-emerald-500/18 transition-transform group-hover:scale-[1.03]">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-primary/12 bg-primary/10 px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-primary">
                  PrediTeq
                </span>
              </div>
              <div className="truncate text-sm font-semibold text-foreground">
                {t("chat.title")}
              </div>
              <div className="mt-0.5 hidden text-[0.72rem] leading-tight text-muted-foreground sm:block">
                {chatSubtitle}
              </div>
            </div>
            <div className="relative hidden h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background/70 text-muted-foreground transition-all group-hover:border-primary/20 group-hover:text-primary sm:flex">
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </div>
          </button>
        </div>
      )}

      {open && (
        <div className="fixed right-6 bottom-6 z-50 flex h-[620px] max-h-[calc(100vh-3rem)] w-[460px] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-[1.7rem] border border-primary/15 bg-card/96 shadow-[0_30px_90px_-36px_rgba(15,23,42,0.55)] backdrop-blur-xl animate-fade-in">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top,rgba(15,118,110,0.16),transparent_68%)]" />
          <div className="relative flex items-center gap-3 border-b border-border/80 bg-[linear-gradient(180deg,rgba(15,118,110,0.08),rgba(255,255,255,0))] px-4 py-3.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/12 bg-gradient-to-br from-primary/18 via-primary/10 to-emerald-500/18 shadow-sm">
              <Bot className="h-4.5 w-4.5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="text-[0.96rem] font-semibold text-foreground">{t("chat.title")}</div>
                <span className="inline-flex items-center rounded-full border border-primary/12 bg-primary/10 px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-primary">
                  PrediTeq
                </span>
              </div>
              <div className="mt-0.5 text-[0.76rem] leading-5 text-muted-foreground">{chatSubtitle}</div>
              <div className="mt-1 text-[0.74rem] leading-5 text-muted-foreground">{helperText}</div>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Fermer le panneau"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div ref={scrollRef} className="relative flex-1 space-y-4 overflow-y-auto bg-[linear-gradient(180deg,rgba(15,118,110,0.02),transparent_25%,transparent_100%)] px-5 py-5">
            {messages.length === 0 && (
              <div className="space-y-4">
                <div className="rounded-[1.35rem] border border-primary/10 bg-[linear-gradient(135deg,rgba(15,118,110,0.08),rgba(255,255,255,0.02))] px-5 py-4 text-left shadow-sm">
                  <div className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-primary/80">
                    PrediTeq
                  </div>
                  <p className="text-[0.95rem] leading-7 text-foreground/88">{welcomeText}</p>
                  <p className="mt-3 text-[0.82rem] leading-6 text-muted-foreground">{helperText}</p>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {visibleSuggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => {
                        setInput(suggestion);
                        inputRef.current?.focus();
                      }}
                      className="rounded-2xl border border-border/80 bg-background/78 px-4 py-3 text-left text-[0.84rem] leading-6 text-muted-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/20 hover:bg-primary/5 hover:text-foreground"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`flex gap-2 ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {message.role === "assistant" && (
                  <div className="mt-7 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-primary/10 bg-primary/12">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  </div>
                )}
                <div className={`flex max-w-[86%] flex-col gap-1.5 ${message.role === "user" ? "items-end" : "items-start"}`}>
                  <div className="px-1 text-[0.68rem] font-medium uppercase tracking-[0.14em] text-muted-foreground/80">
                    {message.role === "user" ? "Vous" : "PrediTeq"}
                  </div>
                  <div
                    className={`whitespace-pre-wrap rounded-2xl px-4 py-3 text-[0.95rem] leading-7 ${
                      message.role === "user"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "border border-border/70 bg-background/90 text-foreground shadow-sm"
                    }`}
                  >
                    {message.content || (
                      <span className="flex items-center gap-1.5 text-[0.92rem] text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {t("chat.thinking")}
                      </span>
                    )}
                  </div>
                </div>
                {message.role === "user" && (
                  <div className="mt-7 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-border/70 bg-foreground/10">
                    <User className="h-3.5 w-3.5 text-foreground" />
                  </div>
                )}
              </div>
            ))}

            {loading && messages[messages.length - 1]?.role === "user" && (
              <div className="flex gap-2">
                <div className="mt-7 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-primary/10 bg-primary/12">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="flex max-w-[86%] flex-col gap-1.5">
                  <div className="px-1 text-[0.68rem] font-medium uppercase tracking-[0.14em] text-muted-foreground/80">
                    PrediTeq
                  </div>
                  <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-background/90 px-4 py-3 text-[0.92rem] leading-6 text-muted-foreground shadow-sm">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t("chat.thinking")}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-border/80 bg-[linear-gradient(180deg,rgba(15,118,110,0.03),rgba(255,255,255,0))] px-4 py-3">
            <div className="flex items-center gap-2 rounded-[1.2rem] border border-border/80 bg-background/80 p-2.5 shadow-sm">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                placeholder={inputPlaceholder}
                maxLength={2000}
                className="flex-1 rounded-xl bg-transparent px-3 py-2.5 text-[0.95rem] text-foreground outline-none placeholder:text-[0.92rem] placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20"
                disabled={loading}
              />
              <button
                onClick={() => void sendMessage()}
                disabled={!input.trim() || loading}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm transition-all hover:scale-[1.02] hover:bg-primary/90 disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
