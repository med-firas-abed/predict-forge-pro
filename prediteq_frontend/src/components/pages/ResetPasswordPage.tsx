import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/contexts/AppContext";
import { CheckCircle, Lock } from "lucide-react";

interface Props {
  onNavigate: (route: string) => void;
}

export function ResetPasswordPage({ onNavigate }: Props) {
  const { lang, theme } = useApp();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);

  const labels = {
    title: lang === "fr" ? "Nouveau mot de passe" : lang === "en" ? "New Password" : "كلمة مرور جديدة",
    desc: lang === "fr" ? "Choisissez un nouveau mot de passe." : lang === "en" ? "Choose a new password." : "اختر كلمة مرور جديدة.",
    password: lang === "fr" ? "Nouveau mot de passe" : lang === "en" ? "New password" : "كلمة مرور جديدة",
    confirmLabel: lang === "fr" ? "Confirmer" : lang === "en" ? "Confirm" : "تأكيد",
    save: lang === "fr" ? "Enregistrer" : lang === "en" ? "Save" : "حفظ",
    done: lang === "fr" ? "Mot de passe mis à jour ! Vous pouvez vous connecter." : lang === "en" ? "Password updated! You can now sign in." : "تم تحديث كلمة المرور! يمكنك تسجيل الدخول الآن.",
    mismatch: lang === "fr" ? "Les mots de passe ne correspondent pas." : lang === "en" ? "Passwords do not match." : "كلمات المرور غير متطابقة.",
    tooShort: lang === "fr" ? "Min. 8 caractères, 1 majuscule, 1 minuscule, 1 chiffre." : lang === "en" ? "Min. 8 chars, 1 uppercase, 1 lowercase, 1 digit." : "٨ أحرف كحد أدنى، حرف كبير، حرف صغير، رقم.",
    login: lang === "fr" ? "Se connecter" : lang === "en" ? "Sign in" : "تسجيل الدخول",
    expired: lang === "fr" ? "Lien expiré ou invalide. Veuillez refaire la demande." : lang === "en" ? "Link expired or invalid. Please request a new one." : "الرابط منتهي أو غير صالح. يرجى طلب رابط جديد.",
  };

  // Listen for the PASSWORD_RECOVERY event from Supabase
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
      }
    });
    // Also check if we already have a valid session (user clicked link, Supabase auto-signed in)
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) { setError(labels.tooShort); return; }
    if (password !== confirm) { setError(labels.mismatch); return; }
    setSubmitting(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) {
        setError(err.message);
      } else {
        setSuccess(true);
        await supabase.auth.signOut();
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
            src={theme === "dark" ? "/logo-dark.svg" : "/logo-light.svg"}
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

            {success ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-sm text-emerald-600 dark:text-emerald-400">
                  <CheckCircle className="w-5 h-5 shrink-0" />
                  {labels.done}
                </div>
                <button
                  onClick={() => onNavigate("/login")}
                  className={`w-full h-12 rounded-xl text-white text-sm font-semibold transition-all btn-premium ${theme === 'dark' ? 'bg-primary hover:bg-primary/90' : 'bg-gradient-to-r from-teal-700 to-teal-500 hover:from-teal-600 hover:to-teal-400 shadow-lg shadow-teal-700/15'}`}
                >
                  {labels.login}
                </button>
              </div>
            ) : !ready ? (
              <div className="space-y-4">
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-sm text-amber-600 dark:text-amber-400">
                  {labels.expired}
                </div>
                <button
                  onClick={() => onNavigate("/forgot-password")}
                  className="w-full h-10 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-all"
                >
                  {lang === "fr" ? "Refaire la demande" : lang === "en" ? "Request again" : "إعادة الطلب"}
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-2 uppercase tracking-wider">
                    <Lock className="w-3 h-3 inline mr-1" />{labels.password}
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full h-12 rounded-xl border border-input bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                    placeholder="••••••••"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-2 uppercase tracking-wider">
                    {labels.confirmLabel}
                  </label>
                  <input
                    type="password"
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="w-full h-12 rounded-xl border border-input bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                    placeholder="••••••••"
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
                  {submitting ? "..." : labels.save}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
