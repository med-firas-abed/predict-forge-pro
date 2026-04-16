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
  nav: { features: { fr: "Fonctionnalités", en: "Features" }, how: { fr: "Comment ça marche", en: "How it Works" }, metrics: { fr: "Métriques", en: "Metrics" }, pricing: { fr: "Tarifs", en: "Pricing" }, signin: { fr: "Connexion", en: "Sign In" }, getStarted: { fr: "Commencer", en: "Get Started" } },
  hero: {
    badge: { fr: "SaaS Prédictif propulsé par l'IA", en: "AI-Powered Predictive SaaS" },
    h1a: { fr: "Prédisez les pannes", en: "Predict Equipment Failures" },
    h1b: { fr: "Avant qu'elles n'arrivent", en: "Before They Happen" },
    sub: { fr: "PrediTeq équipe vos machines de capteurs intelligents et exploite l'IA propriétaire pour éliminer les arrêts imprévus et prolonger la durée de vie de vos équipements jusqu'à 40 %.", en: "PrediTeq equips your machines with smart sensors and leverages proprietary AI to eliminate unplanned downtime and extend equipment life cycles by up to 40%." },
    cta: { fr: "Essai Gratuit", en: "Start Free Trial" },
    demo: { fr: "Voir la démo", en: "Watch Demo" },
    hi: { fr: "Indice de Santé", en: "Health Index" },
    optimal: { fr: "Optimal", en: "Optimal" },
    rul: { fr: "Prédiction RUL (Durée de Vie Restante)", en: "RUL Prediction (Remaining Useful Life)" },
    days: { fr: "JOURS", en: "DAYS" }, hours: { fr: "HEURES", en: "HOURS" }, mins: { fr: "MIN", en: "MINS" }, secs: { fr: "SEC", en: "SECS" },
  },
  trust: { fr: "Technologie Aroteq", en: "Aroteq Technology" },
  challenge: {
    label: { fr: "Défi & Solution", en: "Challenge & Solution" },
    title: { fr: "Le problème de maintenance\nindustrielle résolu.", en: "The industrial maintenance\nproblem solved." },
    challengeLabel: { fr: "Défi :", en: "Challenge:" },
    challengeText: { fr: "Prédire les pannes en temps réel sur plusieurs sites industriels, que ce soit sur les machines que nous fabriquons ou sur celles déjà en service chez nos clients, équipées de nos capteurs IoT.", en: "Predict equipment failures in real-time across multiple industrial sites — whether on machines we manufacture or on existing client equipment retrofitted with our IoT sensors." },
    solutionLabel: { fr: "Solution :", en: "Solution:" },
    solutionText: { fr: "Une plateforme SaaS prédictive multi-capteurs combinant la détection d'anomalies par ", en: "An AI-powered predictive SaaS platform combining " },
    solutionIF: { fr: "Isolation Forest", en: "Isolation Forest" },
    solutionHI: { fr: "Indice de Santé", en: "Health Index" },
    solutionRUL: { fr: "Prédiction RUL par Random Forest", en: "Random Forest RUL" },
    solutionValidated: { fr: "— validé sur le benchmark NASA C-MAPSS", en: "— validated on NASA C-MAPSS benchmark" },
    benefitsLabel: { fr: "Avantages :", en: "Benefits:" },
    benefits: {
      fr: ["Réduction des arrêts imprévus jusqu'à 40 %", "Indice de Santé en temps réel (0–100 %) par machine", "Prédictions RUL avec intervalles de confiance", "Rapports de maintenance générés par IA", "Surveillance multi-site depuis un seul tableau de bord"],
      en: ["Reduced unplanned downtime by up to 40%", "Real-time Health Index (0–100%) for every machine", "RUL predictions with confidence intervals", "Automated AI-generated maintenance reports", "Multi-site monitoring from a single dashboard"],
    },
  },
  features: {
    label: { fr: "Notre Plateforme", en: "Our Platform" },
    title: { fr: "Intelligence de Grade Industriel", en: "Industrial-Grade Intelligence" },
    sub: { fr: "Des capacités de surveillance avancées conçues pour les écosystèmes industriels complexes.", en: "Deep monitoring capabilities designed for complex industrial ecosystems." },
    items: [
      { title: { fr: "Indice de Santé", en: "Health Index" }, desc: { fr: "Calcul continu de la viabilité des équipements via la télémétrie multi-capteurs installée sur vos machines.", en: "Continuous calculation of asset viability using multi-parameter sensor telemetry installed on your machines." } },
      { title: { fr: "Prédiction RUL", en: "RUL Prediction" }, desc: { fr: "Nos modèles IA prédisent la Durée de Vie Restante avec des estimations précises basées sur les patterns d'usure actuels.", en: "AI models predict Remaining Useful Life with precise failure window estimates based on current wear patterns." } },
      { title: { fr: "Détection d'Anomalies", en: "Anomaly Detection" }, desc: { fr: "Identification instantanée des déviations subtiles dans les signatures thermiques, vibratoires ou acoustiques.", en: "Instant identification of subtle deviations in thermal, vibration, or acoustic signatures using unsupervised learning." } },
      { title: { fr: "Alertes Intelligentes", en: "Smart Alerts" }, desc: { fr: "Notifications contextuelles par Email lorsque les seuils critiques sont approchés. Niveaux URGENCE, SURVEILLANCE, OK.", en: "Context-aware notifications via Email when critical thresholds are approached. URGENCE, SURVEILLANCE, OK levels." } },
      { title: { fr: "Rapports IA", en: "AI Reports" }, desc: { fr: "Synthèses exécutives et analyses de causes racines générées automatiquement chaque semaine ou à la demande via Claude AI.", en: "Automated executive summaries and technical root-cause analyses generated weekly or on-demand using Claude AI." } },
      { title: { fr: "Calendrier & Planification", en: "Calendar & Task Scheduling" }, desc: { fr: "Planifiez et suivez vos tâches de maintenance préventive grâce à un calendrier interactif avec rappels automatiques.", en: "Plan and track your preventive maintenance tasks with an interactive calendar and automatic reminders." } },
    ],
  },
  steps: {
    title: { fr: "La Feuille de Route vers\nZéro Arrêt", en: "The Roadmap to\nZero Downtime" },
    items: [
      { title: { fr: "Installation des Capteurs", en: "Install Sensors" }, desc: { fr: "Nos techniciens installent les capteurs IoT sur vos machines existantes ou les intègrent directement aux équipements que nous fabriquons. Compatibilité OPC-UA et MQTT.", en: "Our technicians install IoT sensors on your existing machines or integrate them directly into the equipment we manufacture. OPC-UA and MQTT compatible." } },
      { title: { fr: "L'IA Analyse", en: "AI Analyzes" }, desc: { fr: "Notre plateforme crée un jumeau numérique de vos équipements, apprenant les comportements nominaux à travers des milliards de points de données.", en: "Our platform creates a digital twin of your equipment, learning nominal behaviors through billions of data points." } },
      { title: { fr: "Prédire les Pannes", en: "Predict Failures" }, desc: { fr: "Recevez des alertes fiables des semaines avant les pannes potentielles, incluant le type de défaillance et sa sévérité estimée.", en: "Receive high-confidence alerts weeks before potential failures, including failure type and estimated severity." } },
      { title: { fr: "Agir en Avance", en: "Act Early" }, desc: { fr: "Alertes intelligentes, rapports IA automatisés et planification de maintenance avant que les pannes ne surviennent.", en: "Smart alerts, automated AI reports, and maintenance scheduling before failures occur. Zero unplanned downtime is the target." } },
    ],
  },
  stats: {
    accuracy: { fr: "Précision du Modèle", en: "Model Accuracy" },
    latency: { fr: "Latence RMSE", en: "RMSE Latency" },
    uptime: { fr: "Disponibilité Plateforme", en: "Platform Uptime" },
    roi: { fr: "ROI Moyen", en: "Average ROI" },
  },
  cases: {
    title: { fr: "Nos études de cas IA", en: "All our AI case studies" },
    items: [
      { tag: { fr: "FABRICATION", en: "MANUFACTURING" }, title: { fr: "Maintenance Prédictive d'Ascenseurs — Usine Ben Arous", en: "Elevator Predictive Maintenance — Ben Arous Factory" } },
      { tag: { fr: "PLANIFICATION", en: "PLANNING" }, title: { fr: "Calendrier de Maintenance — Planification Intelligente", en: "Maintenance Calendar — Smart Scheduling" } },
      { tag: { fr: "RAPPORTS IA", en: "AI REPORTS" }, title: { fr: "Rapports de Maintenance par IA — Analyses Automatisées", en: "AI-Powered Maintenance Reports — Automated Insights" } },
    ],
  },
  pricing: {
    label: { fr: "Tarifs", en: "Pricing" },
    title: { fr: "Offres Adaptées à Votre Industrie", en: "Scalable Intelligence Tiers" },
    sub: { fr: "Choisissez l'offre adaptée à votre parc machines. Capteurs IoT inclus dans chaque formule.", en: "Choose the plan that fits your industrial footprint. IoT sensors included in every plan." },
    mo: { fr: "/mois", en: "/mo" },
    plans: [
      { name: { fr: "Essentiel", en: "Starter" }, price: "990 DT", sub: { fr: "Jusqu'à 5 machines", en: "Up to 5 machines" }, features: { fr: ["Kit capteurs IoT (température, vibration)", "Indice de Santé en temps réel", "Prédiction RUL basique", "Alertes par email", "Tableau de bord 1 site"], en: ["IoT sensor kit (temperature, vibration)", "Real-time Health Index", "Basic RUL prediction", "Email alerts", "1-site dashboard"] }, popular: false },
      { name: { fr: "Professionnel", en: "Professional" }, price: "2 490 DT", sub: { fr: "Jusqu'à 20 machines", en: "Up to 20 machines" }, features: { fr: ["Kit capteurs avancé (6 paramètres)", "Indice de Santé avancé", "RUL + intervalles de confiance", "Alertes multi-niveaux intelligentes", "Tableau de bord multi-site", "Rapports IA hebdomadaires (Claude)"], en: ["Advanced sensor kit (6 parameters)", "Advanced Health Index", "Full RUL + confidence intervals", "Smart multi-level alerts", "Multi-site dashboard", "Weekly AI reports (Claude)"] }, popular: true },
      { name: { fr: "Entreprise", en: "Enterprise" }, price: { fr: "Sur devis", en: "Custom" }, sub: { fr: "Machines illimitées", en: "Unlimited machines" }, features: { fr: ["Tout l'offre Professionnel", "Capteurs sur-mesure pour vos lignes", "Entraînement de modèle IA personnalisé", "Déploiement on-premise possible", "Dashboard en marque blanche", "Rapports IA en temps réel"], en: ["Everything in Professional", "Custom sensors for your production lines", "Custom AI model training", "On-premise deployment option", "White-label dashboard", "Real-time AI reports"] }, popular: false },
    ],
  },
  cta: {
    h2a: { fr: "Prêt à éliminer", en: "Ready to eliminate" },
    h2b: { fr: "les arrêts imprévus ?", en: "unplanned downtime?" },
    sub: { fr: "Rejoignez les industriels qui utilisent PrediTeq pour prédire les pannes. Nos capteurs s'installent sur vos machines existantes. Essai gratuit — sans engagement.", en: "Join industrial operators using PrediTeq to predict failures before they happen. Our sensors install on your existing machines. Start your free trial — no commitment required." },
    btn: { fr: "Commencer Maintenant", en: "Get Started Now" },
  },
  footer: {
    desc: { fr: "Maintenance prédictive par IA pour la prochaine génération d'opérations industrielles.", en: "AI-powered predictive maintenance for the next generation of industrial operations." },
    quick: { fr: "Accès Rapide", en: "Quick Access" },
    platform: { fr: "Plateforme", en: "Platform" },
    industries: { fr: "Industries", en: "Industries" },
    pricingF: { fr: "Tarifs", en: "Pricing" },
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
          <img src="/logo-dark-removebg-preview.png" alt="PrediTeq" className="h-10 w-auto" />
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
            className={`px-5 py-2 rounded-lg bg-gradient-to-r text-white text-sm font-semibold transition-all shadow-lg ${dark ? 'from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 shadow-teal-500/20' : 'from-teal-700 to-teal-500 hover:from-teal-600 hover:to-teal-400 shadow-teal-700/15'}`}
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
            onClick={onGetStarted}
            className={`w-full mt-2 px-5 py-2.5 rounded-lg bg-gradient-to-r text-white text-sm font-semibold ${dark ? 'from-teal-500 to-cyan-500' : 'from-teal-700 to-teal-500'}`}
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
      <div className={`absolute inset-0 ${dark ? 'bg-gradient-to-b from-[#0a1628] via-[#0e1f38] to-[#0a1628]' : 'bg-gradient-to-b from-gray-50 via-white to-gray-50'}`} />
      <div className={`absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full blur-[120px] ${dark ? 'bg-teal-500/8' : 'bg-teal-700/8'}`} />

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
          <span className={`bg-gradient-to-r bg-clip-text text-transparent ${dark ? 'from-teal-400 to-cyan-400' : 'from-teal-700 to-teal-500'}`}>
            {T.hero.h1b[lang]}
          </span>
        </h1>

        <p className={`mt-6 text-lg max-w-2xl mx-auto leading-relaxed ${dark ? 'text-gray-300' : 'text-gray-600'}`}>
          {T.hero.sub[lang]}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
          <button
            onClick={onGetStarted}
            className={`group px-8 py-3.5 rounded-xl bg-gradient-to-r text-white font-semibold text-base transition-all shadow-xl flex items-center gap-2 ${dark ? 'from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 shadow-teal-500/25' : 'from-teal-700 to-teal-500 hover:from-teal-600 hover:to-teal-400 shadow-teal-700/20'}`}
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
          {/* Health Index Card */}
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
              {" "}{T.challenge.solutionValidated[lang]} <span className={`font-semibold ${dark ? 'text-teal-400' : 'text-teal-700'}`}>(R²=0.89)</span>.
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
            <div className={`w-full max-w-md rounded-2xl border overflow-hidden ${dark ? 'border-white/10' : 'border-gray-200'}`}>
              <img src="/photo_machine_aroteq.png" alt="AroTeq Industrial Machine" className="w-full h-auto object-cover rounded-2xl" />
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

function Metrics() {
  const { lang } = useLang();
  const { theme } = useTheme();
  const dark = theme === "dark";
  const STATS: { value: string; label: string; orange?: boolean; animate?: { from: number; to: number; suffix: string; duration: number } }[] = [
    { value: "94%", label: T.stats.accuracy[lang], animate: { from: 0, to: 94, suffix: "%", duration: 2400 } },
    { value: "<2h", label: T.stats.latency[lang], orange: true },
    { value: "99.9%", label: T.stats.uptime[lang] },
    { value: "3×", label: T.stats.roi[lang], animate: { from: 1, to: 3, suffix: "×", duration: 4000 }, orange: true },
  ];
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold: 0.3 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <section id="metrics" className={`py-20 ${dark ? 'bg-gradient-to-b from-[#0c1a30] to-[#0a1628]' : 'bg-gray-50'}`}>
      <div ref={ref} className="max-w-6xl mx-auto px-6">
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
  return (
    <section className={`py-24 ${dark ? 'bg-[#0a1628]' : 'bg-white'}`}>
      <div className="max-w-6xl mx-auto px-6">
        <h2 className={`text-4xl sm:text-5xl font-extrabold mb-16 text-center ${dark ? 'text-white' : 'text-gray-900'}`}>
          {T.cases.title[lang]}
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {T.cases.items.map((c) => (
            <div
              key={c.title.en}
              className={`group relative rounded-2xl border transition-all overflow-hidden h-64 flex flex-col justify-end p-6 ${dark ? 'border-white/5 bg-gradient-to-br from-teal-900/10 to-cyan-900/5 hover:border-teal-500/20' : 'border-gray-200 bg-gradient-to-br from-teal-50 to-teal-100/30 hover:border-teal-700/40 hover:shadow-lg'}`}
            >
              <div className={`absolute inset-0 ${dark ? 'bg-gradient-to-t from-[#0a1628]/90 via-transparent to-transparent' : 'bg-gradient-to-t from-white/80 via-transparent to-transparent'}`} />
              <div className="relative z-10">
                <span className={`inline-block px-2.5 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider mb-3 ${dark ? 'bg-teal-500/15 text-teal-400' : 'bg-teal-700/10 text-teal-700'}`}>
                  {c.tag[lang]}
                </span>
                <h3 className={`text-lg font-bold leading-snug ${dark ? 'text-white' : 'text-gray-900'}`}>{c.title[lang]}</h3>
              </div>
            </div>
          ))}
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
          <span className={`bg-gradient-to-r bg-clip-text text-transparent ${dark ? 'from-teal-400 to-cyan-400' : 'from-teal-700 to-teal-500'}`}>
            {T.cta.h2b[lang]}
          </span>
        </h2>
        <p className={`mb-10 ${dark ? 'text-gray-300' : 'text-gray-600'}`}>
          {T.cta.sub[lang]}
        </p>
        <button
          onClick={onGetStarted}
          className={`px-10 py-4 rounded-xl bg-gradient-to-r text-white font-semibold text-lg transition-all shadow-xl ${dark ? 'from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 shadow-teal-500/25' : 'from-teal-700 to-teal-500 hover:from-teal-600 hover:to-teal-400 shadow-teal-700/20'}`}
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
              <img src="/logo-dark-removebg-preview.png" alt="PrediTeq" className="h-10 w-auto" />
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
