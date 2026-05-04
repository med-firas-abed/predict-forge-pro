import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Bot, Loader2, Send, Sparkles, User, X } from "lucide-react";
import { apiStream } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";
import { repairText } from "@/lib/repairText";

interface Message {
  role: "user" | "assistant";
  content: string;
}

type ChatAudience = "jury" | "dual" | "technician";

export function ChatWidget() {
  const { t, lang } = useApp();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [audience, setAudience] = useState<ChatAudience>("dual");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const l = (fr: string, en: string, ar: string) =>
    repairText(lang === "fr" ? fr : lang === "en" ? en : ar);

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

      const stream = await apiStream("/chat", { message: text, history, audience });
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
    } catch (error) {
      console.error("[ChatWidget] Stream error:", error);
      appendMessages({ role: "assistant", content: "Erreur de connexion. Veuillez réessayer." });
    } finally {
      setLoading(false);
    }
  };

  const audienceOptions: Array<{ id: ChatAudience; label: string }> = [
    { id: "jury", label: l("Jury", "Jury", "Jury") },
    { id: "dual", label: l("Les deux", "Both", "Both") },
    { id: "technician", label: l("Technicien", "Technician", "Technician") },
  ];

  const audienceHelp =
    audience === "jury"
      ? l(
          "Reponses sans jargon, avec l'impact et l'action en premier.",
          "Answers without jargon, with impact and action first.",
          "Answers without jargon, with impact and action first.",
        )
      : audience === "technician"
        ? l(
            "Reponses terrain avec HI, RUL, alertes et facteurs dominants.",
            "Field-ready answers with HI, RUL, alerts, and dominant drivers.",
            "Field-ready answers with HI, RUL, alerts, and dominant drivers.",
          )
        : l(
            "Reponses en deux couches: resume simple puis details terrain.",
            "Two-layer answers: simple summary then field details.",
            "Two-layer answers: simple summary then field details.",
          );

  const suggestions =
    audience === "jury"
      ? [
          l("Quelle machine demande de l'attention aujourd'hui ?", "Which machine needs attention today?", "Which machine needs attention today?"),
          l("Explique ASC-B2 avec des mots simples", "Explain ASC-B2 in simple words", "Explain ASC-B2 in simple words"),
            l("Résume la flotte pour un jury", "Summarize the fleet for a jury", "Summarize the fleet for a jury"),
            l("Quel est le prochain geste à faire ?", "What should we do next?", "What should we do next?"),
        ]
      : audience === "technician"
        ? [
            l("Donne HI, RUL et facteur principal pour ASC-B2", "Give HI, RUL, and top driver for ASC-B2", "Give HI, RUL, and top driver for ASC-B2"),
            l("Quelles alertes sont urgentes ?", "Which alerts are urgent?", "Which alerts are urgent?"),
            l("Quelle fenêtre d'intervention pour ASC-C3 ?", "What is the intervention window for ASC-C3?", "What is the intervention window for ASC-C3?"),
            l("Résume la flotte avec les priorités terrain", "Summarize the fleet with field priorities", "Summarize the fleet with field priorities"),
          ]
        : [
            l("Explique ASC-B2 simplement puis techniquement", "Explain ASC-B2 simply, then technically", "Explain ASC-B2 simply, then technically"),
            l("Quelle machine est prioritaire ?", "Which machine is the priority?", "Which machine is the priority?"),
            l("Résume la flotte pour un jury et un technicien", "Summarize the fleet for a jury and a technician", "Summarize the fleet for a jury and a technician"),
            l("Pourquoi ASC-C3 est urgente ?", "Why is ASC-C3 urgent?", "Why is ASC-C3 urgent?"),
          ];

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
              <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-4 ring-card animate-pulse" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/12 bg-primary/10 px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-primary">
                  <Sparkles className="h-3 w-3" />
                  AI Copilot
                </span>
              </div>
              <div className="truncate text-sm font-semibold text-foreground">
                {t("chat.title")}
              </div>
              <div className="mt-0.5 hidden text-[0.72rem] leading-tight text-muted-foreground sm:block">
                {t("chat.subtitle")}
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
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/12 bg-primary/10 px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-primary">
                  <Sparkles className="h-3 w-3" />
                  AI Copilot
                </span>
              </div>
              <div className="mt-0.5 text-[0.76rem] leading-5 text-muted-foreground">{t("chat.subtitle")}</div>
              <div className="mt-1 text-[0.74rem] leading-5 text-muted-foreground">{audienceHelp}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {audienceOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setAudience(option.id)}
                    className={`rounded-full border px-3 py-1 text-[0.68rem] font-semibold transition-all ${
                      audience === option.id
                        ? "border-primary/20 bg-primary text-primary-foreground"
                        : "border-border/70 bg-background/70 text-muted-foreground hover:border-primary/20 hover:text-foreground"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Fermer le chat"
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
                    Assistant IA
                  </div>
                  <p className="text-[0.95rem] leading-7 text-foreground/88">{t("chat.welcome")}</p>
                  <p className="mt-3 text-[0.82rem] leading-6 text-muted-foreground">{audienceHelp}</p>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {suggestions.map((suggestion) => (
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
                    {message.role === "user" ? "Vous" : "Assistant IA"}
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
                    Assistant IA
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
                placeholder={t("chat.placeholder")}
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
