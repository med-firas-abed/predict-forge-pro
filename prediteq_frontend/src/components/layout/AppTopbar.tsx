import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Search, Bell, Activity, Sun, Moon, Globe } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { useAlertes } from "@/hooks/useAlertes";

interface AppTopbarProps {
  title: string;
  subtitle: string;
  onSearch?: (query: string) => void;
}

export function AppTopbar({ title, subtitle, onSearch }: AppTopbarProps) {
  const { t, lang, setLang, theme, setTheme } = useApp();
  const { currentUser } = useAuth();
  const { alertes } = useAlertes(); // all alerts for badge
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Localized labels for search suggestions
  const L = useMemo(() => {
    const m: Record<string, Record<string, string>> = {
      // Group names
      "g.machines":    { fr: "Machines", en: "Machines", ar: "الآلات" },
      "g.monitoring":  { fr: "Surveillance", en: "Monitoring", ar: "المراقبة" },
      "g.maintenance": { fr: "Maintenance", en: "Maintenance", ar: "الصيانة" },
      "g.actions":     { fr: "Actions", en: "Actions", ar: "إجراءات" },
      "g.pages":       { fr: "Pages", en: "Pages", ar: "الصفحات" },
      // Machines
      "asc-a1": { fr: "ASC-A1 — Ascenseur Magasin A1", en: "ASC-A1 — Elevator Store A1", ar: "ASC-A1 — مصعد المخزن A1" },
      "asc-b2": { fr: "ASC-B2 — Ascenseur Magasin B2", en: "ASC-B2 — Elevator Store B2", ar: "ASC-B2 — مصعد المخزن B2" },
      "asc-c3": { fr: "ASC-C3 — Ascenseur Magasin C3", en: "ASC-C3 — Elevator Store C3", ar: "ASC-C3 — مصعد المخزن C3" },
      // Monitoring
      "hi":       { fr: "Indice de santé (HI)", en: "Health Index (HI)", ar: "مؤشر الصحة (HI)" },
      "rul":      { fr: "RUL — Durée de vie résiduelle", en: "RUL — Remaining Useful Life", ar: "RUL — العمر المتبقي" },
      "anomaly":  { fr: "Anomalies & détection", en: "Anomalies & Detection", ar: "الشذوذ والكشف" },
      "shap":     { fr: "SHAP — Explicabilité IA", en: "SHAP — AI Explainability", ar: "SHAP — تفسير الذكاء الاصطناعي" },
      // Maintenance
      "prev":     { fr: "Maintenance préventive", en: "Preventive Maintenance", ar: "صيانة وقائية" },
      "corr":     { fr: "Maintenance corrective", en: "Corrective Maintenance", ar: "صيانة تصحيحية" },
      "insp":     { fr: "Inspection", en: "Inspection", ar: "فحص" },
      // Actions
      "genReport":  { fr: "Générer rapport IA", en: "Generate AI Report", ar: "إنشاء تقرير IA" },
      "confSeuils": { fr: "Configurer les seuils", en: "Configure Thresholds", ar: "إعداد العتبات" },
      "manageAcct": { fr: "Gérer les comptes", en: "Manage Accounts", ar: "إدارة الحسابات" },
    };
    return (key: string) => m[key]?.[lang] ?? m[key]?.fr ?? key;
  }, [lang]);

  const GROUP_ORDER = [L("g.machines"), L("g.monitoring"), L("g.maintenance"), L("g.actions"), L("g.pages")];

  const searchOptions = useMemo(() => [
    // ── Machines ──
    { label: L("asc-a1"), keywords: ["asc-a1", "ben arous", "magasin a1", "bâtiment a", "elevator", "store a1", "مصعد", "المخزن"], route: "/machines", group: L("g.machines") },
    { label: L("asc-b2"), keywords: ["asc-b2", "sfax", "magasin b2", "bâtiment b", "elevator", "store b2", "مصعد", "المخزن"], route: "/machines", group: L("g.machines") },
    { label: L("asc-c3"), keywords: ["asc-c3", "sousse", "magasin c3", "bâtiment c", "elevator", "store c3", "مصعد", "المخزن"], route: "/machines", group: L("g.machines") },
    // ── Monitoring ──
    { label: L("hi"), keywords: ["health", "hi", "santé", "indice", "مؤشر", "صحة"], route: "/dashboard", group: L("g.monitoring") },
    { label: L("rul"), keywords: ["rul", "durée", "vie", "résiduel", "remaining", "prédiction", "العمر", "المتبقي"], route: "/dashboard", group: L("g.monitoring") },
    { label: L("anomaly"), keywords: ["anomal", "détection", "isolation", "forest", "detection", "شذوذ", "كشف"], route: "/alertes", group: L("g.monitoring") },
    { label: L("shap"), keywords: ["shap", "explicab", "feature", "importance", "explain", "تفسير", "ذكاء"], route: "/dashboard", group: L("g.monitoring") },
    // ── Maintenance ──
    { label: L("prev"), keywords: ["préventive", "preventive", "planifi", "صيانة", "وقائية"], route: "/maintenance", group: L("g.maintenance") },
    { label: L("corr"), keywords: ["corrective", "urgente", "panne", "réparation", "repair", "تصحيحية", "إصلاح", "عطل"], route: "/maintenance", group: L("g.maintenance") },
    { label: L("insp"), keywords: ["inspection", "vérification", "contrôle", "check", "فحص", "تفتيش"], route: "/maintenance", group: L("g.maintenance") },
    // ── Actions ──
    { label: L("genReport"), keywords: ["générer", "generate", "rapport", "report", "pdf", "تقرير", "إنشاء"], route: "/rapport-ia", group: L("g.actions") },
    { label: L("confSeuils"), keywords: ["configurer", "seuil", "threshold", "paramètre", "configure", "عتبة", "إعداد"], route: "/seuils", group: L("g.actions") },
    { label: L("manageAcct"), keywords: ["gérer", "approuver", "rejeter", "compte", "utilisateur", "manage", "account", "user", "إدارة", "حسابات", "موافقة"], route: "/admin/users", group: L("g.actions") },
    // ── Pages ──
    { label: t("nav.dashboard"), keywords: ["dashboard", "tableau", "bord", "لوحة", "القيادة"], route: "/dashboard", group: L("g.pages") },
    { label: t("nav.geo"), keywords: ["geo", "géo", "géolocalisation", "geolocation", "carte", "map", "localisation", "الموقع", "الجغرافي"], route: "/", group: L("g.pages") },
    { label: t("nav.machines"), keywords: ["machine", "ascenseur", "الآلات", "parc", "elevator"], route: "/machines", group: L("g.pages") },
    { label: t("nav.maintenance"), keywords: ["maintenance", "tache", "task", "gmao", "الصيانة"], route: "/maintenance", group: L("g.pages") },
    { label: t("nav.calendar"), keywords: ["calendrier", "calendar", "planning", "التقويم"], route: "/calendrier", group: L("g.pages") },
    { label: t("nav.costs"), keywords: ["cout", "coût", "budget", "cost", "dépense", "التكاليف", "الميزانية", "costs"], route: "/couts", group: L("g.pages") },
    { label: t("nav.alerts"), keywords: ["alerte", "alert", "alertes", "alerts", "urgence", "notification", "التنبيه", "التنبيهات"], route: "/alertes", group: L("g.pages") },
    { label: t("nav.rapportIA"), keywords: ["rapport", "report", "ia", "ai", "pdf", "تقرير", "الذكاء", "الاصطناعي"], route: "/rapport-ia", group: L("g.pages") },
    { label: t("nav.planner"), keywords: ["agent", "planner", "planif", "وكيل", "intelligent", "الذكاء", "الاصطناعي"], route: "/planner", group: L("g.pages") },
    { label: t("nav.seuils"), keywords: ["seuil", "seuils", "threshold", "thresholds", "عتبات", "التنبيه", "limite", "config"], route: "/seuils", group: L("g.pages") },
    { label: t("nav.simulator"), keywords: ["simulat", "simulateur", "simulator", "replay", "test", "المحاكي"], route: "/simulateur", group: L("g.pages") },
    { label: t("nav.experiment"), keywords: ["esp32", "experiment", "expérience", "capteur", "mpu6050", "mqtt", "iot", "تجربة"], route: "/experiment", group: L("g.pages") },
    { label: t("nav.admin"), keywords: ["admin", "administration", "parametre", "setting", "الإدارة"], route: "/administration", group: L("g.pages") },
    { label: t("nav.adminUsers"), keywords: ["compte", "comptes", "user", "utilisat", "account", "approbat", "حسابات", "إدارة", "gestion", "management"], route: "/admin/users", group: L("g.pages") },
  ], [t, L]);

  // Popular suggestions shown on focus (no typing needed)
  const defaultSuggestions = useMemo(() => searchOptions.filter(o =>
    o.label === L("asc-a1") || o.label === L("asc-b2") || o.label === L("asc-c3")
    || o.label === L("hi") || o.label === L("rul")
    || o.label === t("nav.alerts") || o.label === t("nav.dashboard") || o.label === t("nav.maintenance")
  ), [searchOptions, t, L]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return defaultSuggestions;
    const results = searchOptions.filter(opt =>
      opt.label.toLowerCase().includes(q) ||
      opt.keywords.some(k => k.includes(q) || q.includes(k))
    );
    // Sort by group order
    return results.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
  }, [searchQuery, searchOptions, defaultSuggestions]);

  // Track dropdown position relative to viewport
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const updateDropdownPos = useCallback(() => {
    if (searchRef.current) {
      const rect = searchRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 360) });
    }
  }, []);

  // Close on click outside (portal-aware)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (searchRef.current && !searchRef.current.contains(target)) {
        // Also check if click is inside the portal dropdown
        const portal = document.getElementById("search-dropdown-portal");
        if (portal && portal.contains(target)) return;
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Update position when suggestions shown or on scroll/resize
  useEffect(() => {
    if (showSuggestions) {
      updateDropdownPos();
      window.addEventListener("scroll", updateDropdownPos, true);
      window.addEventListener("resize", updateDropdownPos);
      return () => {
        window.removeEventListener("scroll", updateDropdownPos, true);
        window.removeEventListener("resize", updateDropdownPos);
      };
    }
  }, [showSuggestions, updateDropdownPos]);

  // Count non-acknowledged alerts (last 24h)
  const recentCount = alertes.filter(a => {
    if (a.acquitte) return false;
    const diff = Date.now() - new Date(a.createdAt).getTime();
    return diff < 86400000;
  }).length;
  const initials = currentUser?.fullName
    ? currentUser.fullName.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  return (
    <header className="h-[56px] min-h-[56px] bg-card/80 glass border-b border-border flex items-center gap-4 px-6 lg:px-8">
      {/* Page info */}
      <div>
        <h1 className="text-sm font-semibold text-foreground leading-tight">{title}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      </div>

      {/* System status indicator */}
      <div className="ml-4 flex items-center gap-2 px-3 py-1 rounded-xl bg-success/10 border border-success/20">
        <Activity className="w-3 h-3 text-success" />
        <span className="text-[0.6rem] font-semibold text-success tracking-wide uppercase">{t("topbar.live")}</span>
      </div>

      <div className="flex-1" />

      {/* Last update */}
      <div className="hidden xl:flex items-center gap-1.5 text-muted-foreground">
        <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
        <span className="text-[0.6rem]">{t("topbar.lastUpdate")}: {new Date().toLocaleString(lang === "fr" ? "fr-FR" : lang === "ar" ? "ar-TN" : "en-US", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
      </div>

      {/* Search with autocomplete */}
      <div ref={searchRef} className="hidden lg:block relative w-52">
        <div className="flex items-center gap-2 bg-surface-3 border border-border rounded-xl px-3 py-1.5 focus-within:border-primary/40 transition-colors">
          <Search className="w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder={t("topbar.search")}
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setShowSuggestions(true); }}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (filtered.length > 0) {
                  navigate(filtered[0].route);
                  setSearchQuery("");
                  setShowSuggestions(false);
                }
              }
              if (e.key === "Escape") { setShowSuggestions(false); }
            }}
            className="bg-transparent border-none outline-none text-foreground text-sm w-full placeholder:text-muted-foreground"
          />
        </div>
        {showSuggestions && filtered.length > 0 && createPortal(
          <div
            id="search-dropdown-portal"
            className="bg-card border border-border rounded-xl shadow-xl overflow-hidden max-h-80 overflow-y-auto"
            style={{ position: "fixed", top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width, zIndex: 99999 }}
          >
            {Array.from(new Set(filtered.map(o => o.group))).map(group => (
              <div key={group}>
                <div className="px-3 py-1.5 text-[0.6rem] font-bold uppercase tracking-widest text-muted-foreground bg-muted/50 sticky top-0">{group}</div>
                {filtered.filter(o => o.group === group).map(opt => (
                  <button
                    key={opt.label}
                    onClick={() => { navigate(opt.route); setSearchQuery(""); setShowSuggestions(false); }}
                    className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
                  >
                    <Search className="w-3 h-3 text-muted-foreground shrink-0" />
                    {opt.label}
                  </button>
                ))}
              </div>
            ))}
          </div>,
          document.body
        )}
      </div>

      {/* Language toggle */}
      <button
        onClick={() => setLang(lang === "fr" ? "en" : lang === "en" ? "ar" : "fr")}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-3 border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all text-xs font-semibold"
      >
        <Globe className="w-3.5 h-3.5" />
        {lang === "fr" ? "FR" : lang === "en" ? "EN" : "AR"}
      </button>

      {/* Theme toggle */}
      <button
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        className="w-8 h-8 rounded-xl bg-surface-3 border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
      >
        {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>

      {/* Notifications — navigates to /alerts */}
      <button
        onClick={() => navigate("/alertes")}
        className="relative w-8 h-8 rounded-xl bg-surface-3 border border-border flex items-center justify-center text-secondary-foreground hover:bg-border-subtle hover:text-foreground transition-all"
      >
        <Bell className="w-4 h-4" />
        {recentCount > 0 && <span className="notif-counter">{recentCount}</span>}
      </button>

      {/* User pill */}
      <div className="flex items-center gap-2.5 bg-surface-3 border border-border rounded-xl px-3 py-1.5 cursor-pointer hover:border-primary/30 transition-colors">
        <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-primary-foreground shadow-md">
          {initials}
        </div>
        <div className="hidden lg:block">
          <div className="text-sm font-semibold text-foreground leading-tight">{currentUser?.fullName ?? "Utilisateur"}</div>
          <div className="text-[0.6rem] text-primary uppercase tracking-wider font-semibold">{currentUser?.role ?? "user"}</div>
        </div>
      </div>
    </header>
  );
}
