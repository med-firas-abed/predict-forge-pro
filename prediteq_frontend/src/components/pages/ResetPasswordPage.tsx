import { useEffect, useState } from "react";
import { CheckCircle, Lock, Eye, EyeOff } from "lucide-react";

import { useApp } from "@/contexts/AppContext";
import {
  getAuthSession,
  onAuthStateChanged,
  signOutAuth,
  updateAuthPassword,
} from "@/lib/authClient";
import { repairText } from "@/lib/repairText";

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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const l = (fr: string, en: string, ar: string) =>
    repairText(lang === "fr" ? fr : lang === "en" ? en : ar);

  const labels = {
    title: l("Nouveau mot de passe", "New Password", "كلمة مرور جديدة"),
    desc: l("Choisissez un nouveau mot de passe.", "Choose a new password.", "اختر كلمة مرور جديدة."),
    password: l("Nouveau mot de passe", "New password", "كلمة مرور جديدة"),
    confirmLabel: l("Confirmer", "Confirm", "تأكيد"),
    save: l("Enregistrer", "Save", "حفظ"),
    done: l(
      "Mot de passe mis à jour. Vous pouvez vous connecter.",
      "Password updated. You can now sign in.",
      "تم تحديث كلمة المرور. يمكنك تسجيل الدخول الآن.",
    ),
    mismatch: l(
      "Les mots de passe ne correspondent pas.",
      "Passwords do not match.",
      "كلمات المرور غير متطابقة.",
    ),
    tooShort: l(
      "Minimum 8 caractères, 1 majuscule, 1 minuscule, 1 chiffre.",
      "Minimum 8 characters, 1 uppercase, 1 lowercase, 1 digit.",
      "8 أحرف على الأقل، حرف كبير، حرف صغير، ورقم.",
    ),
    login: l("Se connecter", "Sign in", "تسجيل الدخول"),
    expired: l(
      "Lien expiré ou invalide. Veuillez refaire la demande.",
      "Link expired or invalid. Please request a new one.",
      "الرابط منتهي أو غير صالح. يرجى طلب رابط جديد.",
    ),
    requestAgain: l("Refaire la demande", "Request again", "إعادة الطلب"),
    networkError: l("Erreur réseau", "Network error", "خطأ في الشبكة"),
  };

  const passwordToggleLabel = showPassword
    ? l("Masquer le mot de passe", "Hide password", "إخفاء كلمة المرور")
    : l("Afficher le mot de passe", "Show password", "إظهار كلمة المرور");

  const confirmPasswordToggleLabel = showConfirmPassword
    ? l("Masquer le mot de passe", "Hide password", "إخفاء كلمة المرور")
    : l("Afficher le mot de passe", "Show password", "إظهار كلمة المرور");

  useEffect(() => {
    const { data: { subscription } } = onAuthStateChanged((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
      }
    });

    getAuthSession().then(({ data }) => {
      if (data.session) setReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      setError(labels.tooShort);
      return;
    }

    if (password !== confirm) {
      setError(labels.mismatch);
      return;
    }

    setSubmitting(true);
    try {
      const { error: err } = await updateAuthPassword(password);
      if (err) {
        setError(repairText(err.message));
      } else {
        setSuccess(true);
        await signOutAuth();
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

            {success ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-sm text-emerald-600 dark:text-emerald-400">
                  <CheckCircle className="w-5 h-5 shrink-0" />
                  {labels.done}
                </div>
                <button
                  onClick={() => onNavigate("/login")}
                  className={`w-full h-12 rounded-xl text-white text-sm font-semibold transition-all btn-premium ${theme === "dark" ? "bg-primary hover:bg-primary/90" : "shadow-lg"}`}
                  style={theme !== "dark" ? { backgroundImage: "linear-gradient(to right, #0f766e, #14b8a6)" } : undefined}
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
                  {labels.requestAgain}
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-2 uppercase tracking-wider">
                    <Lock className="w-3 h-3 inline mr-1" />{labels.password}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="w-full h-12 rounded-xl border border-input bg-background px-4 pr-12 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                      placeholder="********"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted-foreground transition-all hover:text-foreground"
                      aria-label={passwordToggleLabel}
                      title={passwordToggleLabel}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground mb-2 uppercase tracking-wider">
                    {labels.confirmLabel}
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      required
                      value={confirm}
                      onChange={(event) => setConfirm(event.target.value)}
                      className="w-full h-12 rounded-xl border border-input bg-background px-4 pr-12 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                      placeholder="********"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((value) => !value)}
                      className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted-foreground transition-all hover:text-foreground"
                      aria-label={confirmPasswordToggleLabel}
                      title={confirmPasswordToggleLabel}
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
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
