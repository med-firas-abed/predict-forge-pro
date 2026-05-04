import { useApp } from "@/contexts/AppContext";

export function AppFooter() {
  const { t } = useApp();

  return (
    <footer className="mt-8 space-y-1 border-t border-border pt-4 pb-4 text-center">
      <p className="text-[11px] text-muted-foreground">{t("footer.text")}</p>
      <p className="text-[10px] text-muted-foreground/60">PrediTeq v1.0</p>
    </footer>
  );
}
