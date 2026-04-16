import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/contexts/AppContext";
import { ArrowLeft, Mail } from "lucide-react";

interface Props {
  onNavigate: (route: string) => void;
}

export function ForgotPasswordPage({ onNavigate }: Props) {
  const { lang, theme } = useApp();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const labels = {
    title: lang === "fr" ? "Mot de passe oublié" : lang === "en" ? "Forgot Password" : "نسيت كلمة المرور",
    desc: lang === "fr"
      ? "Entrez votre email et nous vous enverrons un lien de réinitialisation."
      : lang === "en"
        ? "Enter your email and we'll send you a reset link."
        : "أدخل بريدك الإلكتروني وسنرسل لك رابط إعادة التعيين.",
    send: lang === "fr" ? "Envoyer le lien" : lang === "en" ? "Send Reset Link" : "إرسال الرابط",
    sent: lang === "fr"
      ? "Un email de réinitialisation a été envoyé. Vérifiez votre boîte de réception."
      : lang === "en"
        ? "A reset email has been sent. Check your inbox."
        : "تم إرسال بريد إلكتروني لإعادة التعيين. تحقق من صندوق الوارد.",
    back: lang === "fr" ? "Retour à la connexion" : lang === "en" ? "Back to login" : "العودة لتسجيل الدخول",
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const redirectTo = `${window.location.origin}/reset-password`;
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (err) {
        setError(err.message);
      } else {
        setSent(true);
      }
    } catch {
      setError("Erreur réseau");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <img
            src="/logo-dark-removebg-preview.png"
            alt="PrediTeq"
            className="h-16 object-contain"
          />
        </div>

        <div className={`relative rounded-2xl p-[1px] auth-card-shadow ${theme === 'dark' ? 'bg-gradient-to-br from-primary/60 via-primary/20 to-border' : 'bg-gradient-to-br from-teal-700/60 via-teal-500/20 to-gray-200'}`}>
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
                    onChange={(e) => setEmail(e.target.value)}
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
                  className={`w-full h-12 rounded-xl text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 transition-all btn-premium ${theme === 'dark' ? 'bg-primary hover:bg-primary/90' : 'bg-gradient-to-r from-teal-700 to-teal-500 hover:from-teal-600 hover:to-teal-400 shadow-lg shadow-teal-700/15'}`}
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
