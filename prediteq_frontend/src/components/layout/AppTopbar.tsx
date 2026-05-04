import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Search, Bell, Activity, Sun, Moon, Globe, ChevronDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { useAlertes } from "@/hooks/useAlertes";
import { useMachines } from "@/hooks/useMachines";
import { getActiveAlertCaseCount } from "@/lib/alertsSummary";

interface AppTopbarProps {
  title: string;
  subtitle: string;
  onSearch?: (query: string) => void;
}

export function AppTopbar({ title, subtitle, onSearch }: AppTopbarProps) {
  const { t, lang, setLang, theme, setTheme } = useApp();
  const { currentUser } = useAuth();
  const { alertes } = useAlertes();
  const { machines } = useMachines(currentUser?.machineId);
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const L = useMemo(() => {
    const m: Record<string, Record<string, string>> = {
      "g.machines": { fr: "Machines", en: "Machines", ar: "Machines" },
      "g.pages": { fr: "Pages", en: "Pages", ar: "Pages" },
    };
    return (key: string) => m[key]?.[lang] ?? m[key]?.fr ?? key;
  }, [lang]);

  const groupOrder = useMemo(() => [L("g.machines"), L("g.pages")], [L]);

  const searchOptions = useMemo(() => {
    const machineOptions = machines.map((machine) => ({
      label: `${machine.id} - ${machine.name}`,
      keywords: [machine.id, machine.name, machine.city, machine.loc]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase()),
      route: `/dashboard?machine=${encodeURIComponent(machine.id)}`,
      group: L("g.machines"),
    }));

    const pageOptions = [
      { label: t("nav.dashboard"), keywords: ["dashboard", "tableau", "bord", "prediction", "rul"], route: "/dashboard", group: L("g.pages") },
      { label: t("nav.geo"), keywords: ["geo", "geolocalisation", "carte", "map", "localisation"], route: "/geo", group: L("g.pages") },
      { label: t("nav.maintenance"), keywords: ["maintenance", "gmao", "tache", "intervention"], route: "/maintenance", group: L("g.pages") },
      { label: t("nav.alerts"), keywords: ["alerte", "alertes", "alerts", "notification", "anomalie"], route: "/alertes", group: L("g.pages") },
      { label: t("nav.ia"), keywords: ["rapport", "report", "agent", "planner", "ia", "ai", "pdf", "plan"], route: "/ia", group: L("g.pages") },
      { label: t("nav.machines"), keywords: ["machine", "machines", "ascenseur", "parc"], route: "/machines", group: L("g.pages") },
    ];

    return [...machineOptions, ...pageOptions];
  }, [L, machines, t]);

  const defaultSuggestions = useMemo(
    () => [...searchOptions.filter((option) => option.group === L("g.machines")).slice(0, 3), ...searchOptions.filter((option) => option.group === L("g.pages")).slice(0, 5)],
    [L, searchOptions],
  );

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return defaultSuggestions;

    const results = searchOptions.filter(
      (option) =>
        option.label.toLowerCase().includes(q) ||
        option.keywords.some((keyword) => keyword.includes(q) || q.includes(keyword)),
    );

    return results.sort(
      (left, right) => groupOrder.indexOf(left.group) - groupOrder.indexOf(right.group),
    );
  }, [defaultSuggestions, groupOrder, searchOptions, searchQuery]);

  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });

  const updateDropdownPos = useCallback(() => {
    if (!searchRef.current) return;
    const rect = searchRef.current.getBoundingClientRect();
    setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 360) });
  }, []);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const target = event.target as Node;
      if (searchRef.current && !searchRef.current.contains(target)) {
        const portal = document.getElementById("search-dropdown-portal");
        if (portal && portal.contains(target)) return;
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!showSuggestions) return;
    updateDropdownPos();
    window.addEventListener("scroll", updateDropdownPos, true);
    window.addEventListener("resize", updateDropdownPos);
    return () => {
      window.removeEventListener("scroll", updateDropdownPos, true);
      window.removeEventListener("resize", updateDropdownPos);
    };
  }, [showSuggestions, updateDropdownPos]);

  const activeCaseCount = getActiveAlertCaseCount(alertes);

  const initials = currentUser?.fullName
    ? currentUser.fullName
        .split(" ")
        .map((word) => word[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  const latestUpdate = useMemo(() => {
    const timestamps = machines
      .map((machine) => machine.decision?.updatedAt)
      .filter((value): value is string => Boolean(value))
      .map((value) => new Date(value))
      .filter((value) => !Number.isNaN(value.getTime()));
    if (timestamps.length === 0) return null;
    return new Date(Math.max(...timestamps.map((value) => value.getTime())));
  }, [machines]);

  const latestUpdateLabel = latestUpdate
    ? latestUpdate.toLocaleString(lang === "fr" ? "fr-FR" : lang === "ar" ? "ar-TN" : "en-US", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : t("dash.noData") ?? "Flux en attente";

  return (
    <header className="h-[56px] min-h-[56px] bg-card/80 glass border-b border-border flex items-center gap-4 px-6 lg:px-8">
      <div>
        <h1 className="text-sm font-semibold text-foreground leading-tight">{title}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      </div>

      <div className="ml-4 flex items-center gap-2 px-3 py-1 rounded-xl bg-success/10 border border-success/20">
        <Activity className="w-3 h-3 text-success" />
        <span className="text-[0.6rem] font-semibold text-success tracking-wide uppercase">
          {t("topbar.live")}
        </span>
      </div>

      <div className="flex-1" />

      <div className="hidden xl:flex items-center gap-1.5 text-muted-foreground">
        <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
        <span className="text-[0.6rem]">
          {t("topbar.lastUpdate")}:{" "}
          {latestUpdateLabel}
        </span>
      </div>

      <div ref={searchRef} className="hidden lg:block relative w-52">
        <div className="flex items-center gap-2 bg-surface-3 border border-border rounded-xl px-3 py-1.5 focus-within:border-primary/40 transition-colors">
          <Search className="w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder={t("topbar.search")}
            value={searchQuery}
            onChange={(event) => {
              const value = event.target.value;
              setSearchQuery(value);
              setShowSuggestions(true);
              onSearch?.(value);
            }}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && filtered.length > 0) {
                navigate(filtered[0].route);
                setSearchQuery("");
                setShowSuggestions(false);
              }
              if (event.key === "Escape") {
                setShowSuggestions(false);
              }
            }}
            className="bg-transparent border-none outline-none text-foreground text-sm w-full placeholder:text-muted-foreground"
          />
        </div>

        {showSuggestions &&
          filtered.length > 0 &&
          createPortal(
            <div
              id="search-dropdown-portal"
              className="bg-card border border-border rounded-xl shadow-xl overflow-hidden max-h-80 overflow-y-auto"
              style={{
                position: "fixed",
                top: dropdownPos.top,
                left: dropdownPos.left,
                width: dropdownPos.width,
                zIndex: 99999,
              }}
            >
              {Array.from(new Set(filtered.map((option) => option.group))).map((group) => (
                <div key={group}>
                  <div className="px-3 py-1.5 text-[0.6rem] font-bold uppercase tracking-widest text-muted-foreground bg-muted/50 sticky top-0">
                    {group}
                  </div>
                  {filtered
                    .filter((option) => option.group === group)
                    .map((option) => (
                      <button
                        key={option.label}
                        onClick={() => {
                          navigate(option.route);
                          setSearchQuery("");
                          setShowSuggestions(false);
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
                      >
                        <Search className="w-3 h-3 text-muted-foreground shrink-0" />
                        {option.label}
                      </button>
                    ))}
                </div>
              ))}
            </div>,
            document.body,
          )}
      </div>

      <label className="relative flex items-center gap-1.5 rounded-xl border border-border bg-surface-3 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:border-primary/30">
        <Globe className="w-3.5 h-3.5" />
        <select
          aria-label="Langue"
          value={lang}
          onChange={(event) => setLang(event.target.value as typeof lang)}
          className="appearance-none bg-transparent pr-4 text-xs font-semibold text-foreground outline-none"
        >
          <option value="fr">FR</option>
          <option value="en">EN</option>
          <option value="ar">AR</option>
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      </label>

      <button
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        className="w-8 h-8 rounded-xl bg-surface-3 border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
      >
        {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>

      <button
        onClick={() => navigate("/alertes")}
        className="relative w-8 h-8 rounded-xl bg-surface-3 border border-border flex items-center justify-center text-secondary-foreground hover:bg-border-subtle hover:text-foreground transition-all"
      >
        <Bell className="w-4 h-4" />
        {activeCaseCount > 0 && <span className="notif-counter">{activeCaseCount}</span>}
      </button>

      <div className="flex items-center gap-2.5 bg-surface-3 border border-border rounded-xl px-3 py-1.5 cursor-pointer hover:border-primary/30 transition-colors">
        <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-primary-foreground shadow-md">
          {initials}
        </div>
        <div className="hidden lg:block">
          <div className="text-sm font-semibold text-foreground leading-tight">
            {currentUser?.fullName ?? "Utilisateur"}
          </div>
          <div className="text-[0.6rem] text-primary uppercase tracking-wider font-semibold">
            {currentUser?.role ?? "user"}
          </div>
        </div>
      </div>
    </header>
  );
}
