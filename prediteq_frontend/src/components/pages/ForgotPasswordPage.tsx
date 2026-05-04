import { useState } from "react";
import { ArrowLeft, Mail } from "lucide-react";

import { useApp } from "@/contexts/AppContext";
import { sendPasswordResetEmail } from "@/lib/authClient";
import { repairText } from "@/lib/repairText";

interface Props {
  onNavigate: (route: string) => void;
}

export function ForgotPasswordPage({ onNavigate }: Props) {
  const { lang, theme } = useApp();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const l = (fr: string, en: string, ar: string) =>
    repairText(lang === "fr" ? fr : lang === "en" ? en : ar);

  const labels = {
    title: l("Mot de passe oublié", "Forgot Password", "نسيت كلمة المرور"),
    desc: l(
      "Entrez votre email et nous vous enverrons un lien de réinitialisation.",
      "Enter your email and we'll send you a reset link.",
      "أدخل بريدك الإلكتروني وسنرسل لك رابط إعادة التعيين.",
    ),
    send: l("Envoyer le lien", "Send Reset Link", "إرسال الرابط"),
    sent: l(
      "Un email de réinitialisation a été envoyé. Vérifiez votre boîte de réception.",
      "A reset email has been sent. Check your inbox.",
      "تم إرسال بريد إلكتروني لإعادة التعيين. تحقق من صندوق الوارد.",
    ),
    back: l("Retour à la connexion", "Back to login", "العودة لتسجيل الدخول"),
    networkError: l("Erreur réseau", "Network error", "خطأ في الشبكة"),
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const redirectTo = `${window.location.origin}/reset-password`;
      const { error: err } = await sendPasswordResetEmail(email, redirectTo);
      if (err) {
        setError(repairText(err.message));
      } else {
        setSent(true);
      }
    } catch {
      setError(labels.networkError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <img
            src={theme === "dark" ? "/logo-dark-removebg-preview.png" : "/logo-light.svg"}
            alt="PrediTeq"
            className="h-16 object-contain"
          />
        </div>

        <div
          className="relative rounded-2xl p-[1px] auth-card-shadow"
          style={{
            backgroundImage: theme === "dark"
              ? "linear-gradient(to bottom right, hsl(var(--primary) / 0.6), hsl(var(--primary) / 0.2), hsl(var(--border)))"
              : "linear-gradient(to bottom right, rgba(15,118,110,0.6), rgba(20,184,166,0.2), #e5e7eb)",
          }}
        >
          <div className="bg-card rounded-2xl p-8 space-y-6">
            <div className="text-center">
              <h1 className="text-lg font-semibold text-foreground">{labels.title}</h1>
              <p className="text-sm text-muted-foreground mt-1">{labels.desc}</p>
            </div>

            {sent ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-sm text-emerald-600 dark:text-emerald-400">
                  <Mail className="w-5 h-5 shrink-0" />
                  {labels.sent}
                </div>
                <button
                  onClick={() => onNavigate("/login")}
                  className="w-full h-10 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-all flex items-center justify-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" /> {labels.back}
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-2 uppercase tracking-wider">Email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full h-12 rounded-xl border border-input bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                    placeholder="votre@email.com"
                  />
                </div>

                {error && (
                  <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className={`w-full h-12 rounded-xl text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 transition-all btn-premium ${theme === "dark" ? "bg-primary hover:bg-primary/90" : "shadow-lg"}`}
                  style={theme !== "dark" ? { backgroundImage: "linear-gradient(to right, #0f766e, #14b8a6)" } : undefined}
                >
                  {submitting ? "..." : labels.send}
                </button>

                <button
                  type="button"
                  onClick={() => onNavigate("/login")}
                  className="w-full text-sm text-muted-foreground hover:text-foreground transition-all flex items-center justify-center gap-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> {labels.back}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
