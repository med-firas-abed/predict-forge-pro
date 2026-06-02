import { createContext, useContext, useState, useEffect, ReactNode } from "react";

import { API_BASE } from "@/lib/api";
import { type UiLang, normalizeUiLang } from "@/lib/i18n";
import { repairText } from "@/lib/repairText";

export type Lang = UiLang;
export type Theme = "dark" | "light";

export interface AlertThresholds {
  hiCrit: number;
  hiSurv: number;
}

interface AppContextType {
  lang: Lang;
  setLang: (l: Lang) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  t: (key: string) => string;
  alertEmails: { manager: string; technician: string };
  setAlertEmails: (e: { manager: string; technician: string }) => void;
  thresholds: AlertThresholds;
}

const AppContext = createContext<AppContextType | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be inside AppProvider");
  return ctx;
}

function safeStorageGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures so the app can still render.
  }
}

type TranslationEntry = {
  fr: string;
  en: string;
  ar?: string;
};

const TR: Record<string, TranslationEntry> = {
  // Nav
  "nav.dashboard": { fr: "Tableau de bord", en: "Dashboard", ar: "Ù„ÙˆØ­Ø© Ø§Ù„Ù‚ÙŠØ§Ø¯Ø©" },
  "nav.logout": { fr: "DÃ©connexion", en: "Sign Out", ar: "ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø®Ø±ÙˆØ¬" },
  "nav.machines": { fr: "Gestion des machines", en: "Machine Management", ar: "Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ø¢Ù„Ø§Øª" },
  "nav.maintenance": { fr: "Calendrier de maintenance", en: "Maintenance Calendar", ar: "ØªÙ‚ÙˆÙŠÙ… Ø§Ù„ØµÙŠØ§Ù†Ø©" },
  "nav.calendar": { fr: "Calendrier", en: "Calendar", ar: "Ø§Ù„ØªÙ‚ÙˆÙŠÙ…" },
  "nav.costs": { fr: "CoÃ»ts & Budget", en: "Costs & Budget", ar: "Ø§Ù„ØªÙƒØ§Ù„ÙŠÙ ÙˆØ§Ù„Ù…ÙŠØ²Ø§Ù†ÙŠØ©" },
  "nav.alerts": { fr: "Centre d'alertes", en: "Alert Center", ar: "Ù…Ø±ÙƒØ² Ø§Ù„ØªÙ†Ø¨ÙŠÙ‡Ø§Øª" },
  "nav.geo": { fr: "GÃ©olocalisation", en: "Geolocation", ar: "Ø§Ù„Ù…ÙˆÙ‚Ø¹ Ø§Ù„Ø¬ØºØ±Ø§ÙÙŠ" },
  "nav.admin": { fr: "Administration", en: "Administration", ar: "Ø§Ù„Ø¥Ø¯Ø§Ø±Ø©" },
  "nav.ia": { fr: "Analyse & rapports", en: "Analysis & reports", ar: "ØªØ­Ù„ÙŠÙ„ ÙˆØªÙ‚Ø§Ø±ÙŠØ±" },
  "nav.rapportIA": { fr: "Rapports", en: "Reports", ar: "ØªÙ‚Ø§Ø±ÙŠØ±" },
  "nav.planner": { fr: "Plan d'action", en: "Action plan", ar: "Ø®Ø·Ø© Ø§Ù„Ø¹Ù…Ù„" },
  "nav.diagnostics": { fr: "Diagnostic détaillé", en: "Detailed diagnostics", ar: "Ø§Ù„ØªØ´Ø®ÙŠØµ Ø§Ù„Ù…ÙØµÙ„" },
  "nav.seuils": { fr: "Seuils d'alertes", en: "Alert Thresholds", ar: "Ø¹ØªØ¨Ø§Øª Ø§Ù„ØªÙ†Ø¨ÙŠÙ‡" },
  "nav.simulator": { fr: "Simulateur", en: "Simulator", ar: "Ø§Ù„Ù…Ø­Ø§ÙƒÙŠ" },
  "nav.experiment": { fr: "ExpÃ©rience ESP32", en: "ESP32 Experiment", ar: "ØªØ¬Ø±Ø¨Ø© ESP32" },
  "nav.navigation": { fr: "Navigation", en: "Navigation", ar: "Ø§Ù„ØªÙ†Ù‚Ù„" },
  "nav.system": { fr: "SystÃ¨me", en: "System", ar: "Ø§Ù„Ù†Ø¸Ø§Ù…" },
  "nav.adminUsers": { fr: "Gestion des comptes", en: "Account Management", ar: "Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ø­Ø³Ø§Ø¨Ø§Øª" },
  "meta.adminusers.title": { fr: "Gestion des comptes", en: "Account Management", ar: "Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ø­Ø³Ø§Ø¨Ø§Øª" },
  "meta.adminusers.sub": { fr: "Approbation et gestion des utilisateurs", en: "User approval and management", ar: "Ø§Ù„Ù…ÙˆØ§ÙÙ‚Ø© Ø¹Ù„Ù‰ Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù…ÙŠÙ† ÙˆØ¥Ø¯Ø§Ø±ØªÙ‡Ù…" },
  "meta.simulator.title": { fr: "Simulateur", en: "Simulator", ar: "Ø§Ù„Ù…Ø­Ø§ÙƒÙŠ" },
  "meta.simulator.sub": { fr: "Suivre les indicateurs machine en temps reel avec le simulateur", en: "Follow machine indicators in real time with the simulator", ar: "Ù…ØªØ§Ø¨Ø¹Ø© Ù…Ø¤Ø´Ø±Ø§Øª Ø§Ù„Ø¢Ù„Ø§Øª ÙÙŠ Ø§Ù„ÙˆÙ‚Øª Ø§Ù„ÙØ¹Ù„ÙŠ Ø¹Ø¨Ø± Ø§Ù„Ù…Ø­Ø§ÙƒÙŠ" },
  "meta.experiment.title": { fr: "ExpÃ©rience ESP32", en: "ESP32 Experiment", ar: "ØªØ¬Ø±Ø¨Ø© ESP32" },
  "meta.experiment.sub": { fr: "", en: "", ar: "" },

  // Dashboard
  "dash.activeMachines": { fr: "Machines actives", en: "Active Machines", ar: "Ø§Ù„Ø¢Ù„Ø§Øª Ø§Ù„Ù†Ø´Ø·Ø©" },
  "dash.fullFleet": { fr: "Parc complet opÃ©rationnel", en: "Full fleet operational", ar: "Ø§Ù„Ø£Ø³Ø·ÙˆÙ„ Ø§Ù„ÙƒØ§Ù…Ù„ ÙŠØ¹Ù…Ù„" },
  "dash.avgHI": { fr: "Indice de santÃ© moyen (HI)", en: "Average machine health (HI)", ar: "Ù…ØªÙˆØ³Ø· Ù…Ø¤Ø´Ø± Ø§Ù„ØµØ­Ø©" },
  "dash.trendDown": { fr: "Tendance dÃ©croissante", en: "Decreasing trend", ar: "Ø§ØªØ¬Ø§Ù‡ ØªÙ†Ø§Ø²Ù„ÙŠ" },
  "dash.minRUL": { fr: "RUL minimum", en: "Minimum RUL", ar: "Ø§Ù„Ø­Ø¯ Ø§Ù„Ø£Ø¯Ù†Ù‰ Ù„Ù„Ø¹Ù…Ø± Ø§Ù„Ù…ØªØ¨Ù‚ÙŠ" },
  "dash.critical": { fr: "critique", en: "critical", ar: "Ø­Ø±Ø¬" },
  "dash.activeAlerts": { fr: "Alertes actives", en: "Active Alerts", ar: "Ø§Ù„ØªÙ†Ø¨ÙŠÙ‡Ø§Øª Ø§Ù„Ù†Ø´Ø·Ø©" },
  "dash.interventionReq": { fr: "Intervention requise", en: "Intervention required", ar: "ØªØ¯Ø®Ù„ Ù…Ø·Ù„ÙˆØ¨" },
  "dash.criticals": { fr: "critiques", en: "critical", ar: "Ø­Ø±Ø¬Ø©" },
  "dash.recentAlerts": { fr: "Alertes rÃ©centes", en: "Recent Alerts", ar: "Ø§Ù„ØªÙ†Ø¨ÙŠÙ‡Ø§Øª Ø§Ù„Ø£Ø®ÙŠØ±Ø©" },
  "dash.unread": { fr: "non lues", en: "unread", ar: "ØºÙŠØ± Ù…Ù‚Ø±ÙˆØ¡Ø©" },
  "dash.hiEvolution": { fr: "Ã‰volution de l'indice de santÃ©", en: "Machine health evolution", ar: "ØªØ·ÙˆØ± Ù…Ø¤Ø´Ø± Ø§Ù„ØµØ­Ø©" },
  "dash.last90": { fr: "90 derniers jours", en: "Last 90 days", ar: "Ø¢Ø®Ø± 90 ÙŠÙˆÙ…Ù‹Ø§" },
  "dash.decreasingTrend": { fr: "â†˜ Tendance dÃ©croissante", en: "â†˜ Decreasing trend", ar: "â†™ Ø§ØªØ¬Ø§Ù‡ ØªÙ†Ø§Ø²Ù„ÙŠ" },
  "dash.increasingTrend": { fr: "â†— Tendance haussiÃ¨re", en: "â†— Increasing trend", ar: "â†— Ø§ØªØ¬Ø§Ù‡ ØªØµØ§Ø¹Ø¯ÙŠ" },
  "dash.stableTrend": { fr: "â†’ Stable", en: "â†’ Stable", ar: "â†’ Ù…Ø³ØªÙ‚Ø±" },
  "dash.totalMachines": { fr: "Total machines", en: "Total Machines", ar: "Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø¢Ù„Ø§Øª" },
  "dash.operational": { fr: "OpÃ©rationnel", en: "Operational", ar: "ØªØ´ØºÙŠÙ„ÙŠ" },
  "dash.surveillance": { fr: "Surveillance", en: "Monitoring", ar: "Ù…Ø±Ø§Ù‚Ø¨Ø©" },
  "dash.criticalPct": { fr: "Critique", en: "Critical", ar: "Ø­Ø±Ø¬" },
  "dash.fleetHealth": { fr: "SantÃ© globale de la flotte", en: "Fleet Health Overview", ar: "Ù†Ø¸Ø±Ø© Ø¹Ø§Ù…Ø© Ø¹Ù„Ù‰ ØµØ­Ø© Ø§Ù„Ø£Ø³Ø·ÙˆÙ„" },
  "dash.fleetAvgHI": { fr: "HI moyen flotte", en: "Fleet avg. HI", ar: "Ù…ØªÙˆØ³Ø· HI Ù„Ù„Ø£Ø³Ø·ÙˆÙ„" },
  "dash.avgRUL": { fr: "RUL moyen", en: "Avg. RUL", ar: "Ù…ØªÙˆØ³Ø· Ø§Ù„Ø¹Ù…Ø± Ø§Ù„Ù…ØªØ¨Ù‚ÙŠ" },
  "dash.days": { fr: "jours", en: "days", ar: "Ø£ÙŠØ§Ù…" },
  "dash.selectMachine": { fr: "SÃ©lectionner une machine", en: "Select a machine", ar: "Ø§Ø®ØªØ± Ø¢Ù„Ø©" },
  "dash.machineBanner": { fr: "Fiche machine", en: "Machine Overview", ar: "Ø¨Ø·Ø§Ù‚Ø© Ø§Ù„Ø¢Ù„Ø©" },
  "dash.lastUpdate": { fr: "DerniÃ¨re MAJ", en: "Last Update", ar: "Ø¢Ø®Ø± ØªØ­Ø¯ÙŠØ«" },
  "dash.cyclesToday": { fr: "Cycles aujourd'hui", en: "Cycles Today", ar: "Ø¯ÙˆØ±Ø§Øª Ø§Ù„ÙŠÙˆÙ…" },
  "dash.anomalies24h": { fr: "Anomalies 24h", en: "Anomalies 24h", ar: "Ø§Ù„Ø´Ø°ÙˆØ°Ø§Øª 24 Ø³Ø§Ø¹Ø©" },
  "dash.sensorCharts": { fr: "Capteurs â€” 6 derniÃ¨res heures", en: "Sensors â€” Last 6 Hours", ar: "Ø§Ù„Ù…Ø³ØªØ´Ø¹Ø±Ø§Øª â€” Ø¢Ø®Ø± 6 Ø³Ø§Ø¹Ø§Øª" },
  "dash.hiTrend7d": { fr: "Tendance HI â€” 7 derniers jours", en: "HI Trend â€” Last 7 Days", ar: "Ø§ØªØ¬Ø§Ù‡ HI â€” Ø¢Ø®Ø± 7 Ø£ÙŠØ§Ù…" },
  "dash.loadingSensors": { fr: "Chargement des capteursâ€¦", en: "Loading sensorsâ€¦", ar: "Ø¬Ø§Ø±ÙŠ ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ù…Ø³ØªØ´Ø¹Ø±Ø§Øªâ€¦" },
  "dash.awaitingSensors": { fr: "En attente de donnÃ©es capteurs â€” actualisez ou patientez quelques secondes", en: "Awaiting sensor data â€” refresh or wait a few seconds", ar: "ÙÙŠ Ø§Ù†ØªØ¸Ø§Ø± Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…Ø³ØªØ´Ø¹Ø±Ø§Øª â€” Ø­Ø¯Ù‘Ø« Ø£Ùˆ Ø§Ù†ØªØ¸Ø± Ø¨Ø¶Ø¹ Ø«ÙˆØ§Ù†Ù" },
  "dash.noData": { fr: "Aucune donnÃ©e disponible", en: "No data available", ar: "Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¨ÙŠØ§Ù†Ø§Øª Ù…ØªØ§Ø­Ø©" },

  // Geo
  "geo.title": { fr: "DÃ©ploiement Tunisie â€” 2026", en: "Tunisia Deployment â€” 2026", ar: "Ù†Ø´Ø± ØªÙˆÙ†Ø³ â€” 2026" },
  "geo.sites": { fr: "sites", en: "sites", ar: "Ù…ÙˆØ§Ù‚Ø¹" },
  "geo.clickMarker": { fr: "Cliquez sur un marqueur pour les dÃ©tails", en: "Click a marker for details", ar: "Ø§Ù†Ù‚Ø± Ø¹Ù„Ù‰ Ø¹Ù„Ø§Ù…Ø© Ù„Ù„ØªÙØ§ØµÙŠÙ„" },

  // Machines
  "mach.fleet": { fr: "Parc de stockeurs verticaux rotatifs", en: "Vertical Storage Carousel Fleet", ar: "Ø£Ø³Ø·ÙˆÙ„ Ø£Ù†Ø¸Ù…Ø© Ø§Ù„ØªØ®Ø²ÙŠÙ† Ø§Ù„Ø¹Ù…ÙˆØ¯ÙŠØ© Ø§Ù„Ø¯ÙˆØ§Ø±Ø©" },
  "mach.export": { fr: "Exporter", en: "Export", ar: "ØªØµØ¯ÙŠØ±" },
  "mach.addMachine": { fr: "Ajouter machine", en: "Add Machine", ar: "Ø¥Ø¶Ø§ÙØ© Ø¢Ù„Ø©" },
  "mach.management": { fr: "Gestion des machines (CRUD)", en: "Machine Management (CRUD)", ar: "Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ø¢Ù„Ø§Øª (CRUD)" },
  "mach.edit": { fr: "Modifier", en: "Edit", ar: "ØªØ¹Ø¯ÙŠÙ„" },
  "mach.delete": { fr: "Supprimer", en: "Delete", ar: "Ø­Ø°Ù" },
  "mach.confirmDelete": { fr: "Confirmer la suppression ?", en: "Confirm deletion?", ar: "ØªØ£ÙƒÙŠØ¯ Ø§Ù„Ø­Ø°ÙØŸ" },
  "mach.confirmDeleteMsg": { fr: "Cette action est irrÃ©versible. Supprimer", en: "This action is irreversible. Delete", ar: "Ù‡Ø°Ø§ Ø§Ù„Ø¥Ø¬Ø±Ø§Ø¡ Ù„Ø§ Ø±Ø¬Ø¹Ø© ÙÙŠÙ‡. Ø­Ø°Ù" },
  "mach.yes": { fr: "Oui, supprimer", en: "Yes, delete", ar: "Ù†Ø¹Ù…ØŒ Ø­Ø°Ù" },
  "mach.no": { fr: "Annuler", en: "Cancel", ar: "Ø¥Ù„ØºØ§Ø¡" },
  "mach.machineInfo": { fr: "Informations machine", en: "Machine Info", ar: "Ù…Ø¹Ù„ÙˆÙ…Ø§Øª Ø§Ù„Ø¢Ù„Ø©" },
  "mach.gpsLocation": { fr: "Localisation GPS", en: "GPS Location", ar: "Ù…ÙˆÙ‚Ø¹ GPS" },
  "mach.sensorData": { fr: "DonnÃ©es capteurs", en: "Sensor Data", ar: "Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…Ø³ØªØ´Ø¹Ø±Ø§Øª" },
  "mach.save": { fr: "Enregistrer", en: "Save", ar: "Ø­ÙØ¸" },
  "mach.cancel": { fr: "Annuler", en: "Cancel", ar: "Ø¥Ù„ØºØ§Ø¡" },
  "mach.id": { fr: "ID Machine", en: "Machine ID", ar: "Ù…Ø¹Ø±Ù Ø§Ù„Ø¢Ù„Ø©" },
  "mach.client": { fr: "Client / Nom", en: "Client / Name", ar: "Ø§Ù„Ø¹Ù…ÙŠÙ„ / Ø§Ù„Ø§Ø³Ù…" },
  "mach.city": { fr: "Ville", en: "City", ar: "Ø§Ù„Ù…Ø¯ÙŠÙ†Ø©" },
  "mach.model": { fr: "ModÃ¨le moteur", en: "Motor Model", ar: "Ù…ÙˆØ¯ÙŠÙ„ Ø§Ù„Ù…Ø­Ø±Ùƒ" },
  "mach.floors": { fr: "Niveaux", en: "Levels", ar: "Ø§Ù„Ù…Ø³ØªÙˆÙŠØ§Øª" },
  "mach.status": { fr: "Statut", en: "Status", ar: "Ø§Ù„Ø­Ø§Ù„Ø©" },
  "mach.latitude": { fr: "Latitude", en: "Latitude", ar: "Ø®Ø· Ø§Ù„Ø¹Ø±Ø¶" },
  "mach.longitude": { fr: "Longitude", en: "Longitude", ar: "Ø®Ø· Ø§Ù„Ø·ÙˆÙ„" },
  "mach.gpsTip": { fr: "Astuce : clic droit sur Google Maps, copier les coordonnÃ©es", en: "Tip: right-click on Google Maps, copy coordinates", ar: "Ù†ØµÙŠØ­Ø©: Ø§Ù†Ù‚Ø± Ø¨Ø²Ø± Ø§Ù„Ù…Ø§ÙˆØ³ Ø§Ù„Ø£ÙŠÙ…Ù† Ø¹Ù„Ù‰ Ø®Ø±Ø§Ø¦Ø· Ø¬ÙˆØ¬Ù„ØŒ Ø§Ù†Ø³Ø® Ø§Ù„Ø¥Ø­Ø¯Ø§Ø«ÙŠØ§Øª" },
  "mach.gpsTipClean": { fr: "Astuce : clic droit sur Google Maps, copier les coordonnÃ©es", en: "Tip: right-click on Google Maps, copy coordinates", ar: "Ù†ØµÙŠØ­Ø©: Ø§Ù†Ù‚Ø± Ø¨Ø²Ø± Ø§Ù„Ù…Ø§ÙˆØ³ Ø§Ù„Ø£ÙŠÙ…Ù† Ø¹Ù„Ù‰ Ø®Ø±Ø§Ø¦Ø· Ø¬ÙˆØ¬Ù„ØŒ Ø§Ù†Ø³Ø® Ø§Ù„Ø¥Ø­Ø¯Ø§Ø«ÙŠØ§Øª" },
  "mach.hi": { fr: "Indice de santÃ© (0â€“1)", en: "Machine health (0â€“1)", ar: "Ù…Ø¤Ø´Ø± Ø§Ù„ØµØ­Ø© (0â€“1)" },
  "mach.rul": { fr: "RUL (jours)", en: "RUL (days)", ar: "Ø§Ù„Ø¹Ù…Ø± Ø§Ù„Ù…ØªØ¨Ù‚ÙŠ (Ø£ÙŠØ§Ù…)" },
  "mach.rulci": { fr: "Intervalle de confiance (Â±jours)", en: "Confidence Interval (Â±days)", ar: "ÙØ§ØµÙ„ Ø§Ù„Ø«Ù‚Ø© (Â± Ø£ÙŠØ§Ù…)" },
  "mach.vibration": { fr: "Vibration (mm/s)", en: "Vibration (mm/s)", ar: "Ø§Ù„Ø§Ù‡ØªØ²Ø§Ø² (Ù…Ù…/Ø«)" },
  "mach.current": { fr: "Courant (A)", en: "Current (A)", ar: "Ø§Ù„ØªÙŠØ§Ø± (Ø£Ù…Ø¨ÙŠØ±)" },
  "mach.temperature": { fr: "TempÃ©rature (Â°C)", en: "Temperature (Â°C)", ar: "Ø§Ù„Ø­Ø±Ø§Ø±Ø© (Â°Ù…)" },
  "mach.idRequired": { fr: "L'ID est requis", en: "ID is required", ar: "Ø§Ù„Ù…Ø¹Ø±Ù Ù…Ø·Ù„ÙˆØ¨" },
  "mach.idExists": { fr: "Cet ID existe dÃ©jÃ ", en: "This ID already exists", ar: "Ù‡Ø°Ø§ Ø§Ù„Ù…Ø¹Ø±Ù Ù…ÙˆØ¬ÙˆØ¯ Ø¨Ø§Ù„ÙØ¹Ù„" },
  "mach.location": { fr: "Emplacement", en: "Location", ar: "Ø§Ù„Ù…ÙˆÙ‚Ø¹" },

  // Maintenance
  "maint.tasks": { fr: "TÃ¢ches de maintenance", en: "Maintenance Tasks", ar: "Ù…Ù‡Ø§Ù… Ø§Ù„ØµÙŠØ§Ù†Ø©" },
  "maint.newTask": { fr: "Nouvelle tÃ¢che", en: "New Task", ar: "Ù…Ù‡Ù…Ø© Ø¬Ø¯ÙŠØ¯Ø©" },
  "maint.planned": { fr: "PlanifiÃ©e", en: "Planned", ar: "Ù…Ø®Ø·Ø·Ø©" },
  "maint.inProgress": { fr: "En cours", en: "In Progress", ar: "Ù‚ÙŠØ¯ Ø§Ù„ØªÙ†ÙÙŠØ°" },
  "maint.completed": { fr: "TerminÃ©e", en: "Completed", ar: "Ù…ÙƒØªÙ…Ù„Ø©" },
  "maint.progression": { fr: "Progression", en: "Progress", ar: "Ø§Ù„ØªÙ‚Ø¯Ù…" },

  // Calendar
  "cal.planning": { fr: "Planification maintenance", en: "Maintenance Planning", ar: "ØªØ®Ø·ÙŠØ· Ø§Ù„ØµÙŠØ§Ù†Ø©" },
  "cal.schedule": { fr: "Planifier", en: "Schedule", ar: "Ø¬Ø¯ÙˆÙ„Ø©" },
  "cal.updated": { fr: "TÃ¢che mise Ã  jour", en: "Task updated", ar: "ØªÙ… ØªØ­Ø¯ÙŠØ« Ø§Ù„Ù…Ù‡Ù…Ø©" },
  "cal.mon": { fr: "Lun", en: "Mon", ar: "Ø§Ø«Ù†" },
  "cal.tue": { fr: "Mar", en: "Tue", ar: "Ø«Ù„Ø§" },
  "cal.wed": { fr: "Mer", en: "Wed", ar: "Ø£Ø±Ø¨" },
  "cal.thu": { fr: "Jeu", en: "Thu", ar: "Ø®Ù…ÙŠ" },
  "cal.fri": { fr: "Ven", en: "Fri", ar: "Ø¬Ù…Ø¹" },
  "cal.sat": { fr: "Sam", en: "Sat", ar: "Ø³Ø¨Øª" },
  "cal.sun": { fr: "Dim", en: "Sun", ar: "Ø£Ø­Ø¯" },

  // Costs
  "costs.title": { fr: "CoÃ»ts & Budget maintenance", en: "Maintenance Costs & Budget", ar: "ØªÙƒØ§Ù„ÙŠÙ ÙˆÙ…ÙŠØ²Ø§Ù†ÙŠØ© Ø§Ù„ØµÙŠØ§Ù†Ø©" },
  "costs.exportCSV": { fr: "Exporter CSV", en: "Export CSV", ar: "ØªØµØ¯ÙŠØ± CSV" },
  "costs.report": { fr: "Rapport", en: "Report", ar: "ØªÙ‚Ø±ÙŠØ±" },
  "costs.totalBudget": { fr: "Budget total", en: "Total Budget", ar: "Ø§Ù„Ù…ÙŠØ²Ø§Ù†ÙŠØ© Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠØ©" },
  "costs.labor": { fr: "Main d'Å“uvre", en: "Labor", ar: "Ø§Ù„Ø¹Ù…Ø§Ù„Ø©" },
  "costs.parts": { fr: "PiÃ¨ces", en: "Parts", ar: "Ø§Ù„Ù‚Ø·Ø¹" },
  "costs.interventions": { fr: "Interventions", en: "Interventions", ar: "Ø§Ù„ØªØ¯Ø®Ù„Ø§Øª" },
  "costs.monthly": { fr: "CoÃ»ts mensuels", en: "Monthly Costs", ar: "Ø§Ù„ØªÙƒØ§Ù„ÙŠÙ Ø§Ù„Ø´Ù‡Ø±ÙŠØ©" },
  "costs.laborVsParts": { fr: "Main d'Å“uvre vs PiÃ¨ces", en: "Labor vs Parts", ar: "Ø§Ù„Ø¹Ù…Ø§Ù„Ø© Ù…Ù‚Ø§Ø¨Ù„ Ø§Ù„Ù‚Ø·Ø¹" },
  "costs.perMachine": { fr: "RÃ©partition par machine", en: "Distribution by Machine", ar: "Ø§Ù„ØªÙˆØ²ÙŠØ¹ Ø­Ø³Ø¨ Ø§Ù„Ø¢Ù„Ø©" },
  "costs.totalPerElevator": { fr: "CoÃ»t total par stockeur", en: "Total cost per carousel", ar: "Ø§Ù„ØªÙƒÙ„ÙØ© Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠØ© Ù„ÙƒÙ„ Ù†Ø¸Ø§Ù… ØªØ®Ø²ÙŠÙ†" },

  // Alerts
  "alerts.center": { fr: "Centre d'alertes", en: "Alert Center", ar: "Ù…Ø±ÙƒØ² Ø§Ù„ØªÙ†Ø¨ÙŠÙ‡Ø§Øª" },
  "alerts.markRead": { fr: "âœ“ Tout marquer lu", en: "âœ“ Mark all read", ar: "âœ“ ØªØ¹Ù„ÙŠÙ… Ø§Ù„ÙƒÙ„ ÙƒÙ…Ù‚Ø±ÙˆØ¡" },
  "alerts.all": { fr: "Toutes", en: "All", ar: "Ø§Ù„ÙƒÙ„" },
  "alerts.unread": { fr: "Non lues", en: "Unread", ar: "ØºÙŠØ± Ù…Ù‚Ø±ÙˆØ¡Ø©" },
  "alerts.critical": { fr: "Critiques", en: "Critical", ar: "Ø­Ø±Ø¬Ø©" },
  "alerts.warnings": { fr: "Avertissements", en: "Warnings", ar: "ØªØ­Ø°ÙŠØ±Ø§Øª" },
  "alerts.information": { fr: "Information", en: "Information", ar: "Ù…Ø¹Ù„ÙˆÙ…Ø§Øª" },
  "alerts.config": { fr: "Configuration emails", en: "Email Configuration", ar: "Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ø§Ù„Ø¨Ø±ÙŠØ¯ Ø§Ù„Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠ" },
  "alerts.save": { fr: "Enregistrer", en: "Save", ar: "Ø­ÙØ¸" },
  "alerts.stats": { fr: "Statistiques (30 jours)", en: "Statistics (30 days)", ar: "Ø§Ù„Ø¥Ø­ØµØ§Ø¦ÙŠØ§Øª (30 ÙŠÙˆÙ…Ù‹Ø§)" },
  "alerts.emergencies": { fr: "Urgences", en: "Emergencies", ar: "Ø­Ø§Ù„Ø§Øª Ø§Ù„Ø·ÙˆØ§Ø±Ø¦" },
  "alerts.monitoring": { fr: "Surveillances", en: "Monitoring", ar: "Ø§Ù„Ù…Ø±Ø§Ù‚Ø¨Ø©" },
  "alerts.managerEmail": { fr: "Email responsable", en: "Manager Email", ar: "Ø¨Ø±ÙŠØ¯ Ø§Ù„Ù…Ø³Ø¤ÙˆÙ„" },
  "alerts.techEmail": { fr: "Email technicien senior", en: "Senior Technician Email", ar: "Ø¨Ø±ÙŠØ¯ Ø§Ù„ÙÙ†ÙŠ Ø§Ù„Ø£ÙˆÙ„" },
  "alerts.triggerConditions": { fr: "Conditions de dÃ©clenchement automatique", en: "Automatic Trigger Conditions", ar: "Ø´Ø±ÙˆØ· Ø§Ù„ØªØ´ØºÙŠÙ„ Ø§Ù„ØªÙ„Ù‚Ø§Ø¦ÙŠ" },
  "alerts.urgenceRule": { fr: "HI < 0.30 OU RUL < 7j â†’ email immÃ©diat (max 1Ã—/24h)", en: "HI < 0.30 OR RUL < 7d â†’ immediate email (max 1Ã—/24h)", ar: "HI < 0.30 Ø£Ùˆ RUL < 7 Ø£ÙŠØ§Ù… â† Ø¨Ø±ÙŠØ¯ ÙÙˆØ±ÙŠ (Ø­Ø¯ Ø£Ù‚ØµÙ‰ 1Ã—/24 Ø³Ø§Ø¹Ø©)" },
  "alerts.survRule": { fr: "Email rÃ©capitulatif hebdomadaire", en: "Weekly recap email", ar: "Ø¨Ø±ÙŠØ¯ Ù…Ù„Ø®Øµ Ø£Ø³Ø¨ÙˆØ¹ÙŠ" },
  "alerts.okRule": { fr: "Aucun email", en: "No email", ar: "Ø¨Ø¯ÙˆÙ† Ø¨Ø±ÙŠØ¯" },
  "alerts.perMachineStatus": { fr: "Statut alertes par machine", en: "Per-Machine Alert Status", ar: "Ø­Ø§Ù„Ø© Ø§Ù„ØªÙ†Ø¨ÙŠÙ‡Ø§Øª Ø­Ø³Ø¨ Ø§Ù„Ø¢Ù„Ø©" },
  "alerts.noEmail": { fr: "Aucun email", en: "No email", ar: "Ø¨Ø¯ÙˆÙ† Ø¨Ø±ÙŠØ¯" },
  "alerts.weeklyScheduled": { fr: "Hebdo programmÃ©", en: "Weekly scheduled", ar: "Ø£Ø³Ø¨ÙˆØ¹ÙŠ Ù…Ø¬Ø¯ÙˆÙ„" },
  "alerts.emailSent": { fr: "Email envoyÃ©", en: "Email sent", ar: "ØªÙ… Ø¥Ø±Ø³Ø§Ù„ Ø§Ù„Ø¨Ø±ÙŠØ¯" },
  "alerts.recentLog": { fr: "Journal d'alertes rÃ©cent", en: "Recent Alert Log", ar: "Ø³Ø¬Ù„ Ø§Ù„ØªÙ†Ø¨ÙŠÙ‡Ø§Øª Ø§Ù„Ø£Ø®ÙŠØ±" },

  // Admin
  "admin.users": { fr: "Utilisateurs", en: "Users", ar: "Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù…ÙˆÙ†" },
  "admin.machines": { fr: "Machines", en: "Machines", ar: "Ø§Ù„Ø¢Ù„Ø§Øª" },
  "admin.settings": { fr: "ParamÃ¨tres", en: "Settings", ar: "Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª" },
  "admin.userMgmt": { fr: "Gestion des utilisateurs", en: "User Management", ar: "Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù…ÙŠÙ†" },
  "admin.add": { fr: "Ajouter", en: "Add", ar: "Ø¥Ø¶Ø§ÙØ©" },
  "admin.machineConfig": { fr: "Configuration des machines", en: "Machine Configuration", ar: "Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ø§Ù„Ø¢Ù„Ø§Øª" },
  "admin.machineConfigDesc": { fr: "Gestion avancÃ©e des paramÃ¨tres machines.", en: "Advanced machine parameter management.", ar: "Ø¥Ø¯Ø§Ø±Ø© Ù…ØªÙ‚Ø¯Ù…Ø© Ù„Ù…Ø¹Ù„Ù…Ø§Øª Ø§Ù„Ø¢Ù„Ø§Øª." },
  "admin.alertThresholds": { fr: "Seuils d'alerte", en: "Alert Thresholds", ar: "Ø¹ØªØ¨Ø§Øª Ø§Ù„ØªÙ†Ø¨ÙŠÙ‡" },
  "admin.alertThresholdsSub": { fr: "Configurer les seuils HI, RUL et capteurs", en: "Configure HI, RUL and sensor thresholds", ar: "Ø¶Ø¨Ø· Ø¹ØªØ¨Ø§Øª HI Ùˆ RUL ÙˆØ§Ù„Ù…Ø³ØªØ´Ø¹Ø±Ø§Øª" },
  "admin.notifications": { fr: "Notifications", en: "Notifications", ar: "Ø§Ù„Ø¥Ø´Ø¹Ø§Ø±Ø§Øª" },
  "admin.notificationsSub": { fr: "Email, SMS, alertes in-app", en: "Email, SMS, in-app alerts", ar: "Ø¨Ø±ÙŠØ¯ØŒ Ø±Ø³Ø§Ø¦Ù„ØŒ ØªÙ†Ø¨ÙŠÙ‡Ø§Øª Ø§Ù„ØªØ·Ø¨ÙŠÙ‚" },
  "admin.mlIntegration": { fr: "IntÃ©gration ML", en: "ML Integration", ar: "ØªÙƒØ§Ù…Ù„ Ø§Ù„ØªØ¹Ù„Ù… Ø§Ù„Ø¢Ù„ÙŠ" },
  "admin.mlIntegrationSub": { fr: "Configuration du microservice Python (Phase 3)", en: "Python microservice configuration (Phase 3)", ar: "Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ø®Ø¯Ù…Ø© Python Ø§Ù„Ù…ØµØºØ±Ø© (Ø§Ù„Ù…Ø±Ø­Ù„Ø© 3)" },
  "admin.generateReport": { fr: "Generer rapport", en: "Generate report", ar: "Ø¥Ù†Ø´Ø§Ø¡ ØªÙ‚Ø±ÙŠØ±" },
  "admin.exportPDF": { fr: "Exporter PDF", en: "Export PDF", ar: "ØªØµØ¯ÙŠØ± PDF" },
  "admin.anomalyLog": { fr: "Historique d'anomalies", en: "Anomaly History", ar: "Ø³Ø¬Ù„ Ø§Ù„Ø´Ø°ÙˆØ°Ø§Øª" },
  "admin.thresholdSliders": { fr: "Seuils d'alerte machine", en: "Machine Alert Thresholds", ar: "Ø¹ØªØ¨Ø§Øª ØªÙ†Ø¨ÙŠÙ‡ Ø§Ù„Ø¢Ù„Ø©" },
  "admin.shapChart": { fr: "Importance des features (SHAP)", en: "Feature Importance (SHAP)", ar: "Ø£Ù‡Ù…ÙŠØ© Ø§Ù„Ù…ÙŠØ²Ø§Øª (SHAP)" },
  "admin.hiCritLevel": { fr: "HI â€” Niveau critique", en: "HI â€” Critical Level", ar: "HI â€” Ø§Ù„Ù…Ø³ØªÙˆÙ‰ Ø§Ù„Ø­Ø±Ø¬" },
  "admin.hiSurvLevel": { fr: "HI â€” Niveau surveillance", en: "HI â€” Monitoring Level", ar: "HI â€” Ù…Ø³ØªÙˆÙ‰ Ø§Ù„Ù…Ø±Ø§Ù‚Ø¨Ø©" },
  "admin.rulCritDays": { fr: "RUL â€” Critique (jours)", en: "RUL â€” Critical (days)", ar: "RUL â€” Ø­Ø±Ø¬ (Ø£ÙŠØ§Ù…)" },
  "admin.rulSurvDays": { fr: "RUL â€” Surveillance (jours)", en: "RUL â€” Monitoring (days)", ar: "RUL â€” Ù…Ø±Ø§Ù‚Ø¨Ø© (Ø£ÙŠØ§Ù…)" },
  "admin.thresholdSummary": { fr: "RÃ©sumÃ© des actions", en: "Actions Summary", ar: "Ù…Ù„Ø®Øµ Ø§Ù„Ø¥Ø¬Ø±Ø§Ø¡Ø§Øª" },
  "admin.reportGenerated": { fr: "Rapport gÃ©nÃ©rÃ©", en: "Report generated", ar: "ØªÙ… Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„ØªÙ‚Ø±ÙŠØ±" },
  "admin.pdfPlaceholder": { fr: "Export PDF (FPDF2)", en: "PDF Export (FPDF2)", ar: "ØªØµØ¯ÙŠØ± PDF (FPDF2)" },
  "admin.weeklyReport": { fr: "Rapport hebdomadaire", en: "Weekly Report", ar: "ØªÙ‚Ø±ÙŠØ± Ø£Ø³Ø¨ÙˆØ¹ÙŠ" },
  "admin.monthlyReport": { fr: "Rapport mensuel", en: "Monthly Report", ar: "ØªÙ‚Ø±ÙŠØ± Ø´Ù‡Ø±ÙŠ" },

  // Topbar
  "topbar.search": { fr: "Rechercher machines, alertes...", en: "Search machines, alerts...", ar: "Ø¨Ø­Ø« Ø¹Ù† Ø§Ù„Ø¢Ù„Ø§ØªØŒ Ø§Ù„ØªÙ†Ø¨ÙŠÙ‡Ø§Øª..." },
  "topbar.lastUpdate": { fr: "DerniÃ¨re MAJ", en: "Last Update", ar: "Ø¢Ø®Ø± ØªØ­Ø¯ÙŠØ«" },
  "topbar.live": { fr: "Live", en: "Live", ar: "Ù…Ø¨Ø§Ø´Ø±" },
  "topbar.production": { fr: "Production", en: "Production", ar: "Ø§Ù„Ø¥Ù†ØªØ§Ø¬" },

  // Settings
  "settings.language": { fr: "Langue", en: "Language", ar: "Ø§Ù„Ù„ØºØ©" },
  "settings.theme": { fr: "ThÃ¨me", en: "Theme", ar: "Ø§Ù„Ù…Ø¸Ù‡Ø±" },
  "settings.french": { fr: "FranÃ§ais", en: "French", ar: "Ø§Ù„ÙØ±Ù†Ø³ÙŠØ©" },
  "settings.english": { fr: "Anglais", en: "English", ar: "Ø§Ù„Ø¥Ù†Ø¬Ù„ÙŠØ²ÙŠØ©" },
  "settings.dark": { fr: "Sombre", en: "Dark", ar: "Ø¯Ø§ÙƒÙ†" },
  "settings.light": { fr: "Clair", en: "Light", ar: "ÙØ§ØªØ­" },

  // Page meta
  "meta.dashboard.title": { fr: "Tableau de bord", en: "Dashboard", ar: "Ù„ÙˆØ­Ø© Ø§Ù„Ù‚ÙŠØ§Ø¯Ø©" },
  "meta.dashboard.sub": { fr: "Vue d'ensemble de la flotte", en: "Fleet overview", ar: "Ù†Ø¸Ø±Ø© Ø¹Ø§Ù…Ø© Ø¹Ù„Ù‰ Ø§Ù„Ø£Ø³Ø·ÙˆÙ„" },
  "meta.machines.title": { fr: "Gestion des machines", en: "Machine Management", ar: "Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ø¢Ù„Ø§Øª" },
  "meta.machines.sub": { fr: "Gestion du parc de stockeurs verticaux rotatifs", en: "Vertical storage carousel fleet management", ar: "Ø¥Ø¯Ø§Ø±Ø© Ø£Ø³Ø·ÙˆÙ„ Ø£Ù†Ø¸Ù…Ø© Ø§Ù„ØªØ®Ø²ÙŠÙ† Ø§Ù„Ø¹Ù…ÙˆØ¯ÙŠØ© Ø§Ù„Ø¯ÙˆØ§Ø±Ø©" },
  "meta.maintenance.title": { fr: "Calendrier de maintenance", en: "Maintenance Calendar", ar: "ØªÙ‚ÙˆÙŠÙ… Ø§Ù„ØµÙŠØ§Ù†Ø©" },
  "meta.maintenance.sub": { fr: "Calendrier et suivi des interventions", en: "Calendar and intervention tracking", ar: "ØªÙ‚ÙˆÙŠÙ… ÙˆÙ…ØªØ§Ø¨Ø¹Ø© Ø§Ù„ØªØ¯Ø®Ù„Ø§Øª" },
  "meta.calendar.title": { fr: "Calendrier", en: "Calendar", ar: "Ø§Ù„ØªÙ‚ÙˆÙŠÙ…" },
  "meta.calendar.sub": { fr: "Planification maintenance", en: "Maintenance planning", ar: "ØªØ®Ø·ÙŠØ· Ø§Ù„ØµÙŠØ§Ù†Ø©" },
  "meta.costs.title": { fr: "CoÃ»ts & Budget", en: "Costs & Budget", ar: "Ø§Ù„ØªÙƒØ§Ù„ÙŠÙ ÙˆØ§Ù„Ù…ÙŠØ²Ø§Ù†ÙŠØ©" },
  "meta.costs.sub": { fr: "Suivi budgÃ©taire maintenance", en: "Maintenance budget tracking", ar: "Ù…ØªØ§Ø¨Ø¹Ø© Ù…ÙŠØ²Ø§Ù†ÙŠØ© Ø§Ù„ØµÙŠØ§Ù†Ø©" },
  "meta.alerts.title": { fr: "Centre d'alertes", en: "Alert Center", ar: "Ù…Ø±ÙƒØ² Ø§Ù„ØªÙ†Ø¨ÙŠÙ‡Ø§Øª" },
  "meta.alerts.sub": { fr: "Centre de notifications et d'alertes", en: "Notification and alert center", ar: "Ù…Ø±ÙƒØ² Ø§Ù„Ø¥Ø´Ø¹Ø§Ø±Ø§Øª ÙˆØ§Ù„ØªÙ†Ø¨ÙŠÙ‡Ø§Øª" },
  "meta.geo.title": { fr: "GÃ©olocalisation", en: "Geolocation", ar: "Ø§Ù„Ù…ÙˆÙ‚Ø¹ Ø§Ù„Ø¬ØºØ±Ø§ÙÙŠ" },
  "meta.geo.sub": { fr: "DÃ©ploiement Tunisie â€” Carte interactive", en: "Tunisia deployment â€” Interactive map", ar: "Ù†Ø´Ø± ØªÙˆÙ†Ø³ â€” Ø®Ø±ÙŠØ·Ø© ØªÙØ§Ø¹Ù„ÙŠØ©" },
  "meta.admin.title": { fr: "Administration", en: "Administration", ar: "Ø§Ù„Ø¥Ø¯Ø§Ø±Ø©" },
  "meta.admin.sub": { fr: "Gestion de la plateforme", en: "Platform management", ar: "Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ù…Ù†ØµØ©" },
  "meta.ia.title": { fr: "Analyse & rapports", en: "Analysis & reports", ar: "ØªØ­Ù„ÙŠÙ„ ÙˆØªÙ‚Ø§Ø±ÙŠØ±" },
  "meta.ia.sub": { fr: "Priorites machine, syntheses et export PDF", en: "Machine priorities, summaries, and PDF export", ar: "Ø£ÙˆÙ„ÙˆÙŠØ§Øª Ø§Ù„Ø¢Ù„Ø§Øª ÙˆØ§Ù„Ù…Ù„Ø®ØµØ§Øª ÙˆØªØµØ¯ÙŠØ± PDF" },
  "meta.rapportia.title": { fr: "Rapports", en: "Reports", ar: "ØªÙ‚Ø§Ø±ÙŠØ±" },
  "meta.rapportia.sub": { fr: "Syntheses, historique et export PDF", en: "Summaries, history, and PDF export", ar: "Ø§Ù„Ù…Ù„Ø®ØµØ§Øª ÙˆØ§Ù„ØªØ§Ø±ÙŠØ® ÙˆØªØµØ¯ÙŠØ± PDF" },
  "meta.seuils.title": { fr: "Seuils d'alertes", en: "Alert Thresholds", ar: "Ø¹ØªØ¨Ø§Øª Ø§Ù„ØªÙ†Ø¨ÙŠÙ‡" },
  "meta.seuils.sub": { fr: "Regles d'alerte et notifications", en: "Alert rules and notifications", ar: "Ù‚ÙˆØ§Ø¹Ø¯ Ø§Ù„ØªÙ†Ø¨ÙŠÙ‡ ÙˆØ§Ù„Ø¥Ø´Ø¹Ø§Ø±Ø§Øª" },
  "meta.planner.title": { fr: "Plan d'action", en: "Action plan", ar: "Ø®Ø·Ø© Ø§Ù„Ø¹Ù…Ù„" },
  "meta.planner.sub": { fr: "Priorites flotte, actions a valider et envoi au calendrier", en: "Fleet priorities, actions to validate, and send to calendar", ar: "Ø£ÙˆÙ„ÙˆÙŠØ§Øª Ø§Ù„Ø£Ø³Ø·ÙˆÙ„ ÙˆØ§Ù„Ø¥Ø¬Ø±Ø§Ø¡Ø§Øª Ø§Ù„Ù…Ø±Ø§Ø¯ ØªØ£ÙƒÙŠØ¯Ù‡Ø§ ÙˆØ¥Ø±Ø³Ø§Ù„Ù‡Ø§ Ø¥Ù„Ù‰ Ø§Ù„ØªÙ‚ÙˆÙŠÙ…" },
  "meta.diagnostics.title": { fr: "Diagnostic détaillé", en: "Detailed diagnostics", ar: "Ø§Ù„ØªØ´Ø®ÙŠØµ Ø§Ù„Ù…ÙØµÙ„" },
  "meta.diagnostics.sub": { fr: "Lecture détaillée de la machine : marge restante, alertes et points de contrôle", en: "Detailed machine view: remaining margin, alerts, and checkpoints", ar: "Ù‚Ø±Ø§Ø¡Ø© Ù…ÙØµÙ„Ø© Ù„Ù„Ø¢Ù„Ø©: Ø§Ù„Ù…Ø¯Ù‰ Ø§Ù„Ù…ØªØ¨Ù‚ÙŠ ÙˆØ§Ù„ØªÙ†Ø¨ÙŠÙ‡Ø§Øª ÙˆÙ†Ù‚Ø§Ø· Ø§Ù„ÙØ­Øµ" },

  // Chat widget
  "chat.title": { fr: "Lecture rapide", en: "Quick view", ar: "Ù‚Ø±Ø§Ø¡Ø© Ø³Ø±ÙŠØ¹Ø©" },
  "chat.subtitle": { fr: "Machines, alertes et actions", en: "Machines, alerts, and actions", ar: "Ø¢Ù„Ø§Øª ÙˆØªÙ†Ø¨ÙŠÙ‡Ø§Øª ÙˆØ¥Ø¬Ø±Ø§Ø¡Ø§Øª" },
  "chat.greeting": { fr: "Question sur une machine, une alerte ou une action.", en: "Question about a machine, an alert, or an action.", ar: "Ø³Ø¤Ø§Ù„ Ø­ÙˆÙ„ Ø¢Ù„Ø© Ø£Ùˆ ØªÙ†Ø¨ÙŠÙ‡ Ø£Ùˆ Ø¥Ø¬Ø±Ø§Ø¡." },
  "chat.welcome": { fr: "Etat des machines, alertes et actions disponibles.", en: "Machine status, alerts, and actions available.", ar: "Ø­Ø§Ù„Ø© Ø§Ù„Ø¢Ù„Ø§Øª ÙˆØ§Ù„ØªÙ†Ø¨ÙŠÙ‡Ø§Øª ÙˆØ§Ù„Ø¥Ø¬Ø±Ø§Ø¡Ø§Øª Ø§Ù„Ù…ØªØ§Ø­Ø©." },
  "chat.placeholder": { fr: "Question sur une machine ou une alerte...", en: "Question about a machine or an alert...", ar: "Ø³Ø¤Ø§Ù„ Ø­ÙˆÙ„ Ø¢Ù„Ø© Ø£Ùˆ ØªÙ†Ø¨ÙŠÙ‡..." },
  "chat.thinking": { fr: "Chargement...", en: "Loading...", ar: "Ø¬Ø§Ø±ÙŠ Ø§Ù„ØªØ­Ù…ÙŠÙ„..." },

  // Planner
  "planner.title": { fr: "Plan d'action maintenance", en: "Maintenance action plan", ar: "Ø®Ø·Ø© Ø£Ø¹Ù…Ø§Ù„ Ø§Ù„ØµÙŠØ§Ù†Ø©" },
  "planner.subtitle": { fr: "Classe la flotte, propose les prochaines actions et prepare les taches de maintenance", en: "Ranks the fleet, suggests next actions, and prepares maintenance tasks", ar: "ÙŠØ±ØªØ¨ Ø§Ù„Ø£Ø³Ø·ÙˆÙ„ ÙˆÙŠÙ‚ØªØ±Ø­ Ø§Ù„Ø®Ø·ÙˆØ§Øª Ø§Ù„ØªØ§Ù„ÙŠØ© ÙˆÙŠØ¬Ù‡Ø² Ù…Ù‡Ø§Ù… Ø§Ù„ØµÙŠØ§Ù†Ø©" },
  "planner.fleetRisk": { fr: "Classement des risques", en: "Risk Ranking", ar: "ØªØµÙ†ÙŠÙ Ø§Ù„Ù…Ø®Ø§Ø·Ø±" },
  "planner.loadingRisk": { fr: "Chargement...", en: "Loading...", ar: "Ø¬Ø§Ø±ÙŠ Ø§Ù„ØªØ­Ù…ÙŠÙ„..." },
  "planner.noData": { fr: "Aucune donnÃ©e â€” actualisez ou attendez la prochaine lecture", en: "No data â€” refresh or wait for the next reading", ar: "Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¨ÙŠØ§Ù†Ø§Øª â€” Ø­Ø¯Ù‘Ø« Ø£Ùˆ Ø§Ù†ØªØ¸Ø± Ø§Ù„Ù‚Ø±Ø§Ø¡Ø© Ø§Ù„ØªØ§Ù„ÙŠØ©" },
  "planner.openTasks": { fr: "tÃ¢che(s) ouverte(s)", en: "open task(s)", ar: "Ù…Ù‡Ù…Ø© Ù…ÙØªÙˆØ­Ø©" },
  "planner.fullPlan": { fr: "Plan de maintenance complet", en: "Full maintenance plan", ar: "Ø®Ø·Ø© Ø§Ù„ØµÙŠØ§Ù†Ø© Ø§Ù„ÙƒØ§Ù…Ù„Ø©" },
  "planner.generate": { fr: "GÃ©nÃ©rer le plan", en: "Generate Plan", ar: "Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ø®Ø·Ø©" },
  "planner.generating": { fr: "GÃ©nÃ©ration...", en: "Generating...", ar: "Ø¬Ø§Ø±ÙŠ Ø§Ù„Ø¥Ù†Ø´Ø§Ø¡..." },
  "planner.clickGenerate": { fr: "Cliquez sur Generer pour preparer les actions", en: "Click Generate to prepare the actions", ar: "Ø§Ù†Ù‚Ø± Ø¹Ù„Ù‰ Ø¥Ù†Ø´Ø§Ø¡ Ù„ØªØ¬Ù‡ÙŠØ² Ø§Ù„Ø¥Ø¬Ø±Ø§Ø¡Ø§Øª" },
  "planner.proposedTasks": { fr: "TÃ¢ches proposÃ©es", en: "Proposed tasks", ar: "Ø§Ù„Ù…Ù‡Ø§Ù… Ø§Ù„Ù…Ù‚ØªØ±Ø­Ø©" },
  "planner.approve": { fr: "Approuver", en: "Approve", ar: "Ø§Ù„Ù…ÙˆØ§ÙÙ‚Ø©" },

  // Status
  "status.operational": { fr: "OpÃ©rationnel", en: "Operational", ar: "ØªØ´ØºÙŠÙ„ÙŠ" },
  "status.degraded": { fr: "Surveillance", en: "Surveillance", ar: "Ù…Ø±Ø§Ù‚Ø¨Ø©" },
  "status.critical": { fr: "Critique", en: "Critical", ar: "Ø­Ø±Ø¬" },
  "status.maintenance": { fr: "Maintenance", en: "Maintenance", ar: "ØµÙŠØ§Ù†Ø©" },

  // Table headers
  "table.name": { fr: "Nom", en: "Name", ar: "Ø§Ù„Ø§Ø³Ù…" },
  "table.email": { fr: "Email", en: "Email", ar: "Ø§Ù„Ø¨Ø±ÙŠØ¯ Ø§Ù„Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠ" },
  "table.role": { fr: "RÃ´le", en: "Role", ar: "Ø§Ù„Ø¯ÙˆØ±" },
  "table.status": { fr: "Statut", en: "Status", ar: "Ø§Ù„Ø­Ø§Ù„Ø©" },
  "table.lastLogin": { fr: "DerniÃ¨re connexion", en: "Last Login", ar: "Ø¢Ø®Ø± ØªØ³Ø¬ÙŠÙ„ Ø¯Ø®ÙˆÙ„" },
  "table.active": { fr: "Actif", en: "Active", ar: "Ù†Ø´Ø·" },
  "table.inactive": { fr: "Inactif", en: "Inactive", ar: "ØºÙŠØ± Ù†Ø´Ø·" },

  // Common
  "common.today": { fr: "Aujourd'hui", en: "Today", ar: "Ø§Ù„ÙŠÙˆÙ…" },

  // Chart
  "chart.urgency": { fr: "Urgence", en: "Emergency", ar: "Ø·ÙˆØ§Ø±Ø¦" },
  "chart.surveillance": { fr: "Surveillance", en: "Monitoring", ar: "Ù…Ø±Ø§Ù‚Ø¨Ø©" },

  // Machine modal
  "modal.machineInfo": { fr: "Informations machine", en: "Machine Information", ar: "Ù…Ø¹Ù„ÙˆÙ…Ø§Øª Ø§Ù„Ø¢Ù„Ø©" },
  "modal.model": { fr: "ModÃ¨le", en: "Model", ar: "Ø§Ù„Ù…ÙˆØ¯ÙŠÙ„" },
  "modal.floors": { fr: "Niveaux", en: "Levels", ar: "Ø§Ù„Ù…Ø³ØªÙˆÙŠØ§Øª" },
  "modal.city": { fr: "Ville", en: "City", ar: "Ø§Ù„Ù…Ø¯ÙŠÙ†Ø©" },
  "modal.cyclesDay": { fr: "Cycles/jour", en: "Cycles/day", ar: "Ø¯ÙˆØ±Ø§Øª/ÙŠÙˆÙ…" },
  "modal.healthIndex": { fr: "Indice de santÃ© (HI)", en: "Machine health (HI)", ar: "Ù…Ø¤Ø´Ø± Ø§Ù„ØµØ­Ø©" },
  "modal.inMaintenance": { fr: "En maintenance", en: "In Maintenance", ar: "Ù‚ÙŠØ¯ Ø§Ù„ØµÙŠØ§Ù†Ø©" },
  "modal.anomalies24h": { fr: "Anomalies 24h", en: "Anomalies 24h", ar: "Ø§Ù„Ø´Ø°ÙˆØ°Ø§Øª 24 Ø³Ø§Ø¹Ø©" },
  "modal.anomalyHistory": { fr: "Historique anomalies (24h)", en: "Anomaly History (24h)", ar: "Ø³Ø¬Ù„ Ø§Ù„Ø´Ø°ÙˆØ°Ø§Øª (24 Ø³Ø§Ø¹Ø©)" },
  "modal.noAnomaly": { fr: "Aucune anomalie dÃ©tectÃ©e.", en: "No anomalies detected.", ar: "Ù„Ù… ÙŠØªÙ… Ø§ÙƒØªØ´Ø§Ù Ø£ÙŠ Ø´Ø°ÙˆØ°." },
  "modal.shapFeatures": { fr: "Features influentes (SHAP)", en: "Influential Features (SHAP)", ar: "Ø§Ù„Ù…ÙŠØ²Ø§Øª Ø§Ù„Ù…Ø¤Ø«Ø±Ø© (SHAP)" },
  "modal.shapLoading": { fr: "Chargement SHAP...", en: "Loading SHAP...", ar: "Ø¬Ø§Ø±ÙŠ ØªØ­Ù…ÙŠÙ„ SHAP..." },
  "modal.shapEmpty": { fr: "Actualisez les donnÃ©es pour obtenir les contributions SHAP.", en: "Refresh data to get SHAP contributions.", ar: "Ø­Ø¯Ù‘Ø« Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ù„Ù„Ø­ØµÙˆÙ„ Ø¹Ù„Ù‰ Ù…Ø³Ø§Ù‡Ù…Ø§Øª SHAP." },
  "modal.vibration": { fr: "Vibration moteur", en: "Motor Vibration", ar: "Ø§Ù‡ØªØ²Ø§Ø² Ø§Ù„Ù…Ø­Ø±Ùƒ" },
  "modal.current": { fr: "Courant moteur", en: "Motor Current", ar: "ØªÙŠØ§Ø± Ø§Ù„Ù…Ø­Ø±Ùƒ" },
  "modal.temperature": { fr: "TempÃ©rature moteur", en: "Motor Temperature", ar: "Ø­Ø±Ø§Ø±Ø© Ø§Ù„Ù…Ø­Ø±Ùƒ" },
  "modal.rulEstimated": { fr: "Marge restante (RUL)", en: "Remaining margin (RUL)", ar: "Ø§Ù„Ø¹Ù…Ø± Ø§Ù„Ù…ØªØ¨Ù‚ÙŠ Ø§Ù„Ù…Ù‚Ø¯Ù‘Ø±" },
  "modal.rulSurveillance": { fr: "Surveillance", en: "Monitoring", ar: "Ù…Ø±Ø§Ù‚Ø¨Ø©" },
  "modal.rulNoPrecursor": { fr: "RÃ©fÃ©rence stable active", en: "Stable reference active", ar: "Ù…Ø±Ø¬Ø¹ Ø«Ø§Ø¨Øª Ù†Ø´Ø·" },

  // Auth pages
  "auth.signIn": { fr: "Connexion", en: "Sign In", ar: "ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„" },
  "auth.password": { fr: "Mot de passe", en: "Password", ar: "ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ±" },
  "auth.signInBtn": { fr: "Se connecter", en: "Sign In", ar: "ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„" },
  "auth.noAccount": { fr: "Pas encore de compte ?", en: "No account yet?", ar: "Ù„ÙŠØ³ Ù„Ø¯ÙŠÙƒ Ø­Ø³Ø§Ø¨ØŸ" },
  "auth.signUp": { fr: "S'inscrire", en: "Sign Up", ar: "Ø¥Ù†Ø´Ø§Ø¡ Ø­Ø³Ø§Ø¨" },
  "auth.loginError": { fr: "Erreur de connexion.", en: "Login error.", ar: "Ø®Ø·Ø£ ÙÙŠ ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„." },
  "auth.subtitle": { fr: "SystÃ¨me de maintenance prÃ©dictive industrielle", en: "Industrial predictive maintenance system", ar: "Ù†Ø¸Ø§Ù… ØµÙŠØ§Ù†Ø© ØªÙ†Ø¨Ø¤ÙŠØ© ØµÙ†Ø§Ø¹ÙŠ" },
  "auth.loading": { fr: "Connexion en cours...", en: "Connecting...", ar: "Ø¬Ø§Ø±ÙŠ Ø§Ù„Ø§ØªØµØ§Ù„..." },
  "auth.createAccount": { fr: "CrÃ©er un compte", en: "Create Account", ar: "Ø¥Ù†Ø´Ø§Ø¡ Ø­Ø³Ø§Ø¨" },
  "auth.fullName": { fr: "Nom complet", en: "Full Name", ar: "Ø§Ù„Ø§Ø³Ù… Ø§Ù„ÙƒØ§Ù…Ù„" },
  "auth.confirmPassword": { fr: "Confirmer le mot de passe", en: "Confirm Password", ar: "ØªØ£ÙƒÙŠØ¯ ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ±" },
  "auth.role": { fr: "RÃ´le", en: "Role", ar: "Ø§Ù„Ø¯ÙˆØ±" },
  "auth.user": { fr: "Utilisateur", en: "User", ar: "Ù…Ø³ØªØ®Ø¯Ù…" },
  "auth.administrator": { fr: "Administrateur", en: "Administrator", ar: "Ù…Ø¯ÙŠØ±" },
  "auth.assignedMachine": { fr: "Machine assignÃ©e", en: "Assigned Machine", ar: "Ø§Ù„Ø¢Ù„Ø© Ø§Ù„Ù…Ø®ØµØµØ©" },
  "auth.createBtn": { fr: "CrÃ©er mon compte", en: "Create Account", ar: "Ø¥Ù†Ø´Ø§Ø¡ Ø­Ø³Ø§Ø¨ÙŠ" },
  "auth.hasAccount": { fr: "DÃ©jÃ  un compte ?", en: "Already have an account?", ar: "Ù„Ø¯ÙŠÙƒ Ø­Ø³Ø§Ø¨ Ø¨Ø§Ù„ÙØ¹Ù„ØŸ" },
  "auth.passwordMismatch": { fr: "Les mots de passe ne correspondent pas.", en: "Passwords do not match.", ar: "ÙƒÙ„Ù…ØªØ§ Ø§Ù„Ù…Ø±ÙˆØ± ØºÙŠØ± Ù…ØªØ·Ø§Ø¨Ù‚ØªÙŠÙ†." },
  "auth.passwordTooShort": { fr: "Le mot de passe doit contenir au moins 6 caractÃ¨res.", en: "Password must be at least 6 characters.", ar: "ÙŠØ¬Ø¨ Ø£Ù† ØªØ­ØªÙˆÙŠ ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ± Ø¹Ù„Ù‰ 6 Ø£Ø­Ø±Ù Ø¹Ù„Ù‰ Ø§Ù„Ø£Ù‚Ù„." },
  "auth.registrationError": { fr: "Erreur lors de l'inscription.", en: "Registration error.", ar: "Ø®Ø·Ø£ Ø£Ø«Ù†Ø§Ø¡ Ø§Ù„ØªØ³Ø¬ÙŠÙ„." },

  // Pending page
  "pending.title": { fr: "Compte en cours de validation", en: "Account Pending Validation", ar: "Ø§Ù„Ø­Ø³Ø§Ø¨ Ù‚ÙŠØ¯ Ø§Ù„ØªØ­Ù‚Ù‚" },
  "pending.message": { fr: "Votre demande d'accÃ¨s a Ã©tÃ© soumise avec succÃ¨s. Un administrateur va examiner votre compte sous peu.", en: "Your access request has been submitted successfully. An administrator will review your account shortly.", ar: "ØªÙ… ØªÙ‚Ø¯ÙŠÙ… Ø·Ù„Ø¨ Ø§Ù„ÙˆØµÙˆÙ„ Ø¨Ù†Ø¬Ø§Ø­. Ø³ÙŠÙ‚ÙˆÙ… Ù…Ø³Ø¤ÙˆÙ„ Ø¨Ù…Ø±Ø§Ø¬Ø¹Ø© Ø­Ø³Ø§Ø¨Ùƒ Ù‚Ø±ÙŠØ¨Ù‹Ø§." },
  "pending.name": { fr: "Nom", en: "Name", ar: "Ø§Ù„Ø§Ø³Ù…" },
  "pending.requestedRole": { fr: "RÃ´le demandÃ©", en: "Requested Role", ar: "Ø§Ù„Ø¯ÙˆØ± Ø§Ù„Ù…Ø·Ù„ÙˆØ¨" },
  "pending.urgentContact": { fr: "Pour toute urgence, contactez", en: "For urgent matters, contact", ar: "Ù„Ù„Ø­Ø§Ù„Ø§Øª Ø§Ù„Ø¹Ø§Ø¬Ù„Ø©ØŒ ØªÙˆØ§ØµÙ„ Ù…Ø¹" },
  "pending.signOut": { fr: "Se dÃ©connecter", en: "Sign Out", ar: "ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø®Ø±ÙˆØ¬" },
  "pending.selfApprove": { fr: "Votre propre compte â€” ne peut pas Ãªtre auto-approuvÃ©", en: "Your own account â€” cannot self-approve", ar: "Ø­Ø³Ø§Ø¨Ùƒ Ø§Ù„Ø®Ø§Øµ â€” Ù„Ø§ ÙŠÙ…ÙƒÙ† Ø§Ù„Ù…ÙˆØ§ÙÙ‚Ø© Ø§Ù„Ø°Ø§ØªÙŠØ©" },

  // Alerts page extra
  "alerts.emergenciesSection": { fr: "Urgences", en: "Emergencies", ar: "Ø­Ø§Ù„Ø§Øª Ø§Ù„Ø·ÙˆØ§Ø±Ø¦" },
  "alerts.underMonitoring": { fr: "En surveillance", en: "Under Monitoring", ar: "ØªØ­Øª Ø§Ù„Ù…Ø±Ø§Ù‚Ø¨Ø©" },
  "alerts.resolved": { fr: "RÃ©solues", en: "Resolved", ar: "ØªÙ… Ø­Ù„Ù‡Ø§" },

  // Maintenance extra
  "maint.done": { fr: "TerminÃ©", en: "Done", ar: "Ù…ÙƒØªÙ…Ù„" },
  "maint.urgent": { fr: "Urgent", en: "Urgent", ar: "Ø¹Ø§Ø¬Ù„" },
  "maint.critical": { fr: "Critique", en: "Critical", ar: "Ø­Ø±Ø¬" },
  "maint.ongoing": { fr: "En cours", en: "In Progress", ar: "Ù‚ÙŠØ¯ Ø§Ù„ØªÙ†ÙÙŠØ°" },
  "maint.normal": { fr: "Normal", en: "Normal", ar: "Ø¹Ø§Ø¯ÙŠ" },

  // Calendar extra
  "cal.upcomingInterventions": { fr: "Prochaines interventions", en: "Upcoming Interventions", ar: "Ø§Ù„ØªØ¯Ø®Ù„Ø§Øª Ø§Ù„Ù‚Ø§Ø¯Ù…Ø©" },
  "cal.preventive": { fr: "PrÃ©ventive", en: "Preventive", ar: "ÙˆÙ‚Ø§Ø¦ÙŠØ©" },
  "cal.corrective": { fr: "Corrective", en: "Corrective", ar: "ØªØµØ­ÙŠØ­ÙŠØ©" },
  "cal.inspection": { fr: "Inspection", en: "Inspection", ar: "ÙØ­Øµ" },

  // Months
  "month.0": { fr: "Janvier", en: "January", ar: "ÙŠÙ†Ø§ÙŠØ±" },
  "month.1": { fr: "FÃ©vrier", en: "February", ar: "ÙØ¨Ø±Ø§ÙŠØ±" },
  "month.2": { fr: "Mars", en: "March", ar: "Ù…Ø§Ø±Ø³" },
  "month.3": { fr: "Avril", en: "April", ar: "Ø£Ø¨Ø±ÙŠÙ„" },
  "month.4": { fr: "Mai", en: "May", ar: "Ù…Ø§ÙŠ" },
  "month.5": { fr: "Juin", en: "June", ar: "ÙŠÙˆÙ†ÙŠÙˆ" },
  "month.6": { fr: "Juillet", en: "July", ar: "ÙŠÙˆÙ„ÙŠÙˆ" },
  "month.7": { fr: "AoÃ»t", en: "August", ar: "Ø£ØºØ³Ø·Ø³" },
  "month.8": { fr: "Septembre", en: "September", ar: "Ø³Ø¨ØªÙ…Ø¨Ø±" },
  "month.9": { fr: "Octobre", en: "October", ar: "Ø£ÙƒØªÙˆØ¨Ø±" },
  "month.10": { fr: "Novembre", en: "November", ar: "Ù†ÙˆÙÙ…Ø¨Ø±" },
  "month.11": { fr: "DÃ©cembre", en: "December", ar: "Ø¯ÙŠØ³Ù…Ø¨Ø±" },

  // Rapport IA extra
  "rapport.title": { fr: "Rapports", en: "Reports", ar: "ØªÙ‚Ø§Ø±ÙŠØ±" },
  "rapport.allMachines": { fr: "Toutes les machines", en: "All machines", ar: "Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø¢Ù„Ø§Øª" },
  "rapport.period": { fr: "PÃ©riode", en: "Period", ar: "Ø§Ù„ÙØªØ±Ø©" },
  "rapport.weekly": { fr: "Hebdomadaire", en: "Weekly", ar: "Ø£Ø³Ø¨ÙˆØ¹ÙŠ" },
  "rapport.monthly": { fr: "Mensuel", en: "Monthly", ar: "Ø´Ù‡Ø±ÙŠ" },
  "rapport.reportLang": { fr: "Langue du rapport", en: "Report Language", ar: "Ù„ØºØ© Ø§Ù„ØªÙ‚Ø±ÙŠØ±" },
  "rapport.generate": { fr: "GÃ©nÃ©rer le rapport", en: "Generate Report", ar: "Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„ØªÙ‚Ø±ÙŠØ±" },
  "rapport.exportPdf": { fr: "Exporter PDF", en: "Export PDF", ar: "ØªØµØ¯ÙŠØ± PDF" },
  "rapport.pdfSoon": { fr: "Export PDF", en: "PDF Export", ar: "ØªØµØ¯ÙŠØ± PDF" },
  "rapport.generated": { fr: "Rapport gÃ©nÃ©rÃ©", en: "Report generated", ar: "ØªÙ… Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„ØªÙ‚Ø±ÙŠØ±" },

  // Seuils extra
  "seuils.title": { fr: "Seuils d'alertes", en: "Alert Thresholds", ar: "Ø¹ØªØ¨Ø§Øª Ø§Ù„ØªÙ†Ø¨ÙŠÙ‡" },
  "seuils.config": { fr: "Configuration des seuils", en: "Threshold Configuration", ar: "Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ø§Ù„Ø¹ØªØ¨Ø§Øª" },
  "seuils.emergency": { fr: "Urgence", en: "Emergency", ar: "Ø·ÙˆØ§Ø±Ø¦" },
  "seuils.monitoring": { fr: "Surveillance", en: "Monitoring", ar: "Ù…Ø±Ø§Ù‚Ø¨Ø©" },
  "seuils.days": { fr: "jours", en: "days", ar: "Ø£ÙŠØ§Ù…" },
  "seuils.emailImmediate": { fr: "Email immÃ©diat aux deux destinataires (max 1x/24h)", en: "Immediate email to both recipients (max 1x/24h)", ar: "Ø¨Ø±ÙŠØ¯ ÙÙˆØ±ÙŠ Ù„Ù„Ù…Ø³ØªÙ„Ù…ÙŠÙ† (Ø­Ø¯ Ø£Ù‚ØµÙ‰ 1Ã—/24 Ø³Ø§Ø¹Ø©)" },
  "seuils.emailWeekly": { fr: "Email rÃ©capitulatif hebdomadaire", en: "Weekly recap email", ar: "Ø¨Ø±ÙŠØ¯ Ù…Ù„Ø®Øµ Ø£Ø³Ø¨ÙˆØ¹ÙŠ" },
  "seuils.emailConfig": { fr: "Configuration emails", en: "Email Configuration", ar: "Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ø§Ù„Ø¨Ø±ÙŠØ¯ Ø§Ù„Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠ" },
  "seuils.managerEmail": { fr: "Email responsable", en: "Manager Email", ar: "Ø¨Ø±ÙŠØ¯ Ø§Ù„Ù…Ø³Ø¤ÙˆÙ„" },
  "seuils.techEmail": { fr: "Email technicien senior", en: "Senior Technician Email", ar: "Ø¨Ø±ÙŠØ¯ Ø§Ù„ÙÙ†ÙŠ Ø§Ù„Ø£ÙˆÙ„" },
  "seuils.save": { fr: "Enregistrer les seuils", en: "Save Thresholds", ar: "Ø­ÙØ¸ Ø§Ù„Ø¹ØªØ¨Ø§Øª" },
  "seuils.saved": { fr: "Seuils enregistrÃ©s", en: "Thresholds saved", ar: "ØªÙ… Ø­ÙØ¸ Ø§Ù„Ø¹ØªØ¨Ø§Øª" },

  // Dashboard alerts
  "dash.rulCritique": { fr: "RUL critique", en: "Critical RUL", ar: "Ø§Ù„Ø¹Ù…Ø± Ø§Ù„Ù…ØªØ¨Ù‚ÙŠ Ø­Ø±Ø¬" },
  "dash.hiCritique": { fr: "HI critique", en: "Critical HI", ar: "Ù…Ø¤Ø´Ø± Ø§Ù„ØµØ­Ø© Ø­Ø±Ø¬" },
  "dash.hiThreshold": { fr: "seuil < 0.4", en: "threshold < 0.4", ar: "Ø§Ù„Ø¹ØªØ¨Ø© < 0.4" },
  "dash.hiDegradation": { fr: "DÃ©gradation HI", en: "HI Degradation", ar: "ØªØ¯Ù‡ÙˆØ± Ù…Ø¤Ø´Ø± Ø§Ù„ØµØ­Ø©" },
  "dash.decreasingTrendShort": { fr: "tendance dÃ©croissante", en: "decreasing trend", ar: "Ø§ØªØ¬Ø§Ù‡ ØªÙ†Ø§Ø²Ù„ÙŠ" },

  // Footer
  "footer.text": { fr: "Â© 2026 AroTeq. PrediTeq Pro â€” Tous droits rÃ©servÃ©s. | SystÃ¨me de maintenance prÃ©dictive industrielle", en: "Â© 2026 AroTeq. PrediTeq Pro â€” All rights reserved. | Industrial predictive maintenance system", ar: "Â© 2026 AroTeq. PrediTeq Pro â€” Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø­Ù‚ÙˆÙ‚ Ù…Ø­ÙÙˆØ¸Ø©. | Ù†Ø¸Ø§Ù… ØµÙŠØ§Ù†Ø© ØªÙ†Ø¨Ø¤ÙŠØ© ØµÙ†Ø§Ø¹ÙŠ" },

  // Not Found
  "notfound.title": { fr: "Oops ! Page introuvable", en: "Oops! Page not found", ar: "Ø¹Ø°Ø±Ù‹Ø§! Ø§Ù„ØµÙØ­Ø© ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯Ø©" },
  "notfound.home": { fr: "Retour Ã  l'accueil", en: "Return to Home", ar: "Ø§Ù„Ø¹ÙˆØ¯Ø© Ù„Ù„Ø±Ø¦ÙŠØ³ÙŠØ©" },

  // Account management
  "admin.pendingAccounts": { fr: "Comptes en attente", en: "Pending Accounts", ar: "Ø­Ø³Ø§Ø¨Ø§Øª Ù…Ø¹Ù„Ù‚Ø©" },
  "admin.noPending": { fr: "Aucune demande en attente.", en: "No pending requests.", ar: "Ù„Ø§ ØªÙˆØ¬Ø¯ Ø·Ù„Ø¨Ø§Øª Ù…Ø¹Ù„Ù‚Ø©." },
  "admin.allMachines": { fr: "Toutes les machines", en: "All machines", ar: "Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø¢Ù„Ø§Øª" },
  "admin.approve": { fr: "Approuver", en: "Approve", ar: "Ù…ÙˆØ§ÙÙ‚Ø©" },
  "admin.reject": { fr: "Rejeter", en: "Reject", ar: "Ø±ÙØ¶" },
  "admin.approved": { fr: "Compte approuvÃ©", en: "Account approved", ar: "ØªÙ…Øª Ø§Ù„Ù…ÙˆØ§ÙÙ‚Ø© Ø¹Ù„Ù‰ Ø§Ù„Ø­Ø³Ø§Ø¨" },
  "admin.rejected": { fr: "Compte refusÃ©", en: "Account rejected", ar: "ØªÙ… Ø±ÙØ¶ Ø§Ù„Ø­Ø³Ø§Ø¨" },
  "admin.activeAccounts": { fr: "Comptes actifs", en: "Active Accounts", ar: "Ø§Ù„Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„Ù†Ø´Ø·Ø©" },
  "admin.addUser": { fr: "Ajouter utilisateur", en: "Add User", ar: "Ø¥Ø¶Ø§ÙØ© Ù…Ø³ØªØ®Ø¯Ù…" },
  "admin.approvedOn": { fr: "ApprouvÃ© le", en: "Approved on", ar: "ØªØ§Ø±ÙŠØ® Ø§Ù„Ù…ÙˆØ§ÙÙ‚Ø©" },
  "admin.accountMgmt": { fr: "Gestion des comptes", en: "Account Management", ar: "Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ø­Ø³Ø§Ø¨Ø§Øª" },
  "admin.settingsTab": { fr: "ParamÃ¨tres", en: "Settings", ar: "Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª" },
  "admin.all": { fr: "Toutes", en: "All", ar: "Ø§Ù„ÙƒÙ„" },
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => normalizeUiLang(safeStorageGet("pl-lang")));
  const [theme, setTheme] = useState<Theme>(() => (safeStorageGet("pl-theme") as Theme) || "light");
  const [alertEmails, setAlertEmails] = useState(() => {
    const saved = safeStorageGet("pl-alert-emails");
    if (saved) try { return JSON.parse(saved); } catch { /* ignore */ }
    return { manager: "", technician: "" };
  });
  useEffect(() => { safeStorageSet("pl-alert-emails", JSON.stringify(alertEmails)); }, [alertEmails]);
  const [thresholds, setThresholds] = useState<AlertThresholds>({ hiCrit: 0.3, hiSurv: 0.6 });

  // Fetch global thresholds from backend on mount
  useEffect(() => {
    const base = API_BASE;
    if (!base) return; // no API configured
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    fetch(`${base}/seuils/public`, { signal: controller.signal })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && typeof data.hi_critical === 'number') {
          setThresholds({ hiCrit: data.hi_critical, hiSurv: data.hi_surveillance });
        }
      })
      .catch(() => { /* keep defaults */ })
      .finally(() => clearTimeout(timeoutId));
    return () => { controller.abort(); clearTimeout(timeoutId); };
  }, []);

  useEffect(() => { safeStorageSet("pl-lang", lang); }, [lang]);
  useEffect(() => {
    document.documentElement.dir = "ltr";
    document.documentElement.lang = lang;
  }, [lang]);
  useEffect(() => {
    safeStorageSet("pl-theme", theme);
    document.documentElement.classList.toggle("light", theme === "light");
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const t = (key: string): string => {
    if (key === "meta.diagnostics.title") {
      return repairText(
        {
          fr: "Diagnostic détaillé",
          en: "Detailed diagnostics",
        }[lang] || "Diagnostic détaillé"
      );
    }

    if (key === "meta.diagnostics.sub") {
      return repairText(
        {
          fr: "Lecture claire pour la machine sélectionnée : marge restante, alertes et points de contrôle.",
          en: "Clear reading for the selected machine: remaining margin, alerts, and checkpoints.",
        }[lang] ||
        "Lecture claire pour la machine sélectionnée : marge restante, alertes et points de contrôle."
      );
    }

    const entry = TR[key];
    if (!entry) return key;
    return repairText(entry[lang] || entry.fr || key);
  };

  return (
    <AppContext.Provider value={{
      lang, setLang, theme, setTheme, t,
      alertEmails, setAlertEmails,
      thresholds,
    }}>
      {children}
    </AppContext.Provider>
  );
}

