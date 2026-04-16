import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useApp } from "@/contexts/AppContext";

const NotFound = () => {
  const location = useLocation();
  const { t } = useApp();

  useEffect(() => {
    // 404 tracked silently in production
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">{t("notfound.title")}</p>
        <a href="/" className="text-primary underline hover:text-primary/90">
          {t("notfound.home")}
        </a>
      </div>
    </div>
  );
};

export default NotFound;
