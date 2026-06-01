import { useState, useEffect, useRef, createContext, useContext } from "react";
import { useNavigate } from "react-router-dom";
import {
  Shield,
  TrendingUp,
  AlertTriangle,
  Bell,
  FileText,
  CalendarClock,
  ChevronRight,
  Play,
  Check,
  ArrowRight,
  Activity,
  Timer,
  Zap,
  BarChart3,
  Sun,
  Moon,
  Linkedin,
  MapPin,
  Phone,
  Youtube,
} from "lucide-react";
import { apiFetch } from "@/lib/api";

/* ───────────────────── i18n ───────────────────── */
type Lang = "fr" | "en";
const LangCtx = createContext<{ lang: Lang; toggle: () => void }>({ lang: "fr", toggle: () => {} });
const useLang = () => useContext(LangCtx);

/* ───────────────────── Theme ───────────────────── */
type Theme = "dark" | "light";
const ThemeCtx = createContext<{ theme: Theme; toggleTheme: () => void }>({ theme: "dark", toggleTheme: () => {} });
const useTheme = () => useContext(ThemeCtx);

/* Theme-aware class helpers */
const bg = (d: string, l: string) => ({ dark: d, light: l });
const tc = (d: string, l: string) => ({ dark: d, light: l });

const T = {
  nav: { features: { fr: "Fonctionnalités", en: "Features" }, how: { fr: "Comment ça marche", en: "How it Works" }, metrics: { fr: "Métriques", en: "Metrics" }, pricing: { fr: "Périmètre", en: "Scope" }, signin: { fr: "Connexion", en: "Sign In" }, getStarted: { fr: "Commencer", en: "Get Started" } },
  hero: {
    badge: { fr: "Plateforme de maintenance predictive", en: "Predictive maintenance platform" },
    h1a: { fr: "Prédisez les pannes", en: "Predict Equipment Failures" },
    h1b: { fr: "Avant qu'elles n'arrivent", en: "Before They Happen" },
    sub: { fr: "PrediTeq equipe vos machines de capteurs et transforme leurs signaux en decisions de maintenance plus tot, plus clairement et avec un niveau de confiance lisible.", en: "PrediTeq equips your machines with sensors and turns their signals into earlier, clearer maintenance decisions with readable confidence." },
    cta: { fr: "Essai Gratuit", en: "Start Free Trial" },
    demo: { fr: "Voir l'aperçu", en: "View overview" },
    hi: { fr: "Indice de santé (HI)", en: "Machine health (HI)" },
    optimal: { fr: "Optimal", en: "Optimal" },
    rul: { fr: "Prédiction RUL (Durée de Vie Restante)", en: "RUL Prediction (Remaining Useful Life)" },
    days: { fr: "JOURS", en: "DAYS" }, hours: { fr: "HEURES", en: "HOURS" }, mins: { fr: "MIN", en: "MINS" }, secs: { fr: "SEC", en: "SECS" },
  },
  trust: { fr: "Technologie Aroteq", en: "Aroteq Technology" },
  challenge: {
    label: { fr: "Défi & Solution", en: "Challenge & Solution" },
    title: { fr: "Une réponse lisible au problème\nde maintenance industrielle.", en: "A readable answer to the\nindustrial maintenance challenge." },
    challengeLabel: { fr: "Défi :", en: "Challenge:" },
    challengeText: { fr: "Anticiper les dérives et pannes potentielles sur plusieurs contextes industriels à partir de signaux instrumentés, de bancs de test connectés ou d'une future intégration terrain.", en: "Anticipate drift and potential failures across industrial contexts using instrumented signals, connected test benches, or a future field integration." },
    solutionLabel: { fr: "Solution :", en: "Solution:" },
    solutionText: { fr: "Une plateforme SaaS predictive multi-capteurs combinant la detection d'anomalies par ", en: "A predictive multi-sensor SaaS platform combining " },
    solutionIF: { fr: "Isolation Forest", en: "Isolation Forest" },
    solutionHI: { fr: "Indice de santé (HI)", en: "Machine health (HI)" },
    solutionRUL: { fr: "Prédiction RUL par Random Forest", en: "Random Forest RUL" },
    solutionValidated: { fr: "— validé sur le benchmark NASA C-MAPSS", en: "— validated on NASA C-MAPSS benchmark" },
    benefitsLabel: { fr: "Avantages :", en: "Benefits:" },
    benefits: {
      fr: ["Priorisation plus précoce des risques machine", "Indice de santé (HI) en temps réel (0–100 %) par machine", "Prédictions RUL avec intervalles de confiance", "Rapports de maintenance générés à la demande", "Surveillance multi-site depuis un seul tableau de bord"],
      en: ["Earlier prioritization of machine risk", "Real-time machine health (HI) for every machine", "RUL predictions with confidence intervals", "On-demand maintenance reports", "Multi-site monitoring from a single dashboard"],
    },
  },
  features: {
    label: { fr: "Notre Plateforme", en: "Our Platform" },
    title: { fr: "Maintenance predictive lisible", en: "Readable predictive maintenance" },
    sub: { fr: "Des fonctions concues pour relier signaux, diagnostic, lecture RUL et decision dans un meme parcours produit.", en: "Capabilities designed to connect signals, diagnosis, RUL reading, and action in one product flow." },
    items: [
      { title: { fr: "Indice de santé (HI)", en: "Machine health (HI)" }, desc: { fr: "Calcul continu de la santé machine à partir d'une télémétrie multi-capteurs reliée à un banc instrumenté, à une machine pilote ou à une machine cible.", en: "Continuous machine-health estimation from multi-sensor telemetry connected to an instrumented bench, a pilot machine, or a target machine." } },
      { title: { fr: "Lecture RUL", en: "RUL reading" }, desc: { fr: "La lecture RUL est publiee lorsque le contexte et l'historique disponibles rendent l'estimation defendable pour la maintenance.", en: "RUL is published when the available context and history make the estimate reliable enough for maintenance planning." } },
      { title: { fr: "Detection d'anomalies", en: "Anomaly detection" }, desc: { fr: "Identification rapide des deviations dans les signatures thermiques, vibratoires ou acoustiques.", en: "Fast identification of deviations in thermal, vibration, or acoustic signatures." } },
      { title: { fr: "Alertes terrain", en: "Field alerts" }, desc: { fr: "Notifications par email lorsque les seuils critiques sont approches. Niveaux URGENCE, SURVEILLANCE, OK.", en: "Email notifications when critical thresholds are approached. URGENCE, SURVEILLANCE, OK levels." } },
      { title: { fr: "Rapports maintenance", en: "Maintenance reports" }, desc: { fr: "Syntheses executives et analyses techniques generees a la demande a partir des memes decisions que le tableau de bord.", en: "Executive summaries and technical analyses generated on demand from the same dashboard decisions." } },
      { title: { fr: "Calendrier & Planification", en: "Calendar & Task Scheduling" }, desc: { fr: "Planifiez et suivez vos tâches de maintenance préventive grâce à un calendrier interactif avec rappels automatiques.", en: "Plan and track your preventive maintenance tasks with an interactive calendar and automatic reminders." } },
    ],
  },
  steps: {
    title: { fr: "La Feuille de Route vers\nune maintenance mieux anticipée", en: "The Roadmap to\nEarlier Maintenance Decisions" },
    items: [
      { title: { fr: "Connexion des Signaux", en: "Connect Signals" }, desc: { fr: "Le projet peut être relié à un banc instrumenté, à des signaux existants ou à une future chaîne industrielle selon le périmètre retenu.", en: "The project can be connected to an instrumented bench, existing signals, or a future industrial chain depending on the selected scope." } },
      { title: { fr: "Lire les signaux", en: "Read the signals" }, desc: { fr: "Notre plateforme analyse les comportements nominaux et les derives a partir des signaux multi-capteurs, pour produire HI, diagnostics et lecture RUL.", en: "Our platform analyzes nominal behavior and drift from multi-sensor signals to produce HI, diagnostics, and RUL readings." } },
      { title: { fr: "Publier la lecture", en: "Publish the reading" }, desc: { fr: "Recevez des alertes exploitables lorsque le contexte, les seuils et l'historique rendent la lecture utile pour la maintenance.", en: "Receive actionable alerts when context, thresholds, and history make the reading useful for maintenance." } },
      { title: { fr: "Agir en avance", en: "Act early" }, desc: { fr: "Alertes terrain, rapports maintenance et planification avant que les pannes ne surviennent.", en: "Field alerts, maintenance reports, and scheduling before failures occur." } },
    ],
  },
  stats: {
    accuracy: { fr: "Holdout R²", en: "Holdout R²" },
    latency: { fr: "RMSE Jours", en: "RMSE Days" },
    uptime: { fr: "Hybrid F1", en: "Hybrid F1" },
    benchmark: { fr: "Benchmark NASA", en: "NASA Benchmark" },
  },
  cases: {
    title: { fr: "Nos etudes de cas", en: "Our case studies" },
    featured: {
      tag: { fr: "CAS AROTEQ", en: "AROTEQ CASE" },
      title: { fr: "Machine AroTeq - photo avant du stockeur pilote", en: "AroTeq machine - front view of the pilot carousel" },
      desc: {
        fr: "Cette machine pilote AroTeq sert de point de depart a notre cas PrediTeq. A partir de cette base physique, la plateforme relie signaux, diagnostic, rapport et future integration CSV / PLC / LabVIEW.",
        en: "This AroTeq pilot machine is the starting point of our PrediTeq case study. From this physical base, the platform connects signals, diagnosis, reporting, and future CSV / PLC / LabVIEW integration.",
      },
      caption: { fr: "Photo avant de la machine pilote reelle", en: "Front photo of the real pilot machine" },
      points: {
        fr: ["Machine pilote reelle chez AroTeq", "Base de la future chaine CSV / PLC / LabVIEW", "Lecture HI, RUL, alertes et rapports dans la meme application"],
        en: ["Real pilot machine at AroTeq", "Foundation of the future CSV / PLC / LabVIEW chain", "HI, RUL, alerts, and reports in the same application"],
      },
    },
    items: [
      {
        tag: { fr: "PLANIFICATION", en: "PLANNING" },
        title: { fr: "Calendrier de maintenance - suivi terrain", en: "Maintenance calendar - field follow-up" },
        desc: {
          fr: "Les actions deja validees sont visibles par machine pour garder une lecture simple du terrain.",
          en: "Validated actions stay visible per machine to keep the field view simple and operational.",
        },
      },
      {
        tag: { fr: "RAPPORTS", en: "REPORTS" },
        title: { fr: "Rapport machine - synthese claire et export PDF", en: "Machine report - clear summary and PDF export" },
        desc: {
          fr: "Chaque machine peut etre relue a travers un rapport cible, sans melanger les autres equipements.",
          en: "Each machine can be reviewed through a focused report, without mixing in other equipment.",
        },
      },
    ],
  },
  pricing: {
    label: { fr: "Périmètres de projet", en: "Project scopes" },
    title: { fr: "Formats de déploiement progressif", en: "Progressive deployment formats" },
    sub: { fr: "Le périmètre exact dépend du niveau de maturité recherché : pilote ciblé, flotte restreinte ou extension industrielle.", en: "The exact scope depends on the target maturity level: targeted pilot, limited fleet, or industrial extension." },
    mo: { fr: "/mois", en: "/mo" },
    plans: [
      { name: { fr: "Banc instrumenté", en: "Instrumented bench" }, price: { fr: "Sur devis", en: "Custom" }, sub: { fr: "Banc ou machine instrumentée", en: "Instrumented bench or target machine" }, features: { fr: ["Acquisition capteurs reliée à PrediTeq", "Indice de santé (HI) en temps réel", "Page Experiment et tableau de bord", "Alertes email de validation", "Rapport de validation fonctionnelle"], en: ["Sensor acquisition connected to PrediTeq", "Real-time machine health (HI)", "Experiment page and dashboard", "Validation email alerts", "Functional validation report"] }, popular: false },
      { name: { fr: "Pilote", en: "Pilot" }, price: { fr: "Sur devis", en: "Custom" }, sub: { fr: "Petit parc instrumenté", en: "Small instrumented fleet" }, features: { fr: ["Télémétrie multi-capteurs", "RUL avec intervalles de confiance", "Tableau de bord multi-machine", "Alertes et rapports à la demande", "Bridge MQTT et réglage des seuils terrain"], en: ["Multi-sensor telemetry", "RUL with confidence intervals", "Multi-machine dashboard", "Alerts and on-demand reports", "MQTT bridge and field-threshold tuning"] }, popular: true },
      { name: { fr: "Extension industrielle", en: "Industrial extension" }, price: { fr: "Sur devis", en: "Custom" }, sub: { fr: "Intégration selon projet", en: "Integration per project" }, features: { fr: ["Connexion LabVIEW / PLC / supervision", "Déploiement cloud ou on-premise", "Ajustement progressif avec données terrain", "Adaptation des pages métier et du planner", "Montée en charge selon le site"], en: ["LabVIEW / PLC / supervision connection", "Cloud or on-premise deployment", "Progressive tuning with field data", "Adaptation of business pages and planner", "Scale-up according to the site"] }, popular: false },
    ],
  },
  cta: {
    h2a: { fr: "Prêt à mieux anticiper", en: "Ready to better anticipate" },
    h2b: { fr: "les arrêts imprévus ?", en: "unplanned downtime?" },
    sub: { fr: "Découvrez PrediTeq, la page Experiment et les scénarios de déploiement progressif selon le projet.", en: "Discover PrediTeq, the Experiment page, and the progressive deployment paths available per project." },
    btn: { fr: "Commencer Maintenant", en: "Get Started Now" },
  },
  footer: {
    desc: { fr: "Maintenance predictive pour la prochaine generation d'operations industrielles.", en: "Predictive maintenance for the next generation of industrial operations." },
    quick: { fr: "Accès Rapide", en: "Quick Access" },
    platform: { fr: "Plateforme", en: "Platform" },
    industries: { fr: "Industries", en: "Industries" },
    pricingF: { fr: "Périmètres", en: "Scope" },
    contact: { fr: "Contact", en: "Contact" },
    resources: { fr: "Ressources", en: "Resources" },
    docs: { fr: "Documentation", en: "Documentation" },
    api: { fr: "Référence API", en: "API Reference" },
    caseStudies: { fr: "Études de Cas", en: "Case Studies" },
    legal: { fr: "Légal", en: "Legal" },
    privacy: { fr: "Politique de Confidentialité", en: "Privacy Policy" },
    terms: { fr: "Conditions d'Utilisation", en: "Terms of Service" },
    cookies: { fr: "Politique de Cookies", en: "Cookie Policy" },
    copy: { fr: "© 2026 PrediTeq — Une solution Aroteq. Tous droits réservés.", en: "© 2026 PrediTeq — An Aroteq solution. All rights reserved." },
  },
  alertChart: { fr: "Alerte Critique : Usure Roulement", en: "Critical Alert: Bearing Wear" },
};

/* ───────────────────── Navbar ───────────────────── */
const NAV_KEYS = ["features", "how-it-works", "metrics", "pricing"] as const;

function Navbar({ onGetStarted, onLogin }: { onGetStarted: () => void; onLogin: () => void }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { lang, toggle } = useLang();
  const { theme, toggleTheme } = useTheme();
  const dark = theme === "dark";

  const navLabels = [T.nav.features[lang], T.nav.how[lang], T.nav.metrics[lang], T.nav.pricing[lang]];

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setMobileOpen(false);
  };

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 backdrop-blur-xl border-b transition-colors ${dark ? 'bg-[#0a1628]/80 border-white/5' : 'bg-white/80 border-gray-200'}`}>
      <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-4">
        {/* Logo block */}
        <div className="flex items-center">
          <img src={dark ? "/logo-dark-removebg-preview.png" : "/logo-light.svg"} alt="PrediTeq" className="h-10 w-auto" />
        </div>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-8">
          {NAV_KEYS.map((k, i) => (
            <button
              key={k}
              onClick={() => scrollTo(k)}
              className={`text-sm transition-colors ${dark ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}
            >
              {navLabels[i]}
            </button>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className={`p-2 rounded-lg border transition-all ${dark ? 'border-white/10 text-gray-300 hover:text-white hover:border-teal-500/30' : 'border-gray-300 text-gray-600 hover:text-gray-900 hover:border-teal-500'}`}
          >
            {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          {/* Lang toggle */}
          <button
            onClick={toggle}
            className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${dark ? 'border-white/10 text-gray-300 hover:text-white hover:border-teal-500/30' : 'border-gray-300 text-gray-600 hover:text-gray-900 hover:border-teal-500'}`}
          >
            {lang === "fr" ? "EN" : "FR"}
          </button>
          <button onClick={onLogin} className={`text-sm transition-colors ${dark ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}>
            {T.nav.signin[lang]}
          </button>
          <button
            onClick={onGetStarted}
            className="px-5 py-2 rounded-lg text-white text-sm font-semibold transition-all shadow-lg"
            style={{ backgroundImage: dark ? 'linear-gradient(to right, #14b8a6, #06b6d4)' : 'linear-gradient(to right, #0f766e, #14b8a6)' }}
          >
            {T.nav.getStarted[lang]}
          </button>
        </div>

        {/* Mobile hamburger */}
        <button className={`md:hidden ${dark ? 'text-gray-400' : 'text-gray-600'}`} onClick={() => setMobileOpen(!mobileOpen)}>
          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            {mobileOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className={`md:hidden backdrop-blur-xl border-t px-6 pb-4 space-y-3 ${dark ? 'bg-[#0a1628]/95 border-white/5' : 'bg-white/95 border-gray-200'}`}>
          {NAV_KEYS.map((k, i) => (
            <button
              key={k}
              onClick={() => scrollTo(k)}
              className={`block text-sm py-2 ${dark ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}
            >
              {navLabels[i]}
            </button>
          ))}
          <div className="flex items-center gap-2 py-2">
            <button onClick={toggleTheme} className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button onClick={toggle} className={`text-sm font-bold ${dark ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}>
              {lang === "fr" ? "🇬🇧 EN" : "🇫🇷 FR"}
            </button>
          </div>
          <button
            onClick={onLogin}
            className={`block text-sm py-2 text-left ${dark ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}
          >
            {T.nav.signin[lang]}
          </button>
          <button
            onClick={onGetStarted}
            className="w-full mt-2 px-5 py-2.5 rounded-lg text-white text-sm font-semibold"
            style={{ backgroundImage: dark ? 'linear-gradient(to right, #14b8a6, #06b6d4)' : 'linear-gradient(to right, #0f766e, #14b8a6)' }}
          >
            {T.nav.getStarted[lang]}
          </button>
        </div>
      )}
    </header>
  );
}

/* ───────────────────── RUL Countdown ───────────────────── */
const INITIAL_SECONDS = 14 * 86400 + 8 * 3600 + 42 * 60 + 1; // 14d 08h 42m 01s

function RulCountdown() {
  const { lang } = useLang();
  const { theme } = useTheme();
  const dark = theme === "dark";
  const [remaining, setRemaining] = useState(INITIAL_SECONDS);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setRemaining((prev) => (prev > 0 ? prev - 1 : INITIAL_SECONDS));
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);
  const mins = Math.floor((remaining % 3600) / 60);
  const secs = remaining % 60;

  const pad = (n: number) => String(n).padStart(2, "0");
  const totalInitial = INITIAL_SECONDS;
  const progressPct = ((remaining / totalInitial) * 100).toFixed(1);

  const units = [
    { val: pad(days), label: T.hero.days[lang] },
    { val: pad(hours), label: T.hero.hours[lang] },
    { val: pad(mins), label: T.hero.mins[lang] },
    { val: pad(secs), label: T.hero.secs[lang] },
  ];

  return (
    <div className={`rounded-2xl border backdrop-blur-sm p-6 ${dark ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-gray-50'}`}>
      <div className="flex items-center justify-between mb-4">
        <span className={`text-xs font-semibold uppercase tracking-wider ${dark ? 'text-gray-300' : 'text-gray-600'}`}>
          {T.hero.rul[lang]}
        </span>
        <Timer className={`w-4 h-4 ${dark ? 'text-teal-400' : 'text-teal-700'}`} />
      </div>
      <div className="grid grid-cols-4 gap-2 mt-4">
        {units.map((item) => (
          <div key={item.label} className="text-center">
            <div className={`text-3xl font-bold tabular-nums transition-all duration-300 ${dark ? 'text-white' : 'text-gray-900'}`}>
              {item.val}
            </div>
            <div className={`text-[9px] font-medium uppercase tracking-widest mt-1 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
              {item.label}
            </div>
          </div>
        ))}
      </div>
      <div className={`mt-5 h-1.5 rounded-full overflow-hidden ${dark ? 'bg-white/5' : 'bg-gray-200'}`}>
        <div
          className="h-full rounded-full bg-gradient-to-r from-teal-500 to-orange-400 transition-all duration-1000 ease-linear"
          style={{ width: `${progressPct}%` }}
        />
      </div>
    </div>
  );
}

/* ───────────────────── Hero ───────────────────── */
function Hero({ onGetStarted }: { onGetStarted: () => void }) {
  const { lang } = useLang();
  const { theme } = useTheme();
  const dark = theme === "dark";
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20">
      {/* Ambient glow */}
      <div
        className="absolute inset-0"
        style={{ backgroundImage: dark
          ? 'linear-gradient(to bottom, #0a1628, #0e1f38, #0a1628)'
          : 'linear-gradient(to bottom, #f9fafb, #ffffff, #f9fafb)'
        }}
      />
      <div
        className="absolute top-1/4 left-1/2 w-[800px] h-[400px] rounded-full"
        style={{
          transform: 'translateX(-50%)',
          filter: 'blur(120px)',
          backgroundColor: dark ? 'rgba(20,184,166,0.10)' : 'rgba(15,118,110,0.10)'
        }}
      />

      <div className="relative z-10 max-w-5xl mx-auto text-center px-6">
        <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border mb-8 ${dark ? 'border-teal-500/20 bg-teal-500/5' : 'border-teal-700/30 bg-teal-700/5'}`}>
          <Zap className="w-3.5 h-3.5 text-orange-400" />
          <span className={`text-xs font-semibold tracking-widest uppercase ${dark ? 'text-teal-400' : 'text-teal-700'}`}>
            {T.hero.badge[lang]}
          </span>
        </div>

        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold leading-tight tracking-tight">
          <span className={dark ? 'text-white' : 'text-gray-900'}>{T.hero.h1a[lang]}</span>
          <br />
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: dark ? 'linear-gradient(to right, #2dd4bf, #22d3ee)' : 'linear-gradient(to right, #0f766e, #14b8a6)' }}
          >
            {T.hero.h1b[lang]}
          </span>
        </h1>

        <p className={`mt-6 text-lg max-w-2xl mx-auto leading-relaxed ${dark ? 'text-gray-300' : 'text-gray-600'}`}>
          {T.hero.sub[lang]}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
          <button
            onClick={onGetStarted}
            className="group px-8 py-3.5 rounded-xl text-white font-semibold text-base transition-all shadow-xl flex items-center gap-2"
            style={{ backgroundImage: dark ? 'linear-gradient(to right, #14b8a6, #06b6d4)' : 'linear-gradient(to right, #0f766e, #14b8a6)' }}
          >
            {T.hero.cta[lang]}
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
          <button onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })} className={`flex items-center gap-2 px-6 py-3.5 transition-colors ${dark ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}>
            <Play className="w-4 h-4" />
            <span>{T.hero.demo[lang]}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Live dashboard mockup */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {/* Machine health card */}
          <div className={`rounded-2xl border backdrop-blur-sm p-6 ${dark ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-gray-50'}`}>
            <div className="flex items-center justify-between mb-4">
              <span className={`text-xs font-semibold uppercase tracking-wider ${dark ? 'text-gray-300' : 'text-gray-600'}`}>{T.hero.hi[lang]}</span>
              <BarChart3 className={`w-4 h-4 ${dark ? 'text-teal-400' : 'text-teal-700'}`} />
            </div>
            <div className="flex items-center justify-center">
              <div className="relative w-32 h-32">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                  <circle
                    cx="50" cy="50" r="42" fill="none"
                    stroke="url(#gaugeGrad)" strokeWidth="8"
                    strokeLinecap="round" strokeDasharray={`${0.92 * 264} ${264}`}
                  />
                  <defs>
                    <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor={dark ? "#14b8a6" : "#0f766e"} />
                      <stop offset="100%" stopColor={dark ? "#f97316" : "#f97316"} />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`text-3xl font-bold ${dark ? 'text-white' : 'text-gray-900'}`}>92%</span>
                  <span className={`text-[10px] font-semibold uppercase tracking-widest ${dark ? 'text-teal-400' : 'text-teal-700'}`}>{T.hero.optimal[lang]}</span>
                </div>
              </div>
            </div>
          </div>

          {/* RUL Card — Animated Countdown */}
          <RulCountdown />
        </div>
      </div>
    </section>
  );
}

/* ───────────────────── Trust Bar ───────────────────── */
function TrustBar() {
  const { lang } = useLang();
  const { theme } = useTheme();
  const dark = theme === "dark";
  const companies = ["IoT", "Machine Learning", "MQTT", "Temps Réel", "SaaS"];
  const text = companies.join("  ·  ");
  return (
    <section className={`py-12 border-y ${dark ? 'border-white/5 bg-[#0A1628]' : 'border-gray-200 bg-gray-50'}`}>
      <p className={`text-center text-xs font-semibold uppercase tracking-[0.25em] mb-8 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
        {T.trust[lang]}
      </p>
      <div className="max-w-6xl mx-auto px-6 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
        <div className="flex whitespace-nowrap animate-marquee opacity-40 w-max">
          {[0, 1].map((i) => (
            <span
              key={i}
              className="text-lg font-bold text-gray-400 tracking-wider px-8"
              aria-hidden={i === 1}
            >
              {text}  ·  
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────── Challenge / Solution ───────────────────── */
function ChallengeSolution() {
  const { lang } = useLang();
  const { theme } = useTheme();
  const dark = theme === "dark";
  return (
    <section id="features" className={`py-24 ${dark ? 'bg-[#0a1628]' : 'bg-white'}`}>
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-4">
          <span className={`text-xs font-semibold uppercase tracking-[0.2em] ${dark ? 'text-teal-400' : 'text-teal-700'}`}>
            {T.challenge.label[lang]}
          </span>
        </div>
        <h2 className={`text-4xl sm:text-5xl font-extrabold text-center mb-16 leading-tight whitespace-pre-line ${dark ? 'text-white' : 'text-gray-900'}`}>
          {T.challenge.title[lang]}
        </h2>

        <div className="grid md:grid-cols-3 gap-8 mb-16">
          <div>
            <p className={`text-xs font-semibold uppercase tracking-widest mb-3 ${dark ? 'text-teal-400' : 'text-teal-700'}`}>{T.challenge.challengeLabel[lang]}</p>
            <p className={`leading-relaxed ${dark ? 'text-gray-300' : 'text-gray-600'}`}>
              {T.challenge.challengeText[lang]}
            </p>
          </div>
          <div>
            <p className={`text-xs font-semibold uppercase tracking-widest mb-3 ${dark ? 'text-teal-400' : 'text-teal-700'}`}>{T.challenge.solutionLabel[lang]}</p>
            <p className={`leading-relaxed ${dark ? 'text-gray-300' : 'text-gray-600'}`}>
              {T.challenge.solutionText[lang]}<strong className={dark ? 'text-white' : 'text-gray-900'}>{T.challenge.solutionIF[lang]}</strong>{" "}
              {lang === "fr" ? ", le scoring " : " anomaly detection, "}<strong className={dark ? 'text-white' : 'text-gray-900'}>{T.challenge.solutionHI[lang]}</strong>
              {lang === "fr" ? ", et la " : " scoring, and "}<strong className={dark ? 'text-white' : 'text-gray-900'}>{T.challenge.solutionRUL[lang]}</strong>{" "}
              {lang === "fr" ? "prédiction" : " prediction"}
              {" "}{T.challenge.solutionValidated[lang]}.
            </p>
          </div>
          <div>
            <p className={`text-xs font-semibold uppercase tracking-widest mb-3 ${dark ? 'text-teal-400' : 'text-teal-700'}`}>{T.challenge.benefitsLabel[lang]}</p>
            <ul className={`space-y-2 ${dark ? 'text-gray-300' : 'text-gray-600'}`}>
              {T.challenge.benefits[lang].map((b) => (
                <li key={b} className="flex items-start gap-2">
                  <Check className={`w-4 h-4 mt-0.5 shrink-0 ${dark ? 'text-teal-400' : 'text-teal-700'}`} />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────── Features Grid ───────────────────── */
const FEATURE_ICONS = [Shield, TrendingUp, AlertTriangle, Bell, FileText, CalendarClock];

function FeaturesGrid() {
  const { lang } = useLang();
  const { theme } = useTheme();
  const dark = theme === "dark";
  return (
    <section className={`py-24 ${dark ? 'bg-gradient-to-b from-[#0a1628] to-[#0c1a30]' : 'bg-gray-50'}`}>
      <div className="max-w-6xl mx-auto px-6">
        <div className="mb-12">
          <span className={`text-xs font-semibold uppercase tracking-[0.25em] ${dark ? 'text-teal-400' : 'text-teal-700'}`}>{T.features.label[lang]}</span>
          <h2 className={`text-4xl md:text-5xl font-bold mt-3 ${dark ? 'text-white' : 'text-gray-900'}`}>{T.features.title[lang]}</h2>
          <p className={`mt-4 max-w-xl text-lg leading-relaxed ${dark ? 'text-gray-300' : 'text-gray-600'}`}>
            {T.features.sub[lang]}
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {T.features.items.map((f, i) => {
            const Icon = FEATURE_ICONS[i];
            return (
              <div
                key={f.title.en}
                className={`group rounded-2xl border transition-all p-6 ${dark ? 'border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-teal-500/20' : 'border-gray-200 bg-white hover:border-teal-700/40 hover:shadow-lg'}`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 transition-colors ${dark ? 'bg-teal-500/10 group-hover:bg-teal-500/20' : 'bg-teal-700/10 group-hover:bg-teal-700/15'}`}>
                  <Icon className={`w-5 h-5 ${dark ? 'text-teal-400' : 'text-teal-700'}`} />
                </div>
                <h3 className={`text-lg font-bold mb-2 ${dark ? 'text-white' : 'text-gray-900'}`}>{f.title[lang]}</h3>
                <p className={`text-sm leading-relaxed ${dark ? 'text-gray-300' : 'text-gray-600'}`}>{f.desc[lang]}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────── How it Works ───────────────────── */
function HowItWorks() {
  const { lang } = useLang();
  const { theme } = useTheme();
  const dark = theme === "dark";
  const STEPS = T.steps.items;
  const nums = ["01", "02", "03", "04"];
  return (
    <section id="how-it-works" className={`py-24 ${dark ? 'bg-[#0a1628]' : 'bg-white'}`}>
      <div className="max-w-6xl mx-auto px-6">
        <h2 className={`text-4xl sm:text-5xl font-extrabold mb-16 whitespace-pre-line ${dark ? 'text-white' : 'text-gray-900'}`}>
          {T.steps.title[lang]}
        </h2>

        <div className="grid md:grid-cols-2 gap-16">
          {/* Steps */}
          <div className="space-y-10">
            {STEPS.map((s, i) => (
              <div key={nums[i]} className="flex gap-5">
                <div className="flex flex-col items-center">
                  <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-sm font-bold ${i % 2 === 0 ? 'border-orange-500/30 text-orange-400' : dark ? 'border-teal-500/30 text-teal-400' : 'border-teal-700/30 text-teal-700'}`}>
                    {nums[i]}
                  </div>
                  {i < STEPS.length - 1 && <div className={`w-px flex-1 mt-2 ${dark ? 'bg-white/5' : 'bg-gray-200'}`} />}
                </div>
                <div className="pb-8">
                  <h3 className={`text-xl font-bold mb-2 ${dark ? 'text-white' : 'text-gray-900'}`}>{s.title[lang]}</h3>
                  <p className={`leading-relaxed ${dark ? 'text-gray-300' : 'text-gray-600'}`}>{s.desc[lang]}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Machine photo */}
          <div className="hidden md:flex items-center justify-center">
            <div className="w-full max-w-lg space-y-4">
              <div className={`rounded-2xl border overflow-hidden ${dark ? 'border-white/10' : 'border-gray-200'}`}>
                <img src="/photo_machine_aroteq.png" alt="AroTeq Industrial Machine" className="w-full h-auto object-cover rounded-2xl" />
              </div>
              <div className={`rounded-2xl border overflow-hidden shadow-[0_24px_48px_-32px_rgba(15,23,42,0.7)] ${dark ? 'border-white/10 bg-white/[0.02]' : 'border-gray-200 bg-white'}`}>
                <div className="aspect-[16/9] w-full overflow-hidden">
                  <img
                    src="/landing-preview-dashboard.png?v=20260508c"
                    alt="PrediTeq dashboard preview"
                    className="h-full w-full object-cover object-top"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────── Stats / Metrics ───────────────────── */
function AnimatedValue({ from, to, suffix, duration, start }: { from: number; to: number; suffix: string; duration: number; start: boolean }) {
  const [current, setCurrent] = useState(from);
  useEffect(() => {
    if (!start) return;
    setCurrent(from);
    const steps = 60;
    const interval = duration / steps;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      const progress = Math.min(step / steps, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setCurrent(Math.round(from + (to - from) * eased));
      if (step >= steps) clearInterval(timer);
    }, interval);
    return () => clearInterval(timer);
  }, [start, from, to, duration]);
  return <>{current}{suffix}</>;
}

interface LandingPublicMetrics {
  marketing_cards: {
    r2_pct: number | null;
    rmse_days: number | null;
    hybrid_f1_pct: number | null;
    cmapss_r2_pct: number | null;
  };
}

function Metrics() {
  const { lang } = useLang();
  const { theme } = useTheme();
  const dark = theme === "dark";
  const [metrics, setMetrics] = useState<LandingPublicMetrics | null>(null);
  const DEFAULT_MARKETING_CARDS = {
    r2_pct: 98,
    rmse_days: 2.5,
    hybrid_f1_pct: 96,
    cmapss_r2_pct: 89,
  };
  const INITIAL_STATS: { value: string; label: string; orange?: boolean; animate?: { from: number; to: number; suffix: string; duration: number } }[] = [
    { value: "—", label: T.stats.accuracy[lang] },
    { value: "—", label: T.stats.latency[lang], orange: true },
    { value: "—", label: T.stats.uptime[lang] },
    { value: "200", label: lang === "fr" ? "Trajectoires" : "Trajectories", orange: true },
  ];
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void apiFetch<LandingPublicMetrics>("/health/public-metrics")
      .then((data) => {
        if (!cancelled) {
          setMetrics(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMetrics(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold: 0.3 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const cards = metrics?.marketing_cards ?? DEFAULT_MARKETING_CARDS;
  const STATS = [
    { value: `${cards.r2_pct ?? 0}%`, label: T.stats.accuracy[lang], animate: cards.r2_pct != null ? { from: 0, to: cards.r2_pct, suffix: "%", duration: 2400 } : undefined },
    { value: cards.rmse_days != null ? `${cards.rmse_days} ${lang === "fr" ? "j" : "d"}` : "--", label: T.stats.latency[lang], orange: true },
    { value: cards.hybrid_f1_pct != null ? `${cards.hybrid_f1_pct}%` : "--", label: T.stats.uptime[lang], animate: cards.hybrid_f1_pct != null ? { from: 0, to: cards.hybrid_f1_pct, suffix: "%", duration: 2200 } : undefined },
    { value: cards.cmapss_r2_pct != null ? `${cards.cmapss_r2_pct}%` : "--", label: T.stats.benchmark[lang], orange: true, animate: cards.cmapss_r2_pct != null ? { from: 0, to: cards.cmapss_r2_pct, suffix: "%", duration: 2200 } : undefined },
  ];

  return (
    <section id="metrics" className={`py-20 ${dark ? 'bg-gradient-to-b from-[#0c1a30] to-[#0a1628]' : 'bg-gray-50'}`}>
      <div ref={ref} className="max-w-6xl mx-auto px-6">
        <div className={`mb-8 text-center text-xs font-semibold uppercase tracking-[0.24em] ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
          {lang === "fr" ? "Validation du modele" : "Validated model performance"}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <div className={`text-4xl sm:text-5xl font-extrabold mb-2 ${s.orange ? 'text-orange-400' : dark ? 'text-white' : 'text-gray-900'}`}>
                {s.animate ? (
                  <AnimatedValue from={s.animate.from} to={s.animate.to} suffix={s.animate.suffix} duration={s.animate.duration} start={visible} />
                ) : s.value}
              </div>
              <div className={`text-xs font-semibold uppercase tracking-[0.2em] ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────── Case Studies ───────────────────── */
function CaseStudiesSection() {
  const { lang } = useLang();
  const { theme } = useTheme();
  const dark = theme === "dark";
  const featured = T.cases.featured;
  return (
    <section className={`py-24 ${dark ? 'bg-[#0a1628]' : 'bg-white'}`}>
      <div className="max-w-6xl mx-auto px-6">
        <h2 className={`text-4xl sm:text-5xl font-extrabold mb-16 text-center ${dark ? 'text-white' : 'text-gray-900'}`}>
          {T.cases.title[lang]}
        </h2>
        <div className="grid lg:grid-cols-[1.5fr_0.9fr] gap-6">
          <article
            className={`overflow-hidden rounded-[28px] border ${dark ? 'border-white/5 bg-white/[0.03]' : 'border-gray-200 bg-white shadow-[0_24px_48px_-32px_rgba(15,23,42,0.22)]'}`}
          >
            <div className="grid lg:grid-cols-[1.05fr_0.95fr] h-full">
              <div className="relative min-h-[320px] overflow-hidden">
                <img
                  src="/landing-aroteq-photo-avant.jpg?v=20260601a"
                  alt={lang === "fr" ? "Photo avant de la machine AroTeq" : "Front photo of the AroTeq machine"}
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <div className={`absolute inset-0 ${dark ? 'bg-gradient-to-t from-[#0a1628]/80 via-[#0a1628]/15 to-transparent' : 'bg-gradient-to-t from-slate-900/65 via-slate-900/10 to-transparent'}`} />
                <div className="absolute bottom-0 left-0 right-0 p-6">
                  <span className="inline-flex rounded-full bg-white/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-900">
                    {featured.caption[lang]}
                  </span>
                </div>
              </div>

              <div className="p-8 sm:p-10">
                <span className={`inline-block px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-[0.22em] ${dark ? 'bg-teal-500/15 text-teal-300' : 'bg-teal-700/10 text-teal-700'}`}>
                  {featured.tag[lang]}
                </span>
                <h3 className={`mt-4 text-2xl sm:text-3xl font-extrabold leading-tight ${dark ? 'text-white' : 'text-gray-900'}`}>
                  {featured.title[lang]}
                </h3>
                <p className={`mt-4 leading-7 ${dark ? 'text-gray-300' : 'text-gray-600'}`}>
                  {featured.desc[lang]}
                </p>

                <div className="mt-6 space-y-3">
                  {featured.points[lang].map((point) => (
                    <div key={point} className="flex items-start gap-3">
                      <span className={`mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${dark ? 'bg-teal-500/15 text-teal-300' : 'bg-teal-700/10 text-teal-700'}`}>
                        <Check className="h-3.5 w-3.5" />
                      </span>
                      <p className={`text-sm leading-6 ${dark ? 'text-gray-200' : 'text-gray-700'}`}>{point}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </article>

          <div className="grid sm:grid-cols-2 lg:grid-cols-1 gap-6">
          {T.cases.items.map((c) => (
            <div
              key={c.title.en}
              className={`group relative rounded-2xl border transition-all overflow-hidden min-h-[220px] flex flex-col justify-end p-6 ${dark ? 'border-white/5 bg-gradient-to-br from-teal-900/10 to-cyan-900/5 hover:border-teal-500/20' : 'border-gray-200 bg-gradient-to-br from-teal-50 to-teal-100/30 hover:border-teal-700/40 hover:shadow-lg'}`}
            >
              <div className={`absolute inset-0 ${dark ? 'bg-gradient-to-t from-[#0a1628]/90 via-transparent to-transparent' : 'bg-gradient-to-t from-white/80 via-transparent to-transparent'}`} />
              <div className="relative z-10">
                <span className={`inline-block px-2.5 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider mb-3 ${dark ? 'bg-teal-500/15 text-teal-400' : 'bg-teal-700/10 text-teal-700'}`}>
                  {c.tag[lang]}
                </span>
                <h3 className={`text-lg font-bold leading-snug ${dark ? 'text-white' : 'text-gray-900'}`}>{c.title[lang]}</h3>
                <p className={`mt-3 text-sm leading-6 ${dark ? 'text-gray-300' : 'text-gray-600'}`}>{c.desc[lang]}</p>
              </div>
            </div>
          ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────── Pricing ───────────────────── */
function Pricing() {
  const { lang } = useLang();
  const { theme } = useTheme();
  const dark = theme === "dark";
  const plans = T.pricing.plans;
  return (
    <section id="pricing" className={`py-24 ${dark ? 'bg-gradient-to-b from-[#0a1628] to-[#0c1a30]' : 'bg-gray-50'}`}>
      <div className="max-w-6xl mx-auto px-6 text-center">
        <span className={`text-xs font-semibold uppercase tracking-[0.2em] ${dark ? 'text-teal-400' : 'text-teal-700'}`}>{T.pricing.label[lang]}</span>
        <h2 className={`text-4xl sm:text-5xl font-extrabold mt-3 mb-4 ${dark ? 'text-white' : 'text-gray-900'}`}>
          {T.pricing.title[lang]}
        </h2>
        <p className={`mb-16 ${dark ? 'text-gray-300' : 'text-gray-600'}`}>{T.pricing.sub[lang]}</p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 text-left">
          {plans.map((p) => {
            const priceStr = typeof p.price === "string" ? p.price : p.price[lang];
            const isCustom = priceStr === "Custom" || priceStr === "Sur devis";
            return (
              <div
                key={p.name.en}
                className={`relative rounded-2xl border p-8 transition-all ${
                  p.popular
                    ? dark ? "border-teal-500/30 bg-white/[0.04] shadow-lg shadow-teal-500/5" : "border-teal-700/50 bg-white shadow-lg shadow-teal-700/10"
                    : dark ? "border-white/5 bg-white/[0.02]" : "border-gray-200 bg-white"
                }`}
              >
                {p.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className={`px-4 py-1 rounded-full bg-gradient-to-r text-xs font-bold uppercase tracking-wider text-white ${dark ? 'from-teal-500 via-cyan-500 to-orange-500' : 'from-teal-700 via-teal-500 to-orange-500'}`}>
                      {lang === "fr" ? "Plus Populaire" : "Most Popular"}
                    </span>
                  </div>
                )}
                <p className={`text-xs font-semibold uppercase tracking-[0.2em] mb-2 ${dark ? 'text-teal-400' : 'text-teal-700'}`}>{p.name[lang]}</p>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className={`text-4xl font-extrabold ${dark ? 'text-white' : 'text-gray-900'}`}>{priceStr}</span>
                  {!isCustom && <span className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{T.pricing.mo[lang]}</span>}
                </div>
                <p className={`text-sm mb-6 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{p.sub[lang]}</p>
                <ul className="space-y-3">
                  {p.features[lang].map((f) => (
                    <li key={f} className={`flex items-start gap-2 text-sm ${dark ? 'text-gray-300' : 'text-gray-600'}`}>
                      <Check className={`w-4 h-4 mt-0.5 shrink-0 ${dark ? 'text-teal-400' : 'text-teal-700'}`} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────── CTA ───────────────────── */
function CtaSection({ onGetStarted }: { onGetStarted: () => void }) {
  const { lang } = useLang();
  const { theme } = useTheme();
  const dark = theme === "dark";
  return (
    <section className={`py-28 text-center ${dark ? 'bg-[#0a1628]' : 'bg-white'}`}>
      <div className="max-w-3xl mx-auto px-6">
        <h2 className={`text-4xl sm:text-5xl font-extrabold mb-4 leading-tight ${dark ? 'text-white' : 'text-gray-900'}`}>
          {T.cta.h2a[lang]}<br />
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: dark ? 'linear-gradient(to right, #2dd4bf, #22d3ee)' : 'linear-gradient(to right, #0f766e, #14b8a6)' }}
          >
            {T.cta.h2b[lang]}
          </span>
        </h2>
        <p className={`mb-10 ${dark ? 'text-gray-300' : 'text-gray-600'}`}>
          {T.cta.sub[lang]}
        </p>
        <button
          onClick={onGetStarted}
          className="px-10 py-4 rounded-xl text-white font-semibold text-lg transition-all shadow-xl"
          style={{ backgroundImage: dark ? 'linear-gradient(to right, #14b8a6, #06b6d4)' : 'linear-gradient(to right, #0f766e, #14b8a6)' }}
        >
          {T.cta.btn[lang]}
        </button>
      </div>
    </section>
  );
}

/* ───────────────────── Footer ───────────────────── */
function Footer() {
  const { lang } = useLang();
  const { theme } = useTheme();
  const dark = theme === "dark";
  return (
    <footer className={`border-t py-16 ${dark ? 'border-white/5 bg-[#080f1e]' : 'border-gray-200 bg-gray-50'}`}>
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-10">
          <div>
            <div className="flex flex-col items-start gap-2 mb-4">
              <img src={dark ? "/logo-dark-removebg-preview.png" : "/logo-light.svg"} alt="PrediTeq" className="h-10 w-auto" />
              <div className={`flex items-center gap-2 text-xs italic ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
                <span className="tracking-wide">by</span>
                <img src="/aroteq-logo.png" alt="AroTeq" className="h-7 w-auto" />
              </div>
            </div>
            <p className={`text-sm leading-relaxed ${dark ? 'text-gray-500' : 'text-gray-500'}`}>
              {T.footer.desc[lang]}
            </p>
          </div>

          <div>
            <h4 className={`text-xs font-semibold uppercase tracking-[0.2em] mb-4 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{T.footer.quick[lang]}</h4>
            <ul className={`space-y-2 text-sm ${dark ? 'text-gray-500' : 'text-gray-500'}`}>
              <li><a href="#features" className={`transition-colors ${dark ? 'hover:text-white' : 'hover:text-gray-900'}`}>{T.footer.platform[lang]}</a></li>
              <li><a href="#how-it-works" className={`transition-colors ${dark ? 'hover:text-white' : 'hover:text-gray-900'}`}>{T.footer.industries[lang]}</a></li>
              <li><a href="#pricing" className={`transition-colors ${dark ? 'hover:text-white' : 'hover:text-gray-900'}`}>{T.footer.pricingF[lang]}</a></li>
              <li><a href="#metrics" className={`transition-colors ${dark ? 'hover:text-white' : 'hover:text-gray-900'}`}>{T.footer.contact[lang]}</a></li>
            </ul>
          </div>

          <div>
            <h4 className={`text-xs font-semibold uppercase tracking-[0.2em] mb-4 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{T.footer.resources[lang]}</h4>
            <ul className={`space-y-2 text-sm ${dark ? 'text-gray-500' : 'text-gray-500'}`}>
              <li><a href="#how-it-works" className={`transition-colors ${dark ? 'hover:text-white' : 'hover:text-gray-900'}`}>{T.footer.docs[lang]}</a></li>
              <li><a href="#features" className={`transition-colors ${dark ? 'hover:text-white' : 'hover:text-gray-900'}`}>{T.footer.api[lang]}</a></li>
              <li><a href="#metrics" className={`transition-colors ${dark ? 'hover:text-white' : 'hover:text-gray-900'}`}>{T.footer.caseStudies[lang]}</a></li>
            </ul>
          </div>

          <div>
            <h4 className={`text-xs font-semibold uppercase tracking-[0.2em] mb-4 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{lang === 'fr' ? 'Adresse & Contact' : 'Address & Contact'}</h4>
            <ul className={`space-y-3 text-sm ${dark ? 'text-gray-500' : 'text-gray-500'}`}>
              <li className="flex items-start gap-2">
                <MapPin className={`w-4 h-4 mt-0.5 shrink-0 ${dark ? 'text-gray-400' : 'text-gray-500'}`} />
                <span>35 rue de Tozeur<br />Ben Arous, Tunisia</span>
              </li>
              <li className="flex items-center gap-2">
                <Phone className={`w-4 h-4 shrink-0 ${dark ? 'text-gray-400' : 'text-gray-500'}`} />
                <a href="tel:+21631174743" className={`transition-colors ${dark ? 'hover:text-white' : 'hover:text-gray-900'}`}>+216 31 174 743</a>
              </li>
              <li className="flex items-center gap-2">
                <Phone className={`w-4 h-4 shrink-0 ${dark ? 'text-gray-400' : 'text-gray-500'}`} />
                <a href="tel:+21658623439" className={`transition-colors ${dark ? 'hover:text-white' : 'hover:text-gray-900'}`}>+216 58 623 439</a>
              </li>
            </ul>
            <div className="flex items-center gap-2 mt-4">
              <a
                href="https://www.linkedin.com/company/aroteq/"
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center justify-center w-9 h-9 rounded-lg border transition-all ${dark ? 'border-white/10 text-gray-400 hover:text-white hover:border-teal-500/30 hover:bg-white/5' : 'border-gray-300 text-gray-500 hover:text-teal-700 hover:border-teal-700/30 hover:bg-teal-700/5'}`}
              >
                <Linkedin className="w-4 h-4" />
              </a>
              <a
                href="https://www.youtube.com/@aroteq"
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center justify-center w-9 h-9 rounded-lg border transition-all ${dark ? 'border-white/10 text-gray-400 hover:text-white hover:border-red-500/30 hover:bg-white/5' : 'border-gray-300 text-gray-500 hover:text-red-600 hover:border-red-500/30 hover:bg-red-50'}`}
              >
                <Youtube className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>

        <div className={`mt-12 pt-8 border-t text-center text-xs ${dark ? 'border-white/5 text-gray-600' : 'border-gray-200 text-gray-400'}`}>
          {T.footer.copy[lang]}
        </div>
      </div>
    </footer>
  );
}

/* ───────────────────── Landing Page ───────────────────── */
export function LandingPage() {
  const navigate = useNavigate();
  const [lang, setLang] = useState<Lang>("fr");
  const toggle = () => setLang((l) => (l === "fr" ? "en" : "fr"));
  const [theme, setTheme] = useState<Theme>("dark");
  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));
  const onGetStarted = () => navigate("/signup");
  const onLogin = () => navigate("/login");

  return (
    <ThemeCtx.Provider value={{ theme, toggleTheme }}>
    <LangCtx.Provider value={{ lang, toggle }}>
      <div className={`min-h-screen overflow-x-hidden ${theme === "dark" ? 'bg-[#0a1628] text-white' : 'bg-white text-gray-900'}`}>
        <Navbar onGetStarted={onGetStarted} onLogin={onLogin} />
        <Hero onGetStarted={onGetStarted} />
        <TrustBar />
        <ChallengeSolution />
        <FeaturesGrid />
        <HowItWorks />
        <Metrics />
        <CaseStudiesSection />
        <Pricing />
        <CtaSection onGetStarted={onGetStarted} />
        <Footer />
      </div>
    </LangCtx.Provider>
    </ThemeCtx.Provider>
  );
}
