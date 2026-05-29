import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import { Award, Eye, EyeOff, Globe, Lock, Moon, Shield, Sun, UserPlus } from "lucide-react";

import { useApp } from "@/contexts/AppContext";
import { useAuth, UserRole } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { getMachinePublicLabel } from "@/lib/machinePresentation";

interface SignupPageProps {
  onNavigate: (route: string) => void;
}

export function SignupPage({ onNavigate }: SignupPageProps) {
  const { signup, currentUser } = useAuth();
  const { lang, setLang, theme, setTheme, t } = useApp();
  const location = useLocation();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<UserRole>("user");
  const [machineId, setMachineId] = useState("");
  const [machines, setMachines] = useState<{ id: string; code: string; nom: string }[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const l = (fr: string, en: string) => (lang === "en" ? en : fr);

  const isAdminCreateMode =
    currentUser?.role === "admin" &&
    currentUser.status === "approved" &&
    new URLSearchParams(location.search).get("mode") === "admin-create";

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (isAdminCreateMode) {
      setRole("user");
    }
  }, [isAdminCreateMode]);

  useEffect(() => {
    let mounted = true;
    apiFetch<{ id: string; code: string; nom: string }[]>("/auth/machines")
      .then((data) => {
        if (!mounted) return;
        setMachines(data ?? []);
        setMachineId(data?.[0]?.id ?? "");
      })
      .catch(() => {
        if (!mounted) return;
        setMachines([]);
        setMachineId("");
      });

    return () => {
      mounted = false;
    };
  }, []);

  const validateName = (value: string) => {
    if (value && !/^[\p{L}\s'-]+$/u.test(value)) {
      return l("Le nom ne doit contenir que des lettres", "Name must contain only letters");
    }
    if (value && value.trim().length < 3) {
      return l("Minimum 3 caracteres", "Minimum 3 characters");
    }
    return "";
  };

  const validateEmail = (value: string) => {
    if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      return l("Email invalide", "Invalid email");
    }
    return "";
  };

  const validatePassword = (value: string) => {
    if (!value) return "";
    if (value.length < 8) return l("Minimum 8 caracteres", "Minimum 8 characters");
    if (!/[A-Z]/.test(value)) return l("Une majuscule requise", "One uppercase letter required");
    if (!/[a-z]/.test(value)) return l("Une minuscule requise", "One lowercase letter required");
    if (!/[0-9]/.test(value)) return l("Un chiffre requis", "One digit required");
    return "";
  };

  const validateConfirm = (value: string) => {
    if (value && value !== password) {
      return l("Les mots de passe ne correspondent pas", "Passwords do not match");
    }
    return "";
  };

  const handleFieldChange = (
    field: string,
    value: string,
    validator: (nextValue: string) => string,
    setter: (nextValue: string) => void,
  ) => {
    setter(value);
    setFieldErrors((prev) => ({ ...prev, [field]: validator(value) }));
  };

  const passwordToggleLabel = showPassword
    ? l("Masquer le mot de passe", "Hide password")
    : l("Afficher le mot de passe", "Show password");

  const confirmPasswordToggleLabel = showConfirmPassword
    ? l("Masquer le mot de passe", "Hide password")
    : l("Afficher le mot de passe", "Show password");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const errors: Record<string, string> = {
      fullName: validateName(fullName),
      email: validateEmail(email),
      password: validatePassword(password),
      confirmPassword: validateConfirm(confirmPassword),
    };
    setFieldErrors(errors);

    if (Object.values(errors).some(Boolean)) {
      return;
    }

    if (password !== confirmPassword) {
      setError(t("auth.passwordMismatch"));
      return;
    }

    if (role === "user" && !machineId) {
      setError(l("Impossible de charger la liste des machines.", "Unable to load the machine list."));
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
        return;
      }

      if (isAdminCreateMode) {
        toast.success(
          l(
            "Utilisateur cree. Retour a l'administration pour validation.",
            "User created. Returning to administration for validation.",
          ),
        );
        onNavigate("/administration");
        return;
      }

      onNavigate("/pending");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center bg-background p-4 pt-10 relative">
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
          <div className="bg-card rounded-2xl p-8 space-y-5">
            <div className="text-center">
              <h1 className="text-lg font-semibold text-foreground">
                {isAdminCreateMode ? l("Ajouter un utilisateur", "Add a user") : t("auth.createAccount")}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {isAdminCreateMode
                  ? l(
                      "Creer un compte qui reviendra dans le circuit d'administration",
                      "Create an account that returns to the admin workflow",
                    )
                  : l(
                      "Demandez l'acces : le compte restera en attente jusqu'a validation",
                      "Request access: the account stays pending until approval",
                    )}
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
                  onChange={(e) => handleFieldChange("fullName", e.target.value, validateName, setFullName)}
                  className={`w-full h-12 rounded-xl border bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 transition-all ${
                    fieldErrors.fullName ? "border-destructive focus:ring-destructive/40" : "border-input focus:ring-ring"
                  }`}
                  placeholder="Ahmed Ben Ali"
                />
                {fieldErrors.fullName && <p className="text-xs text-destructive mt-1">{fieldErrors.fullName}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-2 uppercase tracking-wider">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => handleFieldChange("email", e.target.value, validateEmail, setEmail)}
                  className={`w-full h-12 rounded-xl border bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 transition-all ${
                    fieldErrors.email ? "border-destructive focus:ring-destructive/40" : "border-input focus:ring-ring"
                  }`}
                  placeholder={l("votre@email.com", "name@example.com")}
                />
                {fieldErrors.email && <p className="text-xs text-destructive mt-1">{fieldErrors.email}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-2 uppercase tracking-wider">
                    {t("auth.password")}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => {
                        handleFieldChange("password", e.target.value, validatePassword, setPassword);
                        if (confirmPassword) {
                          setFieldErrors((prev) => ({
                            ...prev,
                            confirmPassword:
                              e.target.value !== confirmPassword
                                ? l("Les mots de passe ne correspondent pas", "Passwords do not match")
                                : "",
                          }));
                        }
                      }}
                      className={`w-full h-12 rounded-xl border bg-background px-4 pr-12 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 transition-all ${
                        fieldErrors.password ? "border-destructive focus:ring-destructive/40" : "border-input focus:ring-ring"
                      }`}
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
                  {fieldErrors.password && <p className="text-xs text-destructive mt-1">{fieldErrors.password}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground mb-2 uppercase tracking-wider">
                    {t("auth.confirmPassword")}
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      required
                      value={confirmPassword}
                      onChange={(e) =>
                        handleFieldChange("confirmPassword", e.target.value, validateConfirm, setConfirmPassword)
                      }
                      className={`w-full h-12 rounded-xl border bg-background px-4 pr-12 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 transition-all ${
                        fieldErrors.confirmPassword ? "border-destructive focus:ring-destructive/40" : "border-input focus:ring-ring"
                      }`}
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
                  {fieldErrors.confirmPassword && (
                    <p className="text-xs text-destructive mt-1">{fieldErrors.confirmPassword}</p>
                  )}
                </div>
              </div>

              {!isAdminCreateMode && (
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-2 uppercase tracking-wider">
                    {t("auth.role")}
                  </label>
                  <div className="flex gap-3">
                    {(["user", "admin"] as UserRole[]).map((itemRole) => (
                      <button
                        key={itemRole}
                        type="button"
                        onClick={() => setRole(itemRole)}
                        className={`flex-1 h-12 rounded-xl text-sm font-medium border transition-all btn-premium ${
                          role === itemRole
                            ? "text-white"
                            : "bg-background text-foreground border-input hover:bg-muted"
                        }`}
                        style={
                          role === itemRole
                            ? {
                                backgroundColor: theme === "dark" ? "hsl(191, 50%, 42%)" : undefined,
                                backgroundImage:
                                  theme !== "dark" ? "linear-gradient(to right, #0f766e, #14b8a6)" : undefined,
                                borderColor: theme === "dark" ? "hsl(191, 50%, 42%)" : "#0f766e",
                              }
                            : undefined
                        }
                      >
                        {itemRole === "user" ? t("auth.user") : t("auth.administrator")}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {role === "user" && (
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-2 uppercase tracking-wider">
                    {t("auth.assignedMachine")}
                  </label>
                  <select
                    value={machineId}
                    onChange={(e) => setMachineId(e.target.value)}
                    required
                    disabled={machines.length === 0}
                    className="w-full h-12 rounded-xl border border-input bg-background px-4 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                  >
                    {machines.length === 0 ? (
                      <option value="">{l("Chargement indisponible", "Unable to load machines")}</option>
                    ) : (
                      machines.map((machine) => (
                        <option key={machine.id} value={machine.id}>
                          {getMachinePublicLabel({
                            id: machine.id,
                            code: machine.code,
                            name: machine.nom,
                          })}
                        </option>
                      ))
                    )}
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
                className={`w-full h-12 rounded-xl text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 transition-all btn-premium ${
                  theme === "dark" ? "bg-primary hover:bg-primary/90" : "shadow-lg"
                }`}
                style={
                  theme !== "dark"
                    ? { backgroundImage: "linear-gradient(to right, #0f766e, #14b8a6)" }
                    : undefined
                }
              >
                <UserPlus className="w-4 h-4" />
                {submitting
                  ? "..."
                  : isAdminCreateMode
                    ? l("Creer l'utilisateur", "Create user")
                    : t("auth.createBtn")}
              </button>
            </form>

            <div className="flex items-center gap-4">
              <div className="section-divider flex-1" />
              <span className="text-xs text-muted-foreground">{l("ou", "or")}</span>
              <div className="section-divider flex-1" />
            </div>

            <p className="text-sm text-muted-foreground text-center">
              {t("auth.hasAccount")}{" "}
              <button
                onClick={() => onNavigate("/login")}
                className={`hover:underline font-medium ${theme === "dark" ? "text-primary" : "text-teal-700"}`}
              >
                {t("auth.signInBtn")}
              </button>
            </p>
          </div>
        </div>

        <div className="flex items-center justify-center gap-6 mt-6">
          <span className="trust-badge">
            <Shield className="w-3 h-3" /> {l("Validation admin", "Admin approval")}
          </span>
          <span className="trust-badge">
            <Lock className="w-3 h-3" /> {l("Affectation machine", "Machine assignment")}
          </span>
          <span className="trust-badge">
            <Award className="w-3 h-3" /> {l("Roles admin / user", "Admin / user roles")}
          </span>
        </div>
      </div>
    </div>
  );
}
