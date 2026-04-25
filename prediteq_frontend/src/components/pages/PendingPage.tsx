import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import { Clock, Sun, Moon, Globe } from "lucide-react";

interface PendingPageProps {
  onNavigate: (route: string) => void;
}

export function PendingPage({ onNavigate }: PendingPageProps) {
  const { currentUser, logout, allUsers } = useAuth();
  const { lang, setLang, theme, setTheme, t } = useApp();

  const pendingUser = currentUser || allUsers.filter(u => u.status === "pending").sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

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

      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img
            src={theme === 'dark' ? "/logo-dark-removebg-preview.png" : "/logo-light.svg"}
            alt="PrediTeq"
            className="h-20 object-contain animate-float mb-3"
          />
          <div className="text-xl font-bold text-foreground tracking-tight">
            Predi<span className="text-primary">Teq</span>
          </div>
        </div>

        <div className="relative rounded-xl p-[1px] bg-gradient-to-br from-primary/60 via-primary/20 to-border auth-card-shadow">
          <div className="bg-card rounded-xl p-8 text-center">
            {/* Icon */}
            <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-6">
              <Clock className="w-8 h-8 text-primary" />
            </div>

            <h1 className="text-xl font-semibold text-foreground mb-2">
              {t("pending.title")}
            </h1>
            <p className="text-sm text-muted-foreground mb-6">
              {t("pending.message")}
            </p>

            {/* Summary card */}
            {pendingUser && (
              <div className="bg-muted/50 border border-border rounded-lg p-4 mb-6 text-left space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("pending.name")}</span>
                  <span className="text-foreground font-medium">{pendingUser.fullName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Email</span>
                  <span className="text-foreground font-medium">{pendingUser.email}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("pending.requestedRole")}</span>
                  <span className="text-xs font-semibold uppercase px-2 py-0.5 rounded bg-primary/10 text-primary">
                    {pendingUser.role === "admin"
                      ? t("auth.administrator")
                      : t("auth.user")}
                  </span>
                </div>
                {pendingUser.role === "user" && pendingUser.machineCode && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Machine</span>
                    <span className="text-foreground font-medium">{pendingUser.machineCode}</span>
                  </div>
                )}
              </div>
            )}

            <p className="text-xs text-muted-foreground mb-6">
              {t("pending.urgentContact")} : admin@prediteq.com
            </p>

            <button
              onClick={async () => { await logout(); onNavigate("/signup"); }}
              className="text-sm text-primary hover:underline font-medium"
            >
              {t("pending.signOut")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
