import { ShieldAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";

const AccessDeniedPage = () => {
  const navigate = useNavigate();
  const { lang } = useApp();
  const l = (fr: string, en: string, ar: string) => (lang === "fr" ? fr : lang === "en" ? en : ar);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-6">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-premium">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h1 className="mt-5 text-2xl font-bold text-foreground">
          {l("Acces refuse", "Access denied", "تم رفض الوصول")}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {l(
            "Vous n'avez pas les droits necessaires pour ouvrir cette page.",
            "You do not have the required permissions to open this page.",
            "ليست لديك الصلاحيات اللازمة لفتح هذه الصفحة.",
          )}
        </p>
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90"
        >
          {l("Retour au tableau de bord", "Back to dashboard", "العودة إلى لوحة القيادة")}
        </button>
      </div>
    </div>
  );
};

export default AccessDeniedPage;
