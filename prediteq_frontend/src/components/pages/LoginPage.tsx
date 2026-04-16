import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import { Sun, Moon, Globe, Shield, Lock, Award } from "lucide-react";

interface LoginPageProps {
  onNavigate: (route: string) => void;
}

export function LoginPage({ onNavigate }: LoginPageProps) {
  const { login } = useAuth();
  const { lang, setLang, theme, setTheme, t } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const validateEmail = (v: string) => {
    if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v))
      return lang === "fr" ? "Email invalide" : lang === "en" ? "Invalid email" : "بريد إلكتروني غير صالح";
    return "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (validateEmail(email)) {
      setFieldErrors({ email: validateEmail(email) });
      return;
    }
    setSubmitting(true);
    try {
      const result = await login(email, password);
      if (!result.success) {
        setError(result.error || t("auth.loginError"));
        if (result.status === "pending") {
          setTimeout(() => onNavigate("/pending"), 1500);
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative">
      {/* Top-right controls */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <button
          onClick={() => setLang(lang === "fr" ? "en" : lang === "en" ? "ar" : "fr")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all text-xs font-semibold"
        >
          <Globe className="w-3.5 h-3.5" />
          {lang === "fr" ? "FR" : lang === "en" ? "EN" : "AR"}
        </button>
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>

      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-6 w-full">
          <img
            src="/logo-dark-removebg-preview.png"
            alt="PrediTeq"
            className="h-20 max-w-full object-contain animate-float"
          />
          <p className="text-sm text-muted-foreground mt-3 text-center">
            {lang === "fr" ? "SaaS de Maintenance Prédictive propulsé par l'IA" : lang === "en" ? "AI-Powered Predictive Maintenance SaaS" : "منصة SaaS للصيانة التنبؤية بالذكاء الاصطناعي"}
          </p>
        </div>

        {/* Form card with gradient border */}
        <div className={`relative rounded-2xl p-[1px] auth-card-shadow ${theme === 'dark' ? 'bg-gradient-to-br from-primary/60 via-primary/20 to-border' : 'bg-gradient-to-br from-teal-700/60 via-teal-500/20 to-gray-200'}`}>
          <div className="bg-card rounded-2xl p-8 space-y-6">
            <div className="text-center">
              <h1 className="text-lg font-semibold text-foreground">
                {lang === "fr" ? "Connexion" : lang === "en" ? "Sign In" : "تسجيل الدخول"}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {lang === "fr" ? "Accédez au SaaS de maintenance prédictive" : lang === "en" ? "Access the AI-powered predictive maintenance SaaS" : "الوصول إلى منصة SaaS للصيانة التنبؤية"}
              </p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-2 uppercase tracking-wider">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => {
                    setEmail(e.target.value);
                    setFieldErrors(prev => ({ ...prev, email: validateEmail(e.target.value) }));
                  }}
                  className={`w-full h-12 rounded-xl border bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 transition-all ${
                    fieldErrors.email ? "border-destructive focus:ring-destructive/40" : "border-input focus:ring-ring"
                  }`}
                  placeholder="votre@email.com"
                />
                {fieldErrors.email && <p className="text-xs text-destructive mt-1">{fieldErrors.email}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground mb-2 uppercase tracking-wider">
                  {t("auth.password")}
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
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
                {submitting ? "..." : t("auth.signInBtn")}
              </button>
            </form>

            <div className="text-center">
              <button
                onClick={() => onNavigate("/forgot-password")}
                className={`text-xs hover:underline ${theme === 'dark' ? 'text-primary/80 hover:text-primary' : 'text-teal-600 hover:text-teal-800'}`}
              >
                {lang === "fr" ? "Mot de passe oublié ?" : lang === "en" ? "Forgot password?" : "نسيت كلمة المرور؟"}
              </button>
            </div>

            {/* Gradient divider */}
            <div className="flex items-center gap-4">
              <div className="section-divider flex-1" />
              <span className="text-xs text-muted-foreground">{lang === "fr" ? "ou" : lang === "en" ? "or" : "أو"}</span>
              <div className="section-divider flex-1" />
            </div>

            <p className="text-sm text-muted-foreground text-center">
              {t("auth.noAccount")}{" "}
              <button onClick={() => onNavigate("/signup")} className={`hover:underline font-medium ${theme === 'dark' ? 'text-primary' : 'text-teal-700'}`}>
                {t("auth.signUp")}
              </button>
            </p>
          </div>
        </div>

        {/* Trust badges */}
        <div className="flex items-center justify-center gap-6 mt-6">
          <span className="trust-badge"><Shield className="w-3 h-3" /> SSL</span>
          <span className="trust-badge"><Lock className="w-3 h-3" /> AES-256</span>
          <span className="trust-badge"><Award className="w-3 h-3" /> ISO 27001</span>
        </div>
      </div>
    </div>
  );
}
