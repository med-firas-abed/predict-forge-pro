import { useState, useEffect } from "react";
import { useAuth, UserRole } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/lib/supabase";
import { MACHINES } from "@/data/machines";
import { Sun, Moon, Globe, Shield, Lock, Award, UserPlus } from "lucide-react";

interface SignupPageProps {
  onNavigate: (route: string) => void;
}

export function SignupPage({ onNavigate }: SignupPageProps) {
  const { signup } = useAuth();
  const { lang, setLang, theme, setTheme, t } = useApp();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<UserRole>("user");
  const [machineId, setMachineId] = useState("");
  const [machines, setMachines] = useState<{ id: string; code: string; nom: string }[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { window.scrollTo(0, 0); }, []);

  // ── Field-level validation errors ──
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const validateName = (v: string) => {
    if (v && !/^[\p{L}\s'-]+$/u.test(v))
      return lang === "fr" ? "Le nom ne doit contenir que des lettres" : lang === "en" ? "Name must contain only letters" : "يجب أن يحتوي الاسم على أحرف فقط";
    if (v && v.trim().length < 3)
      return lang === "fr" ? "Minimum 3 caractères" : lang === "en" ? "Minimum 3 characters" : "3 أحرف على الأقل";
    return "";
  };

  const validateEmail = (v: string) => {
    if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v))
      return lang === "fr" ? "Email invalide" : lang === "en" ? "Invalid email" : "بريد إلكتروني غير صالح";
    return "";
  };

  const validatePassword = (v: string) => {
    if (!v) return "";
    if (v.length < 8)
      return lang === "fr" ? "Minimum 8 caractères" : lang === "en" ? "Minimum 8 characters" : "8 أحرف على الأقل";
    if (!/[A-Z]/.test(v))
      return lang === "fr" ? "Une majuscule requise" : lang === "en" ? "One uppercase letter required" : "حرف كبير واحد مطلوب";
    if (!/[a-z]/.test(v))
      return lang === "fr" ? "Une minuscule requise" : lang === "en" ? "One lowercase letter required" : "حرف صغير واحد مطلوب";
    if (!/[0-9]/.test(v))
      return lang === "fr" ? "Un chiffre requis" : lang === "en" ? "One digit required" : "رقم واحد مطلوب";
    return "";
  };

  const validateConfirm = (v: string) => {
    if (v && v !== password)
      return lang === "fr" ? "Les mots de passe ne correspondent pas" : lang === "en" ? "Passwords do not match" : "كلمات المرور غير متطابقة";
    return "";
  };

  const handleFieldChange = (field: string, value: string, validator: (v: string) => string, setter: (v: string) => void) => {
    setter(value);
    const err = validator(value);
    setFieldErrors(prev => ({ ...prev, [field]: err }));
  };

  useEffect(() => {
    supabase.from("machines").select("id, code, nom").order("code").then(({ data }) => {
      if (data && data.length > 0) {
        setMachines(data);
        setMachineId(data[0].id);
      } else {
        // Fallback to local static machines when Supabase is unreachable or RLS blocks
        const fallback = MACHINES.map(m => ({ id: m.id, code: m.id, nom: m.name }));
        setMachines(fallback);
        setMachineId(fallback[0].id);
      }
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Run all validators
    const errs: Record<string, string> = {
      fullName: validateName(fullName),
      email: validateEmail(email),
      password: validatePassword(password),
      confirmPassword: validateConfirm(confirmPassword),
    };
    setFieldErrors(errs);
    if (Object.values(errs).some(e => e)) return;

    if (password !== confirmPassword) {
      setError(t("auth.passwordMismatch"));
      return;
    }

    setSubmitting(true);
    try {
      const result = await signup({
        fullName,
        email,
        password,
        role,
        machineId: role === "user" ? machineId : undefined,
      });

      if (!result.success) {
        setError(result.error || t("auth.registrationError"));
      } else {
        onNavigate("/pending");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center bg-background p-4 pt-10 relative">
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
            src={theme === 'dark' ? "/logo-dark-removebg-preview.png" : "/logo-light.svg"}
            alt="PrediTeq"
            className="h-20 max-w-full object-contain animate-float"
          />
          <p className="text-sm text-muted-foreground mt-3 text-center">
            {lang === "fr" ? "SaaS de Maintenance Prédictive propulsé par l'IA" : lang === "en" ? "AI-Powered Predictive Maintenance SaaS" : "منصة SaaS للصيانة التنبؤية بالذكاء الاصطناعي"}
          </p>
        </div>

        {/* Form card with gradient border */}
        <div className="relative rounded-2xl p-[1px] auth-card-shadow" style={{ backgroundImage: theme === 'dark' ? 'linear-gradient(to bottom right, hsl(var(--primary) / 0.6), hsl(var(--primary) / 0.2), hsl(var(--border)))' : 'linear-gradient(to bottom right, rgba(15,118,110,0.6), rgba(20,184,166,0.2), #e5e7eb)' }}>
          <div className="bg-card rounded-2xl p-8 space-y-5">
            <div className="text-center">
              <h1 className="text-lg font-semibold text-foreground">
                {t("auth.createAccount")}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {lang === "fr" ? "Rejoignez le SaaS de maintenance prédictive" : lang === "en" ? "Join the AI-powered predictive maintenance SaaS" : "انضم إلى منصة SaaS للصيانة التنبؤية"}
              </p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-2 uppercase tracking-wider">
                  {t("auth.fullName")}
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={e => handleFieldChange("fullName", e.target.value, validateName, setFullName)}
                  className={`w-full h-12 rounded-xl border bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 transition-all ${
                    fieldErrors.fullName ? "border-destructive focus:ring-destructive/40" : "border-input focus:ring-ring"
                  }`}
                  placeholder="Ahmed Ben Ali"
                />
                {fieldErrors.fullName && <p className="text-xs text-destructive mt-1">{fieldErrors.fullName}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground mb-2 uppercase tracking-wider">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => handleFieldChange("email", e.target.value, validateEmail, setEmail)}
                  className={`w-full h-12 rounded-xl border bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 transition-all ${
                    fieldErrors.email ? "border-destructive focus:ring-destructive/40" : "border-input focus:ring-ring"
                  }`}
                  placeholder="votre@email.com"
                />
                {fieldErrors.email && <p className="text-xs text-destructive mt-1">{fieldErrors.email}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-2 uppercase tracking-wider">
                    {t("auth.password")}
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={e => {
                      handleFieldChange("password", e.target.value, validatePassword, setPassword);
                      if (confirmPassword) setFieldErrors(prev => ({ ...prev, confirmPassword: e.target.value !== confirmPassword ? (lang === "fr" ? "Les mots de passe ne correspondent pas" : "Passwords do not match") : "" }));
                    }}
                    className={`w-full h-12 rounded-xl border bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 transition-all ${
                      fieldErrors.password ? "border-destructive focus:ring-destructive/40" : "border-input focus:ring-ring"
                    }`}
                    placeholder="••••••••"
                  />
                  {fieldErrors.password && <p className="text-xs text-destructive mt-1">{fieldErrors.password}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-2 uppercase tracking-wider">
                    {t("auth.confirmPassword")}
                  </label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={e => handleFieldChange("confirmPassword", e.target.value, validateConfirm, setConfirmPassword)}
                    className={`w-full h-12 rounded-xl border bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 transition-all ${
                      fieldErrors.confirmPassword ? "border-destructive focus:ring-destructive/40" : "border-input focus:ring-ring"
                    }`}
                    placeholder="••••••••"
                  />
                  {fieldErrors.confirmPassword && <p className="text-xs text-destructive mt-1">{fieldErrors.confirmPassword}</p>}
                </div>
              </div>

              {/* Role selector */}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-2 uppercase tracking-wider">
                  {t("auth.role")}
                </label>
                <div className="flex gap-3">
                  {(["user", "admin"] as UserRole[]).map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRole(r)}
                      className={`flex-1 h-12 rounded-xl text-sm font-medium border transition-all btn-premium ${
                        role === r
                          ? "text-white"
                          : "bg-background text-foreground border-input hover:bg-muted"
                      }`}
                      style={role === r ? {
                        backgroundColor: theme === 'dark' ? 'hsl(191, 50%, 42%)' : undefined,
                        backgroundImage: theme !== 'dark' ? 'linear-gradient(to right, #0f766e, #14b8a6)' : undefined,
                        borderColor: theme === 'dark' ? 'hsl(191, 50%, 42%)' : '#0f766e'
                      } : undefined}
                    >
                      {r === "user"
                        ? t("auth.user")
                        : t("auth.administrator")}
                    </button>
                  ))}
                </div>
              </div>

              {/* Machine selector — only for users */}
              {role === "user" && (
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-2 uppercase tracking-wider">
                    {t("auth.assignedMachine")}
                  </label>
                  <select
                    value={machineId}
                    onChange={e => setMachineId(e.target.value)}
                    required
                    className="w-full h-12 rounded-xl border border-input bg-background px-4 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                  >
                    {machines.map(m => (
                      <option key={m.id} value={m.id}>{m.code} — {m.nom}</option>
                    ))}
                  </select>
                </div>
              )}

              {error && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className={`w-full h-12 rounded-xl text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 transition-all btn-premium ${theme === 'dark' ? 'bg-primary hover:bg-primary/90' : 'shadow-lg'}`}
                style={theme !== 'dark' ? { backgroundImage: 'linear-gradient(to right, #0f766e, #14b8a6)' } : undefined}
              >
                <UserPlus className="w-4 h-4" />
                {submitting ? "..." : t("auth.createBtn")}
              </button>
            </form>

            {/* Gradient divider */}
            <div className="flex items-center gap-4">
              <div className="section-divider flex-1" />
              <span className="text-xs text-muted-foreground">{lang === "fr" ? "ou" : lang === "en" ? "or" : "أو"}</span>
              <div className="section-divider flex-1" />
            </div>

            <p className="text-sm text-muted-foreground text-center">
              {t("auth.hasAccount")}{" "}
              <button onClick={() => onNavigate("/login")} className={`hover:underline font-medium ${theme === 'dark' ? 'text-primary' : 'text-teal-700'}`}>
                {t("auth.signInBtn")}
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
