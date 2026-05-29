import { useState } from "react";
import { Award, Eye, EyeOff, Globe, Lock, Moon, Shield, Sun } from "lucide-react";

import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";

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
  const [showPassword, setShowPassword] = useState(false);
  const l = (fr: string, en: string) => (lang === "en" ? en : fr);

  const validateEmail = (value: string) => {
    if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      return l("Email invalide", "Invalid email");
    }
    return "";
  };

  const togglePasswordLabel = showPassword
    ? l("Masquer le mot de passe", "Hide password")
    : l("Afficher le mot de passe", "Show password");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const emailError = validateEmail(email);
    if (emailError) {
      setFieldErrors({ email: emailError });
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
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <button
          onClick={() => setLang(lang === "fr" ? "en" : "fr")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all text-xs font-semibold"
        >
          <Globe className="w-3.5 h-3.5" />
          {lang === "fr" ? "FR" : "EN"}
        </button>
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>

      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6 w-full">
          <img
            src={theme === "dark" ? "/logo-dark-removebg-preview.png" : "/logo-light.svg"}
            alt="PrediTeq"
            className="h-20 max-w-full object-contain animate-float"
          />
          <p className="text-sm text-muted-foreground mt-3 text-center">
            {l("Plateforme PrediTeq de maintenance predictive", "PrediTeq predictive maintenance platform")}
          </p>
        </div>

        <div
          className="relative rounded-2xl p-[1px] auth-card-shadow"
          style={{
            backgroundImage:
              theme === "dark"
                ? "linear-gradient(to bottom right, hsl(var(--primary) / 0.6), hsl(var(--primary) / 0.2), hsl(var(--border)))"
                : "linear-gradient(to bottom right, rgba(15,118,110,0.6), rgba(20,184,166,0.2), #e5e7eb)",
          }}
        >
          <div className="bg-card rounded-2xl p-8 space-y-6">
            <div className="text-center">
              <h1 className="text-lg font-semibold text-foreground">{l("Connexion", "Sign In")}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {l(
                  "Accedez a votre espace PrediTeq apres validation du compte",
                  "Access your PrediTeq workspace once the account is approved",
                )}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-2 uppercase tracking-wider">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, email: validateEmail(e.target.value) }));
                  }}
                  className={`w-full h-12 rounded-xl border bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 transition-all ${
                    fieldErrors.email ? "border-destructive focus:ring-destructive/40" : "border-input focus:ring-ring"
                  }`}
                  placeholder={l("votre@email.com", "name@example.com")}
                />
                {fieldErrors.email && <p className="text-xs text-destructive mt-1">{fieldErrors.email}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-2 uppercase tracking-wider">
                  {t("auth.password")}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full h-12 rounded-xl border border-input bg-background px-4 pr-12 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                    placeholder="********"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted-foreground transition-all hover:text-foreground"
                    aria-label={togglePasswordLabel}
                    title={togglePasswordLabel}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
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
                className={`w-full h-12 rounded-xl text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 transition-all btn-premium ${
                  theme === "dark" ? "bg-primary hover:bg-primary/90" : "shadow-lg"
                }`}
                style={
                  theme !== "dark"
                    ? { backgroundImage: "linear-gradient(to right, #0f766e, #14b8a6)" }
                    : undefined
                }
              >
                {submitting ? "..." : t("auth.signInBtn")}
              </button>
            </form>

            <div className="text-center">
              <button
                onClick={() => onNavigate("/forgot-password")}
                className={`text-xs hover:underline ${
                  theme === "dark" ? "text-primary/80 hover:text-primary" : "text-teal-600 hover:text-teal-800"
                }`}
              >
                {l("Mot de passe oublie ?", "Forgot password?")}
              </button>
            </div>

            <div className="flex items-center gap-4">
              <div className="section-divider flex-1" />
              <span className="text-xs text-muted-foreground">{l("ou", "or")}</span>
              <div className="section-divider flex-1" />
            </div>

            <p className="text-sm text-muted-foreground text-center">
              {t("auth.noAccount")}{" "}
              <button
                onClick={() => onNavigate("/signup")}
                className={`hover:underline font-medium ${theme === "dark" ? "text-primary" : "text-teal-700"}`}
              >
                {t("auth.signUp")}
              </button>
            </p>
          </div>
        </div>

        <div className="flex items-center justify-center gap-6 mt-6">
          <span className="trust-badge">
            <Shield className="w-3 h-3" /> {l("Compte approuve", "Approved account")}
          </span>
          <span className="trust-badge">
            <Lock className="w-3 h-3" /> {l("Acces par machine", "Machine-scoped access")}
          </span>
          <span className="trust-badge">
            <Award className="w-3 h-3" /> {l("Roles admin / user", "Admin / user roles")}
          </span>
        </div>
      </div>
    </div>
  );
}
