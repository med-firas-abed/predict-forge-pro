import { useApp } from "@/contexts/AppContext";

export function AppFooter() {
  const { t } = useApp();
  return (
    <footer className="border-t border-border mt-8 pt-4 pb-4 text-center space-y-1">
      <p className="text-[11px] text-muted-foreground">
        {t("footer.text")}
      </p>
      <p className="text-[10px] text-muted-foreground/60">
        PrediTeq v1.0 · PFE MIME — ISAMM · Encadré par M. Saber Abeda
      </p>
    </footer>
  );
}
